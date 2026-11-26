import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission, requireRole } from '../middleware/authMiddleware.js';
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

// Provider Super Admin Workspace Check
workspaceRouter.get(
  '/super-admin',
  requireAuth,
  requireRole('SUPER_ADMIN'),
  requirePermission('admins:manage'),
  (req: Request, res: Response) => {
    sendSuccess(res, {
      workspace: 'SUPER_ADMIN',
      accessible: true,
      user: req.user,
      message: 'Provider Super Admin privileges verified.',
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

// Service Center (ASF) Workspace Check
workspaceRouter.get(
  '/service-center',
  requireAuth,
  requirePermission('asf:read'),
  (req: Request, res: Response) => {
    sendSuccess(res, {
      workspace: 'ASF',
      accessible: true,
      user: req.user,
      message: 'Service Center operational privileges verified.',
    });
  }
);

workspaceRouter.get(
  '/asf',
  requireAuth,
  requirePermission('asf:read'),
  (req: Request, res: Response) => {
    sendSuccess(res, {
      workspace: 'ASF',
      accessible: true,
      user: req.user,
      message: 'Service Center operational privileges verified.',
    });
  }
);

// Field Engineer Workspace Check
workspaceRouter.get(
  '/engineer',
  requireAuth,
  (req: Request, res: Response) => {
    const roles = req.user?.roles || [];
    if (!roles.includes('ENGINEER') && !roles.includes('ADMIN')) {
      res.status(403).json({ success: false, error: { message: 'Access denied. Field Engineer or Admin role required.', code: 'FORBIDDEN' } });
      return;
    }
    sendSuccess(res, {
      workspace: 'ENGINEER',
      accessible: true,
      user: req.user,
      message: 'Field Engineer workspace privileges verified.',
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
