import crypto from 'crypto';
import oracledb from 'oracledb';
import { CatalogAuditRecord } from '../../types/catalog.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToAudit(row: any): CatalogAuditRecord {
  return {
    auditId: row.AUDIT_ID,
    entityName: row.ENTITY_NAME,
    entityId: row.ENTITY_ID,
    action: row.ACTION,
    performedBy: row.PERFORMED_BY,
    performedByUsername: row.PERFORMED_BY_USERNAME,
    changesJson: row.CHANGES_JSON || undefined,
    ipAddress: row.IP_ADDRESS || undefined,
    userAgent: row.USER_AGENT || undefined,
    createdAt: new Date(row.CREATED_AT),
  };
}

export class AuditRepository {
  async recordCatalogAudit(
    data: {
      entityName: CatalogAuditRecord['entityName'];
      entityId: string;
      action: 'CREATE' | 'UPDATE' | 'ACTIVATE' | 'DEACTIVATE';
      performedBy: string;
      performedByUsername: string;
      changes?: Record<string, any>;
      ipAddress?: string;
      userAgent?: string;
    },
    externalConn?: oracledb.Connection
  ): Promise<void> {
    const conn = externalConn || (await getOracleConnection());
    try {
      const auditId = crypto.randomUUID();
      const changesJson = data.changes ? JSON.stringify(data.changes) : null;

      const sql = `
        INSERT INTO CATALOG_AUDIT_LOGS (
          AUDIT_ID, ENTITY_NAME, ENTITY_ID, ACTION,
          PERFORMED_BY, PERFORMED_BY_USERNAME, CHANGES_JSON,
          IP_ADDRESS, USER_AGENT, CREATED_AT
        ) VALUES (
          :auditId, :entityName, :entityId, :action,
          :performedBy, :performedByUsername, :changesJson,
          :ipAddress, :userAgent, SYSTIMESTAMP
        )
      `;

      await conn.execute(
        sql,
        {
          auditId,
          entityName: data.entityName,
          entityId: data.entityId,
          action: data.action,
          performedBy: data.performedBy,
          performedByUsername: data.performedByUsername,
          changesJson,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent ? data.userAgent.slice(0, 255) : null,
        },
        { autoCommit: !externalConn }
      );
    } finally {
      if (!externalConn) {
        await conn.close();
      }
    }
  }

  async listRecentAudits(options?: {
    entityName?: CatalogAuditRecord['entityName'];
    entityId?: string;
    limit?: number;
  }): Promise<CatalogAuditRecord[]> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options?.entityName) {
        binds.entityName = options.entityName;
        whereClauses.push('ENTITY_NAME = :entityName');
      }
      if (options?.entityId) {
        binds.entityId = options.entityId;
        whereClauses.push('ENTITY_ID = :entityId');
      }

      const limit = Math.min(100, Math.max(1, options?.limit || 50));
      binds.limit = limit;

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const sql = `
        SELECT AUDIT_ID, ENTITY_NAME, ENTITY_ID, ACTION,
               PERFORMED_BY, PERFORMED_BY_USERNAME, CHANGES_JSON,
               IP_ADDRESS, USER_AGENT, CREATED_AT
        FROM CATALOG_AUDIT_LOGS
        ${whereSql}
        ORDER BY CREATED_AT DESC
        FETCH FIRST :limit ROWS ONLY
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
}

export const auditRepository = new AuditRepository();
