import type { Server } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { db } from './db/knex';
import { migrateLatest } from './db/migrate';
import { es, ensureIndex } from './integrations/elasticsearch';
import { emailQueue } from './queues/email.queue';
import { redis } from './redis/connection';

async function main() {
  if (env.RUN_MIGRATIONS_ON_START) await migrateLatest();
  try {
    await ensureIndex();
  } catch (err) {
    logger.warn({ err }, 'Elasticsearch unavailable at boot; search will recover when it is reachable');
  }

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info(`API listening on ${env.APP_URL}  (docs: /docs, bull board: /admin/queues)`);
  });

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'Shutting down gracefully');
    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref();
    try {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await emailQueue.close();
      await db.destroy();
      redis.disconnect();
      await es.close();
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Server failed to start');
  process.exit(1);
});
