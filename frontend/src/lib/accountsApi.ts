/**
 * Account governance and provider monitoring API.
 *  - Provider Super Admin: /api/v1/super-admin/* (client Admin accounts, health, audit, config)
 *  - Client Admin:         /api/v1/admin/staff  (CALL_CENTER, ASF, ENGINEER, WAREHOUSE accounts)
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './apiClient';

export type AccountScope = 'super-admin' | 'staff';

export interface ManagedAccount {
  userId: string;
  username: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  locationId?: string;
  locationCode?: string;
  locationName?: string;
  roles: string[];
  isActive: 'Y' | 'N';
  mustChangePassword: 'Y' | 'N';
  lastLoginAt?: string;
  lockedUntil?: string;
  activeSessions: number;
  createdAt: string;
}

export interface AccountListResult {
  items: ManagedAccount[];
  total: number;
  page: number;
  limit: number;
  manageableRoles: string[];
}

export interface AccountListParams {
  search?: string;
  status?: 'Y' | 'N';
  role?: string;
  page?: number;
  limit?: number;
}

export interface ProvisionInput {
  role?: string;
  fullName: string;
  username: string;
  email: string;
  phoneNumber?: string;
  locationId?: string;
}

const basePath = (scope: AccountScope) => (scope === 'super-admin' ? '/api/v1/super-admin/admins' : '/api/v1/admin/staff');

function qs(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const accountsApi = {
  list: (scope: AccountScope, params: AccountListParams) => apiClient.get<AccountListResult>(`${basePath(scope)}${qs({ ...params })}`),
  create: (scope: AccountScope, input: ProvisionInput) =>
    apiClient.post<{ account: ManagedAccount; temporaryPassword: string }>(basePath(scope), input),
  update: (scope: AccountScope, id: string, input: Partial<Pick<ManagedAccount, 'fullName' | 'email' | 'phoneNumber' | 'locationId'>>) =>
    apiClient.patch<{ account: ManagedAccount }>(`${basePath(scope)}/${id}`, input),
  setStatus: (scope: AccountScope, id: string, isActive: 'Y' | 'N', reason?: string) =>
    apiClient.patch<{ account: ManagedAccount; revokedSessions: number }>(`${basePath(scope)}/${id}/status`, { isActive, reason }),
  resetCredentials: (scope: AccountScope, id: string) =>
    apiClient.post<{ account: ManagedAccount; temporaryPassword: string; revokedSessions: number }>(`${basePath(scope)}/${id}/reset-credentials`, {}),
  revokeSessions: (scope: AccountScope, id: string) =>
    apiClient.post<{ revokedSessions: number }>(`${basePath(scope)}/${id}/revoke-sessions`, {}),
};

export function useAccounts(scope: AccountScope, params: AccountListParams) {
  return useQuery({
    queryKey: ['accounts', scope, params],
    queryFn: () => accountsApi.list(scope, params),
    placeholderData: keepPreviousData,
  });
}

export function useAccountMutations(scope: AccountScope) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['accounts', scope] });
  return {
    create: useMutation({ mutationFn: (input: ProvisionInput) => accountsApi.create(scope, input), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: (v: { id: string; input: Parameters<typeof accountsApi.update>[2] }) => accountsApi.update(scope, v.id, v.input),
      onSuccess: invalidate,
    }),
    setStatus: useMutation({
      mutationFn: (v: { id: string; isActive: 'Y' | 'N'; reason?: string }) => accountsApi.setStatus(scope, v.id, v.isActive, v.reason),
      onSuccess: invalidate,
    }),
    resetCredentials: useMutation({ mutationFn: (id: string) => accountsApi.resetCredentials(scope, id), onSuccess: invalidate }),
    revokeSessions: useMutation({ mutationFn: (id: string) => accountsApi.revokeSessions(scope, id), onSuccess: invalidate }),
  };
}

// ---------------------------------------------------------------------------------------------
// Provider monitoring
// ---------------------------------------------------------------------------------------------

export interface WorkerStatus {
  key: string;
  label: string;
  state: 'NOT_RUNNING' | 'HEALTHY' | 'DEGRADED' | 'STALE';
  intervalMs: number | null;
  totalRuns: number;
  itemsProcessed: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
}

export interface NotificationSummary {
  countsByStatus: Record<string, number>;
  dueNow: number;
  scheduledFuture: number;
  failuresLast24h: number;
  stuckProcessing: number;
}

export interface ProviderHealth {
  application: {
    status: string;
    environment: string;
    nodeVersion: string;
    uptimeSeconds: number;
    memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
    checkedAt: string;
  };
  database: {
    connected: boolean;
    latencyMs: number | null;
    error?: string;
    pool: { connectionsOpen: number | null; connectionsInUse: number | null; poolMax: number } | null;
    migrations: { applied: number; pending: number; failed: number; missingSource: string[]; checksumMismatches: string[] } | null;
    schemaError?: string;
  };
  workers: { schedulerStartedAt: string | null; jobs: WorkerStatus[] };
  notifications: NotificationSummary | null;
}

export interface ProviderDashboard {
  accountsByRole: Array<{ role: string; total: number; active: number; pendingFirstLogin: number }>;
  activeSessions: number;
  lockedAccounts: number;
  audit: { totalEvents: number; failureEvents: number; eventsToday: number; recentActions: Array<{ action: string; count: number }> };
}

export interface NotificationFailure {
  notificationId: string;
  templateCode: string;
  channel: string;
  recipient: string;
  status: 'FAILED' | 'DEAD_LETTER';
  retryCount: number;
  errorMessage: string | null;
  nextRetryAt: string | null;
  jobNumber: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface AuditLog {
  eventId: string;
  actorId: string | null;
  actorRole: string | null;
  actorUsername: string | null;
  action: string;
  resource: string;
  recordIdentifier: string | null;
  outcome: 'SUCCESS' | 'FAILURE';
  correlationId: string | null;
  changes?: Record<string, unknown>;
  justification?: string;
  ipAddress?: string;
  createdAt: string;
}

export interface ProviderConfigItem {
  configKey: string;
  configValue: string;
  category: string;
  description?: string;
  isSensitive: 'Y' | 'N';
  updatedBy?: string;
  updatedAt: string;
  editable: boolean;
  rule?: { type: 'int'; min: number; max: number } | { type: 'boolean' };
}

export function useProviderDashboard() {
  return useQuery({ queryKey: ['super-admin', 'dashboard'], queryFn: () => apiClient.get<ProviderDashboard>('/api/v1/super-admin/dashboard'), refetchInterval: 60_000 });
}

export function useProviderHealth() {
  return useQuery({ queryKey: ['super-admin', 'health'], queryFn: () => apiClient.get<ProviderHealth>('/api/v1/super-admin/health'), refetchInterval: 30_000 });
}

export function useNotificationFailures(params: { status?: 'FAILED' | 'DEAD_LETTER'; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['super-admin', 'notification-failures', params],
    queryFn: () =>
      apiClient.get<{ total: number; page: number; limit: number; items: NotificationFailure[] }>(
        `/api/v1/super-admin/notifications/failures${qs(params)}`
      ),
    placeholderData: keepPreviousData,
  });
}

export function useAuditLogs(params: { action?: string; outcome?: string; search?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['super-admin', 'audit', params],
    queryFn: () =>
      apiClient.get<{ logs: AuditLog[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
        `/api/v1/super-admin/audit-logs${qs(params)}`
      ),
    placeholderData: keepPreviousData,
  });
}

export function useProviderConfig() {
  return useQuery({ queryKey: ['super-admin', 'config'], queryFn: () => apiClient.get<{ items: ProviderConfigItem[] }>('/api/v1/super-admin/config') });
}

export function useUpdateProviderConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { key: string; value: string }) =>
      apiClient.patch<{ config: ProviderConfigItem }>(`/api/v1/super-admin/config/${encodeURIComponent(v.key)}`, { value: v.value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['super-admin', 'config'] }),
  });
}
