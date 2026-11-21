import { env } from '../config/env.js';
import { getOracleConnection } from '../database/oraclePool.js';
import { locationRepository } from '../database/repositories/locationRepository.js';
import { notificationRepository } from '../database/repositories/notificationRepository.js';
import { rbacRepository } from '../database/repositories/rbacRepository.js';
import { serviceRequestEventRepository } from '../database/repositories/serviceRequestEventRepository.js';
import { serviceRequestRepository } from '../database/repositories/serviceRequestRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { verificationRepository } from '../database/repositories/verificationRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser } from '../types/auth.js';
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
          throw new AppError('Unauthorized: Field engineers can only regenerate OTP for their own assigned service calls.', 403, 'FORBIDDEN_ROLE');
        }
      }

      if (!isAdmin && actor.locationId && existing.assignedLocationId && existing.assignedLocationId !== actor.locationId) {
        throw new AppError('Cannot regenerate OTP for request assigned to another franchise center', 403, 'FORBIDDEN_LOCATION');
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
          remarks: input.reason || 'Check-In OTP regenerated upon technician or customer request',
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
        message: 'New Check-In OTP generated and SMS acknowledgement sent to customer.',
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
