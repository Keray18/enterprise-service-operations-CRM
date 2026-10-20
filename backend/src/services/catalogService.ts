import crypto from 'crypto';
import { auditRepository } from '../database/repositories/auditRepository.js';
import { brandRepository } from '../database/repositories/brandRepository.js';
import { hsnRepository } from '../database/repositories/hsnRepository.js';
import { modelRepository } from '../database/repositories/modelRepository.js';
import { partRepository } from '../database/repositories/partRepository.js';
import { productRepository } from '../database/repositories/productRepository.js';
import { logger } from '../logging/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  BrandRecord,
  CatalogAuditRecord,
  HsnRecord,
  ModelWithRelationsRecord,
  PaginatedResult,
  PartWithRelationsRecord,
  ProductRecord,
} from '../types/catalog.js';

export interface ActingUser {
  userId: string;
  username: string;
  ipAddress?: string;
  userAgent?: string;
}

export class CatalogService {
  // ============================================================================
  // Brand Operations
  // ============================================================================

  async listBrands(options: {
    search?: string;
    isActive?: 'Y' | 'N';
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<BrandRecord>> {
    return brandRepository.listBrands(options);
  }

  async getBrandById(brandId: string): Promise<BrandRecord> {
    const brand = await brandRepository.findById(brandId);
    if (!brand) {
      throw new AppError(`Brand with ID '${brandId}' not found`, 404, 'NOT_FOUND');
    }
    return brand;
  }

  async createBrand(
    data: {
      brandCode: string;
      brandName: string;
      logoUrl?: string;
      isActive?: 'Y' | 'N';
    },
    actor: ActingUser
  ): Promise<BrandRecord> {
    const existing = await brandRepository.findByCode(data.brandCode);
    if (existing) {
      throw new AppError(
        `Brand code '${data.brandCode.toUpperCase()}' already exists`,
        409,
        'DUPLICATE_CODE'
      );
    }

    const brandId = crypto.randomUUID();
    const brand = await brandRepository.createBrand({
      brandId,
      brandCode: data.brandCode,
      brandName: data.brandName,
      logoUrl: data.logoUrl,
      isActive: data.isActive,
      createdBy: actor.username,
    });

    await auditRepository.recordCatalogAudit({
      entityName: 'BRAND',
      entityId: brand.brandId,
      action: 'CREATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { brandCode: brand.brandCode, brandName: brand.brandName, isActive: brand.isActive },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`Brand created: ${brand.brandCode} by ${actor.username}`);
    return brand;
  }

  async updateBrand(
    brandId: string,
    data: {
      brandCode?: string;
      brandName?: string;
      logoUrl?: string;
      isActive?: 'Y' | 'N';
      expectedVersion?: number;
    },
    actor: ActingUser
  ): Promise<BrandRecord> {
    const existing = await this.getBrandById(brandId);

    if (data.brandCode && data.brandCode.toUpperCase() !== existing.brandCode) {
      const duplicate = await brandRepository.findByCode(data.brandCode);
      if (duplicate && duplicate.brandId !== brandId) {
        throw new AppError(
          `Brand code '${data.brandCode.toUpperCase()}' is already in use by another brand`,
          409,
          'DUPLICATE_CODE'
        );
      }
    }

    const result = await brandRepository.updateBrand(
      brandId,
      {
        brandCode: data.brandCode,
        brandName: data.brandName,
        logoUrl: data.logoUrl,
        isActive: data.isActive,
        updatedBy: actor.username,
      },
      data.expectedVersion
    );

    if (!result.updated || !result.brand) {
      throw new AppError(
        'Concurrent update conflict: Brand has been modified by another transaction. Please reload and try again.',
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    await auditRepository.recordCatalogAudit({
      entityName: 'BRAND',
      entityId: brandId,
      action: 'UPDATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: data,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`Brand updated: ${result.brand.brandCode} by ${actor.username}`);
    return result.brand;
  }

  async toggleBrandStatus(
    brandId: string,
    isActive: 'Y' | 'N',
    actor: ActingUser,
    expectedVersion?: number
  ): Promise<BrandRecord> {
    const brand = await this.getBrandById(brandId);

    const result = await brandRepository.setBrandActive(
      brandId,
      isActive,
      actor.username,
      expectedVersion
    );

    if (!result.updated || !result.brand) {
      throw new AppError(
        'Concurrent update conflict: Brand state was modified by another transaction.',
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    await auditRepository.recordCatalogAudit({
      entityName: 'BRAND',
      entityId: brandId,
      action: isActive === 'Y' ? 'ACTIVATE' : 'DEACTIVATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { previousState: brand.isActive, newState: isActive },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`Brand status changed to ${isActive}: ${brand.brandCode} by ${actor.username}`);
    return result.brand;
  }

  // ============================================================================
  // Product Operations
  // ============================================================================

  async listProducts(options: {
    search?: string;
    categoryFamily?: string;
    isActive?: 'Y' | 'N';
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<ProductRecord>> {
    return productRepository.listProducts(options);
  }

  async getProductById(productId: string): Promise<ProductRecord> {
    const product = await productRepository.findById(productId);
    if (!product) {
      throw new AppError(`Product with ID '${productId}' not found`, 404, 'NOT_FOUND');
    }
    return product;
  }

  async createProduct(
    data: {
      productCode: string;
      productName: string;
      categoryFamily: string;
      isActive?: 'Y' | 'N';
    },
    actor: ActingUser
  ): Promise<ProductRecord> {
    const existing = await productRepository.findByCode(data.productCode);
    if (existing) {
      throw new AppError(
        `Product code '${data.productCode.toUpperCase()}' already exists`,
        409,
        'DUPLICATE_CODE'
      );
    }

    const productId = crypto.randomUUID();
    const product = await productRepository.createProduct({
      productId,
      productCode: data.productCode,
      productName: data.productName,
      categoryFamily: data.categoryFamily,
      isActive: data.isActive,
      createdBy: actor.username,
    });

    await auditRepository.recordCatalogAudit({
      entityName: 'PRODUCT',
      entityId: product.productId,
      action: 'CREATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { productCode: product.productCode, productName: product.productName, categoryFamily: product.categoryFamily },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`Product created: ${product.productCode} by ${actor.username}`);
    return product;
  }

  async updateProduct(
    productId: string,
    data: {
      productCode?: string;
      productName?: string;
      categoryFamily?: string;
      isActive?: 'Y' | 'N';
      expectedVersion?: number;
    },
    actor: ActingUser
  ): Promise<ProductRecord> {
    const existing = await this.getProductById(productId);

    if (data.productCode && data.productCode.toUpperCase() !== existing.productCode) {
      const duplicate = await productRepository.findByCode(data.productCode);
      if (duplicate && duplicate.productId !== productId) {
        throw new AppError(
          `Product code '${data.productCode.toUpperCase()}' is already in use by another product`,
          409,
          'DUPLICATE_CODE'
        );
      }
    }

    const result = await productRepository.updateProduct(
      productId,
      {
        productCode: data.productCode,
        productName: data.productName,
        categoryFamily: data.categoryFamily,
        isActive: data.isActive,
        updatedBy: actor.username,
      },
      data.expectedVersion
    );

    if (!result.updated || !result.product) {
      throw new AppError(
        'Concurrent update conflict: Product has been modified by another transaction. Please reload.',
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    await auditRepository.recordCatalogAudit({
      entityName: 'PRODUCT',
      entityId: productId,
      action: 'UPDATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: data,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`Product updated: ${result.product.productCode} by ${actor.username}`);
    return result.product;
  }

  async toggleProductStatus(
    productId: string,
    isActive: 'Y' | 'N',
    actor: ActingUser,
    expectedVersion?: number
  ): Promise<ProductRecord> {
    const product = await this.getProductById(productId);

    const result = await productRepository.setProductActive(
      productId,
      isActive,
      actor.username,
      expectedVersion
    );

    if (!result.updated || !result.product) {
      throw new AppError(
        'Concurrent update conflict: Product state was modified by another transaction.',
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    await auditRepository.recordCatalogAudit({
      entityName: 'PRODUCT',
      entityId: productId,
      action: isActive === 'Y' ? 'ACTIVATE' : 'DEACTIVATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { previousState: product.isActive, newState: isActive },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`Product status changed to ${isActive}: ${product.productCode} by ${actor.username}`);
    return result.product;
  }

  async listProductCategories(): Promise<string[]> {
    return productRepository.listCategories();
  }

  // ============================================================================
  // Model Operations
  // ============================================================================

  async listModels(options: {
    search?: string;
    brandId?: string;
    productId?: string;
    isActive?: 'Y' | 'N';
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<ModelWithRelationsRecord>> {
    return modelRepository.listModels(options);
  }

  async getModelById(modelId: string): Promise<ModelWithRelationsRecord> {
    const model = await modelRepository.findById(modelId);
    if (!model) {
      throw new AppError(`Model with ID '${modelId}' not found`, 404, 'NOT_FOUND');
    }
    return model;
  }

  async createModel(
    data: {
      brandId: string;
      productId: string;
      modelCode: string;
      modelName: string;
      technicalName?: string;
      softwareVersion?: string;
      serialNumberLength?: number;
      checkSerialNumber?: 'Y' | 'N';
      isJobCreationAllowed?: 'Y' | 'N';
      isDoaAllowed?: 'Y' | 'N';
      isRepairable?: 'Y' | 'N';
      isReplacementAllowed?: 'Y' | 'N';
      customerWarrantyDays?: number;
      repairWarrantyDays?: number;
      replacementWindowDays?: number;
      doaDays?: number;
      amcDays?: number;
      amcAmount?: number;
      isOutOfWarrantyServiced?: 'Y' | 'N';
      standardServiceCharge?: number;
      releaseDate: string;
      isActive?: 'Y' | 'N';
    },
    actor: ActingUser
  ): Promise<ModelWithRelationsRecord> {
    // 1. Verify Brand exists and is active
    const brand = await brandRepository.findById(data.brandId);
    if (!brand) {
      throw new AppError(`Referenced Brand '${data.brandId}' does not exist`, 400, 'INVALID_RELATION');
    }
    if (brand.isActive !== 'Y') {
      throw new AppError(
        `Cannot create model under deactivated Brand '${brand.brandName}'. Activate the brand first.`,
        400,
        'INACTIVE_RELATION'
      );
    }

    // 2. Verify Product exists and is active
    const product = await productRepository.findById(data.productId);
    if (!product) {
      throw new AppError(`Referenced Product '${data.productId}' does not exist`, 400, 'INVALID_RELATION');
    }
    if (product.isActive !== 'Y') {
      throw new AppError(
        `Cannot create model under deactivated Product '${product.productName}'. Activate the product first.`,
        400,
        'INACTIVE_RELATION'
      );
    }

    // 3. Verify unique (brand_id, model_code)
    const existing = await modelRepository.findByBrandAndCode(data.brandId, data.modelCode);
    if (existing) {
      throw new AppError(
        `Model code '${data.modelCode.toUpperCase()}' already exists for Brand '${brand.brandName}'`,
        409,
        'DUPLICATE_CODE'
      );
    }

    const modelId = crypto.randomUUID();
    const releaseDateObj = new Date(data.releaseDate);

    const model = await modelRepository.createModel({
      modelId,
      brandId: data.brandId,
      productId: data.productId,
      modelCode: data.modelCode,
      modelName: data.modelName,
      technicalName: data.technicalName,
      softwareVersion: data.softwareVersion,
      serialNumberLength: data.serialNumberLength,
      checkSerialNumber: data.checkSerialNumber,
      isJobCreationAllowed: data.isJobCreationAllowed,
      isDoaAllowed: data.isDoaAllowed,
      isRepairable: data.isRepairable,
      isReplacementAllowed: data.isReplacementAllowed,
      customerWarrantyDays: data.customerWarrantyDays,
      repairWarrantyDays: data.repairWarrantyDays,
      replacementWindowDays: data.replacementWindowDays,
      doaDays: data.doaDays,
      amcDays: data.amcDays,
      amcAmount: data.amcAmount,
      isOutOfWarrantyServiced: data.isOutOfWarrantyServiced,
      standardServiceCharge: data.standardServiceCharge,
      releaseDate: releaseDateObj,
      isActive: data.isActive,
      createdBy: actor.username,
    });

    await auditRepository.recordCatalogAudit({
      entityName: 'MODEL',
      entityId: model.modelId,
      action: 'CREATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: {
        modelCode: model.modelCode,
        modelName: model.modelName,
        brandId: model.brandId,
        productId: model.productId,
      },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`Model created: ${model.modelCode} for Brand ${brand.brandCode} by ${actor.username}`);
    return model;
  }

  async updateModel(
    modelId: string,
    data: {
      brandId?: string;
      productId?: string;
      modelCode?: string;
      modelName?: string;
      technicalName?: string;
      softwareVersion?: string;
      serialNumberLength?: number;
      checkSerialNumber?: 'Y' | 'N';
      isJobCreationAllowed?: 'Y' | 'N';
      isDoaAllowed?: 'Y' | 'N';
      isRepairable?: 'Y' | 'N';
      isReplacementAllowed?: 'Y' | 'N';
      customerWarrantyDays?: number;
      repairWarrantyDays?: number;
      replacementWindowDays?: number;
      doaDays?: number;
      amcDays?: number;
      amcAmount?: number;
      isOutOfWarrantyServiced?: 'Y' | 'N';
      standardServiceCharge?: number;
      releaseDate?: string;
      isActive?: 'Y' | 'N';
      expectedVersion?: number;
    },
    actor: ActingUser
  ): Promise<ModelWithRelationsRecord> {
    const existing = await this.getModelById(modelId);

    const targetBrandId = data.brandId || existing.brandId;
    if (data.brandId && data.brandId !== existing.brandId) {
      const brand = await brandRepository.findById(data.brandId);
      if (!brand || brand.isActive !== 'Y') {
        throw new AppError('Target Brand is invalid or inactive', 400, 'INVALID_RELATION');
      }
    }

    if (data.productId && data.productId !== existing.productId) {
      const product = await productRepository.findById(data.productId);
      if (!product || product.isActive !== 'Y') {
        throw new AppError('Target Product is invalid or inactive', 400, 'INVALID_RELATION');
      }
    }

    const targetModelCode = data.modelCode ? data.modelCode.toUpperCase().trim() : existing.modelCode;
    if (targetModelCode !== existing.modelCode || targetBrandId !== existing.brandId) {
      const duplicate = await modelRepository.findByBrandAndCode(targetBrandId, targetModelCode);
      if (duplicate && duplicate.modelId !== modelId) {
        throw new AppError(
          `Model code '${targetModelCode}' is already in use for the selected brand`,
          409,
          'DUPLICATE_CODE'
        );
      }
    }

    const releaseDateObj = data.releaseDate ? new Date(data.releaseDate) : undefined;

    const result = await modelRepository.updateModel(
      modelId,
      {
        ...data,
        releaseDate: releaseDateObj,
        updatedBy: actor.username,
      },
      data.expectedVersion
    );

    if (!result.updated || !result.model) {
      throw new AppError(
        'Concurrent update conflict: Model was updated by another transaction. Please reload.',
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    await auditRepository.recordCatalogAudit({
      entityName: 'MODEL',
      entityId: modelId,
      action: 'UPDATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: data,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`Model updated: ${result.model.modelCode} by ${actor.username}`);
    return result.model;
  }

  async toggleModelStatus(
    modelId: string,
    isActive: 'Y' | 'N',
    actor: ActingUser,
    expectedVersion?: number
  ): Promise<ModelWithRelationsRecord> {
    const model = await this.getModelById(modelId);

    // If activating model, ensure parent Brand and Product are active
    if (isActive === 'Y') {
      const [brand, product] = await Promise.all([
        brandRepository.findById(model.brandId),
        productRepository.findById(model.productId),
      ]);
      if (!brand || brand.isActive !== 'Y') {
        throw new AppError(
          `Cannot activate model: associated Brand '${model.brandName}' is currently deactivated.`,
          400,
          'INACTIVE_RELATION'
        );
      }
      if (!product || product.isActive !== 'Y') {
        throw new AppError(
          `Cannot activate model: associated Product '${model.productName}' is currently deactivated.`,
          400,
          'INACTIVE_RELATION'
        );
      }
    }

    const result = await modelRepository.setModelActive(
      modelId,
      isActive,
      actor.username,
      expectedVersion
    );

    if (!result.updated || !result.model) {
      throw new AppError(
        'Concurrent update conflict: Model state was modified by another transaction.',
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    await auditRepository.recordCatalogAudit({
      entityName: 'MODEL',
      entityId: modelId,
      action: isActive === 'Y' ? 'ACTIVATE' : 'DEACTIVATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { previousState: model.isActive, newState: isActive },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`Model status changed to ${isActive}: ${model.modelCode} by ${actor.username}`);
    return result.model;
  }

  // ============================================================================
  // HSN & Tax Operations
  // ============================================================================

  async listHsn(options: {
    search?: string;
    isActive?: 'Y' | 'N';
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<HsnRecord>> {
    return hsnRepository.listHsn(options);
  }

  async getHsnById(hsnId: string): Promise<HsnRecord> {
    const hsn = await hsnRepository.findById(hsnId);
    if (!hsn) {
      throw new AppError(`HSN record with ID '${hsnId}' not found`, 404, 'NOT_FOUND');
    }
    return hsn;
  }

  async createHsn(
    data: {
      hsnCode: string;
      chapterNo?: string;
      hsnDescription: string;
      cgstRate: number;
      sgstRate: number;
      igstRate: number;
      isActive?: 'Y' | 'N';
    },
    actor: ActingUser
  ): Promise<HsnRecord> {
    const existing = await hsnRepository.findByCode(data.hsnCode);
    if (existing) {
      throw new AppError(
        `HSN code '${data.hsnCode}' already exists`,
        409,
        'DUPLICATE_CODE'
      );
    }

    const hsn = await hsnRepository.createHsn({
      ...data,
      createdBy: actor.username,
    });

    await auditRepository.recordCatalogAudit({
      entityName: 'HSN',
      entityId: hsn.hsnId,
      action: 'CREATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { hsnCode: hsn.hsnCode, hsnDescription: hsn.hsnDescription, igstRate: hsn.igstRate },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`HSN created: ${hsn.hsnCode} by ${actor.username}`);
    return hsn;
  }

  async updateHsn(
    hsnId: string,
    data: {
      chapterNo?: string;
      hsnDescription?: string;
      cgstRate?: number;
      sgstRate?: number;
      igstRate?: number;
      isActive?: 'Y' | 'N';
      expectedVersion?: number;
      versionNo?: number;
    },
    actor: ActingUser
  ): Promise<HsnRecord> {
    const hsn = await this.getHsnById(hsnId);
    const version = data.versionNo ?? data.expectedVersion ?? hsn.versionNo;

    const updated = await hsnRepository.updateHsn(hsnId, {
      chapterNo: data.chapterNo !== undefined ? data.chapterNo : hsn.chapterNo,
      hsnDescription: data.hsnDescription !== undefined ? data.hsnDescription : hsn.hsnDescription,
      cgstRate: data.cgstRate !== undefined ? data.cgstRate : hsn.cgstRate,
      sgstRate: data.sgstRate !== undefined ? data.sgstRate : hsn.sgstRate,
      igstRate: data.igstRate !== undefined ? data.igstRate : hsn.igstRate,
      isActive: data.isActive !== undefined ? data.isActive : hsn.isActive,
      updatedBy: actor.username,
      versionNo: version,
    });

    if (!updated) {
      throw new AppError(
        `HSN update conflict for '${hsn.hsnCode}'. The record was modified by another transaction.`,
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    await auditRepository.recordCatalogAudit({
      entityName: 'HSN',
      entityId: hsnId,
      action: 'UPDATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { previous: hsn, updated },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`HSN updated: ${updated.hsnCode} by ${actor.username}`);
    return updated;
  }

  async toggleHsnStatus(
    hsnId: string,
    isActive: 'Y' | 'N',
    versionNo: number,
    actor: ActingUser
  ): Promise<HsnRecord> {
    const hsn = await this.getHsnById(hsnId);

    const updated = await hsnRepository.updateStatus(hsnId, isActive, versionNo, actor.username);
    if (!updated) {
      throw new AppError(
        `HSN status conflict for '${hsn.hsnCode}'. Record modified by another transaction.`,
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    await auditRepository.recordCatalogAudit({
      entityName: 'HSN',
      entityId: hsnId,
      action: isActive === 'Y' ? 'ACTIVATE' : 'DEACTIVATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { previousState: hsn.isActive, newState: isActive },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`HSN status changed to ${isActive}: ${hsn.hsnCode} by ${actor.username}`);
    return updated;
  }

  // ============================================================================
  // Part Code Operations
  // ============================================================================

  async listParts(options: {
    search?: string;
    brandId?: string;
    productId?: string;
    category?: string;
    isActive?: 'Y' | 'N';
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<PartWithRelationsRecord>> {
    return partRepository.listParts(options);
  }

  async getPartById(partId: string): Promise<PartWithRelationsRecord> {
    const part = await partRepository.findById(partId);
    if (!part) {
      throw new AppError(`Part with ID '${partId}' not found`, 404, 'NOT_FOUND');
    }
    return part;
  }

  async createPart(
    data: {
      brandId: string;
      productId: string;
      partCode: string;
      vendorPartCode?: string;
      partName: string;
      partDescription?: string;
      hsnId: string;
      partCategory: 'SPARE' | 'CONSUMABLE' | 'ACCESSORY';
      partFor?: string;
      customerPrice: number;
      locationPrice: number;
      faultyPartDispatchTo?: string;
      warrantyDays?: number;
      isActive?: 'Y' | 'N';
    },
    actor: ActingUser
  ): Promise<PartWithRelationsRecord> {
    const brand = await brandRepository.findById(data.brandId);
    if (!brand) {
      throw new AppError(`Brand with ID '${data.brandId}' does not exist`, 400, 'INVALID_RELATION');
    }
    if (brand.isActive === 'N') {
      throw new AppError(`Cannot create part under inactive brand '${brand.brandName}'`, 400, 'INACTIVE_BRAND');
    }

    const product = await productRepository.findById(data.productId);
    if (!product) {
      throw new AppError(`Product with ID '${data.productId}' does not exist`, 400, 'INVALID_RELATION');
    }
    if (product.isActive === 'N') {
      throw new AppError(`Cannot create part under inactive product '${product.productName}'`, 400, 'INACTIVE_PRODUCT');
    }

    const hsn = await hsnRepository.findById(data.hsnId);
    if (!hsn) {
      throw new AppError(`HSN code record with ID '${data.hsnId}' does not exist`, 400, 'INVALID_RELATION');
    }
    if (hsn.isActive === 'N') {
      throw new AppError(`Cannot associate part with inactive HSN code '${hsn.hsnCode}'`, 400, 'INACTIVE_HSN');
    }

    const existingInBrand = await partRepository.findByBrandAndPartCode(data.brandId, data.partCode);
    if (existingInBrand) {
      throw new AppError(
        `Part code '${data.partCode}' already exists for Brand '${brand.brandName}'`,
        409,
        'DUPLICATE_PART_CODE'
      );
    }

    const part = await partRepository.createPart({
      ...data,
      createdBy: actor.username,
    });

    await auditRepository.recordCatalogAudit({
      entityName: 'PART',
      entityId: part.partId,
      action: 'CREATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: {
        partCode: part.partCode,
        partName: part.partName,
        brandName: part.brandName,
        productName: part.productName,
        customerPrice: part.customerPrice,
        locationPrice: part.locationPrice,
      },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`Part created: ${part.partCode} (${part.partName}) by ${actor.username}`);
    return part;
  }

  async updatePart(
    partId: string,
    data: {
      vendorPartCode?: string;
      partName?: string;
      partDescription?: string;
      hsnId?: string;
      partCategory?: 'SPARE' | 'CONSUMABLE' | 'ACCESSORY';
      partFor?: string;
      customerPrice?: number;
      locationPrice?: number;
      faultyPartDispatchTo?: string;
      warrantyDays?: number;
      isActive?: 'Y' | 'N';
      expectedVersion?: number;
      versionNo?: number;
    },
    actor: ActingUser
  ): Promise<PartWithRelationsRecord> {
    const part = await this.getPartById(partId);
    const version = data.versionNo ?? data.expectedVersion ?? part.versionNo;

    const targetHsnId = data.hsnId || part.hsnId;
    const hsn = await hsnRepository.findById(targetHsnId);
    if (!hsn) {
      throw new AppError(`HSN record with ID '${targetHsnId}' not found`, 400, 'INVALID_RELATION');
    }

    const updated = await partRepository.updatePart(partId, {
      vendorPartCode: data.vendorPartCode !== undefined ? data.vendorPartCode : part.vendorPartCode,
      partName: data.partName || part.partName,
      partDescription: data.partDescription !== undefined ? data.partDescription : part.partDescription,
      hsnId: targetHsnId,
      partCategory: data.partCategory || part.partCategory,
      partFor: data.partFor !== undefined ? data.partFor : part.partFor,
      customerPrice: data.customerPrice !== undefined ? data.customerPrice : part.customerPrice,
      locationPrice: data.locationPrice !== undefined ? data.locationPrice : part.locationPrice,
      faultyPartDispatchTo: data.faultyPartDispatchTo || part.faultyPartDispatchTo,
      warrantyDays: data.warrantyDays !== undefined ? data.warrantyDays : part.warrantyDays,
      isActive: data.isActive || part.isActive,
      updatedBy: actor.username,
      versionNo: version,
    });

    if (!updated) {
      throw new AppError(
        `Part update conflict for '${part.partCode}'. The record was modified by another transaction.`,
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    await auditRepository.recordCatalogAudit({
      entityName: 'PART',
      entityId: partId,
      action: 'UPDATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { previous: part, updated },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`Part updated: ${updated.partCode} by ${actor.username}`);
    return updated;
  }

  async togglePartStatus(
    partId: string,
    isActive: 'Y' | 'N',
    versionNo: number,
    actor: ActingUser
  ): Promise<PartWithRelationsRecord> {
    const part = await this.getPartById(partId);

    if (isActive === 'Y') {
      const brand = await brandRepository.findById(part.brandId);
      if (brand && brand.isActive === 'N') {
        throw new AppError(
          `Cannot activate part '${part.partCode}' because parent brand '${brand.brandName}' is inactive.`,
          400,
          'INACTIVE_BRAND'
        );
      }
      const product = await productRepository.findById(part.productId);
      if (product && product.isActive === 'N') {
        throw new AppError(
          `Cannot activate part '${part.partCode}' because parent product '${product.productName}' is inactive.`,
          400,
          'INACTIVE_PRODUCT'
        );
      }
    }

    const updated = await partRepository.updateStatus(partId, isActive, versionNo, actor.username);
    if (!updated) {
      throw new AppError(
        `Part status conflict for '${part.partCode}'. Record modified by another transaction.`,
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    await auditRepository.recordCatalogAudit({
      entityName: 'PART',
      entityId: partId,
      action: isActive === 'Y' ? 'ACTIVATE' : 'DEACTIVATE',
      performedBy: actor.userId,
      performedByUsername: actor.username,
      changes: { previousState: part.isActive, newState: isActive },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    logger.info(`Part status changed to ${isActive}: ${part.partCode} by ${actor.username}`);
    return updated;
  }

  // ============================================================================
  // Audit Trail
  // ============================================================================

  async getRecentAudits(options?: {
    entityName?: CatalogAuditRecord['entityName'];
    entityId?: string;
    limit?: number;
  }): Promise<CatalogAuditRecord[]> {
    return auditRepository.listRecentAudits(options as any);
  }
}

export const catalogService = new CatalogService();
