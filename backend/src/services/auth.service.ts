import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { GoogleProfile } from '../integrations/google';
import { userRepository } from '../repositories/user.repository';
import type { User } from '../types';
import { AppError } from '../utils/errors';

export const SESSION_COOKIE = 'session';
export const OAUTH_STATE_COOKIE = 'oauth_state';
const SESSION_TTL_S = 7 * 24 * 3600;

type Purpose = 'session' | 'google-state' | 'slack-state';

export function signToken(purpose: Purpose, claims: Record<string, string>, ttlSeconds: number): string {
  return jwt.sign({ ...claims, purpose }, env.JWT_SECRET, { expiresIn: ttlSeconds });
}

export function verifyToken(purpose: Purpose, token: string): Record<string, string> {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as Record<string, string>;
    if (payload.purpose !== purpose) throw new Error('wrong token purpose');
    return payload;
  } catch {
    throw AppError.unauthorized('Invalid or expired token');
  }
}

export const authService = {
  sessionTtlMs: SESSION_TTL_S * 1000,
  createSession: (userId: string) => signToken('session', { sub: userId }, SESSION_TTL_S),
  createGoogleState: () => signToken('google-state', { n: Math.random().toString(36).slice(2) }, 600),
  createSlackState: (userId: string) => signToken('slack-state', { sub: userId }, 600),

  async userFromSession(token: string): Promise<User> {
    const { sub } = verifyToken('session', token);
    const user = await userRepository.findById(sub as string);
    if (!user) throw AppError.unauthorized('User no longer exists');
    return user;
  },

  loginWithGoogle(profile: GoogleProfile): Promise<User> {
    if (profile.email_verified === false) throw AppError.unauthorized('Google email is not verified');
    return userRepository.upsertFromGoogle({
      googleId: profile.sub,
      email: profile.email,
      name: profile.name ?? profile.email.split('@')[0] ?? 'User',
      avatarUrl: profile.picture ?? null,
    });
  },
};
