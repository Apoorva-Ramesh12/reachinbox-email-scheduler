import type { Request, Response } from 'express';
import { z } from 'zod';
import { currentUser } from '../middleware/auth';
import { valid } from '../middleware/validate';
import { campaignRepository } from '../repositories/campaign.repository';
import { schedulerService } from '../services/scheduler.service';

export const MAX_LEADS_PER_CAMPAIGN = 10_000;

export const scheduleSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(500),
  body: z.string().trim().min(1, 'Body is required').max(200_000),
  emails: z
    .array(z.string().trim().toLowerCase().pipe(z.email()))
    .min(1, 'At least one recipient is required')
    .max(MAX_LEADS_PER_CAMPAIGN),
  startTime: z.coerce.date(),
  delaySeconds: z.coerce.number().int().min(0).max(86_400),
  hourlyLimit: z.coerce.number().int().min(1).max(100_000),
  senderIds: z.array(z.string().uuid()).max(50).optional(),
});
export type ScheduleBody = z.infer<typeof scheduleSchema>;

export const campaignController = {
  async create(req: Request, res: Response) {
    const body = valid<ScheduleBody>(req);
    // de-duplicate recipients so one lead is never mailed twice within a campaign
    const emails = [...new Set(body.emails)];
    const result = await schedulerService.schedule(currentUser(req), { ...body, emails });
    res.status(201).json(result);
  },
  async list(req: Request, res: Response) {
    const rows = await campaignRepository.listByUser(currentUser(req).id);
    res.json({
      items: rows.map((c) => ({
        id: c.id,
        subject: c.subject,
        total: c.total,
        startTime: c.start_time,
        delaySeconds: c.delay_seconds,
        hourlyLimit: c.hourly_limit,
        createdAt: c.created_at,
      })),
    });
  },
};
