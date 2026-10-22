import crypto from 'crypto';
import oracledb from 'oracledb';
import { SettlementBatchRecord, SettlementStatus } from '../../types/finance.js';
import { getOracleConnection } from '../oraclePool.js';

export class SettlementBatchRepository {
  async createSettlementBatch(
    data: {
      asfLocationId: string;
      totalClaimsCount: number;
      totalPayableAmount: number;
      paymentMode: 'BANK_NEFT' | 'RTGS' | 'CHEQUE';
      paymentReference?: string;
      status?: SettlementStatus;
      journalId?: string;
    },
    conn: oracledb.Connection
  ): Promise<SettlementBatchRecord> {
    const settlementId = crypto.randomUUID();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    const settlementNumber = `SET-${dateStr}-${randPart}`;

    const sql = `
      INSERT INTO SETTLEMENT_BATCHES (
        SETTLEMENT_ID,
        SETTLEMENT_NUMBER,
        SETTLEMENT_DATE,
        ASF_LOCATION_ID,
        TOTAL_CLAIMS_COUNT,
        TOTAL_PAYABLE_AMOUNT,
        PAYMENT_REFERENCE,
        PAYMENT_MODE,
        STATUS,
        JOURNAL_ID,
        CREATED_AT
      ) VALUES (
        :settlementId,
        :settlementNumber,
        SYSTIMESTAMP,
        :asfLocationId,
        :totalClaimsCount,
        :totalPayableAmount,
        :paymentReference,
        :paymentMode,
        :status,
        :journalId,
        SYSTIMESTAMP
      )
    `;

    await conn.execute(sql, {
      settlementId,
      settlementNumber,
      asfLocationId: data.asfLocationId,
      totalClaimsCount: data.totalClaimsCount,
      totalPayableAmount: data.totalPayableAmount,
      paymentReference: data.paymentReference || null,
      paymentMode: data.paymentMode,
      status: data.status || 'APPROVED',
      journalId: data.journalId || null,
    });

    const created = await this.getSettlementById(settlementId, conn);
    if (!created) throw new Error('Failed to retrieve newly created settlement batch.');
    return created;
  }

  async getSettlementById(settlementId: string, conn?: oracledb.Connection): Promise<SettlementBatchRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `
        SELECT s.SETTLEMENT_ID, s.SETTLEMENT_NUMBER, s.SETTLEMENT_DATE,
               s.ASF_LOCATION_ID, l.LOCATION_NAME AS ASF_LOCATION_NAME,
               s.TOTAL_CLAIMS_COUNT, s.TOTAL_PAYABLE_AMOUNT, s.PAYMENT_REFERENCE,
               s.PAYMENT_MODE, s.STATUS, s.JOURNAL_ID, s.DISBURSED_AT,
               s.DISBURSED_BY, s.DISBURSED_BY_USERNAME, s.CREATED_AT
        FROM SETTLEMENT_BATCHES s
        JOIN LOCATIONS l ON s.ASF_LOCATION_ID = l.LOCATION_ID
        WHERE s.SETTLEMENT_ID = :settlementId
      `;

      const result = await connection.execute<any>(sql, { settlementId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const row = result.rows?.[0];
      if (!row) return null;

      return {
        settlementId: row.SETTLEMENT_ID,
        settlementNumber: row.SETTLEMENT_NUMBER,
        settlementDate: new Date(row.SETTLEMENT_DATE),
        asfLocationId: row.ASF_LOCATION_ID,
        asfLocationName: row.ASF_LOCATION_NAME,
        totalClaimsCount: Number(row.TOTAL_CLAIMS_COUNT || 0),
        totalPayableAmount: Number(row.TOTAL_PAYABLE_AMOUNT || 0),
        paymentReference: row.PAYMENT_REFERENCE || undefined,
        paymentMode: row.PAYMENT_MODE,
        status: row.STATUS as SettlementStatus,
        journalId: row.JOURNAL_ID || undefined,
        disbursedAt: row.DISBURSED_AT ? new Date(row.DISBURSED_AT) : undefined,
        disbursedBy: row.DISBURSED_BY || undefined,
        disbursedByUsername: row.DISBURSED_BY_USERNAME || undefined,
        createdAt: new Date(row.CREATED_AT),
      };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async listSettlements(options: {
    asfLocationId?: string;
    status?: SettlementStatus;
    page?: number;
    limit?: number;
  }): Promise<{ items: SettlementBatchRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options.asfLocationId) {
        binds.asfLocationId = options.asfLocationId;
        whereClauses.push('s.ASF_LOCATION_ID = :asfLocationId');
      }

      if (options.status) {
        binds.status = options.status;
        whereClauses.push('s.STATUS = :status');
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countSql = `SELECT COUNT(*) AS CNT FROM SETTLEMENT_BATCHES s ${whereSql}`;
      const countRes = await conn.execute<any>(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const total = Number(countRes.rows?.[0]?.CNT || 0);

      const page = Math.max(1, options.page || 1);
      const limit = Math.min(100, Math.max(1, options.limit || 20));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const sql = `
        SELECT s.SETTLEMENT_ID, s.SETTLEMENT_NUMBER, s.SETTLEMENT_DATE,
               s.ASF_LOCATION_ID, l.LOCATION_NAME AS ASF_LOCATION_NAME,
               s.TOTAL_CLAIMS_COUNT, s.TOTAL_PAYABLE_AMOUNT, s.PAYMENT_REFERENCE,
               s.PAYMENT_MODE, s.STATUS, s.JOURNAL_ID, s.DISBURSED_AT,
               s.DISBURSED_BY, s.DISBURSED_BY_USERNAME, s.CREATED_AT
        FROM SETTLEMENT_BATCHES s
        JOIN LOCATIONS l ON s.ASF_LOCATION_ID = l.LOCATION_ID
        ${whereSql}
        ORDER BY s.SETTLEMENT_DATE DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const result = await conn.execute<any>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const items: SettlementBatchRecord[] = (result.rows || []).map((row: any) => ({
        settlementId: row.SETTLEMENT_ID,
        settlementNumber: row.SETTLEMENT_NUMBER,
        settlementDate: new Date(row.SETTLEMENT_DATE),
        asfLocationId: row.ASF_LOCATION_ID,
        asfLocationName: row.ASF_LOCATION_NAME,
        totalClaimsCount: Number(row.TOTAL_CLAIMS_COUNT || 0),
        totalPayableAmount: Number(row.TOTAL_PAYABLE_AMOUNT || 0),
        paymentReference: row.PAYMENT_REFERENCE || undefined,
        paymentMode: row.PAYMENT_MODE,
        status: row.STATUS as SettlementStatus,
        journalId: row.JOURNAL_ID || undefined,
        disbursedAt: row.DISBURSED_AT ? new Date(row.DISBURSED_AT) : undefined,
        disbursedBy: row.DISBURSED_BY || undefined,
        disbursedByUsername: row.DISBURSED_BY_USERNAME || undefined,
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

  async markDisbursed(
    settlementId: string,
    data: {
      disbursedBy: string;
      disbursedByUsername: string;
      paymentReference: string;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE SETTLEMENT_BATCHES
      SET STATUS = 'DISBURSED',
          DISBURSED_BY = :disbursedBy,
          DISBURSED_BY_USERNAME = :disbursedByUsername,
          DISBURSED_AT = SYSTIMESTAMP,
          PAYMENT_REFERENCE = :paymentReference
      WHERE SETTLEMENT_ID = :settlementId
    `;

    await conn.execute(sql, {
      disbursedBy: data.disbursedBy,
      disbursedByUsername: data.disbursedByUsername,
      paymentReference: data.paymentReference,
      settlementId,
    });
  }
}

export const settlementBatchRepository = new SettlementBatchRepository();
