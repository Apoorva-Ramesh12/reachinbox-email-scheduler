import { env } from '../config/env';
import { AppError } from '../utils/errors';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export const googleRedirectUri = () => `${env.APP_URL}/api/auth/google/callback`;

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export function assertGoogleConfigured(): void {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(503, 'Google OAuth is not configured on the server', 'GOOGLE_NOT_CONFIGURED');
  }
}

export function buildGoogleAuthUrl(state: string): string {
  assertGoogleConfigured();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  assertGoogleConfigured();
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw AppError.badRequest('Google token exchange failed');
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) throw AppError.badRequest('Google did not return an access token');

  const profileRes = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!profileRes.ok) throw AppError.badRequest('Failed to fetch Google profile');
  const profile = (await profileRes.json()) as GoogleProfile;
  if (!profile.sub || !profile.email) throw AppError.badRequest('Google profile is missing required fields');
  return profile;
}
