import type { Request, Response } from 'express';
import { z } from 'zod';
import { currentUser } from '../middleware/auth';
import { valid } from '../middleware/validate';
import { emailRepository, EmailWithSender } from '../repositories/email.repository';
import { searchService } from '../services/search.service';
import type { EmailDto, EmailStatus } from '../types';

export const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const searchSchema = listSchema.extend({
  q: z.string().trim().max(200).default(''),
  status: z.enum(['scheduled', 'sending', 'sent', 'failed']).optional(),
});

export const toEmailDto = (e: EmailWithSender): EmailDto => ({
  id: e.id,
  campaignId: e.campaign_id,
  to: e.to_email,
  subject: e.subject,
  status: e.status,
  scheduledAt: new Date(e.scheduled_at).toISOString(),
  sentAt: e.sent_at ? new Date(e.sent_at).toISOString() : null,
  senderEmail: e.sender_email,
  previewUrl: e.preview_url,
  error: e.error,
});

const list =
  (statuses: EmailStatus[], orderBy: 'scheduled_at' | 'sent_at', direction: 'asc' | 'desc') =>
  async (req: Request, res: Response) => {
    const { page, pageSize } = valid<z.infer<typeof listSchema>>(req, 'query');
    const { rows, total } = await emailRepository.list({ userId: currentUser(req).id, statuses, page, pageSize, orderBy, direction });
    res.json({ items: rows.map(toEmailDto), total, page, pageSize });
  };

export const emailController = {
  scheduled: list(['scheduled', 'sending'], 'scheduled_at', 'asc'),
  sent: list(['sent', 'failed'], 'sent_at', 'desc'),

  async search(req: Request, res: Response) {
    const { q, status, page, pageSize } = valid<z.infer<typeof searchSchema>>(req, 'query');
    const result = await searchService.search(currentUser(req).id, q, status, page, pageSize);
    res.json({ ...result, page, pageSize });
  },
};
