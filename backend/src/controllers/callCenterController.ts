import { NextFunction, Request, Response } from 'express';
import { getOracleConnection } from '../database/oraclePool.js';
import { customerRepository } from '../database/repositories/customerRepository.js';
import { sendSuccess } from '../middleware/errorHandler.js';
import { callCenterService } from '../services/callCenterService.js';
import {
  customerSearchSchema,
  newCustomerSchema,
  registerComplaintSchema,
  searchRequestsSchema,
} from '../validation/callCenterSchemas.js';

export class CallCenterController {
  /**
   * GET /api/v1/customers/search
   */
  async searchCustomers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = customerSearchSchema.parse(req.query);
      const result = await callCenterService.searchCustomers(validated);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/customers/:id
   */
  async getCustomerById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customer = await callCenterService.getCustomerById(String(req.params.id));
      sendSuccess(res, customer);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/customers
   */
  async createCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    const conn = await getOracleConnection();
    try {
      const validated = newCustomerSchema.parse(req.body);
      const customer = await customerRepository.createCustomer(
        {
          ...validated,
          createdBy: req.user?.username || 'SYSTEM',
        },
        conn
      );
      await conn.commit();
      sendSuccess(res, customer, 201);
    } catch (err) {
      await conn.rollback();
      next(err);
    } finally {
      await conn.close();
    }
  }

  /**
   * GET /api/v1/customers/:id/requests
   */
  async getCustomerRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const requests = await callCenterService.listRecentRequests({
        customerId: String(req.params.id),
        limit: 20,
      });
      sendSuccess(res, requests);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/call-center/serviceability/:pincode
   */
  async resolvePincodeServiceability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const resolution = await callCenterService.resolvePincode(String(req.params.pincode));
      sendSuccess(res, resolution);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/call-center/vocs
   */
  async listVOCs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined;
      const brandId = typeof req.query.brandId === 'string' ? req.query.brandId : undefined;
      const vocs = await callCenterService.listVOCs(productId, brandId);
      sendSuccess(res, vocs);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/call-center/complaints
   */
  async registerComplaint(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = registerComplaintSchema.parse(req.body);
      const result = await callCenterService.registerServiceRequest(validated, req.user!);
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/call-center/requests
   */
  async searchRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = searchRequestsSchema.parse(req.query);
      const result = await callCenterService.searchRequests(validated);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/call-center/requests/recent
   */
  async getRecentRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const result = await callCenterService.listRecentRequests({ limit, status });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/call-center/requests/job/:jobNumber
   */
  async getRequestByJobNumber(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await callCenterService.getRequestByJobNumber(String(req.params.jobNumber));
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/call-center/requests/:id
   */
  async getRequestById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await callCenterService.getRequestById(String(req.params.id));
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/call-center/requests/:id/events
   */
  async getRequestEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const events = await callCenterService.getRequestEvents(String(req.params.id));
      sendSuccess(res, events);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/call-center/requests/:id/notifications
   */
  async getRequestNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const notifications = await callCenterService.getRequestNotifications(String(req.params.id));
      sendSuccess(res, notifications);
    } catch (err) {
      next(err);
    }
  }
}

export const callCenterController = new CallCenterController();
