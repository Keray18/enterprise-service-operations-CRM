import { Router } from 'express';
import { geographyController } from '../controllers/geographyController.js';
import { requireAuth, requireCsrf, requirePermission } from '../middleware/authMiddleware.js';

export const geographyRouter = Router();

// ============================================================================
// State Routes
// ============================================================================

geographyRouter.get(
  '/states',
  requireAuth,
  requirePermission('masters:read'),
  geographyController.listStates.bind(geographyController)
);

geographyRouter.get(
  '/states/:id',
  requireAuth,
  requirePermission('masters:read'),
  geographyController.getStateById.bind(geographyController)
);

geographyRouter.post(
  '/states',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  geographyController.createState.bind(geographyController)
);

geographyRouter.put(
  '/states/:id',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  geographyController.updateState.bind(geographyController)
);

geographyRouter.patch(
  '/states/:id/status',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  geographyController.toggleStateStatus.bind(geographyController)
);

// ============================================================================
// City Routes
// ============================================================================

geographyRouter.get(
  '/cities',
  requireAuth,
  requirePermission('masters:read'),
  geographyController.listCities.bind(geographyController)
);

geographyRouter.get(
  '/cities/:id',
  requireAuth,
  requirePermission('masters:read'),
  geographyController.getCityById.bind(geographyController)
);

geographyRouter.post(
  '/cities',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  geographyController.createCity.bind(geographyController)
);

geographyRouter.put(
  '/cities/:id',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  geographyController.updateCity.bind(geographyController)
);

geographyRouter.patch(
  '/cities/:id/status',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  geographyController.toggleCityStatus.bind(geographyController)
);

// ============================================================================
// Pincode & Serviceability Routes
// ============================================================================

geographyRouter.get(
  '/pincodes',
  requireAuth,
  requirePermission('masters:read'),
  geographyController.listPincodes.bind(geographyController)
);

geographyRouter.get(
  '/pincodes/lookup/:pincode',
  requireAuth,
  requirePermission('masters:read'),
  geographyController.lookupPincode.bind(geographyController)
);

geographyRouter.get(
  '/pincodes/:id',
  requireAuth,
  requirePermission('masters:read'),
  geographyController.getPincodeById.bind(geographyController)
);

geographyRouter.post(
  '/pincodes',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  geographyController.createPincode.bind(geographyController)
);

geographyRouter.put(
  '/pincodes/:id',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  geographyController.updatePincode.bind(geographyController)
);

geographyRouter.patch(
  '/pincodes/:id/status',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  geographyController.togglePincodeStatus.bind(geographyController)
);

geographyRouter.patch(
  '/pincodes/:id/serviceability',
  requireAuth,
  requireCsrf,
  requirePermission('masters:manage'),
  geographyController.togglePincodeStatus.bind(geographyController)
);

// ============================================================================
// Location Reference Routes (for default ASF dropdown)
// ============================================================================

geographyRouter.get(
  '/locations',
  requireAuth,
  requirePermission('masters:read'),
  geographyController.listLocations.bind(geographyController)
);
