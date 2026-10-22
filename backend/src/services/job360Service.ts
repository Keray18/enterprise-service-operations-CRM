import crypto from 'crypto';
import oracledb from 'oracledb';
import { getOracleConnection } from '../database/oraclePool.js';
import { attachmentRepository } from '../database/repositories/attachmentRepository.js';
import { cancellationRequestRepository } from '../database/repositories/cancellationRequestRepository.js';
import { customerFeedbackRepository } from '../database/repositories/customerFeedbackRepository.js';
import { engineeringMasterRepository } from '../database/repositories/engineeringMasterRepository.js';
import { notificationRepository } from '../database/repositories/notificationRepository.js';
import { partRepository } from '../database/repositories/partRepository.js';
import { replacementRequestRepository } from '../database/repositories/replacementRequestRepository.js';
import { serviceRequestEventRepository } from '../database/repositories/serviceRequestEventRepository.js';
import { serviceRequestPartsRepository } from '../database/repositories/serviceRequestPartsRepository.js';
import { serviceRequestRepository } from '../database/repositories/serviceRequestRepository.js';
import { verificationRepository } from '../database/repositories/verificationRepository.js';
import { inventoryReservationRepository } from '../database/repositories/inventoryReservationRepository.js';
import { stockDispatchRepository } from '../database/repositories/stockDispatchRepository.js';
import { inventoryRepository } from '../database/repositories/inventoryRepository.js';
import { inventoryMovementRepository } from '../database/repositories/inventoryMovementRepository.js';
import { inventoryService } from './inventoryService.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser } from '../types/auth.js';
import { ServiceRequestStatus, ServiceRequestWithRelationsRecord } from '../types/callCenter.js';
import {
  AddPartInput,
  AttachmentType,
  CancellationReasonCode,
  CreateCancellationRequestInput,
  CreateReplacementRequestInput,
  CustomerEstimateDecisionInput,
  Job360DetailResponse,
  RecordDiagnosisInput,
  RecordRepairInput,
  ReplacementReasonCode,
  ReviewCancellationRequestInput,
  ReviewReplacementRequestInput,
  SpecialPartEstimateInput,
  SubmitFeedbackInput,
  VerifyHappyCodeInput,
} from '../types/job360.js';
import { encryptNotificationPayload, generateHappyCode, generateSalt, hashOtp, verifyOtp } from '../utils/cryptoUtils.js';
import { notificationService } from './notificationService.js';
import { storageService } from './storageService.js';

export class Job360Service {
  /**
   * Helper that strictly enforces:
   * 1. Ticket existence and non-terminal state.
   * 2. Assignment & role scoping (technician must be assigned, or franchise ASF, or ADMIN).
   * 3. MANDATORY CHECK-IN GATE: technician OTP check-in must be verified.
   */
  private async assertTechnicianCheckIn(
    requestId: string,
    actor: AuthenticatedUser,
    conn?: oracledb.Connection
  ): Promise<{
    request: ServiceRequestWithRelationsRecord;
  }> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const request = await serviceRequestRepository.findById(requestId, connection);
      if (!request) {
        throw new AppError(`Service request ${requestId} not found`, 404, 'NOT_FOUND');
      }

      if (['CLOSED', 'CANCELLED', 'REPLACED'].includes(request.status)) {
        throw new AppError(
          `Cannot perform operations on service request in terminal status '${request.status}'`,
          400,
          'TERMINAL_STATUS'
        );
      }

      // Role and assignment scoping
      const isAdmin = actor.roles.includes('ADMIN');
      const isEngineer = actor.roles.includes('ENGINEER');
      const isAsf = actor.roles.includes('ASF');

      if (!isAdmin) {
        if (isEngineer && request.assignedEngineerId !== actor.userId) {
          throw new AppError(
            'Access denied: You are not the assigned field engineer for this ticket',
            403,
            'FORBIDDEN_TECHNICIAN'
          );
        }

        if (isAsf && actor.locationId && request.assignedLocationId !== actor.locationId) {
          throw new AppError(
            'Access denied: Ticket belongs to a different service center location',
            403,
            'FORBIDDEN_LOCATION'
          );
        }

        if (!isEngineer && !isAsf) {
          throw new AppError('Forbidden: Insufficient permissions for field service operations', 403, 'FORBIDDEN');
        }
      }

      // Mandatory Check-In Gate
      const verification = await verificationRepository.findByRequestId(requestId, connection);
      if (!verification || !verification.checkInVerifiedAt) {
        throw new AppError(
          'Technician OTP Check-In must be successfully completed before recording diagnosis, repairs, parts, or evidence.',
          403,
          'CHECK_IN_REQUIRED'
        );
      }

      return { request };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  /**
   * Retrieves the comprehensive Unified Job 360 view including customer, product,
   * verification state, parts, attachments, audit events, and available workflow actions.
   */
  async getJob360Details(idOrJobNumber: string, actor: AuthenticatedUser): Promise<Job360DetailResponse> {
    let request: ServiceRequestWithRelationsRecord | null = null;

    if (idOrJobNumber.includes('-') && idOrJobNumber.length === 36) {
      request = await serviceRequestRepository.findById(idOrJobNumber);
    }
    if (!request) {
      request = await serviceRequestRepository.findByJobNumber(idOrJobNumber);
    }
    if (!request) {
      throw new AppError(`Service request '${idOrJobNumber}' not found`, 404, 'NOT_FOUND');
    }

    // Read access check
    const isAdmin = actor.roles.includes('ADMIN');
    const isEngineer = actor.roles.includes('ENGINEER');
    const isAsf = actor.roles.includes('ASF');
    const isCallCenter = actor.roles.includes('CALL_CENTER');

    if (!isAdmin) {
      if (isEngineer && request.assignedEngineerId !== actor.userId && actor.locationId !== request.assignedLocationId) {
        throw new AppError('Access denied: You cannot view jobs assigned to other technicians', 403, 'FORBIDDEN');
      }
      if (isAsf && actor.locationId && request.assignedLocationId !== actor.locationId) {
        throw new AppError('Access denied: Ticket belongs to a different service center location', 403, 'FORBIDDEN');
      }
      if (!isEngineer && !isAsf && !isCallCenter) {
        throw new AppError('Forbidden: Insufficient permissions to view Job 360', 403, 'FORBIDDEN');
      }
    }

    const requestId = request.requestId;

    // Fetch related records in parallel
    const [
      verification,
      parts,
      attachments,
      events,
      rawNotifications,
      feedback,
      replacementRequest,
      cancellationRequest,
      rawReservations,
      rawDispatches,
    ] = await Promise.all([
      verificationRepository.findByRequestId(requestId),
      serviceRequestPartsRepository.listPartsByRequestId(requestId),
      attachmentRepository.listByRequestId(requestId),
      serviceRequestEventRepository.findByRequestId(requestId),
      notificationRepository.listByRequestId(requestId),
      customerFeedbackRepository.findByRequestId(requestId),
      replacementRequestRepository.findByRequestId(requestId),
      cancellationRequestRepository.findByRequestId(requestId),
      inventoryReservationRepository.findActiveByRequestId(requestId),
      stockDispatchRepository.listDispatches({ requestId, limit: 10 }),
    ]);

    const isCheckedIn = Boolean(verification?.checkInVerifiedAt);
    const reservations = rawReservations || [];
    const dispatches = rawDispatches?.items || [];

    // Sanitize notifications outbox records (remove crypto payloads/keys)
    const sanitizedNotifications = (rawNotifications || []).map((n) => ({
      notificationId: n.notificationId,
      channel: n.channel,
      recipient: n.recipient.replace(/(\d{2})\d{4}(\d{4})/, '$1****$2'),
      templateCode: n.templateCode,
      status: n.status,
      attempts: n.retryCount,
      createdAt: n.createdAt,
      sentAt: n.sentAt,
    }));

    // Dynamic, context-aware workflow action availability
    const status = request.status;
    const canCheckIn = status === 'APPOINTMENT_SCHEDULED' && !isCheckedIn;
    const canDiagnose = isCheckedIn && (status === 'TECHNICIAN_CHECKED_IN' || status === 'IN_PROGRESS_REPAIR');
    const canRecordRepair =
      isCheckedIn && ['IN_PROGRESS_REPAIR', 'PENDING_SPARE_PART', 'SPECIAL_PART_ESTIMATE_PROVIDED'].includes(status);
    const canAddParts =
      isCheckedIn && ['IN_PROGRESS_REPAIR', 'PENDING_SPARE_PART', 'PENDING_SPECIAL_PART_ESTIMATE'].includes(status);
    const canUploadAttachments = isCheckedIn && !['CLOSED', 'CANCELLED', 'REPLACED'].includes(status);
    const canProvideEstimate = status === 'PENDING_SPECIAL_PART_ESTIMATE';
    const canDecideEstimate = status === 'SPECIAL_PART_ESTIMATE_PROVIDED';

    // Phase 2C Actions
    const canInitiateClosure =
      isCheckedIn &&
      status === 'IN_PROGRESS_REPAIR' &&
      Boolean(request.repairAction || request.repairCodeId);
    const canRegenerateHappyCode = status === 'CALL_CLOSURE_SUBMITTED';
    const canVerifyHappyCode = status === 'CALL_CLOSURE_SUBMITTED';
    const canSubmitFeedback = ['CALL_CLOSURE_SUBMITTED', 'CLOSED'].includes(status);
    const canRequestReplacement =
      isCheckedIn && ['IN_PROGRESS_REPAIR', 'PENDING_SPARE_PART', 'TECHNICIAN_CHECKED_IN'].includes(status);
    const canApproveReplacement = status === 'REQUEST_FOR_REPLACEMENT' && isAdmin;
    const canRequestCancellation =
      !['CLOSED', 'CANCELLED', 'REPLACED', 'REQUEST_FOR_CANCELLATION'].includes(status);
    const canApproveCancellation = status === 'REQUEST_FOR_CANCELLATION' && isAdmin;

    return {
      serviceRequest: request,
      verification: {
        isCheckedIn,
        checkedInAt: verification?.checkInVerifiedAt,
        checkInAttempts: verification?.checkInOtpAttempts || 0,
        regeneratedCount: verification?.checkInRegeneratedCount || 0,
        happyCodeRegeneratedCount: verification?.happyCodeRegeneratedCount || 0,
        happyCodeAttempts: verification?.happyCodeAttempts || 0,
        isHappyCodeVerified: Boolean(verification?.happyCodeVerifiedAt),
        happyCodeVerifiedAt: verification?.happyCodeVerifiedAt,
      },
      parts,
      attachments,
      events,
      notifications: sanitizedNotifications,
      feedback: feedback || null,
      replacementRequest: replacementRequest || null,
      cancellationRequest: cancellationRequest || null,
      warehouse: {
        reservations,
        dispatches,
      },
      availableActions: {
        canCheckIn,
        canDiagnose,
        canRecordRepair,
        canAddParts,
        canUploadAttachments,
        canProvideEstimate,
        canDecideEstimate,
        canInitiateClosure,
        canRegenerateHappyCode,
        canVerifyHappyCode,
        canSubmitFeedback,
        canRequestReplacement,
        canApproveReplacement,
        canRequestCancellation,
        canApproveCancellation,
        canFulfillPart: status === 'PENDING_SPARE_PART' && (isAdmin || actor.roles.includes('WAREHOUSE')),
      },
    };
  }

  /**
   * Records technician diagnosis, fault taxonomy, and observations.
   * Transitions ticket to IN_PROGRESS_REPAIR.
   */
  async recordDiagnosis(
    requestId: string,
    input: RecordDiagnosisInput,
    actor: AuthenticatedUser
  ): Promise<ServiceRequestWithRelationsRecord> {
    const conn = await getOracleConnection();

    try {
      const { request } = await this.assertTechnicianCheckIn(requestId, actor, conn);

      if (!['TECHNICIAN_CHECKED_IN', 'IN_PROGRESS_REPAIR'].includes(request.status)) {
        throw new AppError(
          `Diagnosis cannot be recorded while request is in '${request.status}' status.`,
          400,
          'INVALID_STATUS'
        );
      }

      // Validate fault master
      const fault = await engineeringMasterRepository.findFaultById(input.faultId, conn);
      if (!fault || fault.isActive !== 'Y') {
        throw new AppError('Invalid or inactive fault classification master selected.', 400, 'INVALID_FAULT_CODE');
      }

      // Validate defect master if provided
      let defect = null;
      if (input.defectId) {
        defect = await engineeringMasterRepository.findDefectById(input.defectId, conn);
        if (!defect || defect.isActive !== 'Y') {
          throw new AppError('Invalid or inactive defect classification master selected.', 400, 'INVALID_DEFECT_CODE');
        }
      }

      // Update diagnosis fields and state
      await serviceRequestRepository.updateDiagnosis(
        {
          requestId,
          faultId: input.faultId,
          defectId: input.defectId || undefined,
          voeDescription: input.voeDescription,
          observations: input.observations,
          diagnosedBy: actor.userId,
        },
        conn
      );

      // Create immutable lifecycle event
      await serviceRequestEventRepository.createEvent(
        {
          requestId,
          fromState: request.status,
          toState: 'IN_PROGRESS_REPAIR',
          eventType: 'DIAGNOSIS_RECORDED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ENGINEER',
          remarks: `Diagnosis recorded: Fault ${fault.faultCode} - ${fault.faultDescription}${
            defect ? `, Defect: ${defect.defectCode}` : ''
          }`,
          metadataJson: {
            faultId: fault.faultId,
            faultCode: fault.faultCode,
            defectId: defect?.defectId,
            defectCode: defect?.defectCode,
            voeDescription: input.voeDescription,
            observations: input.observations,
            physicalSerialVerified: input.physicalSerialVerified ?? true,
          },
        },
        conn
      );

      await conn.commit();

      const updated = await serviceRequestRepository.findById(requestId);
      return updated!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Records the repair action outcome, validates part requirements,
   * and executes the state transition atomically.
   */
  async recordRepair(
    requestId: string,
    input: RecordRepairInput,
    actor: AuthenticatedUser
  ): Promise<ServiceRequestWithRelationsRecord> {
    const conn = await getOracleConnection();

    try {
      const { request } = await this.assertTechnicianCheckIn(requestId, actor, conn);

      if (!['IN_PROGRESS_REPAIR', 'PENDING_SPARE_PART', 'SPECIAL_PART_ESTIMATE_PROVIDED'].includes(request.status)) {
        throw new AppError(
          `Repair action cannot be recorded while request is in '${request.status}' status.`,
          400,
          'INVALID_STATUS'
        );
      }

      // Validate repair code master
      const repairCode = await engineeringMasterRepository.findRepairCodeById(input.repairCodeId, conn);
      if (!repairCode || repairCode.isActive !== 'Y') {
        throw new AppError('Invalid or inactive repair code master selected.', 400, 'INVALID_REPAIR_CODE');
      }

      // Determine target status and enforce outcome rules
      let targetStatus: ServiceRequestStatus;

      switch (input.repairAction) {
        case 'REPAIRED_WITHOUT_PART':
          targetStatus = 'CALL_CLOSURE_SUBMITTED';
          break;

        case 'REPAIRED_WITH_PART':
        case 'REPAIRED_WITH_CONSUMABLE': {
          targetStatus = 'CALL_CLOSURE_SUBMITTED';
          // Verify that parts have been recorded
          const parts = await serviceRequestPartsRepository.listPartsByRequestId(requestId, conn);
          const activeParts = parts.filter((p) => p.status !== 'CANCELLED');
          if (activeParts.length === 0) {
            throw new AppError(
              'Cannot record repair with part/consumable without recording at least one part entry on the job.',
              400,
              'PARTS_REQUIRED'
            );
          }
          break;
        }

        case 'PENDING_SPARE_PART':
          targetStatus = 'PENDING_SPARE_PART';
          break;

        case 'PENDING_SPECIAL_PART_ESTIMATE':
          targetStatus = 'PENDING_SPECIAL_PART_ESTIMATE';
          break;

        case 'REQUEST_REPLACEMENT':
          if (!input.replacementReason?.trim()) {
            throw new AppError('Replacement reason is mandatory when requesting replacement.', 400, 'REASON_REQUIRED');
          }
          targetStatus = 'REQUEST_FOR_REPLACEMENT';
          break;

        case 'REQUEST_CANCELLATION':
          if (!input.cancellationReason?.trim()) {
            throw new AppError('Cancellation reason is mandatory when requesting cancellation.', 400, 'REASON_REQUIRED');
          }
          targetStatus = 'REQUEST_FOR_CANCELLATION';
          break;

        default:
          throw new AppError(`Unsupported repair action '${input.repairAction}'`, 400, 'INVALID_REPAIR_ACTION');
      }

      // Update repair fields and state
      await serviceRequestRepository.updateRepairAction(
        {
          requestId,
          targetStatus,
          repairCodeId: input.repairCodeId,
          repairAction: input.repairAction,
          repairRemarks: input.repairRemarks,
          repairAt: input.repairAt,
          replacementReason: input.replacementReason,
          replacementRemarks: input.replacementRemarks,
          cancellationReason: input.cancellationReason,
          cancellationRemarks: input.cancellationRemarks,
          specialPartRemarks: input.specialPartRemarks,
          repairedBy: actor.userId,
        },
        conn
      );

      // Create immutable lifecycle event
      await serviceRequestEventRepository.createEvent(
        {
          requestId,
          fromState: request.status,
          toState: targetStatus,
          eventType: 'REPAIR_ACTION_RECORDED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ENGINEER',
          remarks: `Repair outcome: ${input.repairAction} (Code: ${repairCode.repairCode} - ${repairCode.repairAction})`,
          metadataJson: {
            repairCodeId: repairCode.repairCodeId,
            repairCode: repairCode.repairCode,
            repairAction: input.repairAction,
            targetStatus,
            repairRemarks: input.repairRemarks,
            replacementReason: input.replacementReason,
            cancellationReason: input.cancellationReason,
            specialPartRemarks: input.specialPartRemarks,
          },
        },
        conn
      );

      await conn.commit();

      const updated = await serviceRequestRepository.findById(requestId);
      return updated!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Adds a spare part or consumable to the job with server-side price validation
   * and recalculation of chargeable customer totals.
   */
  async addPartToJob(
    requestId: string,
    input: AddPartInput,
    actor: AuthenticatedUser
  ): Promise<{ partEntryId: string; partsTotalCharge: number }> {
    const conn = await getOracleConnection();

    try {
      const { request } = await this.assertTechnicianCheckIn(requestId, actor, conn);

      if (!['IN_PROGRESS_REPAIR', 'PENDING_SPARE_PART', 'PENDING_SPECIAL_PART_ESTIMATE'].includes(request.status)) {
        throw new AppError(
          `Parts cannot be added while request is in '${request.status}' status.`,
          400,
          'INVALID_STATUS'
        );
      }

      // Validate part code exists and is active
      const part = await partRepository.findById(input.partId, conn);
      if (!part || part.isActive !== 'Y') {
        throw new AppError('Invalid or inactive part code selected.', 400, 'INVALID_PART_CODE');
      }

      // Check brand compatibility if brand is defined on both
      if (part.brandId && request.brandId && part.brandId !== request.brandId) {
        throw new AppError(
          `Part '${part.partCode}' belongs to brand '${part.brandName || part.brandId}' which is incompatible with this product.`,
          400,
          'PART_BRAND_MISMATCH'
        );
      }

      // Server-side price resolution and decimal safety
      const unitPrice = part.customerPrice > 0 ? part.customerPrice : part.locationPrice > 0 ? part.locationPrice : 0;
      const isChargeableToCustomer =
        input.isChargeableToCustomer !== undefined
          ? input.isChargeableToCustomer
            ? 'Y'
            : 'N'
          : request.warrantyStatus === 'OUT_OF_WARRANTY'
            ? 'Y'
            : 'N';

      const totalPrice = Math.round(unitPrice * input.quantity * 100) / 100;
      const entryType = input.entryType || 'USED';

      const partEntryId = await serviceRequestPartsRepository.addPart(
        {
          requestId,
          partId: input.partId,
          quantity: input.quantity,
          partConsumptionNo: input.partConsumptionNo,
          defectiveSerialNo: input.defectiveSerialNo,
          newPartSerialNo: input.newPartSerialNo,
          isChargeableToCustomer,
          unitPrice,
          totalPrice,
          entryType,
          remarks: input.remarks,
          actorUsername: actor.username,
        },
        conn
      );

      // Recalculate chargeable parts total server-side
      const totals = await serviceRequestPartsRepository.calculatePartsTotal(requestId, conn);
      await serviceRequestRepository.updateFinancialCharges(
        {
          requestId,
          partsTotalCharge: totals.partsTotalCharge,
        },
        conn
      );

      // Audit event
      await serviceRequestEventRepository.createEvent(
        {
          requestId,
          fromState: request.status,
          toState: request.status,
          eventType: 'PART_RECORDED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ENGINEER',
          remarks: `Part added: ${part.partCode} (${part.partName}) x ${input.quantity} [${entryType}]`,
          metadataJson: {
            partEntryId,
            partId: part.partId,
            partCode: part.partCode,
            quantity: input.quantity,
            unitPrice,
            totalPrice,
            isChargeableToCustomer,
            entryType,
          },
        },
        conn
      );

      await conn.commit();

      return {
        partEntryId,
        partsTotalCharge: totals.partsTotalCharge,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Removes a draft part entry and recalculates chargeable totals.
   */
  async removePartFromJob(
    requestId: string,
    partEntryId: string,
    actor: AuthenticatedUser
  ): Promise<{ success: boolean; partsTotalCharge: number }> {
    const conn = await getOracleConnection();

    try {
      const { request } = await this.assertTechnicianCheckIn(requestId, actor, conn);

      if (!['IN_PROGRESS_REPAIR', 'PENDING_SPARE_PART', 'PENDING_SPECIAL_PART_ESTIMATE'].includes(request.status)) {
        throw new AppError(
          `Parts cannot be removed while request is in '${request.status}' status.`,
          400,
          'INVALID_STATUS'
        );
      }

      // Check and release active reservation if one exists for this part entry
      const activeRes = await inventoryReservationRepository.findActiveByPartEntryId(partEntryId, conn);
      if (activeRes) {
        await inventoryRepository.upsertBalanceDeltas(
          {
            locationId: activeRes.locationId,
            partId: activeRes.partId,
            deltaReserved: -activeRes.quantity,
          },
          conn
        );
        await inventoryReservationRepository.releaseReservation(activeRes.reservationId, 'Part removed from job requirement', conn);
        await inventoryMovementRepository.recordMovement(
          {
            locationId: activeRes.locationId,
            partId: activeRes.partId,
            movementType: 'RESERVATION_RELEASE',
            stockBucket: 'RESERVED',
            quantity: -activeRes.quantity,
            balanceBefore: activeRes.quantity,
            balanceAfter: 0,
            referenceType: 'SERVICE_REQUEST',
            referenceId: request.jobNumber || requestId,
            actorId: actor.userId,
            actorUsername: actor.username,
            remarks: 'Reservation released because part requirement was removed from job',
          },
          conn
        );
      }

      const deleted = await serviceRequestPartsRepository.deletePart(partEntryId, requestId, conn);
      if (!deleted) {
        throw new AppError('Part entry not found or already removed.', 404, 'NOT_FOUND');
      }

      // Recalculate totals
      const totals = await serviceRequestPartsRepository.calculatePartsTotal(requestId, conn);
      await serviceRequestRepository.updateFinancialCharges(
        {
          requestId,
          partsTotalCharge: totals.partsTotalCharge,
        },
        conn
      );

      // Audit event
      await serviceRequestEventRepository.createEvent(
        {
          requestId,
          fromState: request.status,
          toState: request.status,
          eventType: 'PART_REMOVED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ENGINEER',
          remarks: `Part entry ${partEntryId} removed from job`,
          metadataJson: {
            partEntryId,
            newPartsTotal: totals.partsTotalCharge,
          },
        },
        conn
      );

      await conn.commit();

      return {
        success: true,
        partsTotalCharge: totals.partsTotalCharge,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Records warehouse special-part quotation amount and moves ticket to SPECIAL_PART_ESTIMATE_PROVIDED.
   */
  async provideSpecialPartEstimate(
    requestId: string,
    input: SpecialPartEstimateInput,
    actor: AuthenticatedUser
  ): Promise<ServiceRequestWithRelationsRecord> {
    const conn = await getOracleConnection();

    try {
      const request = await serviceRequestRepository.findById(requestId, conn);
      if (!request) {
        throw new AppError(`Service request ${requestId} not found`, 404, 'NOT_FOUND');
      }

      if (request.status !== 'PENDING_SPECIAL_PART_ESTIMATE') {
        throw new AppError(
          `Quotation can only be provided when status is 'PENDING_SPECIAL_PART_ESTIMATE' (current: '${request.status}')`,
          400,
          'INVALID_STATUS'
        );
      }

      await serviceRequestRepository.updateSpecialPartQuotation(
        {
          requestId,
          estimateAmount: input.estimateAmount,
          remarks: input.remarks,
        },
        conn
      );

      await serviceRequestEventRepository.createEvent(
        {
          requestId,
          fromState: 'PENDING_SPECIAL_PART_ESTIMATE',
          toState: 'SPECIAL_PART_ESTIMATE_PROVIDED',
          eventType: 'SPECIAL_PART_ESTIMATE_QUOTED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ADMIN',
          remarks: `Special part quotation provided: ₹${input.estimateAmount}`,
          metadataJson: {
            estimateAmount: input.estimateAmount,
            remarks: input.remarks,
          },
        },
        conn
      );

      await conn.commit();

      const updated = await serviceRequestRepository.findById(requestId);
      return updated!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Records customer decision on a special-part estimate quotation.
   * If APPROVED -> IN_PROGRESS_REPAIR. If REJECTED -> REQUEST_FOR_CANCELLATION.
   */
  async customerEstimateDecision(
    requestId: string,
    input: CustomerEstimateDecisionInput,
    actor: AuthenticatedUser
  ): Promise<ServiceRequestWithRelationsRecord> {
    const conn = await getOracleConnection();

    try {
      const request = await serviceRequestRepository.findById(requestId, conn);
      if (!request) {
        throw new AppError(`Service request ${requestId} not found`, 404, 'NOT_FOUND');
      }

      if (request.status !== 'SPECIAL_PART_ESTIMATE_PROVIDED') {
        throw new AppError(
          `Customer decision can only be recorded when status is 'SPECIAL_PART_ESTIMATE_PROVIDED' (current: '${request.status}')`,
          400,
          'INVALID_STATUS'
        );
      }

      const targetStatus: ServiceRequestStatus =
        input.decision === 'APPROVED' ? 'IN_PROGRESS_REPAIR' : 'REQUEST_FOR_CANCELLATION';

      await serviceRequestRepository.updateSpecialPartDecision(
        {
          requestId,
          targetStatus,
          approvedBy: actor.username,
        },
        conn
      );

      await serviceRequestEventRepository.createEvent(
        {
          requestId,
          fromState: 'SPECIAL_PART_ESTIMATE_PROVIDED',
          toState: targetStatus,
          eventType: 'SPECIAL_PART_ESTIMATE_DECIDED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ENGINEER',
          remarks: `Customer decision on special part estimate: ${input.decision}`,
          metadataJson: {
            decision: input.decision,
            customerRemarks: input.customerRemarks,
          },
        },
        conn
      );

      await conn.commit();

      const updated = await serviceRequestRepository.findById(requestId);
      return updated!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Securely saves an evidence attachment to private storage and logs metadata & audit events.
   */
  async uploadAttachment(
    requestId: string,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
    attachmentType: AttachmentType,
    actor: AuthenticatedUser
  ) {
    const { request } = await this.assertTechnicianCheckIn(requestId, actor);

    if (['CLOSED', 'CANCELLED', 'REPLACED'].includes(request.status)) {
      throw new AppError('Cannot upload evidence to closed or cancelled requests.', 400, 'INVALID_STATUS');
    }

    // Save to private storage with path traversal defense & MIME verification
    const stored = await storageService.saveFile(file);

    // Save metadata in Oracle
    const attachment = await attachmentRepository.createAttachment({
      requestId,
      attachmentType,
      fileName: stored.fileName,
      originalName: stored.originalName,
      storedPath: stored.storedPath,
      mimeType: stored.mimeType,
      fileSizeBytes: stored.fileSizeBytes,
      sha256Checksum: stored.sha256Checksum,
      uploadedByUserId: actor.userId,
      uploadedByUsername: actor.username,
    });

    // Record immutable audit event
    const conn = await getOracleConnection();
    try {
      await serviceRequestEventRepository.createEvent(
        {
          requestId,
          fromState: request.status,
          toState: request.status,
          eventType: 'ATTACHMENT_UPLOADED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ENGINEER',
          remarks: `Evidence uploaded: ${attachmentType} (${stored.originalName})`,
          metadataJson: {
            attachmentId: attachment.attachmentId,
            attachmentType,
            originalName: stored.originalName,
            size: stored.fileSizeBytes,
            sha256: stored.sha256Checksum,
          },
        },
        conn
      );
      await conn.commit();
    } finally {
      await conn.close();
    }

    return attachment;
  }

  /**
   * Retrieves a secure readable file stream for an authorized user.
   */
  async getAttachmentStream(attachmentId: string, actor: AuthenticatedUser) {
    const attachment = await attachmentRepository.findById(attachmentId);
    if (!attachment) {
      throw new AppError('Attachment not found', 404, 'NOT_FOUND');
    }

    const request = await serviceRequestRepository.findById(attachment.requestId);
    if (!request) {
      throw new AppError('Service request not found', 404, 'NOT_FOUND');
    }

    // Authorization check
    const isAdmin = actor.roles.includes('ADMIN');
    const isEngineer = actor.roles.includes('ENGINEER');
    const isAsf = actor.roles.includes('ASF');
    const isCallCenter = actor.roles.includes('CALL_CENTER');

    if (!isAdmin) {
      if (isEngineer && request.assignedEngineerId !== actor.userId && actor.locationId !== request.assignedLocationId) {
        throw new AppError('Access denied to evidence on this ticket', 403, 'FORBIDDEN');
      }
      if (isAsf && actor.locationId && request.assignedLocationId !== actor.locationId) {
        throw new AppError('Access denied: Ticket belongs to a different service center location', 403, 'FORBIDDEN');
      }
      if (!isEngineer && !isAsf && !isCallCenter) {
        throw new AppError('Forbidden: Insufficient permissions to view evidence', 403, 'FORBIDDEN');
      }
    }

    const fileStream = await storageService.getFileStream(attachment.storedPath);
    return {
      stream: fileStream.stream,
      size: fileStream.size,
      mimeType: attachment.mimeType,
      originalName: attachment.originalName,
    };
  }

  /**
   * Deletes an attachment and its disk file.
   */
  async deleteAttachment(attachmentId: string, actor: AuthenticatedUser) {
    const attachment = await attachmentRepository.findById(attachmentId);
    if (!attachment) {
      throw new AppError('Attachment not found', 404, 'NOT_FOUND');
    }

    const { request } = await this.assertTechnicianCheckIn(attachment.requestId, actor);

    if (['CLOSED', 'CANCELLED', 'REPLACED'].includes(request.status)) {
      throw new AppError('Cannot delete evidence from closed or cancelled requests.', 400, 'INVALID_STATUS');
    }

    await attachmentRepository.deleteAttachment(attachmentId);
    await storageService.deleteFile(attachment.storedPath);

    // Audit event
    const conn = await getOracleConnection();
    try {
      await serviceRequestEventRepository.createEvent(
        {
          requestId: attachment.requestId,
          fromState: request.status,
          toState: request.status,
          eventType: 'ATTACHMENT_DELETED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ENGINEER',
          remarks: `Evidence deleted: ${attachment.attachmentType} (${attachment.originalName})`,
          metadataJson: {
            attachmentId,
            attachmentType: attachment.attachmentType,
            originalName: attachment.originalName,
          },
        },
        conn
      );
      await conn.commit();
    } finally {
      await conn.close();
    }

    return { success: true };
  }

  // ==========================================
  // Phase 2C: Closure, Feedback, Replacement & Cancellation
  // ==========================================

  /**
   * Initiates call closure when on-site repair is completed.
   * Generates a 6-digit Happy Code, encrypts and queues SMS 4 in outbox,
   * and transitions request status to CALL_CLOSURE_SUBMITTED.
   */
  async initiateClosure(
    requestId: string,
    actor: AuthenticatedUser,
    remarks?: string
  ): Promise<{ success: boolean; message: string; status: ServiceRequestStatus }> {
    const { request } = await this.assertTechnicianCheckIn(requestId, actor);

    if (request.status !== 'IN_PROGRESS_REPAIR') {
      throw new AppError(
        `Cannot initiate closure: Service request is in '${request.status}' status. Must be 'IN_PROGRESS_REPAIR'.`,
        400,
        'INVALID_STATE'
      );
    }

    if (!request.repairAction && !request.repairCodeId) {
      throw new AppError(
        'Repair action or repair code must be recorded before submitting call closure.',
        400,
        'REPAIR_ACTION_REQUIRED'
      );
    }

    const conn = await getOracleConnection();
    try {
      // Concurrency lock
      const checkSql = `SELECT STATUS, VERSION_NO FROM SERVICE_REQUESTS WHERE REQUEST_ID = :requestId FOR UPDATE`;
      const lockRes = await conn.execute<any>(checkSql, { requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!lockRes.rows || lockRes.rows.length === 0) {
        throw new AppError(`Service request ${requestId} not found`, 404, 'NOT_FOUND');
      }

      const currentStatus = lockRes.rows[0].STATUS;
      if (currentStatus !== 'IN_PROGRESS_REPAIR') {
        throw new AppError(
          `Conflict: Service request status changed to '${currentStatus}' concurrently`,
          409,
          'CONCURRENCY_CONFLICT'
        );
      }

      // Generate 6-digit Happy Code and Salt
      const happyCode = generateHappyCode();
      const salt = generateSalt(16);
      const happyCodeHash = hashOtp({
        otp: happyCode,
        salt,
        requestId,
        purpose: 'HAPPY_CODE',
      });
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000); // 24-hour validity

      // Store in SERVICE_REQUEST_VERIFICATIONS
      await verificationRepository.upsertHappyCode(
        {
          requestId,
          happyCodeHash,
          salt,
          expiresAt,
        },
        conn
      );

      // Transition STATUS to CALL_CLOSURE_SUBMITTED
      await serviceRequestRepository.updateStatus(requestId, 'CALL_CLOSURE_SUBMITTED', conn);

      // Create Immutable Lifecycle Event
      await serviceRequestEventRepository.createEvent(
        {
          requestId,
          fromState: currentStatus,
          toState: 'CALL_CLOSURE_SUBMITTED',
          eventType: 'CALL_CLOSURE_SUBMITTED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ENGINEER',
          remarks: remarks || 'Repair work completed. Call closure submitted. SMS 4 Happy Code issued to customer.',
          metadataJson: {
            repairAction: request.repairAction,
            repairCodeId: request.repairCodeId,
            expiresAt: expiresAt.toISOString(),
          },
        },
        conn
      );

      // Build & Encrypt SMS 4 Call Closure Summary
      const smsBody = notificationService.buildSms4Message({
        jobNumber: request.jobNumber,
        happyCode,
      });
      const encrypted = encryptNotificationPayload(smsBody);

      const outboxRecord = await notificationRepository.enqueueNotification(
        {
          requestId,
          recipient: request.customerPhone || '9999999999',
          channel: 'SMS',
          templateCode: 'SMS_4_CALL_CLOSURE',
          messageBody: 'Dear Customer, Your service Request is closed. Kindly share the confidential Happy Code sent via SMS with our technician.',
          isEncrypted: 'Y',
          encryptedPayload: encrypted.encryptedPayload,
          encryptionIv: encrypted.iv,
          authTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
        },
        conn
      );

      await conn.commit();

      // Asynchronously trigger notification delivery via SMS adapter
      notificationService.processNotification(outboxRecord).catch(() => {});

      return {
        success: true,
        message: 'Repair work marked complete. Happy Code generated and dispatched to customer via SMS 4.',
        status: 'CALL_CLOSURE_SUBMITTED',
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Regenerates a customer Happy Code (SMS 5) when customer did not receive SMS 4.
   */
  async regenerateHappyCode(
    requestId: string,
    actor: AuthenticatedUser
  ): Promise<{ success: boolean; message: string }> {
    const { request } = await this.assertTechnicianCheckIn(requestId, actor);

    if (request.status !== 'CALL_CLOSURE_SUBMITTED') {
      throw new AppError(
        `Happy Code can only be regenerated when ticket is in 'CALL_CLOSURE_SUBMITTED' status (current: '${request.status}')`,
        400,
        'INVALID_STATE'
      );
    }

    const verification = await verificationRepository.findByRequestId(requestId);
    if (!verification) {
      throw new AppError('No verification record found. Please initiate closure first.', 400, 'NO_VERIFICATION_RECORD');
    }

    if (verification.happyCodeRegeneratedCount >= 5) {
      throw new AppError(
        'Maximum Happy Code regeneration limit (5) reached. Please contact supervisor.',
        429,
        'RATE_LIMIT_EXCEEDED'
      );
    }

    const conn = await getOracleConnection();
    try {
      // Concurrency lock
      const checkSql = `SELECT STATUS FROM SERVICE_REQUESTS WHERE REQUEST_ID = :requestId FOR UPDATE`;
      const lockRes = await conn.execute<any>(checkSql, { requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!lockRes.rows || lockRes.rows.length === 0) {
        throw new AppError(`Service request ${requestId} not found`, 404, 'NOT_FOUND');
      }

      if (lockRes.rows[0].STATUS !== 'CALL_CLOSURE_SUBMITTED') {
        throw new AppError(
          `Conflict: Service request status changed concurrently to '${lockRes.rows[0].STATUS}'`,
          409,
          'CONCURRENCY_CONFLICT'
        );
      }

      const happyCode = generateHappyCode();
      const newSalt = generateSalt(16);
      const newHappyCodeHash = hashOtp({
        otp: happyCode,
        salt: newSalt,
        requestId,
        purpose: 'HAPPY_CODE',
      });
      const newExpiresAt = new Date(Date.now() + 24 * 3600 * 1000);

      await verificationRepository.recordHappyCodeRegeneration(
        {
          requestId,
          newHappyCodeHash,
          newSalt,
          newExpiresAt,
        },
        conn
      );

      // Append lifecycle event
      await serviceRequestEventRepository.createEvent(
        {
          requestId,
          fromState: 'CALL_CLOSURE_SUBMITTED',
          toState: 'CALL_CLOSURE_SUBMITTED',
          eventType: 'HAPPY_CODE_REGENERATED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ENGINEER',
          remarks: 'Happy Code regenerated by technician. SMS 5 dispatched to customer.',
          metadataJson: {
            regenerationCount: verification.happyCodeRegeneratedCount + 1,
            expiresAt: newExpiresAt.toISOString(),
          },
        },
        conn
      );

      // Build & Encrypt SMS 5 Happy Code Regeneration template
      const smsBody = notificationService.buildSms5Message({
        jobNumber: request.jobNumber,
        happyCode,
      });
      const encrypted = encryptNotificationPayload(smsBody);

      const outboxRecord = await notificationRepository.enqueueNotification(
        {
          requestId,
          recipient: request.customerPhone || '9999999999',
          channel: 'SMS',
          templateCode: 'SMS_5_REGENERATE_HAPPY_CODE',
          messageBody: 'Dear Customer, Your confidential Happy Code has been regenerated. Kindly share it with the service technician.',
          isEncrypted: 'Y',
          encryptedPayload: encrypted.encryptedPayload,
          encryptionIv: encrypted.iv,
          authTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
        },
        conn
      );

      await conn.commit();

      // Trigger async dispatch
      notificationService.processNotification(outboxRecord).catch(() => {});

      return {
        success: true,
        message: 'Happy Code regenerated and dispatched to customer via SMS 5.',
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Verifies the customer-shared Happy Code and permanently closes the service call.
   * Also supports documented Supervisor Override with mandatory justification.
   */
  async verifyHappyCodeAndClose(
    requestId: string,
    input: VerifyHappyCodeInput,
    actor: AuthenticatedUser
  ): Promise<{ success: boolean; message: string; status: ServiceRequestStatus }> {
    const { request } = await this.assertTechnicianCheckIn(requestId, actor);

    if (request.status === 'CLOSED') {
      throw new AppError('Service request is already closed', 409, 'ALREADY_CLOSED');
    }

    if (request.status !== 'CALL_CLOSURE_SUBMITTED') {
      throw new AppError(
        `Cannot verify Happy Code: Service request must be in 'CALL_CLOSURE_SUBMITTED' status (current: '${request.status}')`,
        400,
        'INVALID_STATE'
      );
    }

    const verification = await verificationRepository.findByRequestId(requestId);
    if (!verification || !verification.happyCodeHash) {
      throw new AppError('No active Happy Code challenge found. Please initiate closure first.', 400, 'NO_ACTIVE_CODE');
    }

    // Supervisor Override validation
    if (input.isSupervisorOverride) {
      const isSupervisor = actor.roles.includes('ADMIN') || actor.permissions.includes('calls:close');
      if (!isSupervisor) {
        throw new AppError(
          'Forbidden: Only authorized supervisors or administrators can execute a supervisor override closure.',
          403,
          'FORBIDDEN_OVERRIDE'
        );
      }
      if (!input.overrideReason || input.overrideReason.trim().length < 10) {
        throw new AppError(
          'Written supervisor override justification (minimum 10 characters) is required for override closure.',
          400,
          'OVERRIDE_REASON_REQUIRED'
        );
      }
    } else {
      // Standard Happy Code verification
      if (!input.happyCode || !/^\d{6}$/.test(input.happyCode.trim())) {
        throw new AppError('A valid 6-digit numeric Happy Code is required', 400, 'INVALID_FORMAT');
      }

      if (verification.happyCodeAttempts >= 5) {
        throw new AppError(
          'Happy Code verification attempt limit exceeded (5 failed attempts). Please regenerate a new Happy Code.',
          429,
          'HAPPY_CODE_LOCKED'
        );
      }

      if (verification.happyCodeExpiresAt && new Date() > verification.happyCodeExpiresAt) {
        throw new AppError('Happy Code has expired. Please regenerate a new code via SMS 5.', 400, 'HAPPY_CODE_EXPIRED');
      }

      const isValid = verifyOtp({
        providedOtp: input.happyCode.trim(),
        salt: verification.happyCodeSalt || '',
        requestId,
        expectedHash: verification.happyCodeHash || '',
        purpose: 'HAPPY_CODE',
      });

      if (!isValid) {
        const newAttempts = await verificationRepository.incrementHappyCodeAttempts(requestId);
        const remaining = Math.max(0, 5 - newAttempts);
        throw new AppError(
          `Invalid Happy Code. ${remaining} attempt(s) remaining before code lockout.`,
          400,
          'INVALID_HAPPY_CODE'
        );
      }
    }

    const conn = await getOracleConnection();
    try {
      // Concurrency lock
      const checkSql = `SELECT STATUS FROM SERVICE_REQUESTS WHERE REQUEST_ID = :requestId FOR UPDATE`;
      const lockRes = await conn.execute<any>(checkSql, { requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!lockRes.rows || lockRes.rows.length === 0) {
        throw new AppError(`Service request ${requestId} not found`, 404, 'NOT_FOUND');
      }

      if (lockRes.rows[0].STATUS !== 'CALL_CLOSURE_SUBMITTED') {
        throw new AppError(
          `Conflict: Service request status changed concurrently to '${lockRes.rows[0].STATUS}'`,
          409,
          'CONCURRENCY_CONFLICT'
        );
      }

      // Mark Happy Code consumed
      if (!input.isSupervisorOverride) {
        await verificationRepository.markHappyCodeVerified(requestId, conn);
      }

      // Permanently Close Service Request
      await serviceRequestRepository.closeServiceRequest(
        {
          requestId,
          closedBy: actor.userId,
          supervisorOverrideReason: input.isSupervisorOverride ? input.overrideReason : undefined,
        },
        conn
      );

      // Record Customer Feedback if provided
      if (input.feedback) {
        await customerFeedbackRepository.createFeedback(
          {
            feedbackId: crypto.randomUUID(),
            requestId,
            rating: input.feedback.rating,
            feedbackRemarks: input.feedback.feedbackRemarks,
            qualityAnalysis: input.feedback.qualityAnalysis,
            submittedBy: actor.userId,
          },
          conn
        );
      }

      // Append immutable lifecycle audit event
      await serviceRequestEventRepository.createEvent(
        {
          requestId,
          fromState: 'CALL_CLOSURE_SUBMITTED',
          toState: 'CLOSED',
          eventType: input.isSupervisorOverride ? 'CLOSED_SUPERVISOR_OVERRIDE' : 'CLOSED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ENGINEER',
          remarks: input.isSupervisorOverride
            ? `Call closed via Supervisor Override: ${input.overrideReason}`
            : 'Happy Code verified successfully. Service call permanently closed.',
          metadataJson: {
            closedAt: new Date().toISOString(),
            isSupervisorOverride: Boolean(input.isSupervisorOverride),
            overrideReason: input.overrideReason,
            feedbackRating: input.feedback?.rating,
          },
        },
        conn
      );

      await conn.commit();

      return {
        success: true,
        message: input.isSupervisorOverride
          ? 'Service request closed via authorized supervisor override.'
          : 'Happy Code verified successfully. Service request closed.',
        status: 'CLOSED',
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Records or updates CSAT and quality feedback for a service call.
   */
  async submitFeedback(
    requestId: string,
    input: SubmitFeedbackInput,
    actor: AuthenticatedUser
  ): Promise<{ success: boolean; message: string }> {
    const request = await serviceRequestRepository.findById(requestId);
    if (!request) {
      throw new AppError(`Service request ${requestId} not found`, 404, 'NOT_FOUND');
    }

    if (!['CALL_CLOSURE_SUBMITTED', 'CLOSED'].includes(request.status)) {
      throw new AppError(
        `Customer feedback can only be submitted for completed service calls (current status: '${request.status}')`,
        400,
        'INVALID_STATUS'
      );
    }

    const existingFeedback = await customerFeedbackRepository.findByRequestId(requestId);
    if (existingFeedback) {
      throw new AppError('Customer feedback has already been submitted for this service call', 409, 'DUPLICATE_FEEDBACK');
    }

    const conn = await getOracleConnection();
    try {
      await customerFeedbackRepository.createFeedback(
        {
          feedbackId: crypto.randomUUID(),
          requestId,
          rating: input.rating,
          feedbackRemarks: input.feedbackRemarks,
          qualityAnalysis: input.qualityAnalysis,
          submittedBy: actor.userId,
        },
        conn
      );

      await serviceRequestEventRepository.createEvent(
        {
          requestId,
          fromState: request.status,
          toState: request.status,
          eventType: 'FEEDBACK_SUBMITTED',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'CALL_CENTER',
          remarks: `Customer feedback recorded: Rating ${input.rating}/5 stars`,
          metadataJson: {
            rating: input.rating,
            remarks: input.feedbackRemarks,
            qualityAnalysis: input.qualityAnalysis,
          },
        },
        conn
      );

      await conn.commit();
      return { success: true, message: 'Customer feedback successfully recorded' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Submits a formal request for product replacement based on the 6 documented reasons.
   */
  async requestReplacement(
    requestId: string,
    input: CreateReplacementRequestInput,
    actor: AuthenticatedUser
  ): Promise<{ success: boolean; message: string; status: ServiceRequestStatus; replacementId?: string }> {
    const { request } = await this.assertTechnicianCheckIn(requestId, actor);

    if (['CLOSED', 'CANCELLED', 'REPLACED', 'REQUEST_FOR_REPLACEMENT', 'REPLACEMENT_APPROVED'].includes(request.status)) {
      throw new AppError(
        `Cannot request replacement for ticket in status '${request.status}'`,
        400,
        'INVALID_STATUS'
      );
    }

    const REPLACEMENT_REASONS: Record<ReplacementReasonCode, string> = {
      REASON_1: 'Spare part not received / service not completed within 168 Hours (7 Days)',
      REASON_2: 'New piece damaged out of the box (Dead on Arrival / DOA)',
      REASON_3: 'Customer refused repair due to recurring product quality failure',
      REASON_4: 'Product model discontinued by brand manufacturer and spare parts unavailable',
      REASON_5: 'Product non-repairable (severe electrical burnout or unserviceable structural damage)',
      REASON_6: 'Complaint not acknowledged by assigned ASF within 48 hours (debited to ASF)',
    };

    const reasonDescription = REPLACEMENT_REASONS[input.reasonCode];
    if (!reasonDescription) {
      throw new AppError(`Invalid replacement reason code '${input.reasonCode}'`, 400, 'INVALID_REASON');
    }

    const conn = await getOracleConnection();
    try {
      const checkSql = `SELECT STATUS FROM SERVICE_REQUESTS WHERE REQUEST_ID = :requestId FOR UPDATE`;
      const lockRes = await conn.execute<any>(checkSql, { requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!lockRes.rows || lockRes.rows.length === 0) {
        throw new AppError(`Service request ${requestId} not found`, 404, 'NOT_FOUND');
      }

      const currentStatus = lockRes.rows[0].STATUS;
      if (['CLOSED', 'CANCELLED', 'REPLACED', 'REQUEST_FOR_REPLACEMENT'].includes(currentStatus)) {
        throw new AppError(
          `Conflict: Service request status changed concurrently to '${currentStatus}'`,
          409,
          'CONCURRENCY_CONFLICT'
        );
      }

      const replacementId = crypto.randomUUID();
      await replacementRequestRepository.createRequest(
        {
          replacementId,
          requestId,
          reasonCode: input.reasonCode,
          reasonDescription,
          technicianRemarks: input.technicianRemarks,
          requestedBy: actor.userId,
        },
        conn
      );

      await serviceRequestRepository.updateStatus(requestId, 'REQUEST_FOR_REPLACEMENT', conn);

      await serviceRequestEventRepository.createEvent(
        {
          requestId,
          fromState: currentStatus,
          toState: 'REQUEST_FOR_REPLACEMENT',
          eventType: 'REQUEST_FOR_REPLACEMENT',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'ENGINEER',
          remarks: `Replacement requested: [${input.reasonCode}] ${reasonDescription}`,
          metadataJson: {
            replacementId,
            reasonCode: input.reasonCode,
            technicianRemarks: input.technicianRemarks,
          },
        },
        conn
      );

      await conn.commit();

      return {
        success: true,
        message: 'Product replacement request submitted for Head Office approval.',
        status: 'REQUEST_FOR_REPLACEMENT',
        replacementId,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Head Office review and approval/rejection of product replacement.
   * On approval: Generates unique official approval number and queues SMS 8.
   */
  async reviewReplacement(
    replacementId: string,
    input: ReviewReplacementRequestInput,
    actor: AuthenticatedUser
  ): Promise<{ success: boolean; decision: 'APPROVED' | 'REJECTED'; approvalNumber?: string; status: ServiceRequestStatus }> {
    const rep = await replacementRequestRepository.findById(replacementId);
    if (!rep) {
      throw new AppError(`Replacement request ${replacementId} not found`, 404, 'NOT_FOUND');
    }

    if (rep.status !== 'PENDING') {
      throw new AppError(
        `Replacement request has already been reviewed (${rep.status})`,
        400,
        'ALREADY_REVIEWED'
      );
    }

    // Segregation of Duties: Requesters cannot approve their own requests
    if (actor.userId === rep.requestedBy) {
      throw new AppError(
        'SEGREGATION_OF_DUTIES_VIOLATION: Requesters cannot review or approve their own replacement requests.',
        403,
        'SEGREGATION_OF_DUTIES_VIOLATION'
      );
    }

    const conn = await getOracleConnection();
    try {
      const lockSql = `SELECT STATUS, JOB_NUMBER, CUSTOMER_PHONE FROM SERVICE_REQUESTS WHERE REQUEST_ID = :requestId FOR UPDATE`;
      const lockRes = await conn.execute<any>(lockSql, { requestId: rep.requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!lockRes.rows || lockRes.rows.length === 0) {
        throw new AppError(`Service request ${rep.requestId} not found`, 404, 'NOT_FOUND');
      }

      const requestRow = lockRes.rows[0];
      if (requestRow.STATUS !== 'REQUEST_FOR_REPLACEMENT') {
        throw new AppError(
          `Conflict: Service request is in status '${requestRow.STATUS}' instead of 'REQUEST_FOR_REPLACEMENT'`,
          409,
          'CONCURRENCY_CONFLICT'
        );
      }

      if (input.decision === 'APPROVED') {
        // Generate unique official Replacement Approval Number: REP-YYYYMMDD-XXXX
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
        const approvalNumber = `REP-${dateStr}-${rand}`;

        await replacementRequestRepository.updateDecision(
          replacementId,
          {
            status: 'APPROVED',
            approvalNumber,
            reviewedBy: actor.userId,
            reviewRemarks: input.reviewRemarks,
          },
          conn
        );

        await serviceRequestRepository.approveReplacement(
          {
            requestId: rep.requestId,
            approvalNumber,
          },
          conn
        );

        await serviceRequestEventRepository.createEvent(
          {
            requestId: rep.requestId,
            fromState: 'REQUEST_FOR_REPLACEMENT',
            toState: 'REPLACEMENT_APPROVED',
            eventType: 'REPLACEMENT_APPROVED',
            triggeredByUserId: actor.userId,
            triggeredByUsername: actor.username,
            triggeredByRole: actor.roles[0] || 'ADMIN',
            remarks: `Replacement approved by Head Office. Issued Approval No: ${approvalNumber}`,
            metadataJson: {
              replacementId,
              approvalNumber,
              reviewRemarks: input.reviewRemarks,
            },
          },
          conn
        );

        // Build & queue SMS 8 Replacement Approved notification
        const smsBody = notificationService.buildSms8Message({
          jobNumber: requestRow.JOB_NUMBER,
          replacementApprovalNo: approvalNumber,
        });

        const outboxRecord = await notificationRepository.enqueueNotification(
          {
            requestId: rep.requestId,
            recipient: requestRow.CUSTOMER_PHONE || '9999999999',
            channel: 'SMS',
            templateCode: 'SMS_8_REPLACEMENT_APPROVED',
            messageBody: smsBody,
            isEncrypted: 'N',
          },
          conn
        );

        await conn.commit();

        notificationService.processNotification(outboxRecord).catch(() => {});

        return {
          success: true,
          decision: 'APPROVED',
          approvalNumber,
          status: 'REPLACEMENT_APPROVED',
        };
      } else {
        // Rejection returns ticket to IN_PROGRESS_REPAIR
        await replacementRequestRepository.updateDecision(
          replacementId,
          {
            status: 'REJECTED',
            reviewedBy: actor.userId,
            reviewRemarks: input.reviewRemarks,
          },
          conn
        );

        await serviceRequestRepository.updateStatus(rep.requestId, 'IN_PROGRESS_REPAIR', conn);

        await serviceRequestEventRepository.createEvent(
          {
            requestId: rep.requestId,
            fromState: 'REQUEST_FOR_REPLACEMENT',
            toState: 'IN_PROGRESS_REPAIR',
            eventType: 'REPLACEMENT_REJECTED',
            triggeredByUserId: actor.userId,
            triggeredByUsername: actor.username,
            triggeredByRole: actor.roles[0] || 'ADMIN',
            remarks: `Replacement rejected by Head Office. Remarks: ${input.reviewRemarks || 'No remarks'}`,
            metadataJson: {
              replacementId,
              reviewRemarks: input.reviewRemarks,
            },
          },
          conn
        );

        await conn.commit();

        return {
          success: true,
          decision: 'REJECTED',
          status: 'IN_PROGRESS_REPAIR',
        };
      }
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Submits a formal request for service call cancellation based on the 3 documented reasons.
   */
  async requestCancellation(
    requestId: string,
    input: CreateCancellationRequestInput,
    actor: AuthenticatedUser
  ): Promise<{ success: boolean; message: string; status: ServiceRequestStatus; cancellationId?: string }> {
    const request = await serviceRequestRepository.findById(requestId);
    if (!request) {
      throw new AppError(`Service request ${requestId} not found`, 404, 'NOT_FOUND');
    }

    if (['CLOSED', 'CANCELLED', 'REPLACED', 'REQUEST_FOR_CANCELLATION'].includes(request.status)) {
      throw new AppError(
        `Cannot request cancellation for ticket in status '${request.status}'`,
        400,
        'INVALID_STATUS'
      );
    }

    const CANCELLATION_REASONS: Record<CancellationReasonCode, string> = {
      REASON_1: 'Customer not contactable (minimum 3 documented call attempts across 48 hours)',
      REASON_2: 'Product is Out of Warranty, and customer refuses to pay standard labor service charge',
      REASON_3: 'Product is Under Warranty, but damaged component is excluded and customer refuses to pay for spare part',
    };

    const reasonDescription = CANCELLATION_REASONS[input.reasonCode];
    if (!reasonDescription) {
      throw new AppError(`Invalid cancellation reason code '${input.reasonCode}'`, 400, 'INVALID_REASON');
    }

    const conn = await getOracleConnection();
    try {
      const checkSql = `SELECT STATUS FROM SERVICE_REQUESTS WHERE REQUEST_ID = :requestId FOR UPDATE`;
      const lockRes = await conn.execute<any>(checkSql, { requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!lockRes.rows || lockRes.rows.length === 0) {
        throw new AppError(`Service request ${requestId} not found`, 404, 'NOT_FOUND');
      }

      const currentStatus = lockRes.rows[0].STATUS;
      if (['CLOSED', 'CANCELLED', 'REPLACED', 'REQUEST_FOR_CANCELLATION'].includes(currentStatus)) {
        throw new AppError(
          `Conflict: Service request status changed concurrently to '${currentStatus}'`,
          409,
          'CONCURRENCY_CONFLICT'
        );
      }

      const cancellationId = crypto.randomUUID();
      await cancellationRequestRepository.createRequest(
        {
          cancellationId,
          requestId,
          reasonCode: input.reasonCode,
          reasonDescription,
          remarks: input.remarks,
          requestedBy: actor.userId,
        },
        conn
      );

      await serviceRequestRepository.updateStatus(requestId, 'REQUEST_FOR_CANCELLATION', conn);

      await serviceRequestEventRepository.createEvent(
        {
          requestId,
          fromState: currentStatus,
          toState: 'REQUEST_FOR_CANCELLATION',
          eventType: 'REQUEST_FOR_CANCELLATION',
          triggeredByUserId: actor.userId,
          triggeredByUsername: actor.username,
          triggeredByRole: actor.roles[0] || 'CALL_CENTER',
          remarks: `Cancellation requested: [${input.reasonCode}] ${reasonDescription}`,
          metadataJson: {
            cancellationId,
            reasonCode: input.reasonCode,
            remarks: input.remarks,
          },
        },
        conn
      );

      await conn.commit();

      return {
        success: true,
        message: 'Cancellation request submitted for supervisor approval.',
        status: 'REQUEST_FOR_CANCELLATION',
        cancellationId,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Supervisor review and approval/rejection of service call cancellation.
   * On approval: Cancels ticket and queues SMS 7.
   */
  async reviewCancellation(
    cancellationId: string,
    input: ReviewCancellationRequestInput,
    actor: AuthenticatedUser
  ): Promise<{ success: boolean; decision: 'APPROVED' | 'REJECTED'; status: ServiceRequestStatus }> {
    const canc = await cancellationRequestRepository.findById(cancellationId);
    if (!canc) {
      throw new AppError(`Cancellation request ${cancellationId} not found`, 404, 'NOT_FOUND');
    }

    if (canc.status !== 'PENDING') {
      throw new AppError(
        `Cancellation request has already been reviewed (${canc.status})`,
        400,
        'ALREADY_REVIEWED'
      );
    }

    // Segregation of Duties: Requesters cannot approve their own requests
    if (actor.userId === canc.requestedBy) {
      throw new AppError(
        'SEGREGATION_OF_DUTIES_VIOLATION: Requesters cannot review or approve their own cancellation requests.',
        403,
        'SEGREGATION_OF_DUTIES_VIOLATION'
      );
    }

    const conn = await getOracleConnection();
    try {
      const lockSql = `SELECT STATUS, JOB_NUMBER, CUSTOMER_PHONE FROM SERVICE_REQUESTS WHERE REQUEST_ID = :requestId FOR UPDATE`;
      const lockRes = await conn.execute<any>(lockSql, { requestId: canc.requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!lockRes.rows || lockRes.rows.length === 0) {
        throw new AppError(`Service request ${canc.requestId} not found`, 404, 'NOT_FOUND');
      }

      const requestRow = lockRes.rows[0];
      if (requestRow.STATUS !== 'REQUEST_FOR_CANCELLATION') {
        throw new AppError(
          `Conflict: Service request is in status '${requestRow.STATUS}' instead of 'REQUEST_FOR_CANCELLATION'`,
          409,
          'CONCURRENCY_CONFLICT'
        );
      }

      if (input.decision === 'APPROVED') {
        await cancellationRequestRepository.updateDecision(
          cancellationId,
          {
            status: 'APPROVED',
            reviewedBy: actor.userId,
            reviewRemarks: input.reviewRemarks,
          },
          conn
        );

        await serviceRequestRepository.cancelServiceRequest(
          {
            requestId: canc.requestId,
            cancelledBy: actor.userId,
            cancellationReason: canc.reasonDescription,
            cancellationRemarks: input.reviewRemarks,
          },
          conn
        );

        await serviceRequestEventRepository.createEvent(
          {
            requestId: canc.requestId,
            fromState: 'REQUEST_FOR_CANCELLATION',
            toState: 'CANCELLED',
            eventType: 'CANCELLED',
            triggeredByUserId: actor.userId,
            triggeredByUsername: actor.username,
            triggeredByRole: actor.roles[0] || 'ADMIN',
            remarks: `Cancellation approved by Supervisor. Reason: ${canc.reasonDescription}`,
            metadataJson: {
              cancellationId,
              reasonCode: canc.reasonCode,
              reviewRemarks: input.reviewRemarks,
            },
          },
          conn
        );

        // Build & queue SMS 7 Service Cancelled notification
        const smsBody = notificationService.buildSms7Message({
          jobNumber: requestRow.JOB_NUMBER,
        });

        const outboxRecord = await notificationRepository.enqueueNotification(
          {
            requestId: canc.requestId,
            recipient: requestRow.CUSTOMER_PHONE || '9999999999',
            channel: 'SMS',
            templateCode: 'SMS_7_SERVICE_CANCELLED',
            messageBody: smsBody,
            isEncrypted: 'N',
          },
          conn
        );

        // Auto-release any active warehouse part reservations for this cancelled job
        await inventoryService.autoReleaseJobReservations(
          canc.requestId,
          `Service call cancelled: [${canc.reasonCode}] ${canc.reasonDescription}`,
          actor,
          conn
        );

        await conn.commit();

        notificationService.processNotification(outboxRecord).catch(() => {});

        return {
          success: true,
          decision: 'APPROVED',
          status: 'CANCELLED',
        };
      } else {
        // Rejection returns ticket to IN_PROGRESS_REPAIR
        await cancellationRequestRepository.updateDecision(
          cancellationId,
          {
            status: 'REJECTED',
            reviewedBy: actor.userId,
            reviewRemarks: input.reviewRemarks,
          },
          conn
        );

        await serviceRequestRepository.updateStatus(canc.requestId, 'IN_PROGRESS_REPAIR', conn);

        await serviceRequestEventRepository.createEvent(
          {
            requestId: canc.requestId,
            fromState: 'REQUEST_FOR_CANCELLATION',
            toState: 'IN_PROGRESS_REPAIR',
            eventType: 'CANCELLATION_REJECTED',
            triggeredByUserId: actor.userId,
            triggeredByUsername: actor.username,
            triggeredByRole: actor.roles[0] || 'ADMIN',
            remarks: `Cancellation rejected by Supervisor. Remarks: ${input.reviewRemarks || 'No remarks'}`,
            metadataJson: {
              cancellationId,
              reviewRemarks: input.reviewRemarks,
            },
          },
          conn
        );

        await conn.commit();

        return {
          success: true,
          decision: 'REJECTED',
          status: 'IN_PROGRESS_REPAIR',
        };
      }
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }
}

export const job360Service = new Job360Service();
