import { Router } from 'express';
import { reportingController } from '../controllers/reportingController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

// Base gate: Authentication required for all reporting endpoints
router.use(requireAuth);

// 1. Universal Call / Job / Complaint Register
// Authorized: ADMIN, CALL_CENTER, ASF (scoped), BRAND (scoped), FINANCE
router.get(
  '/calls',
  requireRole('ADMIN', 'CALL_CENTER', 'ASF', 'BRAND', 'FINANCE'),
  reportingController.getCallRegister.bind(reportingController)
);
router.get(
  '/calls/export',
  requireRole('ADMIN', 'CALL_CENTER', 'ASF', 'BRAND', 'FINANCE'),
  reportingController.exportCallRegisterCsv.bind(reportingController)
);

// 2. Part Consumption & Defect Trend Report
// Authorized: ADMIN, WAREHOUSE, FINANCE, ASF (scoped), BRAND (scoped)
// Denied: CALL_CENTER (no parts costing operational need)
router.get(
  '/parts-consumption',
  requireRole('ADMIN', 'WAREHOUSE', 'FINANCE', 'ASF', 'BRAND'),
  reportingController.getPartConsumption.bind(reportingController)
);
router.get(
  '/parts-consumption/export',
  requireRole('ADMIN', 'WAREHOUSE', 'FINANCE', 'ASF', 'BRAND'),
  reportingController.exportPartConsumptionCsv.bind(reportingController)
);

// 3. Warranty Claims & Settlement Audit Report
// Authorized: ADMIN, FINANCE, BRAND (scoped), ASF (scoped)
// Denied: CALL_CENTER (financial claims segregation), WAREHOUSE
router.get(
  '/warranty-claims',
  requireRole('ADMIN', 'FINANCE', 'BRAND', 'ASF'),
  reportingController.getWarrantyClaims.bind(reportingController)
);
router.get(
  '/warranty-claims/export',
  requireRole('ADMIN', 'FINANCE', 'BRAND', 'ASF'),
  reportingController.exportWarrantyClaimsCsv.bind(reportingController)
);

// 4. Inventory Stock Valuation Report
// Authorized: ADMIN, FINANCE, WAREHOUSE (scoped)
// Denied: CALL_CENTER, ASF, BRAND
router.get(
  '/stock-valuation',
  requireRole('ADMIN', 'FINANCE', 'WAREHOUSE'),
  reportingController.getStockValuation.bind(reportingController)
);
router.get(
  '/stock-valuation/export',
  requireRole('ADMIN', 'FINANCE', 'WAREHOUSE'),
  reportingController.exportStockValuationCsv.bind(reportingController)
);

// 5. Operational Queues Summary
// Authorized: ADMIN, CALL_CENTER, ASF, BRAND, FINANCE, WAREHOUSE (each scoped)
router.get(
  '/operational-queues',
  requireRole('ADMIN', 'CALL_CENTER', 'ASF', 'BRAND', 'FINANCE', 'WAREHOUSE'),
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

export default router;
