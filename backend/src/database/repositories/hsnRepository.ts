import crypto from 'crypto';
import oracledb from 'oracledb';
import { HsnRecord, PaginatedResult } from '../../types/catalog.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToHsn(row: any): HsnRecord {
  return {
    hsnId: row.HSN_ID,
    hsnCode: row.HSN_CODE,
    chapterNo: row.CHAPTER_NO || undefined,
    hsnDescription: row.HSN_DESCRIPTION,
    cgstRate: Number(row.CGST_RATE || 0),
    sgstRate: Number(row.SGST_RATE || 0),
    igstRate: Number(row.IGST_RATE || 0),
    isActive: row.IS_ACTIVE,
    versionNo: Number(row.VERSION_NO || 1),
    createdAt: new Date(row.CREATED_AT),
    updatedAt: new Date(row.UPDATED_AT),
    createdBy: row.CREATED_BY || undefined,
    updatedBy: row.UPDATED_BY || undefined,
  };
}

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  hsn_code: 'HSN_CODE',
  chapter_no: 'CHAPTER_NO',
  hsn_description: 'HSN_DESCRIPTION',
  cgst_rate: 'CGST_RATE',
  sgst_rate: 'SGST_RATE',
  igst_rate: 'IGST_RATE',
  is_active: 'IS_ACTIVE',
  created_at: 'CREATED_AT',
  updated_at: 'UPDATED_AT',
};

export class HsnRepository {
  async listHsn(options: {
    search?: string;
    isActive?: 'Y' | 'N';
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<HsnRecord>> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push('(LOWER(HSN_CODE) LIKE :search OR LOWER(HSN_DESCRIPTION) LIKE :search)');
      }

      if (options.isActive) {
        binds.isActive = options.isActive;
        whereClauses.push('IS_ACTIVE = :isActive');
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Count
      const countSql = `SELECT COUNT(*) AS CNT FROM HSN_TAX_MASTERS ${whereSql}`;
      const countResult = await conn.execute<any>(countSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      const total = Number(countResult.rows?.[0]?.CNT || 0);

      // Sorting
      const sortColumn =
        (options.sortBy && ALLOWED_SORT_COLUMNS[options.sortBy.toLowerCase()]) || 'HSN_CODE';
      const sortDir = options.sortOrder?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

      // Pagination
      const page = Math.max(1, options.page);
      const limit = Math.min(100, Math.max(1, options.limit));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const dataSql = `
        SELECT HSN_ID, HSN_CODE, CHAPTER_NO, HSN_DESCRIPTION,
               CGST_RATE, SGST_RATE, IGST_RATE, IS_ACTIVE,
               VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM HSN_TAX_MASTERS
        ${whereSql}
        ORDER BY ${sortColumn} ${sortDir}, HSN_ID ASC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      const items = (dataResult.rows || []).map(mapRowToHsn);

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

  async findById(hsnId: string): Promise<HsnRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT HSN_ID, HSN_CODE, CHAPTER_NO, HSN_DESCRIPTION,
               CGST_RATE, SGST_RATE, IGST_RATE, IS_ACTIVE,
               VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM HSN_TAX_MASTERS
        WHERE HSN_ID = :hsnId
      `;
      const result = await conn.execute<any>(sql, { hsnId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToHsn(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async findByCode(hsnCode: string): Promise<HsnRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT HSN_ID, HSN_CODE, CHAPTER_NO, HSN_DESCRIPTION,
               CGST_RATE, SGST_RATE, IGST_RATE, IS_ACTIVE,
               VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM HSN_TAX_MASTERS
        WHERE LOWER(HSN_CODE) = LOWER(:hsnCode)
      `;
      const result = await conn.execute<any>(sql, { hsnCode: hsnCode.trim() }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToHsn(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async createHsn(data: {
    hsnCode: string;
    chapterNo?: string;
    hsnDescription: string;
    cgstRate: number;
    sgstRate: number;
    igstRate: number;
    isActive?: 'Y' | 'N';
    createdBy?: string;
  }): Promise<HsnRecord> {
    const conn = await getOracleConnection();
    try {
      const hsnId = crypto.randomUUID();
      const sql = `
        INSERT INTO HSN_TAX_MASTERS (
          HSN_ID, HSN_CODE, CHAPTER_NO, HSN_DESCRIPTION,
          CGST_RATE, SGST_RATE, IGST_RATE, IS_ACTIVE,
          VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        ) VALUES (
          :hsnId, :hsnCode, :chapterNo, :hsnDescription,
          :cgstRate, :sgstRate, :igstRate, :isActive,
          1, SYSTIMESTAMP, SYSTIMESTAMP, :createdBy, :createdBy
        )
      `;

      await conn.execute(
        sql,
        {
          hsnId,
          hsnCode: data.hsnCode.trim(),
          chapterNo: data.chapterNo?.trim() || null,
          hsnDescription: data.hsnDescription.trim(),
          cgstRate: data.cgstRate,
          sgstRate: data.sgstRate,
          igstRate: data.igstRate,
          isActive: data.isActive || 'Y',
          createdBy: data.createdBy || null,
        },
        { autoCommit: true }
      );

      const created = await this.findById(hsnId);
      if (!created) throw new Error(`Failed to retrieve created HSN record: ${hsnId}`);
      return created;
    } finally {
      await conn.close();
    }
  }

  async updateHsn(
    hsnId: string,
    data: {
      chapterNo?: string;
      hsnDescription: string;
      cgstRate: number;
      sgstRate: number;
      igstRate: number;
      isActive?: 'Y' | 'N';
      updatedBy?: string;
      versionNo: number;
    }
  ): Promise<HsnRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE HSN_TAX_MASTERS
        SET CHAPTER_NO = :chapterNo,
            HSN_DESCRIPTION = :hsnDescription,
            CGST_RATE = :cgstRate,
            SGST_RATE = :sgstRate,
            IGST_RATE = :igstRate,
            IS_ACTIVE = :isActive,
            VERSION_NO = VERSION_NO + 1,
            UPDATED_AT = SYSTIMESTAMP,
            UPDATED_BY = :updatedBy
        WHERE HSN_ID = :hsnId
          AND VERSION_NO = :versionNo
      `;

      const result = await conn.execute(
        sql,
        {
          hsnId,
          chapterNo: data.chapterNo?.trim() || null,
          hsnDescription: data.hsnDescription.trim(),
          cgstRate: data.cgstRate,
          sgstRate: data.sgstRate,
          igstRate: data.igstRate,
          isActive: data.isActive || 'Y',
          updatedBy: data.updatedBy || null,
          versionNo: data.versionNo,
        },
        { autoCommit: true }
      );

      if (result.rowsAffected === 0) {
        return null;
      }

      return await this.findById(hsnId);
    } finally {
      await conn.close();
    }
  }

  async updateStatus(
    hsnId: string,
    isActive: 'Y' | 'N',
    versionNo: number,
    updatedBy?: string
  ): Promise<HsnRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE HSN_TAX_MASTERS
        SET IS_ACTIVE = :isActive,
            VERSION_NO = VERSION_NO + 1,
            UPDATED_AT = SYSTIMESTAMP,
            UPDATED_BY = :updatedBy
        WHERE HSN_ID = :hsnId
          AND VERSION_NO = :versionNo
      `;

      const result = await conn.execute(
        sql,
        {
          hsnId,
          isActive,
          versionNo,
          updatedBy: updatedBy || null,
        },
        { autoCommit: true }
      );

      if (result.rowsAffected === 0) {
        return null;
      }

      return await this.findById(hsnId);
    } finally {
      await conn.close();
    }
  }

  async countReferencingParts(hsnId: string): Promise<number> {
    const conn = await getOracleConnection();
    try {
      const sql = `SELECT COUNT(*) AS CNT FROM PART_CODES WHERE HSN_ID = :hsnId`;
      const res = await conn.execute<any>(sql, { hsnId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return Number(res.rows?.[0]?.CNT || 0);
    } finally {
      await conn.close();
    }
  }
}

export const hsnRepository = new HsnRepository();
