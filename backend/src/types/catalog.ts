export interface BrandRecord {
  brandId: string;
  brandCode: string;
  brandName: string;
  logoUrl?: string;
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface ProductRecord {
  productId: string;
  productCode: string;
  productName: string;
  categoryFamily: string;
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface ModelRecord {
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
  releaseDate: Date;
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface ModelWithRelationsRecord extends ModelRecord {
  brandName: string;
  brandCode: string;
  productName: string;
  productCode: string;
  categoryFamily: string;
}

export interface HsnRecord {
  hsnId: string;
  hsnCode: string;
  chapterNo?: string;
  hsnDescription: string;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface PartRecord {
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
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface PartWithRelationsRecord extends PartRecord {
  brandName: string;
  brandCode: string;
  productName: string;
  productCode: string;
  categoryFamily: string;
  hsnCode: string;
  hsnDescription: string;
  igstRate: number;
}

export interface StateRecord {
  stateId: string;
  stateCode: string;
  stateName: string;
  zone: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'CENTRAL' | 'NORTH_EAST';
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface CityRecord {
  cityId: string;
  cityName: string;
  stateId: string;
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface CityWithRelationsRecord extends CityRecord {
  stateName: string;
  stateCode: string;
  zone: string;
}

export interface LocationRecord {
  locationId: string;
  locationCode: string;
  locationName: string;
  partyType: 'ASF' | 'CENTRAL_WAREHOUSE' | 'REGIONAL_WAREHOUSE' | 'DISTRIBUTOR' | 'HEAD_OFFICE';
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface PincodeRecord {
  pincodeId: string;
  pincode: string;
  stateId: string;
  cityId: string;
  defaultAsfId?: string;
  isServiceable: 'Y' | 'N';
  versionNo: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface PincodeWithRelationsRecord extends PincodeRecord {
  stateName: string;
  stateCode: string;
  cityName: string;
  defaultAsfCode?: string;
  defaultAsfName?: string;
}

export interface PincodeLookupResult {
  pincode: string;
  stateId: string;
  stateCode: string;
  stateName: string;
  cityId: string;
  cityName: string;
  isServiceable: 'Y' | 'N';
  defaultAsfId?: string;
  defaultAsfCode?: string;
  defaultAsfName?: string;
}

export interface CatalogAuditRecord {
  auditId: string;
  entityName: 'BRAND' | 'PRODUCT' | 'MODEL' | 'PART' | 'HSN' | 'STATE' | 'CITY' | 'PINCODE';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'ACTIVATE' | 'DEACTIVATE';
  performedBy: string;
  performedByUsername: string;
  changesJson?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
