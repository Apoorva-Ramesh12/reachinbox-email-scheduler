import type { Request, Response } from 'express';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { buildSlackAuthUrl } from '../integrations/slack';
import { currentUser } from '../middleware/auth';
import { authService, verifyToken } from '../services/auth.service';
import { slackService } from '../services/slack.service';
import { AppError } from '../utils/errors';

export const slackController = {
  start(req: Request, res: Response) {
    const user = currentUser(req);
    res.redirect(buildSlackAuthUrl(authService.createSlackState(user.id)));
  },

  async callback(req: Request, res: Response) {
    const user = currentUser(req);
    const { code, state, error } = req.query as Record<string, string | undefined>;
    const back = (status: string) => res.redirect(`${env.FRONTEND_URL}/dashboard?slack=${status}`);
    if (error) return back('denied');
    if (!code || !state) throw AppError.badRequest('Missing code or state');
    const claims = verifyToken('slack-state', state);
    if (claims.sub !== user.id) throw AppError.unauthorized('OAuth state does not belong to this user');
    try {
      await slackService.connect(user.id, code);
      back('connected');
    } catch (err) {
      logger.error({ err }, 'Slack connect failed');
      back('error');
    }
  },

  async status(req: Request, res: Response) {
    res.json(await slackService.status(currentUser(req).id));
  },

  async disconnect(req: Request, res: Response) {
    await slackService.disconnect(currentUser(req).id);
    res.status(204).end();
  },

  async test(req: Request, res: Response) {
    const sent = await slackService.sendTest(currentUser(req).id);
    if (!sent) throw AppError.badRequest('Slack is not connected');
    res.json({ sent: true });
  },
};
