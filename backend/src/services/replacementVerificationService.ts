import oracledb from 'oracledb';
import { getOracleConnection } from '../database/oraclePool.js';
import { replacementVerificationRepository } from '../database/repositories/replacementVerificationRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser } from '../types/auth.js';
import { ReplacementVerificationRecord, VerificationPurpose } from '../types/replacementVerification.js';
import { generateHappyCode, generateSalt, hashOtp, verifyOtp } from '../utils/cryptoUtils.js';

/**
 * Expiry reuses the established complaint-flow policy:
 *  - Arrival Happy Code: 48 hours from issuance (same as the complaint check-in code)
 *  - Completion Happy Code: 24 hours from issuance (same as the complaint closure Happy Code)
 * Regeneration is capped at 5, matching the complaint flow.
 */
const EXPIRY_MINUTES: Record<VerificationPurpose, number> = { ARRIVAL: 48 * 60, COMPLETION: 24 * 60 };
export const MAX_ATTEMPTS = 5;
export const MAX_REGENERATIONS = 5;

async function withConnection<T>(external: oracledb.Connection | undefined, fn: (conn: oracledb.Connection) => Promise<T>): Promise<T> {
  if (external) return fn(external);
  const conn = await getOracleConnection();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

export class ReplacementVerificationService {
  /**
   * Issues a visit-, version- and purpose-scoped Happy Code. Only the salted HMAC is stored; the plain
   * code is returned to the caller solely to build the customer SMS. When `conn` is supplied the
   * insert joins the caller's transaction.
   */
  async issueVerificationCode(
    input: {
      replacementId: string;
      visitNumber: number;
      appointmentVersion: number;
      assignedEngineerId: string;
      purpose: VerificationPurpose;
      plainCode?: string; // Deterministic plain code for test fixtures only
    },
    _actor?: AuthenticatedUser,
    conn?: oracledb.Connection
  ): Promise<{ verification: ReplacementVerificationRecord; plainCode: string }> {
    const plainCode = input.plainCode || generateHappyCode();
    const salt = generateSalt();
    const codeHash = hashOtp({ otp: plainCode, salt, requestId: input.replacementId, purpose: `REPLACEMENT_${input.purpose}` });
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES[input.purpose] * 60 * 1000);

    const verification = await withConnection(conn, (c) =>
      replacementVerificationRepository.createVerification(
        {
          replacementId: input.replacementId,
          visitNumber: input.visitNumber,
          appointmentVersion: input.appointmentVersion,
          assignedEngineerId: input.assignedEngineerId,
          purpose: input.purpose,
          codeHash,
          codeSalt: salt,
          expiresAt,
        },
        c
      )
    );
    return { verification, plainCode };
  }

  /** Returns the usable (unverified, not invalidated, unexpired) code for a cycle, if any. */
  async findUsableCode(
    replacementId: string,
    appointmentVersion: number,
    purpose: VerificationPurpose,
    conn?: oracledb.Connection
  ): Promise<ReplacementVerificationRecord | null> {
    const v = await replacementVerificationRepository.findActive(replacementId, 1, appointmentVersion, purpose, conn);
    if (!v || v.verifiedAt || v.isInvalidated === 'Y' || v.expiresAt <= new Date()) return null;
    return v;
  }

  /**
   * Regenerates (resends) an unused code for the current cycle with a fresh secret and expiry.
   */
  async regenerateCode(
    replacementId: string,
    appointmentVersion: number,
    purpose: VerificationPurpose,
    conn: oracledb.Connection
  ): Promise<{ verification: ReplacementVerificationRecord; plainCode: string }> {
    const existing = await replacementVerificationRepository.findActive(replacementId, 1, appointmentVersion, purpose, conn, true);
    if (!existing) {
      throw new AppError(`No ${purpose} Happy Code has been issued for the current appointment.`, 404, 'VERIFICATION_NOT_FOUND');
    }
    if (existing.verifiedAt) {
      throw new AppError(`The ${purpose} Happy Code has already been used.`, 409, 'CODE_ALREADY_USED');
    }
    if (existing.isInvalidated === 'Y') {
      throw new AppError(`The ${purpose} Happy Code was invalidated by a reschedule.`, 400, 'CODE_INVALIDATED');
    }
    if ((existing.regenerationCount || 0) >= MAX_REGENERATIONS) {
      throw new AppError(`Maximum ${purpose} Happy Code regeneration limit (${MAX_REGENERATIONS}) reached.`, 429, 'RATE_LIMIT_EXCEEDED');
    }
    const plainCode = generateHappyCode();
    const salt = generateSalt();
    await replacementVerificationRepository.regenerateCode(
      existing.verificationId,
      {
        codeHash: hashOtp({ otp: plainCode, salt, requestId: replacementId, purpose: `REPLACEMENT_${purpose}` }),
        codeSalt: salt,
        expiresAt: new Date(Date.now() + EXPIRY_MINUTES[purpose] * 60 * 1000),
      },
      conn
    );
    return { verification: (await replacementVerificationRepository.findActive(replacementId, 1, appointmentVersion, purpose, conn))!, plainCode };
  }

  /**
   * Concurrency-safe verification of a customer-provided Happy Code (purpose, visit, appointment
   * version and assigned-engineer scoped; single use; expiry and attempt lockout).
   *
   * Consumes the code but performs no workflow transition: callers (ReplacementService) apply the
   * transition in the same transaction. With an external connection this MUST be the first write
   * of the caller's transaction, because a failed attempt commits the attempt counter before throwing.
   */
  async verifyCode(
    input: { replacementId: string; visitNumber: number; appointmentVersion: number; purpose: VerificationPurpose; happyCode: string },
    actor: AuthenticatedUser,
    externalConn?: oracledb.Connection
  ): Promise<{ success: boolean; message: string; verifiedAt: Date; verification: ReplacementVerificationRecord }> {
    if (!input.happyCode || !/^\d{6}$/.test(String(input.happyCode).trim())) {
      throw new AppError('A valid 6-digit numeric Happy Code is required', 400, 'INVALID_FORMAT');
    }

    const conn = externalConn || (await getOracleConnection());
    try {
      const verification = await replacementVerificationRepository.findActive(
        input.replacementId,
        input.visitNumber,
        input.appointmentVersion,
        input.purpose,
        conn,
        true
      );
      if (!verification) {
        throw new AppError(
          `No active ${input.purpose} Happy Code found for this replacement visit (appointment v${input.appointmentVersion}).`,
          404,
          'VERIFICATION_NOT_FOUND'
        );
      }
      if (verification.isInvalidated === 'Y') {
        throw new AppError(
          `This ${input.purpose} Happy Code has been invalidated. Reason: ${verification.invalidatedReason || 'Superseded'}`,
          400,
          'CODE_INVALIDATED'
        );
      }
      if (verification.verifiedAt) {
        throw new AppError(`This ${input.purpose} Happy Code has already been consumed and cannot be reused.`, 409, 'CODE_ALREADY_USED');
      }
      if (verification.assignedEngineerId !== actor.userId) {
        throw new AppError('Forbidden: Only the assigned field engineer can verify this Happy Code.', 403, 'ENGINEER_MISMATCH');
      }
      if (new Date() > verification.expiresAt) {
        throw new AppError(`This ${input.purpose} Happy Code has expired. Please request a new code.`, 400, 'CODE_EXPIRED');
      }
      if (verification.attempts >= MAX_ATTEMPTS) {
        throw new AppError('Maximum verification attempts exceeded (5 failed attempts). Code is locked.', 429, 'ATTEMPTS_EXCEEDED');
      }

      const isValid = verifyOtp({
        providedOtp: String(input.happyCode).trim(),
        salt: verification.codeSalt,
        requestId: input.replacementId,
        expectedHash: verification.codeHash,
        purpose: `REPLACEMENT_${input.purpose}`,
      });

      if (!isValid) {
        const newAttempts = await replacementVerificationRepository.incrementAttempts(verification.verificationId, conn);
        await conn.commit(); // persist the attempt counter even though the request fails
        const remaining = Math.max(0, MAX_ATTEMPTS - newAttempts);
        throw new AppError(`Invalid Happy Code. ${remaining} attempt(s) remaining before lockout.`, 400, 'INVALID_HAPPY_CODE');
      }

      await replacementVerificationRepository.markVerified(verification.verificationId, actor.userId, conn);
      if (!externalConn) await conn.commit();

      return {
        success: true,
        message: `${input.purpose} Happy Code verified successfully.`,
        verifiedAt: new Date(),
        verification,
      };
    } catch (err) {
      if (!externalConn) await conn.rollback();
      throw err;
    } finally {
      if (!externalConn) await conn.close();
    }
  }

  /** Invalidates every unused code of a replacement (used when an appointment is rescheduled). */
  async invalidateUnusedCodes(replacementId: string, reason: string, conn?: oracledb.Connection): Promise<number> {
    return withConnection(conn, (c) => replacementVerificationRepository.invalidatePreviousCodes(replacementId, reason, c));
  }

  /** @deprecated kept for existing callers; use invalidateUnusedCodes. */
  async invalidateOnReschedule(replacementId: string, reason: string): Promise<number> {
    return this.invalidateUnusedCodes(replacementId, reason);
  }
}

export const replacementVerificationService = new ReplacementVerificationService();
