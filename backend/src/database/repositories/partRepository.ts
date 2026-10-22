import crypto from 'crypto';
import oracledb from 'oracledb';
import { PaginatedResult, PartRecord, PartWithRelationsRecord } from '../../types/catalog.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToPartWithRelations(row: any): PartWithRelationsRecord {
  return {
    partId: row.PART_ID,
    brandId: row.BRAND_ID,
    productId: row.PRODUCT_ID,
    partCode: row.PART_CODE,
    vendorPartCode: row.VENDOR_PART_CODE || undefined,
    partName: row.PART_NAME,
    partDescription: row.PART_DESCRIPTION || undefined,
    hsnId: row.HSN_ID,
    partCategory: row.PART_CATEGORY,
    partFor: row.PART_FOR || undefined,
    customerPrice: Number(row.CUSTOMER_PRICE || 0),
    locationPrice: Number(row.LOCATION_PRICE || 0),
    faultyPartDispatchTo: row.FAULTY_PART_DISPATCH_TO,
    warrantyDays: Number(row.WARRANTY_DAYS || 0),
    isActive: row.IS_ACTIVE,
    versionNo: Number(row.VERSION_NO || 1),
    createdAt: new Date(row.CREATED_AT),
    updatedAt: new Date(row.UPDATED_AT),
    createdBy: row.CREATED_BY || undefined,
    updatedBy: row.UPDATED_BY || undefined,
    brandName: row.BRAND_NAME,
    brandCode: row.BRAND_CODE,
    productName: row.PRODUCT_NAME,
    productCode: row.PRODUCT_CODE,
    categoryFamily: row.CATEGORY_FAMILY,
    hsnCode: row.HSN_CODE,
    hsnDescription: row.HSN_DESCRIPTION,
    igstRate: Number(row.IGST_RATE || 0),
  };
}

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  part_code: 'p.PART_CODE',
  part_name: 'p.PART_NAME',
  vendor_part_code: 'p.VENDOR_PART_CODE',
  part_category: 'p.PART_CATEGORY',
  customer_price: 'p.CUSTOMER_PRICE',
  location_price: 'p.LOCATION_PRICE',
  warranty_days: 'p.WARRANTY_DAYS',
  brand_name: 'b.BRAND_NAME',
  product_name: 'pr.PRODUCT_NAME',
  hsn_code: 'h.HSN_CODE',
  is_active: 'p.IS_ACTIVE',
  created_at: 'p.CREATED_AT',
  updated_at: 'p.UPDATED_AT',
};

export class PartRepository {
  async listParts(options: {
    search?: string;
    brandId?: string;
    productId?: string;
    category?: string;
    isActive?: 'Y' | 'N';
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<PartWithRelationsRecord>> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push(
          '(LOWER(p.PART_CODE) LIKE :search OR LOWER(p.VENDOR_PART_CODE) LIKE :search OR LOWER(p.PART_NAME) LIKE :search OR LOWER(b.BRAND_NAME) LIKE :search OR LOWER(pr.PRODUCT_NAME) LIKE :search)'
        );
      }

      if (options.brandId) {
        binds.brandId = options.brandId;
        whereClauses.push('p.BRAND_ID = :brandId');
      }

      if (options.productId) {
        binds.productId = options.productId;
        whereClauses.push('p.PRODUCT_ID = :productId');
      }

      if (options.category) {
        binds.category = options.category.toUpperCase();
        whereClauses.push('p.PART_CATEGORY = :category');
      }

      if (options.isActive) {
        binds.isActive = options.isActive;
        whereClauses.push('p.IS_ACTIVE = :isActive');
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM PART_CODES p
        JOIN BRANDS b ON p.BRAND_ID = b.BRAND_ID
        JOIN PRODUCTS pr ON p.PRODUCT_ID = pr.PRODUCT_ID
        JOIN HSN_TAX_MASTERS h ON p.HSN_ID = h.HSN_ID
        ${whereSql}
      `;
      const countResult = await conn.execute<any>(countSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      const total = Number(countResult.rows?.[0]?.CNT || 0);

      const sortColumn =
        (options.sortBy && ALLOWED_SORT_COLUMNS[options.sortBy.toLowerCase()]) || 'p.PART_NAME';
      const sortDir = options.sortOrder?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

      const page = Math.max(1, options.page || 1);
      const limit = Math.min(100, Math.max(1, options.limit || 20));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const dataSql = `
        SELECT p.PART_ID, p.BRAND_ID, p.PRODUCT_ID, p.PART_CODE, p.VENDOR_PART_CODE,
               p.PART_NAME, p.PART_DESCRIPTION, p.HSN_ID, p.PART_CATEGORY, p.PART_FOR,
               p.CUSTOMER_PRICE, p.LOCATION_PRICE, p.FAULTY_PART_DISPATCH_TO, p.WARRANTY_DAYS,
               p.IS_ACTIVE, p.VERSION_NO, p.CREATED_AT, p.UPDATED_AT, p.CREATED_BY, p.UPDATED_BY,
               b.BRAND_NAME, b.BRAND_CODE,
               pr.PRODUCT_NAME, pr.PRODUCT_CODE, pr.CATEGORY_FAMILY,
               h.HSN_CODE, h.HSN_DESCRIPTION, h.IGST_RATE
        FROM PART_CODES p
        JOIN BRANDS b ON p.BRAND_ID = b.BRAND_ID
        JOIN PRODUCTS pr ON p.PRODUCT_ID = pr.PRODUCT_ID
        JOIN HSN_TAX_MASTERS h ON p.HSN_ID = h.HSN_ID
        ${whereSql}
        ORDER BY ${sortColumn} ${sortDir}, p.PART_ID ASC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      const items = (dataResult.rows || []).map(mapRowToPartWithRelations);

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

  async findById(partId: string, conn?: oracledb.Connection): Promise<PartWithRelationsRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());
    try {
      const sql = `
        SELECT p.PART_ID, p.BRAND_ID, p.PRODUCT_ID, p.PART_CODE, p.VENDOR_PART_CODE,
               p.PART_NAME, p.PART_DESCRIPTION, p.HSN_ID, p.PART_CATEGORY, p.PART_FOR,
               p.CUSTOMER_PRICE, p.LOCATION_PRICE, p.FAULTY_PART_DISPATCH_TO, p.WARRANTY_DAYS,
               p.IS_ACTIVE, p.VERSION_NO, p.CREATED_AT, p.UPDATED_AT, p.CREATED_BY, p.UPDATED_BY,
               b.BRAND_NAME, b.BRAND_CODE,
               pr.PRODUCT_NAME, pr.PRODUCT_CODE, pr.CATEGORY_FAMILY,
               h.HSN_CODE, h.HSN_DESCRIPTION, h.IGST_RATE
        FROM PART_CODES p
        JOIN BRANDS b ON p.BRAND_ID = b.BRAND_ID
        JOIN PRODUCTS pr ON p.PRODUCT_ID = pr.PRODUCT_ID
        JOIN HSN_TAX_MASTERS h ON p.HSN_ID = h.HSN_ID
        WHERE p.PART_ID = :partId
      `;
      const result = await connection.execute<any>(sql, { partId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToPartWithRelations(result.rows[0]);
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async findByBrandAndPartCode(brandId: string, partCode: string): Promise<PartRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT PART_ID, BRAND_ID, PRODUCT_ID, PART_CODE, VENDOR_PART_CODE,
               PART_NAME, PART_DESCRIPTION, HSN_ID, PART_CATEGORY, PART_FOR,
               CUSTOMER_PRICE, LOCATION_PRICE, FAULTY_PART_DISPATCH_TO, WARRANTY_DAYS,
               IS_ACTIVE, VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM PART_CODES
        WHERE BRAND_ID = :brandId
          AND LOWER(PART_CODE) = LOWER(:partCode)
      `;
      const result = await conn.execute<any>(
        sql,
        { brandId, partCode: partCode.trim() },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (!result.rows || result.rows.length === 0) return null;
      const row = result.rows[0];
      return {
        partId: row.PART_ID,
        brandId: row.BRAND_ID,
        productId: row.PRODUCT_ID,
        partCode: row.PART_CODE,
        vendorPartCode: row.VENDOR_PART_CODE || undefined,
        partName: row.PART_NAME,
        partDescription: row.PART_DESCRIPTION || undefined,
        hsnId: row.HSN_ID,
        partCategory: row.PART_CATEGORY,
        partFor: row.PART_FOR || undefined,
        customerPrice: Number(row.CUSTOMER_PRICE || 0),
        locationPrice: Number(row.LOCATION_PRICE || 0),
        faultyPartDispatchTo: row.FAULTY_PART_DISPATCH_TO,
        warrantyDays: Number(row.WARRANTY_DAYS || 0),
        isActive: row.IS_ACTIVE,
        versionNo: Number(row.VERSION_NO || 1),
        createdAt: new Date(row.CREATED_AT),
        updatedAt: new Date(row.UPDATED_AT),
        createdBy: row.CREATED_BY || undefined,
        updatedBy: row.UPDATED_BY || undefined,
      };
    } finally {
      await conn.close();
    }
  }

  async findByBrandAndCode(brandId: string, partCode: string): Promise<PartRecord | null> {
    return this.findByBrandAndPartCode(brandId, partCode);
  }

  async createPart(data: {
    brandId: string;
    productId: string;
    partCode: string;
    vendorPartCode?: string;
    partName: string;
    partDescription?: string;
    hsnId: string;
    partCategory: 'SPARE' | 'CONSUMABLE' | 'ACCESSORY';
    partFor?: string;
    customerPrice: number;
    locationPrice: number;
    faultyPartDispatchTo?: string;
    warrantyDays?: number;
    isActive?: 'Y' | 'N';
    createdBy?: string;
  }): Promise<PartWithRelationsRecord> {
    const conn = await getOracleConnection();
    try {
      const partId = crypto.randomUUID();
      const sql = `
        INSERT INTO PART_CODES (
          PART_ID, BRAND_ID, PRODUCT_ID, PART_CODE, VENDOR_PART_CODE,
          PART_NAME, PART_DESCRIPTION, HSN_ID, PART_CATEGORY, PART_FOR,
          CUSTOMER_PRICE, LOCATION_PRICE, FAULTY_PART_DISPATCH_TO, WARRANTY_DAYS,
          IS_ACTIVE, VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        ) VALUES (
          :partId, :brandId, :productId, :partCode, :vendorPartCode,
          :partName, :partDescription, :hsnId, :partCategory, :partFor,
          :customerPrice, :locationPrice, :faultyPartDispatchTo, :warrantyDays,
          :isActive, 1, SYSTIMESTAMP, SYSTIMESTAMP, :createdBy, :createdBy
        )
      `;

      await conn.execute(
        sql,
        {
          partId,
          brandId: data.brandId,
          productId: data.productId,
          partCode: data.partCode.trim(),
          vendorPartCode: data.vendorPartCode?.trim() || null,
          partName: data.partName.trim(),
          partDescription: data.partDescription?.trim() || null,
          hsnId: data.hsnId,
          partCategory: data.partCategory,
          partFor: data.partFor?.trim() || null,
          customerPrice: data.customerPrice,
          locationPrice: data.locationPrice,
          faultyPartDispatchTo: data.faultyPartDispatchTo || 'WAREHOUSE',
          warrantyDays: data.warrantyDays ?? 90,
          isActive: data.isActive || 'Y',
          createdBy: data.createdBy || null,
        },
        { autoCommit: true }
      );

      const created = await this.findById(partId);
      if (!created) throw new Error(`Failed to retrieve created Part record: ${partId}`);
      return created;
    } finally {
      await conn.close();
    }
  }

  async updatePart(
    partId: string,
    data: {
      vendorPartCode?: string;
      partName: string;
      partDescription?: string;
      hsnId: string;
      partCategory: 'SPARE' | 'CONSUMABLE' | 'ACCESSORY';
      partFor?: string;
      customerPrice: number;
      locationPrice: number;
      faultyPartDispatchTo?: string;
      warrantyDays?: number;
      isActive?: 'Y' | 'N';
      updatedBy?: string;
      versionNo: number;
    }
  ): Promise<PartWithRelationsRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE PART_CODES
        SET VENDOR_PART_CODE = :vendorPartCode,
            PART_NAME = :partName,
            PART_DESCRIPTION = :partDescription,
            HSN_ID = :hsnId,
            PART_CATEGORY = :partCategory,
            PART_FOR = :partFor,
            CUSTOMER_PRICE = :customerPrice,
            LOCATION_PRICE = :locationPrice,
            FAULTY_PART_DISPATCH_TO = :faultyPartDispatchTo,
            WARRANTY_DAYS = :warrantyDays,
            IS_ACTIVE = :isActive,
            VERSION_NO = VERSION_NO + 1,
            UPDATED_AT = SYSTIMESTAMP,
            UPDATED_BY = :updatedBy
        WHERE PART_ID = :partId
          AND VERSION_NO = :versionNo
      `;

      const result = await conn.execute(
        sql,
        {
          partId,
          vendorPartCode: data.vendorPartCode?.trim() || null,
          partName: data.partName.trim(),
          partDescription: data.partDescription?.trim() || null,
          hsnId: data.hsnId,
          partCategory: data.partCategory,
          partFor: data.partFor?.trim() || null,
          customerPrice: data.customerPrice,
          locationPrice: data.locationPrice,
          faultyPartDispatchTo: data.faultyPartDispatchTo || 'WAREHOUSE',
          warrantyDays: data.warrantyDays ?? 90,
          isActive: data.isActive || 'Y',
          updatedBy: data.updatedBy || null,
          versionNo: data.versionNo,
        },
        { autoCommit: true }
      );

      if (result.rowsAffected === 0) {
        return null;
      }

      return await this.findById(partId);
    } finally {
      await conn.close();
    }
  }

  async updateStatus(
    partId: string,
    isActive: 'Y' | 'N',
    versionNo: number,
    updatedBy?: string
  ): Promise<PartWithRelationsRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE PART_CODES
        SET IS_ACTIVE = :isActive,
            VERSION_NO = VERSION_NO + 1,
            UPDATED_AT = SYSTIMESTAMP,
            UPDATED_BY = :updatedBy
        WHERE PART_ID = :partId
          AND VERSION_NO = :versionNo
      `;

      const result = await conn.execute(
        sql,
        {
          partId,
          isActive,
          versionNo,
          updatedBy: updatedBy || null,
        },
        { autoCommit: true }
      );

      if (result.rowsAffected === 0) {
        return null;
      }

      return await this.findById(partId);
    } finally {
      await conn.close();
    }
  }
}

export const partRepository = new PartRepository();
