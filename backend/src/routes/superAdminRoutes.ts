import { Router } from 'express';
import {
  clientAdminAccountController,
  staffAccountController,
  superAdminController,
} from '../controllers/superAdminController.js';
import { requireAuth, requireCsrf, requirePermission, requireRole } from '../middleware/authMiddleware.js';

/**
 * Provider Super Admin API — /api/v1/super-admin
 * Every route requires the SUPER_ADMIN role; individual capabilities additionally
 * require the matching provider permission seeded by V033.
 */
export const superAdminRoutes = Router();
superAdminRoutes.use(requireAuth, requireRole('SUPER_ADMIN'));

superAdminRoutes.get('/dashboard', requirePermission('system:telemetry'), superAdminController.dashboard);
superAdminRoutes.get('/health', requirePermission('system:telemetry'), superAdminController.health);
superAdminRoutes.get('/notifications/failures', requirePermission('system:telemetry'), superAdminController.notificationFailures);
superAdminRoutes.get('/audit-logs', requirePermission('audit:read'), superAdminController.auditLogs);
superAdminRoutes.get('/config', requirePermission('system:config'), superAdminController.listConfig);
superAdminRoutes.patch('/config/:key', requireCsrf, requirePermission('system:config'), superAdminController.updateConfig);

// Client Administrator account lifecycle
superAdminRoutes.get('/admins', requirePermission('admins:manage'), clientAdminAccountController.list);
superAdminRoutes.post('/admins', requireCsrf, requirePermission('admins:manage'), clientAdminAccountController.create);
superAdminRoutes.patch('/admins/:id', requireCsrf, requirePermission('admins:manage'), clientAdminAccountController.update);
superAdminRoutes.patch('/admins/:id/status', requireCsrf, requirePermission('admins:manage'), clientAdminAccountController.setStatus);
superAdminRoutes.post('/admins/:id/reset-credentials', requireCsrf, requirePermission('admins:manage'), clientAdminAccountController.resetCredentials);
superAdminRoutes.post('/admins/:id/revoke-sessions', requireCsrf, requirePermission('admins:manage'), clientAdminAccountController.revokeSessions);

/**
 * Client Admin operational staff API — /api/v1/admin/staff
 * ADMIN only. Manageable roles are CALL_CENTER, ASF, ENGINEER and WAREHOUSE; the service
 * layer rejects any attempt to create or touch ADMIN / SUPER_ADMIN accounts.
 */
export const adminStaffRoutes = Router();
adminStaffRoutes.use(requireAuth, requireRole('ADMIN'));

adminStaffRoutes.get('/', requirePermission('users:read'), staffAccountController.list);
adminStaffRoutes.post('/', requireCsrf, requirePermission('users:create'), staffAccountController.create);
adminStaffRoutes.patch('/:id', requireCsrf, requirePermission('users:update'), staffAccountController.update);
adminStaffRoutes.patch('/:id/status', requireCsrf, requirePermission('users:update'), staffAccountController.setStatus);
adminStaffRoutes.post('/:id/reset-credentials', requireCsrf, requirePermission('users:update'), staffAccountController.resetCredentials);
adminStaffRoutes.post('/:id/revoke-sessions', requireCsrf, requirePermission('users:update'), staffAccountController.revokeSessions);
