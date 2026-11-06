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
  asfName?: string;
  brandName: string;
  totalJobsCount: number;
  grossLaborAmount: number;
  grossTravelAmount: number;
  penaltyDeductionAmount: number | null;
  netClaimAmount: number;
  status: string;
  submittedAt?: Date;
  approvedAt?: Date;
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
          sc.PENALTY_DEDUCTION_AMOUNT,
          sc.NET_CLAIM_AMOUNT,
          sc.STATUS,
          sc.SUBMITTED_AT,
          sc.APPROVED_AT,
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
        asfName: row.ASF_NAME,
        brandName: row.BRAND_NAME,
        totalJobsCount: Number(row.TOTAL_JOBS_COUNT || 0),
        grossLaborAmount: Number(row.GROSS_LABOR_AMOUNT || 0),
        grossTravelAmount: Number(row.GROSS_TRAVEL_AMOUNT || 0),
        penaltyDeductionAmount: row.PENALTY_DEDUCTION_AMOUNT != null ? Number(row.PENALTY_DEDUCTION_AMOUNT) : null,
        netClaimAmount: Number(row.NET_CLAIM_AMOUNT || 0),
        status: row.STATUS,
        submittedAt: row.SUBMITTED_AT ? new Date(row.SUBMITTED_AT) : undefined,
        approvedAt: row.APPROVED_AT ? new Date(row.APPROVED_AT) : undefined,
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

  /**
   * Enterprise Admin Operations Dashboard Summary.
   * Delivers accurate, Oracle-backed KPIs, charts, exceptions, and recent events.
   */
  async getAdminDashboardSummary(
    preset = '7d',
    customFromDate?: string,
    customToDate?: string,
    userPermissions: string[] = []
  ): Promise<AdminDashboardData> {
    const conn = await getOracleConnection();
    try {
      const now = new Date();
      let fromDate: Date;
      let toDate: Date;
      let effectivePreset = preset;

      if (preset === 'today') {
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      } else if (preset === '30d') {
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
        toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      } else if (preset === '90d') {
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89, 0, 0, 0, 0);
        toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      } else if (preset === 'custom' && customFromDate && customToDate) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(customFromDate) && /^\d{4}-\d{2}-\d{2}$/.test(customToDate)) {
          const partsF = customFromDate.split('-').map(Number);
          const partsT = customToDate.split('-').map(Number);
          const fy = partsF[0] ?? now.getFullYear();
          const fm = partsF[1] ?? (now.getMonth() + 1);
          const fd = partsF[2] ?? now.getDate();
          const ty = partsT[0] ?? now.getFullYear();
          const tm = partsT[1] ?? (now.getMonth() + 1);
          const td = partsT[2] ?? now.getDate();
          fromDate = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
          toDate = new Date(ty, tm - 1, td, 23, 59, 59, 999);
        } else {
          const parsedFrom = new Date(customFromDate);
          const parsedTo = new Date(customToDate);
          if (!isNaN(parsedFrom.getTime()) && !isNaN(parsedTo.getTime())) {
            fromDate = parsedFrom;
            toDate = parsedTo;
          } else {
            effectivePreset = '7d';
            fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
            toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          }
        }
      } else {
        effectivePreset = '7d';
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
        toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      }

      const binds = { fromDate, toDate };

      // 1. KPI Aggregations (Single round-trip for main service request counts)
      const kpiSql = `
        SELECT 
          COUNT(CASE WHEN REGISTERED_AT >= :fromDate AND REGISTERED_AT <= :toDate THEN 1 END) AS TOTAL_PERIOD_REG,
          COUNT(CASE WHEN STATUS = 'CLOSED' AND CLOSED_AT >= :fromDate AND CLOSED_AT <= :toDate THEN 1 END) AS CLOSED_PERIOD,
          COUNT(CASE WHEN STATUS NOT IN ('CLOSED', 'CANCELLED', 'REPLACED') THEN 1 END) AS OPEN_BACKLOG,
          COUNT(CASE WHEN STATUS IN ('REGISTERED', 'ASSIGNED_TO_ASF') AND ACKNOWLEDGED_AT IS NULL THEN 1 END) AS AWAITING_ACK,
          COUNT(CASE WHEN STATUS NOT IN ('CLOSED', 'CANCELLED', 'REPLACED') AND (SLA_BREACHED_48H = 'Y' OR (ACKNOWLEDGED_AT IS NULL AND SLA_48H_EXPIRES_AT < SYSTIMESTAMP)) THEN 1 END) AS OVERDUE_48H_ACK,
          COUNT(CASE WHEN STATUS NOT IN ('CLOSED', 'CANCELLED', 'REPLACED') AND (SLA_BREACHED_168H = 'Y' OR (CLOSED_AT IS NULL AND STATUS NOT IN ('PENDING_SPARE_PART', 'PENDING_SPECIAL_PART_ESTIMATE') AND (SYSDATE - CAST(REGISTERED_AT AS DATE)) * 24 > 168)) THEN 1 END) AS OVERDUE_168H_RES,
          COUNT(CASE WHEN STATUS = 'PENDING_SPARE_PART' THEN 1 END) AS PENDING_PARTS
        FROM SERVICE_REQUESTS
      `;
      const kpiResult = await conn.execute<any>(kpiSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const kpiRow = kpiResult.rows?.[0] || {};

      // Pending replacement and cancellation counts
      const repResult = await conn.execute<any>(
        "SELECT COUNT(*) AS CNT FROM REPLACEMENT_REQUESTS WHERE STATUS = 'PENDING'",
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const pendingReplacements = Number(repResult.rows?.[0]?.CNT || 0);

      const canResult = await conn.execute<any>(
        "SELECT COUNT(*) AS CNT FROM CANCELLATION_REQUESTS WHERE STATUS = 'PENDING'",
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const pendingCancellations = Number(canResult.rows?.[0]?.CNT || 0);
      const pendingApprovals = pendingReplacements + pendingCancellations;

      // 2. Volume Trend: Registered and Closed per day in period with calendar date keys
      const regTrendSql = `
        SELECT 
          TO_CHAR(CAST(REGISTERED_AT AS DATE), 'YYYY-MM-DD') AS DAY_KEY,
          COUNT(*) AS CNT
        FROM SERVICE_REQUESTS
        WHERE REGISTERED_AT >= :fromDate AND REGISTERED_AT <= :toDate
        GROUP BY TO_CHAR(CAST(REGISTERED_AT AS DATE), 'YYYY-MM-DD')
        ORDER BY DAY_KEY
      `;
      const regTrendRes = await conn.execute<any>(regTrendSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const regTrendMap = new Map<string, number>();
      (regTrendRes.rows || []).forEach((r) => regTrendMap.set(r.DAY_KEY, Number(r.CNT || 0)));

      const closedTrendSql = `
        SELECT 
          TO_CHAR(CAST(CLOSED_AT AS DATE), 'YYYY-MM-DD') AS DAY_KEY,
          COUNT(*) AS CNT
        FROM SERVICE_REQUESTS
        WHERE STATUS = 'CLOSED' AND CLOSED_AT >= :fromDate AND CLOSED_AT <= :toDate
        GROUP BY TO_CHAR(CAST(CLOSED_AT AS DATE), 'YYYY-MM-DD')
        ORDER BY DAY_KEY
      `;
      const closedTrendRes = await conn.execute<any>(closedTrendSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const closedTrendMap = new Map<string, number>();
      (closedTrendRes.rows || []).forEach((r) => closedTrendMap.set(r.DAY_KEY, Number(r.CNT || 0)));

      // Generate continuous daily buckets without timezone offset skew
      const volumeTrend: Array<{ date: string; registered: number; closed: number }> = [];
      const cursor = new Date(fromDate);
      cursor.setHours(0, 0, 0, 0);
      const endLimit = new Date(toDate);
      endLimit.setHours(23, 59, 59, 999);

      while (cursor <= endLimit) {
        const y = cursor.getFullYear();
        const m = String(cursor.getMonth() + 1).padStart(2, '0');
        const d = String(cursor.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${d}`;
        volumeTrend.push({
          date: key,
          registered: regTrendMap.get(key) || 0,
          closed: closedTrendMap.get(key) || 0,
        });
        cursor.setDate(cursor.getDate() + 1);
      }

      // 3. Current Workflow Distribution (all active workflow statuses)
      const wfSql = `
        SELECT STATUS, COUNT(*) AS CNT
        FROM SERVICE_REQUESTS
        GROUP BY STATUS
        ORDER BY CNT DESC
      `;
      const wfRes = await conn.execute<any>(wfSql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const totalRequestsAll = (wfRes.rows || []).reduce((sum, r) => sum + Number(r.CNT || 0), 0);
      const workflowDistribution = (wfRes.rows || []).map((r) => ({
        status: r.STATUS,
        count: Number(r.CNT || 0),
        percentage: totalRequestsAll > 0 ? Number(((Number(r.CNT || 0) / totalRequestsAll) * 100).toFixed(1)) : 0,
      }));

      // 4. SLA Compliance with Authoritative Timestamps and Defined Eligible Cohorts
      // 48h Acknowledgment: Eligible cohort strictly includes requests whose 48h window has
      // concluded (either acknowledged, or deadline has elapsed). In-flight requests within their
      // initial 48h window are explicitly tracked separately and not counted as SLA failures.
      const sla48Sql = `
        SELECT 
          COUNT(*) AS TOTAL_REGISTERED,
          COUNT(CASE 
            WHEN ACKNOWLEDGED_AT IS NULL 
             AND (SLA_48H_EXPIRES_AT > SYSTIMESTAMP OR SLA_48H_EXPIRES_AT IS NULL)
             AND STATUS NOT IN ('CLOSED', 'CANCELLED', 'REPLACED')
            THEN 1 END) AS IN_FLIGHT,
          COUNT(CASE 
            WHEN ACKNOWLEDGED_AT IS NOT NULL 
              OR (SLA_48H_EXPIRES_AT <= SYSTIMESTAMP AND STATUS != 'CANCELLED')
              OR SLA_BREACHED_48H = 'Y'
            THEN 1 END) AS TOTAL_ELIGIBLE,
          COUNT(CASE 
            WHEN ACKNOWLEDGED_AT IS NOT NULL 
             AND (ACKNOWLEDGED_AT <= SLA_48H_EXPIRES_AT OR SLA_48H_EXPIRES_AT IS NULL)
            THEN 1 END) AS ON_TIME,
          COUNT(CASE 
            WHEN (ACKNOWLEDGED_AT IS NOT NULL AND SLA_48H_EXPIRES_AT IS NOT NULL AND ACKNOWLEDGED_AT > SLA_48H_EXPIRES_AT)
              OR (ACKNOWLEDGED_AT IS NULL AND SLA_48H_EXPIRES_AT <= SYSTIMESTAMP AND STATUS != 'CANCELLED')
              OR SLA_BREACHED_48H = 'Y'
            THEN 1 END) AS BREACHED
        FROM SERVICE_REQUESTS
        WHERE REGISTERED_AT >= :fromDate AND REGISTERED_AT <= :toDate
      `;
      const sla48Res = await conn.execute<any>(sla48Sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const sla48Row = sla48Res.rows?.[0] || {};
      const tot48 = Number(sla48Row.TOTAL_ELIGIBLE || 0);
      const onTime48 = Number(sla48Row.ON_TIME || 0);
      const breached48 = Number(sla48Row.BREACHED || 0);
      const inFlight48 = Number(sla48Row.IN_FLIGHT || 0);
      const totalRegistered48 = Number(sla48Row.TOTAL_REGISTERED || 0);
      const rate48 = tot48 > 0 ? Number(((onTime48 / tot48) * 100).toFixed(1)) : 100;

      // 168h Resolution SLA: Evaluates all requests closed in the period.
      // Incorporates pause rules per Decision 2.2 (PNA spare parts transit and customer estimate pause).
      // Authoritative timestamps govern even if background worker flag is stale.
      const sla168Sql = `
        SELECT 
          COUNT(*) AS TOTAL_CLOSED,
          COUNT(CASE 
            WHEN sr.SLA_BREACHED_168H = 'N' AND (
              (CAST(sr.CLOSED_AT AS DATE) - CAST(sr.REGISTERED_AT AS DATE)) * 24 <= 168
              OR EXISTS (
                SELECT 1 FROM SERVICE_REQUEST_EVENTS sre 
                WHERE sre.REQUEST_ID = sr.REQUEST_ID 
                  AND (sre.TO_STATE IN ('PENDING_SPARE_PART', 'PENDING_SPECIAL_PART_ESTIMATE')
                       OR sre.EVENT_TYPE IN ('PART_DISPATCHED', 'SPARE_PART_REQUESTED'))
              )
            ) THEN 1 
          END) AS ON_TIME,
          COUNT(CASE 
            WHEN sr.SLA_BREACHED_168H = 'Y'
              OR (
                (CAST(sr.CLOSED_AT AS DATE) - CAST(sr.REGISTERED_AT AS DATE)) * 24 > 168
                AND NOT EXISTS (
                  SELECT 1 FROM SERVICE_REQUEST_EVENTS sre 
                  WHERE sre.REQUEST_ID = sr.REQUEST_ID 
                    AND (sre.TO_STATE IN ('PENDING_SPARE_PART', 'PENDING_SPECIAL_PART_ESTIMATE')
                         OR sre.EVENT_TYPE IN ('PART_DISPATCHED', 'SPARE_PART_REQUESTED'))
                )
              ) THEN 1 
          END) AS BREACHED,
          AVG(CASE WHEN sr.CLOSED_AT IS NOT NULL AND sr.REGISTERED_AT IS NOT NULL THEN (CAST(sr.CLOSED_AT AS DATE) - CAST(sr.REGISTERED_AT AS DATE)) * 24 END) AS AVG_TAT,
          COUNT(CASE WHEN srv.HAPPY_CODE_VERIFIED_AT IS NOT NULL THEN 1 END) AS HAPPY_COUNT
        FROM SERVICE_REQUESTS sr
        LEFT JOIN SERVICE_REQUEST_VERIFICATIONS srv ON sr.REQUEST_ID = srv.REQUEST_ID
        WHERE sr.STATUS = 'CLOSED' AND sr.CLOSED_AT >= :fromDate AND sr.CLOSED_AT <= :toDate
      `;
      const sla168Res = await conn.execute<any>(sla168Sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const sla168Row = sla168Res.rows?.[0] || {};
      const tot168 = Number(sla168Row.TOTAL_CLOSED || 0);
      const onTime168 = Number(sla168Row.ON_TIME || 0);
      const breached168 = Number(sla168Row.BREACHED || 0);
      const rate168 = tot168 > 0 ? Number(((onTime168 / tot168) * 100).toFixed(1)) : 100;
      const avgTat = sla168Row.AVG_TAT != null ? Number(Number(sla168Row.AVG_TAT).toFixed(1)) : 0;
      const happyCount = Number(sla168Row.HAPPY_COUNT || 0);
      const happyRate = tot168 > 0 ? Number(((happyCount / tot168) * 100).toFixed(1)) : 100;

      // 5. Aging Buckets for Open Backlog
      const agingSql = `
        SELECT 
          COUNT(CASE WHEN (SYSDATE - CAST(REGISTERED_AT AS DATE)) * 24 < 24 THEN 1 END) AS AGE_LT_24,
          COUNT(CASE WHEN (SYSDATE - CAST(REGISTERED_AT AS DATE)) * 24 >= 24 AND (SYSDATE - CAST(REGISTERED_AT AS DATE)) * 24 < 48 THEN 1 END) AS AGE_24_48,
          COUNT(CASE WHEN (SYSDATE - CAST(REGISTERED_AT AS DATE)) * 24 >= 48 AND (SYSDATE - CAST(REGISTERED_AT AS DATE)) * 24 < 72 THEN 1 END) AS AGE_48_72,
          COUNT(CASE WHEN (SYSDATE - CAST(REGISTERED_AT AS DATE)) * 24 >= 72 AND (SYSDATE - CAST(REGISTERED_AT AS DATE)) * 24 < 168 THEN 1 END) AS AGE_72_168,
          COUNT(CASE WHEN (SYSDATE - CAST(REGISTERED_AT AS DATE)) * 24 >= 168 THEN 1 END) AS AGE_GT_168
        FROM SERVICE_REQUESTS
        WHERE STATUS NOT IN ('CLOSED', 'CANCELLED', 'REPLACED')
      `;
      const agingRes = await conn.execute<any>(agingSql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const agingRow = agingRes.rows?.[0] || {};
      const openBacklogTotal = Number(kpiRow.OPEN_BACKLOG || 0);

      const agingBuckets = [
        { bucket: '< 24 Hours', count: Number(agingRow.AGE_LT_24 || 0) },
        { bucket: '24 - 48 Hours', count: Number(agingRow.AGE_24_48 || 0) },
        { bucket: '48 - 72 Hours', count: Number(agingRow.AGE_48_72 || 0) },
        { bucket: '3 - 7 Days', count: Number(agingRow.AGE_72_168 || 0) },
        { bucket: '> 7 Days (Critical)', count: Number(agingRow.AGE_GT_168 || 0) },
      ].map((b) => ({
        ...b,
        percentage: openBacklogTotal > 0 ? Number(((b.count / openBacklogTotal) * 100).toFixed(1)) : 0,
      }));

      // 6. Top Brands & Products by Request Volume in Period
      const brandsSql = `
        SELECT b.BRAND_NAME, COUNT(*) AS CNT
        FROM SERVICE_REQUESTS sr
        JOIN BRANDS b ON sr.BRAND_ID = b.BRAND_ID
        WHERE sr.REGISTERED_AT >= :fromDate AND sr.REGISTERED_AT <= :toDate
        GROUP BY b.BRAND_NAME
        ORDER BY CNT DESC
        FETCH FIRST 5 ROWS ONLY
      `;
      const brandsRes = await conn.execute<any>(brandsSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const topBrands = (brandsRes.rows || []).map((r) => ({
        brandName: r.BRAND_NAME,
        count: Number(r.CNT || 0),
      }));

      const prodsSql = `
        SELECT p.PRODUCT_NAME, COUNT(*) AS CNT
        FROM SERVICE_REQUESTS sr
        JOIN PRODUCTS p ON sr.PRODUCT_ID = p.PRODUCT_ID
        WHERE sr.REGISTERED_AT >= :fromDate AND sr.REGISTERED_AT <= :toDate
        GROUP BY p.PRODUCT_NAME
        ORDER BY CNT DESC
        FETCH FIRST 5 ROWS ONLY
      `;
      const prodsRes = await conn.execute<any>(prodsSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const topProducts = (prodsRes.rows || []).map((r) => ({
        productName: r.PRODUCT_NAME,
        count: Number(r.CNT || 0),
      }));

      // 7. Dead Letter Notifications
      const deadLetterRes = await conn.execute<any>(
        "SELECT COUNT(*) AS CNT FROM NOTIFICATIONS_OUTBOX WHERE STATUS = 'DEAD_LETTER'",
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const deadLetterCount = Number(deadLetterRes.rows?.[0]?.CNT || 0);

      // Financial queues (only if user has authorized permissions)
      let pendingClaimsCount: number | undefined;
      let pendingPenaltiesCount: number | undefined;

      if (userPermissions.includes('finance:read') || userPermissions.includes('finance:claims')) {
        const clmRes = await conn.execute<any>(
          "SELECT COUNT(*) AS CNT FROM SERVICE_CLAIMS WHERE STATUS = 'SUBMITTED'",
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        pendingClaimsCount = Number(clmRes.rows?.[0]?.CNT || 0);
      }

      if (userPermissions.includes('finance:read') || userPermissions.includes('sla:manage')) {
        const penRes = await conn.execute<any>(
          "SELECT COUNT(*) AS CNT FROM SLA_PENALTY_RECORDS WHERE STATUS = 'PENDING_REVIEW'",
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        pendingPenaltiesCount = Number(penRes.rows?.[0]?.CNT || 0);
      }

      // 8. Recent Operational Events (Sanitized - no OTPs, secrets, or raw attachments)
      const activitySql = `
        SELECT 
          sre.EVENT_ID,
          sr.JOB_NUMBER,
          sre.EVENT_TYPE,
          sre.FROM_STATE,
          sre.TO_STATE,
          sre.TRIGGERED_BY_USERNAME,
          sre.TRIGGERED_BY_ROLE,
          sre.REMARKS,
          sre.CREATED_AT
        FROM SERVICE_REQUEST_EVENTS sre
        JOIN SERVICE_REQUESTS sr ON sre.REQUEST_ID = sr.REQUEST_ID
        ORDER BY sre.CREATED_AT DESC
        FETCH FIRST 10 ROWS ONLY
      `;
      const actRes = await conn.execute<any>(activitySql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const recentActivity = (actRes.rows || []).map((r) => ({
        eventId: r.EVENT_ID,
        jobNumber: r.JOB_NUMBER,
        eventType: r.EVENT_TYPE,
        fromState: r.FROM_STATE,
        toState: r.TO_STATE,
        triggeredByUsername: r.TRIGGERED_BY_USERNAME,
        triggeredByRole: r.TRIGGERED_BY_ROLE,
        remarks: r.REMARKS || undefined,
        createdAt: new Date(r.CREATED_AT).toISOString(),
      }));

      // 9. Operational Network Overview & Service Center Capacity Breakdown
      const networkSql = `
        SELECT 
          (SELECT COUNT(*) FROM LOCATIONS WHERE PARTY_TYPE = 'ASF' AND IS_ACTIVE = 'Y') AS TOTAL_CENTERS,
          (SELECT COUNT(DISTINCT u.USER_ID) FROM APP_USERS u JOIN USER_ROLES ur ON u.USER_ID = ur.USER_ID JOIN ROLES r ON ur.ROLE_ID = r.ROLE_ID WHERE r.CODE = 'ENGINEER' AND u.IS_ACTIVE = 'Y') AS TOTAL_TECHNICIANS,
          (SELECT COUNT(*) FROM SERVICE_REQUESTS WHERE ASSIGNED_LOCATION_ID IS NOT NULL AND STATUS NOT IN ('CLOSED', 'CANCELLED', 'REPLACED')) AS ASSIGNED_REQUESTS,
          (SELECT COUNT(*) FROM SERVICE_REQUESTS WHERE STATUS NOT IN ('CLOSED', 'CANCELLED', 'REPLACED')) AS ACTIVE_JOBS,
          (SELECT COUNT(*) FROM SERVICE_REQUESTS WHERE STATUS IN ('REGISTERED', 'ASSIGNED_TO_ASF') AND ACKNOWLEDGED_AT IS NULL) AS AWAITING_ACK,
          (SELECT COUNT(*) FROM SERVICE_REQUESTS WHERE STATUS IN ('PENDING_SPARE_PART', 'PENDING_SPECIAL_PART_ESTIMATE', 'SPECIAL_PART_ESTIMATE_PROVIDED')) AS PENDING_PARTS,
          (SELECT COUNT(*) FROM SERVICE_REQUESTS WHERE TRUNC(CAST(APPOINTMENT_DATE AS DATE)) = TRUNC(SYSDATE) AND STATUS NOT IN ('CLOSED', 'CANCELLED', 'REPLACED')) AS TODAY_APPOINTMENTS,
          (SELECT COUNT(*) FROM STOCK_DISPATCHES WHERE STATUS = 'IN_TRANSIT') AS DISPATCHES_AWAITING_ACK
        FROM DUAL
      `;
      const netRes = await conn.execute<any>(networkSql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const netRow = netRes.rows?.[0] || {};

      const operationalNetwork = {
        totalActiveServiceCenters: Number(netRow.TOTAL_CENTERS || 0),
        totalActiveTechnicians: Number(netRow.TOTAL_TECHNICIANS || 0),
        assignedRequests: Number(netRow.ASSIGNED_REQUESTS || 0),
        activeJobs: Number(netRow.ACTIVE_JOBS || 0),
        awaitingAck: Number(netRow.AWAITING_ACK || 0),
        openBacklog: openBacklogTotal,
        pendingParts: Number(netRow.PENDING_PARTS || 0),
        todayAppointments: Number(netRow.TODAY_APPOINTMENTS || 0),
        dispatchesAwaitingAck: Number(netRow.DISPATCHES_AWAITING_ACK || 0),
      };

      const scWorkloadSql = `
        SELECT 
          l.LOCATION_ID,
          l.LOCATION_CODE,
          l.LOCATION_NAME,
          COUNT(CASE WHEN sr.STATUS NOT IN ('CLOSED', 'CANCELLED', 'REPLACED') THEN 1 END) AS ASSIGNED_OPEN_JOBS,
          COUNT(CASE WHEN sr.STATUS IN ('REGISTERED', 'ASSIGNED_TO_ASF') AND sr.ACKNOWLEDGED_AT IS NULL THEN 1 END) AS AWAITING_ACK,
          COUNT(CASE WHEN sr.STATUS IN ('APPOINTMENT_SCHEDULED', 'TECHNICIAN_CHECKED_IN', 'IN_PROGRESS_REPAIR') THEN 1 END) AS IN_PROGRESS,
          COUNT(CASE WHEN sr.STATUS IN ('PENDING_SPARE_PART', 'PENDING_SPECIAL_PART_ESTIMATE', 'SPECIAL_PART_ESTIMATE_PROVIDED') THEN 1 END) AS PENDING_PARTS,
          COUNT(CASE WHEN sr.STATUS = 'CLOSED' AND sr.CLOSED_AT >= :fromDate AND sr.CLOSED_AT <= :toDate THEN 1 END) AS COMPLETED_PERIOD,
          COUNT(CASE WHEN sr.STATUS NOT IN ('CLOSED', 'CANCELLED', 'REPLACED') AND (sr.SLA_BREACHED_48H = 'Y' OR (sr.ACKNOWLEDGED_AT IS NULL AND SYSTIMESTAMP > sr.SLA_48H_EXPIRES_AT) OR sr.SLA_BREACHED_168H = 'Y') THEN 1 END) AS OVERDUE_JOBS,
          (SELECT COUNT(DISTINCT u.USER_ID) FROM APP_USERS u JOIN USER_ROLES ur ON u.USER_ID = ur.USER_ID JOIN ROLES r ON ur.ROLE_ID = r.ROLE_ID WHERE r.CODE = 'ENGINEER' AND u.LOCATION_ID = l.LOCATION_ID AND u.IS_ACTIVE = 'Y') AS ACTIVE_TECHNICIANS
        FROM LOCATIONS l
        LEFT JOIN SERVICE_REQUESTS sr ON l.LOCATION_ID = sr.ASSIGNED_LOCATION_ID
        WHERE l.PARTY_TYPE = 'ASF' AND l.IS_ACTIVE = 'Y'
        GROUP BY l.LOCATION_ID, l.LOCATION_CODE, l.LOCATION_NAME
        ORDER BY ASSIGNED_OPEN_JOBS DESC, l.LOCATION_NAME ASC
      `;
      const scRes = await conn.execute<any>(scWorkloadSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const serviceCenterWorkload = (scRes.rows || []).map((r) => ({
        locationId: r.LOCATION_ID,
        locationCode: r.LOCATION_CODE,
        locationName: r.LOCATION_NAME,
        assignedOpenJobs: Number(r.ASSIGNED_OPEN_JOBS || 0),
        awaitingAck: Number(r.AWAITING_ACK || 0),
        inProgress: Number(r.IN_PROGRESS || 0),
        pendingParts: Number(r.PENDING_PARTS || 0),
        completedInPeriod: Number(r.COMPLETED_PERIOD || 0),
        overdueJobs: Number(r.OVERDUE_JOBS || 0),
        activeTechnicians: Number(r.ACTIVE_TECHNICIANS || 0),
        capacityConfigured: false,
        configuredCapacity: null,
      }));

      return {
        period: {
          preset: effectivePreset,
          fromDate: fromDate.toISOString(),
          toDate: toDate.toISOString(),
        },
        kpis: {
          totalInPeriod: Number(kpiRow.TOTAL_PERIOD_REG || 0),
          openBacklog: openBacklogTotal,
          awaitingAck: Number(kpiRow.AWAITING_ACK || 0),
          overdue48hAck: Number(kpiRow.OVERDUE_48H_ACK || 0),
          overdue168hResolution: Number(kpiRow.OVERDUE_168H_RES || 0),
          closedInPeriod: Number(kpiRow.CLOSED_PERIOD || 0),
          pendingApprovals,
          pendingParts: Number(kpiRow.PENDING_PARTS || 0),
        },
        operationalNetwork,
        serviceCenterWorkload,
        charts: {
          volumeTrend,
          workflowDistribution,
          slaCompliance: {
            ack48h: {
              totalEligible: tot48,
              onTime: onTime48,
              breached: breached48,
              rate: rate48,
              inFlight: inFlight48,
              totalRegistered: totalRegistered48,
            },
            resolution168h: {
              totalClosed: tot168,
              onTime: onTime168,
              breached: breached168,
              rate: rate168,
            },
          },
          agingBuckets,
          topBrands,
          topProducts,
          customerOutcomes: {
            happyCodeVerificationRate: happyRate,
            avgResolutionTatHours: avgTat,
            totalClosedWithTat: tot168,
          },
        },
        pendingActions: {
          overdueAckCount: Number(kpiRow.OVERDUE_48H_ACK || 0),
          overdueResolutionCount: Number(kpiRow.OVERDUE_168H_RES || 0),
          pendingReplacementCount: pendingReplacements,
          pendingCancellationCount: pendingCancellations,
          pendingPnaCount: Number(kpiRow.PENDING_PARTS || 0),
          deadLetterNotificationCount: deadLetterCount,
          pendingClaimsAuditCount: pendingClaimsCount,
          pendingSlaPenaltyCount: pendingPenaltiesCount,
        },
        recentActivity,
      };
    } finally {
      await conn.close();
    }
  }
}

export interface AdminDashboardData {
  period: {
    preset: string;
    fromDate: string;
    toDate: string;
  };
  kpis: {
    totalInPeriod: number;
    openBacklog: number;
    awaitingAck: number;
    overdue48hAck: number;
    overdue168hResolution: number;
    closedInPeriod: number;
    pendingApprovals: number;
    pendingParts: number;
  };
  operationalNetwork: {
    totalActiveServiceCenters: number;
    totalActiveTechnicians: number;
    assignedRequests: number;
    activeJobs: number;
    awaitingAck: number;
    openBacklog: number;
    pendingParts: number;
    todayAppointments: number;
    dispatchesAwaitingAck: number;
  };
  serviceCenterWorkload: Array<{
    locationId: string;
    locationCode: string;
    locationName: string;
    assignedOpenJobs: number;
    awaitingAck: number;
    inProgress: number;
    pendingParts: number;
    completedInPeriod: number;
    overdueJobs: number;
    activeTechnicians: number;
    capacityConfigured: boolean;
    configuredCapacity: number | null;
  }>;
  charts: {
    volumeTrend: Array<{ date: string; registered: number; closed: number }>;
    workflowDistribution: Array<{ status: string; count: number; percentage: number }>;
    slaCompliance: {
      ack48h: {
        totalEligible: number;
        onTime: number;
        breached: number;
        rate: number;
        inFlight?: number;
        totalRegistered?: number;
      };
      resolution168h: {
        totalClosed: number;
        onTime: number;
        breached: number;
        rate: number;
      };
    };
    agingBuckets: Array<{ bucket: string; count: number; percentage: number }>;
    topBrands: Array<{ brandName: string; count: number }>;
    topProducts: Array<{ productName: string; count: number }>;
    customerOutcomes: {
      happyCodeVerificationRate: number;
      avgResolutionTatHours: number;
      totalClosedWithTat: number;
    };
  };
  pendingActions: {
    overdueAckCount: number;
    overdueResolutionCount: number;
    pendingReplacementCount: number;
    pendingCancellationCount: number;
    pendingPnaCount: number;
    deadLetterNotificationCount: number;
    pendingClaimsAuditCount?: number;
    pendingSlaPenaltyCount?: number;
  };
  recentActivity: Array<{
    eventId: string;
    jobNumber: string;
    eventType: string;
    fromState: string;
    toState: string;
    triggeredByUsername: string;
    triggeredByRole: string;
    remarks?: string;
    createdAt: string;
  }>;
}

export const reportingRepository = new ReportingRepository();
