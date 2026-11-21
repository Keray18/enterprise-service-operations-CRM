import { NextFunction, Request, Response } from 'express';
import { adminEngineerService } from '../services/adminEngineerService.js';
import {
  adminEngineerQuerySchema,
  createEngineerSchema,
  updateEngineerLocationSchema,
  updateEngineerStatusSchema,
} from '../validation/engineerSchemas.js';

export class AdminEngineerController {
  async listEngineers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = adminEngineerQuerySchema.parse(req.query);
      const result = await adminEngineerService.listEngineers(parsed, req.user!);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async createEngineer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = createEngineerSchema.parse(req.body);
      const result = await adminEngineerService.createEngineer(parsed, req.user!);
      res.status(201).json({
        success: true,
        data: result,
        message: 'Field engineer account created successfully.',
      });
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = updateEngineerStatusSchema.parse(req.body);
      const result = await adminEngineerService.setEngineerStatus(
        req.params.id!,
        parsed.isActive,
        parsed.reassignToEngineerId,
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

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminEngineerService.resetEngineerPassword(req.params.id!, req.user!);
      res.status(200).json({
        success: true,
        data: result,
        message: 'Engineer password reset successfully. Please securely share the temporary password.',
      });
    } catch (err) {
      next(err);
    }
  }

  async updateLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = updateEngineerLocationSchema.parse(req.body);
      const result = await adminEngineerService.updateEngineerLocation(
        req.params.id!,
        parsed.homeLocationId,
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

  async getActiveJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const jobs = await adminEngineerService.getEngineerActiveJobs(req.params.id!);
      res.status(200).json({
        success: true,
        data: jobs,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const adminEngineerController = new AdminEngineerController();

