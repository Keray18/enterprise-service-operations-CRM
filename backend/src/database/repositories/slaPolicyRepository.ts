import crypto from 'crypto';
import oracledb from 'oracledb';
import { PenaltyBreachType, PolicyApprovalStatus, SlaPenaltyPolicyRecord } from '../../types/finance.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToPolicy(row: any): SlaPenaltyPolicyRecord {
  return {
    policyId: row.POLICY_ID,
    policyCode: row.POLICY_CODE,
    policyName: row.POLICY_NAME,
    policyVersion: row.POLICY_VERSION,
    brandId: row.BRAND_ID || undefined,
    brandName: row.BRAND_NAME || undefined,
    breachType: row.BREACH_TYPE as PenaltyBreachType,
    calculationType: row.CALCULATION_TYPE,
    penaltyAmount: Number(row.PENALTY_AMOUNT || 0),
    effectiveFrom: new Date(row.EFFECTIVE_FROM),
    effectiveTo: row.EFFECTIVE_TO ? new Date(row.EFFECTIVE_TO) : undefined,
    isActive: row.IS_ACTIVE,
    governanceRef: row.GOVERNANCE_REF || undefined,
    approvalStatus: (row.APPROVAL_STATUS || 'PENDING_APPROVAL') as PolicyApprovalStatus,
    approvedBy: row.APPROVED_BY || undefined,
    approvedAt: row.APPROVED_AT ? new Date(row.APPROVED_AT) : undefined,
    approvalRemarks: row.APPROVAL_REMARKS || undefined,
    submittedBy: row.SUBMITTED_BY || undefined,
    submittedAt: row.SUBMITTED_AT ? new Date(row.SUBMITTED_AT) : undefined,
    createdAt: new Date(row.CREATED_AT),
    updatedAt: new Date(row.UPDATED_AT),
  };
}

export class SlaPolicyRepository {
  async createPolicy(
    data: {
      policyCode: string;
      policyName: string;
      policyVersion: string;
      brandId?: string;
      breachType: PenaltyBreachType;
      calculationType?: 'FIXED' | 'PERCENTAGE';
      penaltyAmount: number;
      effectiveFrom?: Date;
      effectiveTo?: Date;
      isActive?: 'Y' | 'N';
      governanceRef?: string;
      approvalStatus?: PolicyApprovalStatus;
      approvedBy?: string;
      approvedAt?: Date;
      approvalRemarks?: string;
      submittedBy?: string;
    },
    conn?: oracledb.Connection
  ): Promise<SlaPenaltyPolicyRecord> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const policyId = crypto.randomUUID();
      const calcType = data.calculationType || 'FIXED';
      const effFrom = data.effectiveFrom || new Date();
      const isActive = data.isActive || 'Y';
      const approvalStatus = data.approvalStatus || 'PENDING_APPROVAL';

      const sql = `
        INSERT INTO SLA_PENALTY_POLICIES (
          POLICY_ID,
          POLICY_CODE,
          POLICY_NAME,
          POLICY_VERSION,
          BRAND_ID,
          BREACH_TYPE,
          CALCULATION_TYPE,
          PENALTY_AMOUNT,
          EFFECTIVE_FROM,
          EFFECTIVE_TO,
          IS_ACTIVE,
          GOVERNANCE_REF,
          APPROVAL_STATUS,
          APPROVED_BY,
          APPROVED_AT,
          APPROVAL_REMARKS,
          SUBMITTED_BY,
          SUBMITTED_AT,
          CREATED_AT,
          UPDATED_AT
        ) VALUES (
          :policyId,
          :policyCode,
          :policyName,
          :policyVersion,
          :brandId,
          :breachType,
          :calculationType,
          :penaltyAmount,
          :effectiveFrom,
          :effectiveTo,
          :isActive,
          :governanceRef,
          :approvalStatus,
          :approvedBy,
          :approvedAt,
          :approvalRemarks,
          :submittedBy,
          SYSTIMESTAMP,
          SYSTIMESTAMP,
          SYSTIMESTAMP
        )
      `;

      await connection.execute(sql, {
        policyId,
        policyCode: data.policyCode,
        policyName: data.policyName,
        policyVersion: data.policyVersion,
        brandId: data.brandId || null,
        breachType: data.breachType,
        calculationType: calcType,
        penaltyAmount: data.penaltyAmount,
        effectiveFrom: effFrom,
        effectiveTo: data.effectiveTo || null,
        isActive,
        governanceRef: data.governanceRef || null,
        approvalStatus,
        approvedBy: data.approvedBy || null,
        approvedAt: data.approvedAt || null,
        approvalRemarks: data.approvalRemarks || null,
        submittedBy: data.submittedBy || null,
      });

      if (!isExternalConn) {
        await connection.commit();
      }

      const created = await this.findPolicyByCode(data.policyCode, connection);
      if (!created) throw new Error('Failed to retrieve newly created SLA penalty policy.');
      return created;
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async findPolicyById(policyId: string, conn?: oracledb.Connection): Promise<SlaPenaltyPolicyRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `
        SELECT p.POLICY_ID, p.POLICY_CODE, p.POLICY_NAME, p.POLICY_VERSION,
               p.BRAND_ID, b.BRAND_NAME, p.BREACH_TYPE, p.CALCULATION_TYPE,
               p.PENALTY_AMOUNT, p.EFFECTIVE_FROM, p.EFFECTIVE_TO, p.IS_ACTIVE,
               p.GOVERNANCE_REF, p.APPROVAL_STATUS, p.APPROVED_BY, p.APPROVED_AT,
               p.APPROVAL_REMARKS, p.SUBMITTED_BY, p.SUBMITTED_AT, p.CREATED_AT, p.UPDATED_AT
        FROM SLA_PENALTY_POLICIES p
        LEFT JOIN BRANDS b ON p.BRAND_ID = b.BRAND_ID
        WHERE p.POLICY_ID = :policyId
      `;

      const result = await connection.execute<any>(sql, { policyId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const row = result.rows?.[0];
      if (!row) return null;
      return mapRowToPolicy(row);
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async findPolicyByCode(policyCode: string, conn?: oracledb.Connection): Promise<SlaPenaltyPolicyRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `
        SELECT p.POLICY_ID, p.POLICY_CODE, p.POLICY_NAME, p.POLICY_VERSION,
               p.BRAND_ID, b.BRAND_NAME, p.BREACH_TYPE, p.CALCULATION_TYPE,
               p.PENALTY_AMOUNT, p.EFFECTIVE_FROM, p.EFFECTIVE_TO, p.IS_ACTIVE,
               p.GOVERNANCE_REF, p.APPROVAL_STATUS, p.APPROVED_BY, p.APPROVED_AT,
               p.APPROVAL_REMARKS, p.SUBMITTED_BY, p.SUBMITTED_AT, p.CREATED_AT, p.UPDATED_AT
        FROM SLA_PENALTY_POLICIES p
        LEFT JOIN BRANDS b ON p.BRAND_ID = b.BRAND_ID
        WHERE p.POLICY_CODE = :policyCode
      `;

      const result = await connection.execute<any>(sql, { policyCode }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const row = result.rows?.[0];
      if (!row) return null;
      return mapRowToPolicy(row);
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  /**
   * Finds an active AND formally approved commercial SLA policy.
   * Unapproved policies (even if IS_ACTIVE = 'Y') are categorically excluded.
   */
  async findActivePolicy(
    breachType: PenaltyBreachType,
    brandId?: string,
    conn?: oracledb.Connection
  ): Promise<SlaPenaltyPolicyRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      // 1. Try brand-specific policy first if brandId provided
      if (brandId) {
        const sql = `
          SELECT p.POLICY_ID, p.POLICY_CODE, p.POLICY_NAME, p.POLICY_VERSION,
                 p.BRAND_ID, b.BRAND_NAME, p.BREACH_TYPE, p.CALCULATION_TYPE,
                 p.PENALTY_AMOUNT, p.EFFECTIVE_FROM, p.EFFECTIVE_TO, p.IS_ACTIVE,
                 p.GOVERNANCE_REF, p.APPROVAL_STATUS, p.APPROVED_BY, p.APPROVED_AT,
                 p.APPROVAL_REMARKS, p.SUBMITTED_BY, p.SUBMITTED_AT, p.CREATED_AT, p.UPDATED_AT
          FROM SLA_PENALTY_POLICIES p
          LEFT JOIN BRANDS b ON p.BRAND_ID = b.BRAND_ID
          WHERE p.BREACH_TYPE = :breachType
            AND p.BRAND_ID = :brandId
            AND p.IS_ACTIVE = 'Y'
            AND p.APPROVAL_STATUS = 'APPROVED'
            AND p.EFFECTIVE_FROM <= SYSTIMESTAMP
            AND (p.EFFECTIVE_TO IS NULL OR p.EFFECTIVE_TO >= SYSTIMESTAMP)
          ORDER BY p.CREATED_AT DESC
          FETCH FIRST 1 ROWS ONLY
        `;
        const res = await connection.execute<any>(sql, { breachType, brandId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (res.rows && res.rows.length > 0) {
          return mapRowToPolicy(res.rows[0]);
        }
      }

      // 2. Fall back to global default policy (BRAND_ID IS NULL)
      const globalSql = `
        SELECT p.POLICY_ID, p.POLICY_CODE, p.POLICY_NAME, p.POLICY_VERSION,
               p.BRAND_ID, b.BRAND_NAME, p.BREACH_TYPE, p.CALCULATION_TYPE,
               p.PENALTY_AMOUNT, p.EFFECTIVE_FROM, p.EFFECTIVE_TO, p.IS_ACTIVE,
               p.GOVERNANCE_REF, p.APPROVAL_STATUS, p.APPROVED_BY, p.APPROVED_AT,
               p.APPROVAL_REMARKS, p.SUBMITTED_BY, p.SUBMITTED_AT, p.CREATED_AT, p.UPDATED_AT
        FROM SLA_PENALTY_POLICIES p
        LEFT JOIN BRANDS b ON p.BRAND_ID = b.BRAND_ID
        WHERE p.BREACH_TYPE = :breachType
          AND p.BRAND_ID IS NULL
          AND p.IS_ACTIVE = 'Y'
          AND p.APPROVAL_STATUS = 'APPROVED'
          AND p.EFFECTIVE_FROM <= SYSTIMESTAMP
          AND (p.EFFECTIVE_TO IS NULL OR p.EFFECTIVE_TO >= SYSTIMESTAMP)
        ORDER BY p.CREATED_AT DESC
        FETCH FIRST 1 ROWS ONLY
      `;
      const globalRes = await connection.execute<any>(globalSql, { breachType }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (globalRes.rows && globalRes.rows.length > 0) {
        return mapRowToPolicy(globalRes.rows[0]);
      }

      return null;
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async listPolicies(options?: {
    breachType?: PenaltyBreachType;
    brandId?: string;
    isActive?: 'Y' | 'N';
    approvalStatus?: PolicyApprovalStatus;
    limit?: number;
  }): Promise<SlaPenaltyPolicyRecord[]> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const where: string[] = ['1=1'];

      if (options?.breachType) {
        binds.breachType = options.breachType;
        where.push('p.BREACH_TYPE = :breachType');
      }

      if (options?.brandId) {
        binds.brandId = options.brandId;
        where.push('p.BRAND_ID = :brandId');
      }

      if (options?.isActive) {
        binds.isActive = options.isActive;
        where.push('p.IS_ACTIVE = :isActive');
      }

      if (options?.approvalStatus) {
        binds.approvalStatus = options.approvalStatus;
        where.push('p.APPROVAL_STATUS = :approvalStatus');
      }

      const limit = Math.min(100, options?.limit || 50);
      binds.limit = limit;

      const sql = `
        SELECT p.POLICY_ID, p.POLICY_CODE, p.POLICY_NAME, p.POLICY_VERSION,
               p.BRAND_ID, b.BRAND_NAME, p.BREACH_TYPE, p.CALCULATION_TYPE,
               p.PENALTY_AMOUNT, p.EFFECTIVE_FROM, p.EFFECTIVE_TO, p.IS_ACTIVE,
               p.GOVERNANCE_REF, p.APPROVAL_STATUS, p.APPROVED_BY, p.APPROVED_AT,
               p.APPROVAL_REMARKS, p.SUBMITTED_BY, p.SUBMITTED_AT, p.CREATED_AT, p.UPDATED_AT
        FROM SLA_PENALTY_POLICIES p
        LEFT JOIN BRANDS b ON p.BRAND_ID = b.BRAND_ID
        WHERE ${where.join(' AND ')}
        ORDER BY p.POLICY_CODE ASC
        FETCH FIRST :limit ROWS ONLY
      `;

      const result = await conn.execute<any>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (result.rows || []).map(mapRowToPolicy);
    } finally {
      await conn.close();
    }
  }

  async updatePolicyApproval(
    policyId: string,
    data: {
      approvalStatus: PolicyApprovalStatus;
      approvedBy: string;
      approvalRemarks?: string;
      isActive?: 'Y' | 'N';
    },
    conn?: oracledb.Connection
  ): Promise<void> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `
        UPDATE SLA_PENALTY_POLICIES
        SET APPROVAL_STATUS = :approvalStatus,
            APPROVED_BY = :approvedBy,
            APPROVED_AT = SYSTIMESTAMP,
            APPROVAL_REMARKS = :approvalRemarks,
            IS_ACTIVE = NVL(:isActive, IS_ACTIVE),
            UPDATED_AT = SYSTIMESTAMP
        WHERE POLICY_ID = :policyId
      `;

      await connection.execute(sql, {
        approvalStatus: data.approvalStatus,
        approvedBy: data.approvedBy,
        approvalRemarks: data.approvalRemarks || null,
        isActive: data.isActive || null,
        policyId,
      });

      if (!isExternalConn) {
        await connection.commit();
      }
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }
}

export const slaPolicyRepository = new SlaPolicyRepository();
