import { randomUUID } from 'node:crypto';
import { db } from '../db/knex';
import type { Sender } from '../types';

export type NewSender = Omit<Sender, 'id' | 'created_at'>;

export const senderRepository = {
  listByUser: (userId: string): Promise<Sender[]> =>
    db<Sender>('senders').where({ user_id: userId }).orderBy('created_at', 'asc'),

  findById: (id: string): Promise<Sender | undefined> => db<Sender>('senders').where({ id }).first(),

  findManyByIds: (userId: string, ids: string[]): Promise<Sender[]> =>
    db<Sender>('senders').where({ user_id: userId }).whereIn('id', ids).orderBy('created_at', 'asc'),

  async create(input: NewSender): Promise<Sender> {
    const id = randomUUID();
    await db('senders').insert({ id, ...input });
    return (await db<Sender>('senders').where({ id }).first()) as Sender;
  },

  async remove(userId: string, id: string): Promise<number> {
    return db('senders').where({ id, user_id: userId }).del();
  },
};
