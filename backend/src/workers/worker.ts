import { env } from '../config/env';
import { logger } from '../config/logger';
import { db } from '../db/knex';
import { migrateLatest } from '../db/migrate';
import { emailQueue } from '../queues/email.queue';
import { redis } from '../redis/connection';
import { schedulerService } from '../services/scheduler.service';
import { closeTransports, createEmailWorker } from './email.worker';

async function main() {
  await migrateLatest();
  const worker = createEmailWorker();
  logger.info(
    { concurrency: env.WORKER_CONCURRENCY, minDelayMs: env.MIN_DELAY_BETWEEN_EMAILS_MS, maxPerHourPerSender: env.MAX_EMAILS_PER_HOUR_PER_SENDER },
    'Email worker started',
  );
  await schedulerService.reconcileOrphans();

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'Worker shutting down gracefully');
    try {
      await worker.close(); // waits for in-flight jobs; unfinished jobs return to the queue
      await emailQueue.close();
      closeTransports();
      await db.destroy();
      redis.disconnect();
    } catch (err) {
      logger.error({ err }, 'Error during worker shutdown');
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});
