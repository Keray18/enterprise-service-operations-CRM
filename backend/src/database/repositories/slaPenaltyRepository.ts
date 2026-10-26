import crypto from 'crypto';
import oracledb from 'oracledb';
import { PenaltyBreachType, PenaltyStatus, SlaPenaltyRecord } from '../../types/finance.js';
import { getOracleConnection } from '../oraclePool.js';

export class SlaPenaltyRepository {
  async recordBreach(
    data: {
      serviceRequestId: string;
      asfLocationId: string;
      breachType: PenaltyBreachType;
      breachTimestamp: Date;
      calculatedAmount: number;
      policyVersion?: string;
      configStatus?: 'AWAITING_POLICY_CONFIGURATION' | 'CONFIGURED' | 'EXEMPT';
      elapsedHours?: number;
      thresholdHours?: number;
    },
    conn?: oracledb.Connection
  ): Promise<SlaPenaltyRecord> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      // Check if breach record already exists for this ticket & breach type
      const checkSql = `
        SELECT PENALTY_ID FROM SLA_PENALTY_RECORDS
        WHERE SERVICE_REQUEST_ID = :serviceRequestId
          AND BREACH_TYPE = :breachType
      `;
      const checkRes = await connection.execute<any>(
        checkSql,
        { serviceRequestId: data.serviceRequestId, breachType: data.breachType },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (checkRes.rows && checkRes.rows.length > 0) {
        const existing = await this.getPenaltyById(checkRes.rows[0].PENALTY_ID, connection);
        if (existing) return existing;
      }

      const penaltyId = crypto.randomUUID();
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randPart = crypto.randomBytes(3).toString('hex').toUpperCase();
      const penaltyNumber = `PEN-${dateStr}-${randPart}`;

      const policyVersion = data.policyVersion || 'UNCONFIGURED';
      const configStatus = data.configStatus || 'AWAITING_POLICY_CONFIGURATION';

      const sql = `
        INSERT INTO SLA_PENALTY_RECORDS (
          PENALTY_ID,
          PENALTY_NUMBER,
          SERVICE_REQUEST_ID,
          ASF_LOCATION_ID,
          BREACH_TYPE,
          BREACH_TIMESTAMP,
          CALCULATED_AMOUNT,
          STATUS,
          POLICY_VERSION,
          CONFIG_STATUS,
          ELAPSED_HOURS,
          THRESHOLD_HOURS,
          CREATED_AT
        ) VALUES (
          :penaltyId,
          :penaltyNumber,
          :serviceRequestId,
          :asfLocationId,
          :breachType,
          :breachTimestamp,
          :calculatedAmount,
          'PENDING_REVIEW',
          :policyVersion,
          :configStatus,
          :elapsedHours,
          :thresholdHours,
          SYSTIMESTAMP
        )
      `;

      await connection.execute(sql, {
        penaltyId,
        penaltyNumber,
        serviceRequestId: data.serviceRequestId,
        asfLocationId: data.asfLocationId,
        breachType: data.breachType,
        breachTimestamp: data.breachTimestamp,
        calculatedAmount: data.calculatedAmount,
        policyVersion,
        configStatus,
        elapsedHours: data.elapsedHours ?? null,
        thresholdHours: data.thresholdHours ?? null,
      });

      const penalty = await this.getPenaltyById(penaltyId, connection);
      if (!penalty) throw new Error('Failed to retrieve newly created penalty record.');

      if (!isExternalConn) {
        await connection.commit();
      }

      return penalty;
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async getPenaltyById(penaltyId: string, conn?: oracledb.Connection): Promise<SlaPenaltyRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `
        SELECT p.PENALTY_ID, p.PENALTY_NUMBER, p.SERVICE_REQUEST_ID,
               sr.JOB_NUMBER, p.ASF_LOCATION_ID, l.LOCATION_NAME AS ASF_LOCATION_NAME,
               p.BREACH_TYPE, p.BREACH_TIMESTAMP, p.CALCULATED_AMOUNT,
               p.STATUS, p.POLICY_VERSION, p.CONFIG_STATUS, p.ELAPSED_HOURS, p.THRESHOLD_HOURS,
               p.REVIEWED_BY, p.REVIEWED_BY_USERNAME,
               p.REVIEWED_AT, p.REVIEW_REMARKS, p.JOURNAL_ID, p.CREATED_AT
        FROM SLA_PENALTY_RECORDS p
        JOIN SERVICE_REQUESTS sr ON p.SERVICE_REQUEST_ID = sr.REQUEST_ID
        JOIN LOCATIONS l ON p.ASF_LOCATION_ID = l.LOCATION_ID
        WHERE p.PENALTY_ID = :penaltyId
      `;

      const result = await connection.execute<any>(sql, { penaltyId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const row = result.rows?.[0];
      if (!row) return null;

      return {
        penaltyId: row.PENALTY_ID,
        penaltyNumber: row.PENALTY_NUMBER,
        serviceRequestId: row.SERVICE_REQUEST_ID,
        jobNumber: row.JOB_NUMBER,
        asfLocationId: row.ASF_LOCATION_ID,
        asfLocationName: row.ASF_LOCATION_NAME,
        breachType: row.BREACH_TYPE as PenaltyBreachType,
        breachTimestamp: new Date(row.BREACH_TIMESTAMP),
        calculatedAmount: Number(row.CALCULATED_AMOUNT || 0),
        status: row.STATUS as PenaltyStatus,
        policyVersion: row.POLICY_VERSION || 'UNCONFIGURED',
        configStatus: row.CONFIG_STATUS || 'AWAITING_POLICY_CONFIGURATION',
        elapsedHours: row.ELAPSED_HOURS != null ? Number(row.ELAPSED_HOURS) : undefined,
        thresholdHours: row.THRESHOLD_HOURS != null ? Number(row.THRESHOLD_HOURS) : undefined,
        reviewedBy: row.REVIEWED_BY || undefined,
        reviewedByUsername: row.REVIEWED_BY_USERNAME || undefined,
        reviewedAt: row.REVIEWED_AT ? new Date(row.REVIEWED_AT) : undefined,
        reviewRemarks: row.REVIEW_REMARKS || undefined,
        journalId: row.JOURNAL_ID || undefined,
        createdAt: new Date(row.CREATED_AT),
      };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async listPenalties(options: {
    asfLocationId?: string;
    status?: PenaltyStatus;
    breachType?: PenaltyBreachType;
    page?: number;
    limit?: number;
  }): Promise<{ items: SlaPenaltyRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options.asfLocationId) {
        binds.asfLocationId = options.asfLocationId;
        whereClauses.push('p.ASF_LOCATION_ID = :asfLocationId');
      }

      if (options.status) {
        binds.status = options.status;
        whereClauses.push('p.STATUS = :status');
      }

      if (options.breachType) {
        binds.breachType = options.breachType;
        whereClauses.push('p.BREACH_TYPE = :breachType');
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countSql = `SELECT COUNT(*) AS CNT FROM SLA_PENALTY_RECORDS p ${whereSql}`;
      const countRes = await conn.execute<any>(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const total = Number(countRes.rows?.[0]?.CNT || 0);

      const page = Math.max(1, options.page || 1);
      const limit = Math.min(100, Math.max(1, options.limit || 20));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const sql = `
        SELECT p.PENALTY_ID, p.PENALTY_NUMBER, p.SERVICE_REQUEST_ID,
               sr.JOB_NUMBER, p.ASF_LOCATION_ID, l.LOCATION_NAME AS ASF_LOCATION_NAME,
               p.BREACH_TYPE, p.BREACH_TIMESTAMP, p.CALCULATED_AMOUNT,
               p.STATUS, p.POLICY_VERSION, p.CONFIG_STATUS, p.ELAPSED_HOURS, p.THRESHOLD_HOURS,
               p.REVIEWED_BY, p.REVIEWED_BY_USERNAME,
               p.REVIEWED_AT, p.REVIEW_REMARKS, p.JOURNAL_ID, p.CREATED_AT
        FROM SLA_PENALTY_RECORDS p
        JOIN SERVICE_REQUESTS sr ON p.SERVICE_REQUEST_ID = sr.REQUEST_ID
        JOIN LOCATIONS l ON p.ASF_LOCATION_ID = l.LOCATION_ID
        ${whereSql}
        ORDER BY p.BREACH_TIMESTAMP DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const result = await conn.execute<any>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const items: SlaPenaltyRecord[] = (result.rows || []).map((row: any) => ({
        penaltyId: row.PENALTY_ID,
        penaltyNumber: row.PENALTY_NUMBER,
        serviceRequestId: row.SERVICE_REQUEST_ID,
        jobNumber: row.JOB_NUMBER,
        asfLocationId: row.ASF_LOCATION_ID,
        asfLocationName: row.ASF_LOCATION_NAME,
        breachType: row.BREACH_TYPE as PenaltyBreachType,
        breachTimestamp: new Date(row.BREACH_TIMESTAMP),
        calculatedAmount: Number(row.CALCULATED_AMOUNT || 0),
        status: row.STATUS as PenaltyStatus,
        policyVersion: row.POLICY_VERSION || 'UNCONFIGURED',
        configStatus: row.CONFIG_STATUS || 'AWAITING_POLICY_CONFIGURATION',
        elapsedHours: row.ELAPSED_HOURS != null ? Number(row.ELAPSED_HOURS) : undefined,
        thresholdHours: row.THRESHOLD_HOURS != null ? Number(row.THRESHOLD_HOURS) : undefined,
        reviewedBy: row.REVIEWED_BY || undefined,
        reviewedByUsername: row.REVIEWED_BY_USERNAME || undefined,
        reviewedAt: row.REVIEWED_AT ? new Date(row.REVIEWED_AT) : undefined,
        reviewRemarks: row.REVIEW_REMARKS || undefined,
        journalId: row.JOURNAL_ID || undefined,
        createdAt: new Date(row.CREATED_AT),
      }));

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    } finally {
      await conn.close();
    }
  }

  async updatePenaltyStatus(
    penaltyId: string,
    status: PenaltyStatus,
    data: {
      reviewedBy: string;
      reviewedByUsername: string;
      reviewRemarks: string;
      calculatedAmount?: number;
      policyVersion?: string;
      configStatus?: 'AWAITING_POLICY_CONFIGURATION' | 'CONFIGURED' | 'EXEMPT';
      journalId?: string;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE SLA_PENALTY_RECORDS
      SET STATUS = :status,
          REVIEWED_BY = :reviewedBy,
          REVIEWED_BY_USERNAME = :reviewedByUsername,
          REVIEWED_AT = SYSTIMESTAMP,
          REVIEW_REMARKS = :reviewRemarks,
          CALCULATED_AMOUNT = NVL(:calculatedAmount, CALCULATED_AMOUNT),
          POLICY_VERSION = NVL(:policyVersion, POLICY_VERSION),
          CONFIG_STATUS = NVL(:configStatus, CONFIG_STATUS),
          JOURNAL_ID = NVL(:journalId, JOURNAL_ID)
      WHERE PENALTY_ID = :penaltyId
    `;

    await conn.execute(sql, {
      status,
      reviewedBy: data.reviewedBy,
      reviewedByUsername: data.reviewedByUsername,
      reviewRemarks: data.reviewRemarks,
      calculatedAmount: data.calculatedAmount !== undefined ? data.calculatedAmount : null,
      policyVersion: data.policyVersion || null,
      configStatus: data.configStatus || null,
      journalId: data.journalId || null,
      penaltyId,
    });
  }
}

export const slaPenaltyRepository = new SlaPenaltyRepository();
