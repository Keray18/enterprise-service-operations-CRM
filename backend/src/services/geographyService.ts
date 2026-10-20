import { auditRepository } from '../database/repositories/auditRepository.js';
import { CityRepository } from '../database/repositories/cityRepository.js';
import { LocationRepository } from '../database/repositories/locationRepository.js';
import { PincodeRepository } from '../database/repositories/pincodeRepository.js';
import { StateRepository } from '../database/repositories/stateRepository.js';
import { logger } from '../logging/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  CityWithRelationsRecord,
  LocationRecord,
  PaginatedResult,
  PincodeLookupResult,
  PincodeWithRelationsRecord,
  StateRecord,
} from '../types/catalog.js';

export interface ActingUser {
  userId: string;
  username: string;
  ipAddress?: string;
  userAgent?: string;
}

export class GeographyService {
  private stateRepo = new StateRepository();
  private cityRepo = new CityRepository();
  private pincodeRepo = new PincodeRepository();
  private locationRepo = new LocationRepository();

  // ============================================================================
  // State Operations
  // ============================================================================

  async listStates(options: {
    search?: string;
    zone?: string;
    isActive?: 'Y' | 'N';
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<StateRecord>> {
    return this.stateRepo.listStates(options);
  }

  async getStateById(stateId: string): Promise<StateRecord> {
    const state = await this.stateRepo.findById(stateId);
    if (!state) {
      throw new AppError(`State with ID '${stateId}' not found`, 404, 'NOT_FOUND');
    }
    return state;
  }

  async createState(
    data: {
      stateCode: string;
      stateName: string;
      zone: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'CENTRAL' | 'NORTH_EAST';
      isActive?: 'Y' | 'N';
    },
    actor: ActingUser
  ): Promise<StateRecord> {
    const existingCode = await this.stateRepo.findByCode(data.stateCode);
    if (existingCode) {
      throw new AppError(
        `State code '${data.stateCode.toUpperCase()}' already exists`,
        409,
        'DUPLICATE_CODE'
      );
    }

    const existingName = await this.stateRepo.findByName(data.stateName);
    if (existingName) {
      throw new AppError(
        `State name '${data.stateName}' already exists`,
        409,
        'DUPLICATE_NAME'
      );
    }

    const state = await this.stateRepo.createState({
      stateCode: data.stateCode,
      stateName: data.stateName,
      zone: data.zone,
      isActive: data.isActive,
      createdBy: actor.username,
    });

    await auditRepository.recordCatalogAudit({
      entityName: 'STATE',
      entityId: state.stateId,
      action: 'CREATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { stateCode: state.stateCode, stateName: state.stateName, zone: state.zone },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`State created: ${state.stateCode} (${state.stateName}) by ${actor.username}`);
    return state;
  }

  async updateState(
    stateId: string,
    data: {
      stateName?: string;
      zone?: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'CENTRAL' | 'NORTH_EAST';
      isActive?: 'Y' | 'N';
      expectedVersion?: number;
      versionNo?: number;
    },
    actor: ActingUser
  ): Promise<StateRecord> {
    const state = await this.getStateById(stateId);
    const version = data.versionNo ?? data.expectedVersion ?? state.versionNo;

    if (data.stateName && data.stateName.toLowerCase() !== state.stateName.toLowerCase()) {
      const existingName = await this.stateRepo.findByName(data.stateName);
      if (existingName && existingName.stateId !== stateId) {
        throw new AppError(
          `State name '${data.stateName}' is already in use by another state`,
          409,
          'DUPLICATE_NAME'
        );
      }
    }

    const updated = await this.stateRepo.updateState(stateId, {
      stateName: data.stateName || state.stateName,
      zone: data.zone || state.zone,
      isActive: data.isActive || state.isActive,
      updatedBy: actor.username,
      versionNo: version,
    });

    if (!updated) {
      throw new AppError(
        `State update conflict for '${state.stateCode}'. The record was modified by another transaction.`,
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    await auditRepository.recordCatalogAudit({
      entityName: 'STATE',
      entityId: stateId,
      action: 'UPDATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { previous: state, updated },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`State updated: ${updated.stateCode} by ${actor.username}`);
    return updated;
  }

  async toggleStateStatus(
    stateId: string,
    isActive: 'Y' | 'N',
    versionNo: number,
    actor: ActingUser
  ): Promise<StateRecord> {
    const state = await this.getStateById(stateId);

    if (isActive === 'N') {
      const activeCities = await this.stateRepo.countReferencingCities(stateId);
      if (activeCities > 0) {
        throw new AppError(
          `Cannot deactivate state '${state.stateName}' because it has ${activeCities} active dependent cities. Deactivate cities first.`,
          400,
          'DEPENDENT_ACTIVE_RECORDS'
        );
      }
      const activePincodes = await this.stateRepo.countReferencingPincodes(stateId);
      if (activePincodes > 0) {
        throw new AppError(
          `Cannot deactivate state '${state.stateName}' because it has ${activePincodes} active serviceable pincodes. Deactivate pincodes first.`,
          400,
          'DEPENDENT_ACTIVE_RECORDS'
        );
      }
    }

    const updated = await this.stateRepo.updateStatus(stateId, isActive, versionNo, actor.username);
    if (!updated) {
      throw new AppError(
        `State status conflict for '${state.stateCode}'. Record modified by another transaction.`,
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    await auditRepository.recordCatalogAudit({
      entityName: 'STATE',
      entityId: stateId,
      action: isActive === 'Y' ? 'ACTIVATE' : 'DEACTIVATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { previousState: state.isActive, newState: isActive },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`State status changed to ${isActive}: ${state.stateCode} by ${actor.username}`);
    return updated;
  }

  // ============================================================================
  // City Operations
  // ============================================================================

  async listCities(options: {
    search?: string;
    stateId?: string;
    isActive?: 'Y' | 'N';
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<CityWithRelationsRecord>> {
    return this.cityRepo.listCities(options);
  }

  async getCityById(cityId: string): Promise<CityWithRelationsRecord> {
    const city = await this.cityRepo.findById(cityId);
    if (!city) {
      throw new AppError(`City with ID '${cityId}' not found`, 404, 'NOT_FOUND');
    }
    return city;
  }

  async createCity(
    data: {
      cityName: string;
      stateId: string;
      isActive?: 'Y' | 'N';
    },
    actor: ActingUser
  ): Promise<CityWithRelationsRecord> {
    const state = await this.stateRepo.findById(data.stateId);
    if (!state) {
      throw new AppError(`Parent State with ID '${data.stateId}' does not exist`, 400, 'INVALID_RELATION');
    }
    if (state.isActive === 'N') {
      throw new AppError(
        `Cannot create city under inactive state '${state.stateName}'. Activate the state first.`,
        400,
        'INACTIVE_PARENT_STATE'
      );
    }

    const existingInState = await this.cityRepo.findByNameAndState(data.cityName, data.stateId);
    if (existingInState) {
      throw new AppError(
        `City '${data.cityName}' already exists in state '${state.stateName}'`,
        409,
        'DUPLICATE_CITY_IN_STATE'
      );
    }

    const city = await this.cityRepo.createCity({
      cityName: data.cityName,
      stateId: data.stateId,
      isActive: data.isActive,
      createdBy: actor.username,
    });

    await auditRepository.recordCatalogAudit({
      entityName: 'CITY',
      entityId: city.cityId,
      action: 'CREATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { cityName: city.cityName, stateId: city.stateId, stateName: city.stateName },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`City created: ${city.cityName} (${city.stateName}) by ${actor.username}`);
    return city;
  }

  async updateCity(
    cityId: string,
    data: {
      cityName?: string;
      stateId?: string;
      isActive?: 'Y' | 'N';
      expectedVersion?: number;
      versionNo?: number;
    },
    actor: ActingUser
  ): Promise<CityWithRelationsRecord> {
    const city = await this.getCityById(cityId);
    const targetStateId = data.stateId || city.stateId;
    const targetCityName = data.cityName || city.cityName;
    const version = data.versionNo ?? data.expectedVersion ?? city.versionNo;

    const state = await this.stateRepo.findById(targetStateId);
    if (!state) {
      throw new AppError(`State with ID '${targetStateId}' not found`, 400, 'INVALID_RELATION');
    }
    if (state.isActive === 'N' && (data.isActive === 'Y' || city.isActive === 'Y')) {
      throw new AppError(
        `Cannot associate city with inactive state '${state.stateName}'`,
        400,
        'INACTIVE_PARENT_STATE'
      );
    }

    if (
      targetCityName.toLowerCase() !== city.cityName.toLowerCase() ||
      targetStateId !== city.stateId
    ) {
      const duplicate = await this.cityRepo.findByNameAndState(targetCityName, targetStateId);
      if (duplicate && duplicate.cityId !== cityId) {
        throw new AppError(
          `City '${targetCityName}' already exists in state '${state.stateName}'`,
          409,
          'DUPLICATE_CITY_IN_STATE'
        );
      }
    }

    const updated = await this.cityRepo.updateCity(cityId, {
      cityName: targetCityName,
      stateId: targetStateId,
      isActive: data.isActive || city.isActive,
      updatedBy: actor.username,
      versionNo: version,
    });

    if (!updated) {
      throw new AppError(
        `City update conflict for '${city.cityName}'. Record modified by another transaction.`,
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    await auditRepository.recordCatalogAudit({
      entityName: 'CITY',
      entityId: cityId,
      action: 'UPDATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { previous: city, updated },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`City updated: ${updated.cityName} by ${actor.username}`);
    return updated;
  }

  async toggleCityStatus(
    cityId: string,
    isActive: 'Y' | 'N',
    versionNo: number,
    actor: ActingUser
  ): Promise<CityWithRelationsRecord> {
    const city = await this.getCityById(cityId);

    if (isActive === 'Y') {
      const state = await this.stateRepo.findById(city.stateId);
      if (state && state.isActive === 'N') {
        throw new AppError(
          `Cannot activate city '${city.cityName}' because parent state '${state.stateName}' is inactive.`,
          400,
          'INACTIVE_PARENT_STATE'
        );
      }
    } else {
      const activePincodes = await this.cityRepo.countReferencingPincodes(cityId);
      if (activePincodes > 0) {
        throw new AppError(
          `Cannot deactivate city '${city.cityName}' because it has ${activePincodes} active serviceable pincodes. Deactivate pincodes first.`,
          400,
          'DEPENDENT_ACTIVE_RECORDS'
        );
      }
    }

    const updated = await this.cityRepo.updateStatus(cityId, isActive, versionNo, actor.username);
    if (!updated) {
      throw new AppError(
        `City status conflict for '${city.cityName}'. Record modified by another transaction.`,
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    await auditRepository.recordCatalogAudit({
      entityName: 'CITY',
      entityId: cityId,
      action: isActive === 'Y' ? 'ACTIVATE' : 'DEACTIVATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { previousState: city.isActive, newState: isActive },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`City status changed to ${isActive}: ${city.cityName} by ${actor.username}`);
    return updated;
  }

  // ============================================================================
  // Pincode Operations
  // ============================================================================

  async listPincodes(options: {
    search?: string;
    stateId?: string;
    cityId?: string;
    isServiceable?: 'Y' | 'N';
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<PincodeWithRelationsRecord>> {
    return this.pincodeRepo.listPincodes(options);
  }

  async getPincodeById(pincodeId: string): Promise<PincodeWithRelationsRecord> {
    const pincode = await this.pincodeRepo.findById(pincodeId);
    if (!pincode) {
      throw new AppError(`Pincode with ID '${pincodeId}' not found`, 404, 'NOT_FOUND');
    }
    return pincode;
  }

  async lookupPincode(pincode: string): Promise<PincodeLookupResult> {
    const trimmed = pincode.trim();
    const result = await this.pincodeRepo.lookupPincode(trimmed);
    if (!result) {
      throw new AppError(`Pincode '${trimmed}' not found in serviceable territory database`, 404, 'NOT_FOUND');
    }
    return result;
  }

  async createPincode(
    data: {
      pincode: string;
      stateId: string;
      cityId: string;
      defaultAsfId?: string;
      isServiceable?: 'Y' | 'N';
    },
    actor: ActingUser
  ): Promise<PincodeWithRelationsRecord> {
    const existing = await this.pincodeRepo.findByPincode(data.pincode);
    if (existing) {
      throw new AppError(
        `Pincode '${data.pincode}' is already registered in the system`,
        409,
        'DUPLICATE_PINCODE'
      );
    }

    const state = await this.stateRepo.findById(data.stateId);
    if (!state) {
      throw new AppError(`State with ID '${data.stateId}' does not exist`, 400, 'INVALID_RELATION');
    }
    if (state.isActive === 'N') {
      throw new AppError(`Cannot create pincode under inactive state '${state.stateName}'`, 400, 'INACTIVE_PARENT_STATE');
    }

    const city = await this.cityRepo.findById(data.cityId);
    if (!city) {
      throw new AppError(`City with ID '${data.cityId}' does not exist`, 400, 'INVALID_RELATION');
    }
    if (city.isActive === 'N') {
      throw new AppError(`Cannot create pincode under inactive city '${city.cityName}'`, 400, 'INACTIVE_PARENT_CITY');
    }

    if (city.stateId !== data.stateId) {
      throw new AppError(
        `City '${city.cityName}' does not belong to State '${state.stateName}'`,
        400,
        'CITY_STATE_MISMATCH'
      );
    }

    if (data.defaultAsfId) {
      const loc = await this.locationRepo.findById(data.defaultAsfId);
      if (!loc) {
        throw new AppError(`Service center location '${data.defaultAsfId}' does not exist`, 400, 'INVALID_RELATION');
      }
      if (loc.isActive === 'N') {
        throw new AppError(`Assigned service center '${loc.locationName}' is inactive`, 400, 'INACTIVE_LOCATION');
      }
    }

    const pincode = await this.pincodeRepo.createPincode({
      pincode: data.pincode,
      stateId: data.stateId,
      cityId: data.cityId,
      defaultAsfId: data.defaultAsfId || undefined,
      isServiceable: data.isServiceable,
      createdBy: actor.username,
    });

    await auditRepository.recordCatalogAudit({
      entityName: 'PINCODE',
      entityId: pincode.pincodeId,
      action: 'CREATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { pincode: pincode.pincode, stateName: pincode.stateName, cityName: pincode.cityName, isServiceable: pincode.isServiceable },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`Pincode created: ${pincode.pincode} (${pincode.cityName}, ${pincode.stateName}) by ${actor.username}`);
    return pincode;
  }

  async updatePincode(
    pincodeId: string,
    data: {
      stateId?: string;
      cityId?: string;
      defaultAsfId?: string;
      isServiceable?: 'Y' | 'N';
      expectedVersion?: number;
      versionNo?: number;
    },
    actor: ActingUser
  ): Promise<PincodeWithRelationsRecord> {
    const pincode = await this.getPincodeById(pincodeId);
    const targetStateId = data.stateId || pincode.stateId;
    const targetCityId = data.cityId || pincode.cityId;
    const version = data.versionNo ?? data.expectedVersion ?? pincode.versionNo;

    const state = await this.stateRepo.findById(targetStateId);
    if (!state) {
      throw new AppError(`State with ID '${targetStateId}' not found`, 400, 'INVALID_RELATION');
    }
    const city = await this.cityRepo.findById(targetCityId);
    if (!city) {
      throw new AppError(`City with ID '${targetCityId}' not found`, 400, 'INVALID_RELATION');
    }

    if (city.stateId !== targetStateId) {
      throw new AppError(`City '${city.cityName}' does not belong to State '${state.stateName}'`, 400, 'CITY_STATE_MISMATCH');
    }

    const targetAsfId = data.defaultAsfId !== undefined ? data.defaultAsfId || undefined : pincode.defaultAsfId;
    if (targetAsfId) {
      const loc = await this.locationRepo.findById(targetAsfId);
      if (!loc) {
        throw new AppError(`Service center location '${targetAsfId}' does not exist`, 400, 'INVALID_RELATION');
      }
    }

    const updated = await this.pincodeRepo.updatePincode(pincodeId, {
      stateId: targetStateId,
      cityId: targetCityId,
      defaultAsfId: targetAsfId,
      isServiceable: data.isServiceable || pincode.isServiceable,
      updatedBy: actor.username,
      versionNo: version,
    });

    if (!updated) {
      throw new AppError(
        `Pincode update conflict for '${pincode.pincode}'. Record modified by another transaction.`,
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    await auditRepository.recordCatalogAudit({
      entityName: 'PINCODE',
      entityId: pincodeId,
      action: 'UPDATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { previous: pincode, updated },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`Pincode updated: ${updated.pincode} by ${actor.username}`);
    return updated;
  }

  async togglePincodeStatus(
    pincodeId: string,
    isServiceable: 'Y' | 'N',
    versionNo: number,
    actor: ActingUser
  ): Promise<PincodeWithRelationsRecord> {
    const pincode = await this.getPincodeById(pincodeId);

    if (isServiceable === 'Y') {
      const state = await this.stateRepo.findById(pincode.stateId);
      if (state && state.isActive === 'N') {
        throw new AppError(
          `Cannot mark pincode '${pincode.pincode}' as serviceable because state '${state.stateName}' is inactive.`,
          400,
          'INACTIVE_PARENT_STATE'
        );
      }
      const city = await this.cityRepo.findById(pincode.cityId);
      if (city && city.isActive === 'N') {
        throw new AppError(
          `Cannot mark pincode '${pincode.pincode}' as serviceable because city '${city.cityName}' is inactive.`,
          400,
          'INACTIVE_PARENT_CITY'
        );
      }
    }

    const updated = await this.pincodeRepo.updateStatus(pincodeId, isServiceable, versionNo, actor.username);
    if (!updated) {
      throw new AppError(
        `Pincode serviceability conflict for '${pincode.pincode}'. Record modified by another transaction.`,
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    await auditRepository.recordCatalogAudit({
      entityName: 'PINCODE',
      entityId: pincodeId,
      action: isServiceable === 'Y' ? 'ACTIVATE' : 'DEACTIVATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { previousState: pincode.isServiceable, newState: isServiceable },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`Pincode serviceability changed to ${isServiceable}: ${pincode.pincode} by ${actor.username}`);
    return updated;
  }

  // Locations lookup for default ASF mapping
  async listLocations(options: { search?: string; partyType?: string; isActive?: 'Y' | 'N'; page: number; limit: number }): Promise<PaginatedResult<LocationRecord>> {
    return this.locationRepo.listLocations(options);
  }
}

export const geographyService = new GeographyService();
