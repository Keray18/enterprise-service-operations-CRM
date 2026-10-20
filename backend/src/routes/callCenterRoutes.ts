import { Router } from 'express';
import { callCenterController } from '../controllers/callCenterController.js';
import { requireAuth, requireCsrf, requirePermission } from '../middleware/authMiddleware.js';

export const callCenterRouter = Router();

callCenterRouter.get(
  '/serviceability/:pincode',
  requireAuth,
  requirePermission('calls:read'),
  callCenterController.resolvePincodeServiceability.bind(callCenterController)
);

callCenterRouter.get(
  '/vocs',
  requireAuth,
  requirePermission('calls:read'),
  callCenterController.listVOCs.bind(callCenterController)
);

callCenterRouter.post(
  '/complaints',
  requireAuth,
  requireCsrf,
  requirePermission('calls:create'),
  callCenterController.registerComplaint.bind(callCenterController)
);

callCenterRouter.get(
  '/requests',
  requireAuth,
  requirePermission('calls:read'),
  callCenterController.searchRequests.bind(callCenterController)
);

callCenterRouter.get(
  '/requests/recent',
  requireAuth,
  requirePermission('calls:read'),
  callCenterController.getRecentRequests.bind(callCenterController)
);

callCenterRouter.get(
  '/requests/job/:jobNumber',
  requireAuth,
  requirePermission('calls:read'),
  callCenterController.getRequestByJobNumber.bind(callCenterController)
);

callCenterRouter.get(
  '/requests/:id',
  requireAuth,
  requirePermission('calls:read'),
  callCenterController.getRequestById.bind(callCenterController)
);

callCenterRouter.get(
  '/requests/:id/events',
  requireAuth,
  requirePermission('calls:read'),
  callCenterController.getRequestEvents.bind(callCenterController)
);

callCenterRouter.get(
  '/requests/:id/notifications',
  requireAuth,
  requirePermission('calls:read'),
  callCenterController.getRequestNotifications.bind(callCenterController)
);
