import crypto from 'crypto';
import { getOracleConnection } from '../database/oraclePool.js';
import { customerFeedbackRepository } from '../database/repositories/customerFeedbackRepository.js';
import { serviceRequestEventRepository } from '../database/repositories/serviceRequestEventRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { PublicFeedbackSummary, SubmitPublicFeedbackInput } from '../types/job360.js';

export class FeedbackService {
  /**
   * Hashes a raw feedback token using SHA-256 to compare with persisted database digest.
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token.trim()).digest('hex');
  }

  /**
   * Retrieves a sanitized public feedback form summary using the opaque invitation token.
   * Does NOT expose customer phone, address, serial number, or internal database UUIDs.
   */
  async getPublicFeedbackSummary(token: string): Promise<PublicFeedbackSummary> {
    if (!token || !/^[a-fA-F0-9]{64}$/.test(token.trim())) {
      throw new AppError('Invalid or corrupted feedback invitation link', 400, 'INVALID_TOKEN_FORMAT');
    }

    const tokenHash = this.hashToken(token);
    const feedback = await customerFeedbackRepository.findByTokenHash(tokenHash);
    if (!feedback) {
      throw new AppError('Feedback invitation not found or link has expired', 404, 'FEEDBACK_NOT_FOUND');
    }

    const isExpired = feedback.expiresAt ? new Date() > feedback.expiresAt : false;
    const alreadySubmitted = feedback.status === 'SUBMITTED';

    return {
      feedbackId: feedback.feedbackId,
      jobNumber: feedback.jobNumber,
      productName: feedback.productName,
      brandName: feedback.brandName,
      serviceDate: feedback.closedAt ? feedback.closedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recent Service',
      status: feedback.status,
      isExpired,
      alreadySubmitted,
    };
  }

  /**
   * Submits verified customer feedback for a closed service call:
   * 1. Validates token authenticity and single-use state.
   * 2. Checks expiration window.
   * 3. Atomically updates ratings and status to SUBMITTED.
   * 4. Appends CUSTOMER_FEEDBACK_SUBMITTED audit event.
   */
  async submitPublicFeedback(
    token: string,
    input: SubmitPublicFeedbackInput
  ): Promise<{ success: boolean; message: string; jobNumber: string }> {
    if (!token || !/^[a-fA-F0-9]{64}$/.test(token.trim())) {
      throw new AppError('Invalid or corrupted feedback invitation link', 400, 'INVALID_TOKEN_FORMAT');
    }

    const tokenHash = this.hashToken(token);
    const existing = await customerFeedbackRepository.findByTokenHash(tokenHash);
    if (!existing) {
      throw new AppError('Feedback invitation not found', 404, 'FEEDBACK_NOT_FOUND');
    }

    if (existing.status === 'SUBMITTED') {
      throw new AppError('Feedback for this service call has already been submitted. Thank you!', 409, 'ALREADY_SUBMITTED');
    }

    if (existing.expiresAt && new Date() > existing.expiresAt) {
      throw new AppError('This feedback invitation has expired.', 410, 'FEEDBACK_EXPIRED');
    }

    // Validate 1-5 rating ranges
    if (!Number.isInteger(input.overallRating) || input.overallRating < 1 || input.overallRating > 5) {
      throw new AppError('Overall rating must be an integer between 1 and 5', 400, 'INVALID_RATING');
    }
    if (!Number.isInteger(input.techRating) || input.techRating < 1 || input.techRating > 5) {
      throw new AppError('Technician professionalism rating must be an integer between 1 and 5', 400, 'INVALID_TECH_RATING');
    }
    if (!Number.isInteger(input.repairRating) || input.repairRating < 1 || input.repairRating > 5) {
      throw new AppError('Repair satisfaction rating must be an integer between 1 and 5', 400, 'INVALID_REPAIR_RATING');
    }
    if (input.issueResolved !== 'Y' && input.issueResolved !== 'N') {
      throw new AppError('Issue resolved must be either Y or N', 400, 'INVALID_ISSUE_RESOLVED');
    }

    const conn = await getOracleConnection();
    try {
      await customerFeedbackRepository.submitPublicFeedback(tokenHash, input, conn);

      const eventActorUserId =
        existing.assignedEngineerId ||
        existing.registeredBy ||
        '958d124e-135d-44de-b72c-f7ee96081205';

      // Append lifecycle audit event
      await serviceRequestEventRepository.createEvent(
        {
          requestId: existing.requestId,
          fromState: 'CLOSED',
          toState: 'CLOSED',
          eventType: 'CUSTOMER_FEEDBACK_SUBMITTED',
          triggeredByUserId: eventActorUserId,
          triggeredByUsername: 'Customer (Post-Service Feedback)',
          triggeredByRole: 'CUSTOMER',
          remarks: `Customer feedback submitted: Overall: ${input.overallRating}/5, Technician: ${input.techRating}/5, Repair: ${input.repairRating}/5, Issue Resolved: ${input.issueResolved}`,
          metadataJson: {
            overallRating: input.overallRating,
            techRating: input.techRating,
            repairRating: input.repairRating,
            issueResolved: input.issueResolved,
            comments: input.comments || null,
          },
        },
        conn
      );

      await conn.commit();

      return {
        success: true,
        message: 'Thank you for your valuable feedback! Your response has been securely recorded.',
        jobNumber: existing.jobNumber,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }
}

export const feedbackService = new FeedbackService();
