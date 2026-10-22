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
    // Phase 2B diagnosis and repair fields
    faultId: row.FAULT_ID || undefined,
    defectId: row.DEFECT_ID || undefined,
    repairCodeId: row.REPAIR_CODE_ID || undefined,
    voeDescription: row.VOE_DESCRIPTION || undefined,
    observations: row.OBSERVATIONS || undefined,
    repairAction: row.REPAIR_ACTION || undefined,
    repairRemarks: row.REPAIR_REMARKS || undefined,
    repairAt: row.REPAIR_AT || 'ON_SITE',
    diagnosedAt: row.DIAGNOSED_AT ? new Date(row.DIAGNOSED_AT) : undefined,
    diagnosedBy: row.DIAGNOSED_BY || undefined,
    repairedAt: row.REPAIRED_AT ? new Date(row.REPAIRED_AT) : undefined,
    repairedBy: row.REPAIRED_BY || undefined,
    replacementReason: row.REPLACEMENT_REASON || undefined,
    replacementRemarks: row.REPLACEMENT_REMARKS || undefined,
    cancellationReason: row.CANCELLATION_REASON || undefined,
    cancellationRemarks: row.CANCELLATION_REMARKS || undefined,
    specialPartEstimateRemarks: row.SPECIAL_PART_ESTIMATE_REMARKS || undefined,
    specialPartEstimateAmount: row.SPECIAL_PART_ESTIMATE_AMOUNT != null ? Number(row.SPECIAL_PART_ESTIMATE_AMOUNT) : undefined,
    specialPartApprovedAt: row.SPECIAL_PART_APPROVED_AT ? new Date(row.SPECIAL_PART_APPROVED_AT) : undefined,
    specialPartApprovedBy: row.SPECIAL_PART_APPROVED_BY || undefined,
    laborCharge: Number(row.LABOR_CHARGE || 0),
    partsTotalCharge: Number(row.PARTS_TOTAL_CHARGE || 0),
    totalEstimateAmount: Number(row.TOTAL_ESTIMATE_AMOUNT || 0),
    // Phase 2C additions
    replacementApprovalNo: row.REPLACEMENT_APPROVAL_NO || undefined,
    closedAt: row.CLOSED_AT ? new Date(row.CLOSED_AT) : undefined,
    closedBy: row.CLOSED_BY || undefined,
    cancelledAt: row.CANCELLED_AT ? new Date(row.CANCELLED_AT) : undefined,
    cancelledBy: row.CANCELLED_BY || undefined,
    supervisorOverrideReason: row.SUPERVISOR_OVERRIDE_REASON || undefined,
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
    // Phase 2B relations
    faultCode: row.FAULT_CODE || undefined,
    faultDescription: row.FAULT_DESCRIPTION || undefined,
    defectCode: row.DEFECT_CODE || undefined,
    defectDescription: row.DEFECT_DESCRIPTION || undefined,
    repairCode: row.REPAIR_CODE || undefined,
    repairActionDescription: row.REPAIR_ACTION_DESC || undefined,
    diagnosedByName: row.DIAGNOSED_BY_NAME || undefined,
    repairedByName: row.REPAIRED_BY_NAME || undefined,
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
    sr.FAULT_ID,
    sr.DEFECT_ID,
    sr.REPAIR_CODE_ID,
    sr.VOE_DESCRIPTION,
    sr.OBSERVATIONS,
    sr.REPAIR_ACTION,
    sr.REPAIR_REMARKS,
    sr.REPAIR_AT,
    sr.DIAGNOSED_AT,
    sr.DIAGNOSED_BY,
    sr.REPAIRED_AT,
    sr.REPAIRED_BY,
    sr.REPLACEMENT_REASON,
    sr.REPLACEMENT_REMARKS,
    sr.CANCELLATION_REASON,
    sr.CANCELLATION_REMARKS,
    sr.SPECIAL_PART_ESTIMATE_REMARKS,
    sr.SPECIAL_PART_ESTIMATE_AMOUNT,
    sr.SPECIAL_PART_APPROVED_AT,
    sr.SPECIAL_PART_APPROVED_BY,
    sr.LABOR_CHARGE,
    sr.PARTS_TOTAL_CHARGE,
    sr.TOTAL_ESTIMATE_AMOUNT,
    sr.REPLACEMENT_APPROVAL_NO,
    sr.CLOSED_AT,
    sr.CLOSED_BY,
    sr.CANCELLED_AT,
    sr.CANCELLED_BY,
    sr.SUPERVISOR_OVERRIDE_REASON,
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
    ci.CITY_NAME,
    fm.FAULT_CODE,
    fm.FAULT_DESCRIPTION,
    dm.DEFECT_CODE,
    dm.DEFECT_DESCRIPTION,
    rcm.REPAIR_CODE,
    rcm.REPAIR_ACTION AS REPAIR_ACTION_DESC,
    u_diag.FULL_NAME AS DIAGNOSED_BY_NAME,
    u_rep.FULL_NAME AS REPAIRED_BY_NAME
  FROM SERVICE_REQUESTS sr
  JOIN CUSTOMERS c ON sr.CUSTOMER_ID = c.CUSTOMER_ID
  JOIN BRANDS b ON sr.BRAND_ID = b.BRAND_ID
  JOIN PRODUCTS p ON sr.PRODUCT_ID = p.PRODUCT_ID
  JOIN MODELS m ON sr.MODEL_ID = m.MODEL_ID
  LEFT JOIN LOCATIONS loc ON sr.ASSIGNED_LOCATION_ID = loc.LOCATION_ID
  LEFT JOIN APP_USERS u_eng ON sr.ASSIGNED_ENGINEER_ID = u_eng.USER_ID
  LEFT JOIN STATES s ON sr.CUSTOMER_STATE_ID = s.STATE_ID
  LEFT JOIN CITIES ci ON sr.CUSTOMER_CITY_ID = ci.CITY_ID
  LEFT JOIN FAULT_MASTERS fm ON sr.FAULT_ID = fm.FAULT_ID
  LEFT JOIN DEFECT_MASTERS dm ON sr.DEFECT_ID = dm.DEFECT_ID
  LEFT JOIN REPAIR_CODE_MASTERS rcm ON sr.REPAIR_CODE_ID = rcm.REPAIR_CODE_ID
  LEFT JOIN APP_USERS u_diag ON sr.DIAGNOSED_BY = u_diag.USER_ID
  LEFT JOIN APP_USERS u_rep ON sr.REPAIRED_BY = u_rep.USER_ID
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
   * Updates diagnosis on a service request and transitions status to IN_PROGRESS_REPAIR.
   */
  async updateDiagnosis(
    params: {
      requestId: string;
      faultId: string;
      defectId?: string;
      voeDescription: string;
      observations?: string;
      diagnosedBy: string;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE SERVICE_REQUESTS
      SET 
        STATUS = 'IN_PROGRESS_REPAIR',
        FAULT_ID = :faultId,
        DEFECT_ID = :defectId,
        VOE_DESCRIPTION = :voeDescription,
        OBSERVATIONS = :observations,
        DIAGNOSED_AT = SYSTIMESTAMP,
        DIAGNOSED_BY = :diagnosedBy,
        VERSION_NO = VERSION_NO + 1,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REQUEST_ID = :requestId
    `;
    await conn.execute(sql, {
      requestId: params.requestId,
      faultId: params.faultId,
      defectId: params.defectId || null,
      voeDescription: params.voeDescription,
      observations: params.observations || null,
      diagnosedBy: params.diagnosedBy,
    });
  }

  /**
   * Updates repair outcome, action, and resulting state on a service request.
   */
  async updateRepairAction(
    params: {
      requestId: string;
      targetStatus: ServiceRequestStatus;
      repairCodeId: string;
      repairAction: string;
      repairRemarks?: string;
      repairAt?: 'ON_SITE' | 'IN_HOUSE';
      replacementReason?: string;
      replacementRemarks?: string;
      cancellationReason?: string;
      cancellationRemarks?: string;
      specialPartRemarks?: string;
      repairedBy: string;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE SERVICE_REQUESTS
      SET 
        STATUS = :targetStatus,
        REPAIR_CODE_ID = :repairCodeId,
        REPAIR_ACTION = :repairAction,
        REPAIR_REMARKS = :repairRemarks,
        REPAIR_AT = :repairAt,
        REPLACEMENT_REASON = :replacementReason,
        REPLACEMENT_REMARKS = :replacementRemarks,
        CANCELLATION_REASON = :cancellationReason,
        CANCELLATION_REMARKS = :cancellationRemarks,
        SPECIAL_PART_ESTIMATE_REMARKS = :specialPartRemarks,
        REPAIRED_AT = SYSTIMESTAMP,
        REPAIRED_BY = :repairedBy,
        VERSION_NO = VERSION_NO + 1,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REQUEST_ID = :requestId
    `;
    await conn.execute(sql, {
      requestId: params.requestId,
      targetStatus: params.targetStatus,
      repairCodeId: params.repairCodeId,
      repairAction: params.repairAction,
      repairRemarks: params.repairRemarks || null,
      repairAt: params.repairAt || 'ON_SITE',
      replacementReason: params.replacementReason || null,
      replacementRemarks: params.replacementRemarks || null,
      cancellationReason: params.cancellationReason || null,
      cancellationRemarks: params.cancellationRemarks || null,
      specialPartRemarks: params.specialPartRemarks || null,
      repairedBy: params.repairedBy,
    });
  }

  /**
   * Sets warehouse quotation amount on special-part estimate and moves to SPECIAL_PART_ESTIMATE_PROVIDED.
   */
  async updateSpecialPartQuotation(
    params: {
      requestId: string;
      estimateAmount: number;
      remarks?: string;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE SERVICE_REQUESTS
      SET 
        STATUS = 'SPECIAL_PART_ESTIMATE_PROVIDED',
        SPECIAL_PART_ESTIMATE_AMOUNT = :estimateAmount,
        SPECIAL_PART_ESTIMATE_REMARKS = COALESCE(:remarks, SPECIAL_PART_ESTIMATE_REMARKS),
        TOTAL_ESTIMATE_AMOUNT = :estimateAmount + LABOR_CHARGE,
        VERSION_NO = VERSION_NO + 1,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REQUEST_ID = :requestId
    `;
    await conn.execute(sql, {
      requestId: params.requestId,
      estimateAmount: params.estimateAmount,
      remarks: params.remarks || null,
    });
  }

  /**
   * Records customer decision on special-part estimate and updates state.
   */
  async updateSpecialPartDecision(
    params: {
      requestId: string;
      targetStatus: ServiceRequestStatus;
      approvedBy: string;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE SERVICE_REQUESTS
      SET 
        STATUS = :targetStatus,
        SPECIAL_PART_APPROVED_AT = SYSTIMESTAMP,
        SPECIAL_PART_APPROVED_BY = :approvedBy,
        VERSION_NO = VERSION_NO + 1,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REQUEST_ID = :requestId
    `;
    await conn.execute(sql, {
      requestId: params.requestId,
      targetStatus: params.targetStatus,
      approvedBy: params.approvedBy,
    });
  }

  /**
   * Updates parts total charge and recalculates total estimate amount atomically.
   */
  async updateFinancialCharges(
    params: {
      requestId: string;
      partsTotalCharge: number;
      laborCharge?: number;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE SERVICE_REQUESTS
      SET 
        PARTS_TOTAL_CHARGE = :partsTotalCharge,
        LABOR_CHARGE = NVL(:laborCharge, LABOR_CHARGE),
        TOTAL_ESTIMATE_AMOUNT = :partsTotalCharge + NVL(:laborCharge, LABOR_CHARGE),
        VERSION_NO = VERSION_NO + 1,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REQUEST_ID = :requestId
    `;
    await conn.execute(sql, {
      requestId: params.requestId,
      partsTotalCharge: params.partsTotalCharge,
      laborCharge: { val: params.laborCharge != null ? params.laborCharge : null, type: oracledb.NUMBER },
    });
  }

  /**
   * Updates status of service request with version increment.
   */
  async updateStatus(
    requestId: string,
    targetStatus: ServiceRequestStatus,
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE SERVICE_REQUESTS
      SET 
        STATUS = :targetStatus,
        VERSION_NO = VERSION_NO + 1,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REQUEST_ID = :requestId
    `;
    await conn.execute(sql, { requestId, targetStatus });
  }

  /**
   * Permanently closes service request on Happy Code verification or supervisor override.
   */
  async closeServiceRequest(
    params: {
      requestId: string;
      closedBy: string;
      supervisorOverrideReason?: string;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE SERVICE_REQUESTS
      SET 
        STATUS = 'CLOSED',
        CLOSED_AT = SYSTIMESTAMP,
        CLOSED_BY = :closedBy,
        SUPERVISOR_OVERRIDE_REASON = :supervisorOverrideReason,
        VERSION_NO = VERSION_NO + 1,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REQUEST_ID = :requestId
    `;
    await conn.execute(sql, {
      requestId: params.requestId,
      closedBy: params.closedBy,
      supervisorOverrideReason: params.supervisorOverrideReason || null,
    });
  }

  /**
   * Permanently cancels service request on supervisor approval.
   */
  async cancelServiceRequest(
    params: {
      requestId: string;
      cancelledBy: string;
      cancellationReason?: string;
      cancellationRemarks?: string;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE SERVICE_REQUESTS
      SET 
        STATUS = 'CANCELLED',
        CANCELLED_AT = SYSTIMESTAMP,
        CANCELLED_BY = :cancelledBy,
        CANCELLATION_REASON = COALESCE(:cancellationReason, CANCELLATION_REASON),
        CANCELLATION_REMARKS = COALESCE(:cancellationRemarks, CANCELLATION_REMARKS),
        VERSION_NO = VERSION_NO + 1,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REQUEST_ID = :requestId
    `;
    await conn.execute(sql, {
      requestId: params.requestId,
      cancelledBy: params.cancelledBy,
      cancellationReason: params.cancellationReason || null,
      cancellationRemarks: params.cancellationRemarks || null,
    });
  }

  /**
   * Approves product replacement and stores official approval number.
   */
  async approveReplacement(
    params: {
      requestId: string;
      approvalNumber: string;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE SERVICE_REQUESTS
      SET 
        STATUS = 'REPLACEMENT_APPROVED',
        REPLACEMENT_APPROVAL_NO = :approvalNumber,
        VERSION_NO = VERSION_NO + 1,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REQUEST_ID = :requestId
    `;
    await conn.execute(sql, {
      requestId: params.requestId,
      approvalNumber: params.approvalNumber,
    });
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
