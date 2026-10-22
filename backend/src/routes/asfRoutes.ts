import { Router } from 'express';
import multer from 'multer';
import { asfController } from '../controllers/asfController.js';
import { job360Controller } from '../controllers/job360Controller.js';
import { requireAnyPermission, requireAuth, requireCsrf, requirePermission } from '../middleware/authMiddleware.js';

export const asfRoutes = Router();

// Configure memory storage for evidence attachments (max 5 MB)
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

// All ASF routes require authenticated session
asfRoutes.use(requireAuth);

/**
 * GET /api/v1/asf/queue
 * Retrieves the operational incoming work queue with SLA status, location scoping, and filters.
 */
asfRoutes.get(
  '/queue',
  requireAnyPermission('asf:read', 'calls:read'),
  asfController.getQueue.bind(asfController)
);

/**
 * GET /api/v1/asf/engineers
 * GET /api/v1/asf/engineers/:locationId
 * Retrieves active field technicians eligible for dispatch in an ASF location.
 */
asfRoutes.get(
  '/engineers',
  requireAnyPermission('asf:read', 'calls:assign', 'asf:manage'),
  asfController.getEligibleEngineers.bind(asfController)
);

asfRoutes.get(
  '/engineers/:locationId',
  requireAnyPermission('asf:read', 'calls:assign', 'asf:manage'),
  asfController.getEligibleEngineers.bind(asfController)
);

/**
 * POST /api/v1/asf/requests/:id/dispatch
 * Single-commit dispatch workflow: sets appointment, assigns technician, generates Check-In OTP,
 * logs lifecycle event, and queues SMS 2.
 */
asfRoutes.post(
  '/requests/:id/dispatch',
  requireCsrf,
  requireAnyPermission('calls:assign', 'asf:manage'),
  asfController.dispatch.bind(asfController)
);

/**
 * POST /api/v1/asf/requests/:id/regenerate-otp
 * Regenerates the 6-digit customer Check-In OTP, superseding previous OTP and queuing SMS 6.
 */
asfRoutes.post(
  '/requests/:id/regenerate-otp',
  requireCsrf,
  requireAnyPermission('calls:assign', 'calls:update', 'asf:manage'),
  asfController.regenerateOtp.bind(asfController)
);

/**
 * POST /api/v1/asf/requests/:id/check-in
 * Authenticated on-site technician check-in using customer-provided 6-digit OTP.
 */
asfRoutes.post(
  '/requests/:id/check-in',
  requireCsrf,
  requirePermission('calls:checkin'),
  asfController.checkIn.bind(asfController)
);

/**
 * GET /api/v1/asf/engineer-jobs
 * Retrieves jobs and scheduled appointments assigned to the logged-in field technician.
 */
asfRoutes.get(
  '/engineer-jobs',
  requireAnyPermission('calls:read', 'calls:checkin'),
  asfController.getEngineerJobs.bind(asfController)
);

/**
 * POST /api/v1/asf/sla/evaluate
 * Triggers 48-hour acknowledgement SLA monitoring evaluation.
 */
asfRoutes.post(
  '/sla/evaluate',
  requireCsrf,
  requirePermission('sla:manage'),
  asfController.evaluateSla.bind(asfController)
);

/* ==========================================================================
   PHASE 2B: UNIFIED JOB 360, DIAGNOSTICS & REPAIR OPERATIONS
   ========================================================================== */

/**
 * GET /api/v1/asf/masters/engineering
 * Retrieves active fault, defect, and repair code taxonomies filtered by optional brand/product.
 */
asfRoutes.get(
  '/masters/engineering',
  requireAnyPermission('calls:read', 'calls:diagnose', 'asf:read'),
  job360Controller.getEngineeringMasters.bind(job360Controller)
);

/**
 * GET /api/v1/asf/jobs/:id
 * Retrieves the complete Unified Job 360 operational workspace details.
 */
asfRoutes.get(
  '/jobs/:id',
  requireAnyPermission('calls:read', 'asf:read'),
  job360Controller.getJob360Details.bind(job360Controller)
);

/**
 * POST /api/v1/asf/jobs/:id/diagnosis
 * Records Voice of Engineer, fault taxonomy, defect classification, and observations.
 */
asfRoutes.post(
  '/jobs/:id/diagnosis',
  requireCsrf,
  requirePermission('calls:diagnose'),
  job360Controller.recordDiagnosis.bind(job360Controller)
);

/**
 * POST /api/v1/asf/jobs/:id/repair
 * Records repair outcome, action, and resulting workflow state transitions.
 */
asfRoutes.post(
  '/jobs/:id/repair',
  requireCsrf,
  requirePermission('calls:repair'),
  job360Controller.recordRepair.bind(job360Controller)
);

/**
 * POST /api/v1/asf/jobs/:id/parts
 * Records spare parts or consumables used or required on the job.
 */
asfRoutes.post(
  '/jobs/:id/parts',
  requireCsrf,
  requirePermission('parts:manage'),
  job360Controller.addPart.bind(job360Controller)
);

/**
 * DELETE /api/v1/asf/jobs/:id/parts/:partEntryId
 * Deletes a part entry from the job and recalculates chargeable totals.
 */
asfRoutes.delete(
  '/jobs/:id/parts/:partEntryId',
  requireCsrf,
  requirePermission('parts:manage'),
  job360Controller.removePart.bind(job360Controller)
);

/**
 * POST /api/v1/asf/jobs/:id/special-part-estimate
 * Records warehouse quotation for special part estimate request.
 */
asfRoutes.post(
  '/jobs/:id/special-part-estimate',
  requireCsrf,
  requireAnyPermission('parts:manage', 'asf:manage'),
  job360Controller.provideSpecialPartEstimate.bind(job360Controller)
);

/**
 * POST /api/v1/asf/jobs/:id/customer-estimate-decision
 * Records customer approval or rejection of special-part quotation.
 */
asfRoutes.post(
  '/jobs/:id/customer-estimate-decision',
  requireCsrf,
  requireAnyPermission('calls:repair', 'calls:update', 'asf:manage'),
  job360Controller.customerEstimateDecision.bind(job360Controller)
);

/**
 * POST /api/v1/asf/jobs/:id/attachments
 * Securely uploads evidence attachments (plate, defective part, repaired unit, jobsheet).
 */
asfRoutes.post(
  '/jobs/:id/attachments',
  requireCsrf,
  requirePermission('attachments:upload'),
  memoryUpload.single('file'),
  job360Controller.uploadAttachment.bind(job360Controller)
);

/**
 * GET /api/v1/asf/attachments/:attachmentId/stream
 * Authorized file streaming for secure evidence viewing and downloading.
 */
asfRoutes.get(
  '/attachments/:attachmentId/stream',
  requireAnyPermission('calls:read', 'asf:read'),
  job360Controller.getAttachmentStream.bind(job360Controller)
);

/**
 * DELETE /api/v1/asf/attachments/:attachmentId
 * Deletes an evidence attachment and cleans up disk storage.
 */
asfRoutes.delete(
  '/attachments/:attachmentId',
  requireCsrf,
  requirePermission('attachments:upload'),
  job360Controller.deleteAttachment.bind(job360Controller)
);

/* ==========================================================================
   PHASE 2C: HAPPY CODE CLOSURE, FEEDBACK, REPLACEMENT & CANCELLATION
   ========================================================================== */

/**
 * POST /api/v1/asf/jobs/:id/closure/initiate
 * Marks repair complete, generates 6-digit Happy Code, and sends SMS 4.
 */
asfRoutes.post(
  '/jobs/:id/closure/initiate',
  requireCsrf,
  requirePermission('calls:close'),
  job360Controller.initiateClosure.bind(job360Controller)
);

/**
 * POST /api/v1/asf/jobs/:id/closure/regenerate-happy-code
 * Regenerates customer Happy Code and sends SMS 5.
 */
asfRoutes.post(
  '/jobs/:id/closure/regenerate-happy-code',
  requireCsrf,
  requirePermission('calls:close'),
  job360Controller.regenerateHappyCode.bind(job360Controller)
);

/**
 * POST /api/v1/asf/jobs/:id/closure/verify
 * Verifies customer Happy Code or applies supervisor override and marks call CLOSED.
 */
asfRoutes.post(
  '/jobs/:id/closure/verify',
  requireCsrf,
  requirePermission('calls:close'),
  job360Controller.verifyHappyCode.bind(job360Controller)
);

/**
 * POST /api/v1/asf/jobs/:id/feedback
 * Records CSAT star rating and quality analysis feedback.
 */
asfRoutes.post(
  '/jobs/:id/feedback',
  requireCsrf,
  requirePermission('feedback:submit'),
  job360Controller.submitFeedback.bind(job360Controller)
);

/**
 * POST /api/v1/asf/jobs/:id/replacement
 * Submits formal request for product replacement based on the 6 reasons.
 */
asfRoutes.post(
  '/jobs/:id/replacement',
  requireCsrf,
  requirePermission('replacement:request'),
  job360Controller.requestReplacement.bind(job360Controller)
);

/**
 * POST /api/v1/asf/replacements/:replacementId/review
 * Head Office review and approval (issues Approval No & SMS 8) or rejection.
 */
asfRoutes.post(
  '/replacements/:replacementId/review',
  requireCsrf,
  requirePermission('replacement:approve'),
  job360Controller.reviewReplacement.bind(job360Controller)
);

/**
 * POST /api/v1/asf/jobs/:id/cancellation
 * Submits formal request for service call cancellation based on the 3 reasons.
 */
asfRoutes.post(
  '/jobs/:id/cancellation',
  requireCsrf,
  requirePermission('cancellation:request'),
  job360Controller.requestCancellation.bind(job360Controller)
);

/**
 * POST /api/v1/asf/cancellations/:cancellationId/review
 * Supervisor review and approval (marks CANCELLED & queues SMS 7) or rejection.
 */
asfRoutes.post(
  '/cancellations/:cancellationId/review',
  requireCsrf,
  requirePermission('cancellation:approve'),
  job360Controller.reviewCancellation.bind(job360Controller)
);

