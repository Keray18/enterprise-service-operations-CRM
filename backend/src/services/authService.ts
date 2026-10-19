import crypto from 'crypto';
import { rbacRepository } from '../database/repositories/rbacRepository.js';
import { sessionRepository } from '../database/repositories/sessionRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { logger } from '../logging/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser, LoginResult } from '../types/auth.js';
import {
  hashPassword,
  validatePasswordComplexity,
  verifyPassword,
} from './passwordService.js';

// Pre-computed dummy Argon2id hash for constant-time rejection on nonexistent users
const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$b1dvdXNmYXN0ZHVtbXlzYWx0$O1YfF5x1fU7Fz6Y3p5d0X7n2A1b3C4d5E6f7G8h9I0j';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export class AuthService {
  private readonly sessionDurationMs = 8 * 60 * 60 * 1000; // 8 hours
  private readonly maxFailedAttempts = 5;
  private readonly lockoutMinutes = 15;

  async login(
    identifier: string,
    passwordPlain: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResult> {
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
        this.maxFailedAttempts,
        this.lockoutMinutes
      );
      throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
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
    const expiresAt = new Date(Date.now() + this.sessionDurationMs);

    await sessionRepository.createSession({
      sessionId,
      userId: user.userId,
      sessionTokenHash,
      csrfToken,
      ipAddress,
      userAgent,
      expiresAt,
    });

    const [roles, permissions] = await Promise.all([
      rbacRepository.getUserRoles(user.userId),
      rbacRepository.getUserPermissions(user.userId),
    ]);

    const authenticatedUser: AuthenticatedUser = {
      userId: user.userId,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      roles,
      permissions,
    };

    return {
      user: authenticatedUser,
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

    // Touch session activity
    await sessionRepository.touchSession(session.sessionId);

    const [roles, permissions] = await Promise.all([
      rbacRepository.getUserRoles(user.userId),
      rbacRepository.getUserPermissions(user.userId),
    ]);

    return {
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        roles,
        permissions,
      },
      csrfToken: session.csrfToken,
    };
  }

  /**
   * Securely rotates a user's password to Argon2id and immediately revokes all active sessions.
   */
  async rotatePassword(userId: string, newPasswordPlain: string): Promise<void> {
    validatePasswordComplexity(newPasswordPlain);
    const newHash = await hashPassword(newPasswordPlain);
    await userRepository.updatePassword(userId, newHash);
    await sessionRepository.revokeAllUserSessions(userId);
    logger.info(`Password rotated and all active sessions revoked for user ID: ${userId}`);
  }
}

export const authService = new AuthService();
