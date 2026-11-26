import { getOracleConnection } from '../database/oraclePool.js';
import { replacementRequestRepository } from '../database/repositories/replacementRequestRepository.js';
import { replacementVerificationRepository } from '../database/repositories/replacementVerificationRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser } from '../types/auth.js';
import { ReplacementVerificationRecord, VerificationPurpose } from '../types/replacementVerification.js';
import { generateHappyCode, generateSalt, hashOtp, verifyOtp } from '../utils/cryptoUtils.js';

export class ReplacementVerificationService {
  /**
   * Issues a cryptographic Happy Code challenge bound to visit, appointment version, and purpose.
   * Plain code is returned ONLY to the SMS dispatching process (never logged or persisted in plain text).
   */
  async issueVerificationCode(
    input: {
      replacementId: string;
      visitNumber: number;
      appointmentVersion: number;
      assignedEngineerId: string;
      purpose: VerificationPurpose;
      expiresInMinutes?: number;
      plainCode?: string; // Deterministic plain code for testing fixtures only
    },
    _actor?: AuthenticatedUser
  ): Promise<{
    verification: ReplacementVerificationRecord;
    plainCode: string; // Transient value for immediate SMS generation
  }> {
    const plainCode = input.plainCode || generateHappyCode();
    const salt = generateSalt();
    const codeHash = hashOtp({
      otp: plainCode,
      salt,
      requestId: input.replacementId,
      purpose: `REPLACEMENT_${input.purpose}`,
    });

    const expiresInMinutes = input.expiresInMinutes || (input.purpose === 'ARRIVAL' ? 120 : 180);
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const conn = await getOracleConnection();
    try {
      const verification = await replacementVerificationRepository.createVerification(
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
        conn
      );

      await conn.commit();

      return {
        verification,
        plainCode,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Concurrency-safe verification of the customer-provided Happy Code.
   * Enforces:
   *  - Purpose matching (ARRIVAL vs COMPLETION)
   *  - Visit number and appointment version matching
   *  - Assigned-engineer identity matching
   *  - Single-use consumption
   *  - Expiration and attempt lockout
   */
  async verifyCode(
    input: {
      replacementId: string;
      visitNumber: number;
      appointmentVersion: number;
      purpose: VerificationPurpose;
      happyCode: string;
    },
    actor: AuthenticatedUser
  ): Promise<{
    success: boolean;
    message: string;
    verifiedAt: Date;
    replacementStatus: string;
  }> {
    if (!input.happyCode || !/^\d{6}$/.test(input.happyCode.trim())) {
      throw new AppError('A valid 6-digit numeric Happy Code is required', 400, 'INVALID_FORMAT');
    }

    const conn = await getOracleConnection();
    try {
      // 1. Lock verification record using SELECT FOR UPDATE
      const verification = await replacementVerificationRepository.findActive(
        input.replacementId,
        input.visitNumber,
        input.appointmentVersion,
        input.purpose,
        conn,
        true // FOR UPDATE
      );

      if (!verification) {
        throw new AppError(
          `No active ${input.purpose} verification record found for replacement ${input.replacementId} (visit ${input.visitNumber}, appointment v${input.appointmentVersion})`,
          404,
          'VERIFICATION_NOT_FOUND'
        );
      }

      // 2. Invalidation check
      if (verification.isInvalidated === 'Y') {
        throw new AppError(
          `This ${input.purpose} Happy Code has been invalidated. Reason: ${verification.invalidatedReason || 'Superseded'}`,
          400,
          'CODE_INVALIDATED'
        );
      }

      // 3. Single-use consumption check
      if (verification.verifiedAt) {
        throw new AppError(
          `This ${input.purpose} Happy Code has already been consumed and cannot be reused.`,
          409,
          'CODE_ALREADY_USED'
        );
      }

      // 4. Assigned engineer identity guard
      if (verification.assignedEngineerId !== actor.userId) {
        throw new AppError(
          'Forbidden: Only the assigned field engineer can verify this Happy Code.',
          403,
          'ENGINEER_MISMATCH'
        );
      }

      // 5. Expiration check
      if (new Date() > verification.expiresAt) {
        throw new AppError(
          `This ${input.purpose} Happy Code has expired. Please request a new code.`,
          400,
          'CODE_EXPIRED'
        );
      }

      // 6. Attempt limit check
      if (verification.attempts >= 5) {
        throw new AppError(
          'Maximum verification attempts exceeded (5 failed attempts). Code is locked.',
          429,
          'ATTEMPTS_EXCEEDED'
        );
      }

      // 7. Cryptographic hash comparison
      const isValid = verifyOtp({
        providedOtp: input.happyCode.trim(),
        salt: verification.codeSalt,
        requestId: input.replacementId,
        expectedHash: verification.codeHash,
        purpose: `REPLACEMENT_${input.purpose}`,
      });

      if (!isValid) {
        const newAttempts = await replacementVerificationRepository.incrementAttempts(
          verification.verificationId,
          conn
        );
        await conn.commit(); // Persist attempt counter even on failure

        const remaining = Math.max(0, 5 - newAttempts);
        throw new AppError(
          `Invalid Happy Code. ${remaining} attempt(s) remaining before lockout.`,
          400,
          'INVALID_HAPPY_CODE'
        );
      }

      // 8. Consume code and mark verified
      await replacementVerificationRepository.markVerified(
        verification.verificationId,
        actor.userId,
        conn
      );

      // 9. Advance replacement request state based on purpose
      let newReplacementStatus = 'TECHNICIAN_CHECKED_IN';
      if (input.purpose === 'ARRIVAL') {
        newReplacementStatus = 'TECHNICIAN_CHECKED_IN';
        await replacementRequestRepository.updateStatus(input.replacementId, 'TECHNICIAN_CHECKED_IN', conn);
      } else if (input.purpose === 'COMPLETION') {
        newReplacementStatus = 'INSTALLATION_VERIFIED';
        await replacementRequestRepository.markInstallationVerified(input.replacementId, actor.userId, conn);
      }

      await conn.commit();

      return {
        success: true,
        message: `${input.purpose} Happy Code verified successfully.`,
        verifiedAt: new Date(),
        replacementStatus: newReplacementStatus,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Invalidates unused codes when appointment is rescheduled.
   */
  async invalidateOnReschedule(replacementId: string, reason: string): Promise<number> {
    const conn = await getOracleConnection();
    try {
      const count = await replacementVerificationRepository.invalidatePreviousCodes(
        replacementId,
        reason,
        conn
      );
      await conn.commit();
      return count;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }
}

export const replacementVerificationService = new ReplacementVerificationService();
