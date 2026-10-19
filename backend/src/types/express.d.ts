import { AuthenticatedUser, AuthSessionContext } from './auth.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionContext?: AuthSessionContext;
    }
  }
}
