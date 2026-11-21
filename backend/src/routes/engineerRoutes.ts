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

