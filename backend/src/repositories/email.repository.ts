import type { Knex } from 'knex';
import { db } from '../db/knex';
import { env } from '../config/env';
import type { EmailRecord, EmailStatus } from '../types';

export type NewEmail = Pick<
  EmailRecord,
  'id' | 'campaign_id' | 'user_id' | 'sender_id' | 'to_email' | 'subject' | 'body' | 'scheduled_at' | 'seq'
>;

export interface ListParams {
  userId: string;
  statuses: EmailStatus[];
  page: number;
  pageSize: number;
  orderBy: 'scheduled_at' | 'sent_at';
  direction: 'asc' | 'desc';
}

export interface EmailWithSender extends EmailRecord {
  sender_email: string;
}

export const emailRepository = {
  async insertMany(rows: NewEmail[], trx: Knex.Transaction): Promise<void> {
    // chunked to stay well under max_allowed_packet for very large lead lists
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await trx('emails').insert(rows.slice(i, i + CHUNK));
    }
  },

  findById: (id: string): Promise<EmailRecord | undefined> => db<EmailRecord>('emails').where({ id }).first(),

  findManyByIds: (ids: string[]): Promise<EmailWithSender[]> =>
    db('emails')
      .join('senders', 'senders.id', 'emails.sender_id')
      .whereIn('emails.id', ids)
      .select('emails.*', 'senders.email as sender_email') as unknown as Promise<EmailWithSender[]>,

  async list(p: ListParams): Promise<{ rows: EmailWithSender[]; total: number }> {
    const base = () => db('emails').where('emails.user_id', p.userId).whereIn('emails.status', p.statuses);
    const [{ count }] = (await base().count({ count: '*' })) as unknown as [{ count: number | string }];
    const rows = (await base()
      .join('senders', 'senders.id', 'emails.sender_id')
      .select('emails.*', 'senders.email as sender_email')
      .orderBy(`emails.${p.orderBy}`, p.direction)
      .limit(p.pageSize)
      .offset((p.page - 1) * p.pageSize)) as unknown as EmailWithSender[];
    return { rows, total: Number(count) };
  },

  /**
   * Atomic claim — the core of idempotency. Exactly one worker can flip an email
   * from `scheduled` to `sending`. A `sending` row is only re-claimable once its
   * lock is stale (worker crashed mid-flight).
   */
  async claim(id: string): Promise<boolean> {
    const staleBefore = new Date(Date.now() - env.STALE_SENDING_LOCK_MS);
    const affected = await db('emails')
      .where({ id })
      .andWhere((q) =>
        q.where('status', 'scheduled').orWhere((q2) => q2.where('status', 'sending').andWhere('updated_at', '<', staleBefore)),
      )
      .update({ status: 'sending', attempts: db.raw('attempts + 1'), updated_at: db.fn.now(3) });
    return affected === 1;
  },

  async markSent(id: string, messageId: string | null, previewUrl: string | null): Promise<void> {
    await db('emails')
      .where({ id })
      .update({ status: 'sent', sent_at: db.fn.now(3), message_id: messageId, preview_url: previewUrl, error: null, updated_at: db.fn.now(3) });
  },

  /** Back to scheduled (rate-limit deferral or retryable failure). Only touches non-terminal rows. */
  async reschedule(id: string, scheduledAt: Date, opts: { bumpCount?: boolean; error?: string } = {}): Promise<void> {
    const patch: Record<string, unknown> = {
      status: 'scheduled',
      scheduled_at: scheduledAt,
      updated_at: db.fn.now(3),
    };
    if (opts.bumpCount) patch.reschedule_count = db.raw('reschedule_count + 1');
    if (opts.error !== undefined) patch.error = opts.error;
    await db('emails').where({ id }).whereIn('status', ['scheduled', 'sending']).update(patch);
  },

  async markFailed(id: string, error: string): Promise<void> {
    await db('emails').where({ id }).whereNot('status', 'sent').update({ status: 'failed', error: error.slice(0, 2000), sent_at: db.fn.now(3), updated_at: db.fn.now(3) });
  },
};
