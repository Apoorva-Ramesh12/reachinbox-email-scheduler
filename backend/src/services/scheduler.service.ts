import { randomUUID } from 'node:crypto';
import { db } from '../db/knex';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { emailQueue } from '../queues/email.queue';
import { campaignRepository } from '../repositories/campaign.repository';
import { emailRepository, NewEmail } from '../repositories/email.repository';
import { senderRepository } from '../repositories/sender.repository';
import type { EmailJobData, Sender, User } from '../types';
import { AppError } from '../utils/errors';
import { searchService } from './search.service';
import { senderService } from './sender.service';

export interface ScheduleInput {
  subject: string;
  body: string;
  emails: string[];
  startTime: Date;
  delaySeconds: number;
  hourlyLimit: number;
  senderIds?: string[];
}

export interface ScheduledEmailPlan {
  id: string;
  senderId: string;
  to: string;
  scheduledAt: Date;
  seq: number;
}

/**
 * Pure planning step (unit-tested): spreads leads over senders round-robin and assigns
 * each a send time `start + i * delay`. Past start times are clamped to "now".
 */
export function planSchedule(
  emails: string[],
  senderIds: string[],
  startTime: Date,
  delaySeconds: number,
  now = Date.now(),
  idFactory: () => string = randomUUID,
): ScheduledEmailPlan[] {
  const start = Math.max(startTime.getTime(), now);
  return emails.map((to, i) => ({
    id: idFactory(),
    senderId: senderIds[i % senderIds.length] as string,
    to,
    scheduledAt: new Date(start + i * delaySeconds * 1000),
    seq: i,
  }));
}

export const jobOptsFor = (scheduledAt: Date, now = Date.now()) => ({ delay: Math.max(0, scheduledAt.getTime() - now) });

export const schedulerService = {
  async schedule(user: User, input: ScheduleInput) {
    let senders: Sender[];
    if (input.senderIds?.length) {
      senders = await senderRepository.findManyByIds(user.id, input.senderIds);
      if (senders.length !== new Set(input.senderIds).size) throw AppError.badRequest('One or more senderIds are invalid');
    } else {
      senders = await senderService.ensureAtLeastOne(user.id, user.name);
    }

    const plan = planSchedule(
      input.emails,
      senders.map((s) => s.id),
      input.startTime,
      input.delaySeconds,
    );
    const effectiveLimit = Math.min(input.hourlyLimit, env.MAX_EMAILS_PER_HOUR_PER_SENDER);

    // 1) Persist first — the DB is the source of truth and survives anything.
    const campaign = await db.transaction(async (trx) => {
      const c = await campaignRepository.create(
        {
          userId: user.id,
          subject: input.subject,
          body: input.body,
          startTime: input.startTime,
          delaySeconds: input.delaySeconds,
          hourlyLimit: effectiveLimit,
          total: plan.length,
        },
        trx,
      );
      const rows: NewEmail[] = plan.map((p) => ({
        id: p.id,
        campaign_id: c.id,
        user_id: user.id,
        sender_id: p.senderId,
        to_email: p.to,
        subject: input.subject,
        body: input.body,
        scheduled_at: p.scheduledAt,
        seq: p.seq,
      }));
      await emailRepository.insertMany(rows, trx);
      return c;
    });

    // 2) Enqueue delayed jobs. jobId === email id, so re-adding is a no-op (idempotent).
    await enqueuePlan(plan.map((p) => ({ emailId: p.id, scheduledAt: p.scheduledAt, senderId: p.senderId, userId: user.id, seq: p.seq })), effectiveLimit);

    // 3) Index for search (best-effort, off the request path).
    void emailRepository.findManyByIds(plan.map((p) => p.id)).then((rows) => searchService.indexEmails(rows));

    logger.info({ campaignId: campaign.id, total: plan.length, senders: senders.length }, 'Campaign scheduled');
    return { campaignId: campaign.id, total: plan.length, firstSendAt: plan[0]?.scheduledAt ?? null, lastSendAt: plan.at(-1)?.scheduledAt ?? null, senders: senders.length, effectiveHourlyLimit: effectiveLimit };
  },

  /**
   * Crash-recovery: re-adds a job for every email still `scheduled` in MySQL.
   * Safe to run at any time (jobId dedupes). Covers "DB committed but Redis enqueue failed"
   * and a Redis instance that lost its data.
   */
  async reconcileOrphans(): Promise<number> {
    let added = 0;
    let lastId = '';
    for (;;) {
      const rows = await db('emails')
        .select('id', 'user_id', 'sender_id', 'scheduled_at', 'seq', 'campaign_id')
        .whereIn('status', ['scheduled', 'sending'])
        .andWhere('id', '>', lastId)
        .orderBy('id')
        .limit(1000);
      if (rows.length === 0) break;
      lastId = rows[rows.length - 1].id as string;
      const campaignIds = [...new Set(rows.map((r) => r.campaign_id as string))];
      const camps = await db('campaigns').whereIn('id', campaignIds).select('id', 'hourly_limit');
      const limitBy = new Map(camps.map((c) => [c.id as string, c.hourly_limit as number]));
      for (const r of rows) {
        const existing = await emailQueue.getJob(r.id as string);
        if (existing) continue;
        await enqueuePlan([{ emailId: r.id, scheduledAt: new Date(r.scheduled_at), senderId: r.sender_id, userId: r.user_id, seq: r.seq }], limitBy.get(r.campaign_id as string) ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER);
        added++;
      }
    }
    if (added > 0) logger.warn({ added }, 'Reconciled orphaned emails into the queue');
    return added;
  },
};

interface PlanJob {
  emailId: string;
  scheduledAt: Date;
  senderId: string;
  userId: string;
  seq: number;
}

async function enqueuePlan(items: PlanJob[], hourlyLimit: number): Promise<void> {
  const now = Date.now();
  const BATCH = 1000;
  for (let i = 0; i < items.length; i += BATCH) {
    await emailQueue.addBulk(
      items.slice(i, i + BATCH).map((it) => ({
        name: 'send-email',
        data: { emailId: it.emailId, userId: it.userId, senderId: it.senderId, hourlyLimit, seq: it.seq } satisfies EmailJobData,
        opts: { jobId: it.emailId, ...jobOptsFor(it.scheduledAt, now) },
      })),
    );
  }
}
