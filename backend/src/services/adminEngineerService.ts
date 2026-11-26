import { randomUUID } from 'crypto';
import { AuthenticatedUser } from '../types/auth.js';
import {
  AdminEngineerQueryParams,
  AdminEngineerRecord,
  CreateEngineerInput,
  CreateEngineerResponse,
} from '../types/engineer.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { rbacRepository } from '../database/repositories/rbacRepository.js';
import { serviceRequestRepository } from '../database/repositories/serviceRequestRepository.js';
import { locationRepository } from '../database/repositories/locationRepository.js';
import { getOracleConnection } from '../database/oraclePool.js';
import { generateTemporaryPassword, hashPassword } from './passwordService.js';
import { sessionRepository } from '../database/repositories/sessionRepository.js';
import { systemAuditRepository } from '../database/repositories/systemAuditRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../logging/logger.js';

/** @deprecated use generateTemporaryPassword from passwordService (kept for existing callers). */
export function generateSecureTemporaryPassword(): string {
  return generateTemporaryPassword();
}

export class AdminEngineerService {
  async listEngineers(params: AdminEngineerQueryParams, actor: AuthenticatedUser) {
    logger.info(`[ADMIN ENGINEER] Admin ${actor.username} listing engineers (page=${params.page}, status=${params.status})`);
    return userRepository.findEngineersForAdmin(params);
  }

  async createEngineer(input: CreateEngineerInput, actor: AuthenticatedUser): Promise<CreateEngineerResponse> {
    logger.info(`[ADMIN ENGINEER] Admin ${actor.username} creating field engineer ${input.username}`);

    // Check if username or email already exists
    const existing = await userRepository.findByUsernameOrEmail(input.username);
    if (existing) {
      throw new AppError(`Username '${input.username}' is already in use.`, 409, 'USERNAME_ALREADY_EXISTS');
    }

    const email = input.email ? input.email.trim().toLowerCase() : `${input.username.toLowerCase()}@crm.internal`;
    const existingEmail = await userRepository.findByUsernameOrEmail(email);
    if (existingEmail) {
      throw new AppError(`Email address '${email}' is already registered.`, 409, 'EMAIL_ALREADY_EXISTS');
    }

    // Verify location exists and is an operational ASF
    const location = await locationRepository.findById(input.homeLocationId);
    if (!location) {
      throw new AppError(`Service center location with ID '${input.homeLocationId}' not found.`, 404, 'LOCATION_NOT_FOUND');
    }
    if (location.isTestFixture === 'Y') {
      throw new AppError(`Cannot assign engineer to test fixture location '${location.locationName}'.`, 400, 'INVALID_LOCATION');
    }
    if (location.isActive === 'N') {
      throw new AppError(`Cannot assign engineer to inactive location '${location.locationName}'.`, 400, 'LOCATION_INACTIVE');
    }
    if (location.partyType !== 'ASF') {
      throw new AppError(`Assigned location must be an Authorized Service Franchise (ASF).`, 400, 'INVALID_LOCATION_TYPE');
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const userId = randomUUID();

    const conn = await getOracleConnection();
    try {
      await userRepository.createUser(
        {
          userId,
          username: input.username,
          email,
          fullName: input.fullName,
          passwordHash,
          phoneNumber: input.phoneNumber,
          locationId: input.homeLocationId,
          isActive: input.isActive || 'Y',
          mustChangePassword: 'Y',
        },
        conn
      );

      await rbacRepository.assignRoleToUser(userId, 'ENGINEER', actor.userId, conn);
      await systemAuditRepository.recordEvent(
        {
          actorId: actor.userId,
          actorRole: 'ADMIN',
          actorUsername: actor.username,
          action: 'ACCOUNT_CREATE',
          resource: 'APP_USERS',
          recordIdentifier: userId,
          outcome: 'SUCCESS',
          changes: { username: input.username, role: 'ENGINEER', locationId: input.homeLocationId, temporaryCredential: true },
        },
        conn
      );
      await conn.commit();
      logger.info(`[ADMIN ENGINEER] Successfully created engineer ${input.username} (${userId}) assigned to ${location.locationCode}`);
    } catch (err) {
      await conn.rollback();
      logger.error(`[ADMIN ENGINEER] Failed to create engineer ${input.username}:`, err);
      throw err;
    } finally {
      await conn.close();
    }

    const user: AdminEngineerRecord = {
      userId,
      username: input.username.toLowerCase().trim(),
      fullName: input.fullName.trim(),
      phoneNumber: input.phoneNumber,
      email,
      isActive: input.isActive || 'Y',
      homeLocationId: location.locationId,
      homeLocationCode: location.locationCode,
      homeLocationName: location.locationName,
      openJobCount: 0,
      createdAt: new Date(),
    };

    return {
      user,
      temporaryPassword,
    };
  }

  async setEngineerStatus(
    engineerId: string,
    isActive: 'Y' | 'N',
    reassignToEngineerId?: string,
    actor?: AuthenticatedUser
  ) {
    const user = await userRepository.findById(engineerId);
    if (!user) {
      throw new AppError('Engineer not found.', 404, 'USER_NOT_FOUND');
    }

    const roles = await rbacRepository.getUserRoles(engineerId);
    if (!roles.includes('ENGINEER')) {
      throw new AppError('Target user does not have the ENGINEER role.', 400, 'NOT_AN_ENGINEER');
    }

    if (isActive === 'N') {
      const activeJobsCount = await serviceRequestRepository.countActiveEngineerJobs(engineerId);
      if (activeJobsCount > 0) {
        if (!reassignToEngineerId) {
          throw new AppError(
            `Cannot deactivate engineer with ${activeJobsCount} active assigned jobs. Please reassign jobs first.`,
            400,
            'ACTIVE_JOBS_EXIST',
            { activeJobsCount }
          );
        }

        if (reassignToEngineerId === engineerId) {
          throw new AppError('Cannot reassign jobs to the same engineer being deactivated.', 400, 'INVALID_REASSIGNMENT');
        }

        const replacement = await userRepository.findById(reassignToEngineerId);
        if (!replacement || replacement.isActive !== 'Y') {
          throw new AppError('Replacement engineer not found or is currently inactive.', 400, 'INVALID_REPLACEMENT_ENGINEER');
        }

        const replacementRoles = await rbacRepository.getUserRoles(reassignToEngineerId);
        if (!replacementRoles.includes('ENGINEER')) {
          throw new AppError('Selected replacement user is not an active field engineer.', 400, 'INVALID_REPLACEMENT_ENGINEER');
        }

        const conn = await getOracleConnection();
        try {
          const reassignResult = await serviceRequestRepository.reassignEngineerJobs(
            engineerId,
            reassignToEngineerId,
            actor?.userId || 'SYSTEM',
            actor?.username || 'SYSTEM',
            conn
          );

          await userRepository.setUserActive(engineerId, 'N', conn);
          await sessionRepository.revokeAllUserSessions(engineerId, conn);
          await conn.commit();

          logger.info(
            `[ADMIN ENGINEER] Deactivated engineer ${user.username} and reassigned ${reassignResult.reassignedCount} jobs to ${replacement.username}`
          );

          return {
            success: true,
            isActive: 'N',
            reassignedCount: reassignResult.reassignedCount,
            message: `Engineer deactivated. Reassigned ${reassignResult.reassignedCount} active jobs to ${replacement.fullName}.`,
          };
        } catch (err) {
          await conn.rollback();
          throw err;
        } finally {
          await conn.close();
        }
      }

      await userRepository.setUserActive(engineerId, 'N');
      await sessionRepository.revokeAllUserSessions(engineerId);
      logger.info(`[ADMIN ENGINEER] Deactivated engineer ${user.username} (0 active jobs)`);
      return {
        success: true,
        isActive: 'N',
        reassignedCount: 0,
        message: 'Engineer deactivated successfully.',
      };
    }

    await userRepository.setUserActive(engineerId, 'Y');
    logger.info(`[ADMIN ENGINEER] Activated engineer ${user.username}`);
    return {
      success: true,
      isActive: 'Y',
      reassignedCount: 0,
      message: 'Engineer activated successfully.',
    };
  }

  async resetEngineerPassword(engineerId: string, actor: AuthenticatedUser): Promise<{ temporaryPassword: string }> {
    const user = await userRepository.findById(engineerId);
    if (!user) {
      throw new AppError('Engineer not found.', 404, 'USER_NOT_FOUND');
    }

    const roles = await rbacRepository.getUserRoles(engineerId);
    if (!roles.includes('ENGINEER')) {
      throw new AppError('Target user does not have the ENGINEER role.', 400, 'NOT_AN_ENGINEER');
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const conn = await getOracleConnection();
    try {
      await userRepository.setCredential(engineerId, passwordHash, 'Y', conn);
      await sessionRepository.revokeAllUserSessions(engineerId, conn);
      await systemAuditRepository.recordEvent(
        {
          actorId: actor.userId,
          actorRole: 'ADMIN',
          actorUsername: actor.username,
          action: 'CREDENTIAL_RESET',
          resource: 'APP_USERS',
          recordIdentifier: engineerId,
          outcome: 'SUCCESS',
          changes: { temporaryCredential: true },
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
    logger.info(`[ADMIN ENGINEER] Admin ${actor.username} reset password for technician ${user.username}`);

    return { temporaryPassword };
  }

  async updateEngineerLocation(engineerId: string, homeLocationId: string, actor: AuthenticatedUser) {
    const user = await userRepository.findById(engineerId);
    if (!user) {
      throw new AppError('Engineer not found.', 404, 'USER_NOT_FOUND');
    }

    const location = await locationRepository.findById(homeLocationId);
    if (!location) {
      throw new AppError('Service Center location not found.', 404, 'LOCATION_NOT_FOUND');
    }
    if (location.isTestFixture === 'Y') {
      throw new AppError(`Cannot assign engineer to test fixture location '${location.locationName}'.`, 400, 'INVALID_LOCATION');
    }
    if (location.isActive === 'N') {
      throw new AppError(`Cannot assign engineer to inactive location '${location.locationName}'.`, 400, 'LOCATION_INACTIVE');
    }
    if (location.partyType !== 'ASF') {
      throw new AppError(`Assigned location must be an Authorized Service Franchise (ASF).`, 400, 'INVALID_LOCATION_TYPE');
    }

    await userRepository.updateUserLocation(engineerId, homeLocationId);
    logger.info(
      `[ADMIN ENGINEER] Admin ${actor.username} updated home Service Center for ${user.username} to ${location.locationCode}`
    );

    return {
      success: true,
      homeLocationId: location.locationId,
      homeLocationCode: location.locationCode,
      homeLocationName: location.locationName,
      message: `Assigned home Service Center updated to ${location.locationName}.`,
    };
  }

  async getEngineerActiveJobs(engineerId: string) {
    return serviceRequestRepository.findActiveJobsByEngineer(engineerId);
  }
}

export const adminEngineerService = new AdminEngineerService();

