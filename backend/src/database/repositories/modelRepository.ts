import oracledb from 'oracledb';
import { ModelRecord, ModelWithRelationsRecord, PaginatedResult } from '../../types/catalog.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToModelWithRelations(row: any): ModelWithRelationsRecord {
  return {
    modelId: row.MODEL_ID,
    brandId: row.BRAND_ID,
    productId: row.PRODUCT_ID,
    modelCode: row.MODEL_CODE,
    modelName: row.MODEL_NAME,
    technicalName: row.TECHNICAL_NAME || undefined,
    softwareVersion: row.SOFTWARE_VERSION || undefined,
    serialNumberLength: Number(row.SERIAL_NUMBER_LENGTH || 15),
    checkSerialNumber: row.CHECK_SERIAL_NUMBER,
    isJobCreationAllowed: row.IS_JOB_CREATION_ALLOWED,
    isDoaAllowed: row.IS_DOA_ALLOWED,
    isRepairable: row.IS_REPAIRABLE,
    isReplacementAllowed: row.IS_REPLACEMENT_ALLOWED,
    customerWarrantyDays: Number(row.CUSTOMER_WARRANTY_DAYS || 365),
    repairWarrantyDays: Number(row.REPAIR_WARRANTY_DAYS || 90),
    replacementWindowDays: Number(row.REPLACEMENT_WINDOW_DAYS || 30),
    doaDays: Number(row.DOA_DAYS || 7),
    amcDays: Number(row.AMC_DAYS || 0),
    amcAmount: Number(row.AMC_AMOUNT || 0),
    isOutOfWarrantyServiced: row.IS_OUT_OF_WARRANTY_SERVICED,
    standardServiceCharge: Number(row.STANDARD_SERVICE_CHARGE || 0),
    releaseDate: new Date(row.RELEASE_DATE),
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
  };
}

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  model_code: 'm.MODEL_CODE',
  model_name: 'm.MODEL_NAME',
  brand_name: 'b.BRAND_NAME',
  product_name: 'p.PRODUCT_NAME',
  release_date: 'm.RELEASE_DATE',
  is_active: 'm.IS_ACTIVE',
  created_at: 'm.CREATED_AT',
  updated_at: 'm.UPDATED_AT',
};

export class ModelRepository {
  async listModels(options: {
    search?: string;
    brandId?: string;
    productId?: string;
    isActive?: 'Y' | 'N';
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<PaginatedResult<ModelWithRelationsRecord>> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push(
          '(LOWER(m.MODEL_CODE) LIKE :search OR LOWER(m.MODEL_NAME) LIKE :search OR LOWER(m.TECHNICAL_NAME) LIKE :search OR LOWER(b.BRAND_NAME) LIKE :search OR LOWER(p.PRODUCT_NAME) LIKE :search)'
        );
      }

      if (options.brandId) {
        binds.brandId = options.brandId;
        whereClauses.push('m.BRAND_ID = :brandId');
      }

      if (options.productId) {
        binds.productId = options.productId;
        whereClauses.push('m.PRODUCT_ID = :productId');
      }

      if (options.isActive) {
        binds.isActive = options.isActive;
        whereClauses.push('m.IS_ACTIVE = :isActive');
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Count query
      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM MODELS m
        JOIN BRANDS b ON m.BRAND_ID = b.BRAND_ID
        JOIN PRODUCTS p ON m.PRODUCT_ID = p.PRODUCT_ID
        ${whereSql}
      `;
      const countResult = await conn.execute<any>(countSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      const total = Number(countResult.rows?.[0]?.CNT || 0);

      // Sorting
      const sortColumn = (options.sortBy && ALLOWED_SORT_COLUMNS[options.sortBy.toLowerCase()]) || 'm.MODEL_NAME';
      const sortDir = options.sortOrder?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

      // Pagination
      const page = Math.max(1, options.page || 1);
      const limit = Math.min(100, Math.max(1, options.limit || 20));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const dataSql = `
        SELECT m.MODEL_ID, m.BRAND_ID, m.PRODUCT_ID, m.MODEL_CODE, m.MODEL_NAME,
               m.TECHNICAL_NAME, m.SOFTWARE_VERSION, m.SERIAL_NUMBER_LENGTH,
               m.CHECK_SERIAL_NUMBER, m.IS_JOB_CREATION_ALLOWED, m.IS_DOA_ALLOWED,
               m.IS_REPAIRABLE, m.IS_REPLACEMENT_ALLOWED, m.CUSTOMER_WARRANTY_DAYS,
               m.REPAIR_WARRANTY_DAYS, m.REPLACEMENT_WINDOW_DAYS, m.DOA_DAYS,
               m.AMC_DAYS, m.AMC_AMOUNT, m.IS_OUT_OF_WARRANTY_SERVICED,
               m.STANDARD_SERVICE_CHARGE, m.RELEASE_DATE, m.IS_ACTIVE, m.VERSION_NO,
               m.CREATED_AT, m.UPDATED_AT, m.CREATED_BY, m.UPDATED_BY,
               b.BRAND_NAME, b.BRAND_CODE,
               p.PRODUCT_NAME, p.PRODUCT_CODE, p.CATEGORY_FAMILY
        FROM MODELS m
        JOIN BRANDS b ON m.BRAND_ID = b.BRAND_ID
        JOIN PRODUCTS p ON m.PRODUCT_ID = p.PRODUCT_ID
        ${whereSql}
        ORDER BY ${sortColumn} ${sortDir}, m.MODEL_ID ASC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      const items = (dataResult.rows || []).map(mapRowToModelWithRelations);

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

  async findById(modelId: string): Promise<ModelWithRelationsRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT m.MODEL_ID, m.BRAND_ID, m.PRODUCT_ID, m.MODEL_CODE, m.MODEL_NAME,
               m.TECHNICAL_NAME, m.SOFTWARE_VERSION, m.SERIAL_NUMBER_LENGTH,
               m.CHECK_SERIAL_NUMBER, m.IS_JOB_CREATION_ALLOWED, m.IS_DOA_ALLOWED,
               m.IS_REPAIRABLE, m.IS_REPLACEMENT_ALLOWED, m.CUSTOMER_WARRANTY_DAYS,
               m.REPAIR_WARRANTY_DAYS, m.REPLACEMENT_WINDOW_DAYS, m.DOA_DAYS,
               m.AMC_DAYS, m.AMC_AMOUNT, m.IS_OUT_OF_WARRANTY_SERVICED,
               m.STANDARD_SERVICE_CHARGE, m.RELEASE_DATE, m.IS_ACTIVE, m.VERSION_NO,
               m.CREATED_AT, m.UPDATED_AT, m.CREATED_BY, m.UPDATED_BY,
               b.BRAND_NAME, b.BRAND_CODE,
               p.PRODUCT_NAME, p.PRODUCT_CODE, p.CATEGORY_FAMILY
        FROM MODELS m
        JOIN BRANDS b ON m.BRAND_ID = b.BRAND_ID
        JOIN PRODUCTS p ON m.PRODUCT_ID = p.PRODUCT_ID
        WHERE m.MODEL_ID = :modelId
      `;
      const result = await conn.execute<any>(sql, { modelId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToModelWithRelations(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async findByBrandAndCode(brandId: string, modelCode: string): Promise<ModelRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT MODEL_ID, BRAND_ID, PRODUCT_ID, MODEL_CODE, MODEL_NAME,
               TECHNICAL_NAME, SOFTWARE_VERSION, SERIAL_NUMBER_LENGTH,
               CHECK_SERIAL_NUMBER, IS_JOB_CREATION_ALLOWED, IS_DOA_ALLOWED,
               IS_REPAIRABLE, IS_REPLACEMENT_ALLOWED, CUSTOMER_WARRANTY_DAYS,
               REPAIR_WARRANTY_DAYS, REPLACEMENT_WINDOW_DAYS, DOA_DAYS,
               AMC_DAYS, AMC_AMOUNT, IS_OUT_OF_WARRANTY_SERVICED,
               STANDARD_SERVICE_CHARGE, RELEASE_DATE, IS_ACTIVE, VERSION_NO,
               CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM MODELS
        WHERE BRAND_ID = :brandId AND LOWER(MODEL_CODE) = LOWER(:modelCode)
      `;
      const result = await conn.execute<any>(
        sql,
        { brandId, modelCode: modelCode.trim() },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (!result.rows || result.rows.length === 0) return null;
      const row = result.rows[0];
      return {
        modelId: row.MODEL_ID,
        brandId: row.BRAND_ID,
        productId: row.PRODUCT_ID,
        modelCode: row.MODEL_CODE,
        modelName: row.MODEL_NAME,
        technicalName: row.TECHNICAL_NAME || undefined,
        softwareVersion: row.SOFTWARE_VERSION || undefined,
        serialNumberLength: Number(row.SERIAL_NUMBER_LENGTH || 15),
        checkSerialNumber: row.CHECK_SERIAL_NUMBER,
        isJobCreationAllowed: row.IS_JOB_CREATION_ALLOWED,
        isDoaAllowed: row.IS_DOA_ALLOWED,
        isRepairable: row.IS_REPAIRABLE,
        isReplacementAllowed: row.IS_REPLACEMENT_ALLOWED,
        customerWarrantyDays: Number(row.CUSTOMER_WARRANTY_DAYS || 365),
        repairWarrantyDays: Number(row.REPAIR_WARRANTY_DAYS || 90),
        replacementWindowDays: Number(row.REPLACEMENT_WINDOW_DAYS || 30),
        doaDays: Number(row.DOA_DAYS || 7),
        amcDays: Number(row.AMC_DAYS || 0),
        amcAmount: Number(row.AMC_AMOUNT || 0),
        isOutOfWarrantyServiced: row.IS_OUT_OF_WARRANTY_SERVICED,
        standardServiceCharge: Number(row.STANDARD_SERVICE_CHARGE || 0),
        releaseDate: new Date(row.RELEASE_DATE),
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

  async createModel(data: {
    modelId: string;
    brandId: string;
    productId: string;
    modelCode: string;
    modelName: string;
    technicalName?: string;
    softwareVersion?: string;
    serialNumberLength?: number;
    checkSerialNumber?: 'Y' | 'N';
    isJobCreationAllowed?: 'Y' | 'N';
    isDoaAllowed?: 'Y' | 'N';
    isRepairable?: 'Y' | 'N';
    isReplacementAllowed?: 'Y' | 'N';
    customerWarrantyDays?: number;
    repairWarrantyDays?: number;
    replacementWindowDays?: number;
    doaDays?: number;
    amcDays?: number;
    amcAmount?: number;
    isOutOfWarrantyServiced?: 'Y' | 'N';
    standardServiceCharge?: number;
    releaseDate: Date;
    isActive?: 'Y' | 'N';
    createdBy?: string;
  }): Promise<ModelWithRelationsRecord> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        INSERT INTO MODELS (
          MODEL_ID, BRAND_ID, PRODUCT_ID, MODEL_CODE, MODEL_NAME, TECHNICAL_NAME,
          SOFTWARE_VERSION, SERIAL_NUMBER_LENGTH, CHECK_SERIAL_NUMBER,
          IS_JOB_CREATION_ALLOWED, IS_DOA_ALLOWED, IS_REPAIRABLE, IS_REPLACEMENT_ALLOWED,
          CUSTOMER_WARRANTY_DAYS, REPAIR_WARRANTY_DAYS, REPLACEMENT_WINDOW_DAYS, DOA_DAYS,
          AMC_DAYS, AMC_AMOUNT, IS_OUT_OF_WARRANTY_SERVICED, STANDARD_SERVICE_CHARGE,
          RELEASE_DATE, IS_ACTIVE, VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        ) VALUES (
          :modelId, :brandId, :productId, :modelCode, :modelName, :technicalName,
          :softwareVersion, :serialNumberLength, :checkSerialNumber,
          :isJobCreationAllowed, :isDoaAllowed, :isRepairable, :isReplacementAllowed,
          :customerWarrantyDays, :repairWarrantyDays, :replacementWindowDays, :doaDays,
          :amcDays, :amcAmount, :isOutOfWarrantyServiced, :standardServiceCharge,
          :releaseDate, :isActive, 1, SYSTIMESTAMP, SYSTIMESTAMP, :createdBy, :createdBy
        )
      `;

      await conn.execute(
        sql,
        {
          modelId: data.modelId,
          brandId: data.brandId,
          productId: data.productId,
          modelCode: data.modelCode.toUpperCase().trim(),
          modelName: data.modelName.trim(),
          technicalName: data.technicalName?.trim() || null,
          softwareVersion: data.softwareVersion?.trim() || null,
          serialNumberLength: data.serialNumberLength ?? 15,
          checkSerialNumber: data.checkSerialNumber ?? 'Y',
          isJobCreationAllowed: data.isJobCreationAllowed ?? 'Y',
          isDoaAllowed: data.isDoaAllowed ?? 'Y',
          isRepairable: data.isRepairable ?? 'Y',
          isReplacementAllowed: data.isReplacementAllowed ?? 'Y',
          customerWarrantyDays: data.customerWarrantyDays ?? 365,
          repairWarrantyDays: data.repairWarrantyDays ?? 90,
          replacementWindowDays: data.replacementWindowDays ?? 30,
          doaDays: data.doaDays ?? 7,
          amcDays: data.amcDays ?? 0,
          amcAmount: data.amcAmount ?? 0,
          isOutOfWarrantyServiced: data.isOutOfWarrantyServiced ?? 'Y',
          standardServiceCharge: data.standardServiceCharge ?? 0,
          releaseDate: data.releaseDate,
          isActive: data.isActive || 'Y',
          createdBy: data.createdBy || 'SYSTEM',
        },
        { autoCommit: true }
      );

      const created = await this.findById(data.modelId);
      if (!created) throw new Error('Failed to retrieve newly created model');
      return created;
    } finally {
      await conn.close();
    }
  }

  async updateModel(
    modelId: string,
    data: {
      brandId?: string;
      productId?: string;
      modelCode?: string;
      modelName?: string;
      technicalName?: string;
      softwareVersion?: string;
      serialNumberLength?: number;
      checkSerialNumber?: 'Y' | 'N';
      isJobCreationAllowed?: 'Y' | 'N';
      isDoaAllowed?: 'Y' | 'N';
      isRepairable?: 'Y' | 'N';
      isReplacementAllowed?: 'Y' | 'N';
      customerWarrantyDays?: number;
      repairWarrantyDays?: number;
      replacementWindowDays?: number;
      doaDays?: number;
      amcDays?: number;
      amcAmount?: number;
      isOutOfWarrantyServiced?: 'Y' | 'N';
      standardServiceCharge?: number;
      releaseDate?: Date;
      isActive?: 'Y' | 'N';
      updatedBy?: string;
    },
    expectedVersion?: number
  ): Promise<{ updated: boolean; model?: ModelWithRelationsRecord }> {
    const conn = await getOracleConnection();
    try {
      const setClauses: string[] = [
        'VERSION_NO = VERSION_NO + 1',
        'UPDATED_AT = SYSTIMESTAMP',
        'UPDATED_BY = :updatedBy',
      ];
      const binds: Record<string, any> = {
        modelId,
        updatedBy: data.updatedBy || 'SYSTEM',
      };

      if (data.brandId !== undefined) {
        setClauses.push('BRAND_ID = :brandId');
        binds.brandId = data.brandId;
      }
      if (data.productId !== undefined) {
        setClauses.push('PRODUCT_ID = :productId');
        binds.productId = data.productId;
      }
      if (data.modelCode !== undefined) {
        setClauses.push('MODEL_CODE = :modelCode');
        binds.modelCode = data.modelCode.toUpperCase().trim();
      }
      if (data.modelName !== undefined) {
        setClauses.push('MODEL_NAME = :modelName');
        binds.modelName = data.modelName.trim();
      }
      if (data.technicalName !== undefined) {
        setClauses.push('TECHNICAL_NAME = :technicalName');
        binds.technicalName = data.technicalName.trim() || null;
      }
      if (data.softwareVersion !== undefined) {
        setClauses.push('SOFTWARE_VERSION = :softwareVersion');
        binds.softwareVersion = data.softwareVersion.trim() || null;
      }
      if (data.serialNumberLength !== undefined) {
        setClauses.push('SERIAL_NUMBER_LENGTH = :serialNumberLength');
        binds.serialNumberLength = data.serialNumberLength;
      }
      if (data.checkSerialNumber !== undefined) {
        setClauses.push('CHECK_SERIAL_NUMBER = :checkSerialNumber');
        binds.checkSerialNumber = data.checkSerialNumber;
      }
      if (data.isJobCreationAllowed !== undefined) {
        setClauses.push('IS_JOB_CREATION_ALLOWED = :isJobCreationAllowed');
        binds.isJobCreationAllowed = data.isJobCreationAllowed;
      }
      if (data.isDoaAllowed !== undefined) {
        setClauses.push('IS_DOA_ALLOWED = :isDoaAllowed');
        binds.isDoaAllowed = data.isDoaAllowed;
      }
      if (data.isRepairable !== undefined) {
        setClauses.push('IS_REPAIRABLE = :isRepairable');
        binds.isRepairable = data.isRepairable;
      }
      if (data.isReplacementAllowed !== undefined) {
        setClauses.push('IS_REPLACEMENT_ALLOWED = :isReplacementAllowed');
        binds.isReplacementAllowed = data.isReplacementAllowed;
      }
      if (data.customerWarrantyDays !== undefined) {
        setClauses.push('CUSTOMER_WARRANTY_DAYS = :customerWarrantyDays');
        binds.customerWarrantyDays = data.customerWarrantyDays;
      }
      if (data.repairWarrantyDays !== undefined) {
        setClauses.push('REPAIR_WARRANTY_DAYS = :repairWarrantyDays');
        binds.repairWarrantyDays = data.repairWarrantyDays;
      }
      if (data.replacementWindowDays !== undefined) {
        setClauses.push('REPLACEMENT_WINDOW_DAYS = :replacementWindowDays');
        binds.replacementWindowDays = data.replacementWindowDays;
      }
      if (data.doaDays !== undefined) {
        setClauses.push('DOA_DAYS = :doaDays');
        binds.doaDays = data.doaDays;
      }
      if (data.amcDays !== undefined) {
        setClauses.push('AMC_DAYS = :amcDays');
        binds.amcDays = data.amcDays;
      }
      if (data.amcAmount !== undefined) {
        setClauses.push('AMC_AMOUNT = :amcAmount');
        binds.amcAmount = data.amcAmount;
      }
      if (data.isOutOfWarrantyServiced !== undefined) {
        setClauses.push('IS_OUT_OF_WARRANTY_SERVICED = :isOutOfWarrantyServiced');
        binds.isOutOfWarrantyServiced = data.isOutOfWarrantyServiced;
      }
      if (data.standardServiceCharge !== undefined) {
        setClauses.push('STANDARD_SERVICE_CHARGE = :standardServiceCharge');
        binds.standardServiceCharge = data.standardServiceCharge;
      }
      if (data.releaseDate !== undefined) {
        setClauses.push('RELEASE_DATE = :releaseDate');
        binds.releaseDate = data.releaseDate;
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
        UPDATE MODELS
        SET ${setClauses.join(', ')}
        WHERE MODEL_ID = :modelId ${versionCheck}
      `;

      const result = await conn.execute(sql, binds, { autoCommit: true });
      if (result.rowsAffected === 0) {
        return { updated: false };
      }

      const updated = await this.findById(modelId);
      return { updated: true, model: updated || undefined };
    } finally {
      await conn.close();
    }
  }

  async setModelActive(
    modelId: string,
    isActive: 'Y' | 'N',
    updatedBy?: string,
    expectedVersion?: number
  ): Promise<{ updated: boolean; model?: ModelWithRelationsRecord }> {
    return this.updateModel(modelId, { isActive, updatedBy }, expectedVersion);
  }
}

export const modelRepository = new ModelRepository();
