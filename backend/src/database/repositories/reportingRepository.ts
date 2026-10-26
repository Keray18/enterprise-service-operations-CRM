import oracledb from 'oracledb';
import { getOracleConnection } from '../oraclePool.js';

export interface CallRegisterFilter {
  fromDate?: string;
  toDate?: string;
  brandId?: string;
  locationId?: string;
  status?: string;
  callType?: string;
  limit?: number;
  offset?: number;
}

export interface CallRegisterRow {
  requestId: string;
  jobNumber: string;
  customerName: string;
  customerPhone: string;
  customerCity: string;
  customerState: string;
  brandName: string;
  productName: string;
  modelName: string;
  serialNumber: string;
  callType: string;
  status: string;
  assignedLocation: string;
  assignedEngineer: string;
  registeredAt: Date;
  acknowledgedAt?: Date;
  closedAt?: Date;
  isHappyCodeVerified: string;
  tatHours?: number;
  slaBreached48h: string;
  slaBreached168h: string;
}

export interface PartConsumptionRow {
  partCode: string;
  partName: string;
  brandName: string;
  quantityConsumed: number;
  faultDescription?: string;
  defectDescription?: string;
  consumedAtLocation: string;
  totalCost: number;
}

export interface WarrantyClaimReportRow {
  claimNumber: string;
  claimPeriod: string;
  asfLocationName: string;
  brandName: string;
  totalJobsCount: number;
  grossLaborAmount: number;
  grossTravelAmount: number;
  netClaimAmount: number;
  status: string;
  settlementNumber?: string;
  settledAt?: Date;
  journalNumber?: string;
  createdAt: Date;
}

export interface StockValuationRow {
  locationName: string;
  locationType: string;
  partCode: string;
  partName: string;
  category: string;
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unitCostPrice: number;
  totalValuation: number;
  reconciledAt?: Date;
}

export class ReportingRepository {
  /**
   * Universal Call Register report with server-side scoped filters.
   */
  async getCallRegister(filter: CallRegisterFilter): Promise<CallRegisterRow[]> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const where: string[] = ['1=1'];

      if (filter.brandId) {
        binds.brandId = filter.brandId;
        where.push('sr.BRAND_ID = :brandId');
      }

      if (filter.locationId) {
        binds.locationId = filter.locationId;
        where.push('sr.ASSIGNED_LOCATION_ID = :locationId');
      }

      if (filter.status) {
        binds.status = filter.status;
        where.push('sr.STATUS = :status');
      }

      if (filter.callType) {
        binds.callType = filter.callType;
        where.push('sr.CALL_TYPE = :callType');
      }

      if (filter.fromDate) {
        binds.fromDate = filter.fromDate;
        where.push('sr.CREATED_AT >= TO_DATE(:fromDate, \'YYYY-MM-DD\')');
      }

      if (filter.toDate) {
        binds.toDate = filter.toDate;
        where.push('sr.CREATED_AT < TO_DATE(:toDate, \'YYYY-MM-DD\') + 1');
      }

      const limit = Math.min(10000, filter.limit || 500);
      const offset = filter.offset || 0;
      binds.limit = limit;
      binds.offset = offset;

      const sql = `
        SELECT 
          sr.REQUEST_ID,
          sr.JOB_NUMBER,
          c.FULL_NAME AS CUSTOMER_NAME,
          c.PRIMARY_MOBILE AS CUSTOMER_PHONE,
          ci.CITY_NAME AS CUSTOMER_CITY,
          st.STATE_NAME AS CUSTOMER_STATE,
          b.BRAND_NAME,
          p.PRODUCT_NAME,
          m.MODEL_NAME,
          NVL(sr.SERIAL_NUMBER, 'N/A') AS SERIAL_NUMBER,
          sr.CALL_TYPE,
          sr.STATUS,
          NVL(loc.LOCATION_NAME, 'Unassigned') AS ASSIGNED_LOCATION,
          NVL(u.FULL_NAME, 'Unassigned') AS ASSIGNED_ENGINEER,
          sr.REGISTERED_AT,
          sr.ACKNOWLEDGED_AT,
          sr.CLOSED_AT,
          CASE WHEN srv.HAPPY_CODE_VERIFIED_AT IS NOT NULL THEN 'Y' ELSE 'N' END AS IS_HAPPY_CODE_VERIFIED,
          ROUND((CAST(sr.CLOSED_AT AS DATE) - CAST(sr.CREATED_AT AS DATE)) * 24, 1) AS TAT_HOURS,
          sr.SLA_BREACHED_48H,
          sr.SLA_BREACHED_168H
        FROM SERVICE_REQUESTS sr
        JOIN CUSTOMERS c ON sr.CUSTOMER_ID = c.CUSTOMER_ID
        LEFT JOIN CITIES ci ON c.CITY_ID = ci.CITY_ID
        LEFT JOIN STATES st ON c.STATE_ID = st.STATE_ID
        JOIN BRANDS b ON sr.BRAND_ID = b.BRAND_ID
        JOIN PRODUCTS p ON sr.PRODUCT_ID = p.PRODUCT_ID
        JOIN MODELS m ON sr.MODEL_ID = m.MODEL_ID
        LEFT JOIN LOCATIONS loc ON sr.ASSIGNED_LOCATION_ID = loc.LOCATION_ID
        LEFT JOIN APP_USERS u ON sr.ASSIGNED_ENGINEER_ID = u.USER_ID
        LEFT JOIN SERVICE_REQUEST_VERIFICATIONS srv ON sr.REQUEST_ID = srv.REQUEST_ID
        WHERE ${where.join(' AND ')}
        ORDER BY sr.CREATED_AT DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const result = await conn.execute<any>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (result.rows || []).map((row) => ({
        requestId: row.REQUEST_ID,
        jobNumber: row.JOB_NUMBER,
        customerName: row.CUSTOMER_NAME,
        customerPhone: row.CUSTOMER_PHONE,
        customerCity: row.CUSTOMER_CITY || '',
        customerState: row.CUSTOMER_STATE || '',
        brandName: row.BRAND_NAME,
        productName: row.PRODUCT_NAME,
        modelName: row.MODEL_NAME,
        serialNumber: row.SERIAL_NUMBER,
        callType: row.CALL_TYPE,
        status: row.STATUS,
        assignedLocation: row.ASSIGNED_LOCATION,
        assignedEngineer: row.ASSIGNED_ENGINEER,
        registeredAt: new Date(row.REGISTERED_AT),
        acknowledgedAt: row.ACKNOWLEDGED_AT ? new Date(row.ACKNOWLEDGED_AT) : undefined,
        closedAt: row.CLOSED_AT ? new Date(row.CLOSED_AT) : undefined,
        isHappyCodeVerified: row.IS_HAPPY_CODE_VERIFIED,
        tatHours: row.TAT_HOURS != null ? Number(row.TAT_HOURS) : undefined,
        slaBreached48h: row.SLA_BREACHED_48H || 'N',
        slaBreached168h: row.SLA_BREACHED_168H || 'N',
      }));
    } finally {
      await conn.close();
    }
  }

  /**
   * Part Consumption & Defect Trend Report.
   */
  async getPartConsumptionReport(filter: {
    brandId?: string;
    locationId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<PartConsumptionRow[]> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const where: string[] = ['srp.QUANTITY > 0'];

      if (filter.brandId) {
        binds.brandId = filter.brandId;
        where.push('sr.BRAND_ID = :brandId');
      }

      if (filter.locationId) {
        binds.locationId = filter.locationId;
        where.push('sr.ASSIGNED_LOCATION_ID = :locationId');
      }

      if (filter.fromDate) {
        binds.fromDate = filter.fromDate;
        where.push('srp.CREATED_AT >= TO_DATE(:fromDate, \'YYYY-MM-DD\')');
      }

      if (filter.toDate) {
        binds.toDate = filter.toDate;
        where.push('srp.CREATED_AT < TO_DATE(:toDate, \'YYYY-MM-DD\') + 1');
      }

      const limit = Math.min(1000, filter.limit || 200);
      binds.limit = limit;

      const sql = `
        SELECT 
          pt.PART_CODE,
          pt.PART_NAME,
          b.BRAND_NAME,
          SUM(srp.QUANTITY) AS TOTAL_QUANTITY,
          fc.FAULT_DESCRIPTION AS FAULT_DESC,
          dc.DEFECT_DESCRIPTION AS DEFECT_DESC,
          loc.LOCATION_NAME,
          SUM(srp.QUANTITY * NVL(pt.LOCATION_PRICE, 0)) AS TOTAL_COST
        FROM SERVICE_REQUEST_PARTS srp
        JOIN SERVICE_REQUESTS sr ON srp.REQUEST_ID = sr.REQUEST_ID
        JOIN PART_CODES pt ON srp.PART_ID = pt.PART_ID
        JOIN BRANDS b ON sr.BRAND_ID = b.BRAND_ID
        LEFT JOIN FAULT_MASTERS fc ON sr.FAULT_ID = fc.FAULT_ID
        LEFT JOIN DEFECT_MASTERS dc ON sr.DEFECT_ID = dc.DEFECT_ID
        LEFT JOIN LOCATIONS loc ON sr.ASSIGNED_LOCATION_ID = loc.LOCATION_ID
        WHERE ${where.join(' AND ')}
        GROUP BY pt.PART_CODE, pt.PART_NAME, b.BRAND_NAME, fc.FAULT_DESCRIPTION, dc.DEFECT_DESCRIPTION, loc.LOCATION_NAME
        ORDER BY TOTAL_QUANTITY DESC
        FETCH FIRST :limit ROWS ONLY
      `;

      const result = await conn.execute<any>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (result.rows || []).map((row) => ({
        partCode: row.PART_CODE,
        partName: row.PART_NAME,
        brandName: row.BRAND_NAME,
        quantityConsumed: Number(row.TOTAL_QUANTITY || 0),
        faultDescription: row.FAULT_DESC || undefined,
        defectDescription: row.DEFECT_DESC || undefined,
        consumedAtLocation: row.LOCATION_NAME || 'Unknown Location',
        totalCost: Number(row.TOTAL_COST || 0),
      }));
    } finally {
      await conn.close();
    }
  }

  /**
   * Warranty Claims & Settlement Audit Report.
   */
  async getWarrantyClaimsReport(filter: {
    brandId?: string;
    asfLocationId?: string;
    claimYear?: number;
    claimMonth?: number;
    status?: string;
    limit?: number;
  }): Promise<WarrantyClaimReportRow[]> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const where: string[] = ['1=1'];

      if (filter.brandId) {
        binds.brandId = filter.brandId;
        where.push('sc.BRAND_ID = :brandId');
      }

      if (filter.asfLocationId) {
        binds.asfLocationId = filter.asfLocationId;
        where.push('sc.ASF_LOCATION_ID = :asfLocationId');
      }

      if (filter.claimYear) {
        binds.claimYear = filter.claimYear;
        where.push('sc.CLAIM_YEAR = :claimYear');
      }

      if (filter.claimMonth) {
        binds.claimMonth = filter.claimMonth;
        where.push('sc.CLAIM_MONTH = :claimMonth');
      }

      if (filter.status) {
        binds.status = filter.status;
        where.push('sc.STATUS = :status');
      }

      const limit = Math.min(1000, filter.limit || 200);
      binds.limit = limit;

      const sql = `
        SELECT 
          sc.CLAIM_NUMBER,
          TO_CHAR(sc.CLAIM_MONTH) || '/' || TO_CHAR(sc.CLAIM_YEAR) AS CLAIM_PERIOD,
          loc.LOCATION_NAME AS ASF_NAME,
          b.BRAND_NAME,
          sc.TOTAL_JOBS_COUNT,
          sc.GROSS_LABOR_AMOUNT,
          sc.GROSS_TRAVEL_AMOUNT,
          sc.NET_CLAIM_AMOUNT,
          sc.STATUS,
          fj.JOURNAL_NUMBER,
          sc.CREATED_AT
        FROM SERVICE_CLAIMS sc
        JOIN LOCATIONS loc ON sc.ASF_LOCATION_ID = loc.LOCATION_ID
        JOIN BRANDS b ON sc.BRAND_ID = b.BRAND_ID
        LEFT JOIN FINANCIAL_JOURNALS fj ON sc.JOURNAL_ID = fj.JOURNAL_ID
        WHERE ${where.join(' AND ')}
        ORDER BY sc.CLAIM_YEAR DESC, sc.CLAIM_MONTH DESC, sc.CREATED_AT DESC
        FETCH FIRST :limit ROWS ONLY
      `;

      const result = await conn.execute<any>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (result.rows || []).map((row) => ({
        claimNumber: row.CLAIM_NUMBER,
        claimPeriod: row.CLAIM_PERIOD,
        asfLocationName: row.ASF_NAME,
        brandName: row.BRAND_NAME,
        totalJobsCount: Number(row.TOTAL_JOBS_COUNT || 0),
        grossLaborAmount: Number(row.GROSS_LABOR_AMOUNT || 0),
        grossTravelAmount: Number(row.GROSS_TRAVEL_AMOUNT || 0),
        netClaimAmount: Number(row.NET_CLAIM_AMOUNT || 0),
        status: row.STATUS,
        journalNumber: row.JOURNAL_NUMBER || undefined,
        createdAt: new Date(row.CREATED_AT),
      }));
    } finally {
      await conn.close();
    }
  }

  /**
   * Inventory Valuation & Discrepancy Status Report.
   */
  async getStockValuationReport(filter: {
    locationId?: string;
    category?: string;
    limit?: number;
  }): Promise<StockValuationRow[]> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const where: string[] = ['1=1'];

      if (filter.locationId) {
        binds.locationId = filter.locationId;
        where.push('ib.LOCATION_ID = :locationId');
      }

      if (filter.category) {
        binds.category = filter.category;
        where.push('p.CATEGORY = :category');
      }

      const limit = Math.min(1000, filter.limit || 300);
      binds.limit = limit;

      const sql = `
        SELECT 
          loc.LOCATION_NAME,
          loc.PARTY_TYPE AS LOCATION_TYPE,
          p.PART_CODE,
          p.PART_NAME,
          NVL(p.PART_CATEGORY, 'SPARE') AS CATEGORY,
          ib.QTY_ON_HAND AS ON_HAND,
          ib.QTY_RESERVED AS RESERVED,
          (ib.QTY_ON_HAND - ib.QTY_RESERVED) AS AVAILABLE,
          NVL(p.LOCATION_PRICE, 0) AS UNIT_PRICE,
          (ib.QTY_ON_HAND * NVL(p.LOCATION_PRICE, 0)) AS VALUATION,
          loc.UPDATED_AT AS RECONCILED_AT
        FROM INVENTORY_BALANCES ib
        JOIN LOCATIONS loc ON ib.LOCATION_ID = loc.LOCATION_ID
        JOIN PART_CODES p ON ib.PART_ID = p.PART_ID
        WHERE ${where.join(' AND ')}
        ORDER BY loc.LOCATION_NAME ASC, p.PART_NAME ASC
        FETCH FIRST :limit ROWS ONLY
      `;

      const result = await conn.execute<any>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (result.rows || []).map((row) => ({
        locationName: row.LOCATION_NAME,
        locationType: row.LOCATION_TYPE,
        partCode: row.PART_CODE,
        partName: row.PART_NAME,
        category: row.CATEGORY,
        onHandQuantity: Number(row.ON_HAND || 0),
        reservedQuantity: Number(row.RESERVED || 0),
        availableQuantity: Number(row.AVAILABLE || 0),
        unitCostPrice: Number(row.UNIT_PRICE || 0),
        totalValuation: Number(row.VALUATION || 0),
        reconciledAt: row.RECONCILED_AT ? new Date(row.RECONCILED_AT) : undefined,
      }));
    } finally {
      await conn.close();
    }
  }

  /**
   * Operational Queues KPI Aggregation.
   */
  async getOperationalQueues(locationId?: string, brandId?: string): Promise<{
    unacknowledgedCalls: number;
    pendingDiagnosis: number;
    inProgressRepairs: number;
    pendingSpareParts: number;
    pendingClosures: number;
    pendingSlaPenalties: number;
    pendingClaimAudits: number;
  }> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      let locFilter = '';
      let brandFilter = '';

      if (locationId) {
        binds.locationId = locationId;
        locFilter = 'AND sr.ASSIGNED_LOCATION_ID = :locationId';
      }

      if (brandId) {
        binds.brandId = brandId;
        brandFilter = 'AND sr.BRAND_ID = :brandId';
      }

      const sqlSr = `
        SELECT 
          NVL(SUM(CASE WHEN sr.STATUS IN ('REGISTERED', 'ASSIGNED_TO_ASF') AND sr.ACKNOWLEDGED_AT IS NULL THEN 1 ELSE 0 END), 0) AS UNACK_COUNT,
          NVL(SUM(CASE WHEN sr.STATUS = 'ACKNOWLEDGED' THEN 1 ELSE 0 END), 0) AS PENDING_DIAG,
          NVL(SUM(CASE WHEN sr.STATUS = 'IN_PROGRESS_REPAIR' THEN 1 ELSE 0 END), 0) AS IN_PROGRESS,
          NVL(SUM(CASE WHEN sr.STATUS = 'PENDING_SPARE_PART' THEN 1 ELSE 0 END), 0) AS PENDING_PARTS,
          NVL(SUM(CASE WHEN sr.STATUS = 'CALL_CLOSURE_SUBMITTED' THEN 1 ELSE 0 END), 0) AS PENDING_CLOSURE
        FROM SERVICE_REQUESTS sr
        WHERE 1=1 ${locFilter} ${brandFilter}
      `;

      const resSr = await conn.execute<any>(sqlSr, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const rowSr = resSr.rows?.[0] || {};

      // SLA penalties pending review
      const resSla = await conn.execute<any>(
        'SELECT COUNT(*) AS PEN_COUNT FROM SLA_PENALTY_RECORDS WHERE STATUS = \'PENDING_REVIEW\'',
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const pendingSla = Number(resSla.rows?.[0]?.PEN_COUNT || 0);

      // Claims pending audit
      const resClaims = await conn.execute<any>(
        'SELECT COUNT(*) AS CLM_COUNT FROM SERVICE_CLAIMS WHERE STATUS = \'SUBMITTED\'',
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const pendingClaims = Number(resClaims.rows?.[0]?.CLM_COUNT || 0);

      return {
        unacknowledgedCalls: Number(rowSr.UNACK_COUNT || 0),
        pendingDiagnosis: Number(rowSr.PENDING_DIAG || 0),
        inProgressRepairs: Number(rowSr.IN_PROGRESS || 0),
        pendingSpareParts: Number(rowSr.PENDING_PARTS || 0),
        pendingClosures: Number(rowSr.PENDING_CLOSURE || 0),
        pendingSlaPenalties: pendingSla,
        pendingClaimAudits: pendingClaims,
      };
    } finally {
      await conn.close();
    }
  }
}

export const reportingRepository = new ReportingRepository();
