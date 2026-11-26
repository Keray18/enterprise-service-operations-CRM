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
  tokenHash?: string;
  rating?: number; // 1 to 5 (Overall Service Rating)
  techRating?: number; // 1 to 5 (Technician Professionalism)
  repairRating?: number; // 1 to 5 (Repair Satisfaction)
  issueResolved?: 'Y' | 'N';
  feedbackRemarks?: string;
  qualityAnalysis?: string;
  status: 'PENDING' | 'SUBMITTED' | 'EXPIRED';
  invitedAt: Date;
  submittedAt?: Date;
  expiresAt?: Date;
  submittedBy?: string;
  submittedByUsername?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PublicFeedbackSummary {
  feedbackId: string;
  jobNumber: string;
  productName: string;
  brandName: string;
  serviceDate: string;
  status: 'PENDING' | 'SUBMITTED' | 'EXPIRED';
  isExpired: boolean;
  alreadySubmitted: boolean;
}

export interface SubmitPublicFeedbackInput {
  overallRating: number; // 1-5
  techRating: number; // 1-5
  repairRating: number; // 1-5
  issueResolved: 'Y' | 'N';
  comments?: string;
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

export type ReplacementRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'OPEN'
  | 'PENDING_QUOTATION'
  | 'QUOTATION_APPROVED'
  | 'CUSTOMER_DECLINED'
  | 'PENDING_STOCK'
  | 'STOCK_RESERVED'
  | 'DISPATCHED_TO_ASF'
  | 'RECEIVED_AT_ASF'
  | 'HANDED_OVER_TO_ENGINEER'
  | 'APPOINTMENT_SCHEDULED'
  | 'TECHNICIAN_CHECKED_IN'
  | 'INSTALLATION_VERIFIED'
  | 'CLOSED';

export interface ReplacementRequestRecord {
  replacementId: string;
  requestId: string;
  /** Quotation version (independent of appointment version); bumped on every revision. */
  quotationVersion?: number;
  /** Version the customer approved; dispatch requires it to equal quotationVersion. */
  approvedQuotationVersion?: number;
  requiredPartCode?: string;
  requiredPartName?: string;
  /** Responsible Service Center (the linked complaint's assigned ASF). */
  assignedLocationId?: string;
  jobNumber?: string;
  customerPhone?: string;
  reasonCode: ReplacementReasonCode;
  reasonDescription: string;
  technicianRemarks?: string;
  status: ReplacementRequestStatus;
  approvalNumber?: string;
  requestedBy: string;
  requestedByUsername?: string;
  requestedAt: Date;
  reviewedBy?: string;
  reviewedByUsername?: string;
  reviewedAt?: Date;
  reviewRemarks?: string;
  requiredPartId?: string;
  warrantyType?: 'IN_WARRANTY' | 'OUT_OF_WARRANTY';
  quotationAmount?: number;
  quotationStatus?: 'NOT_REQUIRED' | 'PENDING_CUSTOMER_APPROVAL' | 'APPROVED' | 'DECLINED';
  quotationApprovedAt?: Date;
  quotationRejectedAt?: Date;
  quotationRejectionReason?: string;
  stockStatus?: 'ALLOCATED' | 'PENDING_STOCK';
  allocatedLocationId?: string;
  dispatchId?: string;
  assignedEngineerId?: string;
  assignedEngineerName?: string;
  appointmentSlot?: Date;
  appointmentVersion?: number;
  closedAt?: Date;
  closedBy?: string;
  updatedAt?: Date;
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
  outcome?: 'COMPLETED' | 'ESCALATED';
  escalationReason?: string;
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


