import { Router } from 'express';
import { asfController } from '../controllers/asfController.js';
import { requireAnyPermission, requireAuth, requireCsrf, requirePermission } from '../middleware/authMiddleware.js';

export const asfRoutes = Router();

// All ASF routes require authenticated session
asfRoutes.use(requireAuth);

/**
 * GET /api/v1/asf/queue
 * Retrieves the operational incoming work queue with SLA status, location scoping, and filters.
 */
asfRoutes.get(
  '/queue',
  requireAnyPermission('asf:read', 'calls:read'),
  asfController.getQueue.bind(asfController)
);

/**
 * GET /api/v1/asf/engineers
 * GET /api/v1/asf/engineers/:locationId
 * Retrieves active field technicians eligible for dispatch in an ASF location.
 */
asfRoutes.get(
  '/engineers',
  requireAnyPermission('asf:read', 'calls:assign', 'asf:manage'),
  asfController.getEligibleEngineers.bind(asfController)
);

asfRoutes.get(
  '/engineers/:locationId',
  requireAnyPermission('asf:read', 'calls:assign', 'asf:manage'),
  asfController.getEligibleEngineers.bind(asfController)
);

/**
 * POST /api/v1/asf/requests/:id/dispatch
 * Single-commit dispatch workflow: sets appointment, assigns technician, generates Check-In OTP,
 * logs lifecycle event, and queues SMS 2.
 */
asfRoutes.post(
  '/requests/:id/dispatch',
  requireCsrf,
  requireAnyPermission('calls:assign', 'asf:manage'),
  asfController.dispatch.bind(asfController)
);

/**
 * POST /api/v1/asf/requests/:id/regenerate-otp
 * Regenerates the 6-digit customer Check-In OTP, superseding previous OTP and queuing SMS 6.
 */
asfRoutes.post(
  '/requests/:id/regenerate-otp',
  requireCsrf,
  requireAnyPermission('calls:assign', 'calls:update', 'asf:manage'),
  asfController.regenerateOtp.bind(asfController)
);

/**
 * POST /api/v1/asf/requests/:id/check-in
 * Authenticated on-site technician check-in using customer-provided 6-digit OTP.
 */
asfRoutes.post(
  '/requests/:id/check-in',
  requireCsrf,
  requirePermission('calls:checkin'),
  asfController.checkIn.bind(asfController)
);

/**
 * GET /api/v1/asf/engineer-jobs
 * Retrieves jobs and scheduled appointments assigned to the logged-in field technician.
 */
asfRoutes.get(
  '/engineer-jobs',
  requireAnyPermission('calls:read', 'calls:checkin'),
  asfController.getEngineerJobs.bind(asfController)
);

/**
 * POST /api/v1/asf/sla/evaluate
 * Triggers 48-hour acknowledgement SLA monitoring evaluation.
 */
asfRoutes.post(
  '/sla/evaluate',
  requireCsrf,
  requireAnyPermission('asf:manage', 'system:audit'),
  asfController.evaluateSla.bind(asfController)
);
