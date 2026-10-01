import { env } from '../config/env';
import { AppError } from '../utils/errors';

const AUTH_URL = 'https://slack.com/oauth/v2/authorize';
const TOKEN_URL = 'https://slack.com/api/oauth.v2.access';

export const slackRedirectUri = () => `${env.APP_URL}/api/slack/callback`;

export interface SlackInstall {
  teamName: string | null;
  channel: string | null;
  webhookUrl: string;
}

export function assertSlackConfigured(): void {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    throw new AppError(503, 'Slack OAuth is not configured on the server', 'SLACK_NOT_CONFIGURED');
  }
}

export function buildSlackAuthUrl(state: string): string {
  assertSlackConfigured();
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: 'incoming-webhook',
    redirect_uri: slackRedirectUri(),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface SlackAccessResponse {
  ok: boolean;
  error?: string;
  team?: { name?: string };
  incoming_webhook?: { url: string; channel?: string };
}

export async function exchangeSlackCode(code: string): Promise<SlackInstall> {
  assertSlackConfigured();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      redirect_uri: slackRedirectUri(),
    }),
  });
  const data = (await res.json()) as SlackAccessResponse;
  if (!data.ok || !data.incoming_webhook?.url) {
    throw AppError.badRequest(`Slack authorization failed: ${data.error ?? 'no incoming webhook returned'}`);
  }
  return {
    teamName: data.team?.name ?? null,
    channel: data.incoming_webhook.channel ?? null,
    webhookUrl: data.incoming_webhook.url,
  };
}

/** Posts a message through the workspace's incoming webhook. Throws on non-2xx. */
export async function postToWebhook(webhookUrl: string, text: string): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Slack webhook responded ${res.status}: ${await res.text()}`);
  }
}
