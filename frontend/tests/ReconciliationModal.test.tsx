import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReconciliationModal } from '../src/app/(workspace)/warehouse/components/ReconciliationModal';
import * as warehouseApi from '../src/lib/warehouseApi';

vi.mock('../src/lib/warehouseApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/warehouseApi')>();
  return {
    ...actual,
    useReconcileStock: vi.fn(),
  };
});

describe('ReconciliationModal Component Tests', () => {
  const mockBalance: warehouseApi.InventoryBalance = {
    balanceId: 'bal-001',
    locationId: 'loc-wh-01',
    locationCode: 'WH-CENTRAL',
    locationName: 'Central Logistics Warehouse',
    partyType: 'CENTRAL_WAREHOUSE',
    partId: 'part-01',
    partCode: 'PART-A',
    partName: 'Water Pump Assembly',
    partCategory: 'MECHANICAL',
    unitPrice: 1500,
    qtyOnHand: 50,
    qtyReserved: 10,
    qtyInTransit: 0,
    qtyDefective: 0,
    qtyAvailable: 40,
    reorderLevel: 5,
    versionNo: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state without evaluating unavailable nested properties or crashing', () => {
    vi.mocked(warehouseApi.useReconcileStock).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: true,
    } as any);

    render(
      <ReconciliationModal open={true} onClose={vi.fn()} balance={mockBalance} />
    );

    expect(
      screen.getByText(/Auditing movement ledger against live balance records\.\.\./i)
    ).toBeDefined();
    expect(screen.getByRole('progressbar')).toBeDefined();
  });

  it('renders complete balanced reconciliation response without runtime error', () => {
    const balancedResult: warehouseApi.ReconcileResult = {
      locationId: 'loc-wh-01',
      locationName: 'Central Logistics Warehouse',
      locationCode: 'WH-CENTRAL',
      partId: 'part-01',
      partCode: 'PART-A',
      partName: 'Water Pump Assembly',
      status: 'BALANCED',
      isReconciled: true,
      discrepanciesFound: false,
      lastCheckedAt: '2026-10-25T10:00:00.000Z',
      onHand: {
        cached: 50,
        movementSum: 50,
        difference: 0,
        isBalanced: true,
      },
      reserved: {
        cached: 10,
        activeReservationSum: 10,
        difference: 0,
        isBalanced: true,
      },
      cachedOnHand: 50,
      ledgerOnHand: 50,
      discrepancyOnHand: 0,
      cachedReserved: 10,
      activeReserved: 10,
      discrepancyReserved: 0,
    };

    vi.mocked(warehouseApi.useReconcileStock).mockReturnValue({
      data: balancedResult,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as any);

    render(
      <ReconciliationModal open={true} onClose={vi.fn()} balance={mockBalance} />
    );

    expect(screen.getByText('Stock Perfectly Balanced')).toBeDefined();
    expect(screen.getByText('PART-A — Water Pump Assembly')).toBeDefined();
    expect(screen.getAllByText('0 (Zero Variance)').length).toBeGreaterThanOrEqual(2);
  });

  it('renders discrepancy result with real variance and does not show balanced success state', () => {
    const discrepancyResult: warehouseApi.ReconcileResult = {
      locationId: 'loc-wh-01',
      locationName: 'Central Logistics Warehouse',
      locationCode: 'WH-CENTRAL',
      partId: 'part-01',
      partCode: 'PART-A',
      partName: 'Water Pump Assembly',
      status: 'DISCREPANCY_DETECTED',
      isReconciled: false,
      discrepanciesFound: true,
      lastCheckedAt: '2026-10-25T10:00:00.000Z',
      onHand: {
        cached: 50,
        movementSum: 53,
        difference: -3,
        isBalanced: false,
      },
      reserved: {
        cached: 10,
        activeReservationSum: 8,
        difference: 2,
        isBalanced: false,
      },
      cachedOnHand: 50,
      ledgerOnHand: 53,
      discrepancyOnHand: -3,
      cachedReserved: 10,
      activeReserved: 8,
      discrepancyReserved: 2,
    };

    vi.mocked(warehouseApi.useReconcileStock).mockReturnValue({
      data: discrepancyResult,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as any);

    render(
      <ReconciliationModal open={true} onClose={vi.fn()} balance={mockBalance} />
    );

    expect(screen.getByText(/Discrepancy Detected — Investigation Required/i)).toBeDefined();
    expect(screen.queryByText('Stock Perfectly Balanced')).toBeNull();
    expect(screen.getByText('-3')).toBeDefined();
    expect(screen.getByText('+2')).toBeDefined();
    expect(
      screen.getByText(/Reconciliation is an audit operation\. Stock balances and ledger records remain unchanged\./i)
    ).toBeDefined();
  });

  it('renders legitimate zero-quantity scope when warehouse inventory is confirmed empty', () => {
    const emptyResult: warehouseApi.ReconcileResult = {
      locationId: 'loc-wh-01',
      locationName: 'Central Logistics Warehouse',
      locationCode: 'WH-CENTRAL',
      partId: 'part-01',
      partCode: 'PART-A',
      partName: 'Water Pump Assembly',
      status: 'BALANCED',
      isReconciled: true,
      discrepanciesFound: false,
      lastCheckedAt: '2026-10-25T10:00:00.000Z',
      onHand: {
        cached: 0,
        movementSum: 0,
        difference: 0,
        isBalanced: true,
      },
      reserved: {
        cached: 0,
        activeReservationSum: 0,
        difference: 0,
        isBalanced: true,
      },
      cachedOnHand: 0,
      ledgerOnHand: 0,
      discrepancyOnHand: 0,
      cachedReserved: 0,
      activeReserved: 0,
      discrepancyReserved: 0,
    };

    vi.mocked(warehouseApi.useReconcileStock).mockReturnValue({
      data: emptyResult,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as any);

    render(
      <ReconciliationModal open={true} onClose={vi.fn()} balance={mockBalance} />
    );

    expect(screen.getByText('Scope Verified Empty & Reconciled')).toBeDefined();
    expect(screen.getByText(/The evaluated inventory scope is confirmed empty/i)).toBeDefined();
  });

  it('handles missing onHand object or malformed DTO as controlled data-contract error', () => {
    const malformedResult = {
      locationId: 'loc-wh-01',
      partId: 'part-01',
      // missing onHand and reserved
    } as any;

    vi.mocked(warehouseApi.useReconcileStock).mockReturnValue({
      data: malformedResult,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as any);

    // Should NOT throw TypeError: Cannot read properties of undefined (reading 'isBalanced')
    expect(() => {
      render(
        <ReconciliationModal open={true} onClose={vi.fn()} balance={mockBalance} />
      );
    }).not.toThrow();

    expect(screen.getByText('Data Contract Integrity Error')).toBeDefined();
    expect(screen.queryByText('Stock Perfectly Balanced')).toBeNull();
  });

  it('renders explicit error state with retry option when API request fails', () => {
    const refetchSpy = vi.fn();
    vi.mocked(warehouseApi.useReconcileStock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error: Database connection unavailable'),
      refetch: refetchSpy,
      isFetching: false,
    } as any);

    render(
      <ReconciliationModal open={true} onClose={vi.fn()} balance={mockBalance} />
    );

    expect(screen.getByText('Reconciliation Audit Failed')).toBeDefined();
    expect(screen.getByText('Network error: Database connection unavailable')).toBeDefined();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeDefined();
    fireEvent.click(retryBtn);
    expect(refetchSpy).toHaveBeenCalledTimes(1);
  });
});
