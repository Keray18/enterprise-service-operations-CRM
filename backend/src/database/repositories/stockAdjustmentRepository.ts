import crypto from 'crypto';
import oracledb from 'oracledb';
import { StockAdjustmentReason, StockAdjustmentRecord, StockAdjustmentType } from '../../types/inventory.js';
import { getOracleConnection } from '../oraclePool.js';

export class StockAdjustmentRepository {
  async createAdjustment(
    input: {
      adjustmentNumber: string;
      locationId: string;
      partId: string;
      stockBucket: 'ON_HAND' | 'DEFECTIVE';
      adjustmentType: StockAdjustmentType;
      quantity: number;
      reason: StockAdjustmentReason;
      remarks: string;
      adjustedBy: string;
    },
    conn: oracledb.Connection
  ): Promise<string> {
    const adjustmentId = crypto.randomUUID();

    const sql = `
      INSERT INTO STOCK_ADJUSTMENTS (
        ADJUSTMENT_ID,
        ADJUSTMENT_NUMBER,
        LOCATION_ID,
        PART_ID,
        STOCK_BUCKET,
        ADJUSTMENT_TYPE,
        QUANTITY,
        REASON,
        REMARKS,
        ADJUSTED_BY,
        CREATED_AT
      ) VALUES (
        :adjustmentId,
        :adjustmentNumber,
        :locationId,
        :partId,
        :stockBucket,
        :adjustmentType,
        :quantity,
        :reason,
        :remarks,
        :adjustedBy,
        SYSTIMESTAMP
      )
    `;

    await conn.execute(sql, {
      adjustmentId,
      adjustmentNumber: input.adjustmentNumber,
      locationId: input.locationId,
      partId: input.partId,
      stockBucket: input.stockBucket,
      adjustmentType: input.adjustmentType,
      quantity: input.quantity,
      reason: input.reason,
      remarks: input.remarks,
      adjustedBy: input.adjustedBy,
    });

    return adjustmentId;
  }

  async listAdjustments(options: {
    locationId?: string;
    partId?: string;
    reason?: StockAdjustmentReason;
    page?: number;
    limit?: number;
  }): Promise<{ items: StockAdjustmentRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = ['1=1'];

      if (options.locationId) {
        binds.locationId = options.locationId;
        whereClauses.push('a.LOCATION_ID = :locationId');
      }

      if (options.partId) {
        binds.partId = options.partId;
        whereClauses.push('a.PART_ID = :partId');
      }

      if (options.reason) {
        binds.reason = options.reason;
        whereClauses.push('a.REASON = :reason');
      }

      const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM STOCK_ADJUSTMENTS a
        ${whereSql}
      `;

      const countResult = await conn.execute<any>(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const total = Number(countResult.rows?.[0]?.CNT || 0);

      const page = Math.max(1, options.page || 1);
      const limit = Math.min(100, Math.max(1, options.limit || 20));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const dataSql = `
        SELECT 
          a.ADJUSTMENT_ID,
          a.ADJUSTMENT_NUMBER,
          a.LOCATION_ID,
          l.LOCATION_NAME,
          a.PART_ID,
          p.PART_CODE,
          p.PART_NAME,
          a.STOCK_BUCKET,
          a.ADJUSTMENT_TYPE,
          a.QUANTITY,
          a.REASON,
          a.REMARKS,
          a.ADJUSTED_BY,
          u.FULL_NAME AS ADJUSTED_BY_NAME,
          a.CREATED_AT
        FROM STOCK_ADJUSTMENTS a
        JOIN LOCATIONS l ON a.LOCATION_ID = l.LOCATION_ID
        JOIN PART_CODES p ON a.PART_ID = p.PART_ID
        JOIN APP_USERS u ON a.ADJUSTED_BY = u.USER_ID
        ${whereSql}
        ORDER BY a.CREATED_AT DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const items: StockAdjustmentRecord[] = (dataResult.rows || []).map((row) => ({
        adjustmentId: row.ADJUSTMENT_ID,
        adjustmentNumber: row.ADJUSTMENT_NUMBER,
        locationId: row.LOCATION_ID,
        locationName: row.LOCATION_NAME,
        partId: row.PART_ID,
        partCode: row.PART_CODE,
        partName: row.PART_NAME,
        stockBucket: row.STOCK_BUCKET,
        adjustmentType: row.ADJUSTMENT_TYPE as StockAdjustmentType,
        quantity: Number(row.QUANTITY),
        reason: row.REASON as StockAdjustmentReason,
        remarks: row.REMARKS,
        adjustedBy: row.ADJUSTED_BY,
        adjustedByName: row.ADJUSTED_BY_NAME,
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
}

export const stockAdjustmentRepository = new StockAdjustmentRepository();
