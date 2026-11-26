import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { getCorrelationId } from '../middleware/correlationId.js';
import { sendSuccess } from '../middleware/errorHandler.js';
import { accountService } from '../services/accountService.js';
import { superAdminService } from '../services/superAdminService.js';
import { systemConfigService } from '../services/systemConfigService.js';
import { AuditContext } from '../types/accounts.js';

export function auditContext(req: Request): AuditContext {
  return {
    ipAddress: req.ip,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    correlationId: getCorrelationId(),
  };
}

const provisionSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  username: z.string().trim().min(3).max(50),
  email: z.string().trim().email().max(255),
  phoneNumber: z.string().trim().max(20).optional().or(z.literal('')),
  locationId: z.string().trim().max(36).optional().or(z.literal('')),
});

const updateSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100).optional(),
    email: z.string().trim().email().max(255).optional(),
    phoneNumber: z.string().trim().max(20).nullable().optional(),
    locationId: z.string().trim().max(36).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

const statusSchema = z.object({
  isActive: z.enum(['Y', 'N']),
  reason: z.string().trim().max(500).optional(),
});

const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['Y', 'N']).optional(),
  role: z.string().trim().max(30).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const auditQuerySchema = z.object({
  action: z.string().trim().max(50).optional(),
  resource: z.string().trim().max(50).optional(),
  actorRole: z.string().trim().max(50).optional(),
  outcome: z.enum(['SUCCESS', 'FAILURE']).optional(),
  search: z.string().trim().max(100).optional(),
  startDate: z.string().trim().max(40).optional(),
  endDate: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

function emptyToUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === '' ? undefined : v;
  return out as T;
}

/**
 * Handlers shared by the provider Super Admin (client Admin accounts) and the client
 * Admin (operational staff). Authority is decided by AccountService from the actor's role,
 * never from request parameters.
 */
export class AccountController {
  constructor(private readonly fixedRole?: 'ADMIN') {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = listSchema.parse(req.query);
      const result = await accountService.listAccounts(req.user!, { ...q, role: this.fixedRole ?? q.role });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = this.fixedRole ?? String(req.body?.role || '').trim().toUpperCase();
      const body = emptyToUndefined(provisionSchema.parse(req.body));
      const result = await accountService.provisionAccount(req.user!, role, body, auditContext(req));
      res.setHeader('Cache-Control', 'no-store');
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateSchema.parse(req.body);
      const account = await accountService.updateAccount(req.user!, String(req.params['id']), body, auditContext(req));
      sendSuccess(res, { account });
    } catch (err) {
      next(err);
    }
  };

  setStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = statusSchema.parse(req.body);
      const result = await accountService.setAccountStatus(req.user!, String(req.params['id']), body.isActive, body.reason, auditContext(req));
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  resetCredentials = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await accountService.resetCredentials(req.user!, String(req.params['id']), auditContext(req));
      res.setHeader('Cache-Control', 'no-store');
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  revokeSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await accountService.revokeSessions(req.user!, String(req.params['id']), auditContext(req));
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}

export class SuperAdminController {
  dashboard = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      sendSuccess(res, await superAdminService.getDashboardSummary());
    } catch (err) {
      next(err);
    }
  };

  health = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      sendSuccess(res, await superAdminService.getHealth());
    } catch (err) {
      next(err);
    }
  };

  notificationFailures = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = z
        .object({
          status: z.enum(['FAILED', 'DEAD_LETTER']).optional(),
          page: z.coerce.number().int().positive().optional(),
          limit: z.coerce.number().int().positive().max(100).optional(),
        })
        .parse(req.query);
      sendSuccess(res, await superAdminService.listNotificationFailures(q));
    } catch (err) {
      next(err);
    }
  };

  auditLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = auditQuerySchema.parse(req.query);
      sendSuccess(res, await superAdminService.getAuditLogs(q));
    } catch (err) {
      next(err);
    }
  };

  listConfig = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      sendSuccess(res, { items: await systemConfigService.listForProvider() });
    } catch (err) {
      next(err);
    }
  };

  updateConfig = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z.object({ value: z.union([z.string(), z.number(), z.boolean()]) }).parse(req.body);
      const updated = await systemConfigService.updateValue(String(req.params['key']), String(body.value), req.user!, auditContext(req));
      sendSuccess(res, { config: updated });
    } catch (err) {
      next(err);
    }
  };
}

export const superAdminController = new SuperAdminController();
export const clientAdminAccountController = new AccountController('ADMIN');
export const staffAccountController = new AccountController();
