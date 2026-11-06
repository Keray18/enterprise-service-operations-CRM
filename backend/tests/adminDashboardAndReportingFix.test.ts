import crypto from 'crypto';
import oracledb from 'oracledb';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getOracleConnection } from '../src/database/oraclePool.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { hashPassword } from '../src/services/passwordService.js';

describe('Admin Operations Dashboard & Reports Runtime Crash Fix Verification', () => {
  const app = createApp();
  const TEST_PASS = 'AdminDashPass#2026!';
  const uniqueSuffix = Date.now().toString(36);

  const users = {
    admin: { id: crypto.randomUUID(), username: `dash_admin_${uniqueSuffix}`, role: 'ADMIN', cookie: '' },
    callCenter: { id: crypto.randomUUID(), username: `dash_cc_${uniqueSuffix}`, role: 'CALL_CENTER', cookie: '' },
    opsAuditor: { id: crypto.randomUUID(), username: `dash_ops_${uniqueSuffix}`, role: 'INFRA_OPS', cookie: '' },
  };

  beforeAll(async () => {
    const passwordHash = await hashPassword(TEST_PASS);

    // Create test users
    for (const [key, u] of Object.entries(users)) {
      await userRepository.createUser({
        userId: u.id,
        username: u.username,
        email: `${u.username}@crm.internal`,
        fullName: `Dashboard Test ${u.role}`,
        passwordHash,
      });

      await rbacRepository.assignRoleToUser(u.id, u.role, 'TEST_SETUP');

      // Login to obtain session cookie
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: u.username, password: TEST_PASS });

      const cookieHeader = loginRes.headers['set-cookie'];
      u.cookie = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader || '';
    }
  });

  afterAll(async () => {
    const conn = await getOracleConnection();
    try {
      for (const u of Object.values(users)) {
        await conn.execute('DELETE FROM USER_ROLES WHERE USER_ID = :id', { id: u.id });
        await conn.execute('DELETE FROM APP_USERS WHERE USER_ID = :id', { id: u.id });
      }
      await conn.commit();
    } finally {
      await conn.close();
    }
  });

  // ============================================================================
  // 1. Part A: Warranty Claims Report DTO & Penalty Field Contract
  // ============================================================================

  describe('Part A: Warranty Claims Report DTO Contract & CSV Semantics', () => {
    it('GET /api/v1/reports/warranty-claims returns penaltyDeductionAmount and asfName', async () => {
      const res = await request(app)
        .get('/api/v1/reports/warranty-claims')
        .set('Cookie', users.admin.cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      // Verify DTO structure if claims exist in DB
      for (const claim of res.body.data) {
        expect(claim).toHaveProperty('claimNumber');
        expect(claim).toHaveProperty('claimPeriod');
        expect(claim).toHaveProperty('asfName');
        expect(claim).toHaveProperty('grossLaborAmount');
        expect(claim).toHaveProperty('grossTravelAmount');
        // Authoritative contract: penaltyDeductionAmount must be present as a number or null, never undefined
        expect(claim).toHaveProperty('penaltyDeductionAmount');
        expect(claim.penaltyDeductionAmount === null || typeof claim.penaltyDeductionAmount === 'number').toBe(true);
        expect(claim).toHaveProperty('netClaimAmount');
        expect(claim).toHaveProperty('status');
      }
    });

    it('GET /api/v1/reports/warranty-claims/export includes Penalty Deductions header and row data', async () => {
      const res = await request(app)
        .get('/api/v1/reports/warranty-claims/export')
        .set('Cookie', users.admin.cookie);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const csvText = res.text;
      expect(csvText).toContain('Penalty Deductions (INR)');
      expect(csvText).toContain('Gross Labor (INR)');
      expect(csvText).toContain('Net Claim Amount (INR)');
    });
  });

  // ============================================================================
  // 2. Part B: Diagnostics Gating & Boundary Hardening
  // ============================================================================

  describe('Part B: System Diagnostics Security & Permission Isolation', () => {
    it('/health/ready does NOT expose raw database connectString or credentials', async () => {
      const res = await request(app).get('/health/ready');
      expect([200, 503]).toContain(res.status);

      if (res.status === 200) {
        expect(res.body.data.status).toBe('READY');
        expect(res.body.data.database.connected).toBe(true);
        expect(res.body.data.database.details).toBeUndefined();
      }
    });

    it('GET /api/v1/system/diagnostics denies unauthenticated callers with 401', async () => {
      const res = await request(app).get('/api/v1/system/diagnostics');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/system/diagnostics denies ordinary business ADMIN (without system:audit) with 403', async () => {
      const res = await request(app)
        .get('/api/v1/system/diagnostics')
        .set('Cookie', users.admin.cookie);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('system:audit');
    });

    it('GET /api/v1/system/diagnostics allows authorized user WITH system:audit permission', async () => {
      const res = await request(app)
        .get('/api/v1/system/diagnostics')
        .set('Cookie', users.opsAuditor.cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UP');
      expect(typeof res.body.data.uptimeSeconds).toBe('number');
      expect(res.body.data.database.connected).toBe(true);
    });
  });

  // ============================================================================
  // 3. Part C & D: Admin Operations Dashboard Analytics
  // ============================================================================

  describe('Part C & D: Admin Operations Dashboard Analytics API', () => {
    it('GET /api/v1/reports/admin/dashboard requires ADMIN role (CALL_CENTER is denied with 403)', async () => {
      const res = await request(app)
        .get('/api/v1/reports/admin/dashboard')
        .set('Cookie', users.callCenter.cookie);

      expect(res.status).toBe(403);
    });

    it('GET /api/v1/reports/admin/dashboard returns complete operational dataset for ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/reports/admin/dashboard?period=7d')
        .set('Cookie', users.admin.cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      // Period metadata
      expect(data.period).toBeDefined();
      expect(data.period.preset).toBe('7d');
      expect(typeof data.period.fromDate).toBe('string');
      expect(typeof data.period.toDate).toBe('string');

      // KPIs
      expect(data.kpis).toBeDefined();
      expect(typeof data.kpis.totalInPeriod).toBe('number');
      expect(typeof data.kpis.openBacklog).toBe('number');
      expect(typeof data.kpis.awaitingAck).toBe('number');
      expect(typeof data.kpis.overdue48hAck).toBe('number');
      expect(typeof data.kpis.overdue168hResolution).toBe('number');
      expect(typeof data.kpis.closedInPeriod).toBe('number');
      expect(typeof data.kpis.pendingApprovals).toBe('number');
      expect(typeof data.kpis.pendingParts).toBe('number');

      // Charts
      expect(data.charts).toBeDefined();
      expect(Array.isArray(data.charts.volumeTrend)).toBe(true);
      expect(Array.isArray(data.charts.workflowDistribution)).toBe(true);
      expect(data.charts.slaCompliance).toBeDefined();
      expect(data.charts.slaCompliance.ack48h).toHaveProperty('rate');
      expect(data.charts.slaCompliance.ack48h).toHaveProperty('totalEligible');
      expect(data.charts.slaCompliance.resolution168h).toHaveProperty('rate');
      expect(data.charts.slaCompliance.resolution168h).toHaveProperty('totalClosed');
      expect(Array.isArray(data.charts.agingBuckets)).toBe(true);
      expect(Array.isArray(data.charts.topBrands)).toBe(true);
      expect(Array.isArray(data.charts.topProducts)).toBe(true);
      expect(data.charts.customerOutcomes).toHaveProperty('happyCodeVerificationRate');

      // Pending actions
      expect(data.pendingActions).toBeDefined();
      expect(typeof data.pendingActions.overdueAckCount).toBe('number');
      expect(typeof data.pendingActions.overdueResolutionCount).toBe('number');
      expect(typeof data.pendingActions.pendingReplacementCount).toBe('number');
      expect(typeof data.pendingActions.pendingCancellationCount).toBe('number');
      expect(typeof data.pendingActions.pendingPnaCount).toBe('number');
      expect(typeof data.pendingActions.deadLetterNotificationCount).toBe('number');

      // Recent activity
      expect(Array.isArray(data.recentActivity)).toBe(true);
    });

    it('GET /api/v1/reports/admin/dashboard supports today, 30d, 90d, and custom date boundaries', async () => {
      const presets = ['today', '30d', '90d'];
      for (const p of presets) {
        const res = await request(app)
          .get(`/api/v1/reports/admin/dashboard?period=${p}`)
          .set('Cookie', users.admin.cookie);

        expect(res.status).toBe(200);
        expect(res.body.data.period.preset).toBe(p);
      }

      // Custom date boundary
      const customRes = await request(app)
        .get('/api/v1/reports/admin/dashboard?period=custom&fromDate=2026-01-01&toDate=2026-01-31')
        .set('Cookie', users.admin.cookie);

      expect(customRes.status).toBe(200);
      expect(customRes.body.data.period.preset).toBe('custom');
    });

    it('GET /api/v1/reports/admin/dashboard handles empty period gracefully without error', async () => {
      // Future date range with guaranteed 0 records
      const res = await request(app)
        .get('/api/v1/reports/admin/dashboard?period=custom&fromDate=2099-01-01&toDate=2099-01-07')
        .set('Cookie', users.admin.cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.kpis.totalInPeriod).toBe(0);
      expect(res.body.data.kpis.closedInPeriod).toBe(0);
      expect(res.body.data.charts.slaCompliance.ack48h.totalEligible).toBe(0);
      expect(res.body.data.charts.slaCompliance.resolution168h.totalClosed).toBe(0);
    });

    it('48h Acknowledgment SLA: in-flight request within 48h is tracked separately and does NOT reduce compliance rate', async () => {
      const conn = await getOracleConnection();
      const testReqId = crypto.randomUUID();
      const testJobNo = `JOB-INFLIGHT-${Date.now().toString().slice(-6)}`;

      try {
        // Find existing foreign keys
        const fkRes = await conn.execute<any>(
          `SELECT CUSTOMER_ID, BRAND_ID, PRODUCT_ID, MODEL_ID, LOCATION_ID 
           FROM (
             SELECT c.CUSTOMER_ID, m.BRAND_ID, m.PRODUCT_ID, m.MODEL_ID, l.LOCATION_ID 
             FROM CUSTOMERS c, MODELS m, LOCATIONS l
             WHERE c.IS_ACTIVE = 'Y' AND m.IS_ACTIVE = 'Y' AND l.IS_ACTIVE = 'Y'
           ) WHERE ROWNUM = 1`,
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const fk = fkRes.rows?.[0];
        expect(fk).toBeDefined();

        // Measure baseline before inserting
        const baseRes = await request(app)
          .get('/api/v1/reports/admin/dashboard?period=today')
          .set('Cookie', users.admin.cookie);
        const baselineBreached = baseRes.body.data.charts.slaCompliance.ack48h.breached;
        const baselineInFlight = baseRes.body.data.charts.slaCompliance.ack48h.inFlight;

        // Insert in-flight request registered 2 hours ago, deadline 46 hours in the future
        await conn.execute(
          `INSERT INTO SERVICE_REQUESTS (
            REQUEST_ID, JOB_NUMBER, CUSTOMER_ID, BRAND_ID, PRODUCT_ID, MODEL_ID,
            CALL_TYPE, SERVICE_TYPE, STATUS, ASSIGNED_LOCATION_ID,
            REGISTERED_AT, SLA_48H_EXPIRES_AT, SLA_BREACHED_48H, SLA_BREACHED_168H,
            CREATED_AT, UPDATED_AT
          ) VALUES (
            :reqId, :jobNo, :customerId, :brandId, :productId, :modelId,
            'REPAIR', 'ON_SITE', 'REGISTERED', :locationId,
            SYSTIMESTAMP - INTERVAL '2' HOUR,
            SYSTIMESTAMP + INTERVAL '46' HOUR,
            'N', 'N',
            SYSTIMESTAMP - INTERVAL '2' HOUR,
            SYSTIMESTAMP
          )`,
          {
            reqId: testReqId,
            jobNo: testJobNo,
            customerId: fk.CUSTOMER_ID,
            brandId: fk.BRAND_ID,
            productId: fk.PRODUCT_ID,
            modelId: fk.MODEL_ID,
            locationId: fk.LOCATION_ID,
          },
          { autoCommit: true }
        );

        // Query dashboard for today
        const res = await request(app)
          .get('/api/v1/reports/admin/dashboard?period=today')
          .set('Cookie', users.admin.cookie);

        expect(res.status).toBe(200);
        const ackData = res.body.data.charts.slaCompliance.ack48h;
        // In-flight ticket must be counted in inFlight
        expect(ackData.inFlight).toBeGreaterThanOrEqual(baselineInFlight + 1);
        // It must NOT count as breached
        expect(ackData.breached).toBe(baselineBreached);
      } finally {
        await conn.execute('DELETE FROM SERVICE_REQUESTS WHERE REQUEST_ID = :id', { id: testReqId }, { autoCommit: true });
        await conn.close();
      }
    });

    it('48h Acknowledgment SLA: late acknowledgment with stale background flag SLA_BREACHED_48H=N is authoritatively classified as BREACHED', async () => {
      const conn = await getOracleConnection();
      const testReqId = crypto.randomUUID();
      const testJobNo = `JOB-LATE-ACK-${Date.now().toString().slice(-6)}`;

      try {
        const fkRes = await conn.execute<any>(
          `SELECT CUSTOMER_ID, BRAND_ID, PRODUCT_ID, MODEL_ID, LOCATION_ID 
           FROM (
             SELECT c.CUSTOMER_ID, m.BRAND_ID, m.PRODUCT_ID, m.MODEL_ID, l.LOCATION_ID 
             FROM CUSTOMERS c, MODELS m, LOCATIONS l
             WHERE c.IS_ACTIVE = 'Y' AND m.IS_ACTIVE = 'Y' AND l.IS_ACTIVE = 'Y'
           ) WHERE ROWNUM = 1`,
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const fk = fkRes.rows?.[0];

        // Registered 50 hours ago, 48h deadline was 2 hours ago
        // Acknowledged 1 hour ago (late!)
        // SLA_BREACHED_48H flag was left as 'N' (stale background daemon scenario)
        await conn.execute(
          `INSERT INTO SERVICE_REQUESTS (
            REQUEST_ID, JOB_NUMBER, CUSTOMER_ID, BRAND_ID, PRODUCT_ID, MODEL_ID,
            CALL_TYPE, SERVICE_TYPE, STATUS, ASSIGNED_LOCATION_ID,
            REGISTERED_AT, SLA_48H_EXPIRES_AT, ACKNOWLEDGED_AT, SLA_BREACHED_48H, SLA_BREACHED_168H,
            CREATED_AT, UPDATED_AT
          ) VALUES (
            :reqId, :jobNo, :customerId, :brandId, :productId, :modelId,
            'REPAIR', 'ON_SITE', 'ACKNOWLEDGED', :locationId,
            SYSTIMESTAMP - INTERVAL '50' HOUR,
            SYSTIMESTAMP - INTERVAL '2' HOUR,
            SYSTIMESTAMP - INTERVAL '1' HOUR,
            'N', 'N',
            SYSTIMESTAMP - INTERVAL '50' HOUR,
            SYSTIMESTAMP - INTERVAL '1' HOUR
          )`,
          {
            reqId: testReqId,
            jobNo: testJobNo,
            customerId: fk.CUSTOMER_ID,
            brandId: fk.BRAND_ID,
            productId: fk.PRODUCT_ID,
            modelId: fk.MODEL_ID,
            locationId: fk.LOCATION_ID,
          },
          { autoCommit: true }
        );

        // Query dashboard for 7d
        const res = await request(app)
          .get('/api/v1/reports/admin/dashboard?period=7d')
          .set('Cookie', users.admin.cookie);

        expect(res.status).toBe(200);
        const ackData = res.body.data.charts.slaCompliance.ack48h;
        // Must be in eligible denominator
        expect(ackData.totalEligible).toBeGreaterThanOrEqual(1);
        // Authoritatively marked breached because ACKNOWLEDGED_AT > SLA_48H_EXPIRES_AT
        expect(ackData.breached).toBeGreaterThanOrEqual(1);
      } finally {
        await conn.execute('DELETE FROM SERVICE_REQUESTS WHERE REQUEST_ID = :id', { id: testReqId }, { autoCommit: true });
        await conn.close();
      }
    });

    it('168h Resolution SLA: closed request with gross TAT > 168h and pause event (Decision 2.2) is evaluated as ON_TIME', async () => {
      const conn = await getOracleConnection();
      const testReqId = crypto.randomUUID();
      const eventId = crypto.randomUUID();
      const testJobNo = `JOB-PAUSED-RES-${Date.now().toString().slice(-6)}`;

      try {
        const fkRes = await conn.execute<any>(
          `SELECT CUSTOMER_ID, BRAND_ID, PRODUCT_ID, MODEL_ID, LOCATION_ID 
           FROM (
             SELECT c.CUSTOMER_ID, m.BRAND_ID, m.PRODUCT_ID, m.MODEL_ID, l.LOCATION_ID 
             FROM CUSTOMERS c, MODELS m, LOCATIONS l
             WHERE c.IS_ACTIVE = 'Y' AND m.IS_ACTIVE = 'Y' AND l.IS_ACTIVE = 'Y'
           ) WHERE ROWNUM = 1`,
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const fk = fkRes.rows?.[0];

        // Registered 9 days ago, closed 1 hour ago (gross TAT = 216h > 168h)
        // Paused state: PENDING_SPARE_PART occurred during service lifecycle
        // SLA_BREACHED_168H is 'N'
        await conn.execute(
          `INSERT INTO SERVICE_REQUESTS (
            REQUEST_ID, JOB_NUMBER, CUSTOMER_ID, BRAND_ID, PRODUCT_ID, MODEL_ID,
            CALL_TYPE, SERVICE_TYPE, STATUS, ASSIGNED_LOCATION_ID,
            REGISTERED_AT, SLA_48H_EXPIRES_AT, ACKNOWLEDGED_AT, CLOSED_AT,
            SLA_BREACHED_48H, SLA_BREACHED_168H,
            CREATED_AT, UPDATED_AT
          ) VALUES (
            :reqId, :jobNo, :customerId, :brandId, :productId, :modelId,
            'REPAIR', 'ON_SITE', 'CLOSED', :locationId,
            SYSTIMESTAMP - INTERVAL '9' DAY,
            SYSTIMESTAMP - INTERVAL '7' DAY,
            SYSTIMESTAMP - INTERVAL '8' DAY,
            SYSTIMESTAMP - INTERVAL '1' HOUR,
            'N', 'N',
            SYSTIMESTAMP - INTERVAL '9' DAY,
            SYSTIMESTAMP - INTERVAL '1' HOUR
          )`,
          {
            reqId: testReqId,
            jobNo: testJobNo,
            customerId: fk.CUSTOMER_ID,
            brandId: fk.BRAND_ID,
            productId: fk.PRODUCT_ID,
            modelId: fk.MODEL_ID,
            locationId: fk.LOCATION_ID,
          },
          { autoCommit: true }
        );

        // Record PENDING_SPARE_PART pause event in SERVICE_REQUEST_EVENTS
        await conn.execute(
          `INSERT INTO SERVICE_REQUEST_EVENTS (
            EVENT_ID, REQUEST_ID, FROM_STATE, TO_STATE, EVENT_TYPE,
            TRIGGERED_BY_USER_ID, TRIGGERED_BY_USERNAME, TRIGGERED_BY_ROLE, REMARKS,
            CREATED_AT
          ) VALUES (
            :eventId, :reqId, 'IN_PROGRESS_REPAIR', 'PENDING_SPARE_PART', 'SPARE_PART_REQUESTED',
            :userId, 'test_technician', 'TECHNICIAN', 'Awaiting Central Warehouse spare part transit',
            SYSTIMESTAMP - INTERVAL '5' DAY
          )`,
          {
            eventId,
            reqId: testReqId,
            userId: users.admin.id,
          },
          { autoCommit: true }
        );

        // Query dashboard for 7d (since closure was 1 hour ago)
        const res = await request(app)
          .get('/api/v1/reports/admin/dashboard?period=7d')
          .set('Cookie', users.admin.cookie);

        expect(res.status).toBe(200);
        const resData = res.body.data.charts.slaCompliance.resolution168h;
        expect(resData.totalClosed).toBeGreaterThanOrEqual(1);
        // Must be on-time because timer was paused per Decision 2.2
        expect(resData.onTime).toBeGreaterThanOrEqual(1);
      } finally {
        await conn.execute('DELETE FROM SERVICE_REQUEST_EVENTS WHERE REQUEST_ID = :id', { id: testReqId }, { autoCommit: true });
        await conn.execute('DELETE FROM SERVICE_REQUESTS WHERE REQUEST_ID = :id', { id: testReqId }, { autoCommit: true });
        await conn.close();
      }
    });

    it('Cross-Role Isolation: INFRA_OPS is strictly denied business endpoints (Catalog, Finance, Call Center)', async () => {
      // 1. Catalog Masters
      const catRes = await request(app)
        .get('/api/v1/catalog/brands')
        .set('Cookie', users.opsAuditor.cookie);
      expect(catRes.status).toBe(403);

      // 2. Finance Wallets
      const finRes = await request(app)
        .get('/api/v1/finance/wallets')
        .set('Cookie', users.opsAuditor.cookie);
      expect(finRes.status).toBe(403);

      // 3. Call Center Calls
      const ccRes = await request(app)
        .get('/api/v1/call-center/requests')
        .set('Cookie', users.opsAuditor.cookie);
      expect(ccRes.status).toBe(403);
    });
  });
});
