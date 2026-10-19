import oracledb from 'oracledb';
import { UserSessionRecord } from '../../types/auth.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToSession(row: any): UserSessionRecord {
  return {
    sessionId: row.SESSION_ID,
    userId: row.USER_ID,
    sessionTokenHash: row.SESSION_TOKEN_HASH,
    csrfToken: row.CSRF_TOKEN,
    ipAddress: row.IP_ADDRESS || undefined,
    userAgent: row.USER_AGENT || undefined,
    expiresAt: new Date(row.EXPIRES_AT),
    revokedAt: row.REVOKED_AT ? new Date(row.REVOKED_AT) : undefined,
    lastActiveAt: new Date(row.LAST_ACTIVE_AT),
    createdAt: new Date(row.CREATED_AT),
  };
}

export class SessionRepository {
  async createSession(data: {
    sessionId: string;
    userId: string;
    sessionTokenHash: string;
    csrfToken: string;
    ipAddress?: string;
    userAgent?: string;
    expiresAt: Date;
  }): Promise<void> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        INSERT INTO USER_SESSIONS (
          SESSION_ID, USER_ID, SESSION_TOKEN_HASH, CSRF_TOKEN,
          IP_ADDRESS, USER_AGENT, EXPIRES_AT, LAST_ACTIVE_AT, CREATED_AT
        ) VALUES (
          :sessionId, :userId, :sessionTokenHash, :csrfToken,
          :ipAddress, :userAgent, :expiresAt, SYSTIMESTAMP, SYSTIMESTAMP
        )
      `;
      await conn.execute(
        sql,
        {
          sessionId: data.sessionId,
          userId: data.userId,
          sessionTokenHash: data.sessionTokenHash,
          csrfToken: data.csrfToken,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent ? data.userAgent.slice(0, 255) : null,
          expiresAt: data.expiresAt,
        },
        { autoCommit: true }
      );
    } finally {
      await conn.close();
    }
  }

  async findActiveSession(sessionTokenHash: string): Promise<UserSessionRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT 
          SESSION_ID, USER_ID, SESSION_TOKEN_HASH, CSRF_TOKEN,
          IP_ADDRESS, USER_AGENT, EXPIRES_AT, REVOKED_AT,
          LAST_ACTIVE_AT, CREATED_AT
        FROM USER_SESSIONS
        WHERE SESSION_TOKEN_HASH = :sessionTokenHash
          AND REVOKED_AT IS NULL
          AND EXPIRES_AT > SYSTIMESTAMP
      `;
      const result = await conn.execute<any>(
        sql,
        { sessionTokenHash },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      return mapRowToSession(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async touchSession(sessionId: string): Promise<void> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE USER_SESSIONS
        SET LAST_ACTIVE_AT = SYSTIMESTAMP
        WHERE SESSION_ID = :sessionId
      `;
      await conn.execute(sql, { sessionId }, { autoCommit: true });
    } finally {
      await conn.close();
    }
  }

  async revokeSession(sessionTokenHash: string): Promise<void> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE USER_SESSIONS
        SET REVOKED_AT = SYSTIMESTAMP
        WHERE SESSION_TOKEN_HASH = :sessionTokenHash
          AND REVOKED_AT IS NULL
      `;
      await conn.execute(sql, { sessionTokenHash }, { autoCommit: true });
    } finally {
      await conn.close();
    }
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE USER_SESSIONS
        SET REVOKED_AT = SYSTIMESTAMP
        WHERE USER_ID = :userId
          AND REVOKED_AT IS NULL
      `;
      await conn.execute(sql, { userId }, { autoCommit: true });
    } finally {
      await conn.close();
    }
  }
}

export const sessionRepository = new SessionRepository();
