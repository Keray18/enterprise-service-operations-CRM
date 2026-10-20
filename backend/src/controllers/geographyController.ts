import { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../middleware/errorHandler.js';
import { ActingUser, geographyService } from '../services/geographyService.js';
import {
  catalogQuerySchema,
  createCitySchema,
  createPincodeSchema,
  createStateSchema,
  toggleStatusSchema,
  updateCitySchema,
  updatePincodeSchema,
  updateStateSchema,
} from '../validation/catalogSchemas.js';

function getActor(req: Request): ActingUser {
  return {
    userId: req.user?.userId || 'UNKNOWN_USER',
    username: req.user?.username || 'UNKNOWN',
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  };
}

export class GeographyController {
  // ============================================================================
  // State Endpoints
  // ============================================================================

  async listStates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = catalogQuerySchema.parse(req.query);
      const result = await geographyService.listStates({
        search: query.search,
        zone: query.zone,
        isActive: query.isActive,
        page: query.page,
        limit: query.limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getStateById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const state = await geographyService.getStateById(id);
      sendSuccess(res, state);
    } catch (err) {
      next(err);
    }
  }

  async createState(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createStateSchema.parse(req.body);
      const state = await geographyService.createState(validated, getActor(req));
      sendSuccess(res, state, 201);
    } catch (err) {
      next(err);
    }
  }

  async updateState(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = updateStateSchema.parse(req.body);
      const state = await geographyService.updateState(id, validated, getActor(req));
      sendSuccess(res, state);
    } catch (err) {
      next(err);
    }
  }

  async toggleStateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = toggleStatusSchema.parse(req.body);
      const versionNo = validated.versionNo ?? validated.expectedVersion ?? 1;
      const isActive = validated.isActive ?? 'Y';
      const state = await geographyService.toggleStateStatus(
        id,
        isActive,
        versionNo,
        getActor(req)
      );
      sendSuccess(res, state);
    } catch (err) {
      next(err);
    }
  }

  // ============================================================================
  // City Endpoints
  // ============================================================================

  async listCities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = catalogQuerySchema.parse(req.query);
      const result = await geographyService.listCities({
        search: query.search,
        stateId: query.stateId,
        isActive: query.isActive,
        page: query.page,
        limit: query.limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getCityById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const city = await geographyService.getCityById(id);
      sendSuccess(res, city);
    } catch (err) {
      next(err);
    }
  }

  async createCity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createCitySchema.parse(req.body);
      const city = await geographyService.createCity(validated, getActor(req));
      sendSuccess(res, city, 201);
    } catch (err) {
      next(err);
    }
  }

  async updateCity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = updateCitySchema.parse(req.body);
      const city = await geographyService.updateCity(id, validated, getActor(req));
      sendSuccess(res, city);
    } catch (err) {
      next(err);
    }
  }

  async toggleCityStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = toggleStatusSchema.parse(req.body);
      const versionNo = validated.versionNo ?? validated.expectedVersion ?? 1;
      const isActive = validated.isActive ?? 'Y';
      const city = await geographyService.toggleCityStatus(
        id,
        isActive,
        versionNo,
        getActor(req)
      );
      sendSuccess(res, city);
    } catch (err) {
      next(err);
    }
  }

  // ============================================================================
  // Pincode Endpoints
  // ============================================================================

  async listPincodes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = catalogQuerySchema.parse(req.query);
      const result = await geographyService.listPincodes({
        search: query.search,
        stateId: query.stateId,
        cityId: query.cityId,
        isServiceable: query.isServiceable,
        page: query.page,
        limit: query.limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async lookupPincode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pincode = req.params.pincode as string;
      const result = await geographyService.lookupPincode(pincode);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getPincodeById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const pincode = await geographyService.getPincodeById(id);
      sendSuccess(res, pincode);
    } catch (err) {
      next(err);
    }
  }

  async createPincode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createPincodeSchema.parse(req.body);
      const pincode = await geographyService.createPincode(validated, getActor(req));
      sendSuccess(res, pincode, 201);
    } catch (err) {
      next(err);
    }
  }

  async updatePincode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = updatePincodeSchema.parse(req.body);
      const pincode = await geographyService.updatePincode(id, validated, getActor(req));
      sendSuccess(res, pincode);
    } catch (err) {
      next(err);
    }
  }

  async togglePincodeStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = toggleStatusSchema.parse(req.body);
      const versionNo = validated.versionNo ?? validated.expectedVersion ?? 1;
      const isServiceable = validated.isServiceable ?? validated.isActive ?? 'Y';
      const pincode = await geographyService.togglePincodeStatus(
        id,
        isServiceable,
        versionNo,
        getActor(req)
      );
      sendSuccess(res, pincode);
    } catch (err) {
      next(err);
    }
  }

  // ============================================================================
  // Location Reference Endpoints
  // ============================================================================

  async listLocations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const search = req.query.search as string | undefined;
      const partyType = req.query.partyType as string | undefined;
      const isActive = req.query.isActive as 'Y' | 'N' | undefined;

      const result = await geographyService.listLocations({ search, partyType, isActive, page, limit });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
}

export const geographyController = new GeographyController();
