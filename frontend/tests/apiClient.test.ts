import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiClientError } from '../src/lib/apiClient';

describe('Frontend API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully unwrap data from standard success envelope', async () => {
    const mockData = { id: 1, name: 'Test Master' };
    const mockEnvelope = {
      success: true,
      data: mockData,
      meta: { correlationId: 'test-trace-123', timestamp: new Date().toISOString() },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'x-correlation-id': 'test-trace-123' }),
      json: async () => mockEnvelope,
    } as Response);

    const result = await apiClient.get<typeof mockData>('/api/v1/test');
    expect(result).toEqual(mockData);
  });

  it('should throw ApiClientError with code and correlationId on error envelope', async () => {
    const mockErrorEnvelope = {
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Oracle is offline' },
      meta: { correlationId: 'err-trace-456', timestamp: new Date().toISOString() },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers({ 'x-correlation-id': 'err-trace-456' }),
      json: async () => mockErrorEnvelope,
    } as Response);

    await expect(apiClient.get('/health/ready')).rejects.toThrow(ApiClientError);

    try {
      await apiClient.get('/health/ready');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiClientError);
      expect(err.code).toBe('DATABASE_UNAVAILABLE');
      expect(err.statusCode).toBe(503);
      expect(err.correlationId).toBe('err-trace-456');
    }
  });
});
