import crypto from 'crypto';
import oracledb from 'oracledb';
import { getOracleConnection } from '../oraclePool.js';

export interface ServiceRequestVerificationRecord {
  verificationId: string;
  requestId: string;
  checkInOtpHash?: string;
  checkInOtpSalt?: string;
  checkInOtpExpiresAt?: Date;
  checkInOtpAttempts: number;
  checkInVerifiedAt?: Date;
  checkInRegeneratedCount: number;
  happyCodeHash?: string;
  happyCodeSalt?: string;
  happyCodeExpiresAt?: Date;
  happyCodeAttempts: number;
  happyCodeVerifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

function mapRowToVerification(row: any): ServiceRequestVerificationRecord {
  return {
    verificationId: row.VERIFICATION_ID,
    requestId: row.REQUEST_ID,
    checkInOtpHash: row.CHECK_IN_OTP_HASH || undefined,
    checkInOtpSalt: row.CHECK_IN_OTP_SALT || undefined,
    checkInOtpExpiresAt: row.CHECK_IN_OTP_EXPIRES_AT ? new Date(row.CHECK_IN_OTP_EXPIRES_AT) : undefined,
    checkInOtpAttempts: Number(row.CHECK_IN_OTP_ATTEMPTS || 0),
    checkInVerifiedAt: row.CHECK_IN_VERIFIED_AT ? new Date(row.CHECK_IN_VERIFIED_AT) : undefined,
    checkInRegeneratedCount: Number(row.CHECK_IN_REGENERATED_COUNT || 0),
    happyCodeHash: row.HAPPY_CODE_HASH || undefined,
    happyCodeSalt: row.HAPPY_CODE_SALT || undefined,
    happyCodeExpiresAt: row.HAPPY_CODE_EXPIRES_AT ? new Date(row.HAPPY_CODE_EXPIRES_AT) : undefined,
    happyCodeAttempts: Number(row.HAPPY_CODE_ATTEMPTS || 0),
    happyCodeVerifiedAt: row.HAPPY_CODE_VERIFIED_AT ? new Date(row.HAPPY_CODE_VERIFIED_AT) : undefined,
    createdAt: new Date(row.CREATED_AT),
    updatedAt: new Date(row.UPDATED_AT),
  };
}

export class VerificationRepository {
  /**
   * Upserts the Check-In OTP verification secret within a transaction connection.
   */
  async upsertCheckInOtp(
    params: {
      requestId: string;
      otpHash: string;
      salt: string;
      expiresAt: Date;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const verificationId = crypto.randomUUID();

    const sql = `
      MERGE INTO SERVICE_REQUEST_VERIFICATIONS srv
      USING (SELECT :requestId AS REQUEST_ID FROM DUAL) src
      ON (srv.REQUEST_ID = src.REQUEST_ID)
      WHEN MATCHED THEN
        UPDATE SET 
          CHECK_IN_OTP_HASH = :otpHash,
          CHECK_IN_OTP_SALT = :salt,
          CHECK_IN_OTP_EXPIRES_AT = :expiresAt,
          CHECK_IN_OTP_ATTEMPTS = 0,
          CHECK_IN_VERIFIED_AT = NULL,
          UPDATED_AT = SYSTIMESTAMP
      WHEN NOT MATCHED THEN
        INSERT (
          VERIFICATION_ID, REQUEST_ID, CHECK_IN_OTP_HASH, CHECK_IN_OTP_SALT,
          CHECK_IN_OTP_EXPIRES_AT, CHECK_IN_OTP_ATTEMPTS, CHECK_IN_VERIFIED_AT,
          CHECK_IN_REGENERATED_COUNT, CREATED_AT, UPDATED_AT
        ) VALUES (
          :verificationId, :requestId, :otpHash, :salt,
          :expiresAt, 0, NULL,
          0, SYSTIMESTAMP, SYSTIMESTAMP
        )
    `;

    await conn.execute(sql, {
      verificationId,
      requestId: params.requestId,
      otpHash: params.otpHash,
      salt: params.salt,
      expiresAt: params.expiresAt,
    });
  }

  /**
   * Retrieves the verification secret record for a given service request.
   */
  async findByRequestId(
    requestId: string,
    conn?: oracledb.Connection
  ): Promise<ServiceRequestVerificationRecord | null> {
    const connection = conn || (await getOracleConnection());
    try {
      const sql = `
        SELECT 
          VERIFICATION_ID, REQUEST_ID, CHECK_IN_OTP_HASH, CHECK_IN_OTP_SALT,
          CHECK_IN_OTP_EXPIRES_AT, CHECK_IN_OTP_ATTEMPTS, CHECK_IN_VERIFIED_AT,
          CHECK_IN_REGENERATED_COUNT, HAPPY_CODE_HASH, HAPPY_CODE_SALT,
          HAPPY_CODE_EXPIRES_AT, HAPPY_CODE_ATTEMPTS, HAPPY_CODE_VERIFIED_AT,
          CREATED_AT, UPDATED_AT
        FROM SERVICE_REQUEST_VERIFICATIONS
        WHERE REQUEST_ID = :requestId
      `;

      const result = await connection.execute<any>(
        sql,
        { requestId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      return mapRowToVerification(result.rows[0]);
    } finally {
      if (!conn) {
        await connection.close();
      }
    }
  }

  /**
   * Increments failed OTP attempts by 1 in an isolated transaction.
   */
  async incrementCheckInAttempts(requestId: string): Promise<number> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE SERVICE_REQUEST_VERIFICATIONS
        SET 
          CHECK_IN_OTP_ATTEMPTS = CHECK_IN_OTP_ATTEMPTS + 1,
          UPDATED_AT = SYSTIMESTAMP
        WHERE REQUEST_ID = :requestId
        RETURNING CHECK_IN_OTP_ATTEMPTS INTO :newAttempts
      `;

      const result = await conn.execute<any>(
        sql,
        {
          requestId,
          newAttempts: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
        },
        { autoCommit: true }
      );

      const attempts = (result.outBinds as any)?.newAttempts?.[0] ?? 1;
      return attempts;
    } finally {
      await conn.close();
    }
  }

  /**
   * Marks Check-In as successfully verified and consumed.
   */
  async markCheckInVerified(requestId: string, conn: oracledb.Connection): Promise<void> {
    const sql = `
      UPDATE SERVICE_REQUEST_VERIFICATIONS
      SET 
        CHECK_IN_VERIFIED_AT = SYSTIMESTAMP,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REQUEST_ID = :requestId
    `;
    await conn.execute(sql, { requestId });
  }

  /**
   * Records Check-In OTP regeneration, invalidating earlier OTP and resetting attempt counter.
   */
  async recordOtpRegeneration(
    params: {
      requestId: string;
      newOtpHash: string;
      newSalt: string;
      newExpiresAt: Date;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE SERVICE_REQUEST_VERIFICATIONS
      SET 
        CHECK_IN_OTP_HASH = :newOtpHash,
        CHECK_IN_OTP_SALT = :newSalt,
        CHECK_IN_OTP_EXPIRES_AT = :newExpiresAt,
        CHECK_IN_OTP_ATTEMPTS = 0,
        CHECK_IN_VERIFIED_AT = NULL,
        CHECK_IN_REGENERATED_COUNT = CHECK_IN_REGENERATED_COUNT + 1,
        UPDATED_AT = SYSTIMESTAMP
      WHERE REQUEST_ID = :requestId
    `;

    await conn.execute(sql, {
      requestId: params.requestId,
      newOtpHash: params.newOtpHash,
      newSalt: params.newSalt,
      newExpiresAt: params.newExpiresAt,
    });
  }
}

export const verificationRepository = new VerificationRepository();
