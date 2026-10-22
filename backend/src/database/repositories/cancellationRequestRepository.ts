import oracledb from 'oracledb';
import { CancellationRequestRecord, CancellationReasonCode } from '../../types/job360.js';
import { getOracleConnection } from '../oraclePool.js';

export class CancellationRequestRepository {
  async findByRequestId(requestId: string, connection?: oracledb.Connection): Promise<CancellationRequestRecord | null> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        SELECT 
          c.CANCELLATION_ID,
          c.REQUEST_ID,
          c.REASON_CODE,
          c.REASON_DESCRIPTION,
          c.REMARKS,
          c.STATUS,
          c.REQUESTED_BY,
          u1.USERNAME AS REQUESTED_BY_USERNAME,
          c.REQUESTED_AT,
          c.REVIEWED_BY,
          u2.USERNAME AS REVIEWED_BY_USERNAME,
          c.REVIEWED_AT,
          c.REVIEW_REMARKS
        FROM CANCELLATION_REQUESTS c
        LEFT JOIN APP_USERS u1 ON c.REQUESTED_BY = u1.USER_ID
        LEFT JOIN APP_USERS u2 ON c.REVIEWED_BY = u2.USER_ID
        WHERE c.REQUEST_ID = :requestId
        ORDER BY c.REQUESTED_AT DESC
        FETCH FIRST 1 ROWS ONLY
      `;
      const result = await conn.execute(sql, { requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      const row: any = result.rows[0];
      return {
        cancellationId: row.CANCELLATION_ID,
        requestId: row.REQUEST_ID,
        reasonCode: row.REASON_CODE as CancellationReasonCode,
        reasonDescription: row.REASON_DESCRIPTION,
        remarks: row.REMARKS || undefined,
        status: row.STATUS as 'PENDING' | 'APPROVED' | 'REJECTED',
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

  async findById(cancellationId: string, connection?: oracledb.Connection): Promise<CancellationRequestRecord | null> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        SELECT 
          c.CANCELLATION_ID,
          c.REQUEST_ID,
          c.REASON_CODE,
          c.REASON_DESCRIPTION,
          c.REMARKS,
          c.STATUS,
          c.REQUESTED_BY,
          u1.USERNAME AS REQUESTED_BY_USERNAME,
          c.REQUESTED_AT,
          c.REVIEWED_BY,
          u2.USERNAME AS REVIEWED_BY_USERNAME,
          c.REVIEWED_AT,
          c.REVIEW_REMARKS
        FROM CANCELLATION_REQUESTS c
        LEFT JOIN APP_USERS u1 ON c.REQUESTED_BY = u1.USER_ID
        LEFT JOIN APP_USERS u2 ON c.REVIEWED_BY = u2.USER_ID
        WHERE c.CANCELLATION_ID = :cancellationId
      `;
      const result = await conn.execute(sql, { cancellationId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      const row: any = result.rows[0];
      return {
        cancellationId: row.CANCELLATION_ID,
        requestId: row.REQUEST_ID,
        reasonCode: row.REASON_CODE as CancellationReasonCode,
        reasonDescription: row.REASON_DESCRIPTION,
        remarks: row.REMARKS || undefined,
        status: row.STATUS as 'PENDING' | 'APPROVED' | 'REJECTED',
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
      cancellationId: string;
      requestId: string;
      reasonCode: CancellationReasonCode;
      reasonDescription: string;
      remarks?: string;
      requestedBy: string;
    },
    connection?: oracledb.Connection
  ): Promise<CancellationRequestRecord> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        INSERT INTO CANCELLATION_REQUESTS (
          CANCELLATION_ID,
          REQUEST_ID,
          REASON_CODE,
          REASON_DESCRIPTION,
          REMARKS,
          STATUS,
          REQUESTED_BY,
          REQUESTED_AT
        ) VALUES (
          :cancellationId,
          :requestId,
          :reasonCode,
          :reasonDescription,
          :remarks,
          'PENDING',
          :requestedBy,
          SYSTIMESTAMP
        )
      `;
      await conn.execute(
        sql,
        {
          cancellationId: data.cancellationId,
          requestId: data.requestId,
          reasonCode: data.reasonCode,
          reasonDescription: data.reasonDescription,
          remarks: data.remarks || null,
          requestedBy: data.requestedBy,
        },
        { autoCommit: !connection }
      );

      const created = await this.findById(data.cancellationId, conn);
      if (!created) {
        throw new Error('CANCELLATION_CREATION_FAILED: Failed to fetch created cancellation request');
      }
      return created;
    } finally {
      if (!connection) {
        await conn.close();
      }
    }
  }

  async updateDecision(
    cancellationId: string,
    data: {
      status: 'APPROVED' | 'REJECTED';
      reviewedBy: string;
      reviewRemarks?: string;
    },
    connection?: oracledb.Connection
  ): Promise<CancellationRequestRecord> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        UPDATE CANCELLATION_REQUESTS
        SET 
          STATUS = :status,
          REVIEWED_BY = :reviewedBy,
          REVIEWED_AT = SYSTIMESTAMP,
          REVIEW_REMARKS = :reviewRemarks
        WHERE CANCELLATION_ID = :cancellationId
      `;
      await conn.execute(
        sql,
        {
          cancellationId,
          status: data.status,
          reviewedBy: data.reviewedBy,
          reviewRemarks: data.reviewRemarks || null,
        },
        { autoCommit: !connection }
      );

      const updated = await this.findById(cancellationId, conn);
      if (!updated) {
        throw new Error('CANCELLATION_UPDATE_FAILED: Failed to fetch updated cancellation request');
      }
      return updated;
    } finally {
      if (!connection) {
        await conn.close();
      }
    }
  }
}

export const cancellationRequestRepository = new CancellationRequestRepository();
