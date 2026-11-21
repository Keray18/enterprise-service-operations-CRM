import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../src/lib/apiClient';

/**
 * Normalizer function mirror from frontend/src/app/(workspace)/admin/page.tsx
 */
function normalizeServiceCenterWorkload(
  scData: any,
  scPage: number = 1,
  scLimit: number = 10
) {
  if (!scData) {
    return {
      scItems: [],
      scPagination: { page: scPage, limit: scLimit, total: 0, totalPages: 0 },
    };
  }
  if (Array.isArray(scData)) {
    return {
      scItems: scData,
      scPagination: {
        page: scPage,
        limit: scLimit,
        total: scData.length,
        totalPages: Math.ceil(scData.length / scLimit) || 1,
      },
    };
  }
  const rawItems = (scData as any).items;
  const items = Array.isArray(rawItems) ? rawItems : [];
  const rawPagination = (scData as any).pagination;
  const pagination =
    rawPagination && typeof rawPagination.total === 'number'
      ? rawPagination
      : {
          page: scPage,
          limit: scLimit,
          total: items.length,
          totalPages: Math.ceil(items.length / scLimit) || 1,
        };
  return { scItems: items, scPagination: pagination };
}

describe('Admin Dashboard Contract & Runtime Crash Prevention', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('unwraps data envelope correctly when backend delivers { items, pagination } inside data', async () => {
    const mockPayload = {
      success: true,
      data: {
        items: [
          {
            locationId: 'loc-01',
            locationCode: 'ASF-DEL-01',
            locationName: 'Delhi Central Service Hub',
            assignedOpenJobs: 5,
            awaitingAck: 1,
            inProgress: 3,
            pendingParts: 1,
            activeTechnicians: 4,
            isActive: true,
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 66,
          totalPages: 7,
        },
      },
      pagination: {
        page: 1,
        limit: 10,
        total: 66,
        totalPages: 7,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'x-correlation-id': 'trace-contract-test' }),
      json: async () => mockPayload,
    } as Response);

    const result = await apiClient.get<typeof mockPayload.data>('/api/v1/reports/admin/service-centers');

    // Result returned by apiClient MUST contain both items and pagination
    expect(result).toBeDefined();
    expect(result.items).toBeInstanceOf(Array);
    expect(result.items.length).toBe(1);
    expect(result.pagination).toBeDefined();
    expect(result.pagination.total).toBe(66);
    expect(result.pagination.totalPages).toBe(7);

    // Normalization should cleanly extract both
    const { scItems, scPagination } = normalizeServiceCenterWorkload(result);
    expect(scItems.length).toBe(1);
    expect(scPagination.total).toBe(66);
    expect(scPagination.totalPages).toBe(7);
  });

  it('prevents runtime crash when backend returns raw array directly (legacy fallback)', () => {
    // If backend or a mock returns a raw array in data:
    const legacyArray = [
      { locationId: 'loc-01', locationName: 'Legacy SC' },
      { locationId: 'loc-02', locationName: 'Legacy SC 2' },
    ];

    const { scItems, scPagination } = normalizeServiceCenterWorkload(legacyArray, 1, 10);
    expect(scItems.length).toBe(2);
    expect(scPagination.total).toBe(2);
    expect(scPagination.totalPages).toBe(1);
    // Verifying count={scPagination.total} never throws
    expect(() => {
      const count = scPagination.total;
      return count;
    }).not.toThrow();
  });

  it('prevents runtime crash when scData is undefined (initial render / loading)', () => {
    const { scItems, scPagination } = normalizeServiceCenterWorkload(undefined);
    expect(scItems).toEqual([]);
    expect(scPagination.total).toBe(0);
    expect(scPagination.totalPages).toBe(0);
  });

  it('prevents runtime crash when scData is null or empty object', () => {
    const fromNull = normalizeServiceCenterWorkload(null);
    expect(fromNull.scItems).toEqual([]);
    expect(fromNull.scPagination.total).toBe(0);

    const fromEmpty = normalizeServiceCenterWorkload({});
    expect(fromEmpty.scItems).toEqual([]);
    expect(fromEmpty.scPagination.total).toBe(0);
  });

  it('prevents runtime crash when scData has malformed items or missing pagination', () => {
    const malformed = {
      items: 'not-an-array',
      pagination: null,
    };

    const { scItems, scPagination } = normalizeServiceCenterWorkload(malformed);
    expect(scItems).toEqual([]);
    expect(scPagination.total).toBe(0);
    expect(scPagination.totalPages).toBe(1);
  });

  it('safely handles SLA compliance and customer outcomes when fields are undefined', () => {
    const emptyCharts: any = {};

    // Emulate safe access expressions from admin/page.tsx:
    expect(() => {
      const ackRate = emptyCharts?.slaCompliance?.ack48h?.rate || 0;
      const ackOnTime = emptyCharts?.slaCompliance?.ack48h?.onTime ?? 0;
      const resRate = emptyCharts?.slaCompliance?.resolution168h?.rate || 0;
      const happyRate = emptyCharts?.customerOutcomes?.happyCodeVerificationRate;
      const tatHours = emptyCharts?.customerOutcomes?.avgResolutionTatHours || 0;

      expect(ackRate).toBe(0);
      expect(ackOnTime).toBe(0);
      expect(resRate).toBe(0);
      expect(happyRate).toBeUndefined();
      expect(tatHours).toBe(0);
    }).not.toThrow();
  });
});

