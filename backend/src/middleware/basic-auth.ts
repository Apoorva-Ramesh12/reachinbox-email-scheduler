import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../config/env';

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/** HTTP Basic guard for operational endpoints (Bull Board). */
export const basicAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization ?? '';
  if (header.startsWith('Basic ')) {
    const [user = '', ...rest] = Buffer.from(header.slice(6), 'base64').toString().split(':');
    if (safeEqual(user, env.BULL_BOARD_USER) && safeEqual(rest.join(':'), env.BULL_BOARD_PASSWORD)) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
  res.status(401).send('Authentication required');
};
