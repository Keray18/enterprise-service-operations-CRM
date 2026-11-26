import { Router } from 'express';
import multer from 'multer';
import { replacementRequestRepository } from '../database/repositories/replacementRequestRepository.js';
import { sendSuccess } from '../middleware/errorHandler.js';
import { replacementService } from '../services/replacementService.js';
import { requireAuth, requireAnyPermission, requireCsrf } from '../middleware/authMiddleware.js';
import { engineerController } from '../controllers/engineerController.js';

export const engineerRoutes = Router();

// Technician workspace endpoints require authentication and engineer call permissions
engineerRoutes.use(requireAuth, requireCsrf);

/**
 * GET /api/v1/engineer/dashboard
 * Aggregated real-time KPI counters for the authenticated field technician
 */
engineerRoutes.get(
  '/dashboard',
  requireAnyPermission('calls:read', 'calls:checkin'),
  engineerController.getDashboard.bind(engineerController)
);

/**
 * GET /api/v1/engineer/jobs
 * Query jobs assigned directly to the authenticated technician with tab filtering
 */
engineerRoutes.get(
  '/jobs',
  requireAnyPermission('calls:read', 'calls:checkin'),
  engineerController.getMyJobs.bind(engineerController)
);

/**
 * POST /api/v1/engineer/custody/acknowledge
 * Field technician physically acknowledges receipt and collection of the spare part.
 */
engineerRoutes.post(
  '/custody/acknowledge',
  requireAnyPermission('calls:checkin', 'calls:close', 'calls:read'),
  engineerController.acknowledgeCollection.bind(engineerController)
);

/**
 * POST /api/v1/engineer/replacements/:id/verify-code
 * Cryptographic Happy Code verification for ARRIVAL and COMPLETION on replacement visits.
 */
engineerRoutes.post(
  '/replacements/:id/verify-code',
  requireAnyPermission('calls:checkin', 'calls:close'),
  engineerController.verifyReplacementHappyCode.bind(engineerController)
);

/**
 * POST /api/v1/engineer/replacements/:id/verify-arrival
 * Assigned engineer verifies arrival at customer site.
 */
engineerRoutes.post(
  '/replacements/:id/verify-arrival',
  requireAnyPermission('calls:checkin', 'calls:close'),
  engineerController.verifyInstallationArrival.bind(engineerController)
);

/**
 * POST /api/v1/engineer/replacements/:id/complete-installation
 * Assigned engineer verifies Completion Happy Code and submits installation completion evidence.
 */
engineerRoutes.post(
  '/replacements/:id/complete-installation',
  requireAnyPermission('calls:checkin', 'calls:close'),
  engineerController.completeInstallation.bind(engineerController)
);



/**
 * GET /api/v1/engineer/replacements/:id/custody
 * Custody timeline for the assigned engineer's replacement job.
 */
engineerRoutes.get(
  '/replacements/:id/custody',
  requireAnyPermission('calls:checkin', 'calls:close', 'calls:read'),
  engineerController.getReplacementCustody.bind(engineerController)
);

const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

/**
 * GET /api/v1/engineer/replacements
 * Replacement installation jobs assigned to (or in custody of) the authenticated engineer.
 */
engineerRoutes.get('/replacements', requireAnyPermission('calls:checkin', 'calls:read'), async (req, res, next) => {
  try {
    sendSuccess(res, { items: await replacementRequestRepository.listForEngineer(req.user!.userId) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/engineer/replacements/:id/photos (multipart field "file")
 * GET  /api/v1/engineer/replacements/:id/photos
 * Installation photographs stored through the existing attachment infrastructure.
 */
engineerRoutes.post(
  '/replacements/:id/photos',
  requireAnyPermission('attachments:upload', 'calls:checkin'),
  photoUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: { code: 'FILE_REQUIRED', message: 'An image file is required.' } });
        return;
      }
      sendSuccess(res, await replacementService.uploadInstallationPhoto(String(req.params['id']), req.file, req.user!), 201);
    } catch (err) {
      next(err);
    }
  }
);

engineerRoutes.get('/replacements/:id/photos', requireAnyPermission('calls:checkin', 'calls:read'), async (req, res, next) => {
  try {
    sendSuccess(res, { items: await replacementService.listInstallationPhotos(String(req.params['id'])) });
  } catch (err) {
    next(err);
  }
});
