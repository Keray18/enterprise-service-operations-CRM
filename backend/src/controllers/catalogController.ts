import { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../middleware/errorHandler.js';
import { ActingUser, catalogService } from '../services/catalogService.js';
import {
  catalogQuerySchema,
  createBrandSchema,
  createHsnSchema,
  createModelSchema,
  createPartSchema,
  createProductSchema,
  toggleStatusSchema,
  updateBrandSchema,
  updateHsnSchema,
  updateModelSchema,
  updatePartSchema,
  updateProductSchema,
} from '../validation/catalogSchemas.js';

function getActor(req: Request): ActingUser {
  return {
    userId: req.user?.userId || 'UNKNOWN_USER',
    username: req.user?.username || 'UNKNOWN',
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  };
}

export class CatalogController {
  // ============================================================================
  // Brand Endpoints
  // ============================================================================

  async listBrands(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = catalogQuerySchema.parse(req.query);
      const result = await catalogService.listBrands({
        search: query.search,
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

  async getBrandById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const brand = await catalogService.getBrandById(id);
      sendSuccess(res, brand);
    } catch (err) {
      next(err);
    }
  }

  async createBrand(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createBrandSchema.parse(req.body);
      const brand = await catalogService.createBrand(validated, getActor(req));
      sendSuccess(res, brand, 201);
    } catch (err) {
      next(err);
    }
  }

  async updateBrand(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = updateBrandSchema.parse(req.body);
      const brand = await catalogService.updateBrand(id, validated, getActor(req));
      sendSuccess(res, brand);
    } catch (err) {
      next(err);
    }
  }

  async toggleBrandStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = toggleStatusSchema.parse(req.body);
      const isActive = validated.isActive ?? 'Y';
      const brand = await catalogService.toggleBrandStatus(
        id,
        isActive,
        getActor(req),
        validated.expectedVersion
      );
      sendSuccess(res, brand);
    } catch (err) {
      next(err);
    }
  }

  // ============================================================================
  // Product Endpoints
  // ============================================================================

  async listProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = catalogQuerySchema.parse(req.query);
      const result = await catalogService.listProducts({
        search: query.search,
        categoryFamily: query.categoryFamily,
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

  async getProductById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const product = await catalogService.getProductById(id);
      sendSuccess(res, product);
    } catch (err) {
      next(err);
    }
  }

  async createProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createProductSchema.parse(req.body);
      const product = await catalogService.createProduct(validated, getActor(req));
      sendSuccess(res, product, 201);
    } catch (err) {
      next(err);
    }
  }

  async updateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = updateProductSchema.parse(req.body);
      const product = await catalogService.updateProduct(id, validated, getActor(req));
      sendSuccess(res, product);
    } catch (err) {
      next(err);
    }
  }

  async toggleProductStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = toggleStatusSchema.parse(req.body);
      const isActive = validated.isActive ?? 'Y';
      const product = await catalogService.toggleProductStatus(
        id,
        isActive,
        getActor(req),
        validated.expectedVersion
      );
      sendSuccess(res, product);
    } catch (err) {
      next(err);
    }
  }

  async listProductCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categories = await catalogService.listProductCategories();
      sendSuccess(res, categories);
    } catch (err) {
      next(err);
    }
  }

  // ============================================================================
  // Model Endpoints
  // ============================================================================

  async listModels(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = catalogQuerySchema.parse(req.query);
      const result = await catalogService.listModels({
        search: query.search,
        brandId: query.brandId,
        productId: query.productId,
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

  async getModelById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const model = await catalogService.getModelById(id);
      sendSuccess(res, model);
    } catch (err) {
      next(err);
    }
  }

  async createModel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createModelSchema.parse(req.body);
      const model = await catalogService.createModel(validated, getActor(req));
      sendSuccess(res, model, 201);
    } catch (err) {
      next(err);
    }
  }

  async updateModel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = updateModelSchema.parse(req.body);
      const model = await catalogService.updateModel(id, validated, getActor(req));
      sendSuccess(res, model);
    } catch (err) {
      next(err);
    }
  }

  async toggleModelStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = toggleStatusSchema.parse(req.body);
      const isActive = validated.isActive ?? 'Y';
      const model = await catalogService.toggleModelStatus(
        id,
        isActive,
        getActor(req),
        validated.expectedVersion
      );
      sendSuccess(res, model);
    } catch (err) {
      next(err);
    }
  }

  // ============================================================================
  // HSN & Tax Endpoints
  // ============================================================================

  async listHsn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = catalogQuerySchema.parse(req.query);
      const result = await catalogService.listHsn({
        search: query.search,
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

  async getHsnById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const hsn = await catalogService.getHsnById(id);
      sendSuccess(res, hsn);
    } catch (err) {
      next(err);
    }
  }

  async createHsn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createHsnSchema.parse(req.body);
      const hsn = await catalogService.createHsn(validated, getActor(req));
      sendSuccess(res, hsn, 201);
    } catch (err) {
      next(err);
    }
  }

  async updateHsn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = updateHsnSchema.parse(req.body);
      const hsn = await catalogService.updateHsn(id, validated, getActor(req));
      sendSuccess(res, hsn);
    } catch (err) {
      next(err);
    }
  }

  async toggleHsnStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = toggleStatusSchema.parse(req.body);
      const versionNo = validated.versionNo ?? validated.expectedVersion ?? 1;
      const isActive = validated.isActive ?? 'Y';
      const hsn = await catalogService.toggleHsnStatus(
        id,
        isActive,
        versionNo,
        getActor(req)
      );
      sendSuccess(res, hsn);
    } catch (err) {
      next(err);
    }
  }

  // ============================================================================
  // Part Code Endpoints
  // ============================================================================

  async listParts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = catalogQuerySchema.parse(req.query);
      const result = await catalogService.listParts({
        search: query.search,
        brandId: query.brandId,
        productId: query.productId,
        category: query.category,
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

  async getPartById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const part = await catalogService.getPartById(id);
      sendSuccess(res, part);
    } catch (err) {
      next(err);
    }
  }

  async createPart(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createPartSchema.parse(req.body);
      const part = await catalogService.createPart(validated, getActor(req));
      sendSuccess(res, part, 201);
    } catch (err) {
      next(err);
    }
  }

  async updatePart(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = updatePartSchema.parse(req.body);
      const part = await catalogService.updatePart(id, validated, getActor(req));
      sendSuccess(res, part);
    } catch (err) {
      next(err);
    }
  }

  async togglePartStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = toggleStatusSchema.parse(req.body);
      const versionNo = validated.versionNo ?? validated.expectedVersion ?? 1;
      const isActive = validated.isActive ?? 'Y';
      const part = await catalogService.togglePartStatus(
        id,
        isActive,
        versionNo,
        getActor(req)
      );
      sendSuccess(res, part);
    } catch (err) {
      next(err);
    }
  }

  // ============================================================================
  // Audit Trail Endpoint
  // ============================================================================

  async listAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const entityName = req.query.entityName as any;
      const entityId = req.query.entityId as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 50;

      const logs = await catalogService.getRecentAudits({ entityName, entityId, limit });
      sendSuccess(res, logs);
    } catch (err) {
      next(err);
    }
  }
}

export const catalogController = new CatalogController();
