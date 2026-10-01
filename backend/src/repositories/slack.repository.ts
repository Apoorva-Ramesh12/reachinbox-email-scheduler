import { randomUUID } from 'node:crypto';
import { db } from '../db/knex';
import type { SlackConnection } from '../types';

export const slackRepository = {
  findByUser: (userId: string): Promise<SlackConnection | undefined> =>
    db<SlackConnection>('slack_connections').where({ user_id: userId }).first(),

  async upsert(input: { userId: string; teamName: string | null; channel: string | null; webhookUrlEnc: string }): Promise<void> {
    await db('slack_connections')
      .insert({
        id: randomUUID(),
        user_id: input.userId,
        team_name: input.teamName,
        channel: input.channel,
        webhook_url_enc: input.webhookUrlEnc,
      })
      .onConflict('user_id')
      .merge(['team_name', 'channel', 'webhook_url_enc']);
  },

  remove: (userId: string): Promise<number> => db('slack_connections').where({ user_id: userId }).del(),
};
