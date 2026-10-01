import type { CookieOptions, Request, Response } from 'express';
import { env } from '../config/env';
import { buildGoogleAuthUrl, exchangeGoogleCode } from '../integrations/google';
import { currentUser } from '../middleware/auth';
import { authService, OAUTH_STATE_COOKIE, SESSION_COOKIE, verifyToken } from '../services/auth.service';
import { AppError } from '../utils/errors';

const cookieBase = (): CookieOptions => ({ httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE, path: '/' });

export const authController = {
  startGoogle(_req: Request, res: Response) {
    const state = authService.createGoogleState();
    res.cookie(OAUTH_STATE_COOKIE, state, { ...cookieBase(), maxAge: 10 * 60 * 1000 });
    res.redirect(buildGoogleAuthUrl(state));
  },

  async googleCallback(req: Request, res: Response) {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) return res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(error)}`);
    const cookieState = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;
    if (!code || !state || !cookieState || state !== cookieState) throw AppError.badRequest('Invalid OAuth state');
    verifyToken('google-state', state);
    res.clearCookie(OAUTH_STATE_COOKIE, cookieBase());

    const user = await authService.loginWithGoogle(await exchangeGoogleCode(code));
    res.cookie(SESSION_COOKIE, authService.createSession(user.id), { ...cookieBase(), maxAge: authService.sessionTtlMs });
    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  },

  me(req: Request, res: Response) {
    const u = currentUser(req);
    res.json({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatar_url });
  },

  logout(_req: Request, res: Response) {
    res.clearCookie(SESSION_COOKIE, cookieBase());
    res.status(204).end();
  },
};
