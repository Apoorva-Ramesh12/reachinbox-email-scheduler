import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/knex';
import { migrateLatest } from '../src/db/migrate';
import { emailQueue } from '../src/queues/email.queue';
import { redis } from '../src/redis/connection';
import { slackRepository } from '../src/repositories/slack.repository';
import { schedulerService } from '../src/services/scheduler.service';
import { encrypt } from '../src/utils/crypto';
import { nextHourWindowStart } from '../src/utils/time';
import { createSender, createUser, deleteUser, infraAvailable, startWebhookSink, waitFor } from './helpers';

// Stub only the SMTP hop; everything else (DB, Redis, BullMQ, limiter) is real.
const sent: { to: string; subject: string }[] = [];
vi.mock('../src/integrations/ethereal', async (orig) => {
  const actual = await orig<typeof import('../src/integrations/ethereal')>();
  return {
    ...actual,
    getTransport: () => ({
      sendMail: async (m: { to: string; subject: string }) => {
        sent.push({ to: m.to, subject: m.subject });
        return { messageId: `<${Math.random()}@test>` };
      },
    }),
    getPreviewUrl: () => 'https://ethereal.email/message/test',
  };
});

const up = await infraAvailable();

describe.skipIf(!up)('scheduler + worker (real Redis/MySQL, stubbed SMTP)', () => {
  let worker: import('bullmq').Worker;
  const users: string[] = [];

  beforeAll(async () => {
    await migrateLatest();
    await emailQueue.obliterate({ force: true });
    const { createEmailWorker } = await import('../src/workers/email.worker');
    worker = createEmailWorker();
  });

  afterAll(async () => {
    await worker?.close();
    await emailQueue.obliterate({ force: true });
    for (const u of users) await deleteUser(u);
    await emailQueue.close();
    await db.destroy();
    redis.disconnect();
  });

  const statusCounts = async (campaignId: string) => {
    const rows = await db('emails').where({ campaign_id: campaignId }).select('status').count({ n: '*' }).groupBy('status');
    return Object.fromEntries(rows.map((r) => [(r as unknown as { status: string }).status, Number(r.n)])) as Record<string, number>;
  };

  it('sends every scheduled email exactly once', async () => {
    const user = await createUser();
    users.push(user.id);
    const sender = await createSender(user.id);
    const leads = Array.from({ length: 6 }, (_, i) => `lead${i}-${user.id.slice(0, 4)}@example.com`);
    const before = sent.length;

    const res = await schedulerService.schedule(user, {
      subject: 'Hello',
      body: 'World',
      emails: leads,
      startTime: new Date(),
      delaySeconds: 0,
      hourlyLimit: 100,
      senderIds: [sender.id],
    });

    await waitFor(async () => (await statusCounts(res.campaignId)).sent === 6);
    expect(sent.length - before).toBe(6);
    expect(new Set(sent.slice(before).map((s) => s.to)).size).toBe(6);
  });

  it('does not send in the future: delayed jobs wait for their time', async () => {
    const user = await createUser();
    users.push(user.id);
    const sender = await createSender(user.id);
    const res = await schedulerService.schedule(user, {
      subject: 'Later', body: 'x', emails: [`later-${user.id.slice(0, 4)}@example.com`],
      startTime: new Date(Date.now() + 3_000), delaySeconds: 0, hourlyLimit: 10, senderIds: [sender.id],
    });
    await new Promise((r) => setTimeout(r, 1000));
    expect((await statusCounts(res.campaignId)).scheduled).toBe(1);
    await waitFor(async () => (await statusCounts(res.campaignId)).sent === 1, 10_000);
  });

  it('is idempotent: a duplicate job for the same email never double-sends', async () => {
    const user = await createUser();
    users.push(user.id);
    const sender = await createSender(user.id);
    const to = `dupe-${user.id.slice(0, 4)}@example.com`;
    const res = await schedulerService.schedule(user, {
      subject: 'Once', body: 'x', emails: [to], startTime: new Date(Date.now() + 1500), delaySeconds: 0, hourlyLimit: 10, senderIds: [sender.id],
    });
    const [row] = await db('emails').where({ campaign_id: res.campaignId });
    // Attempt to enqueue a second job for the same email (different jobId so BullMQ itself would not dedupe)
    await emailQueue.add('send-email', { emailId: row.id, userId: user.id, senderId: sender.id, hourlyLimit: 10, seq: 0 }, { delay: 1500 });
    await waitFor(async () => (await statusCounts(res.campaignId)).sent === 1);
    await new Promise((r) => setTimeout(r, 1500));
    expect(sent.filter((s) => s.to === to)).toHaveLength(1);
  });

  it('survives a "restart": a lost queue is rebuilt from MySQL and emails still send once', async () => {
    const user = await createUser();
    users.push(user.id);
    const sender = await createSender(user.id);
    const res = await schedulerService.schedule(user, {
      subject: 'Persist', body: 'x', emails: [`p1-${user.id.slice(0, 4)}@example.com`, `p2-${user.id.slice(0, 4)}@example.com`],
      startTime: new Date(Date.now() + 2500), delaySeconds: 0, hourlyLimit: 10, senderIds: [sender.id],
    });
    // simulate total Redis data loss of this campaign's jobs
    const rows = await db('emails').where({ campaign_id: res.campaignId });
    for (const r of rows) await (await emailQueue.getJob(r.id))?.remove();
    expect(await emailQueue.getJob(rows[0].id)).toBeUndefined();

    const added = await schedulerService.reconcileOrphans();
    expect(added).toBeGreaterThanOrEqual(2);
    await waitFor(async () => (await statusCounts(res.campaignId)).sent === 2, 12_000);
    expect(await schedulerService.reconcileOrphans()).toBe(0);
  });

  it('defers (never drops) emails over the hourly limit and notifies Slack once', async () => {
    const user = await createUser();
    users.push(user.id);
    const sender = await createSender(user.id);
    const sink = await startWebhookSink();
    await slackRepository.upsert({ userId: user.id, teamName: 'T', channel: '#c', webhookUrlEnc: encrypt(sink.url) });

    const res = await schedulerService.schedule(user, {
      subject: 'Limited', body: 'x', emails: Array.from({ length: 5 }, (_, i) => `rl${i}-${user.id.slice(0, 4)}@example.com`),
      startTime: new Date(), delaySeconds: 0, hourlyLimit: 2, senderIds: [sender.id],
    });

    await waitFor(async () => {
      const c = await statusCounts(res.campaignId);
      return c.sent === 2 && c.scheduled === 3;
    });
    const deferred = await db('emails').where({ campaign_id: res.campaignId, status: 'scheduled' });
    const nextWindow = nextHourWindowStart(Date.now());
    for (const d of deferred) {
      expect(new Date(d.scheduled_at).getTime()).toBeGreaterThanOrEqual(nextWindow);
      expect(d.reschedule_count).toBeGreaterThanOrEqual(1);
    }
    // each deferred job lives in BullMQ's delayed set for the next window — not failed, not lost
    const delayed = await emailQueue.getDelayed();
    expect(delayed.filter((j) => deferred.some((d) => d.id === j.id))).toHaveLength(3);

    await waitFor(async () => sink.received.length >= 1);
    await new Promise((r) => setTimeout(r, 500));
    expect(sink.received).toHaveLength(1); // one notification per sender-window, not one per job
    expect(sink.received[0]).toContain('Hourly limit reached');
    sink.server.close();
  });

  it('does not crash or notify when Slack is not connected', async () => {
    const user = await createUser();
    users.push(user.id);
    const sender = await createSender(user.id);
    const res = await schedulerService.schedule(user, {
      subject: 'NoSlack', body: 'x', emails: [`ns1-${user.id.slice(0, 4)}@example.com`, `ns2-${user.id.slice(0, 4)}@example.com`],
      startTime: new Date(), delaySeconds: 0, hourlyLimit: 1, senderIds: [sender.id],
    });
    await waitFor(async () => {
      const c = await statusCounts(res.campaignId);
      return c.sent === 1 && c.scheduled === 1;
    });
  });
});
