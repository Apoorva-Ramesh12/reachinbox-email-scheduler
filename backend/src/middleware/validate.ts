import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../utils/errors';

type Source = 'body' | 'query' | 'params';

export const validate =
  <T>(schema: ZodType<T>, source: Source = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      throw AppError.badRequest(
        'Validation failed',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    // Express 5 makes req.query a getter; stash parsed values on res.locals instead.
    (req as Request & { valid?: Record<string, unknown> }).valid = {
      ...((req as Request & { valid?: Record<string, unknown> }).valid ?? {}),
      [source]: parsed.data,
    };
    next();
  };

export const valid = <T>(req: Request, source: Source = 'body'): T =>
  (req as Request & { valid: Record<string, unknown> }).valid[source] as T;
