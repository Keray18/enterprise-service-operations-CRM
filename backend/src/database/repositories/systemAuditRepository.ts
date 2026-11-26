import crypto from 'crypto';
import oracledb from 'oracledb';
import { getOracleConnection } from '../oraclePool.js';
import { logger } from '../../logging/logger.js';
import {
  CreateSystemAuditInput,
  SystemAuditQueryOptions,
  SystemAuditRecord,
} from '../../types/systemAudit.js';

const SENSITIVE_KEY_REGEX = /password|hash|token|secret|otp|cookie|authorization|credential/i;

function redactSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }
  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = redactSensitiveData(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

function mapRowToAudit(row: any): SystemAuditRecord {
  let changes: Record<string, any> | undefined;
  if (row.CHANGES_JSON) {
    try {
      changes = typeof row.CHANGES_JSON === 'string' ? JSON.parse(row.CHANGES_JSON) : row.CHANGES_JSON;
    } catch {
      changes = undefined;
    }
  }

  return {
    eventId: row.EVENT_ID,
    actorId: row.ACTOR_ID || null,
    actorRole: row.ACTOR_ROLE || null,
    actorUsername: row.ACTOR_USERNAME || null,
    action: row.ACTION,
    resource: row.TARGET_RESOURCE,
    recordIdentifier: row.RECORD_IDENTIFIER || null,
    outcome: row.OUTCOME,
    correlationId: row.CORRELATION_ID || null,
    changesJson: typeof row.CHANGES_JSON === 'string' ? row.CHANGES_JSON : undefined,
    changes,
    justification: row.JUSTIFICATION || undefined,
    ipAddress: row.IP_ADDRESS || undefined,
    userAgent: row.USER_AGENT || undefined,
    createdAt: new Date(row.CREATED_AT),
  };
}

export class SystemAuditRepository {
  async recordEvent(
    data: CreateSystemAuditInput,
    externalConn?: oracledb.Connection
  ): Promise<string> {
    const shouldClose = !externalConn;
    const conn = externalConn || (await getOracleConnection());
    const eventId = crypto.randomUUID();

    try {
      const sanitizedChanges = data.changes ? redactSensitiveData(data.changes) : null;
      const changesJson = sanitizedChanges ? JSON.stringify(sanitizedChanges) : null;

      const sql = `
        INSERT INTO SYSTEM_AUDIT_LOGS (
          EVENT_ID, ACTOR_ID, ACTOR_ROLE, ACTOR_USERNAME,
          ACTION, TARGET_RESOURCE, RECORD_IDENTIFIER, OUTCOME,
          CORRELATION_ID, CHANGES_JSON, JUSTIFICATION,
          IP_ADDRESS, USER_AGENT, CREATED_AT
        ) VALUES (
          :eventId, :actorId, :actorRole, :actorUsername,
          :action, :targetResource, :recordIdentifier, :outcome,
          :correlationId, :changesJson, :justification,
          :ipAddress, :userAgent, SYSTIMESTAMP
        )
      `;

      await conn.execute(
        sql,
        {
          eventId,
          actorId: data.actorId || null,
          actorRole: data.actorRole || null,
          actorUsername: data.actorUsername || null,
          action: data.action,
          targetResource: data.resource,
          recordIdentifier: data.recordIdentifier || null,
          outcome: data.outcome,
          correlationId: data.correlationId || null,
          changesJson,
          justification: data.justification ? data.justification.slice(0, 1000) : null,
          ipAddress: data.ipAddress ? data.ipAddress.slice(0, 45) : null,
          userAgent: data.userAgent ? data.userAgent.slice(0, 255) : null,
        },
        { autoCommit: shouldClose }
      );

      return eventId;
    } catch (err) {
      logger.error('Failed to insert system audit log', {
        error: err instanceof Error ? err.message : String(err),
        action: data.action,
        resource: data.resource,
      });
      // When externalConn is provided, the audit write is part of an atomic transaction;
      // rethrow so the outer transaction rolls back, preventing unaudited state mutation.
      if (externalConn) {
        throw new Error(
          `Transactional audit failure for ${data.action} on ${data.resource}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
      return eventId;
    } finally {
      if (shouldClose) {
        await conn.close();
      }
    }
  }

  async queryLogs(options: SystemAuditQueryOptions = {}): Promise<SystemAuditRecord[]> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const where: string[] = [];

      if (options.actorId) {
        binds.actorId = options.actorId;
        where.push('ACTOR_ID = :actorId');
      }
      if (options.actorRole) {
        binds.actorRole = options.actorRole;
        where.push('ACTOR_ROLE = :actorRole');
      }
      if (options.action) {
        binds.action = options.action;
        where.push('ACTION = :action');
      }
      if (options.resource) {
        binds.targetResource = options.resource;
        where.push('TARGET_RESOURCE = :targetResource');
      }
      if (options.outcome) {
        binds.outcome = options.outcome;
        where.push('OUTCOME = :outcome');
      }
      if (options.correlationId) {
        binds.correlationId = options.correlationId;
        where.push('CORRELATION_ID = :correlationId');
      }
      if (options.startDate) {
        binds.startDate = new Date(options.startDate);
        where.push('CREATED_AT >= :startDate');
      }
      if (options.endDate) {
        binds.endDate = new Date(options.endDate);
        where.push('CREATED_AT <= :endDate');
      }
      if (options.search) {
        binds.search = `%${options.search.toUpperCase()}%`;
        where.push('(UPPER(ACTOR_USERNAME) LIKE :search OR UPPER(RECORD_IDENTIFIER) LIKE :search OR UPPER(ACTION) LIKE :search OR UPPER(TARGET_RESOURCE) LIKE :search)');
      }

      const limit = Math.min(200, Math.max(1, options.limit || 50));
      const page = Math.max(1, options.page || 1);
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

      const sql = `
        SELECT EVENT_ID, ACTOR_ID, ACTOR_ROLE, ACTOR_USERNAME,
               ACTION, TARGET_RESOURCE, RECORD_IDENTIFIER, OUTCOME,
               CORRELATION_ID, CHANGES_JSON, JUSTIFICATION,
               IP_ADDRESS, USER_AGENT, CREATED_AT
        FROM SYSTEM_AUDIT_LOGS
        ${whereSql}
        ORDER BY CREATED_AT DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const result = await conn.execute<any>(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: { CHANGES_JSON: { type: oracledb.STRING } },
      });

      return (result.rows || []).map(mapRowToAudit);
    } finally {
      await conn.close();
    }
  }

  async countLogs(options: SystemAuditQueryOptions = {}): Promise<number> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const where: string[] = [];

      if (options.actorId) {
        binds.actorId = options.actorId;
        where.push('ACTOR_ID = :actorId');
      }
      if (options.actorRole) {
        binds.actorRole = options.actorRole;
        where.push('ACTOR_ROLE = :actorRole');
      }
      if (options.action) {
        binds.action = options.action;
        where.push('ACTION = :action');
      }
      if (options.resource) {
        binds.targetResource = options.resource;
        where.push('TARGET_RESOURCE = :targetResource');
      }
      if (options.outcome) {
        binds.outcome = options.outcome;
        where.push('OUTCOME = :outcome');
      }
      if (options.correlationId) {
        binds.correlationId = options.correlationId;
        where.push('CORRELATION_ID = :correlationId');
      }
      if (options.startDate) {
        binds.startDate = new Date(options.startDate);
        where.push('CREATED_AT >= :startDate');
      }
      if (options.endDate) {
        binds.endDate = new Date(options.endDate);
        where.push('CREATED_AT <= :endDate');
      }
      if (options.search) {
        binds.search = `%${options.search.toUpperCase()}%`;
        where.push('(UPPER(ACTOR_USERNAME) LIKE :search OR UPPER(RECORD_IDENTIFIER) LIKE :search OR UPPER(ACTION) LIKE :search OR UPPER(TARGET_RESOURCE) LIKE :search)');
      }

      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const sql = `SELECT COUNT(*) AS TOTAL FROM SYSTEM_AUDIT_LOGS ${whereSql}`;

      const result = await conn.execute<any>(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      return Number(result.rows?.[0]?.TOTAL || 0);
    } finally {
      await conn.close();
    }
  }

  async getAuditStats(): Promise<{
    totalEvents: number;
    failureEvents: number;
    eventsToday: number;
    recentActions: Array<{ action: string; count: number }>;
  }> {
    const conn = await getOracleConnection();
    try {
      const sqlTotals = `
        SELECT 
          COUNT(*) AS TOTAL_EVENTS,
          COUNT(CASE WHEN OUTCOME = 'FAILURE' THEN 1 END) AS FAILURE_EVENTS,
          COUNT(CASE WHEN CREATED_AT >= TRUNC(SYSDATE) THEN 1 END) AS EVENTS_TODAY
        FROM SYSTEM_AUDIT_LOGS
      `;

      const totalsResult = await conn.execute<any>(sqlTotals, {}, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      const totalsRow = totalsResult.rows?.[0] || {};

      const sqlActions = `
        SELECT ACTION, COUNT(*) AS ACTION_COUNT
        FROM SYSTEM_AUDIT_LOGS
        GROUP BY ACTION
        ORDER BY ACTION_COUNT DESC
        FETCH FIRST 5 ROWS ONLY
      `;

      const actionsResult = await conn.execute<any>(sqlActions, {}, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      return {
        totalEvents: Number(totalsRow.TOTAL_EVENTS || 0),
        failureEvents: Number(totalsRow.FAILURE_EVENTS || 0),
        eventsToday: Number(totalsRow.EVENTS_TODAY || 0),
        recentActions: (actionsResult.rows || []).map((r: any) => ({
          action: String(r.ACTION),
          count: Number(r.ACTION_COUNT),
        })),
      };
    } finally {
      await conn.close();
    }
  }
}

export const systemAuditRepository = new SystemAuditRepository();
