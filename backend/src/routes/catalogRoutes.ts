import { Router } from 'express';
import { catalogController } from '../controllers/catalogController.js';
import { requireAuth, requireCsrf, requirePermission } from '../middleware/authMiddleware.js';
import { bulkImportRouter } from './bulkImportRoutes.js';

export const catalogRouter = Router();

// ============================================================================
// Bulk Import Sub-Router (Models & Part Codes)
// ============================================================================
catalogRouter.use('/import', bulkImportRouter);

// ============================================================================
// Brand Routes
// ============================================================================

catalogRouter.get(
  '/brands',
  requireAuth,
  requirePermission('masters:read'),
  catalogController.listBrands.bind(catalogController)
);

catalogRouter.get(
  '/brands/:id',
  requireAuth,
  requirePermission('masters:read'),
  catalogController.getBrandById.bind(catalogController)
);

catalogRouter.post(
  '/brands',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  catalogController.createBrand.bind(catalogController)
);

catalogRouter.put(
  '/brands/:id',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  catalogController.updateBrand.bind(catalogController)
);

catalogRouter.patch(
  '/brands/:id/status',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  catalogController.toggleBrandStatus.bind(catalogController)
);

// ============================================================================
// Product Routes
// ============================================================================

catalogRouter.get(
  '/products',
  requireAuth,
  requirePermission('masters:read'),
  catalogController.listProducts.bind(catalogController)
);

catalogRouter.get(
  '/products/categories',
  requireAuth,
  requirePermission('masters:read'),
  catalogController.listProductCategories.bind(catalogController)
);

catalogRouter.get(
  '/products/:id',
  requireAuth,
  requirePermission('masters:read'),
  catalogController.getProductById.bind(catalogController)
);

catalogRouter.post(
  '/products',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  catalogController.createProduct.bind(catalogController)
);

catalogRouter.put(
  '/products/:id',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  catalogController.updateProduct.bind(catalogController)
);

catalogRouter.patch(
  '/products/:id/status',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  catalogController.toggleProductStatus.bind(catalogController)
);

// ============================================================================
// Model Routes
// ============================================================================

catalogRouter.get(
  '/models',
  requireAuth,
  requirePermission('masters:read'),
  catalogController.listModels.bind(catalogController)
);

catalogRouter.get(
  '/models/:id',
  requireAuth,
  requirePermission('masters:read'),
  catalogController.getModelById.bind(catalogController)
);

catalogRouter.post(
  '/models',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  catalogController.createModel.bind(catalogController)
);

catalogRouter.put(
  '/models/:id',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  catalogController.updateModel.bind(catalogController)
);

catalogRouter.patch(
  '/models/:id/status',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  catalogController.toggleModelStatus.bind(catalogController)
);

// ============================================================================
// HSN & Tax Routes
// ============================================================================

catalogRouter.get(
  '/hsn',
  requireAuth,
  requirePermission('masters:read'),
  catalogController.listHsn.bind(catalogController)
);

catalogRouter.get(
  '/hsn/:id',
  requireAuth,
  requirePermission('masters:read'),
  catalogController.getHsnById.bind(catalogController)
);

catalogRouter.post(
  '/hsn',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  catalogController.createHsn.bind(catalogController)
);

catalogRouter.put(
  '/hsn/:id',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  catalogController.updateHsn.bind(catalogController)
);

catalogRouter.patch(
  '/hsn/:id/status',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  catalogController.toggleHsnStatus.bind(catalogController)
);

// ============================================================================
// Part Code Routes
// ============================================================================

catalogRouter.get(
  '/parts',
  requireAuth,
  requirePermission('masters:read'),
  catalogController.listParts.bind(catalogController)
);

catalogRouter.get(
  '/parts/:id',
  requireAuth,
  requirePermission('masters:read'),
  catalogController.getPartById.bind(catalogController)
);

catalogRouter.post(
  '/parts',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  catalogController.createPart.bind(catalogController)
);

catalogRouter.put(
  '/parts/:id',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  catalogController.updatePart.bind(catalogController)
);

catalogRouter.patch(
  '/parts/:id/status',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  catalogController.togglePartStatus.bind(catalogController)
);

// ============================================================================
// Audit Trail Routes
// ============================================================================

catalogRouter.get(
  '/audit-logs',
  requireAuth,
  requirePermission('masters:read'),
  catalogController.listAuditLogs.bind(catalogController)
);

