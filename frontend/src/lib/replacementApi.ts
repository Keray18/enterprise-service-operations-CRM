/**
 * Replacement fulfilment & physical custody API (Warehouse -> ASF -> Engineer -> Customer).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './apiClient';

export type CaptureMethod = 'SCANNER' | 'MANUAL';
export interface BarcodeCapture {
  barcode: string;
  captureMethod: CaptureMethod;
}

export interface Replacement {
  replacementId: string;
  requestId: string;
  jobNumber?: string;
  customerPhone?: string;
  reasonCode: string;
  reasonDescription: string;
  status: string;
  requiredPartId?: string;
  requiredPartCode?: string;
  requiredPartName?: string;
  warrantyType?: 'IN_WARRANTY' | 'OUT_OF_WARRANTY';
  quotationAmount?: number;
  quotationStatus?: string;
  quotationVersion?: number;
  approvedQuotationVersion?: number;
  stockStatus?: string;
  allocatedLocationId?: string;
  assignedLocationId?: string;
  assignedEngineerId?: string;
  assignedEngineerName?: string;
  appointmentSlot?: string;
  appointmentVersion?: number;
  requestedAt: string;
  updatedAt?: string;
  closedAt?: string;
  handoverId?: string;
  handoverStatus?: string;
}

export interface CustodyEvent {
  eventId: string;
  eventType: string;
  custodianType: string;
  locationName?: string;
  custodianName?: string;
  scannedBarcode?: string;
  captureMethod?: CaptureMethod;
  actorUsername?: string;
  actorRole: string;
  remarks?: string;
  createdAt: string;
}

export interface CustodyTimeline {
  replacement: Replacement;
  handovers: Array<{ handoverId: string; engineerId: string; engineerName?: string; status: string; handedOverAt: string; collectedAt?: string }>;
  events: CustodyEvent[];
  installation: null | {
    installationId: string;
    installedPartCode: string;
    serialNumber?: string;
    engineerName?: string;
    installedAt: string;
    captureMethod?: CaptureMethod;
    remarks?: string;
  };
}

export interface EscalatedComplaint {
  requestId: string;
  jobNumber: string;
  customerName?: string;
  productName?: string;
  modelName?: string;
  warrantyStatus?: string;
  escalationReason?: string;
  assignedEngineerName?: string;
  escalatedAt?: string;
}

export type ReplacementScope = 'asf' | 'warehouse' | 'engineer';

const listPath: Record<ReplacementScope, string> = {
  asf: '/api/v1/asf/replacements',
  warehouse: '/api/v1/warehouse/replacements',
  engineer: '/api/v1/engineer/replacements',
};

export function useReplacements(scope: ReplacementScope, params: { status?: string; search?: string; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: ['replacements', scope, params],
    queryFn: async () => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && q.set(k, String(v)));
      const res = await apiClient.get<{ items: Replacement[]; total?: number }>(`${listPath[scope]}${q.toString() ? `?${q}` : ''}`);
      return { items: res.items || [], total: res.total ?? (res.items || []).length };
    },
    placeholderData: keepPreviousData,
  });
}

export function useEscalatedComplaints(enabled: boolean) {
  return useQuery({
    queryKey: ['replacements', 'escalated'],
    enabled,
    queryFn: async () => {
      const res = await apiClient.get<{ items: EscalatedComplaint[]; total: number }>('/api/v1/asf/queue?status=REPAIR_ESCALATED&limit=50');
      return res.items || [];
    },
  });
}

export function useCustodyTimeline(scope: ReplacementScope, replacementId: string | null) {
  return useQuery({
    queryKey: ['replacements', 'custody', scope, replacementId],
    enabled: Boolean(replacementId),
    queryFn: () =>
      apiClient.get<CustodyTimeline>(`/api/v1/${scope === 'asf' ? 'asf' : scope}/replacements/${encodeURIComponent(replacementId!)}/custody`),
  });
}

export function useInstallationPhotos(scope: 'asf' | 'engineer', replacementId: string | null) {
  return useQuery({
    queryKey: ['replacements', 'photos', scope, replacementId],
    enabled: Boolean(replacementId),
    queryFn: async () =>
      (await apiClient.get<{ items: Array<{ attachmentId: string; originalName: string; uploadedAt: string }> }>(
        `/api/v1/${scope}/replacements/${encodeURIComponent(replacementId!)}/photos`
      )).items,
  });
}

function enc(id: string) {
  return encodeURIComponent(id);
}

export function useReplacementActions() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ['replacements'] });
  const useAction = <V,>(fn: (v: V) => Promise<unknown>) => useMutation({ mutationFn: fn, onSuccess: done });
  return {
    acceptEscalation: useAction((v: { requestId: string; reasonCode: string; requiredPartId: string; warrantyType: string; quotationAmount?: number; technicianRemarks?: string }) =>
      apiClient.post(`/api/v1/asf/jobs/${enc(v.requestId)}/accept-escalation`, {
        reasonCode: v.reasonCode,
        requiredPartId: v.requiredPartId,
        warrantyType: v.warrantyType,
        quotationAmount: v.quotationAmount,
        technicianRemarks: v.technicianRemarks,
      })
    ),
    prepareQuotation: useAction((v: { id: string; amount: number; remarks?: string }) =>
      apiClient.post(`/api/v1/asf/replacements/${enc(v.id)}/quotation`, { amount: v.amount, remarks: v.remarks })
    ),
    quotationDecision: useAction((v: { id: string; decision: 'APPROVED' | 'DECLINED'; quotationVersion: number; reason?: string }) =>
      apiClient.post(`/api/v1/asf/replacements/${enc(v.id)}/quotation/decision`, v)
    ),
    acknowledgeReceipt: useAction((v: { id: string; remarks?: string } & BarcodeCapture) =>
      apiClient.post(`/api/v1/asf/replacements/${enc(v.id)}/acknowledge-receipt`, v)
    ),
    schedule: useAction((v: { id: string; engineerId: string; appointmentDate: string; appointmentSlot: string }) =>
      apiClient.post(`/api/v1/asf/replacements/${enc(v.id)}/schedule`, v)
    ),
    handover: useAction((v: { id: string; partId: string; engineerId: string; remarks?: string }) =>
      apiClient.post(`/api/v1/asf/replacements/${enc(v.id)}/handover`, v)
    ),
    resendArrivalCode: useAction((v: { id: string }) => apiClient.post(`/api/v1/asf/replacements/${enc(v.id)}/regenerate-arrival-code`, {})),
    allocate: useAction((v: { id: string; warehouseId: string }) => apiClient.post(`/api/v1/warehouse/replacements/${enc(v.id)}/allocate`, { warehouseId: v.warehouseId })),
    dispatch: useAction((v: { id: string; courierName: string; docketNumber: string; remarks?: string } & BarcodeCapture) =>
      apiClient.post(`/api/v1/warehouse/replacements/${enc(v.id)}/dispatch`, v)
    ),
    close: useAction((v: { id: string }) => apiClient.post(`/api/v1/warehouse/replacements/${enc(v.id)}/close`, {})),
    collect: useAction((v: { handoverId: string; remarks?: string } & BarcodeCapture) => apiClient.post('/api/v1/engineer/custody/acknowledge', v)),
    verifyArrival: useAction((v: { id: string; happyCode: string }) =>
      apiClient.post(`/api/v1/engineer/replacements/${enc(v.id)}/verify-arrival`, { happyCode: v.happyCode })
    ),
    completeInstallation: useAction(
      (v: { id: string; completionCode: string; installedPartCode: string; captureMethod: CaptureMethod; targetSerialNo?: string; remarks?: string }) =>
        apiClient.post(`/api/v1/engineer/replacements/${enc(v.id)}/complete-installation`, v)
    ),
    uploadPhoto: useAction((v: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append('file', v.file);
      return apiClient.post(`/api/v1/engineer/replacements/${enc(v.id)}/photos`, fd);
    }),
  };
}

export const REPLACEMENT_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  PENDING_QUOTATION: 'Awaiting customer quotation decision',
  QUOTATION_APPROVED: 'Quotation approved',
  CUSTOMER_DECLINED: 'Customer declined',
  PENDING_STOCK: 'Pending stock (7–10 business days)',
  STOCK_RESERVED: 'Stock reserved',
  DISPATCHED_TO_ASF: 'In transit to Service Center',
  RECEIVED_AT_ASF: 'Received at Service Center',
  APPOINTMENT_SCHEDULED: 'Installation scheduled',
  HANDED_OVER_TO_ENGINEER: 'Collected by engineer',
  TECHNICIAN_CHECKED_IN: 'Engineer on site',
  INSTALLATION_VERIFIED: 'Installed — awaiting closure',
  CLOSED: 'Closed',
};
