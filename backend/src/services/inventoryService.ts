import oracledb from 'oracledb';
import { getOracleConnection } from '../database/oraclePool.js';
import { inventoryMovementRepository } from '../database/repositories/inventoryMovementRepository.js';
import { inventoryRepository } from '../database/repositories/inventoryRepository.js';
import { inventoryReservationRepository } from '../database/repositories/inventoryReservationRepository.js';
import { goodsReceiptRepository } from '../database/repositories/goodsReceiptRepository.js';
import { stockDispatchRepository } from '../database/repositories/stockDispatchRepository.js';
import { stockReturnRepository } from '../database/repositories/stockReturnRepository.js';
import { stockAdjustmentRepository } from '../database/repositories/stockAdjustmentRepository.js';
import { partRepository } from '../database/repositories/partRepository.js';
import { locationRepository } from '../database/repositories/locationRepository.js';
import { serviceRequestRepository } from '../database/repositories/serviceRequestRepository.js';
import { serviceRequestEventRepository } from '../database/repositories/serviceRequestEventRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser } from '../types/auth.js';
import {
  DispatchDocumentType,
  GoodsReceiptRecord,
  InventoryBalanceRecord,
  InventoryMovementRecord,
  InventoryReconciliationRecord,
  InventoryReservationRecord,
  ReturnDisposition,
  StockAdjustmentReason,
  StockAdjustmentRecord,
  StockAdjustmentType,
  StockDispatchRecord,
  StockReturnRecord,
} from '../types/inventory.js';

export class InventoryService {
  /**
   * Generates unique sequence-based business document references
   */
  private generateDocNumber(prefix: string): string {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${yyyy}${mm}${dd}-${rand}`;
  }

  // ============================================================================
  // 1. Stock Balances & Availability Lookup
  // ============================================================================

  async listStockBalances(options: {
    locationId?: string;
    partId?: string;
    search?: string;
    lowStockOnly?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ items: InventoryBalanceRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    return inventoryRepository.listBalances(options);
  }

  async getStockBalance(locationId: string, partId: string): Promise<InventoryBalanceRecord | null> {
    return inventoryRepository.getBalance(locationId, partId);
  }

  // ============================================================================
  // 2. Goods Receipt Notes (GRN) Inbound Receiving
  // ============================================================================

  async processGoodsReceipt(
    input: {
      receivingLocationId: string;
      supplierName: string;
      supplierInvoiceNo: string;
      supplierInvoiceDate: string;
      poNumber?: string;
      gateEntryNo?: string;
      vehicleNo?: string;
      remarks?: string;
      items: Array<{
        partId: string;
        receivedQty: number;
        acceptedQty: number;
        rejectedQty: number;
        unitPrice: number;
        remarks?: string;
      }>;
    },
    actor: AuthenticatedUser
  ): Promise<{ grnId: string; grnNumber: string }> {
    if (!input.items || input.items.length === 0) {
      throw new AppError('At least one item must be received in a Goods Receipt Note.', 400, 'NO_ITEMS');
    }

    const conn = await getOracleConnection();

    try {
      const location = await locationRepository.findById(input.receivingLocationId);
      if (!location || location.isActive !== 'Y') {
        throw new AppError('Receiving warehouse location not found or inactive.', 404, 'LOCATION_NOT_FOUND');
      }

      const grnNumber = this.generateDocNumber('GRN');
      let totalItems = 0;
      let totalQuantity = 0;

      // Validate parts and quantities
      for (const item of input.items) {
        if (item.receivedQty <= 0) {
          throw new AppError('Received quantity must be greater than zero.', 400, 'INVALID_QUANTITY');
        }
        if (item.acceptedQty < 0 || item.rejectedQty < 0) {
          throw new AppError('Accepted and rejected quantities cannot be negative.', 400, 'INVALID_QUANTITY');
        }
        if (item.acceptedQty + item.rejectedQty !== item.receivedQty) {
          throw new AppError(
            `Sum of accepted (${item.acceptedQty}) and rejected (${item.rejectedQty}) quantities must match received quantity (${item.receivedQty}).`,
            400,
            'QUANTITY_MISMATCH'
          );
        }

        const part = await partRepository.findById(item.partId);
        if (!part || part.isActive !== 'Y') {
          throw new AppError(`Part ${item.partId} not found or inactive.`, 404, 'PART_NOT_FOUND');
        }

        totalItems += 1;
        totalQuantity += item.acceptedQty;
      }

      // Record GRN Header and Items
      const grnId = await goodsReceiptRepository.createGrn(
        {
          grnNumber,
          receivingLocationId: input.receivingLocationId,
          supplierName: input.supplierName,
          supplierInvoiceNo: input.supplierInvoiceNo,
          supplierInvoiceDate: input.supplierInvoiceDate,
          poNumber: input.poNumber,
          gateEntryNo: input.gateEntryNo,
          vehicleNo: input.vehicleNo,
          receivedBy: actor.userId,
          totalItems,
          totalQuantity,
          remarks: input.remarks,
          items: input.items,
        },
        conn
      );

      // Atomically increment on-hand stock and write movement ledger for accepted quantities
      for (const item of input.items) {
        if (item.acceptedQty > 0) {
          const { previousOnHand, newOnHand } = await inventoryRepository.upsertBalanceDeltas(
            {
              locationId: input.receivingLocationId,
              partId: item.partId,
              deltaOnHand: item.acceptedQty,
            },
            conn
          );

          await inventoryMovementRepository.recordMovement(
            {
              locationId: input.receivingLocationId,
              partId: item.partId,
              movementType: 'GRN_RECEIPT',
              stockBucket: 'ON_HAND',
              quantity: item.acceptedQty,
              balanceBefore: previousOnHand,
              balanceAfter: newOnHand,
              referenceType: 'GRN',
              referenceId: grnNumber,
              actorId: actor.userId,
              actorUsername: actor.username,
              remarks: `Inbound receipt via GRN ${grnNumber} from ${input.supplierName}`,
            },
            conn
          );
        }
      }

      await conn.commit();
      return { grnId, grnNumber };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  async listGoodsReceipts(options: {
    receivingLocationId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: GoodsReceiptRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    return goodsReceiptRepository.listGrns(options);
  }

  async getGoodsReceipt(grnId: string): Promise<GoodsReceiptRecord | null> {
    return goodsReceiptRepository.getGrnById(grnId);
  }

  // ============================================================================
  // 3. Service Request Part Reservations
  // ============================================================================

  async reservePartForJob(
    input: {
      requestId: string;
      partEntryId: string;
      locationId: string;
      partId: string;
      quantity: number;
    },
    actor: AuthenticatedUser
  ): Promise<{ reservationId: string }> {
    if (input.quantity <= 0) {
      throw new AppError('Reservation quantity must be greater than zero.', 400, 'INVALID_QUANTITY');
    }

    const conn = await getOracleConnection();

    try {
      // 1. Verify service request exists and requires parts
      const serviceRequest = await serviceRequestRepository.findById(input.requestId, conn);
      if (!serviceRequest) {
        throw new AppError(`Service request '${input.requestId}' not found.`, 404, 'SERVICE_REQUEST_NOT_FOUND');
      }

      // Check if already reserved
      const existingRes = await inventoryReservationRepository.findActiveByPartEntryId(input.partEntryId, conn);
      if (existingRes) {
        throw new AppError('Part requirement is already actively reserved.', 409, 'ALREADY_RESERVED');
      }

      // 2. Lock balance row and check availability (AVAILABLE = ON_HAND - RESERVED)
      const balance = await inventoryRepository.getBalance(input.locationId, input.partId, conn, true);
      const onHand = balance ? balance.qtyOnHand : 0;
      const reserved = balance ? balance.qtyReserved : 0;
      const availableQty = onHand - reserved;

      if (availableQty < input.quantity) {
        throw new AppError(
          `Insufficient available stock for part (${balance?.partCode || input.partId}). Requested: ${input.quantity}, Available: ${availableQty} (On-hand: ${onHand}, Reserved: ${reserved})`,
          400,
          'INSUFFICIENT_STOCK'
        );
      }

      // 3. Increment reserved quantity in balance
      const { previousReserved, newReserved } = await inventoryRepository.upsertBalanceDeltas(
        {
          locationId: input.locationId,
          partId: input.partId,
          deltaReserved: input.quantity,
        },
        conn
      );

      // 4. Record active reservation
      const reservationId = await inventoryReservationRepository.createReservation(
        {
          requestId: input.requestId,
          partEntryId: input.partEntryId,
          locationId: input.locationId,
          partId: input.partId,
          quantity: input.quantity,
          reservedBy: actor.userId,
        },
        conn
      );

      // 5. Append movement ledger (RESERVATION_HOLD)
      await inventoryMovementRepository.recordMovement(
        {
          locationId: input.locationId,
          partId: input.partId,
          movementType: 'RESERVATION_HOLD',
          stockBucket: 'RESERVED',
          quantity: input.quantity,
          balanceBefore: previousReserved,
          balanceAfter: newReserved,
          referenceType: 'SERVICE_REQUEST',
          referenceId: serviceRequest.jobNumber,
          actorId: actor.userId,
          actorUsername: actor.username,
          remarks: `Stock reserved for Service Job ${serviceRequest.jobNumber}`,
        },
        conn
      );

      await conn.commit();
      return { reservationId };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  async releaseReservation(
    reservationId: string,
    reason: string,
    actor: AuthenticatedUser
  ): Promise<{ success: boolean }> {
    const conn = await getOracleConnection();

    try {
      const reservations = await inventoryReservationRepository.listReservations({ status: 'ACTIVE', limit: 1000 });
      const reservation = reservations.items.find((r) => r.reservationId === reservationId);

      if (!reservation) {
        throw new AppError('Active reservation not found.', 404, 'RESERVATION_NOT_FOUND');
      }

      // 1. Lock balance row and decrement reserved quantity
      const { previousReserved, newReserved } = await inventoryRepository.upsertBalanceDeltas(
        {
          locationId: reservation.locationId,
          partId: reservation.partId,
          deltaReserved: -reservation.quantity,
        },
        conn
      );

      // 2. Mark reservation as released
      await inventoryReservationRepository.releaseReservation(reservationId, reason, conn);

      // 3. Append movement ledger (RESERVATION_RELEASE)
      await inventoryMovementRepository.recordMovement(
        {
          locationId: reservation.locationId,
          partId: reservation.partId,
          movementType: 'RESERVATION_RELEASE',
          stockBucket: 'RESERVED',
          quantity: -reservation.quantity,
          balanceBefore: previousReserved,
          balanceAfter: newReserved,
          referenceType: 'SERVICE_REQUEST',
          referenceId: reservation.jobNumber || reservation.requestId,
          actorId: actor.userId,
          actorUsername: actor.username,
          remarks: `Stock reservation released: ${reason}`,
        },
        conn
      );

      await conn.commit();
      return { success: true };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  async listReservations(options: {
    locationId?: string;
    status?: 'ACTIVE' | 'FULFILLED' | 'RELEASED';
    page?: number;
    limit?: number;
  }): Promise<{ items: InventoryReservationRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    return inventoryReservationRepository.listReservations(options);
  }

  // ============================================================================
  // 4. Outbound Stock Dispatches & Delivery Challans (GST Compliant)
  // ============================================================================

  async fulfillStockDispatch(
    input: {
      documentType: DispatchDocumentType;
      fromLocationId: string;
      toLocationId: string;
      requestId?: string;
      courierName: string;
      docketNumber: string;
      remarks?: string;
      items: Array<{
        partId: string;
        quantity: number;
        unitPrice?: number;
      }>;
    },
    actor: AuthenticatedUser
  ): Promise<{ dispatchId: string; dispatchNumber: string; totalAmount: number }> {
    if (!input.items || input.items.length === 0) {
      throw new AppError('At least one item must be dispatched.', 400, 'NO_ITEMS');
    }

    const conn = await getOracleConnection();

    try {
      const fromLoc = await locationRepository.findById(input.fromLocationId);
      const toLoc = await locationRepository.findById(input.toLocationId);

      if (!fromLoc || fromLoc.isActive !== 'Y') {
        throw new AppError('Source location not found or inactive.', 404, 'SOURCE_LOCATION_NOT_FOUND');
      }
      if (!toLoc || toLoc.isActive !== 'Y') {
        throw new AppError('Destination location not found or inactive.', 404, 'DEST_LOCATION_NOT_FOUND');
      }

      const dispatchNumber = this.generateDocNumber(input.documentType === 'GST_TAX_INVOICE' ? 'INV' : 'DC');
      let totalQuantity = 0;
      let subtotalAmount = 0;
      let cgstAmount = 0;
      let sgstAmount = 0;
      let igstAmount = 0;

      // Determine Tax rates (Intra-state vs Inter-state) based on configured location entity state
      const fromLocAny = fromLoc as any;
      const toLocAny = toLoc as any;
      const fromState = fromLocAny.stateId || (fromLoc.locationCode.startsWith('DL') ? 'DL' : fromLoc.locationCode.slice(0, 2));
      const toState = toLocAny.stateId || (toLoc.locationCode.startsWith('DL') ? 'DL' : toLoc.locationCode.slice(0, 2));
      const isInterState = fromState !== toState;

      const processedItems: Array<{
        partId: string;
        quantity: number;
        unitPrice: number;
        cgstRate: number;
        sgstRate: number;
        igstRate: number;
        cgstAmount: number;
        sgstAmount: number;
        igstAmount: number;
        totalAmount: number;
      }> = [];

      for (const item of input.items) {
        if (item.quantity <= 0) {
          throw new AppError('Dispatch quantity must be greater than zero.', 400, 'INVALID_QUANTITY');
        }

        const part = await partRepository.findById(item.partId);
        if (!part || part.isActive !== 'Y') {
          throw new AppError(`Part ${item.partId} not found or inactive.`, 404, 'PART_NOT_FOUND');
        }

        const unitPrice = item.unitPrice !== undefined && item.unitPrice >= 0 ? item.unitPrice : part.locationPrice || part.customerPrice;
        const lineSubtotal = Math.round(unitPrice * item.quantity * 100) / 100;

        const effectiveIgstRate = part.igstRate || 18.0;
        let cgstRate = 0;
        let sgstRate = 0;
        let igstRate = 0;

        if (isInterState) {
          igstRate = effectiveIgstRate;
        } else {
          cgstRate = Math.round((effectiveIgstRate / 2) * 100) / 100;
          sgstRate = Math.round((effectiveIgstRate / 2) * 100) / 100;
        }

        const lineCgst = Math.round(lineSubtotal * (cgstRate / 100) * 100) / 100;
        const lineSgst = Math.round(lineSubtotal * (sgstRate / 100) * 100) / 100;
        const lineIgst = Math.round(lineSubtotal * (igstRate / 100) * 100) / 100;
        const lineTotal = lineSubtotal + lineCgst + lineSgst + lineIgst;

        totalQuantity += item.quantity;
        subtotalAmount += lineSubtotal;
        cgstAmount += lineCgst;
        sgstAmount += lineSgst;
        igstAmount += lineIgst;

        processedItems.push({
          partId: item.partId,
          quantity: item.quantity,
          unitPrice,
          cgstRate,
          sgstRate,
          igstRate,
          cgstAmount: lineCgst,
          sgstAmount: lineSgst,
          igstAmount: lineIgst,
          totalAmount: lineTotal,
        });
      }

      const totalAmount = Math.round((subtotalAmount + cgstAmount + sgstAmount + igstAmount) * 100) / 100;

      // 1. Verify and decrement source stock balances (FOR UPDATE)
      for (const item of processedItems) {
        const balance = await inventoryRepository.getBalance(input.fromLocationId, item.partId, conn, true);
        if (!balance) {
          throw new AppError(`No stock balance for part ${item.partId} at source location.`, 404, 'STOCK_NOT_FOUND');
        }

        // Check active reservations if linked to a service request
        let releaseReservedDelta = 0;
        if (input.requestId) {
          const activeReservations = await inventoryReservationRepository.findActiveByRequestId(input.requestId, conn);
          const matchRes = activeReservations.find((r) => r.partId === item.partId && r.status === 'ACTIVE');
          if (matchRes) {
            releaseReservedDelta = Math.min(matchRes.quantity, item.quantity);
            await inventoryReservationRepository.fulfillReservation(matchRes.reservationId, conn);
          }
        }

        // Available check if not fulfilling a reservation
        const availableQty = balance.qtyOnHand - (balance.qtyReserved - releaseReservedDelta);
        if (availableQty < item.quantity) {
          throw new AppError(
            `Insufficient physical stock to dispatch part (${balance.partCode || item.partId}). Requested: ${item.quantity}, Available: ${availableQty}`,
            400,
            'INSUFFICIENT_STOCK'
          );
        }

        // Decrement On-hand, decrement reserved (if matched), increment in-transit
        const { previousOnHand, newOnHand } = await inventoryRepository.upsertBalanceDeltas(
          {
            locationId: input.fromLocationId,
            partId: item.partId,
            deltaOnHand: -item.quantity,
            deltaReserved: -releaseReservedDelta,
            deltaInTransit: item.quantity,
          },
          conn
        );

        // Movement: On-hand decrement
        await inventoryMovementRepository.recordMovement(
          {
            locationId: input.fromLocationId,
            partId: item.partId,
            movementType: 'PART_DISPATCH',
            stockBucket: 'ON_HAND',
            quantity: -item.quantity,
            balanceBefore: previousOnHand,
            balanceAfter: newOnHand,
            referenceType: input.documentType,
            referenceId: dispatchNumber,
            sourceLocationId: input.fromLocationId,
            destLocationId: input.toLocationId,
            actorId: actor.userId,
            actorUsername: actor.username,
            remarks: `Dispatched to ${toLoc.locationName} via ${input.courierName} (${input.docketNumber})`,
          },
          conn
        );
      }

      // 2. Create dispatch record
      const dispatchId = await stockDispatchRepository.createDispatch(
        {
          dispatchNumber,
          documentType: input.documentType,
          fromLocationId: input.fromLocationId,
          toLocationId: input.toLocationId,
          requestId: input.requestId,
          courierName: input.courierName,
          docketNumber: input.docketNumber,
          dispatchedBy: actor.userId,
          totalQuantity,
          subtotalAmount,
          cgstAmount,
          sgstAmount,
          igstAmount,
          totalAmount,
          remarks: input.remarks,
          items: processedItems,
        },
        conn
      );

      // 3. If linked to a service request, transition state to PART_DISPATCHED_TO_ASF
      if (input.requestId) {
        const sr = await serviceRequestRepository.findById(input.requestId, conn);
        if (sr && sr.status === 'PENDING_SPARE_PART') {
          await serviceRequestRepository.updateStatus(
            input.requestId,
            'PART_DISPATCHED_TO_ASF',
            conn
          );

          await serviceRequestEventRepository.createEvent(
            {
              requestId: input.requestId,
              fromState: 'PENDING_SPARE_PART',
              toState: 'PART_DISPATCHED_TO_ASF',
              eventType: 'PART_DISPATCHED',
              triggeredByUserId: actor.userId,
              triggeredByUsername: actor.username,
              triggeredByRole: actor.roles[0] || 'WAREHOUSE',
              remarks: `Parts dispatched via ${input.courierName} (Docket: ${input.docketNumber}, Challan: ${dispatchNumber})`,
              metadataJson: {
                dispatchId,
                dispatchNumber,
                courierName: input.courierName,
                docketNumber: input.docketNumber,
                totalAmount,
              },
            },
            conn
          );
        }
      }

      await conn.commit();
      return { dispatchId, dispatchNumber, totalAmount };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  async acknowledgeDispatchArrival(
    dispatchId: string,
    actor: AuthenticatedUser
  ): Promise<{ success: boolean }> {
    const conn = await getOracleConnection();

    try {
      const dispatch = await stockDispatchRepository.getDispatchById(dispatchId);
      if (!dispatch) {
        throw new AppError('Dispatch record not found.', 404, 'DISPATCH_NOT_FOUND');
      }
      if (dispatch.status !== 'IN_TRANSIT') {
        throw new AppError(`Dispatch is in '${dispatch.status}' status and cannot be acknowledged.`, 400, 'INVALID_STATUS');
      }

      // 1. Mark dispatch as ACKNOWLEDGED
      await stockDispatchRepository.acknowledgeDispatch(dispatchId, actor.userId, conn);

      // 2. For each item:
      // Decrement source location QTY_IN_TRANSIT
      // Increment destination location QTY_ON_HAND
      if (dispatch.items && dispatch.items.length > 0) {
        for (const item of dispatch.items) {
          // Decrement in-transit at source
          await inventoryRepository.upsertBalanceDeltas(
            {
              locationId: dispatch.fromLocationId,
              partId: item.partId,
              deltaInTransit: -item.quantity,
            },
            conn
          );

          // Increment on-hand at destination
          const { previousOnHand, newOnHand } = await inventoryRepository.upsertBalanceDeltas(
            {
              locationId: dispatch.toLocationId,
              partId: item.partId,
              deltaOnHand: item.quantity,
            },
            conn
          );

          // Append receipt movement at destination
          await inventoryMovementRepository.recordMovement(
            {
              locationId: dispatch.toLocationId,
              partId: item.partId,
              movementType: 'PART_RECEIPT',
              stockBucket: 'ON_HAND',
              quantity: item.quantity,
              balanceBefore: previousOnHand,
              balanceAfter: newOnHand,
              referenceType: dispatch.documentType,
              referenceId: dispatch.dispatchNumber,
              sourceLocationId: dispatch.fromLocationId,
              destLocationId: dispatch.toLocationId,
              actorId: actor.userId,
              actorUsername: actor.username,
              remarks: `Shipment received and added to local on-hand stock (Challan: ${dispatch.dispatchNumber})`,
            },
            conn
          );
        }
      }

      await conn.commit();
      return { success: true };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  async listDispatches(options: {
    fromLocationId?: string;
    toLocationId?: string;
    requestId?: string;
    status?: 'IN_TRANSIT' | 'ACKNOWLEDGED' | 'CANCELLED';
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: StockDispatchRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    return stockDispatchRepository.listDispatches(options);
  }

  async getDispatch(dispatchId: string): Promise<StockDispatchRecord | null> {
    return stockDispatchRepository.getDispatchById(dispatchId);
  }

  // ============================================================================
  // 5. Defective Parts Returns, Quarantine & Disposition
  // ============================================================================

  async processDefectiveReturn(
    input: {
      fromLocationId: string;
      toLocationId: string;
      requestId?: string;
      items: Array<{
        partId: string;
        quantity: number;
        defectiveSerialNo?: string;
        defectReason?: string;
      }>;
    },
    actor: AuthenticatedUser
  ): Promise<{ returnId: string; returnNumber: string }> {
    if (!input.items || input.items.length === 0) {
      throw new AppError('At least one defective part must be returned.', 400, 'NO_ITEMS');
    }

    const conn = await getOracleConnection();

    try {
      const returnNumber = this.generateDocNumber('RET');

      const returnId = await stockReturnRepository.createReturn(
        {
          returnNumber,
          fromLocationId: input.fromLocationId,
          toLocationId: input.toLocationId,
          requestId: input.requestId,
          receivedBy: actor.userId,
          items: input.items,
        },
        conn
      );

      // Add to warehouse DEFECTIVE stock bucket (quarantined)
      for (const item of input.items) {
        const { previousOnHand, newOnHand } = await inventoryRepository.upsertBalanceDeltas(
          {
            locationId: input.toLocationId,
            partId: item.partId,
            deltaDefective: item.quantity,
          },
          conn
        );

        await inventoryMovementRepository.recordMovement(
          {
            locationId: input.toLocationId,
            partId: item.partId,
            movementType: 'RETURN_DEFECTIVE',
            stockBucket: 'DEFECTIVE',
            quantity: item.quantity,
            balanceBefore: previousOnHand,
            balanceAfter: newOnHand,
            referenceType: 'RETURN_MANIFEST',
            referenceId: returnNumber,
            sourceLocationId: input.fromLocationId,
            destLocationId: input.toLocationId,
            actorId: actor.userId,
            actorUsername: actor.username,
            remarks: `Defective warranty return received into quarantine (${item.defectiveSerialNo || 'No S/N'})`,
          },
          conn
        );
      }

      await conn.commit();
      return { returnId, returnNumber };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  async processReturnDisposition(
    input: {
      returnId: string;
      disposition: ReturnDisposition;
      remarks: string;
    },
    actor: AuthenticatedUser
  ): Promise<{ success: boolean }> {
    const conn = await getOracleConnection();

    try {
      const returnRecord = await stockReturnRepository.getReturnById(input.returnId);
      if (!returnRecord) {
        throw new AppError('Return record not found.', 404, 'RETURN_NOT_FOUND');
      }
      if (returnRecord.status !== 'IN_QUARANTINE') {
        throw new AppError(`Return is in '${returnRecord.status}' status and has already been dispositioned.`, 400, 'INVALID_STATUS');
      }

      await stockReturnRepository.updateDisposition(
        {
          returnId: input.returnId,
          disposition: input.disposition,
          remarks: input.remarks,
          inspectedBy: actor.userId,
        },
        conn
      );

      // Apply disposition effects to inventory
      if (returnRecord.items) {
        for (const item of returnRecord.items) {
          if (input.disposition === 'SCRAP') {
            // Decrement defective stock
            const { previousOnHand, newOnHand } = await inventoryRepository.upsertBalanceDeltas(
              {
                locationId: returnRecord.toLocationId,
                partId: item.partId,
                deltaDefective: -item.quantity,
              },
              conn
            );

            await inventoryMovementRepository.recordMovement(
              {
                locationId: returnRecord.toLocationId,
                partId: item.partId,
                movementType: 'RETURN_SCRAP',
                stockBucket: 'DEFECTIVE',
                quantity: -item.quantity,
                balanceBefore: previousOnHand,
                balanceAfter: newOnHand,
                referenceType: 'DISPOSITION_SCRAP',
                referenceId: returnRecord.returnNumber,
                actorId: actor.userId,
                actorUsername: actor.username,
                remarks: `Scrap write-off certified: ${input.remarks}`,
              },
              conn
            );
          } else if (input.disposition === 'RESTOCK') {
            // Move from defective to on-hand fresh/refurbished stock
            await inventoryRepository.upsertBalanceDeltas(
              {
                locationId: returnRecord.toLocationId,
                partId: item.partId,
                deltaDefective: -item.quantity,
                deltaOnHand: item.quantity,
              },
              conn
            );

            const balance = await inventoryRepository.getBalance(returnRecord.toLocationId, item.partId, conn);

            await inventoryMovementRepository.recordMovement(
              {
                locationId: returnRecord.toLocationId,
                partId: item.partId,
                movementType: 'RETURN_RESTOCK',
                stockBucket: 'ON_HAND',
                quantity: item.quantity,
                balanceBefore: (balance?.qtyOnHand || 0) - item.quantity,
                balanceAfter: balance?.qtyOnHand || 0,
                referenceType: 'DISPOSITION_RESTOCK',
                referenceId: returnRecord.returnNumber,
                actorId: actor.userId,
                actorUsername: actor.username,
                remarks: `Inspected & approved for restock: ${input.remarks}`,
              },
              conn
            );
          }
        }
      }

      await conn.commit();
      return { success: true };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  async listReturns(options: {
    locationId?: string;
    status?: 'IN_QUARANTINE' | 'INSPECTED' | 'DISPOSED_SCRAP' | 'RESTOCKED';
    page?: number;
    limit?: number;
  }): Promise<{ items: StockReturnRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    return stockReturnRepository.listReturns(options);
  }

  // ============================================================================
  // 6. Controlled Stock Adjustments & Reconciliation
  // ============================================================================

  async performStockAdjustment(
    input: {
      locationId: string;
      partId: string;
      stockBucket: 'ON_HAND' | 'DEFECTIVE';
      adjustmentType: StockAdjustmentType;
      quantity: number;
      reason: StockAdjustmentReason;
      remarks: string;
    },
    actor: AuthenticatedUser
  ): Promise<{ adjustmentId: string; adjustmentNumber: string }> {
    if (input.quantity <= 0) {
      throw new AppError('Adjustment quantity must be greater than zero.', 400, 'INVALID_QUANTITY');
    }
    if (!input.remarks || input.remarks.trim().length < 5) {
      throw new AppError('A documented audit remark (minimum 5 characters) is mandatory for stock adjustments.', 400, 'REMARKS_REQUIRED');
    }

    const conn = await getOracleConnection();

    try {
      const adjustmentNumber = this.generateDocNumber('ADJ');
      const delta = input.adjustmentType === 'INCREASE' ? input.quantity : -input.quantity;

      // 1. Lock and update balance
      let prevBal = 0;
      let newBal = 0;

      if (input.stockBucket === 'ON_HAND') {
        const res = await inventoryRepository.upsertBalanceDeltas(
          {
            locationId: input.locationId,
            partId: input.partId,
            deltaOnHand: delta,
          },
          conn
        );
        prevBal = res.previousOnHand;
        newBal = res.newOnHand;
      } else {
        const res = await inventoryRepository.upsertBalanceDeltas(
          {
            locationId: input.locationId,
            partId: input.partId,
            deltaDefective: delta,
          },
          conn
        );
        prevBal = res.previousOnHand;
        newBal = res.newOnHand;
      }

      // 2. Create adjustment record
      const adjustmentId = await stockAdjustmentRepository.createAdjustment(
        {
          adjustmentNumber,
          locationId: input.locationId,
          partId: input.partId,
          stockBucket: input.stockBucket,
          adjustmentType: input.adjustmentType,
          quantity: input.quantity,
          reason: input.reason,
          remarks: input.remarks,
          adjustedBy: actor.userId,
        },
        conn
      );

      // 3. Append ledger movement
      await inventoryMovementRepository.recordMovement(
        {
          locationId: input.locationId,
          partId: input.partId,
          movementType: 'STOCK_ADJUSTMENT',
          stockBucket: input.stockBucket,
          quantity: delta,
          balanceBefore: prevBal,
          balanceAfter: newBal,
          referenceType: 'STOCK_ADJUSTMENT',
          referenceId: adjustmentNumber,
          actorId: actor.userId,
          actorUsername: actor.username,
          remarks: `[${input.reason}] ${input.remarks}`,
        },
        conn
      );

      await conn.commit();
      return { adjustmentId, adjustmentNumber };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  async listAdjustments(options: {
    locationId?: string;
    partId?: string;
    reason?: StockAdjustmentReason;
    page?: number;
    limit?: number;
  }): Promise<{ items: StockAdjustmentRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    return stockAdjustmentRepository.listAdjustments(options);
  }

  async reconcileStock(locationId: string, partId: string): Promise<InventoryReconciliationRecord> {
    return inventoryRepository.reconcileStock(locationId, partId);
  }

  // ============================================================================
  // 7. Movement History Ledger
  // ============================================================================

  async listMovements(options: {
    locationId?: string;
    partId?: string;
    movementType?: string;
    referenceId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: InventoryMovementRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    return inventoryMovementRepository.listMovements(options);
  }

  // ============================================================================
  // 8. Job Lifecycle Hooks (Auto-Release Reservations on Cancellation / Change)
  // ============================================================================

  async autoReleaseJobReservations(
    requestId: string,
    reason: string,
    actor: AuthenticatedUser,
    conn: oracledb.Connection
  ): Promise<number> {
    const activeReservations = await inventoryReservationRepository.findActiveByRequestId(requestId, conn);
    let releasedCount = 0;

    for (const res of activeReservations) {
      await inventoryRepository.upsertBalanceDeltas(
        {
          locationId: res.locationId,
          partId: res.partId,
          deltaReserved: -res.quantity,
        },
        conn
      );

      await inventoryReservationRepository.releaseReservation(res.reservationId, reason, conn);

      await inventoryMovementRepository.recordMovement(
        {
          locationId: res.locationId,
          partId: res.partId,
          movementType: 'RESERVATION_RELEASE',
          stockBucket: 'RESERVED',
          quantity: -res.quantity,
          balanceBefore: res.quantity,
          balanceAfter: 0,
          referenceType: 'SERVICE_REQUEST',
          referenceId: res.jobNumber || requestId,
          actorId: actor.userId,
          actorUsername: actor.username,
          remarks: `Auto-released due to job lifecycle change: ${reason}`,
        },
        conn
      );

      releasedCount++;
    }

    return releasedCount;
  }
}

export const inventoryService = new InventoryService();
