import { getOracleConnection } from '../database/oraclePool.js';
import { logger } from '../logging/logger.js';
import { replacementRequestRepository } from '../database/repositories/replacementRequestRepository.js';
import { inventoryRepository } from '../database/repositories/inventoryRepository.js';
import { inventoryReservationRepository } from '../database/repositories/inventoryReservationRepository.js';
import { notificationRepository } from '../database/repositories/notificationRepository.js';
import { serviceRequestPartsRepository } from '../database/repositories/serviceRequestPartsRepository.js';
import { stockDispatchRepository } from '../database/repositories/stockDispatchRepository.js';
import { custodyRepository } from '../database/repositories/custodyRepository.js';
import { serviceRequestRepository } from '../database/repositories/serviceRequestRepository.js';
import { replacementVerificationService } from './replacementVerificationService.js';
import { notificationService } from './notificationService.js';
import { encryptNotificationPayload } from '../utils/cryptoUtils.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser } from '../types/auth.js';
import { ReplacementRequestRecord, ReplacementRequestStatus } from '../types/job360.js';

export class ReplacementService {
  async getReplacementById(replacementId: string): Promise<ReplacementRequestRecord> {
    const record = await replacementRequestRepository.findById(replacementId);
    if (!record) {
      throw new AppError(`Replacement request ${replacementId} not found`, 404, 'NOT_FOUND');
    }
    return record;
  }

  async getReplacementByRequestId(requestId: string): Promise<ReplacementRequestRecord | null> {
    return replacementRequestRepository.findByRequestId(requestId);
  }

  async listReplacements(
    filters: {
      status?: ReplacementRequestStatus;
      locationId?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
    actor: AuthenticatedUser
  ): Promise<{ items: ReplacementRequestRecord[]; total: number }> {
    const isAsf = actor.roles.includes('ASF');
    const isAdmin = actor.roles.includes('ADMIN');
    const isWarehouse = actor.roles.includes('WAREHOUSE');

    const effectiveLocationId = (isAsf && !isAdmin && !isWarehouse && actor.locationId)
      ? actor.locationId
      : filters.locationId;

    return replacementRequestRepository.listReplacements({
      ...filters,
      locationId: effectiveLocationId,
    });
  }

  /**
   * Qualifies warranty status for a replacement request.
   * IN_WARRANTY: Quotation is NOT_REQUIRED.
   * OUT_OF_WARRANTY: Quotation is required and status set to PENDING_QUOTATION.
   */
  async qualifyWarranty(
    replacementId: string,
    warrantyType: 'IN_WARRANTY' | 'OUT_OF_WARRANTY',
    _actor: AuthenticatedUser
  ): Promise<ReplacementRequestRecord> {
    const conn = await getOracleConnection();
    try {
      const rep = await replacementRequestRepository.findById(replacementId, conn);
      if (!rep) {
        throw new AppError(`Replacement request ${replacementId} not found`, 404, 'NOT_FOUND');
      }

      if (rep.status === 'CLOSED' || rep.status === 'CUSTOMER_DECLINED') {
        throw new AppError(`Cannot qualify warranty for replacement in terminal status '${rep.status}'`, 400, 'TERMINAL_STATE');
      }

      const quotationStatus = warrantyType === 'IN_WARRANTY' ? 'NOT_REQUIRED' : 'PENDING_CUSTOMER_APPROVAL';
      const newStatus: ReplacementRequestStatus = warrantyType === 'OUT_OF_WARRANTY' ? 'PENDING_QUOTATION' : 'OPEN';

      const updateSql = `
        UPDATE REPLACEMENT_REQUESTS
        SET 
          WARRANTY_TYPE = :warrantyType,
          QUOTATION_STATUS = :quotationStatus,
          STATUS = :newStatus,
          UPDATED_AT = SYSTIMESTAMP
        WHERE REPLACEMENT_ID = :replacementId
      `;
      await conn.execute(updateSql, { warrantyType, quotationStatus, newStatus, replacementId });
      await conn.commit();

      return (await replacementRequestRepository.findById(replacementId))!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * ASF prepares a quotation for out-of-warranty replacement.
   * Any change increments appointment/quotation version and invalidates previous approvals.
   */
  async prepareQuotation(
    replacementId: string,
    input: { amount: number; remarks?: string },
    _actor: AuthenticatedUser
  ): Promise<ReplacementRequestRecord> {
    const conn = await getOracleConnection();
    try {
      const rep = await replacementRequestRepository.findById(replacementId, conn);
      if (!rep) {
        throw new AppError(`Replacement request ${replacementId} not found`, 404, 'NOT_FOUND');
      }

      if (rep.warrantyType === 'IN_WARRANTY') {
        throw new AppError('Quotations are not permitted for in-warranty replacement requests.', 400, 'IN_WARRANTY_NO_QUOTE');
      }

      if (rep.status === 'CLOSED' || rep.status === 'CUSTOMER_DECLINED') {
        throw new AppError(`Cannot prepare quotation for replacement in terminal status '${rep.status}'`, 400, 'TERMINAL_STATE');
      }

      // Record quotation update, invalidate prior approval, bump version
      await replacementRequestRepository.updateQuotation(
        replacementId,
        {
          quotationAmount: input.amount,
          quotationStatus: 'PENDING_CUSTOMER_APPROVAL',
        },
        conn
      );

      // Move status to PENDING_QUOTATION if not already there
      await replacementRequestRepository.updateStatus(replacementId, 'PENDING_QUOTATION', conn);

      await conn.commit();
      return (await replacementRequestRepository.findById(replacementId))!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Records customer decision on quotation.
   * APPROVED: Moves status to QUOTATION_APPROVED.
   * DECLINED: Moves status to CUSTOMER_DECLINED, permanently blocking dispatch.
   */
  async recordQuotationDecision(
    replacementId: string,
    input: { decision: 'APPROVED' | 'DECLINED'; quotationVersion?: number; reason?: string },
    _actor: AuthenticatedUser
  ): Promise<ReplacementRequestRecord> {
    const conn = await getOracleConnection();
    try {
      const rep = await replacementRequestRepository.findById(replacementId, conn);
      if (!rep) {
        throw new AppError(`Replacement request ${replacementId} not found`, 404, 'NOT_FOUND');
      }

      if (rep.warrantyType === 'IN_WARRANTY') {
        throw new AppError('Quotation approval is not required for in-warranty requests', 400, 'IN_WARRANTY_NO_QUOTE');
      }

      if (rep.status === 'CUSTOMER_DECLINED') {
        throw new AppError('Replacement request has already been declined by customer', 400, 'ALREADY_DECLINED');
      }

      // Check version binding: approval must reference current quotation version
      if (input.quotationVersion != null && rep.appointmentVersion != null) {
        if (input.quotationVersion !== rep.appointmentVersion) {
          throw new AppError(
            `Quotation version mismatch: Approved version ${input.quotationVersion} does not match current version ${rep.appointmentVersion}. Re-approval required.`,
            409,
            'STALE_QUOTATION_VERSION'
          );
        }
      }

      await replacementRequestRepository.recordQuotationDecision(
        replacementId,
        {
          decision: input.decision,
          reason: input.reason,
        },
        conn
      );

      // If customer declined, release any active un-dispatched reservations
      if (input.decision === 'DECLINED') {
        const reservations = await inventoryReservationRepository.findActiveByRequestId(rep.requestId, conn);
        for (const resv of reservations) {
          if (resv.status === 'ACTIVE') {
            await inventoryReservationRepository.releaseReservation(resv.reservationId, 'Customer declined quotation', conn);
          }
        }
      }

      await conn.commit();
      return (await replacementRequestRepository.findById(replacementId))!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Validates dispatch prerequisites:
   * 1. If OUT_OF_WARRANTY, quotation must be APPROVED. If CUSTOMER_DECLINED, dispatch is blocked.
   * 2. Replacement must not be in terminal state.
   */
  async checkDispatchPrerequisites(replacementId: string): Promise<{ eligible: boolean; reason?: string }> {
    const rep = await this.getReplacementById(replacementId);

    if (rep.status === 'CUSTOMER_DECLINED') {
      return { eligible: false, reason: 'Dispatch blocked: Customer declined out-of-warranty quotation' };
    }

    if (rep.status === 'CLOSED') {
      return { eligible: false, reason: 'Dispatch blocked: Replacement request is already closed' };
    }

    if (rep.warrantyType === 'OUT_OF_WARRANTY') {
      if (rep.quotationStatus !== 'APPROVED') {
        return {
          eligible: false,
          reason: `Dispatch blocked: Out-of-warranty replacement requires approved quotation (current quotation status: '${rep.quotationStatus}')`,
        };
      }
    }

    return { eligible: true };
  }

  /**
   * Allocates warehouse stock for replacement request.
   * If stock is available: reserves stock atomically, updates status to STOCK_RESERVED.
   * If stock is unavailable: updates status to PENDING_STOCK and queues 7-10 business day customer estimate SMS (deduplicated).
   */
  async allocateStock(
    replacementId: string,
    warehouseId: string,
    actor: AuthenticatedUser
  ): Promise<{ status: ReplacementRequestStatus; allocated: boolean; message: string }> {
    const prereq = await this.checkDispatchPrerequisites(replacementId);
    if (!prereq.eligible) {
      throw new AppError(prereq.reason!, 400, 'DISPATCH_PREREQUISITES_NOT_MET');
    }

    const conn = await getOracleConnection();
    try {
      const rep = await replacementRequestRepository.findById(replacementId, conn);
      if (!rep) {
        throw new AppError(`Replacement ${replacementId} not found`, 404, 'NOT_FOUND');
      }

      if (!rep.requiredPartId) {
        throw new AppError('Replacement request does not have a required replacement part assigned.', 400, 'NO_PART_ASSIGNED');
      }

      // Check warehouse stock balance with FOR UPDATE lock
      const balance = await inventoryRepository.getBalance(warehouseId, rep.requiredPartId, conn, true);
      const availableQty = balance ? balance.qtyOnHand - balance.qtyReserved : 0;

      if (availableQty >= 1) {
        // Ensure a valid part entry exists in SERVICE_REQUEST_PARTS for foreign key integrity
        const parts = await serviceRequestPartsRepository.listPartsByRequestId(rep.requestId, conn);
        const existingEntry = parts.find((p) => p.partId === rep.requiredPartId);
        let partEntryId: string;
        if (existingEntry) {
          partEntryId = existingEntry.partEntryId;
        } else {
          partEntryId = await serviceRequestPartsRepository.addPart(
            {
              requestId: rep.requestId,
              partId: rep.requiredPartId,
              quantity: 1,
              isChargeableToCustomer: rep.warrantyType === 'OUT_OF_WARRANTY' ? 'Y' : 'N',
              unitPrice: rep.quotationAmount || 0,
              totalPrice: rep.quotationAmount || 0,
              entryType: 'REQUIRED_PNA',
              status: 'PENDING_FULFILLMENT',
              remarks: 'Replacement unit allocation',
              actorUsername: actor.username,
            },
            conn
          );
        }

        // Reserve 1 unit atomically
        await inventoryReservationRepository.createReservation(
          {
            requestId: rep.requestId,
            partEntryId,
            locationId: warehouseId,
            partId: rep.requiredPartId,
            quantity: 1,
            reservedBy: actor.userId,
          },
          conn
        );

        // Update balance reserved delta
        await inventoryRepository.upsertBalanceDeltas(
          {
            locationId: warehouseId,
            partId: rep.requiredPartId,
            deltaOnHand: 0,
            deltaReserved: 1,
            deltaInTransit: 0,
          },
          conn
        );

        await replacementRequestRepository.updateAllocation(
          replacementId,
          {
            status: 'STOCK_RESERVED',
            stockStatus: 'ALLOCATED',
            allocatedLocationId: warehouseId,
          },
          conn
        );

        await conn.commit();
        return {
          status: 'STOCK_RESERVED',
          allocated: true,
          message: 'Required replacement unit successfully reserved at central warehouse.',
        };
      } else {
        // Part unavailable: transition to PENDING_STOCK
        await replacementRequestRepository.updateAllocation(
          replacementId,
          {
            status: 'PENDING_STOCK',
            stockStatus: 'PENDING_STOCK',
            allocatedLocationId: warehouseId,
          },
          conn
        );

        // Deduplicated SMS 7-10 business day shortage notification
        const alreadySent = await notificationRepository.hasShortageNotification(replacementId);
        let outboxShortage;
        if (!alreadySent) {
          const serviceReq = await serviceRequestRepository.findById(rep.requestId, conn);
          const customerPhone = serviceReq?.customerPhone || rep.customerPhone;
          if (customerPhone) {
            const smsText = notificationService.buildSmsStockShortageMessage({
              jobNumber: serviceReq?.jobNumber || rep.jobNumber || 'JOB-UNKNOWN',
            });
            const encrypted = encryptNotificationPayload(smsText);
            outboxShortage = await notificationRepository.enqueueNotification(
              {
                requestId: rep.requestId,
                replacementId,
                channel: 'SMS',
                recipient: customerPhone,
                templateCode: 'SMS_STOCK_SHORTAGE',
                messageBody: 'Dear Customer, The required replacement part is currently unavailable. It is expected to be dispatched within 7–10 business days.',
                isEncrypted: 'Y',
                encryptedPayload: encrypted.encryptedPayload,
                encryptionIv: encrypted.iv,
                authTag: encrypted.authTag,
                keyVersion: encrypted.keyVersion,
              },
              conn
            );
          }
        }

        await conn.commit();

        if (outboxShortage) {
          notificationService.processNotification(outboxShortage).catch(() => {});
        }

        return {
          status: 'PENDING_STOCK',
          allocated: false,
          message: 'Part is currently out of stock. Transitioned to PENDING_STOCK; 7–10 business day dispatch estimate SMS queued to customer.',
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
   * Warehouse dispatches the allocated replacement part to the responsible ASF center.
   */
  async dispatchStockToAsf(
    replacementId: string,
    input: { courierName: string; docketNumber: string; remarks?: string },
    actor: AuthenticatedUser
  ): Promise<ReplacementRequestRecord> {
    const isWarehouse = actor.roles.includes('WAREHOUSE');
    const isAdmin = actor.roles.includes('ADMIN');
    if (!isWarehouse && !isAdmin) {
      throw new AppError('Forbidden: Only warehouse staff or administrators can dispatch stock', 403, 'FORBIDDEN');
    }

    const prereq = await this.checkDispatchPrerequisites(replacementId);
    if (!prereq.eligible) {
      throw new AppError(prereq.reason!, 400, 'DISPATCH_PREREQUISITES_NOT_MET');
    }

    const conn = await getOracleConnection();
    try {
      const rep = await replacementRequestRepository.findById(replacementId, conn);
      if (!rep) {
        throw new AppError(`Replacement request ${replacementId} not found`, 404, 'NOT_FOUND');
      }

      if (rep.status !== 'STOCK_RESERVED' && rep.status !== 'OPEN') {
        throw new AppError(`Cannot dispatch replacement in status '${rep.status}'. Must be in 'STOCK_RESERVED'.`, 400, 'INVALID_STATUS');
      }

      let dispatchId: string | null = null;
      if (rep.allocatedLocationId && rep.requiredPartId) {
        const sr = await serviceRequestRepository.findById(rep.requestId, conn);
        const toLocationId = sr?.assignedLocationId || rep.allocatedLocationId;
        dispatchId = await stockDispatchRepository.createDispatch(
          {
            dispatchNumber: `DC-${Date.now().toString(36).toUpperCase()}`,
            documentType: 'DELIVERY_CHALLAN',
            fromLocationId: rep.allocatedLocationId,
            toLocationId,
            requestId: rep.requestId,
            courierName: input.courierName,
            docketNumber: input.docketNumber,
            dispatchedBy: actor.userId,
            totalQuantity: 1,
            subtotalAmount: rep.quotationAmount || 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            totalAmount: rep.quotationAmount || 0,
            remarks: input.remarks,
            items: [
              {
                partId: rep.requiredPartId,
                quantity: 1,
                unitPrice: rep.quotationAmount || 0,
                cgstRate: 0,
                sgstRate: 0,
                igstRate: 0,
                cgstAmount: 0,
                sgstAmount: 0,
                igstAmount: 0,
                totalAmount: rep.quotationAmount || 0,
              },
            ],
          },
          conn
        );
      }

      logger.info(`[DISPATCH] Replacement ${replacementId} dispatched via ${input.courierName} (${input.docketNumber}): ${input.remarks || 'No remarks'}`);

      await replacementRequestRepository.recordDispatch(
        replacementId,
        {
          dispatchId: dispatchId || '',
          status: 'DISPATCHED_TO_ASF',
        },
        conn
      );

      await conn.commit();
      return (await replacementRequestRepository.findById(replacementId))!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Responsible ASF center acknowledges physical delivery of replacement part from warehouse.
   */
  async acknowledgeAsfReceipt(replacementId: string, actor: AuthenticatedUser): Promise<ReplacementRequestRecord> {
    const conn = await getOracleConnection();
    try {
      const rep = await replacementRequestRepository.findById(replacementId, conn);
      if (!rep) {
        throw new AppError(`Replacement request ${replacementId} not found`, 404, 'NOT_FOUND');
      }

      const sr = await serviceRequestRepository.findById(rep.requestId, conn);
      const isAsf = actor.roles.includes('ASF');
      const isAdmin = actor.roles.includes('ADMIN');

      if (isAsf && !isAdmin && actor.locationId && sr && sr.assignedLocationId !== actor.locationId) {
        throw new AppError('Forbidden: Replacement shipment was dispatched to a different service center location', 403, 'FORBIDDEN_LOCATION');
      }

      if (rep.status !== 'DISPATCHED_TO_ASF') {
        throw new AppError(`Cannot acknowledge receipt for replacement in status '${rep.status}'. Must be 'DISPATCHED_TO_ASF'.`, 400, 'INVALID_STATUS');
      }

      const targetLocationId = actor.locationId || sr?.assignedLocationId || rep.allocatedLocationId;
      await replacementRequestRepository.recordAsfReceipt(replacementId, targetLocationId!, conn);
      await conn.commit();

      return (await replacementRequestRepository.findById(replacementId))!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * ASF schedules replacement installation visit.
   * Requires custody to have been acknowledged by engineer.
   * Enforces appointmentTime >= serverTime + 60 minutes.
   * Schedules Arrival Happy Code SMS for appointmentTime - 60 minutes.
   */
  async scheduleInstallation(
    replacementId: string,
    input: { engineerId: string; appointmentDate: string; appointmentSlot: string; remarks?: string },
    actor: AuthenticatedUser
  ): Promise<ReplacementRequestRecord> {
    const prereq = await this.checkInstallationPrerequisites(replacementId);
    if (!prereq.eligible) {
      throw new AppError(prereq.reason!, 400, 'INSTALLATION_PREREQUISITES_NOT_MET');
    }

    const appointmentDate = new Date(input.appointmentDate);
    if (isNaN(appointmentDate.getTime())) {
      throw new AppError('Invalid appointment date format', 400, 'INVALID_APPOINTMENT_DATE');
    }

    const minAllowed = Date.now() + 60 * 60 * 1000 - 5000;
    if (appointmentDate.getTime() < minAllowed) {
      throw new AppError('Appointment must be scheduled at least 60 minutes in the future', 400, 'INVALID_APPOINTMENT_TIME');
    }

    const conn = await getOracleConnection();
    try {
      const rep = await replacementRequestRepository.findById(replacementId, conn);
      if (!rep) {
        throw new AppError(`Replacement request ${replacementId} not found`, 404, 'NOT_FOUND');
      }

      const nextVersion = (rep.appointmentVersion || 1) + 1;

      // Supersede previous scheduled notifications
      await notificationRepository.supersedePending(replacementId, 'SMS_02_APPOINTMENT', conn);

      // Issue visit-scoped Arrival Happy Code
      const issuance = await replacementVerificationService.issueVerificationCode(
        {
          replacementId,
          visitNumber: 1,
          appointmentVersion: nextVersion,
          assignedEngineerId: input.engineerId,
          purpose: 'ARRIVAL',
        },
        actor
      );

      const scheduledFor = new Date(appointmentDate.getTime() - 60 * 60 * 1000);
      const isDueImmediately = scheduledFor.getTime() <= Date.now();

      // Enqueue Arrival Happy Code SMS for customer
      const sr = await serviceRequestRepository.findById(rep.requestId, conn);
      let outboxItem;
      if (sr && sr.customerPhone) {
        const smsBody = notificationService.buildSms2Message({
          jobNumber: sr.jobNumber,
          techName: actor.fullName || 'Technician',
          techMobile: (actor as any).phoneNumber || 'N/A',
          appointmentDatetime: `${appointmentDate.toLocaleDateString()} (${input.appointmentSlot})`,
          checkinOtp: issuance.plainCode,
        });
        const encrypted = encryptNotificationPayload(smsBody);
        outboxItem = await notificationRepository.enqueueNotification(
          {
            requestId: rep.requestId,
            replacementId,
            appointmentVersion: nextVersion,
            channel: 'SMS',
            recipient: sr.customerPhone,
            templateCode: 'SMS_02_APPOINTMENT',
            messageBody: '[ENCRYPTED_OTP_PAYLOAD]',
            isEncrypted: 'Y',
            encryptedPayload: encrypted.encryptedPayload,
            encryptionIv: encrypted.iv,
            authTag: encrypted.authTag,
            keyVersion: encrypted.keyVersion,
            scheduledFor: isDueImmediately ? undefined : scheduledFor,
          },
          conn
        );
      }

      await replacementRequestRepository.scheduleInstallation(
        replacementId,
        {
          engineerId: input.engineerId,
          appointmentSlot: appointmentDate,
          appointmentVersion: nextVersion,
        },
        conn
      );

      await conn.commit();

      if (outboxItem && isDueImmediately) {
        notificationService.processNotification(outboxItem).catch(() => {});
      }

      return (await replacementRequestRepository.findById(replacementId))!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Assigned engineer verifies Arrival Happy Code at customer location.
   * Immediately issues Completion Happy Code and queues customer SMS.
   */
  async verifyInstallationArrival(
    replacementId: string,
    code: string,
    actor: AuthenticatedUser
  ): Promise<{ success: boolean; status: ReplacementRequestStatus; message: string }> {
    const isEngineer = actor.roles.includes('ENGINEER');
    const isAdmin = actor.roles.includes('ADMIN');

    const rep = await this.getReplacementById(replacementId);
    if (isEngineer && !isAdmin && rep.assignedEngineerId && rep.assignedEngineerId !== actor.userId) {
      throw new AppError('Forbidden: Only the assigned engineer can verify arrival for this replacement', 403, 'FORBIDDEN_TECHNICIAN');
    }

    // Verify ARRIVAL Happy Code
    await replacementVerificationService.verifyCode(
      {
        replacementId,
        visitNumber: 1,
        appointmentVersion: rep.appointmentVersion || 1,
        purpose: 'ARRIVAL',
        happyCode: code,
      },
      actor
    );

    const conn = await getOracleConnection();
    try {
      await replacementRequestRepository.updateStatus(replacementId, 'TECHNICIAN_CHECKED_IN', conn);

      // Immediately generate separate Completion Happy Code and queue SMS to customer
      const issuance = await replacementVerificationService.issueVerificationCode(
        {
          replacementId,
          visitNumber: 1,
          appointmentVersion: rep.appointmentVersion || 1,
          assignedEngineerId: rep.assignedEngineerId || actor.userId,
          purpose: 'COMPLETION',
        },
        actor
      );

      const sr = await serviceRequestRepository.findById(rep.requestId, conn);
      let outboxItem;
      if (sr && sr.customerPhone) {
        const smsBody = notificationService.buildSms4Message({
          jobNumber: sr.jobNumber,
          happyCode: issuance.plainCode,
        });
        const encrypted = encryptNotificationPayload(smsBody);
        outboxItem = await notificationRepository.enqueueNotification(
          {
            requestId: rep.requestId,
            replacementId,
            channel: 'SMS',
            recipient: sr.customerPhone,
            templateCode: 'SMS_4_CALL_CLOSURE',
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

      return {
        success: true,
        status: 'TECHNICIAN_CHECKED_IN',
        message: 'Arrival Happy Code verified. Completion Happy Code issued to customer.',
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Assigned engineer completes replacement installation using customer Completion Happy Code.
   */
  async completeInstallation(
    replacementId: string,
    input: { completionCode: string; targetSerialNo?: string; remarks?: string },
    actor: AuthenticatedUser
  ): Promise<ReplacementRequestRecord> {
    const isEngineer = actor.roles.includes('ENGINEER');
    const isAdmin = actor.roles.includes('ADMIN');

    const rep = await this.getReplacementById(replacementId);
    if (isEngineer && !isAdmin && rep.assignedEngineerId && rep.assignedEngineerId !== actor.userId) {
      throw new AppError('Forbidden: Only the assigned engineer can complete this replacement installation', 403, 'FORBIDDEN_TECHNICIAN');
    }

    // Verify COMPLETION Happy Code
    await replacementVerificationService.verifyCode(
      {
        replacementId,
        visitNumber: 1,
        appointmentVersion: rep.appointmentVersion || 1,
        purpose: 'COMPLETION',
        happyCode: input.completionCode,
      },
      actor
    );

    const conn = await getOracleConnection();
    try {
      await replacementRequestRepository.markInstallationVerified(replacementId, actor.userId, conn);

      // Update custody status to INSTALLED
      const handovers = await custodyRepository.findByReplacementId(replacementId, conn);
      if (handovers && handovers.length > 0 && handovers[0]) {
        await custodyRepository.markInstalled(handovers[0].handoverId, actor.userId, conn);
      }

      await conn.commit();
      return (await replacementRequestRepository.findById(replacementId))!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Validates installation prerequisites:
   * Requires custody to have been acknowledged by engineer.
   */
  async checkInstallationPrerequisites(replacementId: string): Promise<{ eligible: boolean; reason?: string }> {
    const rep = await this.getReplacementById(replacementId);
    if (rep.status === 'CUSTOMER_DECLINED' || rep.status === 'CLOSED') {
      return { eligible: false, reason: `Installation ineligible: Replacement in terminal status '${rep.status}'` };
    }

    // Must be in or past HANDED_OVER_TO_ENGINEER / APPOINTMENT_SCHEDULED / TECHNICIAN_CHECKED_IN
    const eligibleStatuses: ReplacementRequestStatus[] = [
      'HANDED_OVER_TO_ENGINEER',
      'APPOINTMENT_SCHEDULED',
      'TECHNICIAN_CHECKED_IN',
    ];
    if (!eligibleStatuses.includes(rep.status)) {
      return {
        eligible: false,
        reason: `Installation requires part handover to engineer (current status: '${rep.status}')`,
      };
    }

    return { eligible: true };
  }

  /**
   * Validates Warehouse closure prerequisites:
   * Warehouse closure REQUIRES verified installation (STATUS = 'INSTALLATION_VERIFIED').
   */
  async checkWarehouseClosurePrerequisites(replacementId: string): Promise<{ eligible: boolean; reason?: string }> {
    const rep = await this.getReplacementById(replacementId);
    if (rep.status !== 'INSTALLATION_VERIFIED') {
      return {
        eligible: false,
        reason: `Warehouse closure blocked: Replacement must be in 'INSTALLATION_VERIFIED' status before closure (current status: '${rep.status}')`,
      };
    }
    return { eligible: true };
  }

  /**
   * Closes replacement request following verified installation.
   */
  async closeReplacement(replacementId: string, actor: AuthenticatedUser): Promise<ReplacementRequestRecord> {
    const prereq = await this.checkWarehouseClosurePrerequisites(replacementId);
    if (!prereq.eligible) {
      throw new AppError(prereq.reason!, 400, 'CLOSURE_PREREQUISITES_NOT_MET');
    }

    const conn = await getOracleConnection();
    try {
      await replacementRequestRepository.closeReplacement(replacementId, actor.userId, conn);
      await conn.commit();
      return (await replacementRequestRepository.findById(replacementId))!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }
}

export const replacementService = new ReplacementService();
