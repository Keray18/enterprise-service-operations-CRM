import { Request, Response } from 'express';
import { logger } from '../logging/logger.js';
import { reportingService } from '../services/reportingService.js';
import { AuthenticatedUser } from '../types/auth.js';

export class ReportingController {
  async getCallRegister(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const { fromDate, toDate, brandId, locationId, status, callType, limit, offset } = req.query;

      const records = await reportingService.getCallRegister(
        {
          fromDate: fromDate as string,
          toDate: toDate as string,
          brandId: brandId as string,
          locationId: locationId as string,
          status: status as string,
          callType: callType as string,
          limit: limit ? Number(limit) : undefined,
          offset: offset ? Number(offset) : undefined,
        },
        user
      );

      res.json({
        success: true,
        data: records,
        count: records.length,
      });
    } catch (err: any) {
      logger.error('Failed to generate call register report', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  async exportCallRegisterCsv(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const { fromDate, toDate, brandId, locationId, status, callType } = req.query;

      await reportingService.streamCallRegisterCsv(
        {
          fromDate: fromDate as string,
          toDate: toDate as string,
          brandId: brandId as string,
          locationId: locationId as string,
          status: status as string,
          callType: callType as string,
        },
        user,
        res
      );
    } catch (err: any) {
      logger.error('Failed to export call register CSV', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: err.message || 'Export failed' });
      }
    }
  }

  async getPartConsumption(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const { brandId, locationId, fromDate, toDate, limit } = req.query;

      const records = await reportingService.getPartConsumption(
        {
          brandId: brandId as string,
          locationId: locationId as string,
          fromDate: fromDate as string,
          toDate: toDate as string,
          limit: limit ? Number(limit) : undefined,
        },
        user
      );

      res.json({
        success: true,
        data: records,
        count: records.length,
      });
    } catch (err: any) {
      logger.error('Failed to generate part consumption report', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  async getWarrantyClaims(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const { brandId, asfLocationId, claimYear, claimMonth, status, limit } = req.query;

      const records = await reportingService.getWarrantyClaims(
        {
          brandId: brandId as string,
          asfLocationId: asfLocationId as string,
          claimYear: claimYear ? Number(claimYear) : undefined,
          claimMonth: claimMonth ? Number(claimMonth) : undefined,
          status: status as string,
          limit: limit ? Number(limit) : undefined,
        },
        user
      );

      res.json({
        success: true,
        data: records,
        count: records.length,
      });
    } catch (err: any) {
      logger.error('Failed to generate warranty claims report', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  async getStockValuation(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const { locationId, category, limit } = req.query;

      const records = await reportingService.getStockValuation(
        {
          locationId: locationId as string,
          category: category as string,
          limit: limit ? Number(limit) : undefined,
        },
        user
      );

      res.json({
        success: true,
        data: records,
        count: records.length,
      });
    } catch (err: any) {
      logger.error('Failed to generate stock valuation report', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  async exportPartConsumptionCsv(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const { brandId, locationId, fromDate, toDate } = req.query;

      await reportingService.streamPartConsumptionCsv(
        {
          brandId: brandId as string,
          locationId: locationId as string,
          fromDate: fromDate as string,
          toDate: toDate as string,
        },
        user,
        res
      );
    } catch (err: any) {
      logger.error('Failed to export part consumption CSV', err);
      if (!res.headersSent) {
        res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Export failed' });
      }
    }
  }

  async exportWarrantyClaimsCsv(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const { brandId, asfLocationId, claimYear, claimMonth, status } = req.query;

      await reportingService.streamWarrantyClaimsCsv(
        {
          brandId: brandId as string,
          asfLocationId: asfLocationId as string,
          claimYear: claimYear ? Number(claimYear) : undefined,
          claimMonth: claimMonth ? Number(claimMonth) : undefined,
          status: status as string,
        },
        user,
        res
      );
    } catch (err: any) {
      logger.error('Failed to export warranty claims CSV', err);
      if (!res.headersSent) {
        res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Export failed' });
      }
    }
  }

  async exportStockValuationCsv(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const { locationId, category } = req.query;

      await reportingService.streamStockValuationCsv(
        {
          locationId: locationId as string,
          category: category as string,
        },
        user,
        res
      );
    } catch (err: any) {
      logger.error('Failed to export stock valuation CSV', err);
      if (!res.headersSent) {
        res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Export failed' });
      }
    }
  }

  async getOperationalQueues(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const queues = await reportingService.getOperationalQueues(user);

      res.json({
        success: true,
        data: queues,
      });
    } catch (err: any) {
      logger.error('Failed to query operational queues', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  async getNotificationMetrics(_req: Request, res: Response): Promise<void> {
    try {
      const metrics = await reportingService.getNotificationMetrics();
      res.json({
        success: true,
        data: metrics,
      });
    } catch (err: any) {
      logger.error('Failed to fetch notification metrics', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  async retryNotifications(_req: Request, res: Response): Promise<void> {
    try {
      const result = await reportingService.retryNotifications();
      res.json({
        success: true,
        data: result,
        message: `Notification daemon retry cycle complete. Succeeded: ${result.succeededCount}, Failed: ${result.failedCount}, Escalated: ${result.escalatedCount}`,
      });
    } catch (err: any) {
      logger.error('Failed to run notification retries', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }
}

export const reportingController = new ReportingController();
