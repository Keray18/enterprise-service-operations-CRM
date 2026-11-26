import crypto from 'crypto';
import { getOracleConnection } from '../database/oraclePool.js';
import { rbacRepository } from '../database/repositories/rbacRepository.js';
import { sessionRepository } from '../database/repositories/sessionRepository.js';
import { systemAuditRepository } from '../database/repositories/systemAuditRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { logger } from '../logging/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuditContext } from '../types/accounts.js';
import { AuthenticatedUser, LoginResult, UserRecord } from '../types/auth.js';
import {
  hashPassword,
  validatePasswordComplexity,
  verifyPassword,
} from './passwordService.js';
import { systemConfigService } from './systemConfigService.js';

// Pre-computed dummy Argon2id hash for constant-time rejection on nonexistent users
const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$b1dvdXNmYXN0ZHVtbXlzYWx0$O1YfF5x1fU7Fz6Y3p5d0X7n2A1b3C4d5E6f7G8h9I0j';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function toAuthenticatedUser(user: UserRecord, roles: string[], permissions: string[]): AuthenticatedUser {
  return {
    userId: user.userId,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    locationId: user.locationId,
    roles,
    permissions,
    mustChangePassword: user.mustChangePassword === 'Y',
  };
}

export class AuthService {
  async login(
    identifier: string,
    passwordPlain: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResult> {
    const policy = await systemConfigService.getSecurityPolicy();
    const user = await userRepository.findByUsernameOrEmail(identifier);

    if (!user) {
      // Constant-time dummy verify to mitigate timing-based user enumeration
      await verifyPassword(passwordPlain, DUMMY_ARGON2_HASH);
      throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMs = user.lockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      throw new AppError(
        `Account is temporarily locked due to repeated failed attempts. Please try again in ${remainingMin} minute(s).`,
        403,
        'ACCOUNT_LOCKED'
      );
    }

    // Check account activation
    if (user.isActive !== 'Y') {
      throw new AppError('Your account has been deactivated. Contact an administrator.', 403, 'ACCOUNT_DISABLED');
    }

    // Verify password against stored hash (Argon2id preferred, transparent legacy bcrypt support)
    const { valid, needsRehash } = await verifyPassword(passwordPlain, user.passwordHash);
    if (!valid) {
      await userRepository.recordFailedAttempt(
        user.userId,
        user.failedLoginAttempts,
        policy.maxFailedLogins,
        policy.lockoutMinutes
      );
      throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
    }

    const [roles, permissions] = await Promise.all([
      rbacRepository.getUserRoles(user.userId),
      rbacRepository.getUserPermissions(user.userId),
    ]);

    // Accounts holding only inactive/obsolete roles (INFRA_OPS, FINANCE, BRAND, DISTRIBUTOR) have no
    // workspace in the approved six-role model and must not obtain a session.
    if (roles.length === 0) {
      throw new AppError('Your account has no active role in this application. Contact an administrator.', 403, 'NO_ACTIVE_ROLE');
    }

    // Provider maintenance mode: only the provider (SUPER_ADMIN) may sign in
    if (!roles.includes('SUPER_ADMIN') && (await systemConfigService.isMaintenanceMode())) {
      throw new AppError(
        'The application is under scheduled maintenance. Please try again later.',
        503,
        'MAINTENANCE_MODE'
      );
    }

    // Transparent rehash-on-success migration strategy from legacy bcrypt to Argon2id
    if (needsRehash) {
      try {
        const upgradedHash = await hashPassword(passwordPlain);
        await userRepository.updatePassword(user.userId, upgradedHash);
        logger.info(`Successfully upgraded password hash to Argon2id for user ID: ${user.userId}`);
      } catch (err: unknown) {
        logger.warn(`Failed to upgrade password hash to Argon2id for user ID: ${user.userId}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Reset failed counter and update last login
    await userRepository.recordSuccessfulLogin(user.userId);

    // Generate cryptographically secure tokens
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = hashToken(sessionToken);
    const csrfToken = crypto.randomBytes(24).toString('hex');
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + policy.sessionTimeoutMinutes * 60 * 1000);

    await sessionRepository.createSession({
      sessionId,
      userId: user.userId,
      sessionTokenHash,
      csrfToken,
      ipAddress,
      userAgent,
      expiresAt,
    });

    return {
      user: toAuthenticatedUser(user, roles, permissions),
      sessionToken,
      csrfToken,
      expiresAt,
    };
  }

  async logout(sessionToken: string | undefined): Promise<void> {
    if (!sessionToken) return;
    const tokenHash = hashToken(sessionToken);
    await sessionRepository.revokeSession(tokenHash);
  }

  async getMe(sessionToken: string | undefined): Promise<{ user: AuthenticatedUser; csrfToken: string }> {
    if (!sessionToken) {
      throw new AppError('Authentication session required', 401, 'UNAUTHORIZED');
    }

    const tokenHash = hashToken(sessionToken);
    const session = await sessionRepository.findActiveSession(tokenHash);

    if (!session) {
      throw new AppError('Session expired or invalid', 401, 'UNAUTHORIZED');
    }

    const user = await userRepository.findById(session.userId);
    if (!user || user.isActive !== 'Y') {
      throw new AppError('Account is invalid or inactive', 401, 'UNAUTHORIZED');
    }

    await sessionRepository.touchSession(session.sessionId);

    const [roles, permissions] = await Promise.all([
      rbacRepository.getUserRoles(user.userId),
      rbacRepository.getUserPermissions(user.userId),
    ]);

    return {
      user: toAuthenticatedUser(user, roles, permissions),
      csrfToken: session.csrfToken,
    };
  }

  /**
   * Self-service password change (also completes the mandatory first-login change).
   * Verifies the current credential, enforces complexity and reuse rules, stores an
   * Argon2id hash, clears MUST_CHANGE_PASSWORD and revokes every other session.
   */
  async changePassword(
    actor: AuthenticatedUser,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
    context: AuditContext = {}
  ): Promise<void> {
    const user = await userRepository.findById(actor.userId);
    if (!user || user.isActive !== 'Y') {
      throw new AppError('Account is invalid or inactive', 401, 'UNAUTHORIZED');
    }

    const { valid } = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      await systemAuditRepository.recordEvent({
        actorId: user.userId,
        actorRole: actor.roles[0] || null,
        actorUsername: user.username,
        action: 'PASSWORD_CHANGE',
        resource: 'APP_USERS',
        recordIdentifier: user.userId,
        outcome: 'FAILURE',
        justification: 'Current password verification failed',
        correlationId: context.correlationId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw new AppError('Current password is incorrect.', 400, 'INVALID_CURRENT_PASSWORD');
    }

    if (currentPassword === newPassword) {
      throw new AppError('New password must be different from the current password.', 400, 'PASSWORD_REUSE');
    }
    const lowered = newPassword.toLowerCase();
    if (lowered.includes(user.username.toLowerCase())) {
      throw new AppError('New password must not contain your username.', 400, 'PASSWORD_CONTAINS_USERNAME');
    }
    try {
      validatePasswordComplexity(newPassword);
    } catch (err) {
      throw new AppError((err as Error).message, 400, 'PASSWORD_COMPLEXITY');
    }

    const newHash = await hashPassword(newPassword);
    const conn = await getOracleConnection();
    try {
      await userRepository.setCredential(user.userId, newHash, 'N', conn);
      await sessionRepository.revokeOtherUserSessions(user.userId, currentSessionId, conn);
      await systemAuditRepository.recordEvent(
        {
          actorId: user.userId,
          actorRole: actor.roles[0] || null,
          actorUsername: user.username,
          action: user.mustChangePassword === 'Y' ? 'FIRST_LOGIN_PASSWORD_CHANGE' : 'PASSWORD_CHANGE',
          resource: 'APP_USERS',
          recordIdentifier: user.userId,
          outcome: 'SUCCESS',
          correlationId: context.correlationId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        conn
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
    logger.info(`Password changed by account owner ${user.userId}; other sessions revoked`);
  }

  /**
   * Securely rotates a user's password to Argon2id and immediately revokes all active sessions.
   * When `requireChange` is true the new credential is temporary and must be changed at next sign-in.
   */
  async rotatePassword(userId: string, newPasswordPlain: string, requireChange = false): Promise<void> {
    validatePasswordComplexity(newPasswordPlain);
    const newHash = await hashPassword(newPasswordPlain);
    await userRepository.setCredential(userId, newHash, requireChange ? 'Y' : 'N');
    await sessionRepository.revokeAllUserSessions(userId);
    logger.info(`Password rotated and all active sessions revoked for user ID: ${userId}`);
  }
}

export const authService = new AuthService();
