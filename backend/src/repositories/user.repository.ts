import { randomUUID } from 'node:crypto';
import { db } from '../db/knex';
import type { User } from '../types';

export interface UpsertUserInput {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export const userRepository = {
  findById: (id: string): Promise<User | undefined> => db<User>('users').where({ id }).first(),

  async upsertFromGoogle(input: UpsertUserInput): Promise<User> {
    const existing = await db<User>('users').where({ google_id: input.googleId }).first();
    if (existing) {
      await db('users')
        .where({ id: existing.id })
        .update({ email: input.email, name: input.name, avatar_url: input.avatarUrl, updated_at: db.fn.now(3) });
      return { ...existing, email: input.email, name: input.name, avatar_url: input.avatarUrl };
    }
    const id = randomUUID();
    await db('users').insert({
      id,
      google_id: input.googleId,
      email: input.email,
      name: input.name,
      avatar_url: input.avatarUrl,
    });
    return (await db<User>('users').where({ id }).first()) as User;
  },
};
