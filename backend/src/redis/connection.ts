import IORedis, { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../config/logger';

/** BullMQ requires maxRetriesPerRequest = null for blocking/worker connections. */
export function createRedis(name: string): Redis {
  const client = new IORedis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  client.on('error', (err) => logger.error({ err, name }, 'Redis error'));
  return client;
}

/** Shared general-purpose client (counters, locks, queue producer). */
export const redis: Redis = createRedis('shared');
