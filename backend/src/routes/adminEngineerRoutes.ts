import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import { adminEngineerController } from '../controllers/adminEngineerController.js';

export const adminEngineerRoutes = Router();

// Engineer management endpoints are strictly restricted to System Administrators
adminEngineerRoutes.use(requireAuth, requireRole('ADMIN'));

/**
 * GET /api/v1/admin/engineers
 * List all field engineers across the network with search, location, and status filters
 */
adminEngineerRoutes.get('/', adminEngineerController.listEngineers.bind(adminEngineerController));

/**
 * POST /api/v1/admin/engineers
 * Create a new field engineer account with atomic role assignment and generated temporary password
 */
adminEngineerRoutes.post('/', adminEngineerController.createEngineer.bind(adminEngineerController));

/**
 * GET /api/v1/admin/engineers/:id/active-jobs
 * Retrieve active open jobs assigned to an engineer
 */
adminEngineerRoutes.get('/:id/active-jobs', adminEngineerController.getActiveJobs.bind(adminEngineerController));

/**
 * PATCH /api/v1/admin/engineers/:id/status
 * Activate or deactivate an engineer with active-job reassignment safeguard
 */
adminEngineerRoutes.patch('/:id/status', adminEngineerController.updateStatus.bind(adminEngineerController));

/**
 * POST /api/v1/admin/engineers/:id/reset-password
 * Reset an engineer's password and return a temporary password
 */
adminEngineerRoutes.post('/:id/reset-password', adminEngineerController.resetPassword.bind(adminEngineerController));

/**
 * PATCH /api/v1/admin/engineers/:id/location
 * Update an engineer's assigned home Service Center
 */
adminEngineerRoutes.patch('/:id/location', adminEngineerController.updateLocation.bind(adminEngineerController));

