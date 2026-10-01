import type { User } from './index';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
export {};
