import { Router } from 'express';
import { reportingController } from '../controllers/reportingController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

// Base gate: Authentication required for all reporting endpoints
router.use(requireAuth);

// 1. Universal Call / Job / Complaint Register
// Authorized: ADMIN, CALL_CENTER, ASF (scoped)
router.get(
  '/calls',
  requireRole('ADMIN', 'CALL_CENTER', 'ASF'),
  reportingController.getCallRegister.bind(reportingController)
);
router.get(
  '/calls/export',
  requireRole('ADMIN', 'CALL_CENTER', 'ASF'),
  reportingController.exportCallRegisterCsv.bind(reportingController)
);

// 2. Part Consumption & Defect Trend Report
// Authorized: ADMIN, WAREHOUSE, ASF (scoped)
// Denied: CALL_CENTER (no parts costing operational need)
router.get(
  '/parts-consumption',
  requireRole('ADMIN', 'WAREHOUSE', 'ASF'),
  reportingController.getPartConsumption.bind(reportingController)
);
router.get(
  '/parts-consumption/export',
  requireRole('ADMIN', 'WAREHOUSE', 'ASF'),
  reportingController.exportPartConsumptionCsv.bind(reportingController)
);

// 3. Warranty Claims & Settlement Audit Report
// Authorized: ADMIN, ASF (scoped)
// Denied: CALL_CENTER (financial claims segregation), WAREHOUSE
router.get(
  '/warranty-claims',
  requireRole('ADMIN', 'ASF'),
  reportingController.getWarrantyClaims.bind(reportingController)
);
router.get(
  '/warranty-claims/export',
  requireRole('ADMIN', 'ASF'),
  reportingController.exportWarrantyClaimsCsv.bind(reportingController)
);

// 4. Inventory Stock Valuation Report
// Authorized: ADMIN, WAREHOUSE (scoped)
// Denied: CALL_CENTER, ASF
router.get(
  '/stock-valuation',
  requireRole('ADMIN', 'WAREHOUSE'),
  reportingController.getStockValuation.bind(reportingController)
);
router.get(
  '/stock-valuation/export',
  requireRole('ADMIN', 'WAREHOUSE'),
  reportingController.exportStockValuationCsv.bind(reportingController)
);

// 5. Operational Queues Summary
// Authorized: ADMIN, CALL_CENTER, ASF, WAREHOUSE (each scoped)
router.get(
  '/operational-queues',
  requireRole('ADMIN', 'CALL_CENTER', 'ASF', 'WAREHOUSE'),
  reportingController.getOperationalQueues.bind(reportingController)
);

// 6. Notification Outbox Metrics & Daemon Retry
// Authorized: ADMIN only (system administration)
router.get(
  '/notifications/metrics',
  requireRole('ADMIN'),
  reportingController.getNotificationMetrics.bind(reportingController)
);
router.post(
  '/notifications/retry',
  requireRole('ADMIN'),
  reportingController.retryNotifications.bind(reportingController)
);

// 7. Admin Operations Dashboard Analytics
// Authorized: ADMIN only
router.get(
  '/admin/dashboard',
  requireRole('ADMIN'),
  reportingController.getAdminDashboardSummary.bind(reportingController)
);

// 8. Admin Service Centers Workload & Capacity (Paginated)
// Authorized: ADMIN only
router.get(
  '/admin/service-centers',
  requireRole('ADMIN'),
  reportingController.getServiceCenterWorkload.bind(reportingController)
);

export default router;
