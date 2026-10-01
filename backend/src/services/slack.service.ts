import { randomUUID } from 'node:crypto';
import { logger } from '../config/logger';
import { exchangeSlackCode, postToWebhook } from '../integrations/slack';
import { slackRepository } from '../repositories/slack.repository';
import { decrypt, encrypt } from '../utils/crypto';

export const slackService = {
  async connect(userId: string, code: string): Promise<void> {
    const install = await exchangeSlackCode(code);
    await slackRepository.upsert({
      userId,
      teamName: install.teamName,
      channel: install.channel,
      webhookUrlEnc: encrypt(install.webhookUrl),
    });
    // Live confirmation message so the user instantly sees the integration works.
    try {
      await postToWebhook(install.webhookUrl, ':white_check_mark: Email Scheduler is connected. You will be notified here when a sender hits its hourly limit.');
    } catch (err) {
      logger.warn({ err }, 'Slack welcome message failed');
    }
  },

  async status(userId: string) {
    const c = await slackRepository.findByUser(userId);
    return c ? { connected: true as const, teamName: c.team_name, channel: c.channel } : { connected: false as const };
  },

  disconnect: (userId: string) => slackRepository.remove(userId),

  async sendTest(userId: string): Promise<boolean> {
    const c = await slackRepository.findByUser(userId);
    if (!c) return false;
    await postToWebhook(decrypt(c.webhook_url_enc), `:bell: Test notification from Email Scheduler (${randomUUID().slice(0, 8)})`);
    return true;
  },

  /**
   * Notify the owner that a sender hit its hourly cap.
   * No-op (returns false) if Slack is not connected — never throws, never breaks sending.
   */
  async notifyRateLimit(userId: string, senderEmail: string, limit: number, resumeAt: Date): Promise<boolean> {
    try {
      const c = await slackRepository.findByUser(userId);
      if (!c) return false;
      await postToWebhook(
        decrypt(c.webhook_url_enc),
        `:warning: *Hourly limit reached* for sender \`${senderEmail}\` (${limit}/hour). ` +
          `Remaining emails are rescheduled and will resume at ${resumeAt.toISOString()}.`,
      );
      return true;
    } catch (err) {
      logger.error({ err, userId }, 'Slack rate-limit notification failed');
      return false;
    }
  },
};
