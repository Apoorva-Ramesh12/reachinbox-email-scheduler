import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { db } from '../db/knex';
import type { Campaign } from '../types';

export interface NewCampaign {
  userId: string;
  subject: string;
  body: string;
  startTime: Date;
  delaySeconds: number;
  hourlyLimit: number;
  total: number;
}

export const campaignRepository = {
  async create(input: NewCampaign, trx: Knex.Transaction): Promise<Campaign> {
    const id = randomUUID();
    await trx('campaigns').insert({
      id,
      user_id: input.userId,
      subject: input.subject,
      body: input.body,
      start_time: input.startTime,
      delay_seconds: input.delaySeconds,
      hourly_limit: input.hourlyLimit,
      total: input.total,
    });
    return (await trx<Campaign>('campaigns').where({ id }).first()) as Campaign;
  },

  listByUser: (userId: string): Promise<Campaign[]> =>
    db<Campaign>('campaigns').where({ user_id: userId }).orderBy('created_at', 'desc').limit(50),
};
