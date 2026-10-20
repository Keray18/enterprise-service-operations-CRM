import oracledb from 'oracledb';
import { VOCRecord } from '../../types/callCenter.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToVOC(row: any): VOCRecord {
  return {
    vocId: row.VOC_ID,
    productId: row.PRODUCT_ID || undefined,
    brandId: row.BRAND_ID || undefined,
    vocCode: row.VOC_CODE,
    vocDescription: row.VOC_DESCRIPTION,
    category: row.CATEGORY,
    isActive: row.IS_ACTIVE,
  };
}

export class VOCRepository {
  /**
   * Retrieves active Voice of Customer complaints matching product and/or brand,
   * plus generic complaints (where PRODUCT_ID IS NULL).
   */
  async listActiveVOCs(productId?: string, brandId?: string): Promise<VOCRecord[]> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      let whereClause = "IS_ACTIVE = 'Y'";

      if (productId && brandId) {
        binds.productId = productId;
        binds.brandId = brandId;
        whereClause += ' AND ((PRODUCT_ID = :productId AND (BRAND_ID = :brandId OR BRAND_ID IS NULL)) OR PRODUCT_ID IS NULL)';
      } else if (productId) {
        binds.productId = productId;
        whereClause += ' AND (PRODUCT_ID = :productId OR PRODUCT_ID IS NULL)';
      } else if (brandId) {
        binds.brandId = brandId;
        whereClause += ' AND (BRAND_ID = :brandId OR BRAND_ID IS NULL)';
      }

      const sql = `
        SELECT VOC_ID, PRODUCT_ID, BRAND_ID, VOC_CODE, VOC_DESCRIPTION, CATEGORY, IS_ACTIVE
        FROM VOC_MASTERS
        WHERE ${whereClause}
        ORDER BY CATEGORY ASC, VOC_CODE ASC
      `;

      const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (result.rows || []).map(mapRowToVOC);
    } finally {
      await conn.close();
    }
  }

  async findById(vocId: string): Promise<VOCRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT VOC_ID, PRODUCT_ID, BRAND_ID, VOC_CODE, VOC_DESCRIPTION, CATEGORY, IS_ACTIVE
        FROM VOC_MASTERS
        WHERE VOC_ID = :vocId
      `;
      const result = await conn.execute(sql, { vocId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToVOC(result.rows[0]);
    } finally {
      await conn.close();
    }
  }
}

export const vocRepository = new VOCRepository();
