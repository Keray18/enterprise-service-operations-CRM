import crypto from 'crypto';
import oracledb from 'oracledb';
import { ReplacementVerificationRecord, VerificationPurpose } from '../../types/replacementVerification.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToVerification(row: any): ReplacementVerificationRecord {
  return {
    verificationId: row.VERIFICATION_ID,
    replacementId: row.REPLACEMENT_ID,
    visitNumber: Number(row.VISIT_NUMBER),
    appointmentVersion: Number(row.APPOINTMENT_VERSION),
    assignedEngineerId: row.ASSIGNED_ENGINEER_ID,
    purpose: row.PURPOSE as VerificationPurpose,
    codeHash: row.CODE_HASH,
    codeSalt: row.CODE_SALT,
    expiresAt: new Date(row.EXPIRES_AT),
    attempts: Number(row.ATTEMPTS),
    verifiedAt: row.VERIFIED_AT ? new Date(row.VERIFIED_AT) : undefined,
    verifiedBy: row.VERIFIED_BY || undefined,
    isInvalidated: row.IS_INVALIDATED,
    invalidatedAt: row.INVALIDATED_AT ? new Date(row.INVALIDATED_AT) : undefined,
    invalidatedReason: row.INVALIDATED_REASON || undefined,
    createdAt: new Date(row.CREATED_AT),
  };
}

const SELECT_VERIF_SQL = `
  SELECT 
    v.VERIFICATION_ID,
    v.REPLACEMENT_ID,
    v.VISIT_NUMBER,
    v.APPOINTMENT_VERSION,
    v.ASSIGNED_ENGINEER_ID,
    v.PURPOSE,
    v.CODE_HASH,
    v.CODE_SALT,
    v.EXPIRES_AT,
    v.ATTEMPTS,
    v.VERIFIED_AT,
    v.VERIFIED_BY,
    v.IS_INVALIDATED,
    v.INVALIDATED_AT,
    v.INVALIDATED_REASON,
    v.CREATED_AT
  FROM REPLACEMENT_VERIFICATIONS v
`;

export class ReplacementVerificationRepository {
  async findActive(
    replacementId: string,
    visitNumber: number,
    appointmentVersion: number,
    purpose: VerificationPurpose,
    connection?: oracledb.Connection,
    forUpdate: boolean = false
  ): Promise<ReplacementVerificationRecord | null> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `
        ${SELECT_VERIF_SQL}
        WHERE v.REPLACEMENT_ID = :replacementId
          AND v.VISIT_NUMBER = :visitNumber
          AND v.APPOINTMENT_VERSION = :appointmentVersion
          AND v.PURPOSE = :purpose
        ${forUpdate ? 'FOR UPDATE' : ''}
      `;
      const result = await conn.execute<any>(
        sql,
        { replacementId, visitNumber, appointmentVersion, purpose },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToVerification(result.rows[0]);
    } finally {
      if (!connection) await conn.close();
    }
  }

  async createVerification(
    data: {
      verificationId?: string;
      replacementId: string;
      visitNumber: number;
      appointmentVersion: number;
      assignedEngineerId: string;
      purpose: VerificationPurpose;
      codeHash: string;
      codeSalt: string;
      expiresAt: Date;
    },
    conn: oracledb.Connection
  ): Promise<ReplacementVerificationRecord> {
    const verificationId = data.verificationId || crypto.randomUUID();
    const sql = `
      INSERT INTO REPLACEMENT_VERIFICATIONS (
        VERIFICATION_ID,
        REPLACEMENT_ID,
        VISIT_NUMBER,
        APPOINTMENT_VERSION,
        ASSIGNED_ENGINEER_ID,
        PURPOSE,
        CODE_HASH,
        CODE_SALT,
        EXPIRES_AT,
        ATTEMPTS,
        IS_INVALIDATED,
        CREATED_AT
      ) VALUES (
        :verificationId,
        :replacementId,
        :visitNumber,
        :appointmentVersion,
        :assignedEngineerId,
        :purpose,
        :codeHash,
        :codeSalt,
        :expiresAt,
        0,
        'N',
        SYSTIMESTAMP
      )
    `;
    await conn.execute(sql, {
      verificationId,
      replacementId: data.replacementId,
      visitNumber: data.visitNumber,
      appointmentVersion: data.appointmentVersion,
      assignedEngineerId: data.assignedEngineerId,
      purpose: data.purpose,
      codeHash: data.codeHash,
      codeSalt: data.codeSalt,
      expiresAt: data.expiresAt,
    });

    const record = await this.findActive(
      data.replacementId,
      data.visitNumber,
      data.appointmentVersion,
      data.purpose,
      conn
    );
    if (!record) {
      throw new Error('VERIFICATION_CREATION_FAILED: Failed to fetch newly created verification record');
    }
    return record;
  }

  async incrementAttempts(
    verificationId: string,
    conn: oracledb.Connection
  ): Promise<number> {
    const sql = `
      UPDATE REPLACEMENT_VERIFICATIONS
      SET ATTEMPTS = ATTEMPTS + 1
      WHERE VERIFICATION_ID = :verificationId
    `;
    await conn.execute(sql, { verificationId });
    const checkSql = `SELECT ATTEMPTS FROM REPLACEMENT_VERIFICATIONS WHERE VERIFICATION_ID = :verificationId`;
    const res = await conn.execute<any>(checkSql, { verificationId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return Number(res.rows?.[0]?.ATTEMPTS || 1);
  }

  async markVerified(
    verificationId: string,
    verifiedBy: string,
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE REPLACEMENT_VERIFICATIONS
      SET 
        VERIFIED_AT = SYSTIMESTAMP,
        VERIFIED_BY = :verifiedBy
      WHERE VERIFICATION_ID = :verificationId
    `;
    await conn.execute(sql, { verificationId, verifiedBy });
  }

  async invalidatePreviousCodes(
    replacementId: string,
    reason: string,
    conn: oracledb.Connection
  ): Promise<number> {
    const sql = `
      UPDATE REPLACEMENT_VERIFICATIONS
      SET 
        IS_INVALIDATED = 'Y',
        INVALIDATED_AT = SYSTIMESTAMP,
        INVALIDATED_REASON = :reason
      WHERE REPLACEMENT_ID = :replacementId
        AND IS_INVALIDATED = 'N'
        AND VERIFIED_AT IS NULL
    `;
    const res = await conn.execute(sql, { replacementId, reason });
    return res.rowsAffected || 0;
  }
}

export const replacementVerificationRepository = new ReplacementVerificationRepository();
