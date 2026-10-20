import crypto from 'crypto';
import oracledb from 'oracledb';
import { CreateCustomerInput, CustomerWithGeographyRecord } from '../../types/callCenter.js';
import { PaginatedResult } from '../../types/catalog.js';
import { normalizeIndianMobile } from '../../utils/phoneUtils.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToCustomer(row: any): CustomerWithGeographyRecord {
  return {
    customerId: row.CUSTOMER_ID,
    customerCode: row.CUSTOMER_CODE,
    fullName: row.FULL_NAME,
    primaryMobile: row.PRIMARY_MOBILE,
    normalizedMobile: row.NORMALIZED_MOBILE,
    alternateMobile: row.ALTERNATE_MOBILE || undefined,
    residencePhone: row.RESIDENCE_PHONE || undefined,
    email: row.EMAIL || undefined,
    customerCategory: row.CUSTOMER_CATEGORY,
    addressLine: row.ADDRESS_LINE,
    landmark: row.LANDMARK || undefined,
    stateId: row.STATE_ID,
    cityId: row.CITY_ID,
    pincode: row.PINCODE,
    gstNumber: row.GST_NUMBER || undefined,
    isActive: row.IS_ACTIVE,
    versionNo: Number(row.VERSION_NO || 1),
    createdAt: new Date(row.CREATED_AT),
    updatedAt: new Date(row.UPDATED_AT),
    createdBy: row.CREATED_BY || undefined,
    updatedBy: row.UPDATED_BY || undefined,
    stateName: row.STATE_NAME,
    stateCode: row.STATE_CODE,
    cityName: row.CITY_NAME,
  };
}

export class CustomerRepository {
  /**
   * Search customers by mobile, customer code, or full name with pagination.
   */
  async searchCustomers(options: {
    mobile?: string;
    code?: string;
    name?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<CustomerWithGeographyRecord>> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 10));
    const offset = (page - 1) * limit;

    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = ['c.IS_ACTIVE = :isActive'];
      binds.isActive = 'Y';

      if (options.mobile && options.mobile.trim()) {
        const norm = normalizeIndianMobile(options.mobile.trim());
        if (norm) {
          binds.normMobile = `%${norm}%`;
          binds.rawMobile = `%${options.mobile.trim()}%`;
          whereClauses.push('(c.NORMALIZED_MOBILE LIKE :normMobile OR c.PRIMARY_MOBILE LIKE :rawMobile)');
        }
      }

      if (options.code && options.code.trim()) {
        binds.code = `%${options.code.trim().toUpperCase()}%`;
        whereClauses.push('UPPER(c.CUSTOMER_CODE) LIKE :code');
      }

      if (options.name && options.name.trim()) {
        binds.name = `%${options.name.trim().toLowerCase()}%`;
        whereClauses.push('LOWER(c.FULL_NAME) LIKE :name');
      }

      const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM CUSTOMERS c
        ${whereSql}
      `;

      const countRes = await conn.execute<{ CNT: number }>(countSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      const total = countRes.rows?.[0]?.CNT ?? 0;

      const dataSql = `
        SELECT 
          c.CUSTOMER_ID,
          c.CUSTOMER_CODE,
          c.FULL_NAME,
          c.PRIMARY_MOBILE,
          c.NORMALIZED_MOBILE,
          c.ALTERNATE_MOBILE,
          c.RESIDENCE_PHONE,
          c.EMAIL,
          c.CUSTOMER_CATEGORY,
          c.ADDRESS_LINE,
          c.LANDMARK,
          c.STATE_ID,
          c.CITY_ID,
          c.PINCODE,
          c.GST_NUMBER,
          c.IS_ACTIVE,
          c.VERSION_NO,
          c.CREATED_AT,
          c.UPDATED_AT,
          c.CREATED_BY,
          c.UPDATED_BY,
          s.STATE_NAME,
          s.STATE_CODE,
          ci.CITY_NAME
        FROM CUSTOMERS c
        JOIN STATES s ON c.STATE_ID = s.STATE_ID
        JOIN CITIES ci ON c.CITY_ID = ci.CITY_ID
        ${whereSql}
        ORDER BY c.CREATED_AT DESC, c.CUSTOMER_ID ASC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataRes = await conn.execute(
        dataSql,
        { ...binds, offset, limit },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const items = (dataRes.rows || []).map(mapRowToCustomer);

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

  /**
   * Find a customer by UUID.
   */
  async findById(customerId: string, conn?: oracledb.Connection): Promise<CustomerWithGeographyRecord | null> {
    const shouldClose = !conn;
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `
        SELECT 
          c.CUSTOMER_ID,
          c.CUSTOMER_CODE,
          c.FULL_NAME,
          c.PRIMARY_MOBILE,
          c.NORMALIZED_MOBILE,
          c.ALTERNATE_MOBILE,
          c.RESIDENCE_PHONE,
          c.EMAIL,
          c.CUSTOMER_CATEGORY,
          c.ADDRESS_LINE,
          c.LANDMARK,
          c.STATE_ID,
          c.CITY_ID,
          c.PINCODE,
          c.GST_NUMBER,
          c.IS_ACTIVE,
          c.VERSION_NO,
          c.CREATED_AT,
          c.UPDATED_AT,
          c.CREATED_BY,
          c.UPDATED_BY,
          s.STATE_NAME,
          s.STATE_CODE,
          ci.CITY_NAME
        FROM CUSTOMERS c
        JOIN STATES s ON c.STATE_ID = s.STATE_ID
        JOIN CITIES ci ON c.CITY_ID = ci.CITY_ID
        WHERE c.CUSTOMER_ID = :customerId
      `;

      const result = await connection.execute(
        sql,
        { customerId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      return mapRowToCustomer(result.rows[0]);
    } finally {
      if (shouldClose) {
        await connection.close();
      }
    }
  }

  /**
   * Creates a new customer within a transaction.
   */
  async createCustomer(
    input: CreateCustomerInput,
    conn?: oracledb.Connection
  ): Promise<CustomerWithGeographyRecord> {
    const shouldClose = !conn;
    const connection = conn || (await getOracleConnection());
    try {
      const customerId = crypto.randomUUID();
      const normalizedMobile = normalizeIndianMobile(input.primaryMobile);

      // Generate Customer Code atomically from sequence
      const seqRes = await connection.execute<{ CODE: string }>(
        `SELECT 'C' || CUSTOMER_CODE_SEQ.NEXTVAL AS CODE FROM DUAL`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const customerCode = seqRes.rows?.[0]?.CODE;
      if (!customerCode) {
        throw new Error('Failed to generate Customer Code from CUSTOMER_CODE_SEQ');
      }

      const insertSql = `
        INSERT INTO CUSTOMERS (
          CUSTOMER_ID,
          CUSTOMER_CODE,
          FULL_NAME,
          PRIMARY_MOBILE,
          NORMALIZED_MOBILE,
          ALTERNATE_MOBILE,
          RESIDENCE_PHONE,
          EMAIL,
          CUSTOMER_CATEGORY,
          ADDRESS_LINE,
          LANDMARK,
          STATE_ID,
          CITY_ID,
          PINCODE,
          GST_NUMBER,
          IS_ACTIVE,
          CREATED_BY
        ) VALUES (
          :customerId,
          :customerCode,
          :fullName,
          :primaryMobile,
          :normalizedMobile,
          :alternateMobile,
          :residencePhone,
          :email,
          :customerCategory,
          :addressLine,
          :landmark,
          :stateId,
          :cityId,
          :pincode,
          :gstNumber,
          'Y',
          :createdBy
        )
      `;

      await connection.execute(
        insertSql,
        {
          customerId,
          customerCode,
          fullName: input.fullName.trim(),
          primaryMobile: input.primaryMobile.trim(),
          normalizedMobile,
          alternateMobile: input.alternateMobile?.trim() || null,
          residencePhone: input.residencePhone?.trim() || null,
          email: input.email?.trim() || null,
          customerCategory: input.customerCategory || 'INDIVIDUAL',
          addressLine: input.addressLine.trim(),
          landmark: input.landmark?.trim() || null,
          stateId: input.stateId,
          cityId: input.cityId,
          pincode: input.pincode.trim(),
          gstNumber: input.gstNumber?.trim() || null,
          createdBy: input.createdBy || 'SYSTEM',
        },
        { autoCommit: shouldClose }
      );

      const created = await this.findById(customerId, connection);
      if (!created) {
        throw new Error(`Failed to retrieve newly created customer: ${customerId}`);
      }
      return created;
    } finally {
      if (shouldClose) {
        await connection.close();
      }
    }
  }
}

export const customerRepository = new CustomerRepository();
