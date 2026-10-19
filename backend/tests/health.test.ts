import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('Health Endpoints', () => {
  const app = createApp();

  describe('GET /health/live', () => {
    it('should return 200 with UP status and valid envelope', async () => {
      const res = await request(app).get('/health/live');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UP');
      expect(typeof res.body.data.uptimeSeconds).toBe('number');
      expect(typeof res.body.meta.correlationId).toBe('string');
      expect(res.headers['x-correlation-id']).toBe(res.body.meta.correlationId);
    });
  });

  describe('GET /health/ready', () => {
    it('should accurately report database status without fake positive responses', async () => {
      const res = await request(app).get('/health/ready');

      // If Oracle is not running, must return 503 DATABASE_UNAVAILABLE
      if (res.status === 503) {
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
        expect(res.body.error.message).toContain('Oracle Database is not reachable');
        expect(res.body.meta.correlationId).toBeDefined();
      } else {
        // If Oracle is connected, must return 200 READY
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('READY');
        expect(res.body.data.database.connected).toBe(true);
      }
    });
  });

  describe('GET /api/v1/system/info', () => {
    it('should return system architecture metadata', async () => {
      const res = await request(app).get('/api/v1/system/info');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.architecture).toBe('High-Integrity Modular Monolith');
      expect(res.body.data.phase).toContain('Phase');
    });
  });
});
