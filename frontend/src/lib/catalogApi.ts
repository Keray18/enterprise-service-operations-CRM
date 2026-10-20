/**
 * Catalog & Geography Master API Client and React Query Hooks
 * Supports Brands, Products, Models, Parts, HSN/Tax, States, Cities, Pincodes, Locations, and Audit
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './apiClient';

// ==========================================
// TYPES
// ==========================================

export interface Brand {
  brandId: string;
  brandCode: string;
  brandName: string;
  logoUrl?: string;
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface Product {
  productId: string;
  productCode: string;
  productName: string;
  categoryFamily: string;
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface Model {
  modelId: string;
  brandId: string;
  productId: string;
  modelCode: string;
  modelName: string;
  technicalName?: string;
  softwareVersion?: string;
  serialNumberLength: number;
  checkSerialNumber: 'Y' | 'N';
  isJobCreationAllowed: 'Y' | 'N';
  isDoaAllowed: 'Y' | 'N';
  isRepairable: 'Y' | 'N';
  isReplacementAllowed: 'Y' | 'N';
  customerWarrantyDays: number;
  repairWarrantyDays: number;
  replacementWindowDays: number;
  doaDays: number;
  amcDays: number;
  amcAmount: number;
  isOutOfWarrantyServiced: 'Y' | 'N';
  standardServiceCharge: number;
  releaseDate: string;
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  // relations
  brandName?: string;
  brandCode?: string;
  productName?: string;
  productCode?: string;
  categoryFamily?: string;
}

export interface Hsn {
  hsnId: string;
  hsnCode: string;
  chapterNo?: string;
  hsnDescription: string;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface Part {
  partId: string;
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
  faultyPartDispatchTo: string;
  warrantyDays: number;
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  // relations
  brandName?: string;
  brandCode?: string;
  productName?: string;
  productCode?: string;
  hsnCode?: string;
  hsnDescription?: string;
}

export interface State {
  stateId: string;
  stateCode: string;
  stateName: string;
  zone: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'CENTRAL' | 'NORTH_EAST';
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface City {
  cityId: string;
  stateId: string;
  cityName: string;
  tier?: string;
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  // relations
  stateCode?: string;
  stateName?: string;
  zone?: string;
}

export interface Location {
  locationId: string;
  locationCode: string;
  locationName: string;
  partyType: string;
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: string;
  updatedAt: string;
}

export interface Pincode {
  pincodeId: string;
  pincode: string;
  stateId: string;
  cityId: string;
  defaultAsfId?: string;
  isServiceable: 'Y' | 'N';
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  // relations
  stateName?: string;
  stateCode?: string;
  cityName?: string;
  defaultAsfName?: string;
  defaultAsfCode?: string;
}

export interface PincodeLookup {
  pincode: string;
  stateId: string;
  stateName: string;
  stateCode: string;
  cityId: string;
  cityName: string;
  isServiceable: 'Y' | 'N';
  defaultAsfId?: string;
  defaultAsfName?: string;
  defaultAsfCode?: string;
}

export interface CatalogAudit {
  auditId: string;
  entityName: 'BRAND' | 'PRODUCT' | 'MODEL' | 'PART' | 'HSN' | 'STATE' | 'CITY' | 'PINCODE';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'ACTIVATE' | 'DEACTIVATE';
  performedBy: string;
  performedByUsername: string;
  changesJson?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Params
export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  isActive?: 'Y' | 'N';
}

export interface BrandParams extends PaginationParams {}

export interface ProductParams extends PaginationParams {
  categoryFamily?: string;
}

export interface ModelParams extends PaginationParams {
  brandId?: string;
  productId?: string;
  categoryFamily?: string;
}

export interface HsnParams extends PaginationParams {}

export interface PartParams extends PaginationParams {
  brandId?: string;
  productId?: string;
  category?: string;
}

export interface StateParams extends PaginationParams {
  zone?: string;
}

export interface CityParams extends PaginationParams {
  stateId?: string;
}

export interface PincodeParams extends PaginationParams {
  stateId?: string;
  cityId?: string;
  isServiceable?: 'Y' | 'N';
}

// Payloads
export interface CreateBrandPayload {
  brandCode: string;
  brandName: string;
  logoUrl?: string;
  isActive?: 'Y' | 'N';
}

export interface UpdateBrandPayload {
  brandCode?: string;
  brandName?: string;
  logoUrl?: string;
  isActive?: 'Y' | 'N';
  versionNo: number;
}

export interface CreateProductPayload {
  productCode: string;
  productName: string;
  categoryFamily: string;
  isActive?: 'Y' | 'N';
}

export interface UpdateProductPayload {
  productCode?: string;
  productName?: string;
  categoryFamily?: string;
  isActive?: 'Y' | 'N';
  versionNo: number;
}

export interface CreateModelPayload {
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
  releaseDate?: string;
  isActive?: 'Y' | 'N';
}

export interface UpdateModelPayload extends Partial<CreateModelPayload> {
  versionNo: number;
}

export interface CreateHsnPayload {
  hsnCode: string;
  chapterNo?: string;
  hsnDescription: string;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  isActive?: 'Y' | 'N';
}

export interface UpdateHsnPayload {
  chapterNo?: string;
  hsnDescription?: string;
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
  isActive?: 'Y' | 'N';
  versionNo: number;
}

export interface CreatePartPayload {
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
}

export interface UpdatePartPayload extends Partial<CreatePartPayload> {
  versionNo: number;
}

export interface CreateStatePayload {
  stateCode: string;
  stateName: string;
  zone: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'CENTRAL' | 'NORTH_EAST';
  isActive?: 'Y' | 'N';
}

export interface UpdateStatePayload {
  stateName?: string;
  zone?: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'CENTRAL' | 'NORTH_EAST';
  isActive?: 'Y' | 'N';
  versionNo: number;
}

export interface CreateCityPayload {
  cityName: string;
  stateId: string;
  isActive?: 'Y' | 'N';
}

export interface UpdateCityPayload {
  cityName?: string;
  stateId?: string;
  isActive?: 'Y' | 'N';
  versionNo: number;
}

export interface CreatePincodePayload {
  pincode: string;
  stateId: string;
  cityId: string;
  defaultAsfId?: string;
  isServiceable?: 'Y' | 'N';
}

export interface UpdatePincodePayload {
  stateId?: string;
  cityId?: string;
  defaultAsfId?: string;
  isServiceable?: 'Y' | 'N';
  versionNo: number;
}

export interface StatusTogglePayload {
  isActive?: 'Y' | 'N';
  isServiceable?: 'Y' | 'N';
  versionNo: number;
}

// ==========================================
// API FUNCTIONS
// ==========================================

function toQueryString(params: Record<string, any>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, String(value));
    }
  }
  const str = query.toString();
  return str ? `?${str}` : '';
}

export const catalogApi = {
  // Brands
  getBrands: (params: BrandParams = {}) =>
    apiClient.get<PaginatedResponse<Brand>>(`/api/v1/catalog/brands${toQueryString(params)}`),

  getBrand: (id: string) =>
    apiClient.get<Brand>(`/api/v1/catalog/brands/${id}`),

  createBrand: (payload: CreateBrandPayload) =>
    apiClient.post<Brand>('/api/v1/catalog/brands', payload),

  updateBrand: (id: string, payload: UpdateBrandPayload) =>
    apiClient.put<Brand>(`/api/v1/catalog/brands/${id}`, payload),

  toggleBrandStatus: (id: string, payload: StatusTogglePayload) =>
    apiClient.patch<Brand>(`/api/v1/catalog/brands/${id}/status`, payload),

  // Products
  getProducts: (params: ProductParams = {}) =>
    apiClient.get<PaginatedResponse<Product>>(`/api/v1/catalog/products${toQueryString(params)}`),

  getCategories: () =>
    apiClient.get<string[]>('/api/v1/catalog/products/categories'),

  getProduct: (id: string) =>
    apiClient.get<Product>(`/api/v1/catalog/products/${id}`),

  createProduct: (payload: CreateProductPayload) =>
    apiClient.post<Product>('/api/v1/catalog/products', payload),

  updateProduct: (id: string, payload: UpdateProductPayload) =>
    apiClient.put<Product>(`/api/v1/catalog/products/${id}`, payload),

  toggleProductStatus: (id: string, payload: StatusTogglePayload) =>
    apiClient.patch<Product>(`/api/v1/catalog/products/${id}/status`, payload),

  // Models
  getModels: (params: ModelParams = {}) =>
    apiClient.get<PaginatedResponse<Model>>(`/api/v1/catalog/models${toQueryString(params)}`),

  getModel: (id: string) =>
    apiClient.get<Model>(`/api/v1/catalog/models/${id}`),

  createModel: (payload: CreateModelPayload) =>
    apiClient.post<Model>('/api/v1/catalog/models', payload),

  updateModel: (id: string, payload: UpdateModelPayload) =>
    apiClient.put<Model>(`/api/v1/catalog/models/${id}`, payload),

  toggleModelStatus: (id: string, payload: StatusTogglePayload) =>
    apiClient.patch<Model>(`/api/v1/catalog/models/${id}/status`, payload),

  // HSN & Tax Master
  getHsnList: (params: HsnParams = {}) =>
    apiClient.get<PaginatedResponse<Hsn>>(`/api/v1/catalog/hsn${toQueryString(params)}`),

  getHsn: (id: string) =>
    apiClient.get<Hsn>(`/api/v1/catalog/hsn/${id}`),

  createHsn: (payload: CreateHsnPayload) =>
    apiClient.post<Hsn>('/api/v1/catalog/hsn', payload),

  updateHsn: (id: string, payload: UpdateHsnPayload) =>
    apiClient.put<Hsn>(`/api/v1/catalog/hsn/${id}`, payload),

  toggleHsnStatus: (id: string, payload: StatusTogglePayload) =>
    apiClient.patch<Hsn>(`/api/v1/catalog/hsn/${id}/status`, payload),

  // Part Codes Master
  getParts: (params: PartParams = {}) =>
    apiClient.get<PaginatedResponse<Part>>(`/api/v1/catalog/parts${toQueryString(params)}`),

  getPart: (id: string) =>
    apiClient.get<Part>(`/api/v1/catalog/parts/${id}`),

  createPart: (payload: CreatePartPayload) =>
    apiClient.post<Part>('/api/v1/catalog/parts', payload),

  updatePart: (id: string, payload: UpdatePartPayload) =>
    apiClient.put<Part>(`/api/v1/catalog/parts/${id}`, payload),

  togglePartStatus: (id: string, payload: StatusTogglePayload) =>
    apiClient.patch<Part>(`/api/v1/catalog/parts/${id}/status`, payload),

  // Geography: States
  getStates: (params: StateParams = {}) =>
    apiClient.get<PaginatedResponse<State>>(`/api/v1/geography/states${toQueryString(params)}`),

  getState: (id: string) =>
    apiClient.get<State>(`/api/v1/geography/states/${id}`),

  createState: (payload: CreateStatePayload) =>
    apiClient.post<State>('/api/v1/geography/states', payload),

  updateState: (id: string, payload: UpdateStatePayload) =>
    apiClient.put<State>(`/api/v1/geography/states/${id}`, payload),

  toggleStateStatus: (id: string, payload: StatusTogglePayload) =>
    apiClient.patch<State>(`/api/v1/geography/states/${id}/status`, payload),

  // Geography: Cities
  getCities: (params: CityParams = {}) =>
    apiClient.get<PaginatedResponse<City>>(`/api/v1/geography/cities${toQueryString(params)}`),

  getCity: (id: string) =>
    apiClient.get<City>(`/api/v1/geography/cities/${id}`),

  createCity: (payload: CreateCityPayload) =>
    apiClient.post<City>('/api/v1/geography/cities', payload),

  updateCity: (id: string, payload: UpdateCityPayload) =>
    apiClient.put<City>(`/api/v1/geography/cities/${id}`, payload),

  toggleCityStatus: (id: string, payload: StatusTogglePayload) =>
    apiClient.patch<City>(`/api/v1/geography/cities/${id}/status`, payload),

  // Geography: Locations (for Default ASF selector)
  getLocations: (params: { search?: string; partyType?: string; isActive?: 'Y' | 'N'; page?: number; limit?: number } = {}) =>
    apiClient.get<PaginatedResponse<Location>>(`/api/v1/geography/locations${toQueryString(params)}`),

  // Geography: Pincodes & Serviceability
  getPincodes: (params: PincodeParams = {}) =>
    apiClient.get<PaginatedResponse<Pincode>>(`/api/v1/geography/pincodes${toQueryString(params)}`),

  getPincode: (id: string) =>
    apiClient.get<Pincode>(`/api/v1/geography/pincodes/${id}`),

  lookupPincode: (pincode: string) =>
    apiClient.get<PincodeLookup>(`/api/v1/geography/pincodes/lookup/${pincode}`),

  createPincode: (payload: CreatePincodePayload) =>
    apiClient.post<Pincode>('/api/v1/geography/pincodes', payload),

  updatePincode: (id: string, payload: UpdatePincodePayload) =>
    apiClient.put<Pincode>(`/api/v1/geography/pincodes/${id}`, payload),

  togglePincodeStatus: (id: string, payload: StatusTogglePayload) =>
    apiClient.patch<Pincode>(`/api/v1/geography/pincodes/${id}/serviceability`, payload),

  // Audit Logs
  getAuditLogs: async (params: { page?: number; limit?: number; entityName?: string; entityId?: string } = {}): Promise<PaginatedResponse<CatalogAudit>> => {
    const raw = await apiClient.get<CatalogAudit[] | PaginatedResponse<CatalogAudit>>(`/api/v1/catalog/audit-logs${toQueryString(params)}`);
    if (Array.isArray(raw)) {
      return {
        items: raw,
        total: raw.length,
        page: params.page || 1,
        limit: params.limit || 50,
        totalPages: 1,
      };
    }
    return raw;
  },
};

// ==========================================
// QUERY KEYS
// ==========================================

export const CATALOG_QUERY_KEYS = {
  brands: (params?: BrandParams) => ['catalog', 'brands', params] as const,
  brand: (id: string) => ['catalog', 'brand', id] as const,
  products: (params?: ProductParams) => ['catalog', 'products', params] as const,
  product: (id: string) => ['catalog', 'product', id] as const,
  categories: () => ['catalog', 'categories'] as const,
  models: (params?: ModelParams) => ['catalog', 'models', params] as const,
  model: (id: string) => ['catalog', 'model', id] as const,
  hsnList: (params?: HsnParams) => ['catalog', 'hsn', params] as const,
  hsn: (id: string) => ['catalog', 'hsn', id] as const,
  parts: (params?: PartParams) => ['catalog', 'parts', params] as const,
  part: (id: string) => ['catalog', 'part', id] as const,
  states: (params?: StateParams) => ['geography', 'states', params] as const,
  state: (id: string) => ['geography', 'state', id] as const,
  cities: (params?: CityParams) => ['geography', 'cities', params] as const,
  city: (id: string) => ['geography', 'city', id] as const,
  locations: (params?: Record<string, any>) => ['geography', 'locations', params] as const,
  pincodes: (params?: PincodeParams) => ['geography', 'pincodes', params] as const,
  pincode: (id: string) => ['geography', 'pincode', id] as const,
  pincodeLookup: (code: string) => ['geography', 'pincodeLookup', code] as const,
  audit: (params?: Record<string, any>) => ['catalog', 'audit', params] as const,
};

// ==========================================
// REACT QUERY HOOKS
// ==========================================

// Brands Hooks
export function useBrands(params: BrandParams = {}) {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.brands(params),
    queryFn: () => catalogApi.getBrands(params),
  });
}

export function useCreateBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateBrandPayload) => catalogApi.createBrand(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'brands'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

export function useUpdateBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateBrandPayload }) =>
      catalogApi.updateBrand(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'brands'] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.brand(vars.id) });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

export function useToggleBrandStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: StatusTogglePayload }) =>
      catalogApi.toggleBrandStatus(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'brands'] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.brand(vars.id) });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

// Products Hooks
export function useProducts(params: ProductParams = {}) {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.products(params),
    queryFn: () => catalogApi.getProducts(params),
  });
}

export function useProductCategories() {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.categories(),
    queryFn: () => catalogApi.getCategories(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProductPayload) => catalogApi.createProduct(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'products'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'categories'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateProductPayload }) =>
      catalogApi.updateProduct(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'products'] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.product(vars.id) });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'categories'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'models'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'parts'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

export function useToggleProductStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: StatusTogglePayload }) =>
      catalogApi.toggleProductStatus(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'products'] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.product(vars.id) });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'models'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'parts'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

// Models Hooks
export function useModels(params: ModelParams = {}) {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.models(params),
    queryFn: () => catalogApi.getModels(params),
  });
}

export function useCreateModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateModelPayload) => catalogApi.createModel(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'models'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

export function useUpdateModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateModelPayload }) =>
      catalogApi.updateModel(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'models'] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.model(vars.id) });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

export function useToggleModelStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: StatusTogglePayload }) =>
      catalogApi.toggleModelStatus(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'models'] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.model(vars.id) });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

// HSN Hooks
export function useHsnList(params: HsnParams = {}) {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.hsnList(params),
    queryFn: () => catalogApi.getHsnList(params),
  });
}

export function useCreateHsn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHsnPayload) => catalogApi.createHsn(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'hsn'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

export function useUpdateHsn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateHsnPayload }) =>
      catalogApi.updateHsn(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'hsn'] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.hsn(vars.id) });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'parts'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

export function useToggleHsnStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: StatusTogglePayload }) =>
      catalogApi.toggleHsnStatus(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'hsn'] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.hsn(vars.id) });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'parts'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

// Parts Hooks
export function useParts(params: PartParams = {}) {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.parts(params),
    queryFn: () => catalogApi.getParts(params),
  });
}

export function useCreatePart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePartPayload) => catalogApi.createPart(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'parts'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

export function useUpdatePart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePartPayload }) =>
      catalogApi.updatePart(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'parts'] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.part(vars.id) });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

export function useTogglePartStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: StatusTogglePayload }) =>
      catalogApi.togglePartStatus(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'parts'] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.part(vars.id) });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

// Geography: States Hooks
export function useStates(params: StateParams = {}) {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.states(params),
    queryFn: () => catalogApi.getStates(params),
  });
}

export function useCreateState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateStatePayload) => catalogApi.createState(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geography', 'states'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

export function useUpdateState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateStatePayload }) =>
      catalogApi.updateState(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['geography', 'states'] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.state(vars.id) });
      queryClient.invalidateQueries({ queryKey: ['geography', 'cities'] });
      queryClient.invalidateQueries({ queryKey: ['geography', 'pincodes'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

export function useToggleStateStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: StatusTogglePayload }) =>
      catalogApi.toggleStateStatus(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['geography', 'states'] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.state(vars.id) });
      queryClient.invalidateQueries({ queryKey: ['geography', 'cities'] });
      queryClient.invalidateQueries({ queryKey: ['geography', 'pincodes'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

// Geography: Cities Hooks
export function useCities(params: CityParams = {}) {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.cities(params),
    queryFn: () => catalogApi.getCities(params),
  });
}

export function useCreateCity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCityPayload) => catalogApi.createCity(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geography', 'cities'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

export function useUpdateCity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCityPayload }) =>
      catalogApi.updateCity(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['geography', 'cities'] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.city(vars.id) });
      queryClient.invalidateQueries({ queryKey: ['geography', 'pincodes'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

export function useToggleCityStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: StatusTogglePayload }) =>
      catalogApi.toggleCityStatus(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['geography', 'cities'] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.city(vars.id) });
      queryClient.invalidateQueries({ queryKey: ['geography', 'pincodes'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

// Geography: Locations (ASF) Hook
export function useLocations(params: { search?: string; partyType?: string; isActive?: 'Y' | 'N'; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.locations(params),
    queryFn: () => catalogApi.getLocations(params),
  });
}

// Geography: Pincodes & Serviceability Hooks
export function usePincodes(params: PincodeParams = {}) {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.pincodes(params),
    queryFn: () => catalogApi.getPincodes(params),
  });
}

export function useLookupPincode(pincode: string) {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.pincodeLookup(pincode),
    queryFn: () => catalogApi.lookupPincode(pincode),
    enabled: !!pincode && pincode.length >= 6,
  });
}

export function useCreatePincode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePincodePayload) => catalogApi.createPincode(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geography', 'pincodes'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

export function useUpdatePincode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePincodePayload }) =>
      catalogApi.updatePincode(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['geography', 'pincodes'] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.pincode(vars.id) });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

export function useTogglePincodeStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: StatusTogglePayload }) =>
      catalogApi.togglePincodeStatus(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['geography', 'pincodes'] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.pincode(vars.id) });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
    },
  });
}

// Audit Logs Hooks
export function useCatalogAudit(params: { page?: number; limit?: number; entityName?: string; entityId?: string } = {}) {
  return useQuery({
    queryKey: CATALOG_QUERY_KEYS.audit(params),
    queryFn: () => catalogApi.getAuditLogs(params),
  });
}

// ==========================================
// BULK IMPORT TYPES & API
// ==========================================

export type BulkImportEntityType = 'MODEL' | 'PART';
export type BulkImportMode = 'CREATE_ONLY' | 'UPDATE_EXISTING';
export type BulkImportStatus = 'PREVIEW_READY' | 'COMMITTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type RowAction = 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'CONFLICT';

export interface RowValidationError {
  rowNumber: number;
  field: string;
  code: string;
  message: string;
  suggestedCorrection?: string;
}

export interface RowChangeDiff {
  field: string;
  oldValue: any;
  newValue: any;
}

export interface BulkImportPreviewRow {
  rowNumber: number;
  naturalKey: string;
  action: RowAction;
  isValid: boolean;
  errors: RowValidationError[];
  changes: RowChangeDiff[];
  parsedData: Record<string, any>;
  targetRecordId?: string;
  targetVersionNo?: number;
}

export interface BulkImportPreviewSummary {
  jobId: string;
  entityType: BulkImportEntityType;
  importMode: BulkImportMode;
  fileName: string;
  fileChecksum: string;
  templateVersion: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createRows: number;
  updateRows: number;
  unchangedRows: number;
  conflictRows: number;
  canCommit: boolean;
  rows: BulkImportPreviewRow[];
}

export interface BulkImportCommitResult {
  jobId: string;
  status: BulkImportStatus;
  entityType: BulkImportEntityType;
  importMode: BulkImportMode;
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  unchangedRows: number;
  failedRows: number;
  durationMs: number;
  committedAt: string;
}

export interface BulkImportJobSummary {
  jobId: string;
  entityType: BulkImportEntityType;
  importMode: BulkImportMode;
  status: BulkImportStatus;
  fileName: string;
  fileChecksum: string;
  templateVersion: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createRows: number;
  updateRows: number;
  unchangedRows: number;
  conflictRows: number;
  errorSummary?: string;
  committedAt?: string;
  createdBy: string;
  createdByUsername: string;
  createdAt: string;
  updatedAt: string;
}

// Bulk Import Hooks
export function useDownloadImportTemplate() {
  return useMutation({
    mutationFn: (entityType: BulkImportEntityType) =>
      apiClient.downloadBlob(`/catalog/import/templates/${entityType}`),
  });
}

export function usePreviewImport() {
  return useMutation({
    mutationFn: (formData: FormData) =>
      apiClient.post<BulkImportPreviewSummary>('/catalog/import/preview', formData),
  });
}

export function useCommitImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      apiClient.post<BulkImportCommitResult>('/catalog/import/commit', { jobId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'models'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'parts'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'import-history'] });
    },
  });
}

export function useDownloadImportReport() {
  return useMutation({
    mutationFn: (jobId: string) =>
      apiClient.downloadBlob(`/catalog/import/report/${jobId}`),
  });
}

export function useImportHistory(entityType?: BulkImportEntityType) {
  return useQuery({
    queryKey: ['catalog', 'import-history', entityType],
    queryFn: () =>
      apiClient.get<BulkImportJobSummary[]>(
        entityType ? `/catalog/import/history?entityType=${entityType}` : '/catalog/import/history'
      ),
  });
}

