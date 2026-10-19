import oracledb from 'oracledb';
import { UserRecord } from '../../types/auth.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToUser(row: any): UserRecord {
  return {
    userId: row.USER_ID,
    username: row.USERNAME,
    email: row.EMAIL,
    fullName: row.FULL_NAME,
    passwordHash: row.PASSWORD_HASH,
    phoneNumber: row.PHONE_NUMBER || undefined,
    isActive: row.IS_ACTIVE as 'Y' | 'N',
    failedLoginAttempts: Number(row.FAILED_LOGIN_ATTEMPTS || 0),
    lockedUntil: row.LOCKED_UNTIL ? new Date(row.LOCKED_UNTIL) : undefined,
    lastLoginAt: row.LAST_LOGIN_AT ? new Date(row.LAST_LOGIN_AT) : undefined,
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
          USER_ID, USERNAME, EMAIL, FULL_NAME, PASSWORD_HASH, PHONE_NUMBER,
          IS_ACTIVE, FAILED_LOGIN_ATTEMPTS, LOCKED_UNTIL, LAST_LOGIN_AT,
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
          USER_ID, USERNAME, EMAIL, FULL_NAME, PASSWORD_HASH, PHONE_NUMBER,
          IS_ACTIVE, FAILED_LOGIN_ATTEMPTS, LOCKED_UNTIL, LAST_LOGIN_AT,
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
  }): Promise<void> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        INSERT INTO APP_USERS (
          USER_ID, USERNAME, EMAIL, FULL_NAME, PASSWORD_HASH, PHONE_NUMBER,
          IS_ACTIVE, FAILED_LOGIN_ATTEMPTS, CREATED_AT, UPDATED_AT
        ) VALUES (
          :userId, :username, :email, :fullName, :passwordHash, :phoneNumber,
          'Y', 0, SYSTIMESTAMP, SYSTIMESTAMP
        )
      `;
      await conn.execute(
        sql,
        {
          userId: data.userId,
          username: data.username.toLowerCase().trim(),
          email: data.email.toLowerCase().trim(),
          fullName: data.fullName.trim(),
          passwordHash: data.passwordHash,
          phoneNumber: data.phoneNumber || null,
        },
        { autoCommit: true }
      );
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
  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE APP_USERS
        SET 
          PASSWORD_HASH = :passwordHash,
          UPDATED_AT = SYSTIMESTAMP
        WHERE USER_ID = :userId
      `;
      await conn.execute(sql, { userId, passwordHash }, { autoCommit: true });
    } finally {
      await conn.close();
    }
  }

  async setUserActive(userId: string, isActive: 'Y' | 'N'): Promise<void> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE APP_USERS
        SET 
          IS_ACTIVE = :isActive,
          UPDATED_AT = SYSTIMESTAMP
        WHERE USER_ID = :userId
      `;
      await conn.execute(sql, { userId, isActive }, { autoCommit: true });
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
