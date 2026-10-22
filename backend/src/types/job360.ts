export interface FaultRecord {
  faultId: string;
  brandId?: string;
  productId?: string;
  faultCode: string;
  faultDescription: string;
  category: string;
  isActive: 'Y' | 'N';
}

export interface DefectRecord {
  defectId: string;
  brandId?: string;
  productId?: string;
  defectCode: string;
  defectDescription: string;
  isActive: 'Y' | 'N';
}

export interface RepairCodeRecord {
  repairCodeId: string;
  brandId?: string;
  productId?: string;
  repairCode: string;
  repairAction: string;
  isPartRequired: 'Y' | 'N';
  repairLevel: 'L1' | 'L2' | 'L3';
  isActive: 'Y' | 'N';
}

export interface EngineeringMastersResponse {
  faults: FaultRecord[];
  defects: DefectRecord[];
  repairCodes: RepairCodeRecord[];
}

export type PartEntryType = 'USED' | 'REQUIRED_PNA' | 'REQUIRED_SPECIAL_ESTIMATE';
export type PartEntryStatus = 'COMMITTED' | 'PENDING_FULFILLMENT' | 'CANCELLED';

export interface ServiceRequestPartRecord {
  partEntryId: string;
  requestId: string;
  partId: string;
  partCode: string;
  partName: string;
  hsnCode?: string;
  partCategory: 'SPARE' | 'CONSUMABLE' | 'ACCESSORY';
  quantity: number;
  partConsumptionNo?: string;
  defectiveSerialNo?: string;
  newPartSerialNo?: string;
  isChargeableToCustomer: 'Y' | 'N';
  unitPrice: number;
  totalPrice: number;
  entryType: PartEntryType;
  status: PartEntryStatus;
  pnaIndentNo?: string;
  remarks?: string;
  createdAt: Date;
  createdBy: string;
}

export type AttachmentType =
  | 'SERIAL_NUMBER_PLATE'
  | 'PART_FRONT'
  | 'PART_BACK'
  | 'PRODUCT_PHOTO'
  | 'SIGNED_JOBSHEET'
  | 'INVOICE_COPY'
  | 'REPLACEMENT_TAG'
  | 'OTHER_EVIDENCE';

export interface ServiceRequestAttachmentRecord {
  attachmentId: string;
  requestId: string;
  attachmentType: AttachmentType;
  fileName: string;
  originalName: string;
  storedPath: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256Checksum?: string;
  uploadedByUserId: string;
  uploadedByUsername: string;
  uploadedAt: Date;
}

export type RepairOutcomeAction =
  | 'REPAIRED_WITHOUT_PART'
  | 'REPAIRED_WITH_PART'
  | 'REPAIRED_WITH_CONSUMABLE'
  | 'PENDING_SPARE_PART'
  | 'PENDING_SPECIAL_PART_ESTIMATE'
  | 'REQUEST_REPLACEMENT'
  | 'REQUEST_CANCELLATION';

export interface RecordDiagnosisInput {
  voeDescription: string;
  faultId: string;
  defectId?: string;
  observations?: string;
  physicalSerialVerified?: boolean;
}

export interface RecordRepairInput {
  repairCodeId: string;
  repairAction: RepairOutcomeAction;
  repairRemarks?: string;
  repairAt?: 'ON_SITE' | 'IN_HOUSE';
  replacementReason?: string;
  replacementRemarks?: string;
  cancellationReason?: string;
  cancellationRemarks?: string;
  specialPartRemarks?: string;
}

export interface AddPartInput {
  partId: string;
  quantity: number;
  entryType?: PartEntryType;
  isChargeableToCustomer?: boolean;
  partConsumptionNo?: string;
  defectiveSerialNo?: string;
  newPartSerialNo?: string;
  remarks?: string;
}

export interface SpecialPartEstimateInput {
  estimateAmount: number;
  remarks?: string;
}

export interface CustomerEstimateDecisionInput {
  decision: 'APPROVED' | 'REJECTED';
  customerRemarks?: string;
}

// ==========================================
// Phase 2C Additions
// ==========================================

export interface CustomerFeedbackRecord {
  feedbackId: string;
  requestId: string;
  rating: number; // 1 to 5
  feedbackRemarks?: string;
  qualityAnalysis?: string;
  submittedBy?: string;
  submittedByUsername?: string;
  submittedAt: Date;
}

export interface SubmitFeedbackInput {
  rating: number;
  feedbackRemarks?: string;
  qualityAnalysis?: string;
}

export type ReplacementReasonCode =
  | 'REASON_1'
  | 'REASON_2'
  | 'REASON_3'
  | 'REASON_4'
  | 'REASON_5'
  | 'REASON_6';

export interface ReplacementRequestRecord {
  replacementId: string;
  requestId: string;
  reasonCode: ReplacementReasonCode;
  reasonDescription: string;
  technicianRemarks?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvalNumber?: string;
  requestedBy: string;
  requestedByUsername?: string;
  requestedAt: Date;
  reviewedBy?: string;
  reviewedByUsername?: string;
  reviewedAt?: Date;
  reviewRemarks?: string;
}

export interface CreateReplacementRequestInput {
  reasonCode: ReplacementReasonCode;
  technicianRemarks?: string;
}

export interface ReviewReplacementRequestInput {
  decision: 'APPROVED' | 'REJECTED';
  reviewRemarks?: string;
}

export type CancellationReasonCode =
  | 'REASON_1'
  | 'REASON_2'
  | 'REASON_3';

export interface CancellationRequestRecord {
  cancellationId: string;
  requestId: string;
  reasonCode: CancellationReasonCode;
  reasonDescription: string;
  remarks?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: string;
  requestedByUsername?: string;
  requestedAt: Date;
  reviewedBy?: string;
  reviewedByUsername?: string;
  reviewedAt?: Date;
  reviewRemarks?: string;
}

export interface CreateCancellationRequestInput {
  reasonCode: CancellationReasonCode;
  remarks?: string;
}

export interface ReviewCancellationRequestInput {
  decision: 'APPROVED' | 'REJECTED';
  reviewRemarks?: string;
}

export interface InitiateClosureInput {
  remarks?: string;
}

export interface VerifyHappyCodeInput {
  happyCode?: string;
  isSupervisorOverride?: boolean;
  overrideReason?: string;
  feedback?: {
    rating: number;
    feedbackRemarks?: string;
    qualityAnalysis?: string;
  };
}

export interface Job360DetailResponse {
  serviceRequest: any;
  verification: {
    isCheckedIn: boolean;
    checkedInAt?: Date;
    checkInAttempts: number;
    regeneratedCount: number;
    happyCodeRegeneratedCount: number;
    happyCodeAttempts: number;
    isHappyCodeVerified: boolean;
    happyCodeVerifiedAt?: Date;
  };
  parts: ServiceRequestPartRecord[];
  attachments: ServiceRequestAttachmentRecord[];
  events: any[];
  notifications: any[];
  feedback?: CustomerFeedbackRecord | null;
  replacementRequest?: ReplacementRequestRecord | null;
  cancellationRequest?: CancellationRequestRecord | null;
  warehouse?: {
    reservations: any[];
    dispatches: any[];
  };
  availableActions: {
    canCheckIn: boolean;
    canDiagnose: boolean;
    canRecordRepair: boolean;
    canAddParts: boolean;
    canUploadAttachments: boolean;
    canProvideEstimate: boolean;
    canDecideEstimate: boolean;
    canInitiateClosure: boolean;
    canRegenerateHappyCode: boolean;
    canVerifyHappyCode: boolean;
    canSubmitFeedback: boolean;
    canRequestReplacement: boolean;
    canApproveReplacement: boolean;
    canRequestCancellation: boolean;
    canApproveCancellation: boolean;
    canFulfillPart?: boolean;
  };
}


