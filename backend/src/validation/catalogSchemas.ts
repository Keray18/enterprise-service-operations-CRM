import { z } from 'zod';

// ============================================================================
// Brand Schemas
// ============================================================================

export const createBrandSchema = z.object({
  brandCode: z
    .string()
    .min(2, 'Brand code must be at least 2 characters')
    .max(30, 'Brand code must not exceed 30 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Brand code can only contain letters, numbers, hyphens, and underscores'),
  brandName: z
    .string()
    .min(2, 'Brand name must be at least 2 characters')
    .max(100, 'Brand name must not exceed 100 characters'),
  logoUrl: z
    .string()
    .max(500, 'Logo URL must not exceed 500 characters')
    .optional()
    .or(z.literal('')),
  isActive: z.enum(['Y', 'N']).default('Y'),
});

export const updateBrandSchema = z.object({
  brandCode: z
    .string()
    .min(2)
    .max(30)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  brandName: z.string().min(2).max(100).optional(),
  logoUrl: z.string().max(500).optional().or(z.literal('')),
  isActive: z.enum(['Y', 'N']).optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
  versionNo: z.coerce.number().int().positive().optional(),
});

// ============================================================================
// Product Schemas
// ============================================================================

export const createProductSchema = z.object({
  productCode: z
    .string()
    .min(2, 'Product code must be at least 2 characters')
    .max(30, 'Product code must not exceed 30 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Product code can only contain letters, numbers, hyphens, and underscores'),
  productName: z
    .string()
    .min(2, 'Product name must be at least 2 characters')
    .max(100, 'Product name must not exceed 100 characters'),
  categoryFamily: z
    .string()
    .min(2, 'Category family must be at least 2 characters')
    .max(100, 'Category family must not exceed 100 characters'),
  isActive: z.enum(['Y', 'N']).default('Y'),
});

export const updateProductSchema = z.object({
  productCode: z
    .string()
    .min(2)
    .max(30)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  productName: z.string().min(2).max(100).optional(),
  categoryFamily: z.string().min(2).max(100).optional(),
  isActive: z.enum(['Y', 'N']).optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
  versionNo: z.coerce.number().int().positive().optional(),
});

// ============================================================================
// Model Schemas
// ============================================================================

export const createModelSchema = z.object({
  brandId: z.string().min(1, 'Brand is required'),
  productId: z.string().min(1, 'Product is required'),
  modelCode: z
    .string()
    .min(2, 'Model code must be at least 2 characters')
    .max(50, 'Model code must not exceed 50 characters')
    .regex(/^[A-Za-z0-9_.-]+$/, 'Model code can only contain letters, numbers, hyphens, dots, and underscores'),
  modelName: z
    .string()
    .min(2, 'Model name must be at least 2 characters')
    .max(100, 'Model name must not exceed 100 characters'),
  technicalName: z.string().max(100).optional().or(z.literal('')),
  softwareVersion: z.string().max(50).optional().or(z.literal('')),
  serialNumberLength: z.coerce.number().int().min(5).max(50).default(15),
  checkSerialNumber: z.enum(['Y', 'N']).default('Y'),
  isJobCreationAllowed: z.enum(['Y', 'N']).default('Y'),
  isDoaAllowed: z.enum(['Y', 'N']).default('Y'),
  isRepairable: z.enum(['Y', 'N']).default('Y'),
  isReplacementAllowed: z.enum(['Y', 'N']).default('Y'),
  customerWarrantyDays: z.coerce.number().int().nonnegative().default(365),
  repairWarrantyDays: z.coerce.number().int().nonnegative().default(90),
  replacementWindowDays: z.coerce.number().int().nonnegative().default(30),
  doaDays: z.coerce.number().int().nonnegative().default(7),
  amcDays: z.coerce.number().int().nonnegative().default(0),
  amcAmount: z.coerce.number().nonnegative().default(0),
  isOutOfWarrantyServiced: z.enum(['Y', 'N']).default('Y'),
  standardServiceCharge: z.coerce.number().nonnegative().default(0),
  releaseDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Valid release date is required (YYYY-MM-DD)',
  }),
  isActive: z.enum(['Y', 'N']).default('Y'),
});

export const updateModelSchema = z.object({
  brandId: z.string().optional(),
  productId: z.string().optional(),
  modelCode: z.string().min(2).max(50).optional(),
  modelName: z.string().min(2).max(100).optional(),
  technicalName: z.string().max(100).optional().or(z.literal('')),
  softwareVersion: z.string().max(50).optional().or(z.literal('')),
  serialNumberLength: z.coerce.number().int().min(5).max(50).optional(),
  checkSerialNumber: z.enum(['Y', 'N']).optional(),
  isJobCreationAllowed: z.enum(['Y', 'N']).optional(),
  isDoaAllowed: z.enum(['Y', 'N']).optional(),
  isRepairable: z.enum(['Y', 'N']).optional(),
  isReplacementAllowed: z.enum(['Y', 'N']).optional(),
  customerWarrantyDays: z.coerce.number().int().nonnegative().optional(),
  repairWarrantyDays: z.coerce.number().int().nonnegative().optional(),
  replacementWindowDays: z.coerce.number().int().nonnegative().optional(),
  doaDays: z.coerce.number().int().nonnegative().optional(),
  amcDays: z.coerce.number().int().nonnegative().optional(),
  amcAmount: z.coerce.number().nonnegative().optional(),
  isOutOfWarrantyServiced: z.enum(['Y', 'N']).optional(),
  standardServiceCharge: z.coerce.number().nonnegative().optional(),
  releaseDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Valid release date is required' })
    .optional(),
  isActive: z.enum(['Y', 'N']).optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
  versionNo: z.coerce.number().int().positive().optional(),
});

// ============================================================================
// HSN and Tax Schemas
// ============================================================================

export const createHsnSchema = z.object({
  hsnCode: z
    .string()
    .min(2, 'HSN code must be at least 2 characters')
    .max(20, 'HSN code must not exceed 20 characters')
    .regex(/^[A-Za-z0-9]+$/, 'HSN code must be alphanumeric'),
  chapterNo: z.string().max(10).optional().or(z.literal('')),
  hsnDescription: z
    .string()
    .min(2, 'HSN description must be at least 2 characters')
    .max(255, 'HSN description must not exceed 255 characters'),
  cgstRate: z.coerce.number().min(0, 'CGST rate must be >= 0').max(100, 'CGST rate must be <= 100'),
  sgstRate: z.coerce.number().min(0, 'SGST rate must be >= 0').max(100, 'SGST rate must be <= 100'),
  igstRate: z.coerce.number().min(0, 'IGST rate must be >= 0').max(100, 'IGST rate must be <= 100'),
  isActive: z.enum(['Y', 'N']).default('Y'),
});

export const updateHsnSchema = z.object({
  chapterNo: z.string().max(10).optional().or(z.literal('')),
  hsnDescription: z.string().min(2).max(255).optional(),
  cgstRate: z.coerce.number().min(0).max(100).optional(),
  sgstRate: z.coerce.number().min(0).max(100).optional(),
  igstRate: z.coerce.number().min(0).max(100).optional(),
  isActive: z.enum(['Y', 'N']).optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
  versionNo: z.coerce.number().int().positive().optional(),
});

// ============================================================================
// Part Code Schemas
// ============================================================================

export const createPartSchema = z.object({
  brandId: z.string().min(1, 'Brand is required'),
  productId: z.string().min(1, 'Product is required'),
  partCode: z
    .string()
    .min(2, 'Part code must be at least 2 characters')
    .max(50, 'Part code must not exceed 50 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Part code can only contain letters, numbers, hyphens, and underscores'),
  vendorPartCode: z.string().max(50).optional().or(z.literal('')),
  partName: z
    .string()
    .min(2, 'Part name must be at least 2 characters')
    .max(150, 'Part name must not exceed 150 characters'),
  partDescription: z.string().max(500).optional().or(z.literal('')),
  hsnId: z.string().min(1, 'HSN code reference is required'),
  partCategory: z.enum(['SPARE', 'CONSUMABLE', 'ACCESSORY']),
  partFor: z.string().max(50).optional().or(z.literal('')),
  customerPrice: z.coerce.number().nonnegative('Customer price must be non-negative'),
  locationPrice: z.coerce.number().nonnegative('Location price must be non-negative'),
  faultyPartDispatchTo: z.string().max(50).default('WAREHOUSE'),
  warrantyDays: z.coerce.number().int().nonnegative('Warranty days must be non-negative').default(90),
  isActive: z.enum(['Y', 'N']).default('Y'),
});

export const updatePartSchema = z.object({
  vendorPartCode: z.string().max(50).optional().or(z.literal('')),
  partName: z.string().min(2).max(150).optional(),
  partDescription: z.string().max(500).optional().or(z.literal('')),
  hsnId: z.string().optional(),
  partCategory: z.enum(['SPARE', 'CONSUMABLE', 'ACCESSORY']).optional(),
  partFor: z.string().max(50).optional().or(z.literal('')),
  customerPrice: z.coerce.number().nonnegative().optional(),
  locationPrice: z.coerce.number().nonnegative().optional(),
  faultyPartDispatchTo: z.string().max(50).optional(),
  warrantyDays: z.coerce.number().int().nonnegative().optional(),
  isActive: z.enum(['Y', 'N']).optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
  versionNo: z.coerce.number().int().positive().optional(),
});

// ============================================================================
// State Schemas
// ============================================================================

export const createStateSchema = z.object({
  stateCode: z
    .string()
    .min(2, 'State code must be at least 2 characters')
    .max(10, 'State code must not exceed 10 characters')
    .regex(/^[A-Za-z]+$/, 'State code must contain letters only'),
  stateName: z
    .string()
    .min(2, 'State name must be at least 2 characters')
    .max(100, 'State name must not exceed 100 characters'),
  zone: z.enum(['NORTH', 'SOUTH', 'EAST', 'WEST', 'CENTRAL', 'NORTH_EAST']),
  isActive: z.enum(['Y', 'N']).default('Y'),
});

export const updateStateSchema = z.object({
  stateName: z.string().min(2).max(100).optional(),
  zone: z.enum(['NORTH', 'SOUTH', 'EAST', 'WEST', 'CENTRAL', 'NORTH_EAST']).optional(),
  isActive: z.enum(['Y', 'N']).optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
  versionNo: z.coerce.number().int().positive().optional(),
});

// ============================================================================
// City Schemas
// ============================================================================

export const createCitySchema = z.object({
  cityName: z
    .string()
    .min(2, 'City name must be at least 2 characters')
    .max(100, 'City name must not exceed 100 characters'),
  stateId: z.string().min(1, 'State is required'),
  isActive: z.enum(['Y', 'N']).default('Y'),
});

export const updateCitySchema = z.object({
  cityName: z.string().min(2).max(100).optional(),
  stateId: z.string().optional(),
  isActive: z.enum(['Y', 'N']).optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
  versionNo: z.coerce.number().int().positive().optional(),
});

// ============================================================================
// Pincode Schemas
// ============================================================================

export const createPincodeSchema = z.object({
  pincode: z
    .string()
    .min(6, 'Pincode must be at least 6 characters')
    .max(10, 'Pincode must not exceed 10 characters')
    .regex(/^[0-9]+$/, 'Pincode must contain numbers only'),
  stateId: z.string().min(1, 'State is required'),
  cityId: z.string().min(1, 'City is required'),
  defaultAsfId: z.string().optional().or(z.literal('')),
  isServiceable: z.enum(['Y', 'N']).default('Y'),
});

export const updatePincodeSchema = z.object({
  stateId: z.string().optional(),
  cityId: z.string().optional(),
  defaultAsfId: z.string().optional().or(z.literal('')),
  isServiceable: z.enum(['Y', 'N']).optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
  versionNo: z.coerce.number().int().positive().optional(),
});

// ============================================================================
// Shared Status & Pagination Schemas
// ============================================================================

export const toggleStatusSchema = z.object({
  isActive: z.enum(['Y', 'N']).optional(),
  isServiceable: z.enum(['Y', 'N']).optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
  versionNo: z.coerce.number().int().positive().optional(),
});

export const catalogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  isActive: z.enum(['Y', 'N']).optional(),
  isServiceable: z.enum(['Y', 'N']).optional(),
  brandId: z.string().optional(),
  productId: z.string().optional(),
  category: z.string().optional(),
  categoryFamily: z.string().optional(),
  stateId: z.string().optional(),
  cityId: z.string().optional(),
  zone: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
