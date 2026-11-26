import crypto from 'crypto';
import oracledb from 'oracledb';
import { getOracleConnection } from '../database/oraclePool.js';
import { locationRepository } from '../database/repositories/locationRepository.js';
import { rbacRepository } from '../database/repositories/rbacRepository.js';
import { serviceRequestRepository } from '../database/repositories/serviceRequestRepository.js';
import { sessionRepository } from '../database/repositories/sessionRepository.js';
import { systemAuditRepository } from '../database/repositories/systemAuditRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { logger } from '../logging/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  AuditContext,
  ManagedAccountRecord,
  OPERATIONAL_STAFF_ROLES,
  OperationalStaffRole,
  ProvisionAccountInput,
  ProvisionAccountResult,
} from '../types/accounts.js';
import { AuthenticatedUser } from '../types/auth.js';
import { generateTemporaryPassword, hashPassword } from './passwordService.js';

type ManageableRole = 'ADMIN' | OperationalStaffRole;

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,49}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^[6-9]\d{9}$/;

/**
 * Account provisioning and lifecycle with a strict authority boundary:
 *
 *   SUPER_ADMIN (provider)  -> may provision/manage ADMIN accounts only.
 *   ADMIN (client)          -> may provision/manage CALL_CENTER, ASF, ENGINEER, WAREHOUSE only.
 *
 * Nobody can create or modify SUPER_ADMIN accounts through the API (backend CLI only),
 * an ADMIN can never touch another ADMIN or a SUPER_ADMIN, and no endpoint changes an
 * existing account's role, so operational users cannot be promoted.
 */
export class AccountService {
  /** Which roles the actor may provision/manage. Empty when the actor has no provisioning authority. */
  manageableRolesFor(actor: AuthenticatedUser): ManageableRole[] {
    if (actor.roles.includes('SUPER_ADMIN')) {
      return ['ADMIN'];
    }
    if (actor.roles.includes('ADMIN')) {
      return [...OPERATIONAL_STAFF_ROLES];
    }
    return [];
  }

  private actorRole(actor: AuthenticatedUser): string {
    return actor.roles.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : actor.roles.includes('ADMIN') ? 'ADMIN' : actor.roles[0] || 'UNKNOWN';
  }

  private async auditDenied(
    actor: AuthenticatedUser,
    action: string,
    target: string | null,
    reason: string,
    context: AuditContext
  ): Promise<void> {
    await systemAuditRepository.recordEvent({
      actorId: actor.userId,
      actorRole: this.actorRole(actor),
      actorUsername: actor.username,
      action,
      resource: 'APP_USERS',
      recordIdentifier: target,
      outcome: 'FAILURE',
      justification: reason,
      correlationId: context.correlationId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  private assertCanProvisionRole(actor: AuthenticatedUser, role: string): asserts role is ManageableRole {
    const allowed = this.manageableRolesFor(actor);
    if (!allowed.includes(role as ManageableRole)) {
      if (role === 'SUPER_ADMIN') {
        throw new AppError('Super Admin accounts cannot be created through the application.', 403, 'PRIVILEGE_ESCALATION_DENIED');
      }
      if (role === 'ADMIN' && actor.roles.includes('ADMIN')) {
        throw new AppError('Client Administrators cannot create Administrator accounts.', 403, 'PRIVILEGE_ESCALATION_DENIED');
      }
      throw new AppError(`You are not authorized to provision '${role}' accounts.`, 403, 'ROLE_NOT_MANAGEABLE');
    }
  }

  /**
   * Loads a target account and verifies the actor may manage it.
   * ADMIN actors may only manage accounts whose every role is operational staff.
   * SUPER_ADMIN actors may only manage ADMIN accounts (never another SUPER_ADMIN).
   */
  private async loadManageableTarget(actor: AuthenticatedUser, targetUserId: string, action: string, context: AuditContext) {
    const target = await userRepository.findById(targetUserId);
    if (!target) {
      throw new AppError('Account not found.', 404, 'USER_NOT_FOUND');
    }
    const targetRoles = await this.getAllRoleCodes(targetUserId);
    const allowed = this.manageableRolesFor(actor);

    let denial: string | null = null;
    if (allowed.length === 0) {
      denial = 'Actor has no account management authority';
    } else if (targetRoles.includes('SUPER_ADMIN')) {
      denial = 'Super Admin accounts are managed only through backend provisioning';
    } else if (targetRoles.length === 0 || !targetRoles.every((r) => allowed.includes(r as ManageableRole))) {
      denial = actor.roles.includes('SUPER_ADMIN')
        ? 'Provider Super Admin manages client Administrator accounts only'
        : 'Client Administrators may manage operational staff accounts only';
    } else if (target.userId === actor.userId) {
      denial = 'Use self-service password change; you cannot manage your own account here';
    }

    if (denial) {
      await this.auditDenied(actor, action, targetUserId, denial, context);
      throw new AppError(`Forbidden: ${denial}.`, 403, 'ACCOUNT_NOT_MANAGEABLE');
    }
    return { target, targetRoles };
  }

  /** Role codes including inactive ones (for policy checks on historical accounts). */
  private async getAllRoleCodes(userId: string): Promise<string[]> {
    const conn = await getOracleConnection();
    try {
      const res = await conn.execute<any>(
        `SELECT r.CODE FROM USER_ROLES ur JOIN ROLES r ON r.ROLE_ID = ur.ROLE_ID WHERE ur.USER_ID = :userId`,
        { userId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return (res.rows || []).map((r: any) => String(r.CODE));
    } finally {
      await conn.close();
    }
  }

  private async validateLocationForRole(role: ManageableRole, locationId?: string): Promise<string | undefined> {
    if (role === 'ADMIN' || role === 'CALL_CENTER') {
      if (locationId) {
        const loc = await locationRepository.findById(locationId);
        if (!loc || loc.isActive !== 'Y') {
          throw new AppError('Selected organization location is not active or does not exist.', 400, 'INVALID_LOCATION');
        }
      }
      return locationId || undefined;
    }
    if (!locationId) {
      throw new AppError(`A ${role === 'WAREHOUSE' ? 'warehouse' : 'service center'} location is required for ${role} accounts.`, 400, 'LOCATION_REQUIRED');
    }
    const loc = await locationRepository.findById(locationId);
    if (!loc) {
      throw new AppError('Selected location does not exist.', 404, 'LOCATION_NOT_FOUND');
    }
    if (loc.isActive !== 'Y') {
      throw new AppError(`Location '${loc.locationName}' is inactive.`, 400, 'LOCATION_INACTIVE');
    }
    if (loc.isTestFixture === 'Y') {
      throw new AppError(`Location '${loc.locationName}' is a test fixture and cannot host operational staff.`, 400, 'INVALID_LOCATION');
    }
    const expected = role === 'WAREHOUSE' ? ['CENTRAL_WAREHOUSE', 'REGIONAL_WAREHOUSE'] : ['ASF'];
    if (!expected.includes(loc.partyType)) {
      throw new AppError(
        `${role} accounts must be associated with a ${role === 'WAREHOUSE' ? 'warehouse' : 'service center (ASF)'} location.`,
        400,
        'INVALID_LOCATION_TYPE'
      );
    }
    return locationId;
  }

  private normalizeInput(input: ProvisionAccountInput): ProvisionAccountInput {
    const username = String(input.username || '').trim().toLowerCase();
    const email = String(input.email || '').trim().toLowerCase();
    const fullName = String(input.fullName || '').trim();
    const phoneNumber = input.phoneNumber ? String(input.phoneNumber).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '') : undefined;
    if (fullName.length < 2 || fullName.length > 100) {
      throw new AppError('Full name must be between 2 and 100 characters.', 400, 'INVALID_FULL_NAME');
    }
    if (!USERNAME_PATTERN.test(username)) {
      throw new AppError(
        'Username must be 3-50 characters: lowercase letters, digits, dot, underscore or hyphen, starting with a letter or digit.',
        400,
        'INVALID_USERNAME'
      );
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 255) {
      throw new AppError('A valid email address is required.', 400, 'INVALID_EMAIL');
    }
    if (phoneNumber && !PHONE_PATTERN.test(phoneNumber)) {
      throw new AppError('Contact number must be a valid 10-digit Indian mobile number.', 400, 'INVALID_PHONE');
    }
    return { fullName, username, email, phoneNumber, locationId: input.locationId || undefined };
  }

  private async findAccount(userId: string): Promise<ManagedAccountRecord> {
    const roles = await this.getAllRoleCodes(userId);
    const page = await userRepository.listAccountsByRoles({ roleCodes: roles.length ? roles : ['__NONE__'], userId, limit: 1 });
    const found = page.items[0];
    if (!found) throw new AppError('Account not found.', 404, 'USER_NOT_FOUND');
    return found;
  }

  async listAccounts(
    actor: AuthenticatedUser,
    filters: { search?: string; status?: 'Y' | 'N'; role?: string; page?: number; limit?: number }
  ) {
    const allowed = this.manageableRolesFor(actor);
    if (allowed.length === 0) {
      throw new AppError('Forbidden: no account management authority.', 403, 'FORBIDDEN');
    }
    if (filters.role && !allowed.includes(filters.role as ManageableRole)) {
      throw new AppError(`Forbidden: you cannot list '${filters.role}' accounts.`, 403, 'ROLE_NOT_MANAGEABLE');
    }
    const result = await userRepository.listAccountsByRoles({ roleCodes: allowed, ...filters });
    // Never surface privileged accounts to a client Admin, even if they also hold an operational role
    const items = actor.roles.includes('SUPER_ADMIN')
      ? result.items.filter((a) => !a.roles.includes('SUPER_ADMIN'))
      : result.items.filter((a) => a.roles.every((r) => (OPERATIONAL_STAFF_ROLES as readonly string[]).includes(r)));
    return { ...result, items, manageableRoles: allowed };
  }

  async provisionAccount(
    actor: AuthenticatedUser,
    role: string,
    rawInput: ProvisionAccountInput,
    context: AuditContext = {}
  ): Promise<ProvisionAccountResult> {
    try {
      this.assertCanProvisionRole(actor, role);
    } catch (err) {
      await this.auditDenied(actor, 'ACCOUNT_CREATE', null, `Attempted to create '${role}' account`, context);
      throw err;
    }
    const input = this.normalizeInput(rawInput);
    const locationId = await this.validateLocationForRole(role, input.locationId);

    if (await userRepository.findByUsernameOrEmail(input.username)) {
      throw new AppError(`Username '${input.username}' is already in use.`, 409, 'USERNAME_ALREADY_EXISTS');
    }
    if (await userRepository.findByUsernameOrEmail(input.email)) {
      throw new AppError(`Email address '${input.email}' is already registered.`, 409, 'EMAIL_ALREADY_EXISTS');
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const userId = crypto.randomUUID();

    const conn = await getOracleConnection();
    try {
      await userRepository.createUser(
        {
          userId,
          username: input.username,
          email: input.email,
          fullName: input.fullName,
          passwordHash,
          phoneNumber: input.phoneNumber,
          locationId,
          isActive: 'Y',
          mustChangePassword: 'Y',
        },
        conn
      );
      await rbacRepository.assignRoleToUser(userId, role, actor.userId, conn);
      await systemAuditRepository.recordEvent(
        {
          actorId: actor.userId,
          actorRole: this.actorRole(actor),
          actorUsername: actor.username,
          action: 'ACCOUNT_CREATE',
          resource: 'APP_USERS',
          recordIdentifier: userId,
          outcome: 'SUCCESS',
          correlationId: context.correlationId,
          changes: { username: input.username, role, locationId: locationId || null, temporaryCredential: true },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        conn
      );
      await conn.commit();
    } catch (err: any) {
      await conn.rollback();
      if (String(err?.message || '').includes('ORA-00001')) {
        throw new AppError('Username or email is already registered.', 409, 'ACCOUNT_ALREADY_EXISTS');
      }
      throw err;
    } finally {
      await conn.close();
    }

    logger.info(`[ACCOUNTS] ${this.actorRole(actor)} ${actor.username} provisioned ${role} account ${input.username}`);
    return { account: await this.findAccount(userId), temporaryPassword };
  }

  async updateAccount(
    actor: AuthenticatedUser,
    targetUserId: string,
    changes: { fullName?: string; email?: string; phoneNumber?: string | null; locationId?: string | null },
    context: AuditContext = {}
  ): Promise<ManagedAccountRecord> {
    const { target, targetRoles } = await this.loadManageableTarget(actor, targetUserId, 'ACCOUNT_UPDATE', context);
    const normalized = this.normalizeInput({
      fullName: changes.fullName ?? target.fullName,
      username: target.username,
      email: changes.email ?? target.email,
      phoneNumber: changes.phoneNumber === null ? undefined : changes.phoneNumber ?? target.phoneNumber,
      locationId: changes.locationId === null ? undefined : changes.locationId ?? target.locationId,
    });
    const primaryRole = targetRoles[0] as ManageableRole;
    const locationId = changes.locationId !== undefined ? await this.validateLocationForRole(primaryRole, normalized.locationId) : undefined;

    if (normalized.email !== target.email) {
      const clash = await userRepository.findByUsernameOrEmail(normalized.email);
      if (clash && clash.userId !== target.userId) {
        throw new AppError(`Email address '${normalized.email}' is already registered.`, 409, 'EMAIL_ALREADY_EXISTS');
      }
    }

    const conn = await getOracleConnection();
    try {
      await userRepository.updateProfile(
        target.userId,
        {
          fullName: changes.fullName !== undefined ? normalized.fullName : undefined,
          email: changes.email !== undefined ? normalized.email : undefined,
          phoneNumber: changes.phoneNumber !== undefined ? normalized.phoneNumber || null : undefined,
          locationId: changes.locationId !== undefined ? locationId || null : undefined,
        },
        conn
      );
      await systemAuditRepository.recordEvent(
        {
          actorId: actor.userId,
          actorRole: this.actorRole(actor),
          actorUsername: actor.username,
          action: 'ACCOUNT_UPDATE',
          resource: 'APP_USERS',
          recordIdentifier: target.userId,
          outcome: 'SUCCESS',
          correlationId: context.correlationId,
          changes: { fields: Object.keys(changes) },
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
    return this.findAccount(target.userId);
  }

  /**
   * Activates or suspends an account. Suspension revokes every active session atomically.
   * Field engineers with open jobs must be reassigned first (Engineer Management handles reassignment).
   */
  async setAccountStatus(
    actor: AuthenticatedUser,
    targetUserId: string,
    isActive: 'Y' | 'N',
    reason: string | undefined,
    context: AuditContext = {}
  ): Promise<{ account: ManagedAccountRecord; revokedSessions: number }> {
    const action = isActive === 'Y' ? 'ACCOUNT_ACTIVATE' : 'ACCOUNT_SUSPEND';
    const { target, targetRoles } = await this.loadManageableTarget(actor, targetUserId, action, context);

    if (isActive === 'N' && targetRoles.includes('ENGINEER')) {
      const activeJobs = await serviceRequestRepository.countActiveEngineerJobs(target.userId);
      if (activeJobs > 0) {
        throw new AppError(
          `Cannot suspend engineer with ${activeJobs} active assigned job(s). Reassign them from Engineer Management first.`,
          400,
          'ACTIVE_JOBS_EXIST',
          { activeJobsCount: activeJobs }
        );
      }
    }

    let revokedSessions = 0;
    const conn = await getOracleConnection();
    try {
      await userRepository.setUserActive(target.userId, isActive, conn);
      if (isActive === 'N') {
        revokedSessions = await sessionRepository.revokeAllUserSessions(target.userId, conn);
      }
      await systemAuditRepository.recordEvent(
        {
          actorId: actor.userId,
          actorRole: this.actorRole(actor),
          actorUsername: actor.username,
          action,
          resource: 'APP_USERS',
          recordIdentifier: target.userId,
          outcome: 'SUCCESS',
          correlationId: context.correlationId,
          justification: reason ? reason.slice(0, 1000) : undefined,
          changes: { isActive, revokedSessions },
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
    return { account: await this.findAccount(target.userId), revokedSessions };
  }

  /**
   * Issues a new temporary credential (shown once), forces a change at next sign-in and
   * revokes every active session of the account in the same transaction.
   */
  async resetCredentials(
    actor: AuthenticatedUser,
    targetUserId: string,
    context: AuditContext = {}
  ): Promise<{ account: ManagedAccountRecord; temporaryPassword: string; revokedSessions: number }> {
    const { target } = await this.loadManageableTarget(actor, targetUserId, 'CREDENTIAL_RESET', context);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    let revokedSessions = 0;
    const conn = await getOracleConnection();
    try {
      await userRepository.setCredential(target.userId, passwordHash, 'Y', conn);
      revokedSessions = await sessionRepository.revokeAllUserSessions(target.userId, conn);
      await systemAuditRepository.recordEvent(
        {
          actorId: actor.userId,
          actorRole: this.actorRole(actor),
          actorUsername: actor.username,
          action: 'CREDENTIAL_RESET',
          resource: 'APP_USERS',
          recordIdentifier: target.userId,
          outcome: 'SUCCESS',
          correlationId: context.correlationId,
          changes: { temporaryCredential: true, revokedSessions },
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
    return { account: await this.findAccount(target.userId), temporaryPassword, revokedSessions };
  }

  async revokeSessions(
    actor: AuthenticatedUser,
    targetUserId: string,
    context: AuditContext = {}
  ): Promise<{ revokedSessions: number }> {
    const { target } = await this.loadManageableTarget(actor, targetUserId, 'SESSIONS_REVOKE', context);
    const conn = await getOracleConnection();
    let revokedSessions = 0;
    try {
      revokedSessions = await sessionRepository.revokeAllUserSessions(target.userId, conn);
      await systemAuditRepository.recordEvent(
        {
          actorId: actor.userId,
          actorRole: this.actorRole(actor),
          actorUsername: actor.username,
          action: 'SESSIONS_REVOKE',
          resource: 'USER_SESSIONS',
          recordIdentifier: target.userId,
          outcome: 'SUCCESS',
          correlationId: context.correlationId,
          changes: { revokedSessions },
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
    return { revokedSessions };
  }
}

export const accountService = new AccountService();
