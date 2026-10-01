import type { NextFunction, Request, Response } from 'express';
import { authService, SESSION_COOKIE } from '../services/auth.service';
import { AppError } from '../utils/errors';

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) throw AppError.unauthorized();
  req.user = await authService.userFromSession(token);
  next();
}

/** Typed accessor so controllers never need a non-null assertion. */
export function currentUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
