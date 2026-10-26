import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getOracleConnection } from '../src/database/oraclePool.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { hashPassword } from '../src/services/passwordService.js';

describe('Phase 5 Completion Gate: Role-by-Report Authorization Matrix & Scope Verification', () => {
  const app = createApp();
  const TEST_PASS = 'ReportAuthPass#2026!';

  const mumbaiLocationId = '00000000-0000-0000-0004-000000000001';
  const warehouseLocationId = '00000000-0000-0000-0008-000000000001'; // Central Warehouse
  const brandLocationId = '00000000-0000-0000-0001-000000000001'; // Skatercat Brand ID

  const uniqueSuffix = Date.now().toString(36);

  const users = {
    admin: { id: crypto.randomUUID(), username: `rep_admin_${uniqueSuffix}`, role: 'ADMIN', cookie: '' },
    callCenter: { id: crypto.randomUUID(), username: `rep_cc_${uniqueSuffix}`, role: 'CALL_CENTER', cookie: '' },
    asf: { id: crypto.randomUUID(), username: `rep_asf_${uniqueSuffix}`, role: 'ASF', locationId: mumbaiLocationId, cookie: '' },
    brand: { id: crypto.randomUUID(), username: `rep_brd_${uniqueSuffix}`, role: 'BRAND', locationId: brandLocationId, cookie: '' },
    warehouse: { id: crypto.randomUUID(), username: `rep_wh_${uniqueSuffix}`, role: 'WAREHOUSE', locationId: warehouseLocationId, cookie: '' },
    finance: { id: crypto.randomUUID(), username: `rep_fin_${uniqueSuffix}`, role: 'FINANCE', cookie: '' },
    engineer: { id: crypto.randomUUID(), username: `rep_eng_${uniqueSuffix}`, role: 'ENGINEER', locationId: mumbaiLocationId, cookie: '' },
  };

  beforeAll(async () => {
    // Ensure brand headquarters location exists for the brand user FK
    const conn = await getOracleConnection();
    try {
      await conn.execute(
        `MERGE INTO LOCATIONS loc
         USING (SELECT :id AS LOCATION_ID, 'SKC-HQ' AS LOCATION_CODE, 'Skatercat Brand Headquarters' AS LOCATION_NAME, 'HEAD_OFFICE' AS PARTY_TYPE FROM DUAL) s
         ON (loc.LOCATION_ID = s.LOCATION_ID)
         WHEN NOT MATCHED THEN INSERT (LOCATION_ID, LOCATION_CODE, LOCATION_NAME, PARTY_TYPE, IS_ACTIVE, CREATED_BY)
         VALUES (s.LOCATION_ID, s.LOCATION_CODE, s.LOCATION_NAME, s.PARTY_TYPE, 'Y', 'TEST_SETUP')`,
        { id: brandLocationId }
      );
      await conn.commit();
    } finally {
      await conn.close();
    }

    const passwordHash = await hashPassword(TEST_PASS);

    for (const [key, u] of Object.entries(users)) {
      await userRepository.createUser({
        userId: u.id,
        username: u.username,
        email: `${u.username}@crm.internal`,
        fullName: `Report Test ${u.role}`,
        passwordHash,
        locationId: u.locationId,
      });

      await rbacRepository.assignRoleToUser(u.id, u.role, 'TEST_SETUP');

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: u.username, password: TEST_PASS });

      expect(loginRes.status).toBe(200);
      u.cookie = loginRes.headers['set-cookie'][0];
    }
  });

  afterAll(async () => {
    const conn = await getOracleConnection();
    try {
      for (const u of Object.values(users)) {
        await conn.execute('DELETE FROM USER_SESSIONS WHERE USER_ID = :id', { id: u.id });
        await conn.execute('DELETE FROM USER_ROLES WHERE USER_ID = :id', { id: u.id });
        await conn.execute('DELETE FROM APP_USERS WHERE USER_ID = :id', { id: u.id });
      }
      await conn.commit();
    } finally {
      await conn.close();
    }
  });

  // ============================================================================
  // 1. Unauthenticated Gateway Checks
  // ============================================================================

  describe('1. Unauthenticated Boundary Gating (401 Unauthorized)', () => {
    const endpoints = [
      '/api/v1/reports/calls',
      '/api/v1/reports/calls/export',
      '/api/v1/reports/parts-consumption',
      '/api/v1/reports/parts-consumption/export',
      '/api/v1/reports/warranty-claims',
      '/api/v1/reports/warranty-claims/export',
      '/api/v1/reports/stock-valuation',
      '/api/v1/reports/stock-valuation/export',
      '/api/v1/reports/operational-queues',
      '/api/v1/reports/notifications/metrics',
    ];

    for (const endpoint of endpoints) {
      it(`should reject unauthenticated GET ${endpoint} with 401`, async () => {
        const res = await request(app).get(endpoint);
        expect(res.status).toBe(401);
      });
    }

    it('should reject unauthenticated POST /api/v1/reports/notifications/retry with 401', async () => {
      const res = await request(app).post('/api/v1/reports/notifications/retry');
      expect(res.status).toBe(401);
    });
  });

  // ============================================================================
  // 2. Call Register & Export Authorization
  // ============================================================================

  describe('2. Call Register & Export Authorization', () => {
    it('ADMIN should access Call Register and Export', async () => {
      const res1 = await request(app).get('/api/v1/reports/calls').set('Cookie', users.admin.cookie);
      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);

      const res2 = await request(app).get('/api/v1/reports/calls/export').set('Cookie', users.admin.cookie);
      expect(res2.status).toBe(200);
      expect(res2.headers['content-type']).toContain('text/csv');
    });

    it('CALL_CENTER should access Call Register and Export for customer lookup', async () => {
      const res1 = await request(app).get('/api/v1/reports/calls').set('Cookie', users.callCenter.cookie);
      expect(res1.status).toBe(200);

      const res2 = await request(app).get('/api/v1/reports/calls/export').set('Cookie', users.callCenter.cookie);
      expect(res2.status).toBe(200);
      expect(res2.headers['content-type']).toContain('text/csv');
    });

    it('FINANCE should access Call Register and Export for operational audit', async () => {
      const res1 = await request(app).get('/api/v1/reports/calls').set('Cookie', users.finance.cookie);
      expect(res1.status).toBe(200);

      const res2 = await request(app).get('/api/v1/reports/calls/export').set('Cookie', users.finance.cookie);
      expect(res2.status).toBe(200);
    });

    it('ASF should access Call Register scoped to their franchise location', async () => {
      const res = await request(app).get('/api/v1/reports/calls').set('Cookie', users.asf.cookie);
      expect(res.status).toBe(200);
      if (res.body.data?.length > 0) {
        for (const row of res.body.data) {
          expect(row.assignedLocation).toBe('Mumbai Central Service Franchise');
        }
      }
    });

    it('BRAND should access Call Register scoped to their brand', async () => {
      const res = await request(app).get('/api/v1/reports/calls').set('Cookie', users.brand.cookie);
      expect(res.status).toBe(200);
      if (res.body.data?.length > 0) {
        for (const row of res.body.data) {
          expect(row.brandName).toBe('Skatercat');
        }
      }
    });

    it('WAREHOUSE should be DENIED (403) from Call Register and Export', async () => {
      const res1 = await request(app).get('/api/v1/reports/calls').set('Cookie', users.warehouse.cookie);
      expect(res1.status).toBe(403);

      const res2 = await request(app).get('/api/v1/reports/calls/export').set('Cookie', users.warehouse.cookie);
      expect(res2.status).toBe(403);
    });

    it('ENGINEER should be DENIED (403) from Call Register and Export', async () => {
      const res = await request(app).get('/api/v1/reports/calls').set('Cookie', users.engineer.cookie);
      expect(res.status).toBe(403);
    });
  });

  // ============================================================================
  // 3. Parts Consumption & Defect Trend Authorization
  // ============================================================================

  describe('3. Parts Consumption & Defect Trends Authorization', () => {
    it('ADMIN, WAREHOUSE, FINANCE, ASF, and BRAND should access Parts Consumption and Export', async () => {
      const allowed = [users.admin, users.warehouse, users.finance, users.asf, users.brand];
      for (const u of allowed) {
        const res = await request(app).get('/api/v1/reports/parts-consumption').set('Cookie', u.cookie);
        expect(res.status).toBe(200);

        const exp = await request(app).get('/api/v1/reports/parts-consumption/export').set('Cookie', u.cookie);
        expect(exp.status).toBe(200);
        expect(exp.headers['content-type']).toContain('text/csv');
      }
    });

    it('CALL_CENTER should be STRICTLY DENIED (403) from Parts Consumption and Export', async () => {
      const res1 = await request(app).get('/api/v1/reports/parts-consumption').set('Cookie', users.callCenter.cookie);
      expect(res1.status).toBe(403);

      const res2 = await request(app).get('/api/v1/reports/parts-consumption/export').set('Cookie', users.callCenter.cookie);
      expect(res2.status).toBe(403);
    });

    it('ENGINEER should be DENIED (403) from Parts Consumption', async () => {
      const res = await request(app).get('/api/v1/reports/parts-consumption').set('Cookie', users.engineer.cookie);
      expect(res.status).toBe(403);
    });
  });

  // ============================================================================
  // 4. Warranty Claims & Settlement Audit Authorization
  // ============================================================================

  describe('4. Warranty Claims & Settlement Audit Authorization', () => {
    it('ADMIN, FINANCE, BRAND, and ASF should access Warranty Claims and Export', async () => {
      const allowed = [users.admin, users.finance, users.brand, users.asf];
      for (const u of allowed) {
        const res = await request(app).get('/api/v1/reports/warranty-claims').set('Cookie', u.cookie);
        expect(res.status).toBe(200);

        const exp = await request(app).get('/api/v1/reports/warranty-claims/export').set('Cookie', u.cookie);
        expect(exp.status).toBe(200);
        expect(exp.headers['content-type']).toContain('text/csv');
      }
    });

    it('CALL_CENTER should be STRICTLY DENIED (403) from Warranty Claims (Financial Segregation)', async () => {
      const res1 = await request(app).get('/api/v1/reports/warranty-claims').set('Cookie', users.callCenter.cookie);
      expect(res1.status).toBe(403);

      const res2 = await request(app).get('/api/v1/reports/warranty-claims/export').set('Cookie', users.callCenter.cookie);
      expect(res2.status).toBe(403);
    });

    it('WAREHOUSE should be STRICTLY DENIED (403) from Warranty Claims', async () => {
      const res1 = await request(app).get('/api/v1/reports/warranty-claims').set('Cookie', users.warehouse.cookie);
      expect(res1.status).toBe(403);

      const res2 = await request(app).get('/api/v1/reports/warranty-claims/export').set('Cookie', users.warehouse.cookie);
      expect(res2.status).toBe(403);
    });
  });

  // ============================================================================
  // 5. Inventory Stock Valuation Authorization
  // ============================================================================

  describe('5. Inventory Stock Valuation Authorization', () => {
    it('ADMIN, FINANCE, and WAREHOUSE should access Stock Valuation and Export', async () => {
      const allowed = [users.admin, users.finance, users.warehouse];
      for (const u of allowed) {
        const res = await request(app).get('/api/v1/reports/stock-valuation').set('Cookie', u.cookie);
        expect(res.status).toBe(200);

        const exp = await request(app).get('/api/v1/reports/stock-valuation/export').set('Cookie', u.cookie);
        expect(exp.status).toBe(200);
        expect(exp.headers['content-type']).toContain('text/csv');
      }
    });

    it('CALL_CENTER should be STRICTLY DENIED (403) from Stock Valuation', async () => {
      const res1 = await request(app).get('/api/v1/reports/stock-valuation').set('Cookie', users.callCenter.cookie);
      expect(res1.status).toBe(403);

      const res2 = await request(app).get('/api/v1/reports/stock-valuation/export').set('Cookie', users.callCenter.cookie);
      expect(res2.status).toBe(403);
    });

    it('ASF should be STRICTLY DENIED (403) from Central Stock Valuation', async () => {
      const res = await request(app).get('/api/v1/reports/stock-valuation').set('Cookie', users.asf.cookie);
      expect(res.status).toBe(403);
    });

    it('BRAND should be STRICTLY DENIED (403) from Central Stock Valuation', async () => {
      const res = await request(app).get('/api/v1/reports/stock-valuation').set('Cookie', users.brand.cookie);
      expect(res.status).toBe(403);
    });
  });

  // ============================================================================
  // 6. Operational Queues & System Notifications
  // ============================================================================

  describe('6. Operational Queues & Notification Telemetry Authorization', () => {
    it('All operational roles (ADMIN, CC, ASF, BRAND, FINANCE, WAREHOUSE) should access Operational Queues', async () => {
      const allowed = [users.admin, users.callCenter, users.asf, users.brand, users.finance, users.warehouse];
      for (const u of allowed) {
        const res = await request(app).get('/api/v1/reports/operational-queues').set('Cookie', u.cookie);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }
    });

    it('Only ADMIN should access Notification Metrics and Retry trigger', async () => {
      const res1 = await request(app).get('/api/v1/reports/notifications/metrics').set('Cookie', users.admin.cookie);
      expect(res1.status).toBe(200);

      const res2 = await request(app).post('/api/v1/reports/notifications/retry').set('Cookie', users.admin.cookie);
      expect(res2.status).toBe(200);
    });

    it('Non-admin roles should be DENIED (403) from Notification Metrics and Retry', async () => {
      const nonAdmins = [users.callCenter, users.asf, users.brand, users.warehouse, users.finance, users.engineer];
      for (const u of nonAdmins) {
        const res1 = await request(app).get('/api/v1/reports/notifications/metrics').set('Cookie', u.cookie);
        expect(res1.status).toBe(403);

        const res2 = await request(app).post('/api/v1/reports/notifications/retry').set('Cookie', u.cookie);
        expect(res2.status).toBe(403);
      }
    });
  });
});
