import oracledb from 'oracledb';
import { ReplacementRequestRecord, ReplacementReasonCode, ReplacementRequestStatus } from '../../types/job360.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToReplacement(row: any): ReplacementRequestRecord {
  return {
    replacementId: row.REPLACEMENT_ID,
    requestId: row.REQUEST_ID,
    jobNumber: row.JOB_NUMBER || undefined,
    customerPhone: row.CUSTOMER_PHONE || undefined,
    reasonCode: row.REASON_CODE as ReplacementReasonCode,
    reasonDescription: row.REASON_DESCRIPTION,
    technicianRemarks: row.TECHNICIAN_REMARKS || undefined,
    status: row.STATUS as ReplacementRequestStatus,
    approvalNumber: row.APPROVAL_NUMBER || undefined,
    requestedBy: row.REQUESTED_BY,
    requestedByUsername: row.REQUESTED_BY_USERNAME || undefined,
    requestedAt: row.REQUESTED_AT,
    reviewedBy: row.REVIEWED_BY || undefined,
    reviewedByUsername: row.REVIEWED_BY_USERNAME || undefined,
    reviewedAt: row.REVIEWED_AT || undefined,
    reviewRemarks: row.REVIEW_REMARKS || undefined,
    requiredPartId: row.REQUIRED_PART_ID || undefined,
    warrantyType: row.WARRANTY_TYPE || undefined,
    quotationAmount: row.QUOTATION_AMOUNT != null ? Number(row.QUOTATION_AMOUNT) : undefined,
    quotationStatus: row.QUOTATION_STATUS || undefined,
    quotationApprovedAt: row.QUOTATION_APPROVED_AT || undefined,
    quotationRejectedAt: row.QUOTATION_REJECTED_AT || undefined,
    quotationRejectionReason: row.QUOTATION_REJECTION_REASON || undefined,
    stockStatus: row.STOCK_STATUS || undefined,
    allocatedLocationId: row.ALLOCATED_LOCATION_ID || undefined,
    dispatchId: row.DISPATCH_ID || undefined,
    assignedEngineerId: row.ASSIGNED_ENGINEER_ID || undefined,
    assignedEngineerName: row.ASSIGNED_ENGINEER_NAME || undefined,
    appointmentSlot: row.APPOINTMENT_SLOT || undefined,
    appointmentVersion: row.APPOINTMENT_VERSION != null ? Number(row.APPOINTMENT_VERSION) : undefined,
    closedAt: row.CLOSED_AT || undefined,
    closedBy: row.CLOSED_BY || undefined,
    updatedAt: row.UPDATED_AT || undefined,
  };
}

const SELECT_REPLACEMENT_SQL = `
  SELECT 
    r.REPLACEMENT_ID,
    r.REQUEST_ID,
    sr.JOB_NUMBER,
    c.PRIMARY_MOBILE AS CUSTOMER_PHONE,
    r.REASON_CODE,
    r.REASON_DESCRIPTION,
    r.TECHNICIAN_REMARKS,
    r.STATUS,
    r.APPROVAL_NUMBER,
    r.REQUESTED_BY,
    u1.USERNAME AS REQUESTED_BY_USERNAME,
    r.REQUESTED_AT,
    r.REVIEWED_BY,
    u2.USERNAME AS REVIEWED_BY_USERNAME,
    r.REVIEWED_AT,
    r.REVIEW_REMARKS,
    r.REQUIRED_PART_ID,
    r.WARRANTY_TYPE,
    r.QUOTATION_AMOUNT,
    r.QUOTATION_STATUS,
    r.QUOTATION_APPROVED_AT,
    r.QUOTATION_REJECTED_AT,
    r.QUOTATION_REJECTION_REASON,
    r.STOCK_STATUS,
    r.ALLOCATED_LOCATION_ID,
    r.DISPATCH_ID,
    r.ASSIGNED_ENGINEER_ID,
    u3.USERNAME AS ASSIGNED_ENGINEER_NAME,
    r.APPOINTMENT_SLOT,
    r.APPOINTMENT_VERSION,
    r.CLOSED_AT,
    r.CLOSED_BY,
    r.UPDATED_AT
  FROM REPLACEMENT_REQUESTS r
  LEFT JOIN SERVICE_REQUESTS sr ON r.REQUEST_ID = sr.REQUEST_ID
  LEFT JOIN CUSTOMERS c ON sr.CUSTOMER_ID = c.CUSTOMER_ID
  LEFT JOIN APP_USERS u1 ON r.REQUESTED_BY = u1.USER_ID
  LEFT JOIN APP_USERS u2 ON r.REVIEWED_BY = u2.USER_ID
  LEFT JOIN APP_USERS u3 ON r.ASSIGNED_ENGINEER_ID = u3.USER_ID
`;

export class ReplacementRequestRepository {
  async findByRequestId(requestId: string, connection?: oracledb.Connection): Promise<ReplacementRequestRecord | null> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        ${SELECT_REPLACEMENT_SQL}
        WHERE r.REQUEST_ID = :requestId
        ORDER BY r.REQUESTED_AT DESC
        FETCH FIRST 1 ROWS ONLY
      `;
      const result = await conn.execute(sql, { requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      return mapRowToReplacement(result.rows[0]);
    } finally {
      if (!connection) {
        await conn.close();
      }
    }
  }

  async findById(replacementId: string, connection?: oracledb.Connection): Promise<ReplacementRequestRecord | null> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        ${SELECT_REPLACEMENT_SQL}
        WHERE r.REPLACEMENT_ID = :replacementId
      `;
      const result = await conn.execute(sql, { replacementId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      return mapRowToReplacement(result.rows[0]);
    } finally {
      if (!connection) {
        await conn.close();
      }
    }
  }

  async createPhase2Request(
    data: {
      replacementId: string;
      requestId: string;
      reasonCode: ReplacementReasonCode;
      reasonDescription: string;
      technicianRemarks?: string;
      requestedBy: string;
      requiredPartId?: string;
      warrantyType?: 'IN_WARRANTY' | 'OUT_OF_WARRANTY';
      quotationAmount?: number;
      quotationStatus?: 'NOT_REQUIRED' | 'PENDING_CUSTOMER_APPROVAL' | 'APPROVED' | 'DECLINED';
      stockStatus?: 'ALLOCATED' | 'PENDING_STOCK';
      allocatedLocationId?: string;
    },
    conn: oracledb.Connection
  ): Promise<ReplacementRequestRecord> {
    const sql = `
      INSERT INTO REPLACEMENT_REQUESTS (
        REPLACEMENT_ID,
        REQUEST_ID,
        REASON_CODE,
        REASON_DESCRIPTION,
        TECHNICIAN_REMARKS,
        STATUS,
        REQUESTED_BY,
        REQUESTED_AT,
        REQUIRED_PART_ID,
        WARRANTY_TYPE,
        QUOTATION_AMOUNT,
        QUOTATION_STATUS,
        STOCK_STATUS,
        ALLOCATED_LOCATION_ID,
        APPOINTMENT_VERSION,
        UPDATED_AT
      ) VALUES (
        :replacementId,
        :requestId,
        :reasonCode,
        :reasonDescription,
        :technicianRemarks,
        'OPEN',
        :requestedBy,
        SYSTIMESTAMP,
        :requiredPartId,
        :warrantyType,
        :quotationAmount,
        :quotationStatus,
        :stockStatus,
        :allocatedLocationId,
        1,
        SYSTIMESTAMP
      )
    `;
    await conn.execute(sql, {
      replacementId: data.replacementId,
      requestId: data.requestId,
      reasonCode: data.reasonCode,
      reasonDescription: data.reasonDescription,
      technicianRemarks: data.technicianRemarks || null,
      requestedBy: data.requestedBy,
      requiredPartId: data.requiredPartId || null,
      warrantyType: data.warrantyType || null,
      quotationAmount: data.quotationAmount != null ? data.quotationAmount : null,
      quotationStatus: data.quotationStatus || null,
      stockStatus: data.stockStatus || null,
      allocatedLocationId: data.allocatedLocationId || null,
    });

    const created = await this.findById(data.replacementId, conn);
    if (!created) {
      throw new Error('REPLACEMENT_CREATION_FAILED: Failed to fetch created replacement request');
    }
    return created;
  }

  async updateStatus(
    replacementId: string,
    status: ReplacementRequestStatus,
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE REPLACEMENT_REQUESTS
      SET STATUS = :status, UPDATED_AT = SYSTIMESTAMP
      WHERE REPLACEMENT_ID = :replacementId
    `;
    await conn.execute(sql, { replacementId, status });
  }

  async updateQuotation(
    replacementId: string,
    data: {
      quotationAmount: number;
      quotationStatus: 'PENDING_CUSTOMER_APPROVAL' | 'NOT_REQUIRED';
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE REPLACEMENT_REQUESTS
      SET 
        QUOTATION_AMOUNT = :quotationAmount,
        QUOTATION_STATUS = :quotationStatus,
        QUOTATION_APPROVED_AT = NULL,
        QUOTATION_REJECTED_AT = NULL,
        QUOTATION_REJECTION_REASON = NULL,
        APPOINTMENT_VERSION = NVL(APPOINTMENT_VERSION, 1) + 1,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REPLACEMENT_ID = :replacementId
    `;
    await conn.execute(sql, {
      replacementId,
      quotationAmount: data.quotationAmount,
      quotationStatus: data.quotationStatus,
    });
  }

  async recordQuotationDecision(
    replacementId: string,
    data: {
      decision: 'APPROVED' | 'DECLINED';
      reason?: string;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    if (data.decision === 'APPROVED') {
      const sql = `
        UPDATE REPLACEMENT_REQUESTS
        SET 
          QUOTATION_STATUS = 'APPROVED',
          STATUS = 'QUOTATION_APPROVED',
          QUOTATION_APPROVED_AT = SYSTIMESTAMP,
          UPDATED_AT = SYSTIMESTAMP
        WHERE REPLACEMENT_ID = :replacementId
      `;
      await conn.execute(sql, { replacementId });
    } else {
      const sql = `
        UPDATE REPLACEMENT_REQUESTS
        SET 
          QUOTATION_STATUS = 'DECLINED',
          STATUS = 'CUSTOMER_DECLINED',
          QUOTATION_REJECTED_AT = SYSTIMESTAMP,
          QUOTATION_REJECTION_REASON = :reason,
          UPDATED_AT = SYSTIMESTAMP
        WHERE REPLACEMENT_ID = :replacementId
      `;
      await conn.execute(sql, {
        replacementId,
        reason: data.reason || 'Customer rejected quotation',
      });
    }
  }

  async updateAllocation(
    replacementId: string,
    data: {
      status: ReplacementRequestStatus;
      stockStatus: 'ALLOCATED' | 'PENDING_STOCK';
      allocatedLocationId: string;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE REPLACEMENT_REQUESTS
      SET 
        STATUS = :status,
        STOCK_STATUS = :stockStatus,
        ALLOCATED_LOCATION_ID = :allocatedLocationId,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REPLACEMENT_ID = :replacementId
    `;
    await conn.execute(sql, {
      replacementId,
      status: data.status,
      stockStatus: data.stockStatus,
      allocatedLocationId: data.allocatedLocationId,
    });
  }

  async recordDispatch(
    replacementId: string,
    data: {
      dispatchId: string;
      status: ReplacementRequestStatus;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE REPLACEMENT_REQUESTS
      SET 
        STATUS = :status,
        DISPATCH_ID = :dispatchId,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REPLACEMENT_ID = :replacementId
    `;
    await conn.execute(sql, {
      replacementId,
      dispatchId: data.dispatchId,
      status: data.status,
    });
  }

  async recordAsfReceipt(
    replacementId: string,
    locationId: string,
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE REPLACEMENT_REQUESTS
      SET 
        STATUS = 'RECEIVED_AT_ASF',
        ALLOCATED_LOCATION_ID = :locationId,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REPLACEMENT_ID = :replacementId
    `;
    await conn.execute(sql, { replacementId, locationId });
  }

  async scheduleInstallation(
    replacementId: string,
    data: {
      engineerId: string;
      appointmentSlot: Date;
      appointmentVersion: number;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE REPLACEMENT_REQUESTS
      SET 
        STATUS = 'APPOINTMENT_SCHEDULED',
        ASSIGNED_ENGINEER_ID = :engineerId,
        APPOINTMENT_SLOT = :appointmentSlot,
        APPOINTMENT_VERSION = :appointmentVersion,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REPLACEMENT_ID = :replacementId
    `;
    await conn.execute(sql, {
      replacementId,
      engineerId: data.engineerId,
      appointmentSlot: data.appointmentSlot,
      appointmentVersion: data.appointmentVersion,
    });
  }

  async markInstallationVerified(
    replacementId: string,
    verifiedBy: string,
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE REPLACEMENT_REQUESTS
      SET 
        STATUS = 'INSTALLATION_VERIFIED',
        REVIEWED_BY = :verifiedBy,
        REVIEWED_AT = SYSTIMESTAMP,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REPLACEMENT_ID = :replacementId
    `;
    await conn.execute(sql, { replacementId, verifiedBy });
  }

  async listReplacements(
    filters: {
      status?: ReplacementRequestStatus;
      locationId?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {},
    connection?: oracledb.Connection
  ): Promise<{ items: ReplacementRequestRecord[]; total: number }> {
    const conn = connection || (await getOracleConnection());
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const offset = (page - 1) * limit;

      const whereClauses: string[] = ['1=1'];
      const binds: Record<string, any> = {};

      if (filters.status) {
        whereClauses.push('r.STATUS = :status');
        binds.status = filters.status;
      }
      if (filters.locationId) {
        whereClauses.push('(sr.ASSIGNED_LOCATION_ID = :locationId OR r.ALLOCATED_LOCATION_ID = :locationId)');
        binds.locationId = filters.locationId;
      }
      if (filters.search) {
        whereClauses.push('(LOWER(r.REPLACEMENT_ID) LIKE :search OR LOWER(sr.JOB_NUMBER) LIKE :search)');
        binds.search = `%${filters.search.toLowerCase()}%`;
      }

      const whereSql = whereClauses.join(' AND ');

      const countSql = `
        SELECT COUNT(*) AS TOTAL
        FROM REPLACEMENT_REQUESTS r
        LEFT JOIN SERVICE_REQUESTS sr ON r.REQUEST_ID = sr.REQUEST_ID
        WHERE ${whereSql}
      `;
      const countRes = await conn.execute<any>(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const total = Number(countRes.rows?.[0]?.TOTAL || 0);

      const querySql = `
        ${SELECT_REPLACEMENT_SQL}
        WHERE ${whereSql}
        ORDER BY r.REQUESTED_AT DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;
      binds.offset = offset;
      binds.limit = limit;

      const result = await conn.execute<any>(querySql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const items = (result.rows || []).map(mapRowToReplacement);

      return { items, total };
    } finally {
      if (!connection) {
        await conn.close();
      }
    }
  }

  async closeReplacement(
    replacementId: string,
    closedBy: string,
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE REPLACEMENT_REQUESTS
      SET 
        STATUS = 'CLOSED',
        CLOSED_AT = SYSTIMESTAMP,
        CLOSED_BY = :closedBy,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REPLACEMENT_ID = :replacementId
    `;
    await conn.execute(sql, { replacementId, closedBy });
  }

  // Legacy compatibility methods
  async createRequest(
    data: {
      replacementId: string;
      requestId: string;
      reasonCode: ReplacementReasonCode;
      reasonDescription: string;
      technicianRemarks?: string;
      requestedBy: string;
    },
    connection?: oracledb.Connection
  ): Promise<ReplacementRequestRecord> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        INSERT INTO REPLACEMENT_REQUESTS (
          REPLACEMENT_ID,
          REQUEST_ID,
          REASON_CODE,
          REASON_DESCRIPTION,
          TECHNICIAN_REMARKS,
          STATUS,
          REQUESTED_BY,
          REQUESTED_AT
        ) VALUES (
          :replacementId,
          :requestId,
          :reasonCode,
          :reasonDescription,
          :technicianRemarks,
          'PENDING',
          :requestedBy,
          SYSTIMESTAMP
        )
      `;
      await conn.execute(
        sql,
        {
          replacementId: data.replacementId,
          requestId: data.requestId,
          reasonCode: data.reasonCode,
          reasonDescription: data.reasonDescription,
          technicianRemarks: data.technicianRemarks || null,
          requestedBy: data.requestedBy,
        },
        { autoCommit: !connection }
      );

      const created = await this.findById(data.replacementId, conn);
      if (!created) {
        throw new Error('REPLACEMENT_CREATION_FAILED: Failed to fetch created replacement request');
      }
      return created;
    } finally {
      if (!connection) {
        await conn.close();
      }
    }
  }

  async updateDecision(
    replacementId: string,
    data: {
      status: 'APPROVED' | 'REJECTED';
      approvalNumber?: string;
      reviewedBy: string;
      reviewRemarks?: string;
    },
    connection?: oracledb.Connection
  ): Promise<ReplacementRequestRecord> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        UPDATE REPLACEMENT_REQUESTS
        SET 
          STATUS = :status,
          APPROVAL_NUMBER = :approvalNumber,
          REVIEWED_BY = :reviewedBy,
          REVIEWED_AT = SYSTIMESTAMP,
          REVIEW_REMARKS = :reviewRemarks
        WHERE REPLACEMENT_ID = :replacementId
      `;
      await conn.execute(
        sql,
        {
          replacementId,
          status: data.status,
          approvalNumber: data.approvalNumber || null,
          reviewedBy: data.reviewedBy,
          reviewRemarks: data.reviewRemarks || null,
        },
        { autoCommit: !connection }
      );

      const updated = await this.findById(replacementId, conn);
      if (!updated) {
        throw new Error('REPLACEMENT_UPDATE_FAILED: Failed to fetch updated replacement request');
      }
      return updated;
    } finally {
      if (!connection) {
        await conn.close();
      }
    }
  }
}

export const replacementRequestRepository = new ReplacementRequestRepository();
