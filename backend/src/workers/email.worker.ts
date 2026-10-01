import { DelayedError, Job, Worker } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { closeTransports, getPreviewUrl, getTransport } from '../integrations/ethereal';
import { EMAIL_QUEUE } from '../queues/email.queue';
import { createRedis, redis } from '../redis/connection';
import { emailRepository } from '../repositories/email.repository';
import { senderRepository } from '../repositories/sender.repository';
import { RateLimiter } from '../services/rate-limiter.service';
import { searchService } from '../services/search.service';
import { slackService } from '../services/slack.service';
import type { EmailJobData, EmailRecord } from '../types';

export const limiter = new RateLimiter(redis);

type Outcome = 'sent' | 'skipped' | 'deferred';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHtml = (body: string) => (/<[a-z][\s\S]*>/i.test(body) ? body : escapeHtml(body).replace(/\r?\n/g, '<br>'));

/** Moves the job back into the delayed set (does not consume a retry attempt) and updates the DB. */
async function defer(job: Job<EmailJobData>, token: string | undefined, runAt: number, reason: string): Promise<never> {
  // tiny deterministic offset keeps original order within the same instant
  const ts = runAt + (job.data.seq % 1000);
  await emailRepository.reschedule(job.data.emailId, new Date(ts), { bumpCount: true });
  await job.moveToDelayed(ts, token);
  logger.info({ emailId: job.data.emailId, runAt: new Date(ts).toISOString(), reason }, 'Email deferred');
  throw new DelayedError();
}

export async function processEmailJob(job: Job<EmailJobData>, token?: string): Promise<Outcome> {
  const { emailId, senderId, userId } = job.data;
  const log = logger.child({ emailId, jobId: job.id });

  const email: EmailRecord | undefined = await emailRepository.findById(emailId);
  if (!email) {
    log.warn('Email row missing, dropping job');
    return 'skipped';
  }
  if (email.status === 'sent' || email.status === 'failed') {
    log.info({ status: email.status }, 'Already processed, skipping (idempotent)');
    return 'skipped';
  }

  const sender = await senderRepository.findById(senderId);
  if (!sender) {
    await emailRepository.markFailed(emailId, 'Sender no longer exists');
    return 'skipped';
  }

  // Gate 1: minimum delay between sends of the same sender.
  const slot = await limiter.acquireSendSlot(senderId, env.MIN_DELAY_BETWEEN_EMAILS_MS);
  if (!slot.acquired) await defer(job, token, Date.now() + slot.waitMs, 'min-delay');

  // Gate 2: distributed hourly cap per sender (atomic in Redis).
  const limit = Math.min(job.data.hourlyLimit, env.MAX_EMAILS_PER_HOUR_PER_SENDER);
  const admit = await limiter.admitHourly(senderId, limit);
  if (!admit.allowed) {
    await limiter.releaseSendSlot(senderId);
    if (await limiter.markLimitNotified(senderId)) {
      await slackService.notifyRateLimit(userId, sender.email, limit, new Date(admit.nextWindowStart));
    }
    await defer(job, token, admit.nextWindowStart, 'hourly-limit');
  }

  // Gate 3: atomic DB claim — guarantees a single sender of this email even with duplicate jobs.
  if (!(await emailRepository.claim(emailId))) {
    await limiter.refundHourly(senderId);
    log.warn('Claim failed: another worker owns this email, skipping');
    return 'skipped';
  }

  try {
    const info = await getTransport(sender).sendMail({
      from: `"${sender.from_name.replace(/"/g, '')}" <${sender.email}>`,
      to: email.to_email,
      subject: email.subject,
      text: email.body,
      html: toHtml(email.body),
      headers: { 'X-Email-Id': emailId },
    });
    await emailRepository.markSent(emailId, info.messageId ?? null, getPreviewUrl(info));
    void searchService.syncEmail(emailId);
    log.info({ to: email.to_email, preview: getPreviewUrl(info) }, 'Email sent');
    return 'sent';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await limiter.refundHourly(senderId);
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (isLastAttempt) {
      await emailRepository.markFailed(emailId, message);
      void searchService.syncEmail(emailId);
      log.error({ err }, 'Email permanently failed');
      return 'skipped';
    }
    // back to `scheduled` so the BullMQ retry can re-claim it
    await emailRepository.reschedule(emailId, new Date(Date.now() + 5_000), { error: message });
    log.warn({ err, attempt: job.attemptsMade + 1 }, 'Send failed, will retry');
    throw err;
  }
}

export function createEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(EMAIL_QUEUE, (job, token) => processEmailJob(job, token), {
    connection: createRedis('worker'),
    concurrency: env.WORKER_CONCURRENCY,
    lockDuration: 60_000,
  });

  worker.on('failed', (job, err) => {
    // Safety net for failures outside the processor (e.g. stalled too many times).
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      void emailRepository.markFailed(job.data.emailId, err.message).then(() => searchService.syncEmail(job.data.emailId));
    }
  });
  worker.on('error', (err) => logger.error({ err }, 'Worker error'));
  return worker;
}

export { closeTransports };
