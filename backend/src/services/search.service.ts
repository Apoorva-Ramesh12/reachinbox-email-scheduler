import { env } from '../config/env';
import { logger } from '../config/logger';
import { ES_INDEX, EmailDocument, es } from '../integrations/elasticsearch';
import type { EmailWithSender } from '../repositories/email.repository';
import { emailRepository } from '../repositories/email.repository';

const toDoc = (e: EmailWithSender): EmailDocument => ({
  id: e.id,
  userId: e.user_id,
  campaignId: e.campaign_id,
  to: e.to_email,
  from: e.sender_email,
  subject: e.subject,
  body: e.body,
  status: e.status,
  scheduledAt: new Date(e.scheduled_at).toISOString(),
  sentAt: e.sent_at ? new Date(e.sent_at).toISOString() : null,
});

export const searchService = {
  /** Bulk-index rows. Never throws: search is a secondary store, the DB is the source of truth. */
  async indexEmails(rows: EmailWithSender[]): Promise<void> {
    if (!env.ELASTICSEARCH_ENABLED || rows.length === 0) return;
    try {
      const operations = rows.flatMap((r) => [{ index: { _index: ES_INDEX, _id: r.id } }, toDoc(r)]);
      const res = await es.bulk({ operations, refresh: false });
      if (res.errors) logger.warn('Some documents failed to index in Elasticsearch');
    } catch (err) {
      logger.warn({ err }, 'Elasticsearch indexing failed (non-fatal)');
    }
  },

  /** Re-index a single email from the DB after a status change. */
  async syncEmail(id: string): Promise<void> {
    if (!env.ELASTICSEARCH_ENABLED) return;
    try {
      const [row] = await emailRepository.findManyByIds([id]);
      if (row) await es.index({ index: ES_INDEX, id, document: toDoc(row) });
    } catch (err) {
      logger.warn({ err, id }, 'Elasticsearch sync failed (non-fatal)');
    }
  },

  async search(userId: string, q: string, status: string | undefined, page: number, pageSize: number) {
    if (!env.ELASTICSEARCH_ENABLED) return { total: 0, items: [] as EmailDocument[] };
    const must = q
      ? [{ multi_match: { query: q, fields: ['to^3', 'subject^2', 'body', 'from'], fuzziness: 'AUTO' as const } }]
      : [{ match_all: {} }];
    const filter: object[] = [{ term: { userId } }];
    if (status) filter.push({ term: { status } });
    const res = await es.search<EmailDocument>({
      index: ES_INDEX,
      from: (page - 1) * pageSize,
      size: pageSize,
      query: { bool: { must, filter } },
      sort: [{ scheduledAt: 'desc' as const }],
    });
    const total = typeof res.hits.total === 'number' ? res.hits.total : (res.hits.total?.value ?? 0);
    return { total, items: res.hits.hits.map((h) => h._source as EmailDocument) };
  },
};
