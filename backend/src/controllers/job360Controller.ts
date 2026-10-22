import { NextFunction, Request, Response } from 'express';
import { engineeringMasterRepository } from '../database/repositories/engineeringMasterRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { job360Service } from '../services/job360Service.js';
import { AuthenticatedUser } from '../types/auth.js';
import {
  addPartSchema,
  createCancellationRequestSchema,
  createReplacementRequestSchema,
  customerEstimateDecisionSchema,
  initiateClosureSchema,
  provideSpecialPartEstimateSchema,
  recordDiagnosisSchema,
  recordRepairSchema,
  reviewCancellationRequestSchema,
  reviewReplacementRequestSchema,
  submitFeedbackSchema,
  uploadAttachmentSchema,
  verifyHappyCodeSchema,
} from '../validation/job360Schemas.js';

export class Job360Controller {
  async getJob360Details(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const id = req.params.id as string;
      if (!id) {
        throw new AppError('Job ID is required', 400, 'BAD_REQUEST');
      }
      const data = await job360Service.getJob360Details(id, actor);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getEngineeringMasters(req: Request, res: Response, next: NextFunction) {
    try {
      const { brandId, productId } = req.query as { brandId?: string; productId?: string };
      const [faults, defects, repairCodes] = await Promise.all([
        engineeringMasterRepository.listFaults({ brandId, productId, activeOnly: true }),
        engineeringMasterRepository.listDefects({ brandId, productId, activeOnly: true }),
        engineeringMasterRepository.listRepairCodes({ brandId, productId, activeOnly: true }),
      ]);
      res.json({
        success: true,
        data: {
          faults,
          defects,
          repairCodes,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async recordDiagnosis(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const id = req.params.id as string;
      if (!id) {
        throw new AppError('Job ID is required', 400, 'BAD_REQUEST');
      }
      const validated = recordDiagnosisSchema.parse(req.body);
      const data = await job360Service.recordDiagnosis(id, validated, actor);
      res.json({
        success: true,
        data,
        message: 'Diagnosis recorded successfully.',
      });
    } catch (err) {
      next(err);
    }
  }

  async recordRepair(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const id = req.params.id as string;
      if (!id) {
        throw new AppError('Job ID is required', 400, 'BAD_REQUEST');
      }
      const validated = recordRepairSchema.parse(req.body);
      const data = await job360Service.recordRepair(id, validated, actor);
      res.json({
        success: true,
        data,
        message: 'Repair outcome recorded successfully.',
      });
    } catch (err) {
      next(err);
    }
  }

  async addPart(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const id = req.params.id as string;
      if (!id) {
        throw new AppError('Job ID is required', 400, 'BAD_REQUEST');
      }
      const validated = addPartSchema.parse(req.body);
      const data = await job360Service.addPartToJob(id, validated, actor);
      res.status(201).json({
        success: true,
        data,
        message: 'Part added to job successfully.',
      });
    } catch (err) {
      next(err);
    }
  }

  async removePart(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const id = req.params.id as string;
      const partEntryId = req.params.partEntryId as string;
      if (!id || !partEntryId) {
        throw new AppError('Job ID and Part Entry ID are required', 400, 'BAD_REQUEST');
      }
      const data = await job360Service.removePartFromJob(id, partEntryId, actor);
      res.json({
        success: true,
        data,
        message: 'Part removed from job.',
      });
    } catch (err) {
      next(err);
    }
  }

  async provideSpecialPartEstimate(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const id = req.params.id as string;
      if (!id) {
        throw new AppError('Job ID is required', 400, 'BAD_REQUEST');
      }
      const validated = provideSpecialPartEstimateSchema.parse(req.body);
      const data = await job360Service.provideSpecialPartEstimate(id, validated, actor);
      res.json({
        success: true,
        data,
        message: 'Special part estimate quotation recorded.',
      });
    } catch (err) {
      next(err);
    }
  }

  async customerEstimateDecision(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const id = req.params.id as string;
      if (!id) {
        throw new AppError('Job ID is required', 400, 'BAD_REQUEST');
      }
      const validated = customerEstimateDecisionSchema.parse(req.body);
      const data = await job360Service.customerEstimateDecision(id, validated, actor);
      res.json({
        success: true,
        data,
        message: 'Customer estimate decision recorded.',
      });
    } catch (err) {
      next(err);
    }
  }

  async uploadAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const id = req.params.id as string;
      if (!id) {
        throw new AppError('Job ID is required', 400, 'BAD_REQUEST');
      }
      if (!req.file) {
        throw new AppError('No file uploaded. Please attach an image or PDF document.', 400, 'FILE_MISSING');
      }

      const validated = uploadAttachmentSchema.parse(req.body);
      const data = await job360Service.uploadAttachment(
        id,
        {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        },
        validated.attachmentType,
        actor
      );

      res.status(201).json({
        success: true,
        data,
        message: 'Evidence attachment uploaded successfully.',
      });
    } catch (err) {
      next(err);
    }
  }

  async getAttachmentStream(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const attachmentId = req.params.attachmentId as string;
      if (!attachmentId) {
        throw new AppError('Attachment ID is required', 400, 'BAD_REQUEST');
      }
      const fileData = await job360Service.getAttachmentStream(attachmentId, actor);

      res.setHeader('Content-Type', fileData.mimeType);
      res.setHeader('Content-Length', fileData.size);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(fileData.originalName)}"`
      );
      fileData.stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  async deleteAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const attachmentId = req.params.attachmentId as string;
      if (!attachmentId) {
        throw new AppError('Attachment ID is required', 400, 'BAD_REQUEST');
      }
      const data = await job360Service.deleteAttachment(attachmentId, actor);
      res.json({
        success: true,
        data,
        message: 'Attachment deleted successfully.',
      });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // Phase 2C: Closure, Feedback, Replacement & Cancellation
  // ==========================================

  async initiateClosure(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const id = req.params.id as string;
      if (!id) {
        throw new AppError('Job ID is required', 400, 'BAD_REQUEST');
      }
      const validated = initiateClosureSchema.parse(req.body);
      const data = await job360Service.initiateClosure(id, actor, validated.remarks);
      res.json({
        success: true,
        data,
        message: data.message,
      });
    } catch (err) {
      next(err);
    }
  }

  async regenerateHappyCode(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const id = req.params.id as string;
      if (!id) {
        throw new AppError('Job ID is required', 400, 'BAD_REQUEST');
      }
      const data = await job360Service.regenerateHappyCode(id, actor);
      res.json({
        success: true,
        data,
        message: data.message,
      });
    } catch (err) {
      next(err);
    }
  }

  async verifyHappyCode(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const id = req.params.id as string;
      if (!id) {
        throw new AppError('Job ID is required', 400, 'BAD_REQUEST');
      }
      const validated = verifyHappyCodeSchema.parse(req.body);
      const data = await job360Service.verifyHappyCodeAndClose(id, validated, actor);
      res.json({
        success: true,
        data,
        message: data.message,
      });
    } catch (err) {
      next(err);
    }
  }

  async submitFeedback(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const id = req.params.id as string;
      if (!id) {
        throw new AppError('Job ID is required', 400, 'BAD_REQUEST');
      }
      const validated = submitFeedbackSchema.parse(req.body);
      const data = await job360Service.submitFeedback(id, validated, actor);
      res.json({
        success: true,
        data,
        message: data.message,
      });
    } catch (err) {
      next(err);
    }
  }

  async requestReplacement(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const id = req.params.id as string;
      if (!id) {
        throw new AppError('Job ID is required', 400, 'BAD_REQUEST');
      }
      const validated = createReplacementRequestSchema.parse(req.body);
      const data = await job360Service.requestReplacement(id, validated, actor);
      res.status(201).json({
        success: true,
        data,
        message: data.message,
      });
    } catch (err) {
      next(err);
    }
  }

  async reviewReplacement(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const replacementId = req.params.replacementId as string;
      if (!replacementId) {
        throw new AppError('Replacement ID is required', 400, 'BAD_REQUEST');
      }
      const validated = reviewReplacementRequestSchema.parse(req.body);
      const data = await job360Service.reviewReplacement(replacementId, validated, actor);
      res.json({
        success: true,
        data,
        message:
          data.decision === 'APPROVED'
            ? `Replacement approved. Official Approval Number: ${data.approvalNumber}`
            : 'Replacement request rejected.',
      });
    } catch (err) {
      next(err);
    }
  }

  async requestCancellation(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const id = req.params.id as string;
      if (!id) {
        throw new AppError('Job ID is required', 400, 'BAD_REQUEST');
      }
      const validated = createCancellationRequestSchema.parse(req.body);
      const data = await job360Service.requestCancellation(id, validated, actor);
      res.status(201).json({
        success: true,
        data,
        message: data.message,
      });
    } catch (err) {
      next(err);
    }
  }

  async reviewCancellation(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user as AuthenticatedUser;
      const cancellationId = req.params.cancellationId as string;
      if (!cancellationId) {
        throw new AppError('Cancellation ID is required', 400, 'BAD_REQUEST');
      }
      const validated = reviewCancellationRequestSchema.parse(req.body);
      const data = await job360Service.reviewCancellation(cancellationId, validated, actor);
      res.json({
        success: true,
        data,
        message:
          data.decision === 'APPROVED'
            ? 'Service call cancellation approved.'
            : 'Cancellation request rejected.',
      });
    } catch (err) {
      next(err);
    }
  }
}

export const job360Controller = new Job360Controller();
