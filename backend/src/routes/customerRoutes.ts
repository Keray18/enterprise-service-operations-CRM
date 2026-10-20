import { Router } from 'express';
import { callCenterController } from '../controllers/callCenterController.js';
import { requireAuth, requireCsrf, requirePermission } from '../middleware/authMiddleware.js';

export const customerRouter = Router();

customerRouter.get(
  '/search',
  requireAuth,
  requirePermission('calls:read'),
  callCenterController.searchCustomers.bind(callCenterController)
);

customerRouter.get(
  '/:id',
  requireAuth,
  requirePermission('calls:read'),
  callCenterController.getCustomerById.bind(callCenterController)
);

customerRouter.post(
  '/',
  requireAuth,
  requireCsrf,
  requirePermission('calls:create'),
  callCenterController.createCustomer.bind(callCenterController)
);

customerRouter.get(
  '/:id/requests',
  requireAuth,
  requirePermission('calls:read'),
  callCenterController.getCustomerRequests.bind(callCenterController)
);
