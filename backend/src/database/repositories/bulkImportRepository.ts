import oracledb from 'oracledb';
import { BulkImportJobRecord, BulkImportStatus } from '../../types/bulkImport.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToJob(row: any): BulkImportJobRecord {
  return {
    jobId: row.JOB_ID,
    entityType: row.ENTITY_TYPE,
    importMode: row.IMPORT_MODE,
    status: row.STATUS,
    fileName: row.FILE_NAME,
    fileChecksum: row.FILE_CHECKSUM,
    templateVersion: row.TEMPLATE_VERSION,
    totalRows: Number(row.TOTAL_ROWS || 0),
    validRows: Number(row.VALID_ROWS || 0),
    invalidRows: Number(row.INVALID_ROWS || 0),
    createRows: Number(row.CREATE_ROWS || 0),
    updateRows: Number(row.UPDATE_ROWS || 0),
    unchangedRows: Number(row.UNCHANGED_ROWS || 0),
    conflictRows: Number(row.CONFLICT_ROWS || 0),
    previewPayload: row.PREVIEW_PAYLOAD || undefined,
    resultPayload: row.RESULT_PAYLOAD || undefined,
    errorSummary: row.ERROR_SUMMARY || undefined,
    committedAt: row.COMMITTED_AT ? new Date(row.COMMITTED_AT) : undefined,
    createdBy: row.CREATED_BY,
    createdByUsername: row.CREATED_BY_USERNAME,
    createdAt: new Date(row.CREATED_AT),
    updatedAt: new Date(row.UPDATED_AT),
  };
}

export class BulkImportRepository {
  async createJob(job: BulkImportJobRecord, externalConn?: oracledb.Connection): Promise<void> {
    const conn = externalConn || (await getOracleConnection());
    try {
      const sql = `
        INSERT INTO BULK_IMPORT_JOBS (
          JOB_ID, ENTITY_TYPE, IMPORT_MODE, STATUS, FILE_NAME, FILE_CHECKSUM,
          TEMPLATE_VERSION, TOTAL_ROWS, VALID_ROWS, INVALID_ROWS, CREATE_ROWS,
          UPDATE_ROWS, UNCHANGED_ROWS, CONFLICT_ROWS, PREVIEW_PAYLOAD, RESULT_PAYLOAD,
          ERROR_SUMMARY, COMMITTED_AT, CREATED_BY, CREATED_BY_USERNAME,
          CREATED_AT, UPDATED_AT
        ) VALUES (
          :jobId, :entityType, :importMode, :status, :fileName, :fileChecksum,
          :templateVersion, :totalRows, :validRows, :invalidRows, :createRows,
          :updateRows, :unchangedRows, :conflictRows, :previewPayload, :resultPayload,
          :errorSummary, :committedAt, :createdBy, :createdByUsername,
          SYSTIMESTAMP, SYSTIMESTAMP
        )
      `;

      await conn.execute(
        sql,
        {
          jobId: job.jobId,
          entityType: job.entityType,
          importMode: job.importMode,
          status: job.status,
          fileName: job.fileName,
          fileChecksum: job.fileChecksum,
          templateVersion: job.templateVersion,
          totalRows: job.totalRows,
          validRows: job.validRows,
          invalidRows: job.invalidRows,
          createRows: job.createRows,
          updateRows: job.updateRows,
          unchangedRows: job.unchangedRows,
          conflictRows: job.conflictRows,
          previewPayload: job.previewPayload || null,
          resultPayload: job.resultPayload || null,
          errorSummary: job.errorSummary || null,
          committedAt: job.committedAt || null,
          createdBy: job.createdBy,
          createdByUsername: job.createdByUsername,
        },
        { autoCommit: !externalConn }
      );
    } finally {
      if (!externalConn) {
        await conn.close();
      }
    }
  }

  async findById(jobId: string, externalConn?: oracledb.Connection): Promise<BulkImportJobRecord | null> {
    const conn = externalConn || (await getOracleConnection());
    try {
      const sql = `
        SELECT JOB_ID, ENTITY_TYPE, IMPORT_MODE, STATUS, FILE_NAME, FILE_CHECKSUM,
               TEMPLATE_VERSION, TOTAL_ROWS, VALID_ROWS, INVALID_ROWS, CREATE_ROWS,
               UPDATE_ROWS, UNCHANGED_ROWS, CONFLICT_ROWS, PREVIEW_PAYLOAD, RESULT_PAYLOAD,
               ERROR_SUMMARY, COMMITTED_AT, CREATED_BY, CREATED_BY_USERNAME,
               CREATED_AT, UPDATED_AT
        FROM BULK_IMPORT_JOBS
        WHERE JOB_ID = :jobId
      `;

      const result = await conn.execute<any>(
        sql,
        { jobId },
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          fetchInfo: {
            PREVIEW_PAYLOAD: { type: oracledb.STRING },
            RESULT_PAYLOAD: { type: oracledb.STRING },
          },
        }
      );

      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToJob(result.rows[0]);
    } finally {
      if (!externalConn) {
        await conn.close();
      }
    }
  }

  async updateJob(
    jobId: string,
    updates: {
      status?: BulkImportStatus;
      resultPayload?: string;
      errorSummary?: string;
      committedAt?: Date;
    },
    externalConn?: oracledb.Connection
  ): Promise<void> {
    const conn = externalConn || (await getOracleConnection());
    try {
      const setClauses: string[] = ['UPDATED_AT = SYSTIMESTAMP'];
      const binds: Record<string, any> = { jobId };

      if (updates.status !== undefined) {
        setClauses.push('STATUS = :status');
        binds.status = updates.status;
      }
      if (updates.resultPayload !== undefined) {
        setClauses.push('RESULT_PAYLOAD = :resultPayload');
        binds.resultPayload = updates.resultPayload;
      }
      if (updates.errorSummary !== undefined) {
        setClauses.push('ERROR_SUMMARY = :errorSummary');
        binds.errorSummary = updates.errorSummary;
      }
      if (updates.committedAt !== undefined) {
        setClauses.push('COMMITTED_AT = :committedAt');
        binds.committedAt = updates.committedAt;
      }

      const sql = `
        UPDATE BULK_IMPORT_JOBS
        SET ${setClauses.join(', ')}
        WHERE JOB_ID = :jobId
      `;

      await conn.execute(sql, binds, { autoCommit: !externalConn });
    } finally {
      if (!externalConn) {
        await conn.close();
      }
    }
  }

  async countActiveJobsForUser(userId: string): Promise<number> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT COUNT(*) as CNT
        FROM BULK_IMPORT_JOBS
        WHERE CREATED_BY = :userId
          AND STATUS = 'COMMITTING'
      `;
      const result = await conn.execute<any>(sql, { userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return Number(result.rows?.[0]?.CNT || 0);
    } finally {
      await conn.close();
    }
  }

  async listRecentJobs(options?: {
    userId?: string;
    entityType?: string;
    limit?: number;
  }): Promise<BulkImportJobRecord[]> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options?.userId) {
        binds.userId = options.userId;
        whereClauses.push('CREATED_BY = :userId');
      }
      if (options?.entityType) {
        binds.entityType = options.entityType;
        whereClauses.push('ENTITY_TYPE = :entityType');
      }

      const limit = Math.min(100, Math.max(1, options?.limit || 20));
      binds.limit = limit;

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const sql = `
        SELECT JOB_ID, ENTITY_TYPE, IMPORT_MODE, STATUS, FILE_NAME, FILE_CHECKSUM,
               TEMPLATE_VERSION, TOTAL_ROWS, VALID_ROWS, INVALID_ROWS, CREATE_ROWS,
               UPDATE_ROWS, UNCHANGED_ROWS, CONFLICT_ROWS, ERROR_SUMMARY,
               COMMITTED_AT, CREATED_BY, CREATED_BY_USERNAME, CREATED_AT, UPDATED_AT
        FROM BULK_IMPORT_JOBS
        ${whereSql}
        ORDER BY CREATED_AT DESC
        FETCH FIRST :limit ROWS ONLY
      `;

      const result = await conn.execute<any>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (result.rows || []).map(mapRowToJob);
    } finally {
      await conn.close();
    }
  }
}

export const bulkImportRepository = new BulkImportRepository();
