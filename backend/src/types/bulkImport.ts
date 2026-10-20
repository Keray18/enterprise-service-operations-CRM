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

export interface ModelImportRowParsed {
  rowNumber: number;
  brandCode: string;
  productCode: string;
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
  releaseDate: string; // YYYY-MM-DD
  isActive: 'Y' | 'N';
}

export interface PartImportRowParsed {
  rowNumber: number;
  brandCode: string;
  productCode: string;
  partCode: string;
  vendorPartCode?: string;
  partName: string;
  partDescription?: string;
  hsnCode: string;
  partCategory: 'SPARE' | 'CONSUMABLE' | 'ACCESSORY';
  partFor?: string;
  customerPrice: number;
  locationPrice: number;
  faultyPartDispatchTo: string;
  warrantyDays: number;
  isActive: 'Y' | 'N';
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

export interface BulkImportJobRecord {
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
  previewPayload?: string;
  resultPayload?: string;
  errorSummary?: string;
  committedAt?: Date;
  createdBy: string;
  createdByUsername: string;
  createdAt: Date;
  updatedAt: Date;
}
