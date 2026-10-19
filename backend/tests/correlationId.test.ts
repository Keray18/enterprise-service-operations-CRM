import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('Correlation ID Middleware', () => {
  const app = createApp();

  it('should generate a UUID correlation ID when none is provided', async () => {
    const res = await request(app).get('/health/live');

    expect(res.headers['x-correlation-id']).toBeDefined();
    expect(res.headers['x-correlation-id'].length).toBeGreaterThan(10);
    expect(res.body.meta.correlationId).toBe(res.headers['x-correlation-id']);
  });

  it('should propagate client-supplied x-correlation-id header', async () => {
    const customId = 'client-trace-test-12345';
    const res = await request(app)
      .get('/health/live')
      .set('x-correlation-id', customId);

    expect(res.headers['x-correlation-id']).toBe(customId);
    expect(res.body.meta.correlationId).toBe(customId);
  });
});
