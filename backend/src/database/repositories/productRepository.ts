import oracledb from 'oracledb';
import { PaginatedResult, ProductRecord } from '../../types/catalog.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToProduct(row: any): ProductRecord {
  return {
    productId: row.PRODUCT_ID,
    productCode: row.PRODUCT_CODE,
    productName: row.PRODUCT_NAME,
    categoryFamily: row.CATEGORY_FAMILY,
    isActive: row.IS_ACTIVE,
    versionNo: Number(row.VERSION_NO || 1),
    createdAt: new Date(row.CREATED_AT),
    updatedAt: new Date(row.UPDATED_AT),
    createdBy: row.CREATED_BY || undefined,
    updatedBy: row.UPDATED_BY || undefined,
  };
}

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  product_code: 'PRODUCT_CODE',
  product_name: 'PRODUCT_NAME',
  category_family: 'CATEGORY_FAMILY',
  is_active: 'IS_ACTIVE',
  created_at: 'CREATED_AT',
  updated_at: 'UPDATED_AT',
};

export class ProductRepository {
  async listProducts(options: {
    search?: string;
    categoryFamily?: string;
    isActive?: 'Y' | 'N';
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<PaginatedResult<ProductRecord>> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push(
          '(LOWER(PRODUCT_CODE) LIKE :search OR LOWER(PRODUCT_NAME) LIKE :search OR LOWER(CATEGORY_FAMILY) LIKE :search)'
        );
      }

      if (options.categoryFamily && options.categoryFamily.trim()) {
        binds.categoryFamily = options.categoryFamily.trim();
        whereClauses.push('CATEGORY_FAMILY = :categoryFamily');
      }

      if (options.isActive) {
        binds.isActive = options.isActive;
        whereClauses.push('IS_ACTIVE = :isActive');
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Count total
      const countSql = `SELECT COUNT(*) AS CNT FROM PRODUCTS ${whereSql}`;
      const countResult = await conn.execute<any>(countSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      const total = Number(countResult.rows?.[0]?.CNT || 0);

      // Sorting
      const sortColumn = (options.sortBy && ALLOWED_SORT_COLUMNS[options.sortBy.toLowerCase()]) || 'PRODUCT_NAME';
      const sortDir = options.sortOrder?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

      // Pagination
      const page = Math.max(1, options.page || 1);
      const limit = Math.min(100, Math.max(1, options.limit || 20));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const dataSql = `
        SELECT PRODUCT_ID, PRODUCT_CODE, PRODUCT_NAME, CATEGORY_FAMILY, IS_ACTIVE,
               VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM PRODUCTS
        ${whereSql}
        ORDER BY ${sortColumn} ${sortDir}, PRODUCT_ID ASC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      const items = (dataResult.rows || []).map(mapRowToProduct);

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

  async findById(productId: string): Promise<ProductRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT PRODUCT_ID, PRODUCT_CODE, PRODUCT_NAME, CATEGORY_FAMILY, IS_ACTIVE,
               VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM PRODUCTS
        WHERE PRODUCT_ID = :productId
      `;
      const result = await conn.execute<any>(sql, { productId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToProduct(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async findByCode(productCode: string): Promise<ProductRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT PRODUCT_ID, PRODUCT_CODE, PRODUCT_NAME, CATEGORY_FAMILY, IS_ACTIVE,
               VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM PRODUCTS
        WHERE LOWER(PRODUCT_CODE) = LOWER(:productCode)
      `;
      const result = await conn.execute<any>(
        sql,
        { productCode: productCode.trim() },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToProduct(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async createProduct(data: {
    productId?: string;
    productCode: string;
    productName: string;
    categoryFamily: string;
    isActive?: 'Y' | 'N';
    createdBy?: string;
  }): Promise<ProductRecord> {
    const conn = await getOracleConnection();
    try {
      const productId = data.productId || crypto.randomUUID();
      const sql = `
        INSERT INTO PRODUCTS (
          PRODUCT_ID, PRODUCT_CODE, PRODUCT_NAME, CATEGORY_FAMILY, IS_ACTIVE,
          VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        ) VALUES (
          :productId, :productCode, :productName, :categoryFamily, :isActive,
          1, SYSTIMESTAMP, SYSTIMESTAMP, :createdBy, :createdBy
        )
      `;
      await conn.execute(
        sql,
        {
          productId,
          productCode: data.productCode.toUpperCase().trim(),
          productName: data.productName.trim(),
          categoryFamily: data.categoryFamily.trim(),
          isActive: data.isActive || 'Y',
          createdBy: data.createdBy || 'SYSTEM',
        },
        { autoCommit: true }
      );

      const created = await this.findById(productId);
      if (!created) throw new Error('Failed to retrieve newly created product');
      return created;
    } finally {
      await conn.close();
    }
  }

  async updateProduct(
    productId: string,
    data: {
      productCode?: string;
      productName?: string;
      categoryFamily?: string;
      isActive?: 'Y' | 'N';
      updatedBy?: string;
    },
    expectedVersion?: number
  ): Promise<{ updated: boolean; product?: ProductRecord }> {
    const conn = await getOracleConnection();
    try {
      const setClauses: string[] = [
        'VERSION_NO = VERSION_NO + 1',
        'UPDATED_AT = SYSTIMESTAMP',
        'UPDATED_BY = :updatedBy',
      ];
      const binds: Record<string, any> = {
        productId,
        updatedBy: data.updatedBy || 'SYSTEM',
      };

      if (data.productCode !== undefined) {
        setClauses.push('PRODUCT_CODE = :productCode');
        binds.productCode = data.productCode.toUpperCase().trim();
      }
      if (data.productName !== undefined) {
        setClauses.push('PRODUCT_NAME = :productName');
        binds.productName = data.productName.trim();
      }
      if (data.categoryFamily !== undefined) {
        setClauses.push('CATEGORY_FAMILY = :categoryFamily');
        binds.categoryFamily = data.categoryFamily.trim();
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
        UPDATE PRODUCTS
        SET ${setClauses.join(', ')}
        WHERE PRODUCT_ID = :productId ${versionCheck}
      `;

      const result = await conn.execute(sql, binds, { autoCommit: true });
      if (result.rowsAffected === 0) {
        return { updated: false };
      }

      const updated = await this.findById(productId);
      return { updated: true, product: updated || undefined };
    } finally {
      await conn.close();
    }
  }

  async setProductActive(
    productId: string,
    isActive: 'Y' | 'N',
    updatedBy?: string,
    expectedVersion?: number
  ): Promise<{ updated: boolean; product?: ProductRecord }> {
    return this.updateProduct(productId, { isActive, updatedBy }, expectedVersion);
  }

  async listCategories(): Promise<string[]> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT DISTINCT CATEGORY_FAMILY 
        FROM PRODUCTS 
        WHERE CATEGORY_FAMILY IS NOT NULL 
        ORDER BY CATEGORY_FAMILY ASC
      `;
      const result = await conn.execute<any>(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (result.rows || []).map((r: any) => r.CATEGORY_FAMILY);
    } finally {
      await conn.close();
    }
  }

  async countReferencingModels(productId: string): Promise<number> {
    const conn = await getOracleConnection();
    try {
      const sql = 'SELECT COUNT(*) AS CNT FROM MODELS WHERE PRODUCT_ID = :productId';
      const result = await conn.execute<any>(sql, { productId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return Number(result.rows?.[0]?.CNT || 0);
    } finally {
      await conn.close();
    }
  }
}

export const productRepository = new ProductRepository();
