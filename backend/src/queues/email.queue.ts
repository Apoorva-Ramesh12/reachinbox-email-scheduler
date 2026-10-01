import { Queue } from 'bullmq';
import { createRedis } from '../redis/connection';
import { env } from '../config/env';
import type { EmailJobData } from '../types';

export const EMAIL_QUEUE = 'email-send';

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE, {
  connection: createRedis('queue'),
  defaultJobOptions: {
    attempts: env.JOB_ATTEMPTS,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 24 * 3600, count: 5000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});
