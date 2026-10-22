import { Request, Response } from 'express';
import { z } from 'zod';
import oracledb from 'oracledb';
import { getOracleConnection } from '../database/oraclePool.js';
import { sendError, sendSuccess } from '../middleware/errorHandler.js';
import { inventoryService } from '../services/inventoryService.js';
import { AuthenticatedUser } from '../types/auth.js';

// Zod Validation Schemas
const GoodsReceiptSchema = z.object({
  receivingLocationId: z.string().uuid(),
  supplierName: z.string().min(2).max(150),
  supplierInvoiceNo: z.string().min(1).max(100),
  supplierInvoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  poNumber: z.string().max(50).optional(),
  gateEntryNo: z.string().max(50).optional(),
  vehicleNo: z.string().max(30).optional(),
  remarks: z.string().max(1000).optional(),
  items: z.array(
    z.object({
      partId: z.string().uuid(),
      receivedQty: z.number().int().positive(),
      acceptedQty: z.number().int().min(0),
      rejectedQty: z.number().int().min(0),
      unitPrice: z.number().min(0).default(0),
      remarks: z.string().max(500).optional(),
    })
  ).min(1, 'At least one item line is required'),
});

const ReservationSchema = z.object({
  requestId: z.string().uuid(),
  partEntryId: z.string().uuid(),
  locationId: z.string().uuid(),
  partId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const ReleaseReservationSchema = z.object({
  reason: z.string().min(3).max(500),
});

const DispatchSchema = z.object({
  documentType: z.enum(['DELIVERY_CHALLAN', 'GST_TAX_INVOICE']),
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  requestId: z.string().uuid().optional(),
  courierName: z.string().min(2).max(100),
  docketNumber: z.string().min(2).max(100),
  remarks: z.string().max(1000).optional(),
  items: z.array(
    z.object({
      partId: z.string().uuid(),
      quantity: z.number().int().positive(),
      unitPrice: z.number().min(0).optional(),
    })
  ).min(1, 'At least one item is required'),
});

const DefectiveReturnSchema = z.object({
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  requestId: z.string().uuid().optional(),
  items: z.array(
    z.object({
      partId: z.string().uuid(),
      quantity: z.number().int().positive(),
      defectiveSerialNo: z.string().max(50).optional(),
      defectReason: z.string().max(255).optional(),
    })
  ).min(1),
});

const ReturnDispositionSchema = z.object({
  disposition: z.enum(['SCRAP', 'RESTOCK', 'RETURN_TO_VENDOR', 'REJECTED']),
  remarks: z.string().min(3).max(1000),
});

const StockAdjustmentSchema = z.object({
  locationId: z.string().uuid(),
  partId: z.string().uuid(),
  stockBucket: z.enum(['ON_HAND', 'DEFECTIVE']),
  adjustmentType: z.enum(['INCREASE', 'DECREASE']),
  quantity: z.number().int().positive(),
  reason: z.enum([
    'PHYSICAL_AUDIT_SURPLUS',
    'PHYSICAL_AUDIT_SHRINKAGE',
    'DAMAGED_IN_STORAGE',
    'CORRECTION',
    'SCRAP_WRITE_OFF',
  ]),
  remarks: z.string().min(5).max(1000),
});

export class WarehouseController {
  // ============================================================================
  // Stock Balances
  // ============================================================================

  async getStockBalances(req: Request, res: Response): Promise<void> {
    try {
      const locationId = typeof req.query['locationId'] === 'string' ? req.query['locationId'] : undefined;
      const partId = typeof req.query['partId'] === 'string' ? req.query['partId'] : undefined;
      const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
      const lowStockOnly = req.query['lowStockOnly'] === 'true';
      const page = req.query['page'] ? Number(req.query['page']) : 1;
      const limit = req.query['limit'] ? Number(req.query['limit']) : 20;

      const result = await inventoryService.listStockBalances({
        locationId,
        partId,
        search,
        lowStockOnly,
        page,
        limit,
      });

      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async getStockBalance(req: Request, res: Response): Promise<void> {
    try {
      const locationId = req.params['locationId'];
      const partId = req.params['partId'];
      if (!locationId || !partId) {
        sendError(res, 'Location ID and Part ID are required', 400, 'VALIDATION_ERROR');
        return;
      }
      const balance = await inventoryService.getStockBalance(locationId, partId);
      if (!balance) {
        sendError(res, 'Stock balance record not found', 404, 'NOT_FOUND');
        return;
      }
      sendSuccess(res, balance);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  // ============================================================================
  // Goods Receipts (GRN)
  // ============================================================================

  async receiveGrn(req: Request, res: Response): Promise<void> {
    try {
      const actor = req.user as AuthenticatedUser;
      const parsed = GoodsReceiptSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, 'Validation failed for goods receipt note', 400, 'VALIDATION_ERROR', parsed.error.format());
        return;
      }

      const result = await inventoryService.processGoodsReceipt(parsed.data, actor);
      sendSuccess(res, result, 201);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async listGrns(req: Request, res: Response): Promise<void> {
    try {
      const receivingLocationId = typeof req.query['locationId'] === 'string' ? req.query['locationId'] : undefined;
      const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
      const page = req.query['page'] ? Number(req.query['page']) : 1;
      const limit = req.query['limit'] ? Number(req.query['limit']) : 20;

      const result = await inventoryService.listGoodsReceipts({
        receivingLocationId,
        search,
        page,
        limit,
      });

      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async getGrn(req: Request, res: Response): Promise<void> {
    try {
      const grnId = req.params['grnId'];
      if (!grnId) {
        sendError(res, 'GRN ID is required', 400, 'VALIDATION_ERROR');
        return;
      }
      const grn = await inventoryService.getGoodsReceipt(grnId);
      if (!grn) {
        sendError(res, 'Goods receipt note not found', 404, 'NOT_FOUND');
        return;
      }
      sendSuccess(res, grn);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  // ============================================================================
  // Reservations
  // ============================================================================

  async reservePart(req: Request, res: Response): Promise<void> {
    try {
      const actor = req.user as AuthenticatedUser;
      const parsed = ReservationSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, 'Validation failed for reservation', 400, 'VALIDATION_ERROR', parsed.error.format());
        return;
      }

      const result = await inventoryService.reservePartForJob(parsed.data, actor);
      sendSuccess(res, result, 201);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async releaseReservation(req: Request, res: Response): Promise<void> {
    try {
      const actor = req.user as AuthenticatedUser;
      const reservationId = req.params['reservationId'];
      if (!reservationId) {
        sendError(res, 'Reservation ID is required', 400, 'VALIDATION_ERROR');
        return;
      }
      const parsed = ReleaseReservationSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, 'Validation failed for release', 400, 'VALIDATION_ERROR', parsed.error.format());
        return;
      }

      const result = await inventoryService.releaseReservation(reservationId, parsed.data.reason, actor);
      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async listReservations(req: Request, res: Response): Promise<void> {
    try {
      const locationId = typeof req.query['locationId'] === 'string' ? req.query['locationId'] : undefined;
      const status = typeof req.query['status'] === 'string' ? (req.query['status'] as any) : undefined;
      const page = req.query['page'] ? Number(req.query['page']) : 1;
      const limit = req.query['limit'] ? Number(req.query['limit']) : 20;

      const result = await inventoryService.listReservations({
        locationId,
        status,
        page,
        limit,
      });

      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  // ============================================================================
  // Outbound Dispatches & Challans
  // ============================================================================

  async dispatchStock(req: Request, res: Response): Promise<void> {
    try {
      const actor = req.user as AuthenticatedUser;
      const parsed = DispatchSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, 'Validation failed for dispatch', 400, 'VALIDATION_ERROR', parsed.error.format());
        return;
      }

      const result = await inventoryService.fulfillStockDispatch(parsed.data, actor);
      sendSuccess(res, result, 201);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async acknowledgeDispatch(req: Request, res: Response): Promise<void> {
    try {
      const actor = req.user as AuthenticatedUser;
      const dispatchId = req.params['dispatchId'];
      if (!dispatchId) {
        sendError(res, 'Dispatch ID is required', 400, 'VALIDATION_ERROR');
        return;
      }

      const result = await inventoryService.acknowledgeDispatchArrival(dispatchId, actor);
      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async listDispatches(req: Request, res: Response): Promise<void> {
    try {
      const fromLocationId = typeof req.query['fromLocationId'] === 'string' ? req.query['fromLocationId'] : undefined;
      const toLocationId = typeof req.query['toLocationId'] === 'string' ? req.query['toLocationId'] : undefined;
      const requestId = typeof req.query['requestId'] === 'string' ? req.query['requestId'] : undefined;
      const status = typeof req.query['status'] === 'string' ? (req.query['status'] as any) : undefined;
      const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
      const page = req.query['page'] ? Number(req.query['page']) : 1;
      const limit = req.query['limit'] ? Number(req.query['limit']) : 20;

      const result = await inventoryService.listDispatches({
        fromLocationId,
        toLocationId,
        requestId,
        status,
        search,
        page,
        limit,
      });

      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async getDispatch(req: Request, res: Response): Promise<void> {
    try {
      const dispatchId = req.params['dispatchId'];
      if (!dispatchId) {
        sendError(res, 'Dispatch ID is required', 400, 'VALIDATION_ERROR');
        return;
      }
      const dispatch = await inventoryService.getDispatch(dispatchId);
      if (!dispatch) {
        sendError(res, 'Dispatch record not found', 404, 'NOT_FOUND');
        return;
      }
      sendSuccess(res, dispatch);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  // ============================================================================
  // Defective Returns & Quarantine Disposition
  // ============================================================================

  async returnStock(req: Request, res: Response): Promise<void> {
    try {
      const actor = req.user as AuthenticatedUser;
      const parsed = DefectiveReturnSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, 'Validation failed for defective return', 400, 'VALIDATION_ERROR', parsed.error.format());
        return;
      }

      const result = await inventoryService.processDefectiveReturn(parsed.data, actor);
      sendSuccess(res, result, 201);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async dispositionReturn(req: Request, res: Response): Promise<void> {
    try {
      const actor = req.user as AuthenticatedUser;
      const returnId = req.params['returnId'];
      if (!returnId) {
        sendError(res, 'Return ID is required', 400, 'VALIDATION_ERROR');
        return;
      }
      const parsed = ReturnDispositionSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, 'Validation failed for disposition', 400, 'VALIDATION_ERROR', parsed.error.format());
        return;
      }

      const result = await inventoryService.processReturnDisposition(
        {
          returnId,
          disposition: parsed.data.disposition,
          remarks: parsed.data.remarks,
        },
        actor
      );

      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async listReturns(req: Request, res: Response): Promise<void> {
    try {
      const locationId = typeof req.query['locationId'] === 'string' ? req.query['locationId'] : undefined;
      const status = typeof req.query['status'] === 'string' ? (req.query['status'] as any) : undefined;
      const page = req.query['page'] ? Number(req.query['page']) : 1;
      const limit = req.query['limit'] ? Number(req.query['limit']) : 20;

      const result = await inventoryService.listReturns({
        locationId,
        status,
        page,
        limit,
      });

      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  // ============================================================================
  // Controlled Stock Adjustments & Reconciliation
  // ============================================================================

  async adjustStock(req: Request, res: Response): Promise<void> {
    try {
      const actor = req.user as AuthenticatedUser;
      const parsed = StockAdjustmentSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, 'Validation failed for stock adjustment', 400, 'VALIDATION_ERROR', parsed.error.format());
        return;
      }

      const result = await inventoryService.performStockAdjustment(parsed.data, actor);
      sendSuccess(res, result, 201);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async listAdjustments(req: Request, res: Response): Promise<void> {
    try {
      const locationId = typeof req.query['locationId'] === 'string' ? req.query['locationId'] : undefined;
      const partId = typeof req.query['partId'] === 'string' ? req.query['partId'] : undefined;
      const reason = typeof req.query['reason'] === 'string' ? (req.query['reason'] as any) : undefined;
      const page = req.query['page'] ? Number(req.query['page']) : 1;
      const limit = req.query['limit'] ? Number(req.query['limit']) : 20;

      const result = await inventoryService.listAdjustments({
        locationId,
        partId,
        reason,
        page,
        limit,
      });

      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async reconcile(req: Request, res: Response): Promise<void> {
    try {
      const locationId = req.params['locationId'];
      const partId = req.params['partId'];
      if (!locationId || !partId) {
        sendError(res, 'Location ID and Part ID are required', 400, 'VALIDATION_ERROR');
        return;
      }
      const result = await inventoryService.reconcileStock(locationId, partId);
      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  // ============================================================================
  // Movement History Ledger
  // ============================================================================

  async listMovements(req: Request, res: Response): Promise<void> {
    try {
      const locationId = typeof req.query['locationId'] === 'string' ? req.query['locationId'] : undefined;
      const partId = typeof req.query['partId'] === 'string' ? req.query['partId'] : undefined;
      const movementType = typeof req.query['movementType'] === 'string' ? req.query['movementType'] : undefined;
      const referenceId = typeof req.query['referenceId'] === 'string' ? req.query['referenceId'] : undefined;
      const page = req.query['page'] ? Number(req.query['page']) : 1;
      const limit = req.query['limit'] ? Number(req.query['limit']) : 20;

      const result = await inventoryService.listMovements({
        locationId,
        partId,
        movementType,
        referenceId,
        page,
        limit,
      });

      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  // ============================================================================
  // Actionable Queues: Pending Job Part Requests (PNA Queue)
  // ============================================================================

  async getPendingJobParts(_req: Request, res: Response): Promise<void> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT 
          srp.PART_ENTRY_ID,
          srp.REQUEST_ID,
          sr.JOB_NUMBER,
          sr.CURRENT_STATE,
          sr.STATUS,
          c.FULL_NAME AS CUSTOMER_NAME,
          c.PRIMARY_MOBILE AS CUSTOMER_PHONE,
          l.LOCATION_ID AS ASF_LOCATION_ID,
          l.LOCATION_NAME AS ASF_NAME,
          m.MODEL_NAME,
          p.PART_ID,
          p.PART_CODE,
          p.PART_NAME,
          srp.QUANTITY,
          srp.ENTRY_TYPE,
          srp.STATUS AS PART_STATUS,
          srp.CREATED_AT,
          NVL(wh_b.QTY_ON_HAND - wh_b.QTY_RESERVED, 0) AS WH_AVAILABLE_QTY,
          res.STATUS AS RESERVATION_STATUS
        FROM SERVICE_REQUEST_PARTS srp
        JOIN SERVICE_REQUESTS sr ON srp.REQUEST_ID = sr.REQUEST_ID
        JOIN CUSTOMERS c ON sr.CUSTOMER_ID = c.CUSTOMER_ID
        LEFT JOIN LOCATIONS l ON sr.ASSIGNED_LOCATION_ID = l.LOCATION_ID
        LEFT JOIN MODELS m ON sr.MODEL_ID = m.MODEL_ID
        JOIN PART_CODES p ON srp.PART_ID = p.PART_ID
        LEFT JOIN INVENTORY_BALANCES wh_b ON (p.PART_ID = wh_b.PART_ID AND wh_b.LOCATION_ID = (SELECT LOCATION_ID FROM LOCATIONS WHERE LOCATION_CODE = 'WH-CENTRAL' AND ROWNUM = 1))
        LEFT JOIN INVENTORY_RESERVATIONS res ON (srp.PART_ENTRY_ID = res.PART_ENTRY_ID AND res.STATUS = 'ACTIVE')
        WHERE srp.STATUS = 'PENDING_FULFILLMENT' OR srp.ENTRY_TYPE IN ('REQUIRED_PNA', 'REQUIRED_SPECIAL_ESTIMATE') OR sr.STATUS = 'PENDING_SPARE_PART'
        ORDER BY srp.CREATED_AT ASC
      `;

      const result = await conn.execute<any>(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const items = (result.rows || []).map((row) => ({
        partEntryId: row.PART_ENTRY_ID,
        requestId: row.REQUEST_ID,
        jobNumber: row.JOB_NUMBER,
        status: row.STATUS,
        customerName: row.CUSTOMER_NAME,
        customerPhone: row.CUSTOMER_PHONE,
        asfLocationId: row.ASF_LOCATION_ID,
        asfName: row.ASF_NAME,
        modelName: row.MODEL_NAME,
        partId: row.PART_ID,
        partCode: row.PART_CODE,
        partName: row.PART_NAME,
        quantity: Number(row.QUANTITY),
        entryType: row.ENTRY_TYPE,
        partStatus: row.PART_STATUS,
        whAvailableQty: Number(row.WH_AVAILABLE_QTY || 0),
        isReserved: Boolean(row.RESERVATION_STATUS === 'ACTIVE'),
        createdAt: new Date(row.CREATED_AT),
      }));

      sendSuccess(res, { items, total: items.length });
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    } finally {
      await conn.close();
    }
  }

  // ============================================================================
  // Warehouse Dashboard Summary KPIs
  // ============================================================================

  async getDashboardSummary(_req: Request, res: Response): Promise<void> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT 
          (SELECT COUNT(*) FROM INVENTORY_BALANCES) AS TOTAL_SKUS,
          (SELECT COUNT(*) FROM INVENTORY_BALANCES WHERE (QTY_ON_HAND - QTY_RESERVED) <= REORDER_LEVEL) AS LOW_STOCK_COUNT,
          (SELECT NVL(SUM(QTY_ON_HAND), 0) FROM INVENTORY_BALANCES) AS TOTAL_ON_HAND_UNITS,
          (SELECT NVL(SUM(QTY_RESERVED), 0) FROM INVENTORY_BALANCES) AS TOTAL_RESERVED_UNITS,
          (SELECT NVL(SUM(QTY_IN_TRANSIT), 0) FROM INVENTORY_BALANCES) AS TOTAL_IN_TRANSIT_UNITS,
          (SELECT NVL(SUM(QTY_DEFECTIVE), 0) FROM INVENTORY_BALANCES) AS TOTAL_DEFECTIVE_UNITS,
          (SELECT COUNT(*) FROM STOCK_DISPATCHES WHERE STATUS = 'IN_TRANSIT') AS ACTIVE_DISPATCHES_COUNT,
          (SELECT COUNT(*) FROM STOCK_RETURNS WHERE STATUS = 'IN_QUARANTINE') AS QUARANTINE_RETURNS_COUNT,
          (SELECT COUNT(*) FROM SERVICE_REQUESTS WHERE STATUS = 'PENDING_SPARE_PART') AS PENDING_PNA_JOBS_COUNT
        FROM DUAL
      `;

      const result = await conn.execute<any>(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const row = result.rows?.[0];

      sendSuccess(res, {
        totalSkus: Number(row?.TOTAL_SKUS || 0),
        lowStockCount: Number(row?.LOW_STOCK_COUNT || 0),
        totalOnHandUnits: Number(row?.TOTAL_ON_HAND_UNITS || 0),
        totalReservedUnits: Number(row?.TOTAL_RESERVED_UNITS || 0),
        totalInTransitUnits: Number(row?.TOTAL_IN_TRANSIT_UNITS || 0),
        totalDefectiveUnits: Number(row?.TOTAL_DEFECTIVE_UNITS || 0),
        activeDispatchesCount: Number(row?.ACTIVE_DISPATCHES_COUNT || 0),
        quarantineReturnsCount: Number(row?.QUARANTINE_RETURNS_COUNT || 0),
        pendingPnaJobsCount: Number(row?.PENDING_PNA_JOBS_COUNT || 0),
      });
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    } finally {
      await conn.close();
    }
  }
}

export const warehouseController = new WarehouseController();
