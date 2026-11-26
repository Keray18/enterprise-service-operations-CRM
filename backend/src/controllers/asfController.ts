import { NextFunction, Request, Response } from 'express';
import { logger } from '../logging/logger.js';
import { asfService } from '../services/asfService.js';
import { custodyService } from '../services/custodyService.js';
import { replacementService } from '../services/replacementService.js';
import { slaMonitoringService } from '../services/slaMonitoringService.js';
import {
  acceptEscalationSchema,
  acknowledgeComplaintSchema,
  asfQueueQuerySchema,
  checkInComplaintSchema,
  custodyHandoverSchema,
  dispatchComplaintSchema,
  engineerJobsQuerySchema,
  prepareQuotationSchema,
  quotationDecisionSchema,
  reassignComplaintSchema,
  regenerateOtpSchema,
  rejectAssignmentSchema,
  scheduleInstallationSchema,
  acknowledgeReceiptSchema,
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
      const locationId = req.params.locationId || (typeof req.query.locationId === 'string' ? req.query.locationId : undefined);
      const engineers = await asfService.getEligibleEngineers(locationId, req.user!);
      res.status(200).json({
        success: true,
        data: engineers,
      });
    } catch (err) {
      next(err);
    }
  }

  async acknowledge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = acknowledgeComplaintSchema.parse(req.body || {});
      const result = await asfService.acknowledgeComplaint(
        {
          requestId: req.params.id!,
          remarks: parsed.remarks,
        },
        req.user!
      );
      res.status(200).json({
        success: true,
        data: result,
        message: 'Complaint acknowledged successfully.',
      });
    } catch (err) {
      next(err);
    }
  }

  async rejectAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = rejectAssignmentSchema.parse(req.body);
      const result = await asfService.rejectAssignment(
        {
          requestId: req.params.id!,
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

  async reassign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = reassignComplaintSchema.parse(req.body);
      const result = await asfService.reassignComplaint(
        {
          requestId: req.params.id!,
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
        data: {
          requestId: result.serviceRequest.requestId,
          jobNumber: result.serviceRequest.jobNumber,
          status: result.serviceRequest.status,
          appointmentDate: result.serviceRequest.appointmentDate ? new Date(result.serviceRequest.appointmentDate).toISOString().split('T')[0] : '',
          appointmentSlot: result.serviceRequest.appointmentSlot || '',
          assignedEngineerId: result.serviceRequest.assignedEngineerId || '',
          assignedEngineerName: result.serviceRequest.assignedEngineerName,
          smsQueued: result.smsQueued,
          serviceRequest: result.serviceRequest,
          devOtpPreview: result.devOtpPreview,
        },
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
        data: {
          requestId: req.params.id!,
          smsQueued: result.smsQueued,
          message: result.message,
          devOtpPreview: result.devOtpPreview,
        },
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
      const result = await slaMonitoringService.evaluateAllSlaBreaches(req.user?.userId);
      logger.info(
        `[SLA MONITOR] Comprehensive SLA evaluation triggered by user ${req.user?.username}. 48h breaches: ${result.ack48h.newBreachesCount}, 168h breaches: ${result.closure168h.newBreachesCount}`
      );
      res.status(200).json({
        success: true,
        data: {
          evaluatedCount: result.ack48h.evaluatedCount + result.closure168h.evaluatedCount,
          newBreachesCount: result.ack48h.newBreachesCount + result.closure168h.newBreachesCount,
          breachedRequestIds: [...result.ack48h.breachedRequestIds, ...result.closure168h.breachedRequestIds],
          ack48h: result.ack48h,
          closure168h: result.closure168h,
          timestamp: result.timestamp,
        },
        message: `SLA evaluation complete: ${result.ack48h.newBreachesCount} new 48h breach(es), ${result.closure168h.newBreachesCount} new 168h breach(es) flagged.`,
      });
    } catch (err) {
      next(err);
    }
  }

  async acceptEscalation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = acceptEscalationSchema.parse(req.body);
      const result = await asfService.acceptEscalation(req.params.id!, parsed, req.user!);
      res.status(200).json({
        success: true,
        data: result.replacement,
        message: result.message,
        alreadyAccepted: result.alreadyAccepted,
      });
    } catch (err) {
      next(err);
    }
  }

  async prepareQuotation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = prepareQuotationSchema.parse(req.body);
      const result = await replacementService.prepareQuotation(req.params.id!, parsed, req.user!);
      res.status(200).json({
        success: true,
        data: result,
        message: 'Out-of-warranty replacement quotation prepared successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  async quotationDecision(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = quotationDecisionSchema.parse(req.body);
      const result = await replacementService.recordQuotationDecision(req.params.id!, parsed, req.user!);
      res.status(200).json({
        success: true,
        data: result,
        message: `Quotation ${parsed.decision} recorded successfully`,
      });
    } catch (err) {
      next(err);
    }
  }

  async createCustodyHandover(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = custodyHandoverSchema.parse(req.body);
      const result = await custodyService.createHandover(
        {
          replacementId: req.params.id!,
          ...parsed,
        },
        req.user!
      );
      res.status(201).json({
        success: true,
        data: result,
        message: 'Physical custody handover initiated (pending engineer collection acknowledgement)',
      });
    } catch (err) {
      next(err);
    }
  }

  async acknowledgeReceipt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = acknowledgeReceiptSchema.parse(req.body || {});
      const result = await replacementService.acknowledgeAsfReceipt(req.params.id!, req.user!, parsed);
      res.status(200).json({
        success: true,
        data: result,
        message: 'Replacement shipment receipt successfully acknowledged at service center',
      });
    } catch (err) {
      next(err);
    }
  }

  async scheduleInstallation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = scheduleInstallationSchema.parse(req.body);
      const result = await replacementService.scheduleInstallation(req.params.id!, parsed, req.user!);
      res.status(200).json({
        success: true,
        data: result,
        message: 'Replacement installation visit scheduled successfully (Arrival Happy Code queued)',
      });
    } catch (err) {
      next(err);
    }
  }

  async getReplacementCustody(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const timeline = await replacementService.getCustodyTimeline(req.params.id!);
      if (!req.user!.roles.includes('ADMIN')) {
        replacementService.assertAsfOwnership(req.user!, timeline.replacement, 'view this custody record');
      }
      res.status(200).json({ success: true, data: timeline });
    } catch (err) {
      next(err);
    }
  }

  async regenerateReplacementArrivalCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await replacementService.regenerateArrivalCode(req.params.id!, req.user!);
      res.status(200).json({ success: true, data: result, message: 'Arrival Happy Code resent to customer.' });
    } catch (err) {
      next(err);
    }
  }
}

export const asfController = new AsfController();
