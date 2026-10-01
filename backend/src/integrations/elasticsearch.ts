import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env';
import { logger } from '../config/logger';

export const es = new Client({ node: env.ELASTICSEARCH_URL, requestTimeout: 5_000, maxRetries: 1 });
export const ES_INDEX = env.ELASTICSEARCH_INDEX;

export interface EmailDocument {
  id: string;
  userId: string;
  campaignId: string;
  to: string;
  from: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
}

export async function ensureIndex(): Promise<void> {
  if (!env.ELASTICSEARCH_ENABLED) return;
  const exists = await es.indices.exists({ index: ES_INDEX });
  if (exists) return;
  await es.indices.create({
    index: ES_INDEX,
    mappings: {
      properties: {
        id: { type: 'keyword' },
        userId: { type: 'keyword' },
        campaignId: { type: 'keyword' },
        to: { type: 'text', fields: { keyword: { type: 'keyword' } } },
        from: { type: 'text', fields: { keyword: { type: 'keyword' } } },
        subject: { type: 'text' },
        body: { type: 'text' },
        status: { type: 'keyword' },
        scheduledAt: { type: 'date' },
        sentAt: { type: 'date' },
      },
    },
  });
  logger.info({ index: ES_INDEX }, 'Elasticsearch index created');
}
