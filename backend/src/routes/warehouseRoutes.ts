import { Router } from 'express';
import { warehouseController } from '../controllers/warehouseController.js';
import { requireAnyPermission, requireAuth, requireCsrf, requirePermission } from '../middleware/authMiddleware.js';

export const warehouseRouter = Router();

// All warehouse routes require authenticated session
warehouseRouter.use(requireAuth);

/**
 * Dashboard & Actionable Queues
 */
warehouseRouter.get(
  '/dashboard',
  requireAnyPermission('inventory:read', 'reports:view'),
  warehouseController.getDashboardSummary.bind(warehouseController)
);

warehouseRouter.get(
  '/pending-job-parts',
  requireAnyPermission('inventory:read', 'inventory:dispatch'),
  warehouseController.getPendingJobParts.bind(warehouseController)
);

/**
 * Stock Balances & Availability
 */
warehouseRouter.get(
  '/stock',
  requirePermission('inventory:read'),
  warehouseController.getStockBalances.bind(warehouseController)
);

warehouseRouter.get(
  '/stock/:locationId/:partId',
  requirePermission('inventory:read'),
  warehouseController.getStockBalance.bind(warehouseController)
);

/**
 * Goods Receipt Notes (GRN) Inbound
 */
warehouseRouter.post(
  '/grn',
  requireCsrf,
  requirePermission('inventory:manage'),
  warehouseController.receiveGrn.bind(warehouseController)
);

warehouseRouter.get(
  '/grn',
  requirePermission('inventory:read'),
  warehouseController.listGrns.bind(warehouseController)
);

warehouseRouter.get(
  '/grn/:grnId',
  requirePermission('inventory:read'),
  warehouseController.getGrn.bind(warehouseController)
);

/**
 * Service Request Part Reservations
 */
warehouseRouter.post(
  '/reservations',
  requireCsrf,
  requireAnyPermission('inventory:dispatch', 'inventory:manage'),
  warehouseController.reservePart.bind(warehouseController)
);

warehouseRouter.delete(
  '/reservations/:reservationId',
  requireCsrf,
  requireAnyPermission('inventory:dispatch', 'inventory:manage'),
  warehouseController.releaseReservation.bind(warehouseController)
);

warehouseRouter.get(
  '/reservations',
  requirePermission('inventory:read'),
  warehouseController.listReservations.bind(warehouseController)
);

/**
 * Outbound Stock Dispatches & Challans
 */
warehouseRouter.post(
  '/dispatches',
  requireCsrf,
  requirePermission('inventory:dispatch'),
  warehouseController.dispatchStock.bind(warehouseController)
);

warehouseRouter.post(
  '/dispatches/:dispatchId/acknowledge',
  requireCsrf,
  requireAnyPermission('inventory:transfer', 'inventory:manage'),
  warehouseController.acknowledgeDispatch.bind(warehouseController)
);

warehouseRouter.get(
  '/dispatches',
  requirePermission('inventory:read'),
  warehouseController.listDispatches.bind(warehouseController)
);

warehouseRouter.get(
  '/dispatches/:dispatchId',
  requirePermission('inventory:read'),
  warehouseController.getDispatch.bind(warehouseController)
);

/**
 * Defective Returns & Quarantine
 */
warehouseRouter.post(
  '/returns',
  requireCsrf,
  requirePermission('inventory:manage'),
  warehouseController.returnStock.bind(warehouseController)
);

warehouseRouter.post(
  '/returns/:returnId/disposition',
  requireCsrf,
  requirePermission('inventory:manage'),
  warehouseController.dispositionReturn.bind(warehouseController)
);

warehouseRouter.get(
  '/returns',
  requirePermission('inventory:read'),
  warehouseController.listReturns.bind(warehouseController)
);

/**
 * Controlled Stock Adjustments & Reconciliation
 */
warehouseRouter.post(
  '/adjustments',
  requireCsrf,
  requirePermission('inventory:adjust'),
  warehouseController.adjustStock.bind(warehouseController)
);

warehouseRouter.get(
  '/adjustments',
  requirePermission('inventory:read'),
  warehouseController.listAdjustments.bind(warehouseController)
);

warehouseRouter.get(
  '/reconcile/:locationId/:partId',
  requirePermission('inventory:reconcile'),
  warehouseController.reconcile.bind(warehouseController)
);

/**
 * Double-Entry Movement History Ledger
 */
warehouseRouter.get(
  '/movements',
  requirePermission('inventory:read'),
  warehouseController.listMovements.bind(warehouseController)
);
