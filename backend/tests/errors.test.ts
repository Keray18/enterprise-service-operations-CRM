import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('Error Handling Middleware', () => {
  const app = createApp();

  it('should return 404 NOT_FOUND with standardized error envelope for unknown routes', async () => {
    const res = await request(app).get('/api/v1/non-existent-route-999');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('Endpoint not found');
    expect(res.body.meta.correlationId).toBeDefined();
    expect(res.body.meta.timestamp).toBeDefined();
  });
});
