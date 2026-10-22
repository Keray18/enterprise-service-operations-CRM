/**
 * Unified Job 360, Diagnostics & Repair Operations API Client & Hooks
 * Phase 2B: Enterprise After-Sales Service CRM
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './apiClient';
import { ServiceRequest } from './callCenterApi';

// ==========================================
// TYPES
// ==========================================

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

export interface EngineeringMasters {
  faults: FaultRecord[];
  defects: DefectRecord[];
  repairCodes: RepairCodeRecord[];
}

export type PartEntryType = 'USED' | 'REQUIRED_PNA' | 'REQUIRED_SPECIAL_ESTIMATE';
export type PartEntryStatus = 'COMMITTED' | 'PENDING_FULFILLMENT' | 'CANCELLED';

export interface ServiceRequestPart {
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
  createdAt: string;
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

export interface ServiceRequestAttachment {
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
  uploadedAt: string;
}

export type RepairOutcomeAction =
  | 'REPAIRED_WITHOUT_PART'
  | 'REPAIRED_WITH_PART'
  | 'REPAIRED_WITH_CONSUMABLE'
  | 'PENDING_SPARE_PART'
  | 'PENDING_SPECIAL_PART_ESTIMATE'
  | 'REQUEST_REPLACEMENT'
  | 'REQUEST_CANCELLATION';

export interface RecordDiagnosisPayload {
  voeDescription: string;
  faultId: string;
  defectId?: string;
  observations?: string;
  physicalSerialVerified?: boolean;
}

export interface RecordRepairPayload {
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

export interface AddPartPayload {
  partId: string;
  quantity: number;
  entryType?: PartEntryType;
  isChargeableToCustomer?: boolean;
  partConsumptionNo?: string;
  defectiveSerialNo?: string;
  newPartSerialNo?: string;
  remarks?: string;
}

export interface SpecialPartEstimatePayload {
  estimateAmount: number;
  remarks?: string;
}

export interface CustomerEstimateDecisionPayload {
  decision: 'APPROVED' | 'REJECTED';
  customerRemarks?: string;
}

export interface Job360DetailResponse {
  serviceRequest: ServiceRequest & {
    faultId?: string;
    faultCode?: string;
    faultDescription?: string;
    defectId?: string;
    defectCode?: string;
    defectDescription?: string;
    repairCodeId?: string;
    repairCode?: string;
    repairCodeAction?: string;
    voeDescription?: string;
    observations?: string;
    repairAction?: string;
    repairRemarks?: string;
    repairAt?: string;
    diagnosedAt?: string;
    diagnosedBy?: string;
    diagnosedByName?: string;
    repairedAt?: string;
    repairedBy?: string;
    repairedByName?: string;
    replacementReason?: string;
    replacementRemarks?: string;
    cancellationReason?: string;
    cancellationRemarks?: string;
    specialPartEstimateRemarks?: string;
    specialPartEstimateAmount?: number;
    specialPartApprovedAt?: string;
    specialPartApprovedBy?: string;
    laborCharge: number;
    partsTotalCharge: number;
    totalEstimateAmount: number;
    appointmentDate?: string;
    appointmentSlot?: string;
    assignedEngineerName?: string;
    assignedEngineerPhone?: string;
    assignedLocationName?: string;
    replacementApprovalNo?: string;
    closedAt?: string;
    closedBy?: string;
    cancelledAt?: string;
    cancelledBy?: string;
    supervisorOverrideReason?: string;
  };
  verification: {
    isCheckedIn: boolean;
    checkedInAt?: string;
    checkInAttempts: number;
    regeneratedCount: number;
    happyCodeRegeneratedCount?: number;
    happyCodeAttempts?: number;
    isHappyCodeVerified?: boolean;
    happyCodeVerifiedAt?: string;
  };
  parts: ServiceRequestPart[];
  attachments: ServiceRequestAttachment[];
  events: Array<{
    eventId: string;
    requestId: string;
    fromState: string;
    toState: string;
    eventType: string;
    triggeredByUsername: string;
    triggeredByRole: string;
    remarks?: string;
    metadataJson?: string;
    createdAt: string;
  }>;
  notifications: Array<{
    notificationId: string;
    channel: string;
    recipient: string;
    templateCode: string;
    status: string;
    attempts: number;
    createdAt: string;
    sentAt?: string;
  }>;
  feedback?: CustomerFeedbackRecord | null;
  replacementRequest?: ReplacementRequestRecord | null;
  cancellationRequest?: CancellationRequestRecord | null;
  warehouse?: {
    reservations: Array<{
      reservationId: string;
      partEntryId: string;
      locationId: string;
      partId: string;
      quantity: number;
      status: string;
      reservedAt: string;
      releasedAt?: string;
      releaseReason?: string;
    }>;
    dispatches: Array<{
      dispatchId: string;
      dispatchNumber: string;
      challanNumber: string;
      fromLocationId: string;
      toLocationId: string;
      dispatchMode: string;
      transporterName?: string;
      docketNo?: string;
      subtotalTaxable: number;
      totalAmount: number;
      status: string;
      dispatchedAt: string;
      acknowledgedAt?: string;
    }>;
  };
  availableActions: {
    canCheckIn: boolean;
    canDiagnose: boolean;
    canRecordRepair: boolean;
    canAddParts: boolean;
    canUploadAttachments: boolean;
    canProvideEstimate: boolean;
    canDecideEstimate: boolean;
    canInitiateClosure?: boolean;
    canVerifyHappyCode?: boolean;
    canRegenerateHappyCode?: boolean;
    canSubmitFeedback?: boolean;
    canRequestReplacement?: boolean;
    canReviewReplacement?: boolean;
    canRequestCancellation?: boolean;
    canReviewCancellation?: boolean;
    canFulfillPart?: boolean;
  };
}

export type ReplacementReasonCode =
  | 'REASON_1'
  | 'REASON_2'
  | 'REASON_3'
  | 'REASON_4'
  | 'REASON_5'
  | 'REASON_6';

export const REPLACEMENT_REASON_LABELS: Record<ReplacementReasonCode, string> = {
  REASON_1: 'Spare part not received / service not completed within 168 Hours (7 Days)',
  REASON_2: 'New piece damaged out of the box (Dead on Arrival / DOA)',
  REASON_3: 'Customer refused repair due to recurring product quality failure',
  REASON_4: 'Product model discontinued by brand manufacturer and spare parts unavailable',
  REASON_5: 'Product non-repairable (severe electrical burnout or unserviceable structural damage)',
  REASON_6: 'Complaint not acknowledged by assigned ASF within 48 hours (debited to ASF)',
};

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
  requestedAt: string;
  reviewedBy?: string;
  reviewedByUsername?: string;
  reviewedAt?: string;
  reviewRemarks?: string;
}

export type CancellationReasonCode =
  | 'REASON_1'
  | 'REASON_2'
  | 'REASON_3';

export const CANCELLATION_REASON_LABELS: Record<CancellationReasonCode, string> = {
  REASON_1: 'Customer not contactable (minimum 3 documented call attempts across 48 hours)',
  REASON_2: 'Product is Out of Warranty, and customer refuses to pay standard labor service charge',
  REASON_3: 'Product is Under Warranty, but damaged component is excluded and customer refuses to pay for spare part',
};

export interface CancellationRequestRecord {
  cancellationId: string;
  requestId: string;
  reasonCode: CancellationReasonCode;
  reasonDescription: string;
  remarks?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: string;
  requestedByUsername?: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewedByUsername?: string;
  reviewedAt?: string;
  reviewRemarks?: string;
}

export interface CustomerFeedbackRecord {
  feedbackId: string;
  requestId: string;
  rating: number;
  feedbackRemarks?: string;
  qualityAnalysis?: string;
  submittedBy?: string;
  submittedAt: string;
}

export interface InitiateClosurePayload {
  remarks?: string;
}

export interface VerifyHappyCodePayload {
  happyCode?: string;
  isSupervisorOverride?: boolean;
  overrideReason?: string;
  feedback?: {
    rating: number;
    feedbackRemarks?: string;
    qualityAnalysis?: string;
  };
}

export interface SubmitFeedbackPayload {
  rating: number;
  feedbackRemarks?: string;
  qualityAnalysis?: string;
}

export interface CreateReplacementPayload {
  reasonCode: ReplacementReasonCode;
  technicianRemarks?: string;
}

export interface ReviewReplacementPayload {
  decision: 'APPROVED' | 'REJECTED';
  reviewRemarks?: string;
}

export interface CreateCancellationPayload {
  reasonCode: CancellationReasonCode;
  remarks?: string;
}

export interface ReviewCancellationPayload {
  decision: 'APPROVED' | 'REJECTED';
  reviewRemarks?: string;
}

// ==========================================
// API CLIENT FUNCTIONS
// ==========================================

export const job360Api = {
  getJob360: async (idOrJobNumber: string): Promise<Job360DetailResponse> => {
    return apiClient.get<Job360DetailResponse>(`/api/v1/asf/jobs/${encodeURIComponent(idOrJobNumber)}`);
  },

  getEngineeringMasters: async (brandId?: string, productId?: string): Promise<EngineeringMasters> => {
    const params = new URLSearchParams();
    if (brandId) params.append('brandId', brandId);
    if (productId) params.append('productId', productId);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<EngineeringMasters>(`/api/v1/asf/masters/engineering${queryStr}`);
  },

  recordDiagnosis: async (
    requestId: string,
    payload: RecordDiagnosisPayload
  ): Promise<Job360DetailResponse['serviceRequest']> => {
    return apiClient.post<Job360DetailResponse['serviceRequest']>(
      `/api/v1/asf/jobs/${encodeURIComponent(requestId)}/diagnosis`,
      payload
    );
  },

  recordRepair: async (
    requestId: string,
    payload: RecordRepairPayload
  ): Promise<Job360DetailResponse['serviceRequest']> => {
    return apiClient.post<Job360DetailResponse['serviceRequest']>(
      `/api/v1/asf/jobs/${encodeURIComponent(requestId)}/repair`,
      payload
    );
  },

  addPart: async (
    requestId: string,
    payload: AddPartPayload
  ): Promise<{ partEntryId: string; partsTotalCharge: number }> => {
    return apiClient.post<{ partEntryId: string; partsTotalCharge: number }>(
      `/api/v1/asf/jobs/${encodeURIComponent(requestId)}/parts`,
      payload
    );
  },

  removePart: async (
    requestId: string,
    partEntryId: string
  ): Promise<{ success: boolean; partsTotalCharge: number }> => {
    return apiClient.delete<{ success: boolean; partsTotalCharge: number }>(
      `/api/v1/asf/jobs/${encodeURIComponent(requestId)}/parts/${encodeURIComponent(partEntryId)}`
    );
  },

  provideSpecialPartEstimate: async (
    requestId: string,
    payload: SpecialPartEstimatePayload
  ): Promise<Job360DetailResponse['serviceRequest']> => {
    return apiClient.post<Job360DetailResponse['serviceRequest']>(
      `/api/v1/asf/jobs/${encodeURIComponent(requestId)}/special-part-estimate`,
      payload
    );
  },

  customerEstimateDecision: async (
    requestId: string,
    payload: CustomerEstimateDecisionPayload
  ): Promise<Job360DetailResponse['serviceRequest']> => {
    return apiClient.post<Job360DetailResponse['serviceRequest']>(
      `/api/v1/asf/jobs/${encodeURIComponent(requestId)}/customer-estimate-decision`,
      payload
    );
  },

  uploadAttachment: async (
    requestId: string,
    attachmentType: AttachmentType,
    file: File
  ): Promise<ServiceRequestAttachment> => {
    const formData = new FormData();
    formData.append('attachmentType', attachmentType);
    formData.append('file', file);
    return apiClient.post<ServiceRequestAttachment>(
      `/api/v1/asf/jobs/${encodeURIComponent(requestId)}/attachments`,
      formData
    );
  },

  deleteAttachment: async (attachmentId: string): Promise<{ success: boolean }> => {
    return apiClient.delete<{ success: boolean }>(`/api/v1/asf/attachments/${encodeURIComponent(attachmentId)}`);
  },

  getAttachmentStreamUrl: (attachmentId: string): string => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
    return `${baseUrl}/api/v1/asf/attachments/${encodeURIComponent(attachmentId)}/stream`;
  },

  // ==========================================
  // Phase 2C: Closure, Feedback, Replacement & Cancellation
  // ==========================================

  initiateClosure: async (
    requestId: string,
    payload: InitiateClosurePayload
  ): Promise<{ success: boolean; message: string; status: string }> => {
    return apiClient.post<{ success: boolean; message: string; status: string }>(
      `/api/v1/asf/jobs/${encodeURIComponent(requestId)}/closure/initiate`,
      payload
    );
  },

  regenerateHappyCode: async (
    requestId: string
  ): Promise<{ success: boolean; message: string }> => {
    return apiClient.post<{ success: boolean; message: string }>(
      `/api/v1/asf/jobs/${encodeURIComponent(requestId)}/closure/regenerate-happy-code`,
      {}
    );
  },

  verifyHappyCode: async (
    requestId: string,
    payload: VerifyHappyCodePayload
  ): Promise<{ success: boolean; message: string; status: string }> => {
    return apiClient.post<{ success: boolean; message: string; status: string }>(
      `/api/v1/asf/jobs/${encodeURIComponent(requestId)}/closure/verify`,
      payload
    );
  },

  submitFeedback: async (
    requestId: string,
    payload: SubmitFeedbackPayload
  ): Promise<{ success: boolean; message: string }> => {
    return apiClient.post<{ success: boolean; message: string }>(
      `/api/v1/asf/jobs/${encodeURIComponent(requestId)}/feedback`,
      payload
    );
  },

  requestReplacement: async (
    requestId: string,
    payload: CreateReplacementPayload
  ): Promise<{ success: boolean; message: string; status: string; replacementId: string }> => {
    return apiClient.post<{ success: boolean; message: string; status: string; replacementId: string }>(
      `/api/v1/asf/jobs/${encodeURIComponent(requestId)}/replacement`,
      payload
    );
  },

  reviewReplacement: async (
    replacementId: string,
    payload: ReviewReplacementPayload
  ): Promise<{ success: boolean; decision: string; status: string; approvalNumber?: string }> => {
    return apiClient.post<{ success: boolean; decision: string; status: string; approvalNumber?: string }>(
      `/api/v1/asf/replacements/${encodeURIComponent(replacementId)}/review`,
      payload
    );
  },

  requestCancellation: async (
    requestId: string,
    payload: CreateCancellationPayload
  ): Promise<{ success: boolean; message: string; status: string; cancellationId: string }> => {
    return apiClient.post<{ success: boolean; message: string; status: string; cancellationId: string }>(
      `/api/v1/asf/jobs/${encodeURIComponent(requestId)}/cancellation`,
      payload
    );
  },

  reviewCancellation: async (
    cancellationId: string,
    payload: ReviewCancellationPayload
  ): Promise<{ success: boolean; decision: string; status: string }> => {
    return apiClient.post<{ success: boolean; decision: string; status: string }>(
      `/api/v1/asf/cancellations/${encodeURIComponent(cancellationId)}/review`,
      payload
    );
  },
};

// ==========================================
// TANSTACK QUERY HOOKS
// ==========================================

export function useJob360(idOrJobNumber: string) {
  return useQuery({
    queryKey: ['job360', idOrJobNumber],
    queryFn: () => job360Api.getJob360(idOrJobNumber),
    enabled: Boolean(idOrJobNumber),
    staleTime: 15_000,
  });
}

export function useEngineeringMasters(brandId?: string, productId?: string) {
  return useQuery({
    queryKey: ['engineeringMasters', brandId, productId],
    queryFn: () => job360Api.getEngineeringMasters(brandId, productId),
    staleTime: 5 * 60_000, // 5 min cache
  });
}

export function useRecordDiagnosis(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RecordDiagnosisPayload) => job360Api.recordDiagnosis(requestId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job360', requestId] });
      queryClient.invalidateQueries({ queryKey: ['asfQueue'] });
    },
  });
}

export function useRecordRepair(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RecordRepairPayload) => job360Api.recordRepair(requestId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job360', requestId] });
      queryClient.invalidateQueries({ queryKey: ['asfQueue'] });
    },
  });
}

export function useAddPart(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddPartPayload) => job360Api.addPart(requestId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job360', requestId] });
    },
  });
}

export function useRemovePart(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (partEntryId: string) => job360Api.removePart(requestId, partEntryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job360', requestId] });
    },
  });
}

export function useProvideSpecialPartEstimate(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SpecialPartEstimatePayload) =>
      job360Api.provideSpecialPartEstimate(requestId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job360', requestId] });
      queryClient.invalidateQueries({ queryKey: ['asfQueue'] });
    },
  });
}

export function useCustomerEstimateDecision(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CustomerEstimateDecisionPayload) =>
      job360Api.customerEstimateDecision(requestId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job360', requestId] });
      queryClient.invalidateQueries({ queryKey: ['asfQueue'] });
    },
  });
}

export function useUploadAttachment(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ attachmentType, file }: { attachmentType: AttachmentType; file: File }) =>
      job360Api.uploadAttachment(requestId, attachmentType, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job360', requestId] });
    },
  });
}

export function useDeleteAttachment(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) => job360Api.deleteAttachment(attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job360', requestId] });
    },
  });
}

// ==========================================
// Phase 2C Hooks: Closure, Feedback, Replacement & Cancellation
// ==========================================

export function useInitiateClosure(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: InitiateClosurePayload) => job360Api.initiateClosure(requestId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job360', requestId] });
      queryClient.invalidateQueries({ queryKey: ['asfQueue'] });
    },
  });
}

export function useRegenerateHappyCode(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => job360Api.regenerateHappyCode(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job360', requestId] });
    },
  });
}

export function useVerifyHappyCode(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: VerifyHappyCodePayload) => job360Api.verifyHappyCode(requestId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job360', requestId] });
      queryClient.invalidateQueries({ queryKey: ['asfQueue'] });
    },
  });
}

export function useSubmitFeedback(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitFeedbackPayload) => job360Api.submitFeedback(requestId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job360', requestId] });
    },
  });
}

export function useRequestReplacement(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateReplacementPayload) => job360Api.requestReplacement(requestId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job360', requestId] });
      queryClient.invalidateQueries({ queryKey: ['asfQueue'] });
    },
  });
}

export function useReviewReplacement(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ replacementId, payload }: { replacementId: string; payload: ReviewReplacementPayload }) =>
      job360Api.reviewReplacement(replacementId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job360', requestId] });
      queryClient.invalidateQueries({ queryKey: ['asfQueue'] });
    },
  });
}

export function useRequestCancellation(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCancellationPayload) => job360Api.requestCancellation(requestId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job360', requestId] });
      queryClient.invalidateQueries({ queryKey: ['asfQueue'] });
    },
  });
}

export function useReviewCancellation(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cancellationId, payload }: { cancellationId: string; payload: ReviewCancellationPayload }) =>
      job360Api.reviewCancellation(cancellationId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job360', requestId] });
      queryClient.invalidateQueries({ queryKey: ['asfQueue'] });
    },
  });
}
