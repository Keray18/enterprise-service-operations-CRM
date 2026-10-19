import { NextFunction, Request, Response } from 'express';
import { rbacRepository } from '../database/repositories/rbacRepository.js';
import { sessionRepository } from '../database/repositories/sessionRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { hashToken } from '../services/authService.js';
import { AppError } from './errorHandler.js';

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    let sessionToken = req.cookies?.['crm_session'];

    // Also support Bearer header for programmatic clients/tests
    if (!sessionToken && req.headers.authorization?.startsWith('Bearer ')) {
      sessionToken = req.headers.authorization.slice(7).trim();
    }

    if (!sessionToken) {
      throw new AppError('Authentication credentials required', 401, 'UNAUTHORIZED');
    }

    const tokenHash = hashToken(sessionToken);
    const session = await sessionRepository.findActiveSession(tokenHash);

    if (!session) {
      throw new AppError('Session expired or invalid', 401, 'UNAUTHORIZED');
    }

    const user = await userRepository.findById(session.userId);
    if (!user || user.isActive !== 'Y') {
      throw new AppError('User account is inactive or not found', 401, 'UNAUTHORIZED');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError('Account is temporarily locked', 403, 'ACCOUNT_LOCKED');
    }

    // Touch session
    await sessionRepository.touchSession(session.sessionId);

    const [roles, permissions] = await Promise.all([
      rbacRepository.getUserRoles(user.userId),
      rbacRepository.getUserPermissions(user.userId),
    ]);

    req.user = {
      userId: user.userId,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      roles,
      permissions,
    };

    req.sessionContext = {
      sessionId: session.sessionId,
      csrfToken: session.csrfToken,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  // Safe idempotent methods are exempt from CSRF checks
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // If unauthenticated, let authentication middleware handle it
  if (!req.sessionContext) {
    return next();
  }

  const clientCsrfToken =
    req.headers['x-csrf-token'] ||
    (typeof req.body === 'object' && req.body !== null ? req.body._csrf : undefined);

  if (!clientCsrfToken || clientCsrfToken !== req.sessionContext.csrfToken) {
    throw new AppError('Invalid or missing CSRF token', 403, 'CSRF_TOKEN_INVALID');
  }

  next();
}

export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    const userPerms = new Set(req.user.permissions);
    const hasAll = requiredPermissions.every((p) => userPerms.has(p));

    if (!hasAll) {
      return next(
        new AppError(
          `Access denied. Requires permissions: ${requiredPermissions.join(', ')}`,
          403,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
}

export function requireRole(...requiredRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    const userRoles = new Set(req.user.roles);
    const hasAny = requiredRoles.some((r) => userRoles.has(r));

    if (!hasAny) {
      return next(
        new AppError(
          `Access denied. Requires one of roles: ${requiredRoles.join(', ')}`,
          403,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
}
