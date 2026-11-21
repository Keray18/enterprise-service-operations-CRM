import { NextFunction, Request, Response } from 'express';
import { engineerService } from '../services/engineerService.js';
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
}

export const engineerController = new EngineerController();

