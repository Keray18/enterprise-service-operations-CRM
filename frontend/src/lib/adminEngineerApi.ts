/**
 * Admin Field Engineer Management API Client & TanStack Query Hooks
 * Restricted to System Administrators
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './apiClient';

export interface AdminEngineerRecord {
  userId: string;
  username: string;
  fullName: string;
  phoneNumber?: string;
  email?: string;
  isActive: 'Y' | 'N';
  homeLocationId?: string;
  homeLocationCode?: string;
  homeLocationName?: string;
  openJobCount: number;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AdminEngineerQueryParams {
  q?: string;
  locationId?: string;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
  page?: number;
  limit?: number;
}

export interface AdminEngineerListResult {
  engineers: AdminEngineerRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateEngineerInput {
  fullName: string;
  username: string;
  phoneNumber: string;
  email?: string;
  homeLocationId: string;
  isActive?: 'Y' | 'N';
}

export interface CreateEngineerResponse {
  user: AdminEngineerRecord;
  temporaryPassword: string;
}

export const adminEngineerApi = {
  listEngineers: async (params: AdminEngineerQueryParams = {}): Promise<AdminEngineerListResult> => {
    const q = new URLSearchParams();
    if (params.q) q.set('q', params.q);
    if (params.locationId) q.set('locationId', params.locationId);
    if (params.status) q.set('status', params.status);
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return apiClient.get<AdminEngineerListResult>(`/api/v1/admin/engineers${qs ? `?${qs}` : ''}`);
  },

  createEngineer: async (input: CreateEngineerInput): Promise<CreateEngineerResponse> => {
    const res = await apiClient.post<any>('/api/v1/admin/engineers', input);
    return res.data || res;
  },

  updateStatus: async (payload: {
    userId: string;
    isActive: 'Y' | 'N';
    reassignToEngineerId?: string;
  }): Promise<any> => {
    const { userId, ...body } = payload;
    const res = await apiClient.patch<any>(`/api/v1/admin/engineers/${userId}/status`, body);
    return res.data || res;
  },

  resetPassword: async (userId: string): Promise<{ temporaryPassword: string }> => {
    const res = await apiClient.post<any>(`/api/v1/admin/engineers/${userId}/reset-password`, {});
    return res.data || res;
  },

  updateLocation: async (payload: { userId: string; homeLocationId: string }): Promise<any> => {
    const { userId, ...body } = payload;
    const res = await apiClient.patch<any>(`/api/v1/admin/engineers/${userId}/location`, body);
    return res.data || res;
  },

  getActiveJobs: async (userId: string): Promise<any[]> => {
    const res = await apiClient.get<any>(`/api/v1/admin/engineers/${userId}/active-jobs`);
    return res.data || res;
  },
};

export function useAdminEngineers(params: AdminEngineerQueryParams = {}) {
  return useQuery({
    queryKey: ['admin', 'engineers', params],
    queryFn: () => adminEngineerApi.listEngineers(params),
    staleTime: 15_000,
  });
}

export function useCreateEngineer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminEngineerApi.createEngineer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'engineers'] });
      queryClient.invalidateQueries({ queryKey: ['asf', 'engineers'] });
    },
  });
}

export function useUpdateEngineerStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminEngineerApi.updateStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'engineers'] });
      queryClient.invalidateQueries({ queryKey: ['asf', 'engineers'] });
    },
  });
}

export function useResetEngineerPassword() {
  return useMutation({
    mutationFn: adminEngineerApi.resetPassword,
  });
}

export function useUpdateEngineerLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminEngineerApi.updateLocation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'engineers'] });
      queryClient.invalidateQueries({ queryKey: ['asf', 'engineers'] });
    },
  });
}

export function useEngineerActiveJobs(userId: string | null) {
  return useQuery({
    queryKey: ['admin', 'engineers', userId, 'active-jobs'],
    queryFn: () => (userId ? adminEngineerApi.getActiveJobs(userId) : Promise.resolve([])),
    enabled: Boolean(userId),
    staleTime: 10_000,
  });
}
