import crypto from 'crypto';
import oracledb from 'oracledb';
import {
  ClaimLineItemRecord,
  ClaimStatus,
  ServiceClaimRecord,
} from '../../types/finance.js';
import { getOracleConnection } from '../oraclePool.js';

export class ServiceClaimRepository {
  async findClaimByServiceRequestId(
    serviceRequestId: string,
    conn?: oracledb.Connection
  ): Promise<{ claimId: string; claimNumber: string; status: ClaimStatus } | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `
        SELECT c.CLAIM_ID, c.CLAIM_NUMBER, c.STATUS
        FROM CLAIM_LINE_ITEMS li
        JOIN SERVICE_CLAIMS c ON li.CLAIM_ID = c.CLAIM_ID
        WHERE li.SERVICE_REQUEST_ID = :serviceRequestId
          AND c.STATUS != 'REJECTED'
      `;

      const result = await connection.execute<any>(
        sql,
        { serviceRequestId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const row = result.rows?.[0];
      if (!row) return null;

      return {
        claimId: row.CLAIM_ID,
        claimNumber: row.CLAIM_NUMBER,
        status: row.STATUS as ClaimStatus,
      };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async findEligibleJobsForClaims(
    asfLocationId: string,
    brandId?: string,
    conn?: oracledb.Connection
  ): Promise<
    Array<{
      requestId: string;
      jobNumber: string;
      brandId: string;
      productId: string;
      productName: string;
      callType: string;
      isHappyCodeVerified: boolean;
      tatHours: number;
      closedAt: Date;
    }>
  > {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const binds: Record<string, any> = { asfLocationId };
      let brandFilter = '';

      if (brandId) {
        binds.brandId = brandId;
        brandFilter = 'AND sr.BRAND_ID = :brandId';
      }

      // Only jobs that are CLOSED with Happy Code verified or authorized supervisor closure
      // AND not already part of any non-rejected claim batch
      const sql = `
        SELECT sr.REQUEST_ID, sr.JOB_NUMBER, sr.BRAND_ID, sr.PRODUCT_ID,
               p.PRODUCT_NAME, sr.CALL_TYPE, srv.HAPPY_CODE_VERIFIED_AT,
               sr.SUPERVISOR_OVERRIDE_REASON, sr.CREATED_AT, sr.CLOSED_AT
        FROM SERVICE_REQUESTS sr
        JOIN PRODUCTS p ON sr.PRODUCT_ID = p.PRODUCT_ID
        LEFT JOIN SERVICE_REQUEST_VERIFICATIONS srv ON sr.REQUEST_ID = srv.REQUEST_ID
        WHERE sr.ASSIGNED_LOCATION_ID = :asfLocationId
          AND sr.STATUS = 'CLOSED'
          AND (srv.HAPPY_CODE_VERIFIED_AT IS NOT NULL OR sr.SUPERVISOR_OVERRIDE_REASON IS NOT NULL)
          ${brandFilter}
          AND NOT EXISTS (
            SELECT 1 FROM CLAIM_LINE_ITEMS cli
            JOIN SERVICE_CLAIMS sc ON cli.CLAIM_ID = sc.CLAIM_ID
            WHERE cli.SERVICE_REQUEST_ID = sr.REQUEST_ID
              AND sc.STATUS != 'REJECTED'
          )
        ORDER BY sr.CLOSED_AT ASC
      `;

      const result = await connection.execute<any>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      return (result.rows || []).map((row: any) => {
        const createdAt = new Date(row.CREATED_AT).getTime();
        const closedAt = new Date(row.CLOSED_AT).getTime();
        const tatHours = Math.max(0, Math.round(((closedAt - createdAt) / (1000 * 60 * 60)) * 10) / 10);

        return {
          requestId: row.REQUEST_ID,
          jobNumber: row.JOB_NUMBER,
          brandId: row.BRAND_ID,
          productId: row.PRODUCT_ID,
          productName: row.PRODUCT_NAME,
          callType: row.CALL_TYPE,
          isHappyCodeVerified: Boolean(row.HAPPY_CODE_VERIFIED_AT),
          tatHours,
          closedAt: new Date(row.CLOSED_AT),
        };
      });
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async createClaimBatch(
    data: {
      claimMonth: number;
      claimYear: number;
      asfLocationId: string;
      brandId?: string;
      totalJobsCount: number;
      grossLaborAmount: number;
      grossTravelAmount: number;
      penaltyDeductionAmount: number;
      netClaimAmount: number;
      status: ClaimStatus;
      submittedBy: string;
      submittedByUsername: string;
      remarks?: string;
      lineItems: Array<{
        serviceRequestId: string;
        jobNumber: string;
        callType: string;
        productName?: string;
        isHappyCodeVerified: 'Y' | 'N';
        completionTatHours: number;
        tatAppliedPercentage: number;
        baseLaborAmount: number;
        claimableLaborAmount: number;
        travelKm: number;
        travelAmount: number;
        penaltyAmount: number;
        netLineAmount: number;
        auditStatus?: 'VERIFIED' | 'FLAGGED' | 'REJECTED';
        auditNote?: string;
      }>;
    },
    conn: oracledb.Connection
  ): Promise<ServiceClaimRecord> {
    const claimId = crypto.randomUUID();
    const dateStr = `${data.claimYear}${String(data.claimMonth).padStart(2, '0')}`;
    const randPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    const claimNumber = `CLM-${dateStr}-${randPart}`;

    const insertClaimSql = `
      INSERT INTO SERVICE_CLAIMS (
        CLAIM_ID,
        CLAIM_NUMBER,
        CLAIM_MONTH,
        CLAIM_YEAR,
        ASF_LOCATION_ID,
        BRAND_ID,
        TOTAL_JOBS_COUNT,
        GROSS_LABOR_AMOUNT,
        GROSS_TRAVEL_AMOUNT,
        PENALTY_DEDUCTION_AMOUNT,
        NET_CLAIM_AMOUNT,
        STATUS,
        SUBMITTED_AT,
        SUBMITTED_BY,
        SUBMITTED_BY_USERNAME,
        REMARKS,
        CREATED_AT,
        UPDATED_AT
      ) VALUES (
        :claimId,
        :claimNumber,
        :claimMonth,
        :claimYear,
        :asfLocationId,
        :brandId,
        :totalJobsCount,
        :grossLaborAmount,
        :grossTravelAmount,
        :penaltyDeductionAmount,
        :netClaimAmount,
        :status,
        SYSTIMESTAMP,
        :submittedBy,
        :submittedByUsername,
        :remarks,
        SYSTIMESTAMP,
        SYSTIMESTAMP
      )
    `;

    await conn.execute(insertClaimSql, {
      claimId,
      claimNumber,
      claimMonth: data.claimMonth,
      claimYear: data.claimYear,
      asfLocationId: data.asfLocationId,
      brandId: data.brandId || null,
      totalJobsCount: data.totalJobsCount,
      grossLaborAmount: data.grossLaborAmount,
      grossTravelAmount: data.grossTravelAmount,
      penaltyDeductionAmount: data.penaltyDeductionAmount,
      netClaimAmount: data.netClaimAmount,
      status: data.status,
      submittedBy: data.submittedBy,
      submittedByUsername: data.submittedByUsername,
      remarks: data.remarks || null,
    });

    const insertLineSql = `
      INSERT INTO CLAIM_LINE_ITEMS (
        ITEM_ID,
        CLAIM_ID,
        SERVICE_REQUEST_ID,
        JOB_NUMBER,
        CALL_TYPE,
        PRODUCT_NAME,
        IS_HAPPY_CODE_VERIFIED,
        COMPLETION_TAT_HOURS,
        TAT_APPLIED_PERCENTAGE,
        BASE_LABOR_AMOUNT,
        CLAIMABLE_LABOR_AMOUNT,
        TRAVEL_KM,
        TRAVEL_AMOUNT,
        PENALTY_AMOUNT,
        NET_LINE_AMOUNT,
        AUDIT_STATUS,
        AUDIT_NOTE,
        CREATED_AT
      ) VALUES (
        :itemId,
        :claimId,
        :serviceRequestId,
        :jobNumber,
        :callType,
        :productName,
        :isHappyCodeVerified,
        :completionTatHours,
        :tatAppliedPercentage,
        :baseLaborAmount,
        :claimableLaborAmount,
        :travelKm,
        :travelAmount,
        :penaltyAmount,
        :netLineAmount,
        :auditStatus,
        :auditNote,
        SYSTIMESTAMP
      )
    `;

    const insertedLines: ClaimLineItemRecord[] = [];

    for (const item of data.lineItems) {
      const itemId = crypto.randomUUID();
      await conn.execute(insertLineSql, {
        itemId,
        claimId,
        serviceRequestId: item.serviceRequestId,
        jobNumber: item.jobNumber,
        callType: item.callType,
        productName: item.productName || null,
        isHappyCodeVerified: item.isHappyCodeVerified,
        completionTatHours: item.completionTatHours,
        tatAppliedPercentage: item.tatAppliedPercentage,
        baseLaborAmount: item.baseLaborAmount,
        claimableLaborAmount: item.claimableLaborAmount,
        travelKm: item.travelKm,
        travelAmount: item.travelAmount,
        penaltyAmount: item.penaltyAmount,
        netLineAmount: item.netLineAmount,
        auditStatus: item.auditStatus || 'VERIFIED',
        auditNote: item.auditNote || null,
      });

      insertedLines.push({
        itemId,
        claimId,
        serviceRequestId: item.serviceRequestId,
        jobNumber: item.jobNumber,
        callType: item.callType,
        productName: item.productName,
        isHappyCodeVerified: item.isHappyCodeVerified,
        completionTatHours: item.completionTatHours,
        tatAppliedPercentage: item.tatAppliedPercentage,
        baseLaborAmount: item.baseLaborAmount,
        claimableLaborAmount: item.claimableLaborAmount,
        travelKm: item.travelKm,
        travelAmount: item.travelAmount,
        penaltyAmount: item.penaltyAmount,
        netLineAmount: item.netLineAmount,
        auditStatus: item.auditStatus || 'VERIFIED',
        auditNote: item.auditNote,
        createdAt: new Date(),
      });
    }

    return {
      claimId,
      claimNumber,
      claimMonth: data.claimMonth,
      claimYear: data.claimYear,
      asfLocationId: data.asfLocationId,
      brandId: data.brandId,
      totalJobsCount: data.totalJobsCount,
      grossLaborAmount: data.grossLaborAmount,
      grossTravelAmount: data.grossTravelAmount,
      penaltyDeductionAmount: data.penaltyDeductionAmount,
      netClaimAmount: data.netClaimAmount,
      status: data.status,
      submittedAt: new Date(),
      submittedBy: data.submittedBy,
      submittedByUsername: data.submittedByUsername,
      remarks: data.remarks,
      createdAt: new Date(),
      updatedAt: new Date(),
      lineItems: insertedLines,
    };
  }

  async getClaimById(claimId: string, conn?: oracledb.Connection): Promise<ServiceClaimRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const claimSql = `
        SELECT sc.CLAIM_ID, sc.CLAIM_NUMBER, sc.CLAIM_MONTH, sc.CLAIM_YEAR,
               sc.ASF_LOCATION_ID, l.LOCATION_NAME AS ASF_LOCATION_NAME,
               sc.BRAND_ID, b.BRAND_NAME,
               sc.TOTAL_JOBS_COUNT, sc.GROSS_LABOR_AMOUNT, sc.GROSS_TRAVEL_AMOUNT,
               sc.PENALTY_DEDUCTION_AMOUNT, sc.NET_CLAIM_AMOUNT, sc.STATUS,
               sc.SUBMITTED_AT, sc.SUBMITTED_BY, sc.SUBMITTED_BY_USERNAME,
               sc.AUDITED_AT, sc.AUDITED_BY, sc.AUDITED_BY_USERNAME,
               sc.APPROVED_AT, sc.APPROVED_BY, sc.APPROVED_BY_USERNAME,
               sc.REJECTION_REASON, sc.JOURNAL_ID, sc.REMARKS,
               sc.CREATED_AT, sc.UPDATED_AT
        FROM SERVICE_CLAIMS sc
        JOIN LOCATIONS l ON sc.ASF_LOCATION_ID = l.LOCATION_ID
        LEFT JOIN BRANDS b ON sc.BRAND_ID = b.BRAND_ID
        WHERE sc.CLAIM_ID = :claimId
      `;

      const result = await connection.execute<any>(claimSql, { claimId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const row = result.rows?.[0];
      if (!row) return null;

      const linesSql = `
        SELECT ITEM_ID, CLAIM_ID, SERVICE_REQUEST_ID, JOB_NUMBER,
               CALL_TYPE, PRODUCT_NAME, IS_HAPPY_CODE_VERIFIED,
               COMPLETION_TAT_HOURS, TAT_APPLIED_PERCENTAGE,
               BASE_LABOR_AMOUNT, CLAIMABLE_LABOR_AMOUNT,
               TRAVEL_KM, TRAVEL_AMOUNT, PENALTY_AMOUNT,
               NET_LINE_AMOUNT, AUDIT_STATUS, AUDIT_NOTE, CREATED_AT
        FROM CLAIM_LINE_ITEMS
        WHERE CLAIM_ID = :claimId
        ORDER BY JOB_NUMBER ASC
      `;

      const linesResult = await connection.execute<any>(linesSql, { claimId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const lineItems: ClaimLineItemRecord[] = (linesResult.rows || []).map((lr: any) => ({
        itemId: lr.ITEM_ID,
        claimId: lr.CLAIM_ID,
        serviceRequestId: lr.SERVICE_REQUEST_ID,
        jobNumber: lr.JOB_NUMBER,
        callType: lr.CALL_TYPE,
        productName: lr.PRODUCT_NAME || undefined,
        isHappyCodeVerified: lr.IS_HAPPY_CODE_VERIFIED,
        completionTatHours: Number(lr.COMPLETION_TAT_HOURS || 0),
        tatAppliedPercentage: Number(lr.TAT_APPLIED_PERCENTAGE || 100),
        baseLaborAmount: Number(lr.BASE_LABOR_AMOUNT || 0),
        claimableLaborAmount: Number(lr.CLAIMABLE_LABOR_AMOUNT || 0),
        travelKm: Number(lr.TRAVEL_KM || 0),
        travelAmount: Number(lr.TRAVEL_AMOUNT || 0),
        penaltyAmount: Number(lr.PENALTY_AMOUNT || 0),
        netLineAmount: Number(lr.NET_LINE_AMOUNT || 0),
        auditStatus: lr.AUDIT_STATUS,
        auditNote: lr.AUDIT_NOTE || undefined,
        createdAt: new Date(lr.CREATED_AT),
      }));

      return {
        claimId: row.CLAIM_ID,
        claimNumber: row.CLAIM_NUMBER,
        claimMonth: Number(row.CLAIM_MONTH),
        claimYear: Number(row.CLAIM_YEAR),
        asfLocationId: row.ASF_LOCATION_ID,
        asfLocationName: row.ASF_LOCATION_NAME,
        brandId: row.BRAND_ID || undefined,
        brandName: row.BRAND_NAME || undefined,
        totalJobsCount: Number(row.TOTAL_JOBS_COUNT || 0),
        grossLaborAmount: Number(row.GROSS_LABOR_AMOUNT || 0),
        grossTravelAmount: Number(row.GROSS_TRAVEL_AMOUNT || 0),
        penaltyDeductionAmount: Number(row.PENALTY_DEDUCTION_AMOUNT || 0),
        netClaimAmount: Number(row.NET_CLAIM_AMOUNT || 0),
        status: row.STATUS as ClaimStatus,
        submittedAt: row.SUBMITTED_AT ? new Date(row.SUBMITTED_AT) : undefined,
        submittedBy: row.SUBMITTED_BY || undefined,
        submittedByUsername: row.SUBMITTED_BY_USERNAME || undefined,
        auditedAt: row.AUDITED_AT ? new Date(row.AUDITED_AT) : undefined,
        auditedBy: row.AUDITED_BY || undefined,
        auditedByUsername: row.AUDITED_BY_USERNAME || undefined,
        approvedAt: row.APPROVED_AT ? new Date(row.APPROVED_AT) : undefined,
        approvedBy: row.APPROVED_BY || undefined,
        approvedByUsername: row.APPROVED_BY_USERNAME || undefined,
        rejectionReason: row.REJECTION_REASON || undefined,
        journalId: row.JOURNAL_ID || undefined,
        remarks: row.REMARKS || undefined,
        createdAt: new Date(row.CREATED_AT),
        updatedAt: new Date(row.UPDATED_AT),
        lineItems,
      };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async listClaims(options: {
    asfLocationId?: string;
    brandId?: string;
    status?: ClaimStatus;
    claimMonth?: number;
    claimYear?: number;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: ServiceClaimRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options.asfLocationId) {
        binds.asfLocationId = options.asfLocationId;
        whereClauses.push('sc.ASF_LOCATION_ID = :asfLocationId');
      }

      if (options.brandId) {
        binds.brandId = options.brandId;
        whereClauses.push('sc.BRAND_ID = :brandId');
      }

      if (options.status) {
        binds.status = options.status;
        whereClauses.push('sc.STATUS = :status');
      }

      if (options.claimMonth) {
        binds.claimMonth = options.claimMonth;
        whereClauses.push('sc.CLAIM_MONTH = :claimMonth');
      }

      if (options.claimYear) {
        binds.claimYear = options.claimYear;
        whereClauses.push('sc.CLAIM_YEAR = :claimYear');
      }

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push(
          '(LOWER(sc.CLAIM_NUMBER) LIKE :search OR LOWER(l.LOCATION_NAME) LIKE :search OR LOWER(sc.REMARKS) LIKE :search)'
        );
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM SERVICE_CLAIMS sc
        JOIN LOCATIONS l ON sc.ASF_LOCATION_ID = l.LOCATION_ID
        LEFT JOIN BRANDS b ON sc.BRAND_ID = b.BRAND_ID
        ${whereSql}
      `;

      const countRes = await conn.execute<any>(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const total = Number(countRes.rows?.[0]?.CNT || 0);

      const page = Math.max(1, options.page || 1);
      const limit = Math.min(100, Math.max(1, options.limit || 20));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const sql = `
        SELECT sc.CLAIM_ID, sc.CLAIM_NUMBER, sc.CLAIM_MONTH, sc.CLAIM_YEAR,
               sc.ASF_LOCATION_ID, l.LOCATION_NAME AS ASF_LOCATION_NAME,
               sc.BRAND_ID, b.BRAND_NAME,
               sc.TOTAL_JOBS_COUNT, sc.GROSS_LABOR_AMOUNT, sc.GROSS_TRAVEL_AMOUNT,
               sc.PENALTY_DEDUCTION_AMOUNT, sc.NET_CLAIM_AMOUNT, sc.STATUS,
               sc.SUBMITTED_AT, sc.SUBMITTED_BY, sc.SUBMITTED_BY_USERNAME,
               sc.AUDITED_AT, sc.AUDITED_BY, sc.AUDITED_BY_USERNAME,
               sc.APPROVED_AT, sc.APPROVED_BY, sc.APPROVED_BY_USERNAME,
               sc.REJECTION_REASON, sc.JOURNAL_ID, sc.REMARKS,
               sc.CREATED_AT, sc.UPDATED_AT
        FROM SERVICE_CLAIMS sc
        JOIN LOCATIONS l ON sc.ASF_LOCATION_ID = l.LOCATION_ID
        LEFT JOIN BRANDS b ON sc.BRAND_ID = b.BRAND_ID
        ${whereSql}
        ORDER BY sc.CLAIM_YEAR DESC, sc.CLAIM_MONTH DESC, sc.CREATED_AT DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const result = await conn.execute<any>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const items: ServiceClaimRecord[] = (result.rows || []).map((row: any) => ({
        claimId: row.CLAIM_ID,
        claimNumber: row.CLAIM_NUMBER,
        claimMonth: Number(row.CLAIM_MONTH),
        claimYear: Number(row.CLAIM_YEAR),
        asfLocationId: row.ASF_LOCATION_ID,
        asfLocationName: row.ASF_LOCATION_NAME,
        brandId: row.BRAND_ID || undefined,
        brandName: row.BRAND_NAME || undefined,
        totalJobsCount: Number(row.TOTAL_JOBS_COUNT || 0),
        grossLaborAmount: Number(row.GROSS_LABOR_AMOUNT || 0),
        grossTravelAmount: Number(row.GROSS_TRAVEL_AMOUNT || 0),
        penaltyDeductionAmount: Number(row.PENALTY_DEDUCTION_AMOUNT || 0),
        netClaimAmount: Number(row.NET_CLAIM_AMOUNT || 0),
        status: row.STATUS as ClaimStatus,
        submittedAt: row.SUBMITTED_AT ? new Date(row.SUBMITTED_AT) : undefined,
        submittedBy: row.SUBMITTED_BY || undefined,
        submittedByUsername: row.SUBMITTED_BY_USERNAME || undefined,
        auditedAt: row.AUDITED_AT ? new Date(row.AUDITED_AT) : undefined,
        auditedBy: row.AUDITED_BY || undefined,
        auditedByUsername: row.AUDITED_BY_USERNAME || undefined,
        approvedAt: row.APPROVED_AT ? new Date(row.APPROVED_AT) : undefined,
        approvedBy: row.APPROVED_BY || undefined,
        approvedByUsername: row.APPROVED_BY_USERNAME || undefined,
        rejectionReason: row.REJECTION_REASON || undefined,
        journalId: row.JOURNAL_ID || undefined,
        remarks: row.REMARKS || undefined,
        createdAt: new Date(row.CREATED_AT),
        updatedAt: new Date(row.UPDATED_AT),
      }));

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

  async updateClaimStatus(
    claimId: string,
    status: ClaimStatus,
    data: {
      auditedBy?: string;
      auditedByUsername?: string;
      auditedAt?: Date;
      approvedBy?: string;
      approvedByUsername?: string;
      approvedAt?: Date;
      rejectionReason?: string;
      journalId?: string;
      netClaimAmount?: number;
      penaltyDeductionAmount?: number;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE SERVICE_CLAIMS
      SET STATUS = :status,
          AUDITED_BY = NVL(:auditedBy, AUDITED_BY),
          AUDITED_BY_USERNAME = NVL(:auditedByUsername, AUDITED_BY_USERNAME),
          AUDITED_AT = NVL(:auditedAt, AUDITED_AT),
          APPROVED_BY = NVL(:approvedBy, APPROVED_BY),
          APPROVED_BY_USERNAME = NVL(:approvedByUsername, APPROVED_BY_USERNAME),
          APPROVED_AT = NVL(:approvedAt, APPROVED_AT),
          REJECTION_REASON = NVL(:rejectionReason, REJECTION_REASON),
          JOURNAL_ID = NVL(:journalId, JOURNAL_ID),
          NET_CLAIM_AMOUNT = NVL(:netClaimAmount, NET_CLAIM_AMOUNT),
          PENALTY_DEDUCTION_AMOUNT = NVL(:penaltyDeductionAmount, PENALTY_DEDUCTION_AMOUNT),
          UPDATED_AT = SYSTIMESTAMP
      WHERE CLAIM_ID = :claimId
    `;

    await conn.execute(sql, {
      status,
      auditedBy: data.auditedBy || null,
      auditedByUsername: data.auditedByUsername || null,
      auditedAt: data.auditedAt || null,
      approvedBy: data.approvedBy || null,
      approvedByUsername: data.approvedByUsername || null,
      approvedAt: data.approvedAt || null,
      rejectionReason: data.rejectionReason || null,
      journalId: data.journalId || null,
      netClaimAmount: data.netClaimAmount !== undefined ? data.netClaimAmount : null,
      penaltyDeductionAmount: data.penaltyDeductionAmount !== undefined ? data.penaltyDeductionAmount : null,
      claimId,
    });
  }
}

export const serviceClaimRepository = new ServiceClaimRepository();
