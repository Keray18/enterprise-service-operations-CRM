import oracledb from 'oracledb';
import { CustomerFeedbackRecord, SubmitPublicFeedbackInput } from '../../types/job360.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToCustomerFeedback(row: any): CustomerFeedbackRecord {
  return {
    feedbackId: row.FEEDBACK_ID,
    requestId: row.REQUEST_ID,
    tokenHash: row.TOKEN_HASH || undefined,
    rating: row.RATING !== null && row.RATING !== undefined ? Number(row.RATING) : undefined,
    techRating: row.TECH_RATING !== null && row.TECH_RATING !== undefined ? Number(row.TECH_RATING) : undefined,
    repairRating: row.REPAIR_RATING !== null && row.REPAIR_RATING !== undefined ? Number(row.REPAIR_RATING) : undefined,
    issueResolved: row.ISSUE_RESOLVED || undefined,
    feedbackRemarks: row.FEEDBACK_REMARKS || undefined,
    qualityAnalysis: row.QUALITY_ANALYSIS || undefined,
    status: row.STATUS || 'PENDING',
    invitedAt: row.INVITED_AT ? new Date(row.INVITED_AT) : new Date(row.CREATED_AT),
    submittedAt: row.SUBMITTED_AT ? new Date(row.SUBMITTED_AT) : undefined,
    expiresAt: row.EXPIRES_AT ? new Date(row.EXPIRES_AT) : undefined,
    submittedBy: row.SUBMITTED_BY || undefined,
    submittedByUsername: row.SUBMITTED_BY_USERNAME || undefined,
    createdAt: row.CREATED_AT ? new Date(row.CREATED_AT) : undefined,
    updatedAt: row.UPDATED_AT ? new Date(row.UPDATED_AT) : undefined,
  };
}

export class CustomerFeedbackRepository {
  async findByRequestId(requestId: string, connection?: oracledb.Connection): Promise<CustomerFeedbackRecord | null> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        SELECT 
          f.FEEDBACK_ID,
          f.REQUEST_ID,
          f.TOKEN_HASH,
          f.RATING,
          f.TECH_RATING,
          f.REPAIR_RATING,
          f.ISSUE_RESOLVED,
          f.FEEDBACK_REMARKS,
          f.QUALITY_ANALYSIS,
          f.STATUS,
          f.INVITED_AT,
          f.SUBMITTED_AT,
          f.EXPIRES_AT,
          f.SUBMITTED_BY,
          u.USERNAME AS SUBMITTED_BY_USERNAME,
          f.CREATED_AT,
          f.UPDATED_AT
        FROM CUSTOMER_FEEDBACK f
        LEFT JOIN APP_USERS u ON f.SUBMITTED_BY = u.USER_ID
        WHERE f.REQUEST_ID = :requestId
      `;
      const result = await conn.execute(sql, { requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      return mapRowToCustomerFeedback(result.rows[0]);
    } finally {
      if (!connection) {
        await conn.close();
      }
    }
  }

  async findByTokenHash(tokenHash: string, connection?: oracledb.Connection): Promise<(CustomerFeedbackRecord & {
    jobNumber: string;
    productName: string;
    brandName: string;
    closedAt?: Date;
    assignedEngineerId?: string;
    registeredBy?: string;
  }) | null> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        SELECT 
          f.FEEDBACK_ID,
          f.REQUEST_ID,
          f.TOKEN_HASH,
          f.RATING,
          f.TECH_RATING,
          f.REPAIR_RATING,
          f.ISSUE_RESOLVED,
          f.FEEDBACK_REMARKS,
          f.QUALITY_ANALYSIS,
          f.STATUS,
          f.INVITED_AT,
          f.SUBMITTED_AT,
          f.EXPIRES_AT,
          f.SUBMITTED_BY,
          f.CREATED_AT,
          f.UPDATED_AT,
          sr.JOB_NUMBER,
          p.PRODUCT_NAME,
          b.BRAND_NAME,
          sr.CLOSED_AT,
          sr.ASSIGNED_ENGINEER_ID,
          sr.REGISTERED_BY
        FROM CUSTOMER_FEEDBACK f
        JOIN SERVICE_REQUESTS sr ON f.REQUEST_ID = sr.REQUEST_ID
        LEFT JOIN PRODUCTS p ON sr.PRODUCT_ID = p.PRODUCT_ID
        LEFT JOIN BRANDS b ON sr.BRAND_ID = b.BRAND_ID
        WHERE f.TOKEN_HASH = :tokenHash
      `;
      const result = await conn.execute<any>(sql, { tokenHash }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      const base = mapRowToCustomerFeedback(row);
      return {
        ...base,
        jobNumber: row.JOB_NUMBER,
        productName: row.PRODUCT_NAME || 'Appliance',
        brandName: row.BRAND_NAME || 'Brand',
        closedAt: row.CLOSED_AT ? new Date(row.CLOSED_AT) : undefined,
        assignedEngineerId: row.ASSIGNED_ENGINEER_ID || undefined,
        registeredBy: row.REGISTERED_BY || undefined,
      };
    } finally {
      if (!connection) {
        await conn.close();
      }
    }
  }

  async createFeedbackInvitation(
    data: {
      feedbackId: string;
      requestId: string;
      tokenHash: string;
      expiresAt: Date;
    },
    connection?: oracledb.Connection
  ): Promise<void> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        INSERT INTO CUSTOMER_FEEDBACK (
          FEEDBACK_ID,
          REQUEST_ID,
          TOKEN_HASH,
          STATUS,
          INVITED_AT,
          EXPIRES_AT,
          VERSION_NO,
          CREATED_AT,
          UPDATED_AT
        ) VALUES (
          :feedbackId,
          :requestId,
          :tokenHash,
          'PENDING',
          SYSTIMESTAMP,
          :expiresAt,
          1,
          SYSTIMESTAMP,
          SYSTIMESTAMP
        )
      `;
      await conn.execute(
        sql,
        {
          feedbackId: data.feedbackId,
          requestId: data.requestId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
        { autoCommit: !connection }
      );
    } finally {
      if (!connection) {
        await conn.close();
      }
    }
  }

  async submitPublicFeedback(
    tokenHash: string,
    data: SubmitPublicFeedbackInput,
    connection?: oracledb.Connection
  ): Promise<CustomerFeedbackRecord> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        UPDATE CUSTOMER_FEEDBACK
        SET 
          RATING = :overallRating,
          TECH_RATING = :techRating,
          REPAIR_RATING = :repairRating,
          ISSUE_RESOLVED = :issueResolved,
          FEEDBACK_REMARKS = :comments,
          STATUS = 'SUBMITTED',
          SUBMITTED_AT = SYSTIMESTAMP,
          UPDATED_AT = SYSTIMESTAMP,
          VERSION_NO = VERSION_NO + 1
        WHERE TOKEN_HASH = :tokenHash AND STATUS = 'PENDING'
      `;
      const updateRes = await conn.execute(
        sql,
        {
          tokenHash,
          overallRating: { val: data.overallRating, type: oracledb.NUMBER },
          techRating: { val: data.techRating, type: oracledb.NUMBER },
          repairRating: { val: data.repairRating, type: oracledb.NUMBER },
          issueResolved: data.issueResolved,
          comments: data.comments || null,
        },
        { autoCommit: !connection }
      );

      if (updateRes.rowsAffected === 0) {
        throw new Error('FEEDBACK_UPDATE_FAILED: Token invalid, expired, or already submitted');
      }

      const updated = await this.findByTokenHash(tokenHash, conn);
      if (!updated) {
        throw new Error('FEEDBACK_FETCH_FAILED: Could not fetch updated feedback record');
      }
      return updated;
    } finally {
      if (!connection) {
        await conn.close();
      }
    }
  }

  async getFeedbackMetrics(connection?: oracledb.Connection): Promise<{
    pending: number;
    received: number;
    averageRating: number | null;
    lowRatingCases: number;
  }> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        SELECT
          COUNT(CASE WHEN STATUS = 'PENDING' THEN 1 END) AS FEEDBACK_PENDING,
          COUNT(CASE WHEN STATUS = 'SUBMITTED' THEN 1 END) AS FEEDBACK_RECEIVED,
          ROUND(AVG(CASE WHEN STATUS = 'SUBMITTED' AND RATING IS NOT NULL THEN RATING END), 1) AS AVERAGE_RATING,
          COUNT(CASE WHEN STATUS = 'SUBMITTED' AND RATING < 3 THEN 1 END) AS LOW_RATING_CASES
        FROM CUSTOMER_FEEDBACK
      `;
      const res = await conn.execute<any>(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const row = res.rows?.[0] || {};
      return {
        pending: Number(row.FEEDBACK_PENDING || 0),
        received: Number(row.FEEDBACK_RECEIVED || 0),
        averageRating: row.AVERAGE_RATING !== null && row.AVERAGE_RATING !== undefined ? Number(row.AVERAGE_RATING) : null,
        lowRatingCases: Number(row.LOW_RATING_CASES || 0),
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
          STATUS,
          SUBMITTED_BY,
          SUBMITTED_AT,
          INVITED_AT,
          CREATED_AT,
          UPDATED_AT
        ) VALUES (
          :feedbackId,
          :requestId,
          :rating,
          :feedbackRemarks,
          :qualityAnalysis,
          'SUBMITTED',
          :submittedBy,
          SYSTIMESTAMP,
          SYSTIMESTAMP,
          SYSTIMESTAMP,
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
