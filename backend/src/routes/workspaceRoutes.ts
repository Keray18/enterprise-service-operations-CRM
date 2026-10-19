import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../middleware/authMiddleware.js';
import { sendSuccess } from '../middleware/errorHandler.js';

export const workspaceRouter = Router();

// Admin Workspace Check
workspaceRouter.get(
  '/admin',
  requireAuth,
  requirePermission('users:read', 'roles:read'),
  (req: Request, res: Response) => {
    sendSuccess(res, {
      workspace: 'ADMIN',
      accessible: true,
      user: req.user,
      message: 'System Administrator privileges verified.',
    });
  }
);

// Call Center Workspace Check
workspaceRouter.get(
  '/call-center',
  requireAuth,
  requirePermission('calls:read'),
  (req: Request, res: Response) => {
    sendSuccess(res, {
      workspace: 'CALL_CENTER',
      accessible: true,
      user: req.user,
      message: 'Call Center operational privileges verified.',
    });
  }
);

// Warehouse Workspace Check
workspaceRouter.get(
  '/warehouse',
  requireAuth,
  requirePermission('inventory:read'),
  (req: Request, res: Response) => {
    sendSuccess(res, {
      workspace: 'WAREHOUSE',
      accessible: true,
      user: req.user,
      message: 'Central Warehouse logistics privileges verified.',
    });
  }
);
