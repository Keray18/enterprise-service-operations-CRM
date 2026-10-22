import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiClient } from '../src/lib/apiClient';

describe('Phase 3 Warehouse & Inventory Logistics Frontend API Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Warehouse Dashboard & Stock Balances', () => {
    it('fetches warehouse dashboard summary with KPIs and recent records', async () => {
      const mockDashboard = {
        kpis: {
          totalStockOnHand: 150,
          totalStockReserved: 10,
          totalStockInTransit: 5,
          totalStockDefective: 3,
          lowStockPartCount: 2,
          pendingPartRequestCount: 4,
          dispatchesPendingArrival: 1,
        },
        locations: [
          {
            locationId: 'loc-wh-01',
            locationCode: 'WH-CENTRAL',
            locationName: 'Central Logistics Warehouse',
            partyType: 'CENTRAL_WAREHOUSE',
          },
        ],
        recentDispatches: [],
        recentGrns: [],
      };

      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockDashboard);

      const res = await apiClient.get('/api/v1/warehouse/dashboard');

      expect(getSpy).toHaveBeenCalledWith('/api/v1/warehouse/dashboard');
      expect(res).toEqual(mockDashboard);
    });

    it('queries stock balances with location and low stock filters', async () => {
      const mockStockResult = {
        items: [
          {
            balanceId: 'bal-01',
            locationId: 'loc-wh-01',
            locationCode: 'WH-CENTRAL',
            locationName: 'Central Warehouse',
            partyType: 'CENTRAL_WAREHOUSE',
            partId: 'part-01',
            partCode: 'P01082',
            partName: 'Inverter AC Remote Controller',
            partCategory: 'ACCESSORY',
            unitPrice: 520,
            qtyOnHand: 40,
            qtyReserved: 5,
            qtyInTransit: 2,
            qtyDefective: 0,
            qtyAvailable: 35,
            reorderLevel: 10,
            versionNo: 1,
            createdAt: '2026-10-22T00:00:00Z',
            updatedAt: '2026-10-22T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };

      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockStockResult);

      const res = await apiClient.get('/api/v1/warehouse/stock?locationId=loc-wh-01&lowStockOnly=true&page=1&limit=20');

      expect(getSpy).toHaveBeenCalledWith(
        '/api/v1/warehouse/stock?locationId=loc-wh-01&lowStockOnly=true&page=1&limit=20'
      );
      expect(res).toEqual(mockStockResult);
    });
  });

  describe('2. Inbound Goods Receipt Notes (GRN)', () => {
    it('posts inbound GRN with line items and gate entry details', async () => {
      const mockGrnResponse = {
        grnId: 'grn-uuid-001',
        grnNumber: 'GRN-20261022-0001',
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockGrnResponse);

      const payload = {
        receivingLocationId: 'loc-wh-01',
        supplierName: 'Bharat Electronics Components Ltd',
        supplierInvoiceNo: 'INV-999',
        supplierInvoiceDate: '2026-10-22',
        poNumber: 'PO-2026-001',
        gateEntryNo: 'GE-042',
        vehicleNo: 'MH-04-AB-1234',
        remarks: 'Batch inspected at dock 2',
        items: [
          {
            partId: 'part-01',
            receivedQty: 25,
            acceptedQty: 20,
            rejectedQty: 5,
            unitPrice: 450,
            remarks: '5 damaged units rejected',
          },
        ],
      };

      const res = await apiClient.post('/api/v1/warehouse/grn', payload);

      expect(postSpy).toHaveBeenCalledWith('/api/v1/warehouse/grn', payload);
      expect(res).toEqual(mockGrnResponse);
    });
  });

  describe('3. Service Request Part Reservations', () => {
    it('posts job-linked part reservation', async () => {
      const mockReservationResponse = {
        reservationId: 'res-uuid-001',
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockReservationResponse);

      const payload = {
        requestId: 'sr-uuid-001',
        partEntryId: 'pe-uuid-001',
        locationId: 'loc-wh-01',
        partId: 'part-01',
        quantity: 2,
      };

      const res = await apiClient.post('/api/v1/warehouse/reservations', payload);

      expect(postSpy).toHaveBeenCalledWith('/api/v1/warehouse/reservations', payload);
      expect(res).toEqual(mockReservationResponse);
    });

    it('releases reservation with mandatory reason', async () => {
      const mockReleaseResponse = {
        success: true,
      };

      const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue(mockReleaseResponse);

      const res = await apiClient.delete('/api/v1/warehouse/reservations/res-uuid-001', {
        body: JSON.stringify({ reason: 'Part requirement removed by supervisor' }),
      });

      expect(deleteSpy).toHaveBeenCalledWith('/api/v1/warehouse/reservations/res-uuid-001', {
        body: JSON.stringify({ reason: 'Part requirement removed by supervisor' }),
      });
      expect(res).toEqual(mockReleaseResponse);
    });
  });

  describe('4. Outbound Dispatches & Delivery Challans', () => {
    it('posts stock dispatch generating GST Delivery Challan', async () => {
      const mockDispatchResponse = {
        dispatchId: 'disp-uuid-001',
        challanNumber: 'DC-20261022-0001',
        totalAmount: 1180,
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockDispatchResponse);

      const payload = {
        fromLocationId: 'loc-wh-01',
        toLocationId: 'loc-asf-01',
        requestId: 'sr-uuid-001',
        dispatchMode: 'COURIER',
        transporterName: 'BlueDart Express',
        docketNo: 'BD-89214710',
        items: [
          {
            partId: 'part-01',
            quantity: 2,
            unitPrice: 500,
          },
        ],
      };

      const res = await apiClient.post('/api/v1/warehouse/dispatches', payload);

      expect(postSpy).toHaveBeenCalledWith('/api/v1/warehouse/dispatches', payload);
      expect(res).toEqual(mockDispatchResponse);
    });

    it('acknowledges dispatch arrival and transfers in-transit stock', async () => {
      const mockAckResponse = {
        success: true,
        dispatchId: 'disp-uuid-001',
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockAckResponse);

      const res = await apiClient.post('/api/v1/warehouse/dispatches/disp-uuid-001/acknowledge', {});

      expect(postSpy).toHaveBeenCalledWith('/api/v1/warehouse/dispatches/disp-uuid-001/acknowledge', {});
      expect(res).toEqual(mockAckResponse);
    });
  });

  describe('5. Defective Part Returns & Quarantine Disposition', () => {
    it('posts defective part return inwarding into quarantine stock', async () => {
      const mockReturnResponse = {
        returnId: 'ret-uuid-001',
        returnNumber: 'RET-20261022-0001',
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockReturnResponse);

      const payload = {
        sourceLocationId: 'loc-asf-01',
        receivingLocationId: 'loc-wh-01',
        requestId: 'sr-uuid-001',
        items: [
          {
            partId: 'part-01',
            defectiveQty: 2,
            reason: 'FIELD_DEFECTIVE',
          },
        ],
      };

      const res = await apiClient.post('/api/v1/warehouse/returns', payload);

      expect(postSpy).toHaveBeenCalledWith('/api/v1/warehouse/returns', payload);
      expect(res).toEqual(mockReturnResponse);
    });

    it('posts disposition action (SCRAP) on quarantined defective items', async () => {
      const mockDispositionResponse = {
        returnId: 'ret-uuid-001',
        status: 'DISPOSITIONED',
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockDispositionResponse);

      const payload = {
        dispositions: [
          {
            returnItemId: 'item-uuid-001',
            action: 'SCRAP',
            quantity: 2,
            remarks: 'Non-repairable PCB burn scrap write-off',
          },
        ],
      };

      const res = await apiClient.post('/api/v1/warehouse/returns/ret-uuid-001/disposition', payload);

      expect(postSpy).toHaveBeenCalledWith('/api/v1/warehouse/returns/ret-uuid-001/disposition', payload);
      expect(res).toEqual(mockDispositionResponse);
    });
  });

  describe('6. Controlled Stock Adjustments & Reconciliation Engine', () => {
    it('posts controlled physical audit adjustment with mandatory remarks', async () => {
      const mockAdjustResponse = {
        adjustmentId: 'adj-uuid-001',
        adjustmentNumber: 'ADJ-20261022-0001',
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockAdjustResponse);

      const payload = {
        locationId: 'loc-wh-01',
        partId: 'part-01',
        stockBucket: 'ON_HAND',
        adjustmentType: 'INCREASE',
        quantity: 5,
        reason: 'PHYSICAL_AUDIT_SURPLUS',
        remarks: 'Physical audit annual surplus count',
      };

      const res = await apiClient.post('/api/v1/warehouse/adjustments', payload);

      expect(postSpy).toHaveBeenCalledWith('/api/v1/warehouse/adjustments', payload);
      expect(res).toEqual(mockAdjustResponse);
    });

    it('executes reconciliation check comparing cached balances with movement sum', async () => {
      const mockReconcileResult = {
        locationId: 'loc-wh-01',
        partId: 'part-01',
        onHand: {
          cached: 50,
          movementSum: 50,
          isBalanced: true,
          difference: 0,
        },
        reserved: {
          cached: 4,
          activeReservationSum: 4,
          isBalanced: true,
          difference: 0,
        },
        status: 'BALANCED',
      };

      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockReconcileResult);

      const res = await apiClient.get('/api/v1/warehouse/reconcile/loc-wh-01/part-01');

      expect(getSpy).toHaveBeenCalledWith('/api/v1/warehouse/reconcile/loc-wh-01/part-01');
      expect(res).toEqual(mockReconcileResult);
    });
  });

  describe('7. Immutable Double-Entry Movements Ledger', () => {
    it('queries movement ledger entries with filters', async () => {
      const mockMovementsResult = {
        items: [
          {
            movementId: 'mov-001',
            locationId: 'loc-wh-01',
            partId: 'part-01',
            movementType: 'GRN_RECEIPT',
            stockBucket: 'ON_HAND',
            quantity: 20,
            balanceBefore: 0,
            balanceAfter: 20,
            referenceType: 'GRN',
            referenceId: 'GRN-20261022-0001',
            actorUsername: 'wh_manager',
            remarks: 'Inbound GRN receipt',
            createdAt: '2026-10-22T09:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };

      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockMovementsResult);

      const res = await apiClient.get('/api/v1/warehouse/movements?locationId=loc-wh-01&stockBucket=ON_HAND&page=1&limit=20');

      expect(getSpy).toHaveBeenCalledWith(
        '/api/v1/warehouse/movements?locationId=loc-wh-01&stockBucket=ON_HAND&page=1&limit=20'
      );
      expect(res).toEqual(mockMovementsResult);
    });
  });
});
