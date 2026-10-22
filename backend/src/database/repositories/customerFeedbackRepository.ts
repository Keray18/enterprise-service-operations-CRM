import oracledb from 'oracledb';
import { CustomerFeedbackRecord } from '../../types/job360.js';
import { getOracleConnection } from '../oraclePool.js';

export class CustomerFeedbackRepository {
  async findByRequestId(requestId: string, connection?: oracledb.Connection): Promise<CustomerFeedbackRecord | null> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        SELECT 
          f.FEEDBACK_ID,
          f.REQUEST_ID,
          f.RATING,
          f.FEEDBACK_REMARKS,
          f.QUALITY_ANALYSIS,
          f.SUBMITTED_BY,
          u.USERNAME AS SUBMITTED_BY_USERNAME,
          f.SUBMITTED_AT
        FROM CUSTOMER_FEEDBACK f
        LEFT JOIN APP_USERS u ON f.SUBMITTED_BY = u.USER_ID
        WHERE f.REQUEST_ID = :requestId
      `;
      const result = await conn.execute(sql, { requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      const row: any = result.rows[0];
      return {
        feedbackId: row.FEEDBACK_ID,
        requestId: row.REQUEST_ID,
        rating: Number(row.RATING),
        feedbackRemarks: row.FEEDBACK_REMARKS || undefined,
        qualityAnalysis: row.QUALITY_ANALYSIS || undefined,
        submittedBy: row.SUBMITTED_BY || undefined,
        submittedByUsername: row.SUBMITTED_BY_USERNAME || undefined,
        submittedAt: row.SUBMITTED_AT,
      };
    } finally {
      if (!connection) {
        await conn.close();
      }
    }
  }

  async createFeedback(
    data: {
      feedbackId: string;
      requestId: string;
      rating: number;
      feedbackRemarks?: string;
      qualityAnalysis?: string;
      submittedBy: string;
    },
    connection?: oracledb.Connection
  ): Promise<CustomerFeedbackRecord> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        INSERT INTO CUSTOMER_FEEDBACK (
          FEEDBACK_ID,
          REQUEST_ID,
          RATING,
          FEEDBACK_REMARKS,
          QUALITY_ANALYSIS,
          SUBMITTED_BY,
          SUBMITTED_AT
        ) VALUES (
          :feedbackId,
          :requestId,
          :rating,
          :feedbackRemarks,
          :qualityAnalysis,
          :submittedBy,
          SYSTIMESTAMP
        )
      `;
      await conn.execute(
        sql,
        {
          feedbackId: data.feedbackId,
          requestId: data.requestId,
          rating: { val: data.rating, type: oracledb.NUMBER },
          feedbackRemarks: data.feedbackRemarks || null,
          qualityAnalysis: data.qualityAnalysis || null,
          submittedBy: data.submittedBy,
        },
        { autoCommit: !connection }
      );

      const created = await this.findByRequestId(data.requestId, conn);
      if (!created) {
        throw new Error('FEEDBACK_CREATION_FAILED: Failed to fetch created feedback record');
      }
      return created;
    } finally {
      if (!connection) {
        await conn.close();
      }
    }
  }
}

export const customerFeedbackRepository = new CustomerFeedbackRepository();
