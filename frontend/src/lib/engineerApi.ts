/**
 * Field Service Engineer API Client & TanStack Query Hooks
 * Dedicated workspace for mobile field service technicians
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './apiClient';
import { PaginatedResult } from './callCenterApi';
import { AsfQueueItem } from './asfApi';

export interface EngineerKpis {
  myActiveJobs: number;
  todayVisits: number;
  awaitingCheckIn: number;
  repairsInProgress: number;
  waitingParts: number;
  awaitingHappyCode: number;
}

export type EngineerJobTab =
  | 'today'
  | 'upcoming'
  | 'in_progress'
  | 'waiting_parts'
  | 'awaiting_closure'
  | 'completed'
  | 'all';

export interface EngineerJobsParams {
  tab?: EngineerJobTab;
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface CheckInPayload {
  requestId: string;
  checkInOtp: string;
  remarks?: string;
}

export const engineerApi = {
  getDashboard: async (): Promise<EngineerKpis> => {
    const res = await apiClient.get<any>('/api/v1/engineer/dashboard');
    return res.data || res;
  },

  getJobs: async (params: EngineerJobsParams = {}): Promise<PaginatedResult<AsfQueueItem>> => {
    const q = new URLSearchParams();
    if (params.tab) q.set('tab', params.tab);
    if (params.status) q.set('status', params.status);
    if (params.q) q.set('q', params.q);
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return apiClient.get<PaginatedResult<AsfQueueItem>>(`/api/v1/engineer/jobs${qs ? `?${qs}` : ''}`);
  },

  checkInWithOtp: async (payload: CheckInPayload): Promise<any> => {
    const { requestId, ...body } = payload;
    return apiClient.post(`/api/v1/asf/requests/${requestId}/check-in`, body);
  },
};

export function useEngineerDashboard() {
  return useQuery({
    queryKey: ['engineer', 'dashboard'],
    queryFn: () => engineerApi.getDashboard(),
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export function useEngineerJobs(params: EngineerJobsParams = {}) {
  return useQuery({
    queryKey: ['engineer', 'jobs', params],
    queryFn: () => engineerApi.getJobs(params),
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export function useEngineerCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: engineerApi.checkInWithOtp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engineer'] });
      queryClient.invalidateQueries({ queryKey: ['asf'] });
    },
  });
}
