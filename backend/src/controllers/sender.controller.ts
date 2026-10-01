import type { Request, Response } from 'express';
import { z } from 'zod';
import { currentUser } from '../middleware/auth';
import { valid } from '../middleware/validate';
import { senderService } from '../services/sender.service';

export const createSenderSchema = z.object({ fromName: z.string().trim().min(1).max(100).optional() });
export const idParamSchema = z.object({ id: z.string().uuid() });

export const senderController = {
  async list(req: Request, res: Response) {
    res.json({ items: await senderService.list(currentUser(req).id) });
  },
  async create(req: Request, res: Response) {
    const user = currentUser(req);
    const { fromName } = valid<z.infer<typeof createSenderSchema>>(req);
    res.status(201).json(await senderService.createEthereal(user.id, fromName ?? user.name));
  },
  async remove(req: Request, res: Response) {
    const { id } = valid<z.infer<typeof idParamSchema>>(req, 'params');
    await senderService.remove(currentUser(req).id, id);
    res.status(204).end();
  },
};
