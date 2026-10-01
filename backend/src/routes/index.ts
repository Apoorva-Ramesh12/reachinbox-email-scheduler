import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from '../controllers/auth.controller';
import { campaignController, scheduleSchema } from '../controllers/campaign.controller';
import { emailController, listSchema, searchSchema } from '../controllers/email.controller';
import { createSenderSchema, idParamSchema, senderController } from '../controllers/sender.controller';
import { slackController } from '../controllers/slack.controller';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';

export const apiRouter = Router();

const writeLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });

// --- auth ---
apiRouter.get('/auth/google', authController.startGoogle);
apiRouter.get('/auth/google/callback', authController.googleCallback);
apiRouter.get('/auth/me', requireAuth, authController.me);
apiRouter.post('/auth/logout', authController.logout);

// --- everything below requires a session ---
apiRouter.use(requireAuth);

// --- campaigns / scheduling ---
apiRouter.post('/campaigns', writeLimiter, validate(scheduleSchema), campaignController.create);
apiRouter.get('/campaigns', campaignController.list);

// --- emails ---
apiRouter.get('/emails/scheduled', validate(listSchema, 'query'), emailController.scheduled);
apiRouter.get('/emails/sent', validate(listSchema, 'query'), emailController.sent);
apiRouter.get('/emails/search', validate(searchSchema, 'query'), emailController.search);

// --- senders ---
apiRouter.get('/senders', senderController.list);
apiRouter.post('/senders', writeLimiter, validate(createSenderSchema), senderController.create);
apiRouter.delete('/senders/:id', validate(idParamSchema, 'params'), senderController.remove);

// --- slack ---
apiRouter.get('/slack/connect', slackController.start);
apiRouter.get('/slack/callback', slackController.callback);
apiRouter.get('/slack/status', slackController.status);
apiRouter.post('/slack/test', writeLimiter, slackController.test);
apiRouter.delete('/slack', slackController.disconnect);
