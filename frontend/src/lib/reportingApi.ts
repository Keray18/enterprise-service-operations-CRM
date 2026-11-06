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
  asfLocationName?: string;
  brandName?: string;
  totalJobsCount: number;
  grossLaborAmount: number | null;
  grossTravelAmount: number | null;
  penaltyDeductionAmount: number | null;
  netClaimAmount: number | null;
  status: string;
  submittedAt?: string;
  approvedAt?: string;
  journalNumber?: string;
  createdAt?: string;
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

export function useCallRegisterReport(
  params: {
    fromDate?: string;
    toDate?: string;
    brandId?: string;
    locationId?: string;
    status?: string;
    callType?: string;
    limit?: number;
    offset?: number;
  },
  options?: { enabled?: boolean }
) {
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
    enabled: options?.enabled ?? true,
    staleTime: 30000,
  });
}

export function usePartConsumptionReport(
  params: {
    brandId?: string;
    locationId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  },
  options?: { enabled?: boolean }
) {
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
    enabled: options?.enabled ?? true,
    staleTime: 30000,
  });
}

export function useWarrantyClaimsReport(
  params: {
    brandId?: string;
    asfLocationId?: string;
    claimYear?: number;
    claimMonth?: number;
    status?: string;
    limit?: number;
  },
  options?: { enabled?: boolean }
) {
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
    enabled: options?.enabled ?? true,
    staleTime: 30000,
  });
}

export function useStockValuationReport(
  params: {
    locationId?: string;
    category?: string;
    limit?: number;
  },
  options?: { enabled?: boolean }
) {
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
    enabled: options?.enabled ?? true,
    staleTime: 30000,
  });
}

export function useOperationalQueues(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['reports', 'operational-queues'],
    queryFn: () => apiClient.get<OperationalQueuesKpis>('/api/v1/reports/operational-queues'),
    enabled: options?.enabled ?? true,
    staleTime: 15000,
  });
}

export function useNotificationMetrics(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['reports', 'notifications-metrics'],
    queryFn: () => apiClient.get<NotificationMetrics>('/api/v1/reports/notifications/metrics'),
    enabled: options?.enabled ?? true,
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

export interface OperationalNetworkHealth {
  totalActiveServiceCenters: number;
  totalActiveTechnicians: number;
  assignedRequests: number;
  activeJobs: number;
  awaitingAck: number;
  openBacklog: number;
  pendingParts: number;
  todayAppointments: number;
  dispatchesAwaitingAck: number;
}

export interface ServiceCenterWorkloadItem {
  locationId: string;
  locationCode: string;
  locationName: string;
  assignedOpenJobs: number;
  awaitingAck: number;
  inProgress: number;
  pendingParts: number;
  completedInPeriod: number;
  overdueJobs: number;
  activeTechnicians: number;
  capacityConfigured: boolean;
  configuredCapacity: number | null;
}

export interface AdminDashboardData {
  period: {
    preset: string;
    fromDate: string;
    toDate: string;
  };
  operationalNetwork?: OperationalNetworkHealth;
  serviceCenterWorkload?: ServiceCenterWorkloadItem[];
  kpis: {
    totalInPeriod: number;
    openBacklog: number;
    awaitingAck: number;
    overdue48hAck: number;
    overdue168hResolution: number;
    closedInPeriod: number;
    pendingApprovals: number;
    pendingParts: number;
  };
  charts: {
    volumeTrend: Array<{ date: string; registered: number; closed: number }>;
    workflowDistribution: Array<{ status: string; count: number; percentage: number }>;
    slaCompliance: {
      ack48h: {
        totalEligible: number;
        onTime: number;
        breached: number;
        rate: number;
        inFlight?: number;
        totalRegistered?: number;
      };
      resolution168h: {
        totalClosed: number;
        onTime: number;
        breached: number;
        rate: number;
      };
    };
    agingBuckets: Array<{ bucket: string; count: number; percentage: number }>;
    topBrands: Array<{ brandName: string; count: number }>;
    topProducts: Array<{ productName: string; count: number }>;
    customerOutcomes: {
      happyCodeVerificationRate: number;
      avgResolutionTatHours: number;
      totalClosedWithTat: number;
    };
  };
  pendingActions: {
    overdueAckCount: number;
    overdueResolutionCount: number;
    pendingReplacementCount: number;
    pendingCancellationCount: number;
    pendingPnaCount: number;
    deadLetterNotificationCount: number;
    pendingClaimsAuditCount?: number;
    pendingSlaPenaltyCount?: number;
  };
  recentActivity: Array<{
    eventId: string;
    jobNumber: string;
    eventType: string;
    fromState: string;
    toState: string;
    triggeredByUsername: string;
    triggeredByRole: string;
    remarks?: string;
    createdAt: string;
  }>;
}

export function useAdminDashboard(
  params: {
    period?: string;
    fromDate?: string;
    toDate?: string;
  } = {}
) {
  return useQuery({
    queryKey: ['reports', 'admin-dashboard', params],
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (params.period) searchParams.append('period', params.period);
      if (params.fromDate) searchParams.append('fromDate', params.fromDate);
      if (params.toDate) searchParams.append('toDate', params.toDate);
      const queryStr = searchParams.toString();
      return apiClient.get<AdminDashboardData>(`/api/v1/reports/admin/dashboard${queryStr ? `?${queryStr}` : ''}`);
    },
    staleTime: 30000,
  });
}
