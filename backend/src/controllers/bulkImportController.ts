import fs from 'fs';
import path from 'path';
import { NextFunction, Request, Response } from 'express';
import { bulkImportRepository } from '../database/repositories/bulkImportRepository.js';
import { AppError, sendSuccess } from '../middleware/errorHandler.js';
import { bulkImportService } from '../services/bulkImportService.js';
import { bulkImportTemplateService } from '../services/bulkImportTemplateService.js';
import { commitImportSchema, entityTypeParamSchema, importModeSchema } from '../validation/bulkImportSchemas.js';

export class BulkImportController {
  async downloadTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const entityType = entityTypeParamSchema.parse(req.params.entityType);
      const { buffer, fileName } = await bulkImportTemplateService.getTemplate(entityType);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }

  async previewImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    const file = req.file;
    if (!file) {
      return next(new AppError('No Excel file uploaded. Please attach a .xlsx file.', 400, 'MISSING_FILE'));
    }

    try {
      // Validate entityType and importMode
      const rawEntityType = req.body.entityType || req.query.entityType;
      const rawMode = req.body.importMode || req.query.importMode || 'CREATE_ONLY';

      const entityType = entityTypeParamSchema.parse(rawEntityType);
      const mode = importModeSchema.parse(rawMode);

      // Verify extension
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext !== '.xlsx') {
        throw new AppError('Only .xlsx Excel files are supported.', 400, 'UNSUPPORTED_FILE_TYPE');
      }

      // Check user rate limit / active imports
      const activeCount = await bulkImportRepository.countActiveJobsForUser(req.user!.userId);
      if (activeCount > 2) {
        throw new AppError(
          'You already have an import operation in progress. Please wait for it to complete.',
          429,
          'CONCURRENT_IMPORT_LIMIT'
        );
      }

      // Read file buffer
      const fileBuffer = await fs.promises.readFile(file.path);

      const previewSummary = await bulkImportService.generatePreview(
        fileBuffer,
        file.originalname,
        entityType,
        mode,
        {
          userId: req.user!.userId,
          username: req.user!.username,
        }
      );

      sendSuccess(res, previewSummary, 200);
    } catch (err) {
      next(err);
    } finally {
      // Clean up temporary upload file reliably
      if (file?.path) {
        fs.promises.unlink(file.path).catch(() => {});
      }
    }
  }

  async commitImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = commitImportSchema.parse(req.body);

      const result = await bulkImportService.commitImport(jobId, {
        userId: req.user!.userId,
        username: req.user!.username,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      });

      sendSuccess(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  async downloadReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const jobId = req.params.jobId as string;
      if (!jobId) {
        throw new AppError('Job ID parameter is required.', 400, 'MISSING_JOB_ID');
      }

      const job = await bulkImportRepository.findById(jobId);
      if (!job) {
        throw new AppError('Import job not found.', 404, 'JOB_NOT_FOUND');
      }

      // Authorization: must be the job creator, or admin / auditor
      const isOwner = job.createdBy === req.user!.userId;
      const isAdmin =
        req.user!.roles.includes('ADMIN') ||
        req.user!.permissions.includes('system:audit') ||
        req.user!.permissions.includes('masters:manage');

      if (!isOwner && !isAdmin) {
        throw new AppError('Access denied. You cannot view another user\'s import report.', 403, 'FORBIDDEN');
      }

      const { buffer, fileName } = await bulkImportService.generateResultReport(jobId);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }

  async listHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const isAdmin =
        req.user!.roles.includes('ADMIN') || req.user!.permissions.includes('system:audit');
      const userId = isAdmin ? undefined : req.user!.userId;
      const entityType = req.query.entityType as string | undefined;

      const jobs = await bulkImportRepository.listRecentJobs({
        userId,
        entityType: entityType ? entityType.toUpperCase() : undefined,
        limit: 20,
      });

      sendSuccess(res, jobs, 200);
    } catch (err) {
      next(err);
    }
  }
}

export const bulkImportController = new BulkImportController();
