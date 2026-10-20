import crypto from 'crypto';
import oracledb from 'oracledb';
import {
  CallType,
  ServiceRequestStatus,
  ServiceRequestWithRelationsRecord,
  ServiceType,
  WarrantyStatus,
} from '../../types/callCenter.js';
import { PaginatedResult } from '../../types/catalog.js';
import { normalizeIndianMobile } from '../../utils/phoneUtils.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToServiceRequest(row: any): ServiceRequestWithRelationsRecord {
  return {
    requestId: row.REQUEST_ID,
    jobNumber: row.JOB_NUMBER,
    customerId: row.CUSTOMER_ID,
    brandId: row.BRAND_ID,
    productId: row.PRODUCT_ID,
    modelId: row.MODEL_ID,
    serialNumber: row.SERIAL_NUMBER || undefined,
    purchaseDate: row.PURCHASE_DATE ? new Date(row.PURCHASE_DATE) : undefined,
    invoiceNo: row.INVOICE_NO || undefined,
    dealerName: row.DEALER_NAME || undefined,
    callType: row.CALL_TYPE as CallType,
    serviceType: row.SERVICE_TYPE as ServiceType,
    status: row.STATUS as ServiceRequestStatus,
    warrantyStatus: row.WARRANTY_STATUS as WarrantyStatus,
    assignedLocationId: row.ASSIGNED_LOCATION_ID || undefined,
    assignedEngineerId: row.ASSIGNED_ENGINEER_ID || undefined,
    vocId: row.VOC_ID || undefined,
    vocDescription: row.VOC_DESCRIPTION || undefined,
    problemDescription: row.PROBLEM_DESCRIPTION || undefined,
    customerAddress: row.CUSTOMER_ADDRESS || undefined,
    customerPincode: row.CUSTOMER_PINCODE || undefined,
    customerStateId: row.CUSTOMER_STATE_ID || undefined,
    customerCityId: row.CUSTOMER_CITY_ID || undefined,
    customerPhone: row.CUSTOMER_PHONE || undefined,
    registeredBy: row.REGISTERED_BY || undefined,
    registeredByUsername: row.REGISTERED_BY_USERNAME || undefined,
    registeredAt: new Date(row.REGISTERED_AT),
    sla48hExpiresAt: row.SLA_48H_EXPIRES_AT ? new Date(row.SLA_48H_EXPIRES_AT) : undefined,
    acknowledgedAt: row.ACKNOWLEDGED_AT ? new Date(row.ACKNOWLEDGED_AT) : undefined,
    appointmentDate: row.APPOINTMENT_DATE ? new Date(row.APPOINTMENT_DATE) : undefined,
    appointmentSlot: row.APPOINTMENT_SLOT || undefined,
    travelDistanceKm: row.TRAVEL_DISTANCE_KM != null ? Number(row.TRAVEL_DISTANCE_KM) : undefined,
    areaType: row.AREA_TYPE || undefined,
    checkedInAt: row.CHECKED_IN_AT ? new Date(row.CHECKED_IN_AT) : undefined,
    slaBreached48h: row.SLA_BREACHED_48H || 'N',
    slaBreached48hAt: row.SLA_BREACHED_48H_AT ? new Date(row.SLA_BREACHED_48H_AT) : undefined,
    idempotencyKey: row.IDEMPOTENCY_KEY || undefined,
    versionNo: Number(row.VERSION_NO || 1),
    createdAt: new Date(row.CREATED_AT),
    updatedAt: new Date(row.UPDATED_AT),
    customerName: row.CUSTOMER_NAME || 'Unknown Customer',
    customerCode: row.CUSTOMER_CODE || 'N/A',
    brandName: row.BRAND_NAME || 'Unknown Brand',
    brandCode: row.BRAND_CODE || 'N/A',
    productName: row.PRODUCT_NAME || 'Unknown Product',
    productCode: row.PRODUCT_CODE || 'N/A',
    modelName: row.MODEL_NAME || 'Unknown Model',
    modelCode: row.MODEL_CODE || 'N/A',
    assignedLocationName: row.ASSIGNED_LOCATION_NAME || undefined,
    assignedEngineerName: row.ASSIGNED_ENGINEER_NAME || undefined,
    assignedEngineerPhone: row.ASSIGNED_ENGINEER_PHONE || undefined,
    stateName: row.STATE_NAME || undefined,
    cityName: row.CITY_NAME || undefined,
  };
}

const BASE_SELECT_SQL = `
  SELECT 
    sr.REQUEST_ID,
    sr.JOB_NUMBER,
    sr.CUSTOMER_ID,
    sr.BRAND_ID,
    sr.PRODUCT_ID,
    sr.MODEL_ID,
    sr.SERIAL_NUMBER,
    sr.PURCHASE_DATE,
    sr.INVOICE_NO,
    sr.DEALER_NAME,
    sr.CALL_TYPE,
    sr.SERVICE_TYPE,
    sr.STATUS,
    sr.WARRANTY_STATUS,
    sr.ASSIGNED_LOCATION_ID,
    sr.ASSIGNED_ENGINEER_ID,
    sr.VOC_ID,
    sr.VOC_DESCRIPTION,
    sr.PROBLEM_DESCRIPTION,
    sr.CUSTOMER_ADDRESS,
    sr.CUSTOMER_PINCODE,
    sr.CUSTOMER_STATE_ID,
    sr.CUSTOMER_CITY_ID,
    sr.CUSTOMER_PHONE,
    sr.REGISTERED_BY,
    sr.REGISTERED_BY_USERNAME,
    sr.REGISTERED_AT,
    sr.SLA_48H_EXPIRES_AT,
    sr.ACKNOWLEDGED_AT,
    sr.APPOINTMENT_DATE,
    sr.APPOINTMENT_SLOT,
    sr.TRAVEL_DISTANCE_KM,
    sr.AREA_TYPE,
    sr.CHECKED_IN_AT,
    sr.SLA_BREACHED_48H,
    sr.SLA_BREACHED_48H_AT,
    sr.IDEMPOTENCY_KEY,
    sr.VERSION_NO,
    sr.CREATED_AT,
    sr.UPDATED_AT,
    c.FULL_NAME AS CUSTOMER_NAME,
    c.CUSTOMER_CODE AS CUSTOMER_CODE,
    b.BRAND_NAME,
    b.BRAND_CODE,
    p.PRODUCT_NAME,
    p.PRODUCT_CODE,
    m.MODEL_NAME,
    m.MODEL_CODE,
    loc.LOCATION_NAME AS ASSIGNED_LOCATION_NAME,
    u_eng.FULL_NAME AS ASSIGNED_ENGINEER_NAME,
    u_eng.PHONE_NUMBER AS ASSIGNED_ENGINEER_PHONE,
    s.STATE_NAME,
    ci.CITY_NAME
  FROM SERVICE_REQUESTS sr
  JOIN CUSTOMERS c ON sr.CUSTOMER_ID = c.CUSTOMER_ID
  JOIN BRANDS b ON sr.BRAND_ID = b.BRAND_ID
  JOIN PRODUCTS p ON sr.PRODUCT_ID = p.PRODUCT_ID
  JOIN MODELS m ON sr.MODEL_ID = m.MODEL_ID
  LEFT JOIN LOCATIONS loc ON sr.ASSIGNED_LOCATION_ID = loc.LOCATION_ID
  LEFT JOIN APP_USERS u_eng ON sr.ASSIGNED_ENGINEER_ID = u_eng.USER_ID
  LEFT JOIN STATES s ON sr.CUSTOMER_STATE_ID = s.STATE_ID
  LEFT JOIN CITIES ci ON sr.CUSTOMER_CITY_ID = ci.CITY_ID
`;

export class ServiceRequestRepository {
  /**
   * Generates a unique, concurrency-safe human-readable Job Number using an Oracle sequence.
   * Format: TT + BrandCode(2) + ProductCode(2) + YYMMDD + Seq(4) (e.g. TTSKAC2610201001)
   */
  async generateJobNumber(brandCode: string, productCode: string, conn: oracledb.Connection): Promise<string> {
    const brandPrefix = (brandCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 2) || 'XX').padEnd(2, 'X');
    const productPrefix = (productCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 2) || 'YY').padEnd(2, 'Y');

    const sql = `
      SELECT 'TT' || :brandPrefix || :productPrefix || TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'YYMMDD') || LPAD(JOB_NUMBER_SEQ.NEXTVAL, 4, '0') AS JOB_NO 
      FROM DUAL
    `;

    const res = await conn.execute<{ JOB_NO: string }>(
      sql,
      { brandPrefix, productPrefix },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const jobNo = res.rows?.[0]?.JOB_NO;
    if (!jobNo) {
      throw new Error('Failed to generate Job Number from JOB_NUMBER_SEQ');
    }
    return jobNo;
  }

  /**
   * Creates a service request in an active transaction.
   */
  async createServiceRequest(
    data: {
      jobNumber: string;
      customerId: string;
      brandId: string;
      productId: string;
      modelId: string;
      serialNumber?: string;
      purchaseDate?: Date;
      invoiceNo?: string;
      dealerName?: string;
      callType: CallType;
      serviceType: ServiceType;
      status: ServiceRequestStatus;
      warrantyStatus: WarrantyStatus;
      assignedLocationId?: string;
      vocId?: string;
      vocDescription?: string;
      problemDescription?: string;
      customerAddress?: string;
      customerPincode?: string;
      customerStateId?: string;
      customerCityId?: string;
      customerPhone?: string;
      registeredBy?: string;
      registeredByUsername?: string;
      sla48hExpiresAt?: Date;
      idempotencyKey?: string;
    },
    conn: oracledb.Connection
  ): Promise<ServiceRequestWithRelationsRecord> {
    const requestId = crypto.randomUUID();

    const insertSql = `
      INSERT INTO SERVICE_REQUESTS (
        REQUEST_ID,
        JOB_NUMBER,
        CUSTOMER_ID,
        BRAND_ID,
        PRODUCT_ID,
        MODEL_ID,
        SERIAL_NUMBER,
        PURCHASE_DATE,
        INVOICE_NO,
        DEALER_NAME,
        CALL_TYPE,
        SERVICE_TYPE,
        STATUS,
        WARRANTY_STATUS,
        ASSIGNED_LOCATION_ID,
        VOC_ID,
        VOC_DESCRIPTION,
        PROBLEM_DESCRIPTION,
        CUSTOMER_ADDRESS,
        CUSTOMER_PINCODE,
        CUSTOMER_STATE_ID,
        CUSTOMER_CITY_ID,
        CUSTOMER_PHONE,
        REGISTERED_BY,
        REGISTERED_BY_USERNAME,
        REGISTERED_AT,
        SLA_48H_EXPIRES_AT,
        IDEMPOTENCY_KEY
      ) VALUES (
        :requestId,
        :jobNumber,
        :customerId,
        :brandId,
        :productId,
        :modelId,
        :serialNumber,
        :purchaseDate,
        :invoiceNo,
        :dealerName,
        :callType,
        :serviceType,
        :status,
        :warrantyStatus,
        :assignedLocationId,
        :vocId,
        :vocDescription,
        :problemDescription,
        :customerAddress,
        :customerPincode,
        :customerStateId,
        :customerCityId,
        :customerPhone,
        :registeredBy,
        :registeredByUsername,
        SYSTIMESTAMP,
        :sla48hExpiresAt,
        :idempotencyKey
      )
    `;

    await conn.execute(insertSql, {
      requestId,
      jobNumber: data.jobNumber,
      customerId: data.customerId,
      brandId: data.brandId,
      productId: data.productId,
      modelId: data.modelId,
      serialNumber: data.serialNumber || null,
      purchaseDate: data.purchaseDate || null,
      invoiceNo: data.invoiceNo || null,
      dealerName: data.dealerName || null,
      callType: data.callType,
      serviceType: data.serviceType,
      status: data.status,
      warrantyStatus: data.warrantyStatus,
      assignedLocationId: data.assignedLocationId || null,
      vocId: data.vocId || null,
      vocDescription: data.vocDescription || null,
      problemDescription: data.problemDescription || null,
      customerAddress: data.customerAddress || null,
      customerPincode: data.customerPincode || null,
      customerStateId: data.customerStateId || null,
      customerCityId: data.customerCityId || null,
      customerPhone: data.customerPhone || null,
      registeredBy: data.registeredBy || null,
      registeredByUsername: data.registeredByUsername || null,
      sla48hExpiresAt: data.sla48hExpiresAt || null,
      idempotencyKey: data.idempotencyKey || null,
    });

    const record = await this.findById(requestId, conn);
    if (!record) {
      throw new Error(`Failed to retrieve newly inserted service request: ${requestId}`);
    }
    return record;
  }

  async findById(
    requestId: string,
    conn?: oracledb.Connection
  ): Promise<ServiceRequestWithRelationsRecord | null> {
    const shouldClose = !conn;
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `${BASE_SELECT_SQL} WHERE sr.REQUEST_ID = :requestId`;
      const result = await connection.execute(sql, { requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToServiceRequest(result.rows[0]);
    } finally {
      if (shouldClose) await connection.close();
    }
  }

  async findByJobNumber(
    jobNumber: string,
    conn?: oracledb.Connection
  ): Promise<ServiceRequestWithRelationsRecord | null> {
    const shouldClose = !conn;
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `${BASE_SELECT_SQL} WHERE UPPER(sr.JOB_NUMBER) = :jobNumber`;
      const result = await connection.execute(
        sql,
        { jobNumber: jobNumber.trim().toUpperCase() },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToServiceRequest(result.rows[0]);
    } finally {
      if (shouldClose) await connection.close();
    }
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
    conn?: oracledb.Connection
  ): Promise<ServiceRequestWithRelationsRecord | null> {
    const shouldClose = !conn;
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `${BASE_SELECT_SQL} WHERE sr.IDEMPOTENCY_KEY = :idempotencyKey`;
      const result = await connection.execute(
        sql,
        { idempotencyKey },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToServiceRequest(result.rows[0]);
    } finally {
      if (shouldClose) await connection.close();
    }
  }

  /**
   * Search service requests by job number, customer mobile, or product serial number.
   */
  async searchRequests(options: {
    q?: string;
    jobNumber?: string;
    mobile?: string;
    serialNumber?: string;
    customerId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<ServiceRequestWithRelationsRecord>> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 10));
    const offset = (page - 1) * limit;

    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = ['1=1'];

      if (options.q && options.q.trim()) {
        const query = options.q.trim();
        const norm = normalizeIndianMobile(query);
        binds.queryUpper = `%${query.toUpperCase()}%`;
        let qClause = '(UPPER(sr.JOB_NUMBER) LIKE :queryUpper OR UPPER(sr.SERIAL_NUMBER) LIKE :queryUpper)';
        if (norm) {
          binds.normPhone = `%${norm}%`;
          qClause += ' OR (c.NORMALIZED_MOBILE LIKE :normPhone OR sr.CUSTOMER_PHONE LIKE :normPhone)';
        }
        whereClauses.push(`(${qClause})`);
      }

      if (options.jobNumber && options.jobNumber.trim()) {
        binds.jobNumber = `%${options.jobNumber.trim().toUpperCase()}%`;
        whereClauses.push('UPPER(sr.JOB_NUMBER) LIKE :jobNumber');
      }

      if (options.mobile && options.mobile.trim()) {
        const norm = normalizeIndianMobile(options.mobile.trim());
        binds.mobile = `%${norm || options.mobile.trim()}%`;
        whereClauses.push('(c.NORMALIZED_MOBILE LIKE :mobile OR sr.CUSTOMER_PHONE LIKE :mobile)');
      }

      if (options.serialNumber && options.serialNumber.trim()) {
        binds.serialNumber = `%${options.serialNumber.trim().toUpperCase()}%`;
        whereClauses.push('UPPER(sr.SERIAL_NUMBER) LIKE :serialNumber');
      }

      if (options.customerId) {
        binds.customerId = options.customerId;
        whereClauses.push('sr.CUSTOMER_ID = :customerId');
      }

      if (options.status) {
        binds.status = options.status;
        whereClauses.push('sr.STATUS = :status');
      }

      const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM SERVICE_REQUESTS sr
        JOIN CUSTOMERS c ON sr.CUSTOMER_ID = c.CUSTOMER_ID
        ${whereSql}
      `;

      const countRes = await conn.execute<{ CNT: number }>(countSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      const total = countRes.rows?.[0]?.CNT ?? 0;

      const dataSql = `
        ${BASE_SELECT_SQL}
        ${whereSql}
        ORDER BY sr.REGISTERED_AT DESC, sr.REQUEST_ID ASC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataRes = await conn.execute(
        dataSql,
        { ...binds, offset, limit },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const items = (dataRes.rows || []).map(mapRowToServiceRequest);

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
   * List recent complaints lodged, optionally filtered by status or customer.
   */
  async listRecent(options?: {
    limit?: number;
    customerId?: string;
    status?: string;
  }): Promise<ServiceRequestWithRelationsRecord[]> {
    const limit = Math.min(50, Math.max(1, options?.limit || 10));
    const conn = await getOracleConnection();

    try {
      const binds: Record<string, any> = { limit };
      const whereClauses: string[] = ['1=1'];

      if (options?.customerId) {
        binds.customerId = options.customerId;
        whereClauses.push('sr.CUSTOMER_ID = :customerId');
      }

      if (options?.status) {
        binds.status = options.status;
        whereClauses.push('sr.STATUS = :status');
      }

      const sql = `
        ${BASE_SELECT_SQL}
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY sr.REGISTERED_AT DESC
        FETCH FIRST :limit ROWS ONLY
      `;

      const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (result.rows || []).map(mapRowToServiceRequest);
    } finally {
      await conn.close();
    }
  }

  /**
   * Executes the single-commit dispatch updates on a service request within an active transaction.
   */
  async dispatchServiceRequest(
    params: {
      requestId: string;
      appointmentDate: Date;
      appointmentSlot: string;
      engineerId: string;
      locationId?: string;
      travelDistanceKm?: number;
      areaType?: 'LOCAL' | 'UPCOUNTRY';
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE SERVICE_REQUESTS
      SET 
        STATUS = 'APPOINTMENT_SCHEDULED',
        ASSIGNED_ENGINEER_ID = :engineerId,
        ASSIGNED_LOCATION_ID = COALESCE(:locationId, ASSIGNED_LOCATION_ID),
        APPOINTMENT_DATE = :appointmentDate,
        APPOINTMENT_SLOT = :appointmentSlot,
        TRAVEL_DISTANCE_KM = :travelDistanceKm,
        AREA_TYPE = :areaType,
        ACKNOWLEDGED_AT = COALESCE(ACKNOWLEDGED_AT, SYSTIMESTAMP),
        VERSION_NO = VERSION_NO + 1,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REQUEST_ID = :requestId
    `;

    await conn.execute(sql, {
      requestId: params.requestId,
      engineerId: params.engineerId,
      locationId: params.locationId || null,
      appointmentDate: params.appointmentDate,
      appointmentSlot: params.appointmentSlot,
      travelDistanceKm: params.travelDistanceKm != null ? params.travelDistanceKm : null,
      areaType: params.areaType || null,
    });
  }

  /**
   * Transitions service request to TECHNICIAN_CHECKED_IN upon successful customer OTP verification.
   */
  async updateCheckIn(requestId: string, conn: oracledb.Connection): Promise<void> {
    const sql = `
      UPDATE SERVICE_REQUESTS
      SET 
        STATUS = 'TECHNICIAN_CHECKED_IN',
        CHECKED_IN_AT = SYSTIMESTAMP,
        VERSION_NO = VERSION_NO + 1,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REQUEST_ID = :requestId
    `;
    await conn.execute(sql, { requestId });
  }

  /**
   * Marks a service request as having breached the 48-hour acknowledgement threshold.
   */
  async markSlaBreach(requestId: string, conn: oracledb.Connection): Promise<void> {
    const sql = `
      UPDATE SERVICE_REQUESTS
      SET 
        SLA_BREACHED_48H = 'Y',
        SLA_BREACHED_48H_AT = SYSTIMESTAMP,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REQUEST_ID = :requestId
    `;
    await conn.execute(sql, { requestId });
  }

  /**
   * Finds unacknowledged requests that exceeded 48 hours for batch SLA evaluation.
   */
  async findUnacknowledgedSlaBreaches(conn: oracledb.Connection): Promise<ServiceRequestWithRelationsRecord[]> {
    const sql = `
      ${BASE_SELECT_SQL}
      WHERE sr.STATUS IN ('REGISTERED', 'ASSIGNED_TO_ASF')
        AND sr.ACKNOWLEDGED_AT IS NULL
        AND SYSTIMESTAMP > sr.SLA_48H_EXPIRES_AT
        AND sr.SLA_BREACHED_48H = 'N'
      FOR UPDATE OF sr.REQUEST_ID SKIP LOCKED
    `;
    const result = await conn.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return (result.rows || []).map(mapRowToServiceRequest);
  }

  /**
   * Queries the ASF incoming work queue with role scoping, status views, SLA countdown, and search.
   */
  async queryAsfQueue(
    filters: {
      view?: 'all' | 'unacknowledged' | 'ready_to_assign' | 'scheduled' | 'checked_in' | 'overdue';
      locationId?: string;
      q?: string;
      page?: number;
      limit?: number;
    },
    actorLocationId?: string,
    isAdmin = false
  ): Promise<PaginatedResult<ServiceRequestWithRelationsRecord>> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = ['1=1'];

      // Location scoping
      if (!isAdmin) {
        if (actorLocationId) {
          binds.actorLocId = actorLocationId;
          whereClauses.push('sr.ASSIGNED_LOCATION_ID = :actorLocId');
        } else {
          whereClauses.push('1=0');
        }
      } else if (filters.locationId) {
        binds.filterLocId = filters.locationId;
        whereClauses.push('sr.ASSIGNED_LOCATION_ID = :filterLocId');
      }

      // Filter views
      if (filters.view === 'unacknowledged') {
        whereClauses.push("sr.ACKNOWLEDGED_AT IS NULL AND sr.STATUS IN ('REGISTERED', 'ASSIGNED_TO_ASF')");
      } else if (filters.view === 'ready_to_assign') {
        whereClauses.push("sr.STATUS IN ('REGISTERED', 'ASSIGNED_TO_ASF', 'ACKNOWLEDGED') AND sr.ASSIGNED_ENGINEER_ID IS NULL");
      } else if (filters.view === 'scheduled') {
        whereClauses.push("sr.STATUS = 'APPOINTMENT_SCHEDULED'");
      } else if (filters.view === 'checked_in') {
        whereClauses.push("sr.STATUS = 'TECHNICIAN_CHECKED_IN'");
      } else if (filters.view === 'overdue') {
        whereClauses.push("(sr.SLA_BREACHED_48H = 'Y' OR (sr.ACKNOWLEDGED_AT IS NULL AND SYSTIMESTAMP > sr.SLA_48H_EXPIRES_AT))");
      } else {
        // 'all' active operational jobs
        whereClauses.push("sr.STATUS NOT IN ('CLOSED', 'CANCELLED', 'REPLACED')");
      }

      // Search term
      if (filters.q && filters.q.trim()) {
        const cleanQ = filters.q.trim();
        binds.searchExact = cleanQ.toUpperCase();
        binds.searchLike = `%${cleanQ.toLowerCase()}%`;
        const phone = normalizeIndianMobile(cleanQ);
        if (phone) {
          binds.searchPhone = phone;
          whereClauses.push(
            '(sr.JOB_NUMBER = :searchExact OR sr.SERIAL_NUMBER = :searchExact OR sr.CUSTOMER_PHONE = :searchPhone OR LOWER(c.FULL_NAME) LIKE :searchLike)'
          );
        } else {
          whereClauses.push(
            '(sr.JOB_NUMBER = :searchExact OR sr.SERIAL_NUMBER = :searchExact OR LOWER(c.FULL_NAME) LIKE :searchLike)'
          );
        }
      }

      const whereSql = whereClauses.join(' AND ');

      // Total count
      const countSql = `
        SELECT COUNT(*) AS TOTAL
        FROM SERVICE_REQUESTS sr
        JOIN CUSTOMERS c ON sr.CUSTOMER_ID = c.CUSTOMER_ID
        WHERE ${whereSql}
      `;
      const countRes = await conn.execute<any>(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const total = Number(countRes.rows?.[0]?.TOTAL || 0);

      // Data query with ordering
      // Overdue / urgent SLA first, then appointment date or registration timestamp
      const dataSql = `
        ${BASE_SELECT_SQL}
        WHERE ${whereSql}
        ORDER BY 
          CASE WHEN sr.ACKNOWLEDGED_AT IS NULL AND SYSTIMESTAMP > sr.SLA_48H_EXPIRES_AT THEN 0 ELSE 1 END ASC,
          sr.SLA_48H_EXPIRES_AT ASC,
          sr.REGISTERED_AT DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      binds.offset = offset;
      binds.limit = limit;

      const dataRes = await conn.execute<any>(dataSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const items = (dataRes.rows || []).map(mapRowToServiceRequest);

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } finally {
      await conn.close();
    }
  }

  /**
   * Retrieves visits and jobs assigned to a specific field service engineer.
   */
  async findEngineerJobs(
    engineerId: string,
    params: {
      status?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<PaginatedResult<ServiceRequestWithRelationsRecord>> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = { engineerId };
      const whereClauses: string[] = ['sr.ASSIGNED_ENGINEER_ID = :engineerId'];

      if (params.status) {
        binds.status = params.status;
        whereClauses.push('sr.STATUS = :status');
      }

      const whereSql = whereClauses.join(' AND ');

      const countSql = `
        SELECT COUNT(*) AS TOTAL
        FROM SERVICE_REQUESTS sr
        WHERE ${whereSql}
      `;
      const countRes = await conn.execute<any>(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const total = Number(countRes.rows?.[0]?.TOTAL || 0);

      const dataSql = `
        ${BASE_SELECT_SQL}
        WHERE ${whereSql}
        ORDER BY 
          sr.APPOINTMENT_DATE ASC NULLS LAST,
          sr.REGISTERED_AT DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      binds.offset = offset;
      binds.limit = limit;

      const dataRes = await conn.execute<any>(dataSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const items = (dataRes.rows || []).map(mapRowToServiceRequest);

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } finally {
      await conn.close();
    }
  }
}

export const serviceRequestRepository = new ServiceRequestRepository();
