/**
 * Warehouse & Inventory Logistics API Client & TanStack Query Hooks
 * Phase 3: Goods Receipts (GRN), Stock Balances, Reservations, Delivery Challans,
 * Defective Returns & Quarantine Disposition, Controlled Adjustments & Reconciliation.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './apiClient';

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface InventoryBalance {
  balanceId: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  partyType: string;
  partId: string;
  partCode: string;
  partName: string;
  partCategory: string;
  hsnCode?: string;
  unitPrice: number;
  qtyOnHand: number;
  qtyReserved: number;
  qtyInTransit: number;
  qtyDefective: number;
  qtyAvailable: number;
  reorderLevel: number;
  versionNo: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovement {
  movementId: string;
  locationId: string;
  locationCode?: string;
  locationName?: string;
  partId: string;
  partCode?: string;
  partName?: string;
  movementType: string;
  stockBucket: string;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  actorUserId?: string;
  actorUsername: string;
  remarks?: string;
  createdAt: string;
}

export interface InventoryReservation {
  reservationId: string;
  requestId: string;
  jobNumber?: string;
  complaintDescription?: string;
  partEntryId: string;
  locationId: string;
  locationName?: string;
  partId: string;
  partCode?: string;
  partName?: string;
  quantity: number;
  status: 'RESERVED' | 'FULFILLED' | 'CANCELLED' | 'RELEASED';
  reservedBy: string;
  reservedAt: string;
  releasedAt?: string;
  releaseReason?: string;
}

export interface GoodsReceiptItem {
  itemId: string;
  grnId: string;
  partId: string;
  partCode: string;
  partName: string;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  unitPrice: number;
  totalPrice: number;
  remarks?: string;
}

export interface GoodsReceipt {
  grnId: string;
  grnNumber: string;
  receivingLocationId: string;
  locationName?: string;
  supplierName: string;
  supplierInvoiceNo?: string;
  supplierInvoiceDate?: string;
  poNumber?: string;
  gateEntryNo?: string;
  vehicleNo?: string;
  receivedBy: string;
  receivedAt: string;
  remarks?: string;
  items?: GoodsReceiptItem[];
}

export interface DispatchItem {
  itemId: string;
  dispatchId: string;
  partId: string;
  partCode: string;
  partName: string;
  hsnCode?: string;
  quantity: number;
  unitPrice: number;
  taxableValue: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalAmount: number;
}

export interface StockDispatch {
  dispatchId: string;
  dispatchNumber: string;
  challanNumber: string;
  requestId?: string;
  jobNumber?: string;
  fromLocationId: string;
  fromLocationName?: string;
  toLocationId: string;
  toLocationName?: string;
  dispatchMode: 'HAND_DELIVERY' | 'COURIER' | 'LOGISTICS_TRUCK';
  transporterName?: string;
  docketNo?: string;
  ewayBillNo?: string;
  subtotalTaxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalAmount: number;
  status: 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  dispatchedBy: string;
  dispatchedAt: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  items?: DispatchItem[];
}

export interface StockReturnItem {
  itemId: string;
  returnId: string;
  partId: string;
  partCode: string;
  partName: string;
  defectiveQty: number;
  dispositionStatus: 'QUARANTINE' | 'RESTOCKED' | 'SCRAPPED' | 'RETURNED_TO_VENDOR';
  dispositionAction?: string;
  dispositionQty?: number;
  dispositionBy?: string;
  dispositionAt?: string;
  dispositionRemarks?: string;
  reason?: string;
}

export interface StockReturn {
  returnId: string;
  returnNumber: string;
  sourceLocationId: string;
  sourceLocationName?: string;
  receivingLocationId: string;
  receivingLocationName?: string;
  requestId?: string;
  jobNumber?: string;
  returnedBy: string;
  returnedAt: string;
  status: 'RECEIVED' | 'INSPECTED' | 'DISPOSITIONED';
  remarks?: string;
  items?: StockReturnItem[];
}

export interface StockAdjustment {
  adjustmentId: string;
  adjustmentNumber: string;
  locationId: string;
  locationName?: string;
  partId: string;
  partCode?: string;
  partName?: string;
  stockBucket: 'ON_HAND' | 'DEFECTIVE';
  adjustmentType: 'INCREASE' | 'DECREASE';
  quantity: number;
  reason: string;
  remarks: string;
  adjustedBy: string;
  adjustedAt: string;
}

export interface PendingJobPart {
  partEntryId: string;
  requestId: string;
  jobNumber: string;
  complaintDescription: string;
  assignedLocationId: string;
  assignedLocationName?: string;
  partId: string;
  partCode: string;
  partName: string;
  partCategory: string;
  customerPrice: number;
  locationPrice: number;
  quantity: number;
  entryType: string;
  status: string;
  availableStock: number;
  isReserved: boolean;
  reservationId?: string;
  requestedAt: string;
}

export interface WarehouseDashboardSummary {
  kpis: {
    totalStockOnHand: number;
    totalStockReserved: number;
    totalStockInTransit: number;
    totalStockDefective: number;
    lowStockPartCount: number;
    pendingPartRequestCount: number;
    dispatchesPendingArrival: number;
  };
  locations: Array<{
    locationId: string;
    locationCode: string;
    locationName: string;
    partyType: string;
  }>;
  recentDispatches: StockDispatch[];
  recentGrns: GoodsReceipt[];
}

export interface ReconcileResult {
  locationId: string;
  partId: string;
  onHand: {
    cached: number;
    movementSum: number;
    isBalanced: boolean;
    difference: number;
  };
  reserved: {
    cached: number;
    activeReservationSum: number;
    isBalanced: boolean;
    difference: number;
  };
  status: 'BALANCED' | 'DISCREPANCY_DETECTED';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ==========================================
// TANSTACK QUERY HOOKS
// ==========================================

export function useWarehouseDashboard() {
  return useQuery<WarehouseDashboardSummary>({
    queryKey: ['warehouse', 'dashboard'],
    queryFn: async () => {
      return apiClient.get<WarehouseDashboardSummary>('/api/v1/warehouse/dashboard');
    },
    staleTime: 30000,
  });
}

export function useStockBalances(params?: {
  locationId?: string;
  partId?: string;
  search?: string;
  lowStockOnly?: boolean;
  page?: number;
  limit?: number;
}) {
  return useQuery<PaginatedResult<InventoryBalance>>({
    queryKey: ['warehouse', 'stock', params],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params?.locationId) q.append('locationId', params.locationId);
      if (params?.partId) q.append('partId', params.partId);
      if (params?.search) q.append('search', params.search);
      if (params?.lowStockOnly) q.append('lowStockOnly', 'true');
      if (params?.page) q.append('page', params.page.toString());
      if (params?.limit) q.append('limit', params.limit.toString());
      return apiClient.get<PaginatedResult<InventoryBalance>>(`/api/v1/warehouse/stock?${q.toString()}`);
    },
    staleTime: 15000,
  });
}

export function usePendingJobParts(params?: { locationId?: string; page?: number; limit?: number }) {
  return useQuery<PaginatedResult<PendingJobPart>>({
    queryKey: ['warehouse', 'pending-job-parts', params],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params?.locationId) q.append('locationId', params.locationId);
      if (params?.page) q.append('page', params.page.toString());
      if (params?.limit) q.append('limit', params.limit.toString());
      return apiClient.get<PaginatedResult<PendingJobPart>>(`/api/v1/warehouse/pending-job-parts?${q.toString()}`);
    },
    staleTime: 10000,
  });
}

export function useReservations(params?: { locationId?: string; status?: string; page?: number; limit?: number }) {
  return useQuery<PaginatedResult<InventoryReservation>>({
    queryKey: ['warehouse', 'reservations', params],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params?.locationId) q.append('locationId', params.locationId);
      if (params?.status) q.append('status', params.status);
      if (params?.page) q.append('page', params.page.toString());
      if (params?.limit) q.append('limit', params.limit.toString());
      return apiClient.get<PaginatedResult<InventoryReservation>>(`/api/v1/warehouse/reservations?${q.toString()}`);
    },
  });
}

export function useReservePart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      requestId: string;
      partEntryId: string;
      locationId: string;
      partId: string;
      quantity: number;
    }) => {
      return apiClient.post<{ reservationId: string }>('/api/v1/warehouse/reservations', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse'] });
      queryClient.invalidateQueries({ queryKey: ['job360'] });
    },
  });
}

export function useReleaseReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ reservationId, reason }: { reservationId: string; reason: string }) => {
      return apiClient.delete<{ success: boolean }>(`/api/v1/warehouse/reservations/${reservationId}`, {
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse'] });
      queryClient.invalidateQueries({ queryKey: ['job360'] });
    },
  });
}

export function useGoodsReceipts(params?: { locationId?: string; search?: string; page?: number; limit?: number }) {
  return useQuery<PaginatedResult<GoodsReceipt>>({
    queryKey: ['warehouse', 'grn', params],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params?.locationId) q.append('locationId', params.locationId);
      if (params?.search) q.append('search', params.search);
      if (params?.page) q.append('page', params.page.toString());
      if (params?.limit) q.append('limit', params.limit.toString());
      return apiClient.get<PaginatedResult<GoodsReceipt>>(`/api/v1/warehouse/grn?${q.toString()}`);
    },
  });
}

export function useGoodsReceipt(grnId: string | null) {
  return useQuery<GoodsReceipt>({
    queryKey: ['warehouse', 'grn', grnId],
    queryFn: async () => {
      if (!grnId) throw new Error('GRN ID is required');
      return apiClient.get<GoodsReceipt>(`/api/v1/warehouse/grn/${grnId}`);
    },
    enabled: Boolean(grnId),
  });
}

export function useReceiveGrn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      receivingLocationId: string;
      supplierName: string;
      supplierInvoiceNo?: string;
      supplierInvoiceDate?: string;
      poNumber?: string;
      gateEntryNo?: string;
      vehicleNo?: string;
      remarks?: string;
      items: Array<{
        partId: string;
        receivedQty: number;
        acceptedQty: number;
        rejectedQty: number;
        unitPrice: number;
        remarks?: string;
      }>;
    }) => {
      return apiClient.post<{ grnId: string; grnNumber: string }>('/api/v1/warehouse/grn', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse'] });
    },
  });
}

export function useDispatches(params?: {
  fromLocationId?: string;
  toLocationId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery<PaginatedResult<StockDispatch>>({
    queryKey: ['warehouse', 'dispatches', params],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params?.fromLocationId) q.append('fromLocationId', params.fromLocationId);
      if (params?.toLocationId) q.append('toLocationId', params.toLocationId);
      if (params?.status) q.append('status', params.status);
      if (params?.page) q.append('page', params.page.toString());
      if (params?.limit) q.append('limit', params.limit.toString());
      return apiClient.get<PaginatedResult<StockDispatch>>(`/api/v1/warehouse/dispatches?${q.toString()}`);
    },
  });
}

export function useDispatch(dispatchId: string | null) {
  return useQuery<StockDispatch>({
    queryKey: ['warehouse', 'dispatches', dispatchId],
    queryFn: async () => {
      if (!dispatchId) throw new Error('Dispatch ID is required');
      return apiClient.get<StockDispatch>(`/api/v1/warehouse/dispatches/${dispatchId}`);
    },
    enabled: Boolean(dispatchId),
  });
}

export function useDispatchStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      fromLocationId: string;
      toLocationId: string;
      requestId?: string;
      dispatchMode: 'HAND_DELIVERY' | 'COURIER' | 'LOGISTICS_TRUCK';
      transporterName?: string;
      docketNo?: string;
      ewayBillNo?: string;
      items: Array<{
        partId: string;
        quantity: number;
        unitPrice: number;
      }>;
    }) => {
      return apiClient.post<{ dispatchId: string; challanNumber: string; totalAmount: number }>(
        '/api/v1/warehouse/dispatches',
        payload
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse'] });
      queryClient.invalidateQueries({ queryKey: ['job360'] });
    },
  });
}

export function useAcknowledgeDispatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dispatchId: string) => {
      return apiClient.post<{ success: boolean; dispatchId: string }>(
        `/api/v1/warehouse/dispatches/${dispatchId}/acknowledge`,
        {}
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse'] });
      queryClient.invalidateQueries({ queryKey: ['asf'] });
    },
  });
}

export function useStockReturns(params?: {
  receivingLocationId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery<PaginatedResult<StockReturn>>({
    queryKey: ['warehouse', 'returns', params],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params?.receivingLocationId) q.append('receivingLocationId', params.receivingLocationId);
      if (params?.status) q.append('status', params.status);
      if (params?.page) q.append('page', params.page.toString());
      if (params?.limit) q.append('limit', params.limit.toString());
      return apiClient.get<PaginatedResult<StockReturn>>(`/api/v1/warehouse/returns?${q.toString()}`);
    },
  });
}

export function useReceiveReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sourceLocationId: string;
      receivingLocationId: string;
      requestId?: string;
      remarks?: string;
      items: Array<{
        partId: string;
        defectiveQty: number;
        reason?: string;
      }>;
    }) => {
      return apiClient.post<{ returnId: string; returnNumber: string }>('/api/v1/warehouse/returns', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse'] });
    },
  });
}

export function useDispositionReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      returnId,
      dispositions,
    }: {
      returnId: string;
      dispositions: Array<{
        returnItemId: string;
        action: 'RESTOCK' | 'SCRAP' | 'RETURN_TO_VENDOR';
        quantity: number;
        remarks: string;
      }>;
    }) => {
      return apiClient.post<{ returnId: string; status: string }>(
        `/api/v1/warehouse/returns/${returnId}/disposition`,
        { dispositions }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse'] });
    },
  });
}

export function useStockAdjustments(params?: {
  locationId?: string;
  partId?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery<PaginatedResult<StockAdjustment>>({
    queryKey: ['warehouse', 'adjustments', params],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params?.locationId) q.append('locationId', params.locationId);
      if (params?.partId) q.append('partId', params.partId);
      if (params?.page) q.append('page', params.page.toString());
      if (params?.limit) q.append('limit', params.limit.toString());
      return apiClient.get<PaginatedResult<StockAdjustment>>(`/api/v1/warehouse/adjustments?${q.toString()}`);
    },
  });
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      locationId: string;
      partId: string;
      stockBucket: 'ON_HAND' | 'DEFECTIVE';
      adjustmentType: 'INCREASE' | 'DECREASE';
      quantity: number;
      reason: string;
      remarks: string;
    }) => {
      return apiClient.post<{ adjustmentId: string; adjustmentNumber: string }>('/api/v1/warehouse/adjustments', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse'] });
    },
  });
}

export function useReconcileStock(locationId?: string, partId?: string) {
  return useQuery<ReconcileResult>({
    queryKey: ['warehouse', 'reconcile', locationId, partId],
    queryFn: async () => {
      if (!locationId || !partId) throw new Error('Location ID and Part ID are required');
      return apiClient.get<ReconcileResult>(`/api/v1/warehouse/reconcile/${locationId}/${partId}`);
    },
    enabled: Boolean(locationId && partId),
  });
}

export function useInventoryMovements(params?: {
  locationId?: string;
  partId?: string;
  movementType?: string;
  stockBucket?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery<PaginatedResult<InventoryMovement>>({
    queryKey: ['warehouse', 'movements', params],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params?.locationId) q.append('locationId', params.locationId);
      if (params?.partId) q.append('partId', params.partId);
      if (params?.movementType) q.append('movementType', params.movementType);
      if (params?.stockBucket) q.append('stockBucket', params.stockBucket);
      if (params?.page) q.append('page', params.page.toString());
      if (params?.limit) q.append('limit', params.limit.toString());
      return apiClient.get<PaginatedResult<InventoryMovement>>(`/api/v1/warehouse/movements?${q.toString()}`);
    },
  });
}
