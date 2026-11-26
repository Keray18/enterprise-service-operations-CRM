import crypto from 'crypto';
import oracledb from 'oracledb';
import { env } from '../config/env.js';
import { getOracleConnection } from '../database/oraclePool.js';
import { locationRepository } from '../database/repositories/locationRepository.js';
import { notificationRepository } from '../database/repositories/notificationRepository.js';
import { rbacRepository } from '../database/repositories/rbacRepository.js';
import { replacementRequestRepository } from '../database/repositories/replacementRequestRepository.js';
import { serviceRequestEventRepository } from '../database/repositories/serviceRequestEventRepository.js';
import { serviceRequestRepository } from '../database/repositories/serviceRequestRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { verificationRepository } from '../database/repositories/verificationRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser } from '../types/auth.js';
import { ReplacementReasonCode } from '../types/job360.js';
import {
  AcknowledgeComplaintInput,
  AcknowledgeComplaintResponse,
  AsfQueueFilters,
  CheckInComplaintInput,
  CheckInComplaintResponse,
  DispatchComplaintInput,
  DispatchComplaintResponse,
  EligibleEngineerRecord,
  ReassignComplaintInput,
  ReassignComplaintResponse,
  RegenerateOtpInput,
  RegenerateOtpResponse,
  RejectAssignmentInput,
  RejectAssignmentResponse,
} from '../types/asf.js';
import { PaginatedResult } from '../types/catalog.js';
import { ServiceRequestStatus, ServiceRequestWithRelationsRecord } from '../types/callCenter.js';
import {
  encryptNotificationPayload,
  generateCheckInOtp,
  generateHappyCode,
  generateSalt,
  hashOtp,
  verifyOtp,
} from '../utils/cryptoUtils.js';
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
    const isAsfManager = actor.roles.includes('ASF') || actor.roles.includes('ASF_MANAGER');
    const isEngineerOnly = actor.roles.includes('ENGINEER') && !isAdmin && !isAsfManager;
    const actorLocationId = actor.locationId;

    // Strict Engineer isolation: Engineers can only see service requests assigned to their own authenticated identity.
    // Query parameter manipulation is strictly prevented by binding assignedEngineerId to actor.userId.
    let effectiveFilters = { ...filters };
    if (isEngineerOnly) {
      effectiveFilters.assignedEngineerId = actor.userId;
    }

    const result = await serviceRequestRepository.queryAsfQueue(
      effectiveFilters,
      actorLocationId,
      isAdmin,
      isAsfManager || isAdmin,
      isEngineerOnly
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
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      hasMore: result.hasMore,
      items: augmentedItems,
    };
  }

  /**
   * Retrieves active field engineers eligible for assignment in an ASF location or network-wide.
   * Admins and Service Center managers can query the centralized technician directory
   * or pass an optional locationId to filter by franchise.
   * Field engineers are strictly forbidden from viewing the technician roster.
   */
  async getEligibleEngineers(locationId: string | undefined, actor: AuthenticatedUser): Promise<EligibleEngineerRecord[]> {
    const isAdmin = actor.roles.includes('ADMIN');
    const isAsf = actor.roles.includes('ASF') || actor.roles.includes('ASF_MANAGER');
    if (!isAdmin && !isAsf) {
      throw new AppError('Unauthorized: Field engineers cannot view the technician roster', 403, 'FORBIDDEN_ROLE');
    }

    return userRepository.findEligibleEngineers(locationId);
  }

  /**
   * Step A: Acknowledges a complaint by an authorized Service Center manager or Admin.
   * Records ACKNOWLEDGED_BY and timestamp, stops 48h SLA timer, logs event.
   */
  async acknowledgeComplaint(
    input: AcknowledgeComplaintInput,
    actor: AuthenticatedUser
  ): Promise<AcknowledgeComplaintResponse> {
    const isAdmin = actor.roles.includes('ADMIN');
    const isAsf = actor.roles.includes('ASF') || actor.roles.includes('ASF_MANAGER');
    if (!isAdmin && !isAsf) {
      throw new AppError('Unauthorized: Only Service Center managers and Admins can acknowledge complaints.', 403, 'FORBIDDEN_ROLE');
    }

    const conn = await getOracleConnection();
    try {
      const existing = await serviceRequestRepository.findById(input.requestId, conn);
      if (!existing) {
        throw new AppError(`Service Request ${input.requestId} not found`, 404, 'NOT_FOUND');
      }

      // Check state eligibility
      const allowedStates = ['REGISTERED', 'ASSIGNED_TO_ASF', 'ACKNOWLEDGED'];
      if (!allowedStates.includes(existing.status)) {
        throw new AppError(
          `Cannot acknowledge service request in current state: ${existing.status}`,
          400,
          'INVALID_STATE_TRANSITION'
        );
      }

      if (existing.status === 'ACKNOWLEDGED' && existing.acknowledgedAt) {
        return {
          serviceRequest: existing,
          acknowledgedAt: existing.acknowledgedAt.toISOString(),
          acknowledgedBy: existing.acknowledgedByUsername || actor.username,
        };
      }

      const updated = await serviceRequestRepository.acknowledgeServiceRequest(
        input.requestId,
        actor.userId,
        actor.username,
        conn
      );

      // Record event
      await serviceRequestEventRepository.createEvent(
        {
          requestId: input.requestId,
          fromState: existing.status,
          toState: 'ACKNOWLEDGED',
          eventType: 'ASF_ACKNOWLEDGED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ASF',
          remarks: input.remarks || 'Complaint acknowledged by Service Center manager',
          metadataJson: {
            acknowledgedBy: actor.username,
            previousStatus: existing.status,
          },
        },
        conn
      );

      await conn.commit();

      return {
        serviceRequest: updated,
        acknowledgedAt: (updated.acknowledgedAt || new Date()).toISOString(),
        acknowledgedBy: actor.username,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Rejects an assignment with a mandatory reason, placing it into the Assignment Required queue.
   */
  async rejectAssignment(
    input: RejectAssignmentInput,
    actor: AuthenticatedUser
  ): Promise<RejectAssignmentResponse> {
    const isAdmin = actor.roles.includes('ADMIN');
    const isAsf = actor.roles.includes('ASF') || actor.roles.includes('ASF_MANAGER');
    if (!isAdmin && !isAsf) {
      throw new AppError('Unauthorized: Field engineers cannot reject franchise assignments.', 403, 'FORBIDDEN_ROLE');
    }

    if (!input.reason) {
      throw new AppError('A valid rejection reason code is mandatory', 400, 'REASON_REQUIRED');
    }
    if (!input.remarks || !input.remarks.trim()) {
      throw new AppError('Rejection remarks are mandatory', 400, 'REMARKS_REQUIRED');
    }

    const conn = await getOracleConnection();
    try {
      const existing = await serviceRequestRepository.findById(input.requestId, conn);
      if (!existing) {
        throw new AppError(`Service Request ${input.requestId} not found`, 404, 'NOT_FOUND');
      }

      const allowedStates = ['REGISTERED', 'ASSIGNED_TO_ASF', 'ACKNOWLEDGED', 'APPOINTMENT_SCHEDULED'];
      if (!allowedStates.includes(existing.status)) {
        throw new AppError(
          `Cannot reject service request in current operational state: ${existing.status}`,
          400,
          'INVALID_STATE_TRANSITION'
        );
      }

      const updated = await serviceRequestRepository.requestReassignment(
        input.requestId,
        input.reason,
        input.remarks.trim(),
        actor.userId,
        conn
      );

      await serviceRequestEventRepository.createEvent(
        {
          requestId: input.requestId,
          fromState: existing.status,
          toState: existing.status,
          eventType: 'ASSIGNMENT_REJECTED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ASF',
          remarks: `Assignment rejected: ${input.reason} - ${input.remarks.trim()}`,
          metadataJson: {
            reason: input.reason,
            remarks: input.remarks.trim(),
            rejectedBy: actor.username,
          },
        },
        conn
      );

      await conn.commit();

      return {
        serviceRequest: updated,
        reassignmentRequested: true,
        message: 'Assignment rejected; request moved to Assignment Required queue.',
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Reassigns a service request to a different Service Center location (Admin only).
   */
  async reassignComplaint(
    input: ReassignComplaintInput,
    actor: AuthenticatedUser
  ): Promise<ReassignComplaintResponse> {
    if (!actor.roles.includes('ADMIN')) {
      throw new AppError('Unauthorized: Only administrators can reassign complaints between Service Centers', 403, 'FORBIDDEN_ROLE');
    }

    if (!input.newLocationId) {
      throw new AppError('Target Service Center location ID is required', 400, 'LOCATION_REQUIRED');
    }

    const targetLocation = await locationRepository.findById(input.newLocationId);
    if (!targetLocation || targetLocation.isActive !== 'Y' || targetLocation.partyType !== 'ASF') {
      throw new AppError('Target location must be an active Authorized Service Franchisee (ASF)', 400, 'INVALID_TARGET_LOCATION');
    }

    const conn = await getOracleConnection();
    try {
      const existing = await serviceRequestRepository.findById(input.requestId, conn);
      if (!existing) {
        throw new AppError(`Service Request ${input.requestId} not found`, 404, 'NOT_FOUND');
      }

      const terminalStates = ['CLOSED', 'CANCELLED', 'REPLACED'];
      if (terminalStates.includes(existing.status)) {
        throw new AppError(`Cannot reassign service request in terminal state: ${existing.status}`, 400, 'INVALID_STATE_TRANSITION');
      }

      // Check if assignment and appointment can/should be preserved
      let preserve = false;
      let targetStatus: ServiceRequestStatus = 'ASSIGNED_TO_ASF';

      if (input.preserveAssignment !== false && existing.assignedEngineerId) {
        const assignedEngineer = await userRepository.findById(existing.assignedEngineerId);
        // If technician belongs to the new center or is compatible, preserve the dispatch
        if (assignedEngineer && assignedEngineer.isActive === 'Y' && assignedEngineer.locationId === input.newLocationId) {
          preserve = true;
          if (['ACKNOWLEDGED', 'APPOINTMENT_SCHEDULED'].includes(existing.status)) {
            targetStatus = existing.status;
          }
        }
      }

      const updated = await serviceRequestRepository.reassignAsf(
        input.requestId,
        input.newLocationId,
        actor.userId,
        actor.username,
        input.remarks,
        { preserveAssignment: preserve, targetStatus },
        conn
      );

      await serviceRequestEventRepository.createEvent(
        {
          requestId: input.requestId,
          fromState: existing.status,
          toState: preserve ? targetStatus : 'ASSIGNED_TO_ASF',
          eventType: 'COMPLAINT_REASSIGNED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ADMIN',
          remarks: input.remarks || `Reassigned to ${targetLocation.locationName} (${targetLocation.locationCode})${preserve ? ' (Technician assignment & appointment preserved)' : ''}`,
          metadataJson: {
            previousLocationId: existing.assignedLocationId || null,
            newLocationId: input.newLocationId,
            newLocationName: targetLocation.locationName,
            reassignedBy: actor.username,
            assignmentPreserved: preserve,
            assignedEngineerId: preserve ? existing.assignedEngineerId : null,
          },
        },
        conn
      );

      await conn.commit();

      return {
        serviceRequest: updated,
        assignedLocationId: input.newLocationId,
        message: `Service request successfully reassigned to ${targetLocation.locationName}`,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
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

      // Step C: Validate role and location authorization
      const isAdmin = actor.roles.includes('ADMIN');
      const isAsfManager = actor.roles.includes('ASF') || actor.roles.includes('ASF_MANAGER');
      if (!isAdmin && !isAsfManager) {
        throw new AppError('Unauthorized: Field engineers cannot dispatch or assign service requests.', 403, 'FORBIDDEN_ROLE');
      }

      if (!isAdmin && actor.locationId && existing.assignedLocationId && actor.locationId !== existing.assignedLocationId) {
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

      // Determine target ticket franchise location and evaluate cross-location assignment
      const targetLocationId = existing.assignedLocationId || actor.locationId || engineer.locationId;
      const isCrossLocation = Boolean(engineer.locationId && targetLocationId && engineer.locationId !== targetLocationId);

      // Check idempotency if idempotencyKey is supplied
      if (input.idempotencyKey && existing.status === 'APPOINTMENT_SCHEDULED') {
        const events = await serviceRequestEventRepository.listEventsByRequestId(input.requestId, conn);
        const match = events.find((ev) => {
          if (ev.eventType === 'APPOINTMENT_SCHEDULED' && ev.metadataJson) {
            try {
              const meta = typeof ev.metadataJson === 'string' ? JSON.parse(ev.metadataJson) : ev.metadataJson;
              return meta?.idempotencyKey === input.idempotencyKey;
            } catch {
              return false;
            }
          }
          return false;
        });

        if (match || existing.idempotencyKey === input.idempotencyKey) {
          return {
            serviceRequest: existing,
            smsQueued: false,
          };
        }
      }

      // Step E: Parse and validate appointment date
      const appointmentDate = new Date(input.appointmentDate);
      if (isNaN(appointmentDate.getTime())) {
        throw new AppError('Invalid appointment date format', 400, 'INVALID_APPOINTMENT_DATE');
      }

      const isRescheduled = existing.status === 'APPOINTMENT_SCHEDULED';

      // Enforce: appointmentTime >= authoritativeServerTime + 60 minutes (allowing 5s clock tolerance)
      const minAllowed = Date.now() + 60 * 60 * 1000 - 5000;
      if (appointmentDate.getTime() < minAllowed) {
        throw new AppError('Appointment must be scheduled at least 60 minutes in the future', 400, 'INVALID_APPOINTMENT_TIME');
      }

      // If rescheduled, supersede previous queued appointment notifications in outbox
      if (isRescheduled) {
        await notificationRepository.supersedePending(existing.requestId, 'SMS_02_APPOINTMENT', conn);
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

      // Step G: Generate Cryptographically Secure 6-Digit Check-In OTP & HMAC Digest
      const checkInOtp = generateCheckInOtp();
      const salt = generateSalt();
      const otpHash = hashOtp({
        otp: checkInOtp,
        salt,
        requestId: input.requestId,
        purpose: 'CHECK_IN',
      });
      const expiresAt = new Date(Date.now() + 48 * 3600 * 1000); // 48-hour validity

      // Step H: Store Salted HMAC Digest in SERVICE_REQUEST_VERIFICATIONS
      await verificationRepository.upsertCheckInOtp(
        {
          requestId: input.requestId,
          otpHash,
          salt,
          expiresAt,
        },
        conn
      );

      // Step H.1: If cross-location assignment, append auditable CROSS_LOCATION_ASSIGNMENT event
      if (isCrossLocation) {
        await serviceRequestEventRepository.createEvent(
          {
            requestId: input.requestId,
            fromState: existing.status,
            toState: existing.status,
            eventType: 'CROSS_LOCATION_ASSIGNMENT',
            triggeredByUserId: actor.userId,
            triggeredByUsername: actor.username,
            triggeredByRole: actor.roles[0] || 'ASF',
            remarks: `Cross-location assignment: Technician ${engineer.fullName} (Home Center: ${engineer.locationId}) assigned to complaint at franchise ${targetLocationId}`,
            metadataJson: {
              fromLocationId: engineer.locationId,
              toLocationId: targetLocationId,
              engineerHomeLocationId: engineer.locationId,
              ticketLocationId: targetLocationId,
              engineerId: engineer.userId,
              engineerName: engineer.fullName,
            },
          },
          conn
        );
      }

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
            crossLocation: isCrossLocation,
            engineerHomeLocationId: engineer.locationId,
            idempotencyKey: input.idempotencyKey,
            reassignedFromEngineerId: existing.assignedEngineerId && existing.assignedEngineerId !== engineer.userId ? existing.assignedEngineerId : undefined,
          },
        },
        conn
      );

      // Step J: Enqueue Authenticated Encrypted SMS 2 in NOTIFICATIONS_OUTBOX
      const formattedSlot = `${appointmentDate.toLocaleDateString()} (${input.appointmentSlot})`;
      const smsBody = notificationService.buildSms2Message({
        jobNumber: existing.jobNumber,
        techName: engineer.fullName,
        techMobile: engineer.phoneNumber || 'N/A',
        appointmentDatetime: formattedSlot,
        checkinOtp: checkInOtp,
      });

      // Scheduled for: appointmentTime - 60 minutes
      const scheduledArrivalSms = new Date(appointmentDate.getTime() - 60 * 60 * 1000);
      const isDueImmediately = scheduledArrivalSms.getTime() <= Date.now();

      // Encrypt sensitive OTP-bearing payload (AES-256-GCM)
      const encrypted = encryptNotificationPayload(smsBody);

      const recipientPhone = existing.customerPhone;
      let outboxItem;
      if (recipientPhone) {
        outboxItem = await notificationRepository.enqueueNotification(
          {
            requestId: existing.requestId,
            channel: 'SMS',
            recipient: recipientPhone,
            templateCode: 'SMS_02_APPOINTMENT',
            messageBody: '[ENCRYPTED_OTP_PAYLOAD]',
            isEncrypted: 'Y',
            encryptedPayload: encrypted.encryptedPayload,
            encryptionIv: encrypted.iv,
            authTag: encrypted.authTag,
            keyVersion: encrypted.keyVersion,
            scheduledFor: isDueImmediately ? undefined : scheduledArrivalSms,
          },
          conn
        );
      }

      // Commit the complete dispatch transaction
      await conn.commit();

      // Step K: Asynchronously dispatch notification post-commit if due immediately
      if (outboxItem && isDueImmediately) {
        notificationService.processNotification(outboxItem).catch(() => {});
      }

      // Retrieve updated record
      const updated = await serviceRequestRepository.findById(input.requestId);

      const allowDevOtp =
        (process.env['NODE_ENV'] || env.NODE_ENV) !== 'production' &&
        (process.env['ENABLE_DEV_OTP_PREVIEW'] || env.ENABLE_DEV_OTP_PREVIEW) === 'true' &&
        (actor.roles.includes('ADMIN') || actor.roles.includes('ASF') || actor.roles.includes('ASF_MANAGER'));

      return {
        serviceRequest: updated!,
        smsQueued: Boolean(outboxItem),
        devOtpPreview: allowDevOtp ? checkInOtp : undefined,
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

      // Validate role, location, and assignment authorization
      const isAdmin = actor.roles.includes('ADMIN');
      const isAsf = actor.roles.includes('ASF') || actor.roles.includes('ASF_MANAGER');
      const isEngineer = actor.roles.includes('ENGINEER');

      if (!isAdmin && !isAsf) {
        if (!isEngineer || existing.assignedEngineerId !== actor.userId) {
          throw new AppError('Unauthorized: Field engineers can only regenerate Arrival Happy Code for their own assigned service calls.', 403, 'FORBIDDEN_ROLE');
        }
      }

      if (!isAdmin && actor.locationId && existing.assignedLocationId && existing.assignedLocationId !== actor.locationId) {
        throw new AppError('Cannot regenerate Arrival Happy Code for request assigned to another franchise center', 403, 'FORBIDDEN_LOCATION');
      }

      if (existing.status !== 'APPOINTMENT_SCHEDULED') {
        throw new AppError('Arrival Happy Code regeneration is only permitted while in APPOINTMENT_SCHEDULED status', 400, 'INVALID_STATUS');
      }

      // Check verification record
      const verification = await verificationRepository.findByRequestId(input.requestId, conn);
      if (verification && verification.checkInRegeneratedCount >= 5) {
        throw new AppError('Maximum Arrival Happy Code regeneration limit (5) reached for this service request', 429, 'RATE_LIMIT_EXCEEDED');
      }

      // Generate new cryptographically secure OTP
      const newOtp = generateCheckInOtp();
      const newSalt = generateSalt();
      const newHash = hashOtp({
        otp: newOtp,
        salt: newSalt,
        requestId: input.requestId,
        purpose: 'CHECK_IN',
      });
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
          remarks: input.reason || 'Arrival Happy Code regenerated upon technician or customer request',
          metadataJson: {
            regeneratedCount: (verification?.checkInRegeneratedCount || 0) + 1,
            reason: input.reason,
          },
        },
        conn
      );

      // Enqueue Authenticated Encrypted SMS 6
      const smsBody = notificationService.buildSms6Message({
        jobNumber: existing.jobNumber,
        checkinOtp: newOtp,
      });

      // Encrypt sensitive OTP-bearing payload (AES-256-GCM)
      const encrypted = encryptNotificationPayload(smsBody);

      let outboxItem;
      if (existing.customerPhone) {
        outboxItem = await notificationRepository.enqueueNotification(
          {
            requestId: existing.requestId,
            channel: 'SMS',
            recipient: existing.customerPhone,
            templateCode: 'SMS_06_OTP_REGEN',
            messageBody: '[ENCRYPTED_OTP_PAYLOAD]',
            isEncrypted: 'Y',
            encryptedPayload: encrypted.encryptedPayload,
            encryptionIv: encrypted.iv,
            authTag: encrypted.authTag,
            keyVersion: encrypted.keyVersion,
          },
          conn
        );
      }

      await conn.commit();

      if (outboxItem) {
        notificationService.processNotification(outboxItem).catch(() => {});
      }

      const allowDevOtp =
        (process.env['NODE_ENV'] || env.NODE_ENV) !== 'production' &&
        (process.env['ENABLE_DEV_OTP_PREVIEW'] || env.ENABLE_DEV_OTP_PREVIEW) === 'true' &&
        (actor.roles.includes('ADMIN') || actor.roles.includes('ASF') || actor.roles.includes('ASF_MANAGER'));

      return {
        success: true,
        smsQueued: Boolean(outboxItem),
        message: 'New Arrival Happy Code generated and SMS acknowledgement sent to customer.',
        devOtpPreview: allowDevOtp ? newOtp : undefined,
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
        throw new AppError('Arrival Happy Code has not been initialized for this service request', 400, 'OTP_NOT_INITIALIZED');
      }

      if (verification.checkInVerifiedAt) {
        throw new AppError('Check-In has already been completed for this service request', 400, 'ALREADY_CHECKED_IN');
      }

      // Lockout check: 5 attempts
      if (verification.checkInOtpAttempts >= 5) {
        throw new AppError(
          'Maximum Arrival Happy Code attempts (5) exceeded. Please regenerate a new Happy Code before checking in.',
          400,
          'OTP_LOCKED'
        );
      }

      // Expiry check
      if (verification.checkInOtpExpiresAt && new Date() > verification.checkInOtpExpiresAt) {
        throw new AppError('Arrival Happy Code has expired. Please regenerate a new Happy Code.', 400, 'OTP_EXPIRED');
      }

      // Constant-time HMAC-SHA-256 verification binding requestId and pepper
      const isMatch = verifyOtp({
        providedOtp: input.otp,
        salt: verification.checkInOtpSalt,
        requestId: input.requestId,
        expectedHash: verification.checkInOtpHash,
        purpose: 'CHECK_IN',
      });

      if (!isMatch) {
        // Increment attempts
        const newAttempts = await verificationRepository.incrementCheckInAttempts(input.requestId);
        const remaining = Math.max(0, 5 - newAttempts);

        // Commit increment immediately
        throw new AppError(
          remaining > 0
            ? `Invalid Arrival Happy Code. ${remaining} attempt(s) remaining.`
            : 'Invalid Arrival Happy Code. Maximum attempts exceeded. Please regenerate a new Happy Code.',
          400,
          'INVALID_OTP'
        );
      }

      // Arrival Happy Code is valid! Mark consumed and update service request
      await verificationRepository.markCheckInVerified(input.requestId, conn);
      await serviceRequestRepository.updateCheckIn(input.requestId, conn);

      // Generate separate Completion Happy Code immediately upon Arrival verification
      const completionCode = generateHappyCode();
      const completionSalt = generateSalt(16);
      const completionHash = hashOtp({
        otp: completionCode,
        salt: completionSalt,
        requestId: input.requestId,
        purpose: 'HAPPY_CODE',
      });
      const completionExpiresAt = new Date(Date.now() + 24 * 3600 * 1000);

      await verificationRepository.upsertHappyCode(
        {
          requestId: input.requestId,
          happyCodeHash: completionHash,
          salt: completionSalt,
          expiresAt: completionExpiresAt,
        },
        conn
      );

      // Queue separate Customer SMS 4 for immediate delivery
      const sms4Body = notificationService.buildSms4Message({
        jobNumber: existing.jobNumber,
        happyCode: completionCode,
      });
      const encryptedSms4 = encryptNotificationPayload(sms4Body);
      let outboxCompletion;
      if (existing.customerPhone) {
        outboxCompletion = await notificationRepository.enqueueNotification(
          {
            requestId: existing.requestId,
            channel: 'SMS',
            recipient: existing.customerPhone,
            templateCode: 'SMS_4_CALL_CLOSURE',
            messageBody: 'Dear Customer, Your service Request is closed. Kindly share the confidential Happy Code sent via SMS with our technician.',
            isEncrypted: 'Y',
            encryptedPayload: encryptedSms4.encryptedPayload,
            encryptionIv: encryptedSms4.iv,
            authTag: encryptedSms4.authTag,
            keyVersion: encryptedSms4.keyVersion,
          },
          conn
        );
      }

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
          remarks: input.remarks || 'On-site technician check-in confirmed via customer Arrival Happy Code; Completion Happy Code issued to customer',
          metadataJson: {
            geocoordinates: input.geocoordinates,
            verifiedAt: new Date().toISOString(),
          },
        },
        conn
      );

      await conn.commit();

      if (outboxCompletion) {
        notificationService.processNotification(outboxCompletion).catch(() => {});
      }

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

  /**
   * Atomically accepts an engineer's repair escalation:
   * 1. Validates ASF authorization and ownership of the complaint.
   * 2. Locks complaint using SELECT FOR UPDATE.
   * 3. Validates current complaint state is REPAIR_ESCALATED (handles idempotent retries safely).
   * 4. Closes the original complaint with outcome ESCALATED_TO_REPLACEMENT.
   * 5. Creates the linked replacement request in OPEN state.
   * 6. Appends immutable audit event and commits in a single transaction.
   */
  async acceptEscalation(
    jobId: string,
    input: {
      reasonCode: ReplacementReasonCode;
      reasonDescription?: string;
      technicianRemarks?: string;
      requiredPartId?: string;
      warrantyType?: 'IN_WARRANTY' | 'OUT_OF_WARRANTY';
      quotationAmount?: number;
    },
    actor: AuthenticatedUser
  ): Promise<{
    success: boolean;
    message: string;
    replacement: any;
    alreadyAccepted?: boolean;
  }> {
    // 1. Role validation: Must have ASF or ADMIN role
    const isAsf = actor.roles.includes('ASF');
    const isAdmin = actor.roles.includes('ADMIN');
    if (!isAsf && !isAdmin) {
      throw new AppError('Forbidden: Only authorized ASF or ADMIN users can accept escalations', 403, 'FORBIDDEN');
    }

    // Resolve complaint to obtain request_id
    const existingComplaint =
      (await serviceRequestRepository.findById(jobId)) ||
      (await serviceRequestRepository.findByJobNumber(jobId));
    if (!existingComplaint) {
      throw new AppError(`Complaint with id or job number '${jobId}' not found`, 404, 'COMPLAINT_NOT_FOUND');
    }
    const requestId = existingComplaint.requestId;

    // 2. Resource ownership: If caller is ASF, their assigned location must match the complaint
    if (isAsf && !isAdmin) {
      const userLocation = actor.locationId;
      if (!userLocation || userLocation !== existingComplaint.assignedLocationId) {
        throw new AppError(
          'Forbidden: ASF can only accept escalations for complaints assigned to their service center',
          403,
          'FORBIDDEN_LOCATION_MISMATCH'
        );
      }
    }

    // Reason descriptions
    const REPLACEMENT_REASONS: Record<ReplacementReasonCode, string> = {
      REASON_1: 'Spare part not received / service not completed within 168 Hours (7 Days)',
      REASON_2: 'New piece damaged out of the box (Dead on Arrival / DOA)',
      REASON_3: 'Customer refused repair due to recurring product quality failure',
      REASON_4: 'Product model discontinued by brand manufacturer and spare parts unavailable',
      REASON_5: 'Product non-repairable (severe electrical burnout or unserviceable structural damage)',
      REASON_6: 'Complaint not acknowledged by assigned ASF within 48 hours (debited to ASF)',
    };
    const resolvedReasonDesc = input.reasonDescription || REPLACEMENT_REASONS[input.reasonCode];
    if (!resolvedReasonDesc) {
      throw new AppError(`Invalid replacement reason code '${input.reasonCode}'`, 400, 'INVALID_REASON_CODE');
    }

    const warrantyType =
      input.warrantyType || (existingComplaint.warrantyStatus === 'OUT_OF_WARRANTY' ? 'OUT_OF_WARRANTY' : 'IN_WARRANTY');
    const quotationAmount = warrantyType === 'OUT_OF_WARRANTY' ? (input.quotationAmount ?? 0) : 0;
    const quotationStatus = warrantyType === 'OUT_OF_WARRANTY' ? 'PENDING_CUSTOMER_APPROVAL' : 'NOT_REQUIRED';

    const conn = await getOracleConnection();
    try {
      // 3. Lock complaint row for update
      const lockSql = `
        SELECT REQUEST_ID, JOB_NUMBER, STATUS, ASSIGNED_LOCATION_ID, WARRANTY_STATUS, CLOSED_AT, CLOSED_BY
        FROM SERVICE_REQUESTS
        WHERE REQUEST_ID = :requestId
        FOR UPDATE
      `;
      const lockRes = await conn.execute<any>(lockSql, { requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!lockRes.rows || lockRes.rows.length === 0) {
        throw new AppError(`Complaint ${requestId} not found during lock`, 404, 'NOT_FOUND');
      }
      const lockedRow = lockRes.rows[0];

      // Re-verify location ownership under row lock
      if (isAsf && !isAdmin && lockedRow.ASSIGNED_LOCATION_ID !== actor.locationId) {
        throw new AppError('Forbidden: ASF location mismatch under row lock', 403, 'FORBIDDEN_LOCATION_MISMATCH');
      }

      // 4. Check for existing linked replacement request (Idempotency & permanent uniqueness)
      const existingReplacement = await replacementRequestRepository.findByRequestId(requestId, conn);
      if (existingReplacement) {
        // If the complaint is already in ESCALATED_TO_REPLACEMENT status:
        if (lockedRow.STATUS === 'ESCALATED_TO_REPLACEMENT') {
          // Check if terminal
          if (existingReplacement.status === 'CLOSED' || existingReplacement.status === 'CUSTOMER_DECLINED') {
            throw new AppError('Cannot duplicate or reopen replacement request in terminal state', 400, 'REPLACEMENT_TERMINAL');
          }
          // Safe idempotent return
          await conn.rollback();
          return {
            success: true,
            message: 'Escalation was already accepted; returning existing replacement request.',
            replacement: existingReplacement,
            alreadyAccepted: true,
          };
        }
        // If replacement request exists but complaint is NOT ESCALATED_TO_REPLACEMENT, conflict
        throw new AppError('A replacement request already exists for this complaint.', 409, 'DUPLICATE_REPLACEMENT_REQUEST');
      }

      // 5. Validate current complaint state: Must be REPAIR_ESCALATED
      if (lockedRow.STATUS !== 'REPAIR_ESCALATED') {
        throw new AppError(
          `Cannot accept escalation: Complaint must be in 'REPAIR_ESCALATED' status (current status: '${lockedRow.STATUS}')`,
          400,
          'INVALID_COMPLAINT_STATUS'
        );
      }

      // 6. Atomically close the original complaint with outcome ESCALATED_TO_REPLACEMENT
      await serviceRequestRepository.closeEscalatedToReplacement(
        {
          requestId,
          closedBy: actor.userId,
        },
        conn
      );

      // 7. Create linked replacement request in OPEN status
      const replacementId = crypto.randomUUID();
      const createdReplacement = await replacementRequestRepository.createPhase2Request(
        {
          replacementId,
          requestId,
          reasonCode: input.reasonCode,
          reasonDescription: resolvedReasonDesc,
          technicianRemarks: input.technicianRemarks,
          requestedBy: actor.userId,
          requiredPartId: input.requiredPartId,
          warrantyType,
          quotationAmount,
          quotationStatus,
          stockStatus: 'PENDING_STOCK',
          allocatedLocationId: lockedRow.ASSIGNED_LOCATION_ID || actor.locationId,
        },
        conn
      );

      // 8. Record audit event
      await serviceRequestEventRepository.createEvent(
        {
          requestId,
          fromState: 'REPAIR_ESCALATED',
          toState: 'ESCALATED_TO_REPLACEMENT',
          eventType: 'ESCALATION_ACCEPTED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ASF',
          remarks: input.technicianRemarks || 'ASF accepted repair escalation; replacement request created in OPEN status.',
          metadataJson: {
            replacementId,
            reasonCode: input.reasonCode,
            warrantyType,
            quotationAmount,
          },
        },
        conn
      );

      // 9. Atomic Commit
      await conn.commit();

      return {
        success: true,
        message: 'Escalation accepted atomically: Original complaint closed as ESCALATED_TO_REPLACEMENT and linked replacement request created in OPEN status.',
        replacement: createdReplacement,
        alreadyAccepted: false,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }
}

export const asfService = new AsfService();
