import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { logger } from './config/logger';
import { db } from './db/knex';
import { openApiSpec } from './docs/openapi';
import { basicAuth } from './middleware/basic-auth';
import { errorHandler, notFound } from './middleware/error-handler';
import { emailQueue } from './queues/email.queue';
import { redis } from './redis/connection';
import { apiRouter } from './routes';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1);

  // Bull Board + Swagger are mounted before helmet (they ship inline scripts that a strict CSP would block).
  const boardAdapter = new ExpressAdapter();
  boardAdapter.setBasePath('/admin/queues');
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: boardAdapter });
  app.use('/admin/queues', basicAuth, boardAdapter.getRouter());
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec as unknown as Record<string, unknown>));
  app.get('/docs.json', (_req, res) => res.json(openApiSpec));

  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  app.get('/health', async (_req, res) => {
    const checks = { db: false, redis: false };
    try {
      await db.raw('select 1');
      checks.db = true;
    } catch (err) {
      logger.error({ err }, 'Health: db down');
    }
    try {
      checks.redis = (await redis.ping()) === 'PONG';
    } catch (err) {
      logger.error({ err }, 'Health: redis down');
    }
    const ok = checks.db && checks.redis;
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
  });

  app.use('/api', apiRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
