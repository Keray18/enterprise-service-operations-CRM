import { getOracleConnection } from '../database/oraclePool.js';
import { notificationRepository } from '../database/repositories/notificationRepository.js';
import { rbacRepository } from '../database/repositories/rbacRepository.js';
import { serviceRequestEventRepository } from '../database/repositories/serviceRequestEventRepository.js';
import { serviceRequestRepository } from '../database/repositories/serviceRequestRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { verificationRepository } from '../database/repositories/verificationRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser } from '../types/auth.js';
import {
  AsfQueueFilters,
  CheckInComplaintInput,
  CheckInComplaintResponse,
  DispatchComplaintInput,
  DispatchComplaintResponse,
  RegenerateOtpInput,
  RegenerateOtpResponse,
} from '../types/asf.js';
import { PaginatedResult } from '../types/catalog.js';
import { ServiceRequestWithRelationsRecord } from '../types/callCenter.js';
import { generateCheckInOtp, generateSalt, hashOtp, verifyOtp } from '../utils/cryptoUtils.js';
import { notificationService } from './notificationService.js';
import { slaMonitoringService } from './slaMonitoringService.js';

export class AsfService {
  /**
   * Retrieves the operational ASF incoming queue with role scoping, status filtering, and SLA timers.
   */
  async getAsfQueue(
    filters: AsfQueueFilters,
    actor: AuthenticatedUser
  ): Promise<PaginatedResult<ServiceRequestWithRelationsRecord & { slaStatus: any }>> {
    const isAdmin = actor.roles.includes('ADMIN');
    const actorLocationId = actor.locationId;

    const result = await serviceRequestRepository.queryAsfQueue(
      filters,
      actorLocationId,
      isAdmin
    );

    // Augment with computed SLA status for UI badges
    const augmentedItems = result.items.map((item) => {
      const slaStatus = slaMonitoringService.calculateSlaStatus(
        item.registeredAt,
        item.sla48hExpiresAt,
        item.acknowledgedAt
      );
      return {
        ...item,
        slaStatus,
      };
    });

    return {
      ...result,
      items: augmentedItems,
    };
  }

  /**
   * Retrieves active field engineers eligible for assignment in an ASF location.
   */
  async getEligibleEngineers(locationId: string, actor: AuthenticatedUser) {
    const isAdmin = actor.roles.includes('ADMIN');
    if (!isAdmin && actor.locationId && actor.locationId !== locationId) {
      throw new AppError('Unauthorized access to technicians outside your franchise location', 403, 'FORBIDDEN');
    }

    const engineers = await userRepository.findEngineersByLocation(locationId);
    return engineers.map((eng) => ({
      userId: eng.userId,
      username: eng.username,
      fullName: eng.fullName,
      phoneNumber: eng.phoneNumber,
      locationId: eng.locationId,
    }));
  }

  /**
   * Executes the atomic single-commit dispatch workflow:
   * 1. Locks service request row.
   * 2. Validates eligibility, location scope, and active engineer.
   * 3. Sets appointment, travel distance, area type, and acknowledges request.
   * 4. Generates customer Check-In OTP and stores salted hash in verification table.
   * 5. Transitions state to APPOINTMENT_SCHEDULED.
   * 6. Records immutable event in history.
   * 7. Queues SMS 2 notification in outbox.
   * 8. Commits transaction and triggers post-commit delivery.
   */
  async dispatchComplaint(
    input: DispatchComplaintInput,
    actor: AuthenticatedUser
  ): Promise<DispatchComplaintResponse> {
    const conn = await getOracleConnection();

    try {
      // Step A: Lock service request row for update
      const existing = await serviceRequestRepository.findById(input.requestId, conn);
      if (!existing) {
        throw new AppError(`Service Request ${input.requestId} not found`, 404, 'NOT_FOUND');
      }

      // Step B: Validate current state eligibility
      const allowedStates = ['REGISTERED', 'ASSIGNED_TO_ASF', 'ACKNOWLEDGED', 'APPOINTMENT_SCHEDULED'];
      if (!allowedStates.includes(existing.status)) {
        throw new AppError(
          `Cannot dispatch service request in current state: ${existing.status}`,
          400,
          'INVALID_STATE_TRANSITION'
        );
      }

      // Step C: Validate location authorization
      const isAdmin = actor.roles.includes('ADMIN');
      const targetLocationId = existing.assignedLocationId || actor.locationId;

      if (!isAdmin && actor.locationId && existing.assignedLocationId && existing.assignedLocationId !== actor.locationId) {
        throw new AppError('Cannot dispatch request assigned to another franchise center', 403, 'FORBIDDEN_LOCATION');
      }

      // Step D: Validate assigned engineer
      const engineer = await userRepository.findById(input.engineerId);
      if (!engineer || engineer.isActive !== 'Y') {
        throw new AppError('Selected field engineer is invalid or inactive', 400, 'INVALID_ENGINEER');
      }

      const engineerRoles = await rbacRepository.getUserRoles(engineer.userId);
      if (!engineerRoles.includes('ENGINEER')) {
        throw new AppError('Selected user does not have the FIELD ENGINEER role', 400, 'INVALID_ENGINEER_ROLE');
      }

      if (targetLocationId && engineer.locationId && engineer.locationId !== targetLocationId) {
        throw new AppError('Field engineer does not belong to this franchise location', 400, 'ENGINEER_LOCATION_MISMATCH');
      }

      // Step E: Parse and validate appointment date
      const appointmentDate = new Date(input.appointmentDate);
      if (isNaN(appointmentDate.getTime())) {
        throw new AppError('Invalid appointment date format', 400, 'INVALID_APPOINTMENT_DATE');
      }

      // Step F: Execute single-commit update on SERVICE_REQUESTS
      await serviceRequestRepository.dispatchServiceRequest(
        {
          requestId: input.requestId,
          appointmentDate,
          appointmentSlot: input.appointmentSlot,
          engineerId: engineer.userId,
          locationId: targetLocationId,
          travelDistanceKm: input.travelDistanceKm,
          areaType: input.areaType,
        },
        conn
      );

      // Step G: Generate Cryptographically Secure 6-Digit Check-In OTP & Hash
      const checkInOtp = generateCheckInOtp();
      const salt = generateSalt();
      const otpHash = hashOtp(checkInOtp, salt);
      const expiresAt = new Date(Date.now() + 48 * 3600 * 1000); // 48-hour validity

      // Step H: Store Salted Hash in SERVICE_REQUEST_VERIFICATIONS
      await verificationRepository.upsertCheckInOtp(
        {
          requestId: input.requestId,
          otpHash,
          salt,
          expiresAt,
        },
        conn
      );

      // Step I: Append Immutable Lifecycle Event
      await serviceRequestEventRepository.createEvent(
        {
          requestId: input.requestId,
          fromState: existing.status,
          toState: 'APPOINTMENT_SCHEDULED',
          eventType: 'APPOINTMENT_SCHEDULED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ASF',
          remarks: input.remarks || 'Appointment scheduled and field engineer assigned',
          metadataJson: {
            engineerId: engineer.userId,
            engineerName: engineer.fullName,
            engineerPhone: engineer.phoneNumber,
            appointmentDate: appointmentDate.toISOString(),
            appointmentSlot: input.appointmentSlot,
            travelDistanceKm: input.travelDistanceKm,
            areaType: input.areaType,
            rescheduled: existing.status === 'APPOINTMENT_SCHEDULED',
          },
        },
        conn
      );

      // Step J: Enqueue SMS 2 in NOTIFICATIONS_OUTBOX
      const formattedSlot = `${appointmentDate.toLocaleDateString()} (${input.appointmentSlot})`;
      const smsBody = notificationService.buildSms2Message({
        jobNumber: existing.jobNumber,
        techName: engineer.fullName,
        techMobile: engineer.phoneNumber || 'N/A',
        appointmentDatetime: formattedSlot,
        checkinOtp: checkInOtp,
      });

      const recipientPhone = existing.customerPhone;
      let outboxItem;
      if (recipientPhone) {
        outboxItem = await notificationRepository.enqueueNotification(
          {
            requestId: existing.requestId,
            channel: 'SMS',
            recipient: recipientPhone,
            templateCode: 'SMS_02_APPOINTMENT',
            messageBody: smsBody,
          },
          conn
        );
      }

      // Commit the complete dispatch transaction
      await conn.commit();

      // Step K: Asynchronously dispatch notification post-commit
      if (outboxItem) {
        notificationService.processNotification(outboxItem).catch(() => {});
      }

      // Retrieve updated record
      const updated = await serviceRequestRepository.findById(input.requestId);

      return {
        serviceRequest: updated!,
        smsQueued: Boolean(outboxItem),
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Securely regenerates the Customer Check-In OTP and enqueues SMS 6.
   * Rate-limited to max 5 regenerations per request.
   */
  async regenerateCheckInOtp(
    input: RegenerateOtpInput,
    actor: AuthenticatedUser
  ): Promise<RegenerateOtpResponse> {
    const conn = await getOracleConnection();

    try {
      const existing = await serviceRequestRepository.findById(input.requestId, conn);
      if (!existing) {
        throw new AppError(`Service Request ${input.requestId} not found`, 404, 'NOT_FOUND');
      }

      if (existing.status !== 'APPOINTMENT_SCHEDULED') {
        throw new AppError('OTP regeneration is only permitted while in APPOINTMENT_SCHEDULED status', 400, 'INVALID_STATUS');
      }

      // Check verification record
      const verification = await verificationRepository.findByRequestId(input.requestId, conn);
      if (verification && verification.checkInRegeneratedCount >= 5) {
        throw new AppError('Maximum OTP regeneration limit (5) reached for this service request', 429, 'RATE_LIMIT_EXCEEDED');
      }

      // Generate new cryptographically secure OTP
      const newOtp = generateCheckInOtp();
      const newSalt = generateSalt();
      const newHash = hashOtp(newOtp, newSalt);
      const newExpiresAt = new Date(Date.now() + 48 * 3600 * 1000);

      // Record in verification table
      await verificationRepository.recordOtpRegeneration(
        {
          requestId: input.requestId,
          newOtpHash: newHash,
          newSalt: newSalt,
          newExpiresAt,
        },
        conn
      );

      // Append lifecycle event
      await serviceRequestEventRepository.createEvent(
        {
          requestId: input.requestId,
          fromState: 'APPOINTMENT_SCHEDULED',
          toState: 'APPOINTMENT_SCHEDULED',
          eventType: 'CHECKIN_OTP_REGENERATED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ASF',
          remarks: input.reason || 'Check-In OTP regenerated upon technician or customer request',
          metadataJson: {
            regeneratedCount: (verification?.checkInRegeneratedCount || 0) + 1,
            reason: input.reason,
          },
        },
        conn
      );

      // Enqueue SMS 6
      const smsBody = notificationService.buildSms6Message({
        jobNumber: existing.jobNumber,
        checkinOtp: newOtp,
      });

      let outboxItem;
      if (existing.customerPhone) {
        outboxItem = await notificationRepository.enqueueNotification(
          {
            requestId: existing.requestId,
            channel: 'SMS',
            recipient: existing.customerPhone,
            templateCode: 'SMS_06_OTP_REGEN',
            messageBody: smsBody,
          },
          conn
        );
      }

      await conn.commit();

      if (outboxItem) {
        notificationService.processNotification(outboxItem).catch(() => {});
      }

      return {
        success: true,
        smsQueued: Boolean(outboxItem),
        message: 'New Check-In OTP generated and SMS acknowledgement sent to customer.',
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Authenticated technician on-site check-in using customer-provided OTP:
   * 1. Verifies technician assignment.
   * 2. Compares OTP hash using constant-time comparison.
   * 3. Enforces 5-attempt lockout and expiry.
   * 4. Transitions ticket to TECHNICIAN_CHECKED_IN and consumes OTP.
   * 5. Appends immutable event to history.
   */
  async checkInWithOtp(
    input: CheckInComplaintInput,
    actor: AuthenticatedUser
  ): Promise<CheckInComplaintResponse> {
    const conn = await getOracleConnection();

    try {
      const existing = await serviceRequestRepository.findById(input.requestId, conn);
      if (!existing) {
        throw new AppError(`Service Request ${input.requestId} not found`, 404, 'NOT_FOUND');
      }

      // Check current state
      if (existing.status !== 'APPOINTMENT_SCHEDULED') {
        throw new AppError(
          `Cannot check in: service request is in status '${existing.status}' (expected 'APPOINTMENT_SCHEDULED')`,
          400,
          'INVALID_STATUS'
        );
      }

      // Authorization: if user has ENGINEER role, they must be the assigned engineer
      const isEngineer = actor.roles.includes('ENGINEER');
      const isAdmin = actor.roles.includes('ADMIN');
      if (isEngineer && !isAdmin && existing.assignedEngineerId !== actor.userId) {
        throw new AppError('Access denied: You are not the assigned field engineer for this ticket', 403, 'FORBIDDEN_TECHNICIAN');
      }

      // Verification secret check
      const verification = await verificationRepository.findByRequestId(input.requestId, conn);
      if (!verification || !verification.checkInOtpHash || !verification.checkInOtpSalt) {
        throw new AppError('Check-In OTP has not been initialized for this service request', 400, 'OTP_NOT_INITIALIZED');
      }

      if (verification.checkInVerifiedAt) {
        throw new AppError('Check-In has already been completed for this service request', 400, 'ALREADY_CHECKED_IN');
      }

      // Lockout check: 5 attempts
      if (verification.checkInOtpAttempts >= 5) {
        throw new AppError(
          'Maximum Check-In OTP attempts (5) exceeded. Please regenerate a new OTP before checking in.',
          400,
          'OTP_LOCKED'
        );
      }

      // Expiry check
      if (verification.checkInOtpExpiresAt && new Date() > verification.checkInOtpExpiresAt) {
        throw new AppError('Check-In OTP has expired. Please regenerate a new OTP.', 400, 'OTP_EXPIRED');
      }

      // Constant-time hash verification
      const isMatch = verifyOtp(input.otp, verification.checkInOtpSalt, verification.checkInOtpHash);

      if (!isMatch) {
        // Increment attempts
        const newAttempts = await verificationRepository.incrementCheckInAttempts(input.requestId);
        const remaining = Math.max(0, 5 - newAttempts);

        // Commit increment immediately
        throw new AppError(
          remaining > 0
            ? `Invalid Check-In OTP. ${remaining} attempt(s) remaining.`
            : 'Invalid Check-In OTP. Maximum attempts exceeded. Please regenerate a new OTP.',
          400,
          'INVALID_OTP'
        );
      }

      // OTP is valid! Mark consumed and update service request
      await verificationRepository.markCheckInVerified(input.requestId, conn);
      await serviceRequestRepository.updateCheckIn(input.requestId, conn);

      // Append immutable lifecycle event
      await serviceRequestEventRepository.createEvent(
        {
          requestId: input.requestId,
          fromState: 'APPOINTMENT_SCHEDULED',
          toState: 'TECHNICIAN_CHECKED_IN',
          eventType: 'TECHNICIAN_CHECKED_IN',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ENGINEER',
          remarks: input.remarks || 'On-site technician check-in confirmed via customer OTP',
          metadataJson: {
            geocoordinates: input.geocoordinates,
            verifiedAt: new Date().toISOString(),
          },
        },
        conn
      );

      await conn.commit();

      const updated = await serviceRequestRepository.findById(input.requestId);

      return {
        serviceRequest: updated!,
        checkedInAt: new Date().toISOString(),
        verified: true,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Retrieves visits and jobs assigned to the authenticated field technician.
   */
  async getEngineerJobs(actor: AuthenticatedUser, params: { status?: string; page?: number; limit?: number }) {
    return serviceRequestRepository.findEngineerJobs(actor.userId, params);
  }
}

export const asfService = new AsfService();
