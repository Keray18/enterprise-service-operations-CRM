'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './apiClient';

export interface CallRegisterRow {
  requestId: string;
  jobNumber: string;
  customerName: string;
  customerPhone: string;
  customerCity?: string;
  customerState?: string;
  brandName: string;
  productName: string;
  modelName: string;
  serialNumber?: string;
  callType: string;
  status: string;
  assignedLocation?: string;
  assignedEngineer?: string;
  registeredAt: string;
  acknowledgedAt?: string;
  closedAt?: string;
  isHappyCodeVerified: 'Y' | 'N';
  tatHours?: number;
  slaBreached48h: 'Y' | 'N';
  slaBreached168h: 'Y' | 'N';
}

export interface PartConsumptionRow {
  partCode: string;
  partName: string;
  brandName: string;
  quantityConsumed: number;
  faultDescription?: string;
  defectDescription?: string;
  consumedAtLocation: string;
  totalCost: number;
}

export interface WarrantyClaimReportRow {
  claimNumber: string;
  claimPeriod: string;
  asfName: string;
  brandName?: string;
  totalJobsCount: number;
  grossLaborAmount: number;
  grossTravelAmount: number;
  penaltyDeductionAmount: number;
  netClaimAmount: number;
  status: string;
  submittedAt?: string;
  approvedAt?: string;
}

export interface StockValuationRow {
  locationName: string;
  locationType: string;
  partCode: string;
  partName: string;
  category: string;
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unitCostPrice: number;
  totalValuation: number;
  reconciledAt?: string;
}

export interface OperationalQueuesKpis {
  unacknowledgedCalls: number;
  pendingDiagnosis: number;
  inProgressRepairs: number;
  pendingSpareParts: number;
  pendingClosures: number;
  pendingSlaPenalties: number;
  pendingClaimAudits: number;
}

export interface NotificationMetrics {
  pendingCount: number;
  sentCount: number;
  failedCount: number;
  deadLetterCount: number;
  totalCount: number;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export function downloadReportCsv(endpoint: string, params: Record<string, any> = {}): void {
  const url = new URL(`${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`);
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      url.searchParams.append(key, String(val));
    }
  });

  // Use fetch to support cookie credentials and handle errors cleanly
  fetch(url.toString(), { credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) {
        let errorMsg = 'Failed to download export';
        try {
          const json = await res.json();
          errorMsg = json.message || errorMsg;
        } catch {
          // ignore json parse error
        }
        throw new Error(errorMsg);
      }
      return res.blob();
    })
    .then((blob) => {
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `report_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    })
    .catch((err) => {
      alert(`Export error: ${err.message}`);
    });
}

export function useCallRegisterReport(params: {
  fromDate?: string;
  toDate?: string;
  brandId?: string;
  locationId?: string;
  status?: string;
  callType?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ['reports', 'calls', params],
    queryFn: () => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          searchParams.append(k, String(v));
        }
      });
      return apiClient.get<CallRegisterRow[]>(`/api/v1/reports/calls?${searchParams.toString()}`);
    },
    staleTime: 30000,
  });
}

export function usePartConsumptionReport(params: {
  brandId?: string;
  locationId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['reports', 'parts-consumption', params],
    queryFn: () => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          searchParams.append(k, String(v));
        }
      });
      return apiClient.get<PartConsumptionRow[]>(`/api/v1/reports/parts-consumption?${searchParams.toString()}`);
    },
    staleTime: 30000,
  });
}

export function useWarrantyClaimsReport(params: {
  brandId?: string;
  asfLocationId?: string;
  claimYear?: number;
  claimMonth?: number;
  status?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['reports', 'warranty-claims', params],
    queryFn: () => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          searchParams.append(k, String(v));
        }
      });
      return apiClient.get<WarrantyClaimReportRow[]>(`/api/v1/reports/warranty-claims?${searchParams.toString()}`);
    },
    staleTime: 30000,
  });
}

export function useStockValuationReport(params: {
  locationId?: string;
  category?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['reports', 'stock-valuation', params],
    queryFn: () => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          searchParams.append(k, String(v));
        }
      });
      return apiClient.get<StockValuationRow[]>(`/api/v1/reports/stock-valuation?${searchParams.toString()}`);
    },
    staleTime: 30000,
  });
}

export function useOperationalQueues() {
  return useQuery({
    queryKey: ['reports', 'operational-queues'],
    queryFn: () => apiClient.get<OperationalQueuesKpis>('/api/v1/reports/operational-queues'),
    staleTime: 15000,
  });
}

export function useNotificationMetrics() {
  return useQuery({
    queryKey: ['reports', 'notifications-metrics'],
    queryFn: () => apiClient.get<NotificationMetrics>('/api/v1/reports/notifications/metrics'),
    staleTime: 15000,
  });
}

export function useRetryNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post('/api/v1/reports/notifications/retry'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'notifications-metrics'] });
    },
  });
}
