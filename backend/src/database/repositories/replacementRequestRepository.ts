import oracledb from 'oracledb';
import { ReplacementRequestRecord, ReplacementReasonCode } from '../../types/job360.js';
import { getOracleConnection } from '../oraclePool.js';

export class ReplacementRequestRepository {
  async findByRequestId(requestId: string, connection?: oracledb.Connection): Promise<ReplacementRequestRecord | null> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        SELECT 
          r.REPLACEMENT_ID,
          r.REQUEST_ID,
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
          r.REVIEW_REMARKS
        FROM REPLACEMENT_REQUESTS r
        LEFT JOIN APP_USERS u1 ON r.REQUESTED_BY = u1.USER_ID
        LEFT JOIN APP_USERS u2 ON r.REVIEWED_BY = u2.USER_ID
        WHERE r.REQUEST_ID = :requestId
        ORDER BY r.REQUESTED_AT DESC
        FETCH FIRST 1 ROWS ONLY
      `;
      const result = await conn.execute(sql, { requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      const row: any = result.rows[0];
      return {
        replacementId: row.REPLACEMENT_ID,
        requestId: row.REQUEST_ID,
        reasonCode: row.REASON_CODE as ReplacementReasonCode,
        reasonDescription: row.REASON_DESCRIPTION,
        technicianRemarks: row.TECHNICIAN_REMARKS || undefined,
        status: row.STATUS as 'PENDING' | 'APPROVED' | 'REJECTED',
        approvalNumber: row.APPROVAL_NUMBER || undefined,
        requestedBy: row.REQUESTED_BY,
        requestedByUsername: row.REQUESTED_BY_USERNAME || undefined,
        requestedAt: row.REQUESTED_AT,
        reviewedBy: row.REVIEWED_BY || undefined,
        reviewedByUsername: row.REVIEWED_BY_USERNAME || undefined,
        reviewedAt: row.REVIEWED_AT || undefined,
        reviewRemarks: row.REVIEW_REMARKS || undefined,
      };
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
        SELECT 
          r.REPLACEMENT_ID,
          r.REQUEST_ID,
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
          r.REVIEW_REMARKS
        FROM REPLACEMENT_REQUESTS r
        LEFT JOIN APP_USERS u1 ON r.REQUESTED_BY = u1.USER_ID
        LEFT JOIN APP_USERS u2 ON r.REVIEWED_BY = u2.USER_ID
        WHERE r.REPLACEMENT_ID = :replacementId
      `;
      const result = await conn.execute(sql, { replacementId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      const row: any = result.rows[0];
      return {
        replacementId: row.REPLACEMENT_ID,
        requestId: row.REQUEST_ID,
        reasonCode: row.REASON_CODE as ReplacementReasonCode,
        reasonDescription: row.REASON_DESCRIPTION,
        technicianRemarks: row.TECHNICIAN_REMARKS || undefined,
        status: row.STATUS as 'PENDING' | 'APPROVED' | 'REJECTED',
        approvalNumber: row.APPROVAL_NUMBER || undefined,
        requestedBy: row.REQUESTED_BY,
        requestedByUsername: row.REQUESTED_BY_USERNAME || undefined,
        requestedAt: row.REQUESTED_AT,
        reviewedBy: row.REVIEWED_BY || undefined,
        reviewedByUsername: row.REVIEWED_BY_USERNAME || undefined,
        reviewedAt: row.REVIEWED_AT || undefined,
        reviewRemarks: row.REVIEW_REMARKS || undefined,
      };
    } finally {
      if (!connection) {
        await conn.close();
      }
    }
  }

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
