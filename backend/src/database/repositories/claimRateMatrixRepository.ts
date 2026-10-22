import oracledb from 'oracledb';
import { ClaimRateMatrixRecord } from '../../types/finance.js';
import { getOracleConnection } from '../oraclePool.js';

export class ClaimRateMatrixRepository {
  async findRate(
    brandId: string,
    productId: string,
    callType: string,
    conn?: oracledb.Connection
  ): Promise<ClaimRateMatrixRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `
        SELECT rm.RATE_ID, rm.BRAND_ID, b.BRAND_NAME,
               rm.PRODUCT_ID, p.PRODUCT_NAME,
               rm.CALL_TYPE, rm.ASP_LABOR_PRICE, rm.BRAND_LABOR_PRICE,
               rm.TRAVEL_RATE_PER_KM, rm.TAT_HOURS_THRESHOLD,
               rm.TAT_ON_TIME_PERCENTAGE, rm.TAT_DELAY_PERCENTAGE,
               rm.IS_ACTIVE, rm.CREATED_AT, rm.UPDATED_AT
        FROM CLAIM_RATE_MATRIX rm
        JOIN BRANDS b ON rm.BRAND_ID = b.BRAND_ID
        JOIN PRODUCTS p ON rm.PRODUCT_ID = p.PRODUCT_ID
        WHERE rm.BRAND_ID = :brandId
          AND rm.PRODUCT_ID = :productId
          AND rm.CALL_TYPE = :callType
          AND rm.IS_ACTIVE = 'Y'
      `;

      const result = await connection.execute<any>(
        sql,
        { brandId, productId, callType },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const row = result.rows?.[0];
      if (!row) return null;

      return {
        rateId: row.RATE_ID,
        brandId: row.BRAND_ID,
        brandName: row.BRAND_NAME,
        productId: row.PRODUCT_ID,
        productName: row.PRODUCT_NAME,
        callType: row.CALL_TYPE,
        aspLaborPrice: Number(row.ASP_LABOR_PRICE || 0),
        brandLaborPrice: Number(row.BRAND_LABOR_PRICE || 0),
        travelRatePerKm: Number(row.TRAVEL_RATE_PER_KM || 0),
        tatHoursThreshold: Number(row.TAT_HOURS_THRESHOLD || 48),
        tatOnTimePercentage: Number(row.TAT_ON_TIME_PERCENTAGE || 100),
        tatDelayPercentage: Number(row.TAT_DELAY_PERCENTAGE || 80),
        isActive: row.IS_ACTIVE,
        createdAt: new Date(row.CREATED_AT),
        updatedAt: new Date(row.UPDATED_AT),
      };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async listRates(options?: {
    brandId?: string;
    productId?: string;
  }): Promise<ClaimRateMatrixRecord[]> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = ["rm.IS_ACTIVE = 'Y'"];

      if (options?.brandId) {
        binds.brandId = options.brandId;
        whereClauses.push('rm.BRAND_ID = :brandId');
      }

      if (options?.productId) {
        binds.productId = options.productId;
        whereClauses.push('rm.PRODUCT_ID = :productId');
      }

      const sql = `
        SELECT rm.RATE_ID, rm.BRAND_ID, b.BRAND_NAME,
               rm.PRODUCT_ID, p.PRODUCT_NAME,
               rm.CALL_TYPE, rm.ASP_LABOR_PRICE, rm.BRAND_LABOR_PRICE,
               rm.TRAVEL_RATE_PER_KM, rm.TAT_HOURS_THRESHOLD,
               rm.TAT_ON_TIME_PERCENTAGE, rm.TAT_DELAY_PERCENTAGE,
               rm.IS_ACTIVE, rm.CREATED_AT, rm.UPDATED_AT
        FROM CLAIM_RATE_MATRIX rm
        JOIN BRANDS b ON rm.BRAND_ID = b.BRAND_ID
        JOIN PRODUCTS p ON rm.PRODUCT_ID = p.PRODUCT_ID
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY b.BRAND_NAME ASC, p.PRODUCT_NAME ASC, rm.CALL_TYPE ASC
      `;

      const result = await conn.execute<any>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      return (result.rows || []).map((row: any) => ({
        rateId: row.RATE_ID,
        brandId: row.BRAND_ID,
        brandName: row.BRAND_NAME,
        productId: row.PRODUCT_ID,
        productName: row.PRODUCT_NAME,
        callType: row.CALL_TYPE,
        aspLaborPrice: Number(row.ASP_LABOR_PRICE || 0),
        brandLaborPrice: Number(row.BRAND_LABOR_PRICE || 0),
        travelRatePerKm: Number(row.TRAVEL_RATE_PER_KM || 0),
        tatHoursThreshold: Number(row.TAT_HOURS_THRESHOLD || 48),
        tatOnTimePercentage: Number(row.TAT_ON_TIME_PERCENTAGE || 100),
        tatDelayPercentage: Number(row.TAT_DELAY_PERCENTAGE || 80),
        isActive: row.IS_ACTIVE,
        createdAt: new Date(row.CREATED_AT),
        updatedAt: new Date(row.UPDATED_AT),
      }));
    } finally {
      await conn.close();
    }
  }
}

export const claimRateMatrixRepository = new ClaimRateMatrixRepository();
