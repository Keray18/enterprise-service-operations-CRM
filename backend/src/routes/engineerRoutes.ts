import { Router } from 'express';
import { requireAuth, requireAnyPermission } from '../middleware/authMiddleware.js';
import { engineerController } from '../controllers/engineerController.js';

export const engineerRoutes = Router();

// Technician workspace endpoints require authentication and engineer call permissions
engineerRoutes.use(requireAuth);

/**
 * GET /api/v1/engineer/dashboard
 * Aggregated real-time KPI counters for the authenticated field technician
 */
engineerRoutes.get(
  '/dashboard',
  requireAnyPermission('calls:read', 'calls:checkin'),
  engineerController.getDashboard.bind(engineerController)
);

/**
 * GET /api/v1/engineer/jobs
 * Query jobs assigned directly to the authenticated technician with tab filtering
 */
engineerRoutes.get(
  '/jobs',
  requireAnyPermission('calls:read', 'calls:checkin'),
  engineerController.getMyJobs.bind(engineerController)
);

/**
 * POST /api/v1/engineer/custody/acknowledge
 * Field technician physically acknowledges receipt and collection of the spare part.
 */
engineerRoutes.post(
  '/custody/acknowledge',
  requireAnyPermission('calls:checkin', 'calls:close', 'calls:read'),
  engineerController.acknowledgeCollection.bind(engineerController)
);

/**
 * POST /api/v1/engineer/replacements/:id/verify-code
 * Cryptographic Happy Code verification for ARRIVAL and COMPLETION on replacement visits.
 */
engineerRoutes.post(
  '/replacements/:id/verify-code',
  requireAnyPermission('calls:checkin', 'calls:close'),
  engineerController.verifyReplacementHappyCode.bind(engineerController)
);

/**
 * POST /api/v1/engineer/replacements/:id/verify-arrival
 * Assigned engineer verifies arrival at customer site.
 */
engineerRoutes.post(
  '/replacements/:id/verify-arrival',
  requireAnyPermission('calls:checkin', 'calls:close'),
  engineerController.verifyInstallationArrival.bind(engineerController)
);

/**
 * POST /api/v1/engineer/replacements/:id/complete-installation
 * Assigned engineer verifies Completion Happy Code and submits installation completion evidence.
 */
engineerRoutes.post(
  '/replacements/:id/complete-installation',
  requireAnyPermission('calls:checkin', 'calls:close'),
  engineerController.completeInstallation.bind(engineerController)
);


