import oracledb from 'oracledb';
import { BrandRecord, PaginatedResult } from '../../types/catalog.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToBrand(row: any): BrandRecord {
  return {
    brandId: row.BRAND_ID,
    brandCode: row.BRAND_CODE,
    brandName: row.BRAND_NAME,
    logoUrl: row.LOGO_URL || undefined,
    isActive: row.IS_ACTIVE,
    versionNo: Number(row.VERSION_NO || 1),
    createdAt: new Date(row.CREATED_AT),
    updatedAt: new Date(row.UPDATED_AT),
    createdBy: row.CREATED_BY || undefined,
    updatedBy: row.UPDATED_BY || undefined,
  };
}

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  brand_code: 'BRAND_CODE',
  brand_name: 'BRAND_NAME',
  is_active: 'IS_ACTIVE',
  created_at: 'CREATED_AT',
  updated_at: 'UPDATED_AT',
};

export class BrandRepository {
  async listBrands(options: {
    search?: string;
    isActive?: 'Y' | 'N';
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<PaginatedResult<BrandRecord>> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push('(LOWER(BRAND_CODE) LIKE :search OR LOWER(BRAND_NAME) LIKE :search)');
      }

      if (options.isActive) {
        binds.isActive = options.isActive;
        whereClauses.push('IS_ACTIVE = :isActive');
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Count total
      const countSql = `SELECT COUNT(*) AS CNT FROM BRANDS ${whereSql}`;
      const countResult = await conn.execute<any>(countSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      const total = Number(countResult.rows?.[0]?.CNT || 0);

      // Sorting
      const sortColumn = (options.sortBy && ALLOWED_SORT_COLUMNS[options.sortBy.toLowerCase()]) || 'BRAND_NAME';
      const sortDir = options.sortOrder?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

      // Pagination
      const page = Math.max(1, options.page || 1);
      const limit = Math.min(100, Math.max(1, options.limit || 20));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const dataSql = `
        SELECT BRAND_ID, BRAND_CODE, BRAND_NAME, LOGO_URL, IS_ACTIVE,
               VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM BRANDS
        ${whereSql}
        ORDER BY ${sortColumn} ${sortDir}, BRAND_ID ASC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      const items = (dataResult.rows || []).map(mapRowToBrand);

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

  async findById(brandId: string): Promise<BrandRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT BRAND_ID, BRAND_CODE, BRAND_NAME, LOGO_URL, IS_ACTIVE,
               VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM BRANDS
        WHERE BRAND_ID = :brandId
      `;
      const result = await conn.execute<any>(sql, { brandId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToBrand(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async findByCode(brandCode: string): Promise<BrandRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT BRAND_ID, BRAND_CODE, BRAND_NAME, LOGO_URL, IS_ACTIVE,
               VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM BRANDS
        WHERE LOWER(BRAND_CODE) = LOWER(:brandCode)
      `;
      const result = await conn.execute<any>(
        sql,
        { brandCode: brandCode.trim() },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToBrand(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async createBrand(data: {
    brandId?: string;
    brandCode: string;
    brandName: string;
    logoUrl?: string;
    isActive?: 'Y' | 'N';
    createdBy?: string;
  }): Promise<BrandRecord> {
    const conn = await getOracleConnection();
    try {
      const brandId = data.brandId || crypto.randomUUID();
      const sql = `
        INSERT INTO BRANDS (
          BRAND_ID, BRAND_CODE, BRAND_NAME, LOGO_URL, IS_ACTIVE,
          VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        ) VALUES (
          :brandId, :brandCode, :brandName, :logoUrl, :isActive,
          1, SYSTIMESTAMP, SYSTIMESTAMP, :createdBy, :createdBy
        )
      `;
      await conn.execute(
        sql,
        {
          brandId,
          brandCode: data.brandCode.toUpperCase().trim(),
          brandName: data.brandName.trim(),
          logoUrl: data.logoUrl || null,
          isActive: data.isActive || 'Y',
          createdBy: data.createdBy || 'SYSTEM',
        },
        { autoCommit: true }
      );

      const created = await this.findById(brandId);
      if (!created) throw new Error('Failed to retrieve newly created brand');
      return created;
    } finally {
      await conn.close();
    }
  }

  async updateBrand(
    brandId: string,
    data: {
      brandCode?: string;
      brandName?: string;
      logoUrl?: string;
      isActive?: 'Y' | 'N';
      updatedBy?: string;
    },
    expectedVersion?: number
  ): Promise<{ updated: boolean; brand?: BrandRecord }> {
    const conn = await getOracleConnection();
    try {
      const setClauses: string[] = [
        'VERSION_NO = VERSION_NO + 1',
        'UPDATED_AT = SYSTIMESTAMP',
        'UPDATED_BY = :updatedBy',
      ];
      const binds: Record<string, any> = {
        brandId,
        updatedBy: data.updatedBy || 'SYSTEM',
      };

      if (data.brandCode !== undefined) {
        setClauses.push('BRAND_CODE = :brandCode');
        binds.brandCode = data.brandCode.toUpperCase().trim();
      }
      if (data.brandName !== undefined) {
        setClauses.push('BRAND_NAME = :brandName');
        binds.brandName = data.brandName.trim();
      }
      if (data.logoUrl !== undefined) {
        setClauses.push('LOGO_URL = :logoUrl');
        binds.logoUrl = data.logoUrl.trim() || null;
      }
      if (data.isActive !== undefined) {
        setClauses.push('IS_ACTIVE = :isActive');
        binds.isActive = data.isActive;
      }

      let versionCheck = '';
      if (expectedVersion !== undefined) {
        versionCheck = ' AND VERSION_NO = :expectedVersion';
        binds.expectedVersion = expectedVersion;
      }

      const sql = `
        UPDATE BRANDS
        SET ${setClauses.join(', ')}
        WHERE BRAND_ID = :brandId ${versionCheck}
      `;

      const result = await conn.execute(sql, binds, { autoCommit: true });
      if (result.rowsAffected === 0) {
        return { updated: false };
      }

      const updated = await this.findById(brandId);
      return { updated: true, brand: updated || undefined };
    } finally {
      await conn.close();
    }
  }

  async setBrandActive(
    brandId: string,
    isActive: 'Y' | 'N',
    updatedBy?: string,
    expectedVersion?: number
  ): Promise<{ updated: boolean; brand?: BrandRecord }> {
    return this.updateBrand(brandId, { isActive, updatedBy }, expectedVersion);
  }

  async countReferencingModels(brandId: string): Promise<number> {
    const conn = await getOracleConnection();
    try {
      const sql = 'SELECT COUNT(*) AS CNT FROM MODELS WHERE BRAND_ID = :brandId';
      const result = await conn.execute<any>(sql, { brandId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return Number(result.rows?.[0]?.CNT || 0);
    } finally {
      await conn.close();
    }
  }
}

export const brandRepository = new BrandRepository();
