/**
 * Call Center & Customer Intake API Client and TanStack Query Hooks
 * Phase 1C: Fast Call Registration, Customer Lookup & Service Requests
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './apiClient';

// ==========================================
// TYPES
// ==========================================

export interface Customer {
  customerId: string;
  customerCode: string;
  fullName: string;
  primaryMobile: string;
  normalizedMobile: string;
  alternateMobile?: string;
  residencePhone?: string;
  email?: string;
  customerCategory: 'INDIVIDUAL' | 'COMMERCIAL' | 'CORPORATE';
  addressLine: string;
  landmark?: string;
  stateId: string;
  cityId: string;
  pincode: string;
  gstNumber?: string;
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  stateName?: string;
  stateCode?: string;
  cityName?: string;
}

export interface CustomerWithGeography extends Customer {
  stateName: string;
  stateCode: string;
  cityName: string;
}

export interface PincodeResolution {
  pincode: string;
  isServiceable: boolean;
  stateId: string;
  stateName: string;
  cityId: string;
  cityName: string;
  defaultAsfId?: string;
  defaultAsfName?: string;
  hasDefaultAsf: boolean;
  status: 'SERVICEABLE' | 'SERVICEABLE_NO_ASF' | 'NON_SERVICEABLE' | 'UNKNOWN';
}

export interface VOC {
  vocId: string;
  productId?: string;
  brandId?: string;
  vocCode: string;
  vocDescription: string;
  category: string;
  isActive: 'Y' | 'N';
}

export interface ServiceRequest {
  requestId: string;
  jobNumber: string;
  customerId: string;
  brandId: string;
  productId: string;
  modelId: string;
  serialNumber?: string;
  purchaseDate?: string;
  invoiceNo?: string;
  dealerName?: string;
  callType: 'REPAIR' | 'INSTALLATION' | 'DEMO' | 'MAINTENANCE';
  serviceType: 'ON_SITE' | 'CARRY_IN' | 'PICK_UP';
  status:
    | 'REGISTERED'
    | 'ASSIGNED_TO_ASF'
    | 'ACKNOWLEDGED'
    | 'APPOINTMENT_SCHEDULED'
    | 'TECHNICIAN_CHECKED_IN'
    | 'IN_PROGRESS_REPAIR'
    | 'PENDING_SPARE_PART'
    | 'PENDING_SPECIAL_PART_ESTIMATE'
    | 'SPECIAL_PART_ESTIMATE_PROVIDED'
    | 'REQUEST_FOR_REPLACEMENT'
    | 'REPLACEMENT_APPROVED'
    | 'REQUEST_FOR_CANCELLATION'
    | 'CALL_CLOSURE_SUBMITTED'
    | 'CLOSED'
    | 'CANCELLED'
    | 'REPLACED';
  warrantyStatus: 'IN_WARRANTY' | 'OUT_OF_WARRANTY' | 'UNDER_VERIFICATION' | 'AMC' | 'VOID';
  assignedLocationId?: string;
  assignedEngineerId?: string;
  vocId?: string;
  vocDescription?: string;
  problemDescription?: string;
  customerAddress?: string;
  customerPincode?: string;
  customerStateId?: string;
  customerCityId?: string;
  customerPhone?: string;
  registeredBy?: string;
  registeredByUsername?: string;
  registeredAt: string;
  sla48hExpiresAt?: string;
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  customerName: string;
  customerCode: string;
  brandName: string;
  brandCode: string;
  productName: string;
  productCode: string;
  modelName: string;
  modelCode: string;
  assignedLocationName?: string;
  stateName?: string;
  cityName?: string;
}

export interface ServiceRequestEvent {
  eventId: string;
  requestId: string;
  fromState: string;
  toState: string;
  eventType: string;
  triggeredByUserId: string;
  triggeredByUsername: string;
  triggeredByRole: string;
  remarks?: string;
  metadataJson?: string;
  createdAt: string;
}

export interface NotificationOutboxItem {
  notificationId: string;
  requestId?: string;
  channel: 'SMS' | 'EMAIL' | 'WHATSAPP';
  recipient: string;
  templateCode: string;
  messageBody: string;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  providerMessageId?: string;
  errorMessage?: string;
  retryCount: number;
  sentAt?: string;
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RegisterComplaintPayload {
  customerId?: string;
  newCustomer?: {
    fullName: string;
    primaryMobile: string;
    alternateMobile?: string;
    residencePhone?: string;
    email?: string;
    customerCategory: 'INDIVIDUAL' | 'COMMERCIAL' | 'CORPORATE';
    addressLine: string;
    landmark?: string;
    stateId: string;
    cityId: string;
    pincode: string;
    gstNumber?: string;
  };
  brandId: string;
  productId: string;
  modelId: string;
  serialNumber?: string;
  purchaseDate?: string;
  invoiceNo?: string;
  dealerName?: string;
  callType: 'REPAIR' | 'INSTALLATION' | 'DEMO' | 'MAINTENANCE';
  serviceType: 'ON_SITE' | 'CARRY_IN' | 'PICK_UP';
  vocId?: string;
  vocDescription?: string;
  problemDescription?: string;
  stateId: string;
  cityId: string;
  pincode: string;
  addressLine: string;
  idempotencyKey?: string;
}

export interface RegisterComplaintResponse {
  serviceRequest: ServiceRequest;
  customer: CustomerWithGeography;
  smsQueued: boolean;
}

// ==========================================
// API CLIENT FUNCTIONS
// ==========================================

export const callCenterApi = {
  // Customer Search
  searchCustomers: async (params: {
    mobile?: string;
    code?: string;
    name?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<CustomerWithGeography>> => {
    const query = new URLSearchParams();
    if (params.mobile) query.set('mobile', params.mobile);
    if (params.code) query.set('code', params.code);
    if (params.name) query.set('name', params.name);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));

    return apiClient.get<PaginatedResult<CustomerWithGeography>>(`/api/v1/customers/search?${query.toString()}`);
  },

  getCustomerById: async (id: string): Promise<CustomerWithGeography> => {
    return apiClient.get<CustomerWithGeography>(`/api/v1/customers/${id}`);
  },

  getCustomerRequests: async (customerId: string): Promise<ServiceRequest[]> => {
    return apiClient.get<ServiceRequest[]>(`/api/v1/customers/${customerId}/requests`);
  },

  // Serviceability & Geography
  resolvePincode: async (pincode: string): Promise<PincodeResolution> => {
    return apiClient.get<PincodeResolution>(`/api/v1/call-center/serviceability/${pincode}`);
  },

  // VOC Taxonomy
  listVOCs: async (productId?: string, brandId?: string): Promise<VOC[]> => {
    const query = new URLSearchParams();
    if (productId) query.set('productId', productId);
    if (brandId) query.set('brandId', brandId);
    const qs = query.toString();
    return apiClient.get<VOC[]>(`/api/v1/call-center/vocs${qs ? `?${qs}` : ''}`);
  },

  // Complaint Registration
  registerComplaint: async (payload: RegisterComplaintPayload): Promise<RegisterComplaintResponse> => {
    return apiClient.post<RegisterComplaintResponse>('/api/v1/call-center/complaints', payload);
  },

  // Service Request Search & Detail
  searchRequests: async (params: {
    q?: string;
    jobNumber?: string;
    mobile?: string;
    serialNumber?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<ServiceRequest>> => {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.jobNumber) query.set('jobNumber', params.jobNumber);
    if (params.mobile) query.set('mobile', params.mobile);
    if (params.serialNumber) query.set('serialNumber', params.serialNumber);
    if (params.status) query.set('status', params.status);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));

    return apiClient.get<PaginatedResult<ServiceRequest>>(`/api/v1/call-center/requests?${query.toString()}`);
  },

  getRecentRequests: async (limit = 10, status?: string): Promise<ServiceRequest[]> => {
    const query = new URLSearchParams();
    query.set('limit', String(limit));
    if (status) query.set('status', status);
    return apiClient.get<ServiceRequest[]>(`/api/v1/call-center/requests/recent?${query.toString()}`);
  },

  getRequestByJobNumber: async (jobNumber: string): Promise<ServiceRequest> => {
    return apiClient.get<ServiceRequest>(`/api/v1/call-center/requests/job/${encodeURIComponent(jobNumber)}`);
  },

  getRequestById: async (id: string): Promise<ServiceRequest> => {
    return apiClient.get<ServiceRequest>(`/api/v1/call-center/requests/${id}`);
  },

  getRequestEvents: async (id: string): Promise<ServiceRequestEvent[]> => {
    return apiClient.get<ServiceRequestEvent[]>(`/api/v1/call-center/requests/${id}/events`);
  },

  getRequestNotifications: async (id: string): Promise<NotificationOutboxItem[]> => {
    return apiClient.get<NotificationOutboxItem[]>(`/api/v1/call-center/requests/${id}/notifications`);
  },
};

// ==========================================
// REACT QUERY HOOKS
// ==========================================

export function useCustomerSearch(
  params: { mobile?: string; code?: string; name?: string; page?: number; limit?: number },
  enabled = true
) {
  return useQuery({
    queryKey: ['customers', 'search', params],
    queryFn: () => callCenterApi.searchCustomers(params),
    enabled: enabled && Boolean(params.mobile || params.code || params.name),
    staleTime: 30 * 1000,
  });
}

export function useCustomerById(id?: string) {
  return useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: () => callCenterApi.getCustomerById(id!),
    enabled: Boolean(id),
  });
}

export function useCustomerRequests(customerId?: string) {
  return useQuery({
    queryKey: ['customers', 'requests', customerId],
    queryFn: () => callCenterApi.getCustomerRequests(customerId!),
    enabled: Boolean(customerId),
  });
}

export function usePincodeServiceability(pincode?: string) {
  const clean = pincode?.trim() || '';
  return useQuery({
    queryKey: ['geography', 'serviceability', clean],
    queryFn: () => callCenterApi.resolvePincode(clean),
    enabled: /^\d{6}$/.test(clean),
    staleTime: 5 * 60 * 1000,
  });
}

export function useVOCList(productId?: string, brandId?: string) {
  return useQuery({
    queryKey: ['callCenter', 'vocs', productId, brandId],
    queryFn: () => callCenterApi.listVOCs(productId, brandId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecentRequests(limit = 10, status?: string) {
  return useQuery({
    queryKey: ['callCenter', 'recentRequests', limit, status],
    queryFn: () => callCenterApi.getRecentRequests(limit, status),
    staleTime: 10 * 1000,
  });
}

export function useSearchServiceRequests(params: {
  q?: string;
  jobNumber?: string;
  mobile?: string;
  serialNumber?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['callCenter', 'requests', params],
    queryFn: () => callCenterApi.searchRequests(params),
    staleTime: 15 * 1000,
  });
}

export function useServiceRequestByJobNumber(jobNumber?: string) {
  return useQuery({
    queryKey: ['callCenter', 'requestByJob', jobNumber],
    queryFn: () => callCenterApi.getRequestByJobNumber(jobNumber!),
    enabled: Boolean(jobNumber && jobNumber.trim()),
  });
}

export function useServiceRequestById(id?: string) {
  return useQuery({
    queryKey: ['callCenter', 'requestById', id],
    queryFn: () => callCenterApi.getRequestById(id!),
    enabled: Boolean(id),
  });
}

export function useServiceRequestEvents(requestId?: string) {
  return useQuery({
    queryKey: ['callCenter', 'requestEvents', requestId],
    queryFn: () => callCenterApi.getRequestEvents(requestId!),
    enabled: Boolean(requestId),
  });
}

export function useServiceRequestNotifications(requestId?: string) {
  return useQuery({
    queryKey: ['callCenter', 'requestNotifications', requestId],
    queryFn: () => callCenterApi.getRequestNotifications(requestId!),
    enabled: Boolean(requestId),
  });
}

export function useRegisterComplaint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegisterComplaintPayload) => callCenterApi.registerComplaint(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['callCenter', 'recentRequests'] });
      queryClient.invalidateQueries({ queryKey: ['callCenter', 'requests'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}
