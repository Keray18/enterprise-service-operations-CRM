import { NextFunction, Request, Response } from 'express';
import { asfService } from '../services/asfService.js';
import { slaMonitoringService } from '../services/slaMonitoringService.js';
import {
  asfQueueQuerySchema,
  checkInComplaintSchema,
  dispatchComplaintSchema,
  engineerJobsQuerySchema,
  regenerateOtpSchema,
} from '../validation/asfSchemas.js';

export class AsfController {
  async getQueue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = asfQueueQuerySchema.parse(req.query);
      const result = await asfService.getAsfQueue(parsed, req.user!);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getEligibleEngineers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const locationId = req.params.locationId || req.user!.locationId;
      if (!locationId) {
        res.status(200).json({ success: true, data: [] });
        return;
      }
      const engineers = await asfService.getEligibleEngineers(locationId, req.user!);
      res.status(200).json({
        success: true,
        data: engineers,
      });
    } catch (err) {
      next(err);
    }
  }

  async dispatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = dispatchComplaintSchema.parse(req.body);
      const result = await asfService.dispatchComplaint(
        {
          requestId: req.params.id!,
          ...parsed,
        },
        req.user!
      );
      res.status(200).json({
        success: true,
        data: result,
        message: 'Service request dispatched and appointment scheduled successfully.',
      });
    } catch (err) {
      next(err);
    }
  }

  async regenerateOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = regenerateOtpSchema.parse(req.body);
      const result = await asfService.regenerateCheckInOtp(
        {
          requestId: req.params.id!,
          reason: parsed.reason,
        },
        req.user!
      );
      res.status(200).json({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (err) {
      next(err);
    }
  }

  async checkIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = checkInComplaintSchema.parse(req.body);
      const result = await asfService.checkInWithOtp(
        {
          requestId: req.params.id!,
          ...parsed,
        },
        req.user!
      );
      res.status(200).json({
        success: true,
        data: result,
        message: 'Technician check-in verified successfully via customer OTP.',
      });
    } catch (err) {
      next(err);
    }
  }

  async getEngineerJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = engineerJobsQuerySchema.parse(req.query);
      const result = await asfService.getEngineerJobs(req.user!, parsed);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async evaluateSla(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await slaMonitoringService.evaluate48hSlaBreaches(req.user?.userId);
      res.status(200).json({
        success: true,
        data: result,
        message: `SLA monitoring evaluation complete: ${result.newBreachesCount} new breach(es) flagged.`,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const asfController = new AsfController();
