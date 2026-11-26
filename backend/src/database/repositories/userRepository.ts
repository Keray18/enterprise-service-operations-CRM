import oracledb from 'oracledb';
import { UserRecord } from '../../types/auth.js';
import { EligibleEngineerRecord } from '../../types/asf.js';
import { AdminEngineerRecord, AdminEngineerQueryParams, AdminEngineerListResult } from '../../types/engineer.js';
import { ManagedAccountRecord } from '../../types/accounts.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToUser(row: any): UserRecord {
  return {
    userId: row.USER_ID,
    username: row.USERNAME,
    email: row.EMAIL,
    fullName: row.FULL_NAME,
    passwordHash: row.PASSWORD_HASH,
    phoneNumber: row.PHONE_NUMBER || undefined,
    locationId: row.LOCATION_ID || undefined,
    isActive: row.IS_ACTIVE as 'Y' | 'N',
    failedLoginAttempts: Number(row.FAILED_LOGIN_ATTEMPTS || 0),
    lockedUntil: row.LOCKED_UNTIL ? new Date(row.LOCKED_UNTIL) : undefined,
    lastLoginAt: row.LAST_LOGIN_AT ? new Date(row.LAST_LOGIN_AT) : undefined,
    mustChangePassword: row.MUST_CHANGE_PASSWORD === 'Y' ? 'Y' : 'N',
    passwordChangedAt: row.PASSWORD_CHANGED_AT ? new Date(row.PASSWORD_CHANGED_AT) : undefined,
    createdAt: new Date(row.CREATED_AT),
    updatedAt: new Date(row.UPDATED_AT),
  };
}

export class UserRepository {
  async findByUsernameOrEmail(identifier: string): Promise<UserRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT 
          USER_ID, USERNAME, EMAIL, FULL_NAME, PASSWORD_HASH, PHONE_NUMBER, LOCATION_ID,
          IS_ACTIVE, FAILED_LOGIN_ATTEMPTS, LOCKED_UNTIL, LAST_LOGIN_AT,
          MUST_CHANGE_PASSWORD, PASSWORD_CHANGED_AT,
          CREATED_AT, UPDATED_AT
        FROM APP_USERS
        WHERE LOWER(USERNAME) = LOWER(:identifier) OR LOWER(EMAIL) = LOWER(:identifier)
      `;
      const result = await conn.execute<any>(
        sql,
        { identifier: identifier.trim() },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      return mapRowToUser(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async findById(userId: string): Promise<UserRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT 
          USER_ID, USERNAME, EMAIL, FULL_NAME, PASSWORD_HASH, PHONE_NUMBER, LOCATION_ID,
          IS_ACTIVE, FAILED_LOGIN_ATTEMPTS, LOCKED_UNTIL, LAST_LOGIN_AT,
          MUST_CHANGE_PASSWORD, PASSWORD_CHANGED_AT,
          CREATED_AT, UPDATED_AT
        FROM APP_USERS
        WHERE USER_ID = :userId
      `;
      const result = await conn.execute<any>(
        sql,
        { userId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      return mapRowToUser(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async createUser(data: {
    userId: string;
    username: string;
    email: string;
    fullName: string;
    passwordHash: string;
    phoneNumber?: string;
    locationId?: string;
    isActive?: 'Y' | 'N';
    mustChangePassword?: 'Y' | 'N';
  }, conn?: oracledb.Connection): Promise<void> {
    const shouldClose = !conn;
    const connection = conn || (await getOracleConnection());
    try {
      const sql = `
        INSERT INTO APP_USERS (
          USER_ID, USERNAME, EMAIL, FULL_NAME, PASSWORD_HASH, PHONE_NUMBER, LOCATION_ID,
          IS_ACTIVE, FAILED_LOGIN_ATTEMPTS, MUST_CHANGE_PASSWORD, CREATED_AT, UPDATED_AT
        ) VALUES (
          :userId, :username, :email, :fullName, :passwordHash, :phoneNumber, :locationId,
          :isActive, 0, :mustChangePassword, SYSTIMESTAMP, SYSTIMESTAMP
        )
      `;
      await connection.execute(
        sql,
        {
          userId: data.userId,
          username: data.username.toLowerCase().trim(),
          email: data.email.toLowerCase().trim(),
          fullName: data.fullName.trim(),
          passwordHash: data.passwordHash,
          phoneNumber: data.phoneNumber || null,
          locationId: data.locationId || null,
          isActive: data.isActive || 'Y',
          mustChangePassword: data.mustChangePassword || 'N',
        },
        { autoCommit: shouldClose }
      );
    } finally {
      if (shouldClose) {
        await connection.close();
      }
    }
  }

  /**
   * Replaces a user's credential hash and sets the mandatory-change flag.
   * Provisioning and resets pass mustChange = 'Y' (temporary credential);
   * a completed self-service change passes 'N'. Plaintext is never stored.
   */
  async setCredential(
    userId: string,
    passwordHash: string,
    mustChangePassword: 'Y' | 'N',
    conn?: oracledb.Connection
  ): Promise<void> {
    const shouldClose = !conn;
    const connection = conn || (await getOracleConnection());
    try {
      await connection.execute(
        `UPDATE APP_USERS
         SET PASSWORD_HASH = :passwordHash,
             MUST_CHANGE_PASSWORD = :mustChangePassword,
             PASSWORD_CHANGED_AT = CASE WHEN :mustChangePassword = 'N' THEN SYSTIMESTAMP ELSE PASSWORD_CHANGED_AT END,
             FAILED_LOGIN_ATTEMPTS = 0,
             LOCKED_UNTIL = NULL,
             UPDATED_AT = SYSTIMESTAMP
         WHERE USER_ID = :userId`,
        { userId, passwordHash, mustChangePassword },
        { autoCommit: shouldClose }
      );
    } finally {
      if (shouldClose) {
        await connection.close();
      }
    }
  }

  /**
   * Lists accounts holding any of the given roles, with role codes, location and session counts.
   */
  async listAccountsByRoles(params: {
    roleCodes: string[];
    search?: string;
    status?: 'Y' | 'N';
    role?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: ManagedAccountRecord[]; total: number; page: number; limit: number }> {
    const conn = await getOracleConnection();
    try {
      const page = Math.max(1, params.page || 1);
      const limit = Math.min(100, Math.max(1, params.limit || 25));
      const binds: Record<string, any> = {};
      const roleBinds = params.roleCodes.map((code, i) => {
        binds[`r${i}`] = code;
        return `:r${i}`;
      });
      const where: string[] = [
        `u.USER_ID IN (SELECT ur.USER_ID FROM USER_ROLES ur JOIN ROLES r ON r.ROLE_ID = ur.ROLE_ID WHERE r.CODE IN (${roleBinds.join(', ')}))`,
      ];
      if (params.role) {
        binds.roleFilter = params.role;
        where.push(
          `u.USER_ID IN (SELECT ur.USER_ID FROM USER_ROLES ur JOIN ROLES r ON r.ROLE_ID = ur.ROLE_ID WHERE r.CODE = :roleFilter)`
        );
      }
      if (params.userId) {
        binds.userId = params.userId;
        where.push('u.USER_ID = :userId');
      }
      if (params.status) {
        binds.status = params.status;
        where.push('u.IS_ACTIVE = :status');
      }
      if (params.search) {
        binds.search = `%${params.search.toLowerCase()}%`;
        where.push('(LOWER(u.USERNAME) LIKE :search OR LOWER(u.EMAIL) LIKE :search OR LOWER(u.FULL_NAME) LIKE :search)');
      }
      const whereSql = where.join(' AND ');
      const countRes = await conn.execute<any>(`SELECT COUNT(*) AS TOTAL FROM APP_USERS u WHERE ${whereSql}`, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      const total = Number(countRes.rows?.[0]?.TOTAL || 0);
      const listRes = await conn.execute<any>(
        `SELECT u.USER_ID, u.USERNAME, u.EMAIL, u.FULL_NAME, u.PHONE_NUMBER, u.LOCATION_ID,
                l.LOCATION_CODE, l.LOCATION_NAME,
                u.IS_ACTIVE, u.MUST_CHANGE_PASSWORD, u.LAST_LOGIN_AT, u.LOCKED_UNTIL, u.CREATED_AT,
                (SELECT LISTAGG(r.CODE, ',') WITHIN GROUP (ORDER BY r.CODE)
                   FROM USER_ROLES ur JOIN ROLES r ON r.ROLE_ID = ur.ROLE_ID
                  WHERE ur.USER_ID = u.USER_ID) AS ROLE_CODES,
                (SELECT COUNT(*) FROM USER_SESSIONS s
                  WHERE s.USER_ID = u.USER_ID AND s.REVOKED_AT IS NULL AND s.EXPIRES_AT > SYSTIMESTAMP) AS ACTIVE_SESSIONS
           FROM APP_USERS u
           LEFT JOIN LOCATIONS l ON l.LOCATION_ID = u.LOCATION_ID
          WHERE ${whereSql}
          ORDER BY u.CREATED_AT DESC
          OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
        { ...binds, offset: (page - 1) * limit, limit },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const items: ManagedAccountRecord[] = (listRes.rows || []).map((r: any) => ({
        userId: r.USER_ID,
        username: r.USERNAME,
        email: r.EMAIL,
        fullName: r.FULL_NAME,
        phoneNumber: r.PHONE_NUMBER || undefined,
        locationId: r.LOCATION_ID || undefined,
        locationCode: r.LOCATION_CODE || undefined,
        locationName: r.LOCATION_NAME || undefined,
        roles: r.ROLE_CODES ? String(r.ROLE_CODES).split(',') : [],
        isActive: r.IS_ACTIVE,
        mustChangePassword: r.MUST_CHANGE_PASSWORD === 'Y' ? 'Y' : 'N',
        lastLoginAt: r.LAST_LOGIN_AT ? new Date(r.LAST_LOGIN_AT) : undefined,
        lockedUntil: r.LOCKED_UNTIL ? new Date(r.LOCKED_UNTIL) : undefined,
        activeSessions: Number(r.ACTIVE_SESSIONS || 0),
        createdAt: new Date(r.CREATED_AT),
      }));
      return { items, total, page, limit };
    } finally {
      await conn.close();
    }
  }

  /**
   * Counts active accounts holding a role. Pass a connection to evaluate inside a transaction.
   */
  async countActiveUsersWithRole(roleCode: string, conn?: oracledb.Connection): Promise<number> {
    const shouldClose = !conn;
    const connection = conn || (await getOracleConnection());
    try {
      const res = await connection.execute<any>(
        `SELECT COUNT(*) AS C
           FROM APP_USERS u
           JOIN USER_ROLES ur ON ur.USER_ID = u.USER_ID
           JOIN ROLES r ON r.ROLE_ID = ur.ROLE_ID
          WHERE r.CODE = :roleCode AND u.IS_ACTIVE = 'Y'`,
        { roleCode },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return Number(res.rows?.[0]?.C || 0);
    } finally {
      if (shouldClose) {
        await connection.close();
      }
    }
  }

  async updateProfile(
    userId: string,
    data: { fullName?: string; email?: string; phoneNumber?: string | null; locationId?: string | null },
    conn?: oracledb.Connection
  ): Promise<void> {
    const sets: string[] = [];
    const binds: Record<string, any> = { userId };
    if (data.fullName !== undefined) {
      sets.push('FULL_NAME = :fullName');
      binds.fullName = data.fullName.trim();
    }
    if (data.email !== undefined) {
      sets.push('EMAIL = :email');
      binds.email = data.email.trim().toLowerCase();
    }
    if (data.phoneNumber !== undefined) {
      sets.push('PHONE_NUMBER = :phoneNumber');
      binds.phoneNumber = data.phoneNumber || null;
    }
    if (data.locationId !== undefined) {
      sets.push('LOCATION_ID = :locationId');
      binds.locationId = data.locationId || null;
    }
    if (sets.length === 0) return;
    const shouldClose = !conn;
    const connection = conn || (await getOracleConnection());
    try {
      await connection.execute(
        `UPDATE APP_USERS SET ${sets.join(', ')}, UPDATED_AT = SYSTIMESTAMP WHERE USER_ID = :userId`,
        binds,
        { autoCommit: shouldClose }
      );
    } finally {
      if (shouldClose) {
        await connection.close();
      }
    }
  }

  async findEngineersByLocation(locationId?: string): Promise<UserRecord[]> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      let whereLoc = '';
      if (locationId) {
        binds.locationId = locationId;
        whereLoc = 'AND u.LOCATION_ID = :locationId';
      }
      const sql = `
        SELECT 
          u.USER_ID, u.USERNAME, u.EMAIL, u.FULL_NAME, u.PASSWORD_HASH, u.PHONE_NUMBER, u.LOCATION_ID,
          u.IS_ACTIVE, u.FAILED_LOGIN_ATTEMPTS, u.LOCKED_UNTIL, u.LAST_LOGIN_AT,
          u.CREATED_AT, u.UPDATED_AT
        FROM APP_USERS u
        JOIN USER_ROLES ur ON u.USER_ID = ur.USER_ID
        JOIN ROLES r ON ur.ROLE_ID = r.ROLE_ID
        WHERE r.CODE = 'ENGINEER'
          ${whereLoc}
          AND u.IS_ACTIVE = 'Y'
        ORDER BY u.FULL_NAME ASC
      `;
      const result = await conn.execute<any>(
        sql,
        binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      return (result.rows || []).map(mapRowToUser);
    } finally {
      await conn.close();
    }
  }

  /**
   * Retrieves active, eligible field engineers across the network or filtered by location,
   * enriched with home Service Center metadata and authoritative open-job counts.
   */
  async findEligibleEngineers(locationId?: string): Promise<EligibleEngineerRecord[]> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      let whereLoc = '';
      if (locationId) {
        binds.locationId = locationId;
        whereLoc = 'AND u.LOCATION_ID = :locationId';
      }

      const sql = `
        SELECT 
          u.USER_ID,
          u.USERNAME,
          u.FULL_NAME,
          u.PHONE_NUMBER,
          u.EMAIL,
          u.IS_ACTIVE,
          u.LOCATION_ID AS HOME_LOCATION_ID,
          l.LOCATION_CODE AS HOME_LOCATION_CODE,
          l.LOCATION_NAME AS HOME_LOCATION_NAME,
          COALESCE(job_counts.OPEN_JOB_COUNT, 0) AS OPEN_JOB_COUNT
        FROM APP_USERS u
        JOIN USER_ROLES ur ON u.USER_ID = ur.USER_ID
        JOIN ROLES r ON ur.ROLE_ID = r.ROLE_ID
        LEFT JOIN LOCATIONS l ON u.LOCATION_ID = l.LOCATION_ID
        LEFT JOIN (
          SELECT ASSIGNED_ENGINEER_ID, COUNT(*) AS OPEN_JOB_COUNT
          FROM SERVICE_REQUESTS
          WHERE STATUS NOT IN ('CLOSED', 'CANCELLED', 'REPLACED')
            AND ASSIGNED_ENGINEER_ID IS NOT NULL
          GROUP BY ASSIGNED_ENGINEER_ID
        ) job_counts ON u.USER_ID = job_counts.ASSIGNED_ENGINEER_ID
        WHERE r.CODE = 'ENGINEER'
          AND u.IS_ACTIVE = 'Y'
          ${whereLoc}
        ORDER BY u.FULL_NAME ASC
      `;

      const result = await conn.execute<any>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (result.rows || []).map((row: any) => {
        const openJobCount = Number(row.OPEN_JOB_COUNT || 0);
        let availabilityStatus: 'AVAILABLE' | 'ACTIVE' | 'BUSY' = 'AVAILABLE';
        if (openJobCount >= 5) {
          availabilityStatus = 'BUSY';
        } else if (openJobCount > 0) {
          availabilityStatus = 'ACTIVE';
        }

        return {
          userId: row.USER_ID,
          username: row.USERNAME,
          fullName: row.FULL_NAME,
          phoneNumber: row.PHONE_NUMBER || undefined,
          email: row.EMAIL || undefined,
          isActive: row.IS_ACTIVE || 'Y',
          homeLocationId: row.HOME_LOCATION_ID || undefined,
          homeLocationCode: row.HOME_LOCATION_CODE || undefined,
          homeLocationName: row.HOME_LOCATION_NAME || undefined,
          openJobCount,
          availabilityStatus,
        };
      });
    } finally {
      await conn.close();
    }
  }

  async recordFailedAttempt(
    userId: string,
    currentAttempts: number,
    maxAttempts = 5,
    lockoutMinutes = 15
  ): Promise<void> {
    const conn = await getOracleConnection();
    try {
      const newAttempts = currentAttempts + 1;
      const shouldLock = newAttempts >= maxAttempts;

      const sql = shouldLock
        ? `
          UPDATE APP_USERS 
          SET 
            FAILED_LOGIN_ATTEMPTS = :newAttempts,
            LOCKED_UNTIL = SYSTIMESTAMP + NUMTODSINTERVAL(:lockoutMinutes, 'MINUTE'),
            UPDATED_AT = SYSTIMESTAMP
          WHERE USER_ID = :userId
        `
        : `
          UPDATE APP_USERS 
          SET 
            FAILED_LOGIN_ATTEMPTS = :newAttempts,
            UPDATED_AT = SYSTIMESTAMP
          WHERE USER_ID = :userId
        `;

      const binds: any = { userId, newAttempts };
      if (shouldLock) {
        binds.lockoutMinutes = lockoutMinutes;
      }

      await conn.execute(sql, binds, { autoCommit: true });
    } finally {
      await conn.close();
    }
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE APP_USERS
        SET 
          FAILED_LOGIN_ATTEMPTS = 0,
          LOCKED_UNTIL = NULL,
          LAST_LOGIN_AT = SYSTIMESTAMP,
          UPDATED_AT = SYSTIMESTAMP
        WHERE USER_ID = :userId
      `;
      await conn.execute(sql, { userId }, { autoCommit: true });
    } finally {
      await conn.close();
    }
  }

  async countUsers(): Promise<number> {
    const conn = await getOracleConnection();
    try {
      const result = await conn.execute<any>(
        'SELECT COUNT(*) AS CNT FROM APP_USERS',
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return Number(result.rows?.[0]?.CNT || 0);
    } finally {
      await conn.close();
    }
  }
  async updatePassword(userId: string, passwordHash: string, conn?: oracledb.Connection): Promise<void> {
    const shouldClose = !conn;
    const connection = conn || (await getOracleConnection());
    try {
      const sql = `
        UPDATE APP_USERS
        SET 
          PASSWORD_HASH = :passwordHash,
          UPDATED_AT = SYSTIMESTAMP
        WHERE USER_ID = :userId
      `;
      await connection.execute(sql, { userId, passwordHash }, { autoCommit: shouldClose });
    } finally {
      if (shouldClose) {
        await connection.close();
      }
    }
  }

  async setUserActive(userId: string, isActive: 'Y' | 'N', conn?: oracledb.Connection): Promise<void> {
    const shouldClose = !conn;
    const connection = conn || (await getOracleConnection());
    try {
      const sql = `
        UPDATE APP_USERS
        SET 
          IS_ACTIVE = :isActive,
          UPDATED_AT = SYSTIMESTAMP
        WHERE USER_ID = :userId
      `;
      await connection.execute(sql, { userId, isActive }, { autoCommit: shouldClose });
    } finally {
      if (shouldClose) {
        await connection.close();
      }
    }
  }

  async updateUserLocation(userId: string, locationId: string, conn?: oracledb.Connection): Promise<void> {
    const shouldClose = !conn;
    const connection = conn || (await getOracleConnection());
    try {
      const sql = `
        UPDATE APP_USERS
        SET 
          LOCATION_ID = :locationId,
          UPDATED_AT = SYSTIMESTAMP
        WHERE USER_ID = :userId
      `;
      await connection.execute(sql, { userId, locationId }, { autoCommit: shouldClose });
    } finally {
      if (shouldClose) {
        await connection.close();
      }
    }
  }

  async findEngineersForAdmin(params: AdminEngineerQueryParams): Promise<AdminEngineerListResult> {
    const conn = await getOracleConnection();
    try {
      const page = params.page && params.page > 0 ? params.page : 1;
      const limit = params.limit && params.limit > 0 ? params.limit : 20;
      const offset = (page - 1) * limit;

      const whereClauses = ["r.CODE = 'ENGINEER'"];
      const binds: Record<string, any> = {};

      if (params.status === 'ACTIVE') {
        whereClauses.push("u.IS_ACTIVE = 'Y'");
      } else if (params.status === 'INACTIVE') {
        whereClauses.push("u.IS_ACTIVE = 'N'");
      }

      if (params.locationId) {
        whereClauses.push('u.LOCATION_ID = :locationId');
        binds.locationId = params.locationId;
      }

      if (params.q) {
        whereClauses.push(
          '(LOWER(u.FULL_NAME) LIKE :search OR LOWER(u.USERNAME) LIKE :search OR LOWER(u.EMAIL) LIKE :search OR u.PHONE_NUMBER LIKE :search)'
        );
        binds.search = `%${params.q.trim().toLowerCase()}%`;
      }

      const whereSql = whereClauses.join(' AND ');

      // Count query
      const countSql = `
        SELECT COUNT(DISTINCT u.USER_ID) AS TOTAL
        FROM APP_USERS u
        JOIN USER_ROLES ur ON u.USER_ID = ur.USER_ID
        JOIN ROLES r ON ur.ROLE_ID = r.ROLE_ID
        WHERE ${whereSql}
      `;
      const countResult = await conn.execute<any>(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const total = Number(countResult.rows?.[0]?.TOTAL || 0);

      // Data query with openJobCount
      const queryBinds = { ...binds, offset, limit };
      const dataSql = `
        SELECT 
          u.USER_ID,
          u.USERNAME,
          u.FULL_NAME,
          u.PHONE_NUMBER,
          u.EMAIL,
          u.IS_ACTIVE,
          u.LOCATION_ID AS HOME_LOCATION_ID,
          l.LOCATION_CODE AS HOME_LOCATION_CODE,
          l.LOCATION_NAME AS HOME_LOCATION_NAME,
          COALESCE(job_counts.OPEN_JOB_COUNT, 0) AS OPEN_JOB_COUNT,
          u.CREATED_AT,
          u.LAST_LOGIN_AT
        FROM APP_USERS u
        JOIN USER_ROLES ur ON u.USER_ID = ur.USER_ID
        JOIN ROLES r ON ur.ROLE_ID = r.ROLE_ID
        LEFT JOIN LOCATIONS l ON u.LOCATION_ID = l.LOCATION_ID
        LEFT JOIN (
          SELECT ASSIGNED_ENGINEER_ID, COUNT(*) AS OPEN_JOB_COUNT
          FROM SERVICE_REQUESTS
          WHERE STATUS NOT IN ('CLOSED', 'CANCELLED', 'REPLACED')
            AND ASSIGNED_ENGINEER_ID IS NOT NULL
          GROUP BY ASSIGNED_ENGINEER_ID
        ) job_counts ON u.USER_ID = job_counts.ASSIGNED_ENGINEER_ID
        WHERE ${whereSql}
        ORDER BY u.FULL_NAME ASC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, queryBinds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const engineers: AdminEngineerRecord[] = (dataResult.rows || []).map((row: any) => ({
        userId: row.USER_ID,
        username: row.USERNAME,
        fullName: row.FULL_NAME,
        phoneNumber: row.PHONE_NUMBER || undefined,
        email: row.EMAIL || undefined,
        isActive: row.IS_ACTIVE as 'Y' | 'N',
        homeLocationId: row.HOME_LOCATION_ID || undefined,
        homeLocationCode: row.HOME_LOCATION_CODE || undefined,
        homeLocationName: row.HOME_LOCATION_NAME || undefined,
        openJobCount: Number(row.OPEN_JOB_COUNT || 0),
        createdAt: new Date(row.CREATED_AT),
        lastLoginAt: row.LAST_LOGIN_AT ? new Date(row.LAST_LOGIN_AT) : undefined,
      }));

      return {
        engineers,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    } finally {
      await conn.close();
    }
  }

  async deleteUser(userId: string): Promise<void> {
    const conn = await getOracleConnection();
    try {
      // Clean up user sessions first
      await conn.execute('DELETE FROM USER_SESSIONS WHERE USER_ID = :userId', { userId });
      // Clean up role assignments
      await conn.execute('DELETE FROM USER_ROLES WHERE USER_ID = :userId', { userId });
      // Delete user
      await conn.execute('DELETE FROM APP_USERS WHERE USER_ID = :userId', { userId }, { autoCommit: true });
    } finally {
      await conn.close();
    }
  }
}

export const userRepository = new UserRepository();
