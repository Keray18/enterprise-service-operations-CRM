import { NextFunction, Request, Response } from 'express';
import { custodyService } from '../services/custodyService.js';
import { engineerService } from '../services/engineerService.js';
import { replacementService } from '../services/replacementService.js';
import { replacementVerificationService } from '../services/replacementVerificationService.js';
import {
  acknowledgeCollectionSchema,
  completeInstallationSchema,
  verifyReplacementHappyCodeSchema,
} from '../validation/asfSchemas.js';
import { engineerJobsQuerySchema } from '../validation/engineerSchemas.js';

export class EngineerController {
  async getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const kpis = await engineerService.getDashboardKpis(req.user!);
      res.status(200).json({
        success: true,
        data: kpis,
      });
    } catch (err) {
      next(err);
    }
  }

  async getMyJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = engineerJobsQuerySchema.parse(req.query);
      const result = await engineerService.getMyJobs(req.user!, parsed);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async acknowledgeCollection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = acknowledgeCollectionSchema.parse(req.body);
      const result = await custodyService.acknowledgeCollection(parsed.handoverId, parsed.remarks, req.user!);
      res.status(200).json({
        success: true,
        data: result,
        message: 'Physical spare part collection acknowledged successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  async verifyReplacementHappyCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = verifyReplacementHappyCodeSchema.parse(req.body);
      const result = await replacementVerificationService.verifyCode(
        {
          replacementId: req.params.id!,
          ...parsed,
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

  async verifyInstallationArrival(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = req.body.code || req.body.happyCode;
      const result = await replacementService.verifyInstallationArrival(req.params.id!, code, req.user!);
      res.status(200).json({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (err) {
      next(err);
    }
  }

  async completeInstallation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = completeInstallationSchema.parse(req.body);
      const result = await replacementService.completeInstallation(req.params.id!, parsed, req.user!);
      res.status(200).json({
        success: true,
        data: result,
        message: 'Replacement installation verified and completed successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}

export const engineerController = new EngineerController();

