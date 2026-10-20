import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { bulkImportController } from '../controllers/bulkImportController.js';
import { requireAuth, requireCsrf, requirePermission } from '../middleware/authMiddleware.js';
import { AppError } from '../middleware/errorHandler.js';

export const bulkImportRouter = Router();

// Ensure restricted temporary upload directory exists
const uploadDir = path.resolve(process.cwd(), 'scratch/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer disk storage in restricted temporary directory
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx') {
      return cb(new AppError('Only .xlsx files are permitted for bulk import.', 400, 'UNSUPPORTED_FILE_TYPE'));
    }
    cb(null, true);
  },
});

// 1. Template Download
bulkImportRouter.get(
  '/templates/:entityType',
  requireAuth,
  requirePermission('masters:read'),
  bulkImportController.downloadTemplate.bind(bulkImportController)
);

// 2. Upload and Preview
bulkImportRouter.post(
  '/preview',
  requireAuth,
  requireCsrf,
  requirePermission('masters:import'),
  upload.single('file'),
  bulkImportController.previewImport.bind(bulkImportController)
);

// 3. Explicit Commit
bulkImportRouter.post(
  '/commit',
  requireAuth,
  requireCsrf,
  requirePermission('masters:import'),
  requirePermission('masters:manage'),
  bulkImportController.commitImport.bind(bulkImportController)
);

// 4. Download Result / Error Report
bulkImportRouter.get(
  '/report/:jobId',
  requireAuth,
  requirePermission('masters:import'),
  bulkImportController.downloadReport.bind(bulkImportController)
);

// 5. List Import Job History
bulkImportRouter.get(
  '/history',
  requireAuth,
  requirePermission('masters:import'),
  bulkImportController.listHistory.bind(bulkImportController)
);
