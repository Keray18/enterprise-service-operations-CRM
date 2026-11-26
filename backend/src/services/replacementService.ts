import oracledb from 'oracledb';
import { getOracleConnection } from '../database/oraclePool.js';
import { logger } from '../logging/logger.js';
import { custodyRepository } from '../database/repositories/custodyRepository.js';
import { inventoryMovementRepository } from '../database/repositories/inventoryMovementRepository.js';
import { inventoryRepository } from '../database/repositories/inventoryRepository.js';
import { inventoryReservationRepository } from '../database/repositories/inventoryReservationRepository.js';
import { locationRepository } from '../database/repositories/locationRepository.js';
import { notificationRepository } from '../database/repositories/notificationRepository.js';
import { replacementCustodyRepository } from '../database/repositories/replacementCustodyRepository.js';
import { replacementRequestRepository } from '../database/repositories/replacementRequestRepository.js';
import { serviceRequestPartsRepository } from '../database/repositories/serviceRequestPartsRepository.js';
import { serviceRequestRepository } from '../database/repositories/serviceRequestRepository.js';
import { stockDispatchRepository } from '../database/repositories/stockDispatchRepository.js';
import { systemAuditRepository } from '../database/repositories/systemAuditRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { rbacRepository } from '../database/repositories/rbacRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser } from '../types/auth.js';
import { ReplacementRequestRecord, ReplacementRequestStatus } from '../types/job360.js';
import { encryptNotificationPayload } from '../utils/cryptoUtils.js';
import { assertBarcodeMatchesPart, BarcodeCapture } from './barcodeVerificationService.js';
import { attachmentRepository } from '../database/repositories/attachmentRepository.js';
import { storageService } from './storageService.js';
import { notificationService } from './notificationService.js';
import { replacementVerificationService } from './replacementVerificationService.js';

type OutboxRecord = Awaited<ReturnType<typeof notificationRepository.enqueueNotification>>;

const TERMINAL: ReplacementRequestStatus[] = ['CLOSED', 'CUSTOMER_DECLINED'];
/** Statuses before the unit leaves the warehouse (quotation may still be revised). */
const PRE_DISPATCH: ReplacementRequestStatus[] = ['OPEN', 'PENDING_QUOTATION', 'QUOTATION_APPROVED', 'PENDING_STOCK', 'STOCK_RESERVED'];

function isRole(actor: AuthenticatedUser, ...roles: string[]): boolean {
  return roles.some((r) => actor.roles.includes(r));
}

async function inTransaction<T>(fn: (conn: oracledb.Connection) => Promise<T>): Promise<T> {
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

/**
 * Replacement fulfilment and physical custody.
 *
 *   Warehouse --dispatch--> (in transit) --ASF receipt--> Responsible ASF --handover--> Assigned
 *   engineer --collection--> customer visit (Arrival Happy Code) --installation (Completion
 *   Happy Code + installed part identification)--> Warehouse final closure.
 *
 * Every physical movement is barcode-verified against part master data before any custody or
 * stock change; failed validation leaves inventory and custody untouched.
 */
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
    filters: { status?: ReplacementRequestStatus; locationId?: string; search?: string; page?: number; limit?: number },
    actor: AuthenticatedUser
  ): Promise<{ items: ReplacementRequestRecord[]; total: number }> {
    const isAsf = actor.roles.includes('ASF');
    const isAdmin = actor.roles.includes('ADMIN');
    const isWarehouse = actor.roles.includes('WAREHOUSE');
    const effectiveLocationId = isAsf && !isAdmin && !isWarehouse && actor.locationId ? actor.locationId : filters.locationId;
    return replacementRequestRepository.listReplacements({ ...filters, locationId: effectiveLocationId });
  }

  /** Full custody picture for a replacement: handovers, ledger events and installation evidence. */
  async getCustodyTimeline(replacementId: string) {
    const replacement = await this.getReplacementById(replacementId);
    const [handovers, events, installation] = await Promise.all([
      custodyRepository.findByReplacementId(replacementId),
      replacementCustodyRepository.listEvents(replacementId),
      replacementCustodyRepository.findInstallation(replacementId),
    ]);
    return { replacement, handovers, events, installation };
  }

  /** Responsible ASF = the linked complaint's assigned Service Center. */
  assertAsfOwnership(actor: AuthenticatedUser, rep: ReplacementRequestRecord, action: string, locationErrorCode = 'FORBIDDEN_LOCATION'): void {
    if (isRole(actor, 'ADMIN')) return;
    if (!isRole(actor, 'ASF', 'ASF_MANAGER')) {
      throw new AppError(`Forbidden: only the responsible Service Center can ${action}.`, 403, 'FORBIDDEN_ROLE');
    }
    const responsible = rep.assignedLocationId || rep.allocatedLocationId;
    if (!actor.locationId || !responsible || actor.locationId !== responsible) {
      throw new AppError(
        `Forbidden: this replacement belongs to another Service Center; only the responsible centre can ${action}.`,
        403,
        locationErrorCode
      );
    }
  }

  async requireLocked(replacementId: string, conn: oracledb.Connection): Promise<ReplacementRequestRecord> {
    if (!(await replacementRequestRepository.lockById(replacementId, conn))) {
      throw new AppError(`Replacement request ${replacementId} not found`, 404, 'NOT_FOUND');
    }
    return (await replacementRequestRepository.findById(replacementId, conn))!;
  }

  /**
   * Qualifies warranty status for a replacement request.
   * IN_WARRANTY: Quotation is NOT_REQUIRED.  OUT_OF_WARRANTY: quotation required (PENDING_QUOTATION).
   */
  async qualifyWarranty(
    replacementId: string,
    warrantyType: 'IN_WARRANTY' | 'OUT_OF_WARRANTY',
    _actor: AuthenticatedUser
  ): Promise<ReplacementRequestRecord> {
    await inTransaction(async (conn) => {
      const rep = await this.requireLocked(replacementId, conn);
      if (!PRE_DISPATCH.includes(rep.status)) {
        throw new AppError(`Cannot change warranty qualification once the replacement is '${rep.status}'.`, 400, 'TERMINAL_STATE');
      }
      const quotationStatus = warrantyType === 'IN_WARRANTY' ? 'NOT_REQUIRED' : 'PENDING_CUSTOMER_APPROVAL';
      const newStatus: ReplacementRequestStatus = warrantyType === 'OUT_OF_WARRANTY' ? 'PENDING_QUOTATION' : 'OPEN';
      await conn.execute(
        `UPDATE REPLACEMENT_REQUESTS
            SET WARRANTY_TYPE = :warrantyType, QUOTATION_STATUS = :quotationStatus, STATUS = :newStatus, UPDATED_AT = SYSTIMESTAMP
          WHERE REPLACEMENT_ID = :replacementId`,
        { warrantyType, quotationStatus, newStatus, replacementId }
      );
    });
    return (await replacementRequestRepository.findById(replacementId))!;
  }

  // ---------------------------------------------------------------------------------------------
  // Out-of-warranty quotation
  // ---------------------------------------------------------------------------------------------

  /**
   * ASF prepares (or revises) the quotation. Each revision increments QUOTATION_VERSION (independent of
   * the appointment version) and invalidates any earlier approval. Not permitted once dispatched.
   */
  async prepareQuotation(
    replacementId: string,
    input: { amount: number; remarks?: string },
    actor: AuthenticatedUser
  ): Promise<ReplacementRequestRecord> {
    await inTransaction(async (conn) => {
      const rep = await this.requireLocked(replacementId, conn);
      this.assertAsfOwnership(actor, rep, 'prepare the quotation');
      if (rep.warrantyType === 'IN_WARRANTY') {
        throw new AppError('Quotations are not permitted for in-warranty replacement requests.', 400, 'IN_WARRANTY_NO_QUOTE');
      }
      if (TERMINAL.includes(rep.status)) {
        throw new AppError(`Cannot prepare quotation for replacement in terminal status '${rep.status}'`, 400, 'TERMINAL_STATE');
      }
      if (!PRE_DISPATCH.includes(rep.status)) {
        throw new AppError(`The quotation cannot be revised after dispatch (current status '${rep.status}').`, 400, 'QUOTATION_LOCKED');
      }
      if (!(input.amount > 0)) {
        throw new AppError('Quotation amount must be greater than zero.', 400, 'INVALID_QUOTATION_AMOUNT');
      }
      await replacementRequestRepository.updateQuotation(
        replacementId,
        { quotationAmount: input.amount, quotationStatus: 'PENDING_CUSTOMER_APPROVAL' },
        conn
      );
      await replacementRequestRepository.updateStatus(replacementId, 'PENDING_QUOTATION', conn);
    });
    return (await replacementRequestRepository.findById(replacementId))!;
  }

  /**
   * Records the customer's decision on the CURRENT quotation version.
   *  APPROVED: binds approval to the version (dispatch requires approvedVersion == currentVersion).
   *  DECLINED: terminal; dispatch permanently blocked and un-dispatched reservations released.
   */
  async recordQuotationDecision(
    replacementId: string,
    input: { decision: 'APPROVED' | 'DECLINED'; quotationVersion?: number; reason?: string },
    actor: AuthenticatedUser
  ): Promise<ReplacementRequestRecord> {
    await inTransaction(async (conn) => {
      const rep = await this.requireLocked(replacementId, conn);
      this.assertAsfOwnership(actor, rep, 'record the customer quotation decision');
      if (rep.warrantyType === 'IN_WARRANTY') {
        throw new AppError('Quotation approval is not required for in-warranty requests', 400, 'IN_WARRANTY_NO_QUOTE');
      }
      if (rep.status === 'CUSTOMER_DECLINED') {
        throw new AppError('Replacement request has already been declined by customer', 400, 'ALREADY_DECLINED');
      }
      if (!PRE_DISPATCH.includes(rep.status)) {
        throw new AppError(`Quotation decision cannot be recorded in status '${rep.status}'.`, 400, 'INVALID_STATUS');
      }
      if (rep.quotationStatus !== 'PENDING_CUSTOMER_APPROVAL') {
        throw new AppError(
          `No quotation is awaiting customer approval (quotation status '${rep.quotationStatus || 'NONE'}').`,
          400,
          'NO_PENDING_QUOTATION'
        );
      }
      const currentVersion = rep.quotationVersion || 1;
      if (input.decision === 'APPROVED' && input.quotationVersion == null) {
        throw new AppError(
          `Approval must reference the quotation version being approved (current version ${currentVersion}).`,
          400,
          'QUOTATION_VERSION_REQUIRED'
        );
      }
      if (input.quotationVersion != null && input.quotationVersion !== currentVersion) {
        throw new AppError(
          `Quotation version mismatch: decision references version ${input.quotationVersion} but the current quotation is version ${currentVersion}. Re-approval of the current quotation is required.`,
          409,
          'STALE_QUOTATION_VERSION'
        );
      }

      const activeReservations = (await inventoryReservationRepository.findActiveByRequestId(rep.requestId, conn)).filter(
        (r) => r.status === 'ACTIVE' && (!rep.requiredPartId || r.partId === rep.requiredPartId)
      );

      await replacementRequestRepository.recordQuotationDecision(
        replacementId,
        {
          decision: input.decision,
          reason: input.reason,
          approvedStatus: activeReservations.length > 0 ? 'STOCK_RESERVED' : 'QUOTATION_APPROVED',
        },
        conn
      );

      if (input.decision === 'DECLINED') {
        // Release eligible un-dispatched reservations, returning reserved quantity to available stock
        for (const resv of activeReservations) {
          const { previousReserved, newReserved } = await inventoryRepository.upsertBalanceDeltas(
            { locationId: resv.locationId, partId: resv.partId, deltaReserved: -resv.quantity },
            conn
          );
          await inventoryReservationRepository.releaseReservation(resv.reservationId, 'Customer declined quotation', conn);
          await inventoryMovementRepository.recordMovement(
            {
              locationId: resv.locationId,
              partId: resv.partId,
              movementType: 'RESERVATION_RELEASE',
              stockBucket: 'RESERVED',
              quantity: -resv.quantity,
              balanceBefore: previousReserved,
              balanceAfter: newReserved,
              referenceType: 'REPLACEMENT_REQUEST',
              referenceId: replacementId,
              actorId: actor.userId,
              actorUsername: actor.username,
              remarks: 'Reservation released: customer declined out-of-warranty quotation',
            },
            conn
          );
        }
      }
    });
    return (await replacementRequestRepository.findById(replacementId))!;
  }

  /**
   * Dispatch prerequisites: not terminal; out-of-warranty requires approval of the CURRENT quotation version.
   */
  async checkDispatchPrerequisites(replacementId: string, conn?: oracledb.Connection): Promise<{ eligible: boolean; reason?: string }> {
    const rep = conn ? await replacementRequestRepository.findById(replacementId, conn) : await this.getReplacementById(replacementId);
    if (!rep) return { eligible: false, reason: `Replacement request ${replacementId} not found` };
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
      const current = rep.quotationVersion || 1;
      if (rep.approvedQuotationVersion != null && rep.approvedQuotationVersion !== current) {
        return {
          eligible: false,
          reason: `Dispatch blocked: approval covers quotation v${rep.approvedQuotationVersion} but the current quotation is v${current}`,
        };
      }
    }
    return { eligible: true };
  }

  // ---------------------------------------------------------------------------------------------
  // Warehouse: allocation, stock shortage and dispatch
  // ---------------------------------------------------------------------------------------------

  /**
   * Reserves one unit at the warehouse. When stock is unavailable the replacement stays open in
   * PENDING_STOCK and a single (deduplicated) 7–10 business-day estimate SMS is queued. Re-running
   * allocation once verified stock is available resumes fulfilment.
   */
  async allocateStock(
    replacementId: string,
    warehouseId: string,
    actor: AuthenticatedUser
  ): Promise<{ status: ReplacementRequestStatus; allocated: boolean; message: string }> {
    if (!isRole(actor, 'WAREHOUSE', 'ADMIN')) {
      throw new AppError('Forbidden: only warehouse staff can allocate replacement stock.', 403, 'FORBIDDEN_ROLE');
    }
    const warehouse = await locationRepository.findById(warehouseId);
    if (!warehouse || warehouse.isActive !== 'Y' || !['CENTRAL_WAREHOUSE', 'REGIONAL_WAREHOUSE'].includes(warehouse.partyType)) {
      throw new AppError('Allocation must be made from an active warehouse location.', 400, 'INVALID_WAREHOUSE');
    }

    let outboxShortage: OutboxRecord | undefined;
    const result = await inTransaction(async (conn) => {
      const rep = await this.requireLocked(replacementId, conn);
      const prereq = await this.checkDispatchPrerequisites(replacementId, conn);
      if (!prereq.eligible) {
        throw new AppError(prereq.reason!, 400, 'DISPATCH_PREREQUISITES_NOT_MET');
      }
      if (rep.status === 'STOCK_RESERVED') {
        throw new AppError('A replacement unit is already reserved for this request.', 409, 'ALREADY_RESERVED');
      }
      if (!['OPEN', 'QUOTATION_APPROVED', 'PENDING_STOCK'].includes(rep.status)) {
        throw new AppError(`Stock cannot be allocated in status '${rep.status}'.`, 400, 'INVALID_STATUS');
      }
      if (!rep.requiredPartId) {
        throw new AppError('Replacement request does not have a required replacement part assigned.', 400, 'NO_PART_ASSIGNED');
      }

      const balance = await inventoryRepository.getBalance(warehouseId, rep.requiredPartId, conn, true);
      const availableQty = balance ? balance.qtyOnHand - balance.qtyReserved : 0;

      if (availableQty >= 1) {
        const parts = await serviceRequestPartsRepository.listPartsByRequestId(rep.requestId, conn);
        const existingEntry = parts.find((p) => p.partId === rep.requiredPartId);
        const partEntryId =
          existingEntry?.partEntryId ||
          (await serviceRequestPartsRepository.addPart(
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
          ));

        await inventoryReservationRepository.createReservation(
          { requestId: rep.requestId, partEntryId, locationId: warehouseId, partId: rep.requiredPartId, quantity: 1, reservedBy: actor.userId },
          conn
        );
        const { previousReserved, newReserved } = await inventoryRepository.upsertBalanceDeltas(
          { locationId: warehouseId, partId: rep.requiredPartId, deltaOnHand: 0, deltaReserved: 1, deltaInTransit: 0 },
          conn
        );
        await inventoryMovementRepository.recordMovement(
          {
            locationId: warehouseId,
            partId: rep.requiredPartId,
            movementType: 'RESERVATION_HOLD',
            stockBucket: 'RESERVED',
            quantity: 1,
            balanceBefore: previousReserved,
            balanceAfter: newReserved,
            referenceType: 'REPLACEMENT_REQUEST',
            referenceId: replacementId,
            actorId: actor.userId,
            actorUsername: actor.username,
            remarks: `Replacement unit reserved for ${rep.jobNumber || rep.requestId}`,
          },
          conn
        );
        await replacementRequestRepository.updateAllocation(
          replacementId,
          { status: 'STOCK_RESERVED', stockStatus: 'ALLOCATED', allocatedLocationId: warehouseId },
          conn
        );
        return {
          status: 'STOCK_RESERVED' as ReplacementRequestStatus,
          allocated: true,
          message:
            rep.status === 'PENDING_STOCK'
              ? 'Stock is now available: replacement unit reserved and fulfilment resumed.'
              : 'Required replacement unit successfully reserved at central warehouse.',
        };
      }

      await replacementRequestRepository.updateAllocation(
        replacementId,
        { status: 'PENDING_STOCK', stockStatus: 'PENDING_STOCK', allocatedLocationId: warehouseId },
        conn
      );
      if (!(await notificationRepository.hasShortageNotification(replacementId))) {
        const serviceReq = await serviceRequestRepository.findById(rep.requestId, conn);
        const customerPhone = serviceReq?.customerPhone || rep.customerPhone;
        if (customerPhone) {
          const encrypted = encryptNotificationPayload(
            notificationService.buildSmsStockShortageMessage({ jobNumber: serviceReq?.jobNumber || rep.jobNumber || rep.requestId })
          );
          outboxShortage = await notificationRepository.enqueueNotification(
            {
              requestId: rep.requestId,
              replacementId,
              channel: 'SMS',
              recipient: customerPhone,
              templateCode: 'SMS_STOCK_SHORTAGE',
              messageBody:
                'Dear Customer, The required replacement part is currently unavailable. It is expected to be dispatched within 7–10 business days.',
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
      return {
        status: 'PENDING_STOCK' as ReplacementRequestStatus,
        allocated: false,
        message: 'Part is currently out of stock. Transitioned to PENDING_STOCK; 7–10 business day dispatch estimate SMS queued to customer.',
      };
    });

    if (outboxShortage) {
      notificationService.processNotification(outboxShortage).catch(() => {});
    }
    return result;
  }

  /**
   * Warehouse dispatches the reserved unit to the responsible ASF. The scanned barcode must match the
   * required part before any stock moves: on-hand -1 and reserved -1 at the warehouse, in-transit +1.
   */
  async dispatchStockToAsf(
    replacementId: string,
    input: { courierName: string; docketNumber: string; remarks?: string } & Partial<BarcodeCapture>,
    actor: AuthenticatedUser
  ): Promise<ReplacementRequestRecord> {
    if (!isRole(actor, 'WAREHOUSE', 'ADMIN')) {
      throw new AppError('Forbidden: Only warehouse staff or administrators can dispatch stock', 403, 'FORBIDDEN');
    }

    await inTransaction(async (conn) => {
      const rep = await this.requireLocked(replacementId, conn);
      const prereq = await this.checkDispatchPrerequisites(replacementId, conn);
      if (!prereq.eligible) {
        throw new AppError(prereq.reason!, 400, 'DISPATCH_PREREQUISITES_NOT_MET');
      }
      if (rep.status !== 'STOCK_RESERVED') {
        throw new AppError(
          `Cannot dispatch replacement in status '${rep.status}'. A unit must first be reserved ('STOCK_RESERVED').`,
          400,
          'INVALID_STATUS'
        );
      }
      if (!rep.requiredPartId || !rep.allocatedLocationId) {
        throw new AppError('Replacement has no reserved part and warehouse.', 400, 'NO_PART_ASSIGNED');
      }

      // Barcode first: a mismatch leaves stock and custody untouched
      const scan = await assertBarcodeMatchesPart(
        rep.requiredPartId,
        input.barcode ? { barcode: input.barcode, captureMethod: input.captureMethod } : undefined,
        { stage: 'warehouse dispatch', replacementId, actor },
        conn
      );

      const sr = await serviceRequestRepository.findById(rep.requestId, conn);
      const toLocationId = sr?.assignedLocationId;
      if (!toLocationId) {
        throw new AppError('The linked complaint has no responsible Service Center to dispatch to.', 400, 'NO_RESPONSIBLE_ASF');
      }

      const reservations = await inventoryReservationRepository.findActiveByRequestId(rep.requestId, conn);
      const reservation = reservations.find(
        (r) => r.status === 'ACTIVE' && r.partId === rep.requiredPartId && r.locationId === rep.allocatedLocationId
      );
      if (!reservation) {
        throw new AppError('No active stock reservation exists for this replacement; re-allocate before dispatch.', 409, 'RESERVATION_MISSING');
      }
      await inventoryReservationRepository.fulfillReservation(reservation.reservationId, conn);
      const { previousOnHand, newOnHand } = await inventoryRepository.upsertBalanceDeltas(
        { locationId: rep.allocatedLocationId, partId: rep.requiredPartId, deltaOnHand: -1, deltaReserved: -1, deltaInTransit: 1 },
        conn
      );

      const dispatchNumber = `DC-${Date.now().toString(36).toUpperCase()}`;
      await inventoryMovementRepository.recordMovement(
        {
          locationId: rep.allocatedLocationId,
          partId: rep.requiredPartId,
          movementType: 'PART_DISPATCH',
          stockBucket: 'ON_HAND',
          quantity: -1,
          balanceBefore: previousOnHand,
          balanceAfter: newOnHand,
          referenceType: 'DELIVERY_CHALLAN',
          referenceId: dispatchNumber,
          sourceLocationId: rep.allocatedLocationId,
          destLocationId: toLocationId,
          actorId: actor.userId,
          actorUsername: actor.username,
          remarks: `Replacement unit dispatched via ${input.courierName} (${input.docketNumber})`,
        },
        conn
      );

      const amount = rep.quotationAmount || 0;
      const dispatchId = await stockDispatchRepository.createDispatch(
        {
          dispatchNumber,
          documentType: 'DELIVERY_CHALLAN',
          fromLocationId: rep.allocatedLocationId,
          toLocationId,
          requestId: rep.requestId,
          courierName: input.courierName,
          docketNumber: input.docketNumber,
          dispatchedBy: actor.userId,
          totalQuantity: 1,
          subtotalAmount: amount,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          totalAmount: amount,
          remarks: input.remarks,
          items: [
            {
              partId: rep.requiredPartId,
              quantity: 1,
              unitPrice: amount,
              cgstRate: 0,
              sgstRate: 0,
              igstRate: 0,
              cgstAmount: 0,
              sgstAmount: 0,
              igstAmount: 0,
              totalAmount: amount,
            },
          ],
        },
        conn
      );

      await replacementRequestRepository.recordDispatch(replacementId, { dispatchId, status: 'DISPATCHED_TO_ASF' }, conn);
      await replacementCustodyRepository.recordEvent(
        {
          replacementId,
          partId: rep.requiredPartId,
          eventType: 'WAREHOUSE_DISPATCH',
          custodianType: 'IN_TRANSIT',
          locationId: toLocationId,
          scannedBarcode: scan.barcode,
          captureMethod: scan.captureMethod,
          actorId: actor.userId,
          actorRole: actor.roles[0] || 'WAREHOUSE',
          remarks: `Challan ${dispatchNumber} via ${input.courierName} (${input.docketNumber})`,
        },
        conn
      );
      logger.info(`[REPLACEMENT] ${replacementId} dispatched to ASF ${toLocationId} (${dispatchNumber})`);
    });
    return (await replacementRequestRepository.findById(replacementId))!;
  }

  // ---------------------------------------------------------------------------------------------
  // ASF: receipt, engineer assignment / scheduling
  // ---------------------------------------------------------------------------------------------

  /**
   * The responsible ASF acknowledges ACTUAL receipt by scanning the unit. Stock moves from the
   * warehouse's in-transit bucket to the ASF's on-hand stock and the challan is acknowledged.
   */
  async acknowledgeAsfReceipt(
    replacementId: string,
    actor: AuthenticatedUser,
    capture?: Partial<BarcodeCapture> & { remarks?: string }
  ): Promise<ReplacementRequestRecord> {
    await inTransaction(async (conn) => {
      const rep = await this.requireLocked(replacementId, conn);
      this.assertAsfOwnership(actor, rep, 'acknowledge receipt of this replacement unit');
      if (rep.status !== 'DISPATCHED_TO_ASF') {
        throw new AppError(
          `Cannot acknowledge receipt for replacement in status '${rep.status}'. Must be 'DISPATCHED_TO_ASF'.`,
          400,
          'INVALID_STATUS'
        );
      }
      const scan = await assertBarcodeMatchesPart(
        rep.requiredPartId!,
        capture?.barcode ? { barcode: capture.barcode, captureMethod: capture.captureMethod } : undefined,
        { stage: 'Service Center receipt', replacementId, actor },
        conn
      );
      const asfLocationId = rep.assignedLocationId!;

      if (rep.dispatchId) {
        const dispatch = await stockDispatchRepository.getDispatchById(rep.dispatchId);
        if (dispatch && dispatch.status !== 'ACKNOWLEDGED') {
          await stockDispatchRepository.acknowledgeDispatch(rep.dispatchId, actor.userId, conn);
          await inventoryRepository.upsertBalanceDeltas(
            { locationId: dispatch.fromLocationId, partId: rep.requiredPartId!, deltaInTransit: -1 },
            conn
          );
          const { previousOnHand, newOnHand } = await inventoryRepository.upsertBalanceDeltas(
            { locationId: asfLocationId, partId: rep.requiredPartId!, deltaOnHand: 1 },
            conn
          );
          await inventoryMovementRepository.recordMovement(
            {
              locationId: asfLocationId,
              partId: rep.requiredPartId!,
              movementType: 'PART_RECEIPT',
              stockBucket: 'ON_HAND',
              quantity: 1,
              balanceBefore: previousOnHand,
              balanceAfter: newOnHand,
              referenceType: dispatch.documentType,
              referenceId: dispatch.dispatchNumber,
              sourceLocationId: dispatch.fromLocationId,
              destLocationId: asfLocationId,
              actorId: actor.userId,
              actorUsername: actor.username,
              remarks: `Replacement unit received at Service Center (Challan ${dispatch.dispatchNumber})`,
            },
            conn
          );
        }
      }

      await replacementRequestRepository.recordAsfReceipt(replacementId, asfLocationId, conn);
      await replacementCustodyRepository.recordEvent(
        {
          replacementId,
          partId: rep.requiredPartId!,
          eventType: 'ASF_RECEIPT',
          custodianType: 'ASF',
          locationId: asfLocationId,
          scannedBarcode: scan.barcode,
          captureMethod: scan.captureMethod,
          actorId: actor.userId,
          actorRole: actor.roles[0] || 'ASF',
          remarks: capture?.remarks,
        },
        conn
      );
    });
    return (await replacementRequestRepository.findById(replacementId))!;
  }

  async assertActiveEngineer(engineerId: string): Promise<{ fullName: string; phoneNumber?: string }> {
    const engineer = await userRepository.findById(engineerId);
    if (!engineer || engineer.isActive !== 'Y') {
      throw new AppError('Selected engineer does not exist or is inactive.', 400, 'INVALID_ENGINEER');
    }
    const roles = await rbacRepository.getUserRoles(engineerId);
    if (!roles.includes('ENGINEER')) {
      throw new AppError('Selected user is not a field engineer.', 400, 'INVALID_ENGINEER_ROLE');
    }
    return { fullName: engineer.fullName, phoneNumber: engineer.phoneNumber };
  }

  /**
   * ASF assigns the replacement engineer and schedules (or reschedules) the installation visit.
   * Appointment >= 60 minutes ahead; Arrival Happy Code SMS scheduled for appointment - 60 minutes;
   * rescheduling invalidates previous unused codes and supersedes their pending SMS.
   */
  async scheduleInstallation(
    replacementId: string,
    input: { engineerId: string; appointmentDate: string; appointmentSlot: string; remarks?: string },
    actor: AuthenticatedUser
  ): Promise<ReplacementRequestRecord> {
    if (!isRole(actor, 'ASF', 'ASF_MANAGER', 'ADMIN')) {
      throw new AppError('Forbidden: only the responsible Service Center schedules replacement engineers.', 403, 'FORBIDDEN_ROLE');
    }
    const appointmentDate = new Date(input.appointmentDate);
    if (isNaN(appointmentDate.getTime())) {
      throw new AppError('Invalid appointment date format', 400, 'INVALID_APPOINTMENT_DATE');
    }
    if (appointmentDate.getTime() < Date.now() + 60 * 60 * 1000 - 5000) {
      throw new AppError('Appointment must be scheduled at least 60 minutes in the future', 400, 'INVALID_APPOINTMENT_TIME');
    }
    const engineer = await this.assertActiveEngineer(input.engineerId);

    let outboxItem: OutboxRecord | undefined;
    let isDueImmediately = false;
    await inTransaction(async (conn) => {
      const rep = await this.requireLocked(replacementId, conn);
      this.assertAsfOwnership(actor, rep, 'schedule the installation');
      if (!['RECEIVED_AT_ASF', 'HANDED_OVER_TO_ENGINEER', 'APPOINTMENT_SCHEDULED'].includes(rep.status)) {
        throw new AppError(
          `Installation can be scheduled only after the Service Center has received the unit (current status '${rep.status}').`,
          400,
          'INSTALLATION_PREREQUISITES_NOT_MET'
        );
      }
      const handovers = await custodyRepository.findByReplacementId(replacementId, conn);
      const activeHandover = handovers.find((h) => h.status === 'PENDING_COLLECTION' || h.status === 'COLLECTED');
      if (activeHandover && activeHandover.engineerId !== input.engineerId) {
        throw new AppError(
          'The replacement unit is handed to a different engineer. The installation engineer must be its custodian.',
          409,
          'ENGINEER_CUSTODY_MISMATCH'
        );
      }

      const nextVersion = (rep.appointmentVersion || 1) + 1;
      await replacementVerificationService.invalidateUnusedCodes(replacementId, `Rescheduled to appointment v${nextVersion}`, conn);
      await notificationRepository.supersedePending(replacementId, 'SMS_02_APPOINTMENT', conn);

      const issuance = await replacementVerificationService.issueVerificationCode(
        { replacementId, visitNumber: 1, appointmentVersion: nextVersion, assignedEngineerId: input.engineerId, purpose: 'ARRIVAL' },
        actor,
        conn
      );

      const scheduledFor = new Date(appointmentDate.getTime() - 60 * 60 * 1000);
      isDueImmediately = scheduledFor.getTime() <= Date.now();
      const sr = await serviceRequestRepository.findById(rep.requestId, conn);
      if (sr?.customerPhone) {
        const encrypted = encryptNotificationPayload(
          notificationService.buildSms2Message({
            jobNumber: sr.jobNumber,
            techName: engineer.fullName,
            techMobile: engineer.phoneNumber || 'N/A',
            appointmentDatetime: `${appointmentDate.toLocaleDateString('en-IN')} (${input.appointmentSlot})`,
            checkinOtp: issuance.plainCode,
          })
        );
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
        { engineerId: input.engineerId, appointmentSlot: appointmentDate, appointmentVersion: nextVersion },
        conn
      );
      // Scheduling must not erase recorded collection progress
      if (activeHandover?.status === 'COLLECTED') {
        await replacementRequestRepository.updateStatus(replacementId, 'HANDED_OVER_TO_ENGINEER', conn);
      }
    });

    if (outboxItem && isDueImmediately) {
      notificationService.processNotification(outboxItem).catch(() => {});
    }
    return (await replacementRequestRepository.findById(replacementId))!;
  }

  /** Resend of the Arrival Happy Code for the current appointment (established cap: 5). */
  async regenerateArrivalCode(replacementId: string, actor: AuthenticatedUser): Promise<{ smsQueued: boolean }> {
    let outboxItem: OutboxRecord | undefined;
    await inTransaction(async (conn) => {
      const rep = await this.requireLocked(replacementId, conn);
      this.assertAsfOwnership(actor, rep, 'resend the Arrival Happy Code');
      if (!['APPOINTMENT_SCHEDULED', 'HANDED_OVER_TO_ENGINEER'].includes(rep.status) || !rep.assignedEngineerId) {
        throw new AppError('An Arrival Happy Code can be resent only for a scheduled visit.', 400, 'INVALID_STATUS');
      }
      const issuance = await replacementVerificationService.regenerateCode(replacementId, rep.appointmentVersion || 1, 'ARRIVAL', conn);
      await notificationRepository.supersedePending(replacementId, 'SMS_02_APPOINTMENT', conn);
      const sr = await serviceRequestRepository.findById(rep.requestId, conn);
      if (sr?.customerPhone) {
        const encrypted = encryptNotificationPayload(
          `Dear Customer, Please share Arrival Happy Code ${issuance.plainCode} with our technician at the time of the replacement visit for Service Request #${sr.jobNumber}.`
        );
        outboxItem = await notificationRepository.enqueueNotification(
          {
            requestId: rep.requestId,
            replacementId,
            appointmentVersion: rep.appointmentVersion || 1,
            channel: 'SMS',
            recipient: sr.customerPhone,
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
    });
    if (outboxItem) notificationService.processNotification(outboxItem).catch(() => {});
    return { smsQueued: Boolean(outboxItem) };
  }

  // ---------------------------------------------------------------------------------------------
  // Engineer: arrival and installation
  // ---------------------------------------------------------------------------------------------

  /**
   * Assigned engineer verifies the Arrival Happy Code. Requires the engineer to hold the collected
   * unit. On success the separate Completion Happy Code is generated and queued immediately.
   */
  async verifyInstallationArrival(
    replacementId: string,
    code: string,
    actor: AuthenticatedUser
  ): Promise<{ success: boolean; status: ReplacementRequestStatus; replacementStatus: ReplacementRequestStatus; message: string }> {
    const rep = await this.getReplacementById(replacementId);
    if (rep.assignedEngineerId && rep.assignedEngineerId !== actor.userId) {
      throw new AppError('Forbidden: Only the assigned field engineer can verify this Happy Code.', 403, 'ENGINEER_MISMATCH');
    }
    if (!isRole(actor, 'ENGINEER')) {
      throw new AppError('Forbidden: Arrival is verified by the assigned field engineer at the customer location.', 403, 'FORBIDDEN_TECHNICIAN');
    }
    if (['TECHNICIAN_CHECKED_IN', 'INSTALLATION_VERIFIED', 'CLOSED'].includes(rep.status)) {
      throw new AppError('Arrival has already been verified; the Arrival Happy Code cannot be reused.', 409, 'CODE_ALREADY_USED');
    }
    if (!['APPOINTMENT_SCHEDULED', 'HANDED_OVER_TO_ENGINEER'].includes(rep.status)) {
      throw new AppError(`Arrival cannot be verified in status '${rep.status}'.`, 400, 'INVALID_STATUS');
    }
    const handovers = await custodyRepository.findByReplacementId(replacementId);
    if (!handovers.some((h) => h.engineerId === actor.userId && h.status === 'COLLECTED')) {
      throw new AppError('You must collect the replacement unit from the Service Center before the customer visit.', 400, 'PART_NOT_COLLECTED');
    }

    let outboxItem: OutboxRecord | undefined;
    await inTransaction(async (conn) => {
      await replacementVerificationService.verifyCode(
        { replacementId, visitNumber: 1, appointmentVersion: rep.appointmentVersion || 1, purpose: 'ARRIVAL', happyCode: code },
        actor,
        conn
      );
      await replacementRequestRepository.updateStatus(replacementId, 'TECHNICIAN_CHECKED_IN', conn);

      // Issue the Completion Happy Code unless a usable one already exists for this cycle
      const existing = await replacementVerificationService.findUsableCode(replacementId, rep.appointmentVersion || 1, 'COMPLETION', conn);
      if (!existing) {
        const issuance = await replacementVerificationService.issueVerificationCode(
          {
            replacementId,
            visitNumber: 1,
            appointmentVersion: rep.appointmentVersion || 1,
            assignedEngineerId: actor.userId,
            purpose: 'COMPLETION',
          },
          actor,
          conn
        );
        const sr = await serviceRequestRepository.findById(rep.requestId, conn);
        if (sr?.customerPhone) {
          const encrypted = encryptNotificationPayload(
            notificationService.buildSms4Message({ jobNumber: sr.jobNumber, happyCode: issuance.plainCode })
          );
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
      }
    });
    if (outboxItem) notificationService.processNotification(outboxItem).catch(() => {});

    return {
      success: true,
      status: 'TECHNICIAN_CHECKED_IN',
      replacementStatus: 'TECHNICIAN_CHECKED_IN',
      message: 'Arrival Happy Code verified. Completion Happy Code issued to customer.',
    };
  }

  /**
   * Assigned engineer records the installation. The installed part identifier (scanned or entered)
   * must match the required part — a wrong part is rejected before any code is consumed or custody
   * changes. Records installation evidence (part code, optional serial, engineer, timestamp, custody
   * reference); installation photos are attached via the existing INSTALLATION_PHOTO attachments.
   */
  async completeInstallation(
    replacementId: string,
    input: {
      completionCode: string;
      installedPartCode?: string;
      captureMethod?: 'SCANNER' | 'MANUAL';
      targetSerialNo?: string;
      remarks?: string;
    },
    actor: AuthenticatedUser
  ): Promise<ReplacementRequestRecord> {
    const rep = await this.getReplacementById(replacementId);
    if (!isRole(actor, 'ENGINEER') || rep.assignedEngineerId !== actor.userId) {
      throw new AppError('Forbidden: Only the assigned engineer can complete this replacement installation', 403, 'FORBIDDEN_TECHNICIAN');
    }
    if (rep.status !== 'TECHNICIAN_CHECKED_IN') {
      throw new AppError(
        `Installation can be completed only after arrival verification (current status '${rep.status}').`,
        400,
        'INVALID_STATUS'
      );
    }
    const handovers = await custodyRepository.findByReplacementId(replacementId);
    const custody = handovers.find((h) => h.engineerId === actor.userId && h.status === 'COLLECTED');
    if (!custody) {
      throw new AppError('No collected replacement unit is in your custody for this request.', 400, 'PART_NOT_COLLECTED');
    }
    // Wrong-part prevention happens before the Completion Happy Code is consumed
    let scan: { barcode: string; captureMethod: 'SCANNER' | 'MANUAL' };
    try {
      scan = await assertBarcodeMatchesPart(
        rep.requiredPartId!,
        input.installedPartCode ? { barcode: input.installedPartCode, captureMethod: input.captureMethod } : undefined,
        { stage: 'customer installation', replacementId, actor }
      );
    } catch (err) {
      if (err instanceof AppError && err.code === 'BARCODE_MISMATCH') {
        throw new AppError(err.message.replace('Barcode mismatch', 'Wrong part'), 409, 'WRONG_PART_INSTALLATION', err.details);
      }
      throw err;
    }
    const serial = input.targetSerialNo?.trim() || undefined;
    if (serial && !/^[A-Za-z0-9\-/.]{3,100}$/.test(serial)) {
      throw new AppError('Serial number contains unsupported characters.', 400, 'INVALID_SERIAL_NUMBER');
    }

    await inTransaction(async (conn) => {
      await replacementVerificationService.verifyCode(
        {
          replacementId,
          visitNumber: 1,
          appointmentVersion: rep.appointmentVersion || 1,
          purpose: 'COMPLETION',
          happyCode: input.completionCode,
        },
        actor,
        conn
      );
      const locked = await this.requireLocked(replacementId, conn);
      if (locked.status !== 'TECHNICIAN_CHECKED_IN') {
        throw new AppError(`Conflict: replacement status changed concurrently to '${locked.status}'`, 409, 'CONCURRENCY_CONFLICT');
      }
      await replacementCustodyRepository.recordInstallation(
        {
          replacementId,
          requestId: rep.requestId,
          handoverId: custody.handoverId,
          partId: rep.requiredPartId!,
          installedPartCode: scan.barcode,
          captureMethod: scan.captureMethod,
          serialNumber: serial,
          engineerId: actor.userId,
          remarks: input.remarks,
        },
        conn
      );
      await custodyRepository.markInstalled(custody.handoverId, actor.userId, conn);
      await replacementRequestRepository.markInstallationVerified(replacementId, actor.userId, conn);
      await replacementCustodyRepository.recordEvent(
        {
          replacementId,
          handoverId: custody.handoverId,
          partId: rep.requiredPartId!,
          eventType: 'CUSTOMER_INSTALLATION',
          custodianType: 'CUSTOMER',
          custodianUserId: actor.userId,
          scannedBarcode: scan.barcode,
          captureMethod: scan.captureMethod,
          actorId: actor.userId,
          actorRole: 'ENGINEER',
          remarks: serial ? `Serial ${serial}` : input.remarks,
        },
        conn
      );
    });
    return (await replacementRequestRepository.findById(replacementId))!;
  }

  /**
   * Installation photographs via the existing attachment infrastructure (private storage, MIME
   * verification, SHA-256) recorded against the linked complaint as INSTALLATION_PHOTO.
   */
  async uploadInstallationPhoto(
    replacementId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    actor: AuthenticatedUser
  ) {
    const rep = await this.getReplacementById(replacementId);
    if (!isRole(actor, 'ENGINEER') || rep.assignedEngineerId !== actor.userId) {
      throw new AppError('Forbidden: only the assigned installation engineer can attach installation photos.', 403, 'FORBIDDEN_TECHNICIAN');
    }
    if (!['TECHNICIAN_CHECKED_IN', 'INSTALLATION_VERIFIED'].includes(rep.status)) {
      throw new AppError('Installation photos can be added once arrival has been verified at the customer site.', 400, 'INVALID_STATUS');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new AppError('Installation evidence must be an image.', 400, 'INVALID_FILE_TYPE');
    }
    const stored = await storageService.saveFile(file);
    return attachmentRepository.createAttachment({
      requestId: rep.requestId,
      attachmentType: 'INSTALLATION_PHOTO',
      fileName: stored.fileName,
      originalName: stored.originalName,
      storedPath: stored.storedPath,
      mimeType: stored.mimeType,
      fileSizeBytes: stored.fileSizeBytes,
      sha256Checksum: stored.sha256Checksum,
      uploadedByUserId: actor.userId,
      uploadedByUsername: actor.username,
    });
  }

  async listInstallationPhotos(replacementId: string) {
    const rep = await this.getReplacementById(replacementId);
    const all = await attachmentRepository.listByRequestId(rep.requestId);
    return all.filter((a: any) => a.attachmentType === 'INSTALLATION_PHOTO');
  }

  /** Kept for API compatibility: installation is gated by receipt, custody and arrival verification. */
  async checkInstallationPrerequisites(replacementId: string): Promise<{ eligible: boolean; reason?: string }> {
    const rep = await this.getReplacementById(replacementId);
    if (TERMINAL.includes(rep.status)) {
      return { eligible: false, reason: `Installation ineligible: Replacement in terminal status '${rep.status}'` };
    }
    if (!['RECEIVED_AT_ASF', 'HANDED_OVER_TO_ENGINEER', 'APPOINTMENT_SCHEDULED', 'TECHNICIAN_CHECKED_IN'].includes(rep.status)) {
      return { eligible: false, reason: `Installation requires the unit at the Service Center (current status: '${rep.status}')` };
    }
    return { eligible: true };
  }

  // ---------------------------------------------------------------------------------------------
  // Warehouse: final closure
  // ---------------------------------------------------------------------------------------------

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

  /** Warehouse performs final closure after verified installation. Engineers cannot close. */
  async closeReplacement(replacementId: string, actor: AuthenticatedUser): Promise<ReplacementRequestRecord> {
    if (!isRole(actor, 'WAREHOUSE', 'ADMIN')) {
      throw new AppError('Forbidden: final replacement closure is performed by the warehouse.', 403, 'FORBIDDEN_ROLE');
    }
    const prereq = await this.checkWarehouseClosurePrerequisites(replacementId);
    if (!prereq.eligible) {
      throw new AppError(prereq.reason!, 400, 'CLOSURE_PREREQUISITES_NOT_MET');
    }
    await inTransaction(async (conn) => {
      const rep = await this.requireLocked(replacementId, conn);
      if (rep.status !== 'INSTALLATION_VERIFIED') {
        throw new AppError(`Conflict: replacement status changed concurrently to '${rep.status}'`, 409, 'CONCURRENCY_CONFLICT');
      }
      await replacementRequestRepository.closeReplacement(replacementId, actor.userId, conn);
      if (rep.requiredPartId) {
        await replacementCustodyRepository.recordEvent(
          {
            replacementId,
            partId: rep.requiredPartId,
            eventType: 'REPLACEMENT_CLOSURE',
            custodianType: 'CUSTOMER',
            actorId: actor.userId,
            actorRole: actor.roles[0] || 'WAREHOUSE',
            remarks: 'Replacement closed after verified installation',
          },
          conn
        );
      }
      await systemAuditRepository.recordEvent(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] || 'WAREHOUSE',
          actorUsername: actor.username,
          action: 'REPLACEMENT_CLOSE',
          resource: 'REPLACEMENT_REQUESTS',
          recordIdentifier: replacementId,
          outcome: 'SUCCESS',
        },
        conn
      );
    });
    return (await replacementRequestRepository.findById(replacementId))!;
  }
}

export const replacementService = new ReplacementService();
