/**
 * Authorized Service Franchise (ASF) API Client & TanStack Query Hooks
 * Phase 2A: ASF Operations, SLA Monitoring, Dispatch & OTP Check-In
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './apiClient';
import { PaginatedResult, ServiceRequest } from './callCenterApi';

// ==========================================
// TYPES
// ==========================================

export interface SlaTimerStatus {
  isBreached: boolean;
  remainingHours: number;
  remainingMinutes: number;
  percentElapsed: number;
  status: 'NORMAL' | 'WARNING' | 'BREACHED' | 'ACKNOWLEDGED';
}

export interface AsfQueueItem extends ServiceRequest {
  slaStatus: SlaTimerStatus;
  slaBreached48h: 'Y' | 'N';
  slaBreached48hAt?: string;
  acknowledgedAt?: string;
  appointmentDate?: string;
  appointmentSlot?: 'MORNING' | 'AFTERNOON' | 'EVENING';
  travelDistanceKm?: number;
  areaType?: 'URBAN' | 'RURAL';
  checkedInAt?: string;
  assignedEngineerName?: string;
  assignedEngineerPhone?: string;
}

export interface EligibleEngineer {
  userId: string;
  username: string;
  fullName: string;
  phoneNumber?: string;
}

export interface DispatchComplaintPayload {
  requestId: string;
  engineerId: string;
  appointmentDate: string; // YYYY-MM-DD
  appointmentSlot: 'MORNING' | 'AFTERNOON' | 'EVENING';
  travelDistanceKm?: number;
  areaType?: 'URBAN' | 'RURAL';
  remarks?: string;
}

export interface DispatchComplaintResponse {
  requestId: string;
  jobNumber: string;
  status: string;
  appointmentDate: string;
  appointmentSlot: string;
  assignedEngineerId: string;
  assignedEngineerName?: string;
  otpExpiresAt: string;
  smsQueued: boolean;
  message: string;
}

export interface CheckInComplaintPayload {
  requestId: string;
  otp: string; // 6-digit string
  checkInLatitude?: number;
  checkInLongitude?: number;
  remarks?: string;
}

export interface CheckInComplaintResponse {
  requestId: string;
  jobNumber: string;
  status: string;
  checkedInAt: string;
  verifiedByEngineerId: string;
  message: string;
}

export interface RegenerateOtpPayload {
  requestId: string;
  reason?: string;
}

export interface RegenerateOtpResponse {
  requestId: string;
  jobNumber: string;
  otpExpiresAt: string;
  smsQueued: boolean;
  message: string;
}

export interface SlaEvaluationResult {
  evaluatedCount: number;
  newBreachesCount: number;
  breachedRequestIds: string[];
}

export interface AsfQueueFilters {
  view?: 'all' | 'unacknowledged' | 'ready_to_assign' | 'scheduled' | 'checked_in' | 'overdue';
  locationId?: string;
  q?: string;
  page?: number;
  limit?: number;
}

// ==========================================
// API CLIENT FUNCTIONS
// ==========================================

export const asfApi = {
  getQueue: async (filters: AsfQueueFilters = {}): Promise<PaginatedResult<AsfQueueItem>> => {
    const query = new URLSearchParams();
    if (filters.view) query.set('view', filters.view);
    if (filters.locationId) query.set('locationId', filters.locationId);
    if (filters.q) query.set('q', filters.q);
    if (filters.page) query.set('page', String(filters.page));
    if (filters.limit) query.set('limit', String(filters.limit));

    const qs = query.toString();
    return apiClient.get<PaginatedResult<AsfQueueItem>>(`/api/v1/asf/queue${qs ? `?${qs}` : ''}`);
  },

  getEligibleEngineers: async (locationId: string): Promise<EligibleEngineer[]> => {
    return apiClient.get<EligibleEngineer[]>(`/api/v1/asf/engineers/${locationId}`);
  },

  getEngineerJobs: async (params?: { page?: number; limit?: number; status?: string }): Promise<PaginatedResult<AsfQueueItem>> => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status) query.set('status', params.status);

    const qs = query.toString();
    return apiClient.get<PaginatedResult<AsfQueueItem>>(`/api/v1/asf/engineer-jobs${qs ? `?${qs}` : ''}`);
  },

  dispatchComplaint: async (payload: DispatchComplaintPayload): Promise<DispatchComplaintResponse> => {
    const { requestId, ...body } = payload;
    return apiClient.post<DispatchComplaintResponse>(`/api/v1/asf/requests/${requestId}/dispatch`, body);
  },

  checkInWithOtp: async (payload: CheckInComplaintPayload): Promise<CheckInComplaintResponse> => {
    const { requestId, ...body } = payload;
    return apiClient.post<CheckInComplaintResponse>(`/api/v1/asf/requests/${requestId}/check-in`, body);
  },

  regenerateOtp: async (payload: RegenerateOtpPayload): Promise<RegenerateOtpResponse> => {
    const { requestId, ...body } = payload;
    return apiClient.post<RegenerateOtpResponse>(`/api/v1/asf/requests/${requestId}/regenerate-otp`, body);
  },

  evaluateSla: async (): Promise<SlaEvaluationResult> => {
    return apiClient.post<SlaEvaluationResult>('/api/v1/asf/sla/evaluate', {});
  },
};

// ==========================================
// TANSTACK QUERY HOOKS
// ==========================================

export function useAsfQueue(filters: AsfQueueFilters = {}) {
  return useQuery({
    queryKey: ['asf', 'queue', filters],
    queryFn: () => asfApi.getQueue(filters),
    staleTime: 15_000,
    refetchInterval: 30_000, // Background polling for live queue updates
  });
}

export function useEligibleEngineers(locationId?: string) {
  return useQuery({
    queryKey: ['asf', 'engineers', locationId],
    queryFn: () => asfApi.getEligibleEngineers(locationId!),
    enabled: Boolean(locationId),
    staleTime: 60_000,
  });
}

export function useEngineerJobs(params?: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: ['asf', 'engineer-jobs', params],
    queryFn: () => asfApi.getEngineerJobs(params),
    staleTime: 15_000,
  });
}

export function useDispatchComplaint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: asfApi.dispatchComplaint,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asf'] });
    },
  });
}

export function useCheckInComplaint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: asfApi.checkInWithOtp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asf'] });
    },
  });
}

export function useRegenerateOtp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: asfApi.regenerateOtp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asf'] });
    },
  });
}

export function useEvaluateSla() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: asfApi.evaluateSla,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asf'] });
    },
  });
}
