import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getOracleConnection } from '../src/database/oraclePool.js';
import { inventoryRepository } from '../src/database/repositories/inventoryRepository.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { serviceRequestRepository } from '../src/database/repositories/serviceRequestRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { hashPassword } from '../src/services/passwordService.js';

describe('P1/P0 Operational Workflow Fix - Service Center, Warehouse Tab 4, Reports & Admin Analytics', () => {
  const app = createApp();
  const TEST_PASS = 'TestPass#2026!Secured';
  const suffix = Date.now().toString(36);

  let adminCookie = '';
  let warehouseCookie = '';
  let asfCookie = '';
  let foreignAsfCookie = '';
  let asfCsrf = '';
  let foreignAsfCsrf = '';
  let warehouseCsrf = '';

  const users = {
    admin: { id: crypto.randomUUID(), username: `test_admin_${suffix}`, role: 'ADMIN', locationId: null as string | null },
    warehouse: { id: crypto.randomUUID(), username: `test_wh_${suffix}`, role: 'WAREHOUSE', locationId: null as string | null },
    asf: { id: crypto.randomUUID(), username: `test_asf_${suffix}`, role: 'ASF', locationId: null as string | null },
    foreignAsf: { id: crypto.randomUUID(), username: `test_for_asf_${suffix}`, role: 'ASF', locationId: null as string | null },
  };

  let testRequestId = '';
  let testJobNumber = '';
  let testDispatchId = '';

  beforeAll(async () => {
    const passwordHash = await hashPassword(TEST_PASS);

    // 1. Fetch actual active locations from DB
    const conn = await getOracleConnection();
    let asfLocId = '';
    let foreignAsfLocId = '';
    let whLocId = '';

    try {
      const locRes: any = await conn.execute(
        `SELECT LOCATION_ID, PARTY_TYPE FROM LOCATIONS WHERE IS_ACTIVE = 'Y' ORDER BY LOCATION_ID ASC`,
        {},
        { outFormat: 4002 }
      );
      const asfLocs = (locRes.rows || []).filter((r: any) => r.PARTY_TYPE === 'ASF');
      const whLocs = (locRes.rows || []).filter((r: any) => r.PARTY_TYPE === 'CENTRAL_WAREHOUSE');

      asfLocId = asfLocs[0]?.LOCATION_ID || locRes.rows[0]?.LOCATION_ID;
      foreignAsfLocId = asfLocs[1]?.LOCATION_ID || asfLocId;
      whLocId = whLocs[0]?.LOCATION_ID || locRes.rows[0]?.LOCATION_ID;

      users.asf.locationId = asfLocId;
      users.foreignAsf.locationId = foreignAsfLocId;
      users.warehouse.locationId = whLocId;

      // 2. Create users
      for (const [key, u] of Object.entries(users)) {
        await userRepository.createUser({
          userId: u.id,
          username: u.username,
          email: `${u.username}@crm.test`,
          fullName: `Test ${u.role}`,
          passwordHash,
          locationId: u.locationId || undefined,
        });

        await rbacRepository.assignRoleToUser(u.id, u.role, 'SYSTEM_TEST');

        const loginRes = await request(app)
          .post('/api/v1/auth/login')
          .send({ username: u.username, password: TEST_PASS });

        const cookieHeader = loginRes.headers['set-cookie'];
        const cookie = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader || '';
        const csrfToken = loginRes.body?.data?.csrfToken || '';

        if (key === 'admin') adminCookie = cookie;
        if (key === 'warehouse') {
          warehouseCookie = cookie;
          warehouseCsrf = csrfToken;
        }
        if (key === 'asf') {
          asfCookie = cookie;
          asfCsrf = csrfToken;
        }
        if (key === 'foreignAsf') {
          foreignAsfCookie = cookie;
          foreignAsfCsrf = csrfToken;
        }
      }

      // 3. Provision a test complaint assigned to asfLocId
      const brandRes: any = await conn.execute(`SELECT BRAND_ID FROM BRANDS FETCH FIRST 1 ROWS ONLY`, {}, { outFormat: 4002 });
      const prodRes: any = await conn.execute(`SELECT PRODUCT_ID FROM PRODUCTS FETCH FIRST 1 ROWS ONLY`, {}, { outFormat: 4002 });
      const modRes: any = await conn.execute(`SELECT MODEL_ID FROM MODELS FETCH FIRST 1 ROWS ONLY`, {}, { outFormat: 4002 });
      const custRes: any = await conn.execute(`SELECT CUSTOMER_ID FROM CUSTOMERS FETCH FIRST 1 ROWS ONLY`, {}, { outFormat: 4002 });
      const partRes: any = await conn.execute(`SELECT PART_ID FROM PART_CODES WHERE IS_ACTIVE = 'Y' FETCH FIRST 1 ROWS ONLY`, {}, { outFormat: 4002 });

      const brandId = brandRes.rows[0].BRAND_ID;
      const productId = prodRes.rows[0].PRODUCT_ID;
      const modelId = modRes.rows[0].MODEL_ID;
      const custId = custRes.rows[0].CUSTOMER_ID;
      const partId = partRes.rows[0].PART_ID;

      testJobNumber = `JOB-TST-${Date.now().toString().slice(-6)}`;

      const sr = await serviceRequestRepository.createServiceRequest(
        {
          jobNumber: testJobNumber,
          customerId: custId,
          brandId,
          productId,
          modelId,
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          status: 'ASSIGNED_TO_ASF',
          warrantyStatus: 'IN_WARRANTY',
          assignedLocationId: asfLocId,
          customerAddress: 'Test Customer Residence',
          customerPincode: '400001',
          customerPhone: '9876543210',
          sla48hExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        },
        conn
      );
      testRequestId = sr.requestId;

      // 4. Provision a test stock dispatch from whLocId to asfLocId
      testDispatchId = crypto.randomUUID();
      const testDispatchNumber = `DSP-TST-${Date.now().toString().slice(-6)}`;

      await conn.execute(
        `INSERT INTO STOCK_DISPATCHES (
          DISPATCH_ID, DISPATCH_NUMBER, DOCUMENT_TYPE, REQUEST_ID,
          FROM_LOCATION_ID, TO_LOCATION_ID, COURIER_NAME,
          DOCKET_NUMBER, SUBTOTAL_AMOUNT,
          CGST_AMOUNT, SGST_AMOUNT, IGST_AMOUNT, TOTAL_AMOUNT,
          TOTAL_QUANTITY, STATUS, DISPATCHED_BY, DISPATCH_DATE
        ) VALUES (
          :dispatchId, :dispatchNumber, 'DELIVERY_CHALLAN', :requestId,
          :fromLocId, :toLocId, 'Blue Dart Express',
          'BD-998877', 5000,
          450, 450, 0, 5900,
          2, 'IN_TRANSIT', :dispatchedBy, CURRENT_TIMESTAMP
        )`,
        {
          dispatchId: testDispatchId,
          dispatchNumber: testDispatchNumber,
          requestId: testRequestId,
          fromLocId: whLocId,
          toLocId: asfLocId,
          dispatchedBy: users.warehouse.id,
        }
      );

      // Add dispatch item
      await conn.execute(
        `INSERT INTO DISPATCH_ITEMS (
          DISPATCH_ITEM_ID, DISPATCH_ID, PART_ID, QUANTITY,
          UNIT_PRICE, CGST_RATE, SGST_RATE, IGST_RATE,
          CGST_AMOUNT, SGST_AMOUNT, IGST_AMOUNT, TOTAL_AMOUNT
        ) VALUES (
          :itemId, :dispatchId, :partId, 2,
          2500, 9, 9, 0,
          450, 450, 0, 5900
        )`,
        { itemId: crypto.randomUUID(), dispatchId: testDispatchId, partId }
      );

      // Seed in-transit balance so acknowledgment can safely decrement it
      await inventoryRepository.upsertBalanceDeltas(
        {
          locationId: whLocId,
          partId,
          deltaInTransit: 2,
        },
        conn
      );

      await conn.commit();
    } finally {
      await conn.close();
    }
  });

  afterAll(async () => {
    const conn = await getOracleConnection();
    try {
      if (testDispatchId) {
        await conn.execute('DELETE FROM DISPATCH_ITEMS WHERE DISPATCH_ID = :id', { id: testDispatchId });
        await conn.execute('DELETE FROM STOCK_DISPATCHES WHERE DISPATCH_ID = :id', { id: testDispatchId });
      }
      if (testRequestId) {
        await conn.execute('DELETE FROM SERVICE_REQUEST_EVENTS WHERE REQUEST_ID = :id', { id: testRequestId });
        await conn.execute('DELETE FROM SERVICE_REQUEST_PARTS WHERE REQUEST_ID = :id', { id: testRequestId });
        await conn.execute('DELETE FROM SERVICE_REQUESTS WHERE REQUEST_ID = :id', { id: testRequestId });
      }
      for (const u of Object.values(users)) {
        await conn.execute('DELETE FROM USER_SESSIONS WHERE USER_ID = :id', { id: u.id });
        await conn.execute('DELETE FROM INVENTORY_MOVEMENTS WHERE ACTOR_ID = :id', { id: u.id });
        await conn.execute('DELETE FROM SERVICE_REQUEST_EVENTS WHERE TRIGGERED_BY_USER_ID = :id', { id: u.id });
        await conn.execute('DELETE FROM USER_ROLES WHERE USER_ID = :id', { id: u.id });
        await conn.execute('DELETE FROM APP_USERS WHERE USER_ID = :id', { id: u.id });
      }
      await conn.commit();
    } finally {
      await conn.close();
    }
  });

  // ============================================================================
  // 1. SERVICE CENTER OPERATIONS & 10 ACTIONABLE QUEUES
  // ============================================================================
  describe('1. Service Center Operational Queues & Location Boundary', () => {
    it('allows ASF user to query all 10 queues without errors', async () => {
      const views = [
        'all',
        'unacknowledged',
        'ready_to_assign',
        'today_appointments',
        'assigned_technicians',
        'awaiting_checkin',
        'diagnosis_repair',
        'parts_pending',
        'parts_dispatched',
        'awaiting_verification',
        'overdue',
      ];

      for (const view of views) {
        const res = await request(app)
          .get(`/api/v1/asf/queue?view=${view}`)
          .set('Cookie', asfCookie);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data.items)).toBe(true);
        expect(typeof res.body.data.total).toBe('number');
      }
    });

    it('enforces location boundary: Service Center sees their complaints, foreign ASF center does not', async () => {
      const asfRes = await request(app)
        .get(`/api/v1/asf/queue?q=${testJobNumber}`)
        .set('Cookie', asfCookie);

      expect(asfRes.status).toBe(200);
      const match = asfRes.body.data.items.find((i: any) => i.requestId === testRequestId);
      expect(match).toBeDefined();

      // Foreign center (ASF_MUM_01) must NOT see ASF_8441 complaint
      const foreignRes = await request(app)
        .get(`/api/v1/asf/queue?q=${testJobNumber}`)
        .set('Cookie', foreignAsfCookie);

      expect(foreignRes.status).toBe(200);
      const foreignMatch = foreignRes.body.data.items.find((i: any) => i.requestId === testRequestId);
      expect(foreignMatch).toBeUndefined();
    });

    it('denies foreign ASF center access to technicians outside their location', async () => {
      const res = await request(app)
        .get(`/api/v1/asf/engineers/${users.asf.locationId}`)
        .set('Cookie', foreignAsfCookie);

      expect(res.status).toBe(403);
    });
  });

  // ============================================================================
  // 2. WAREHOUSE TAB 4: DISPATCHES & DELIVERY CHALLANS
  // ============================================================================
  describe('2. Warehouse Tab 4: Dispatches & Delivery Challans', () => {
    it('returns delivery challan records with mapped alias fields (subtotalTaxable, challanNumber, etc.)', async () => {
      const res = await request(app)
        .get('/api/v1/warehouse/dispatches')
        .set('Cookie', warehouseCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);

      const target = res.body.data.items.find((d: any) => d.dispatchId === testDispatchId);
      expect(target).toBeDefined();
      expect(target.challanNumber).toBeDefined();
      expect(target.subtotalTaxable).toBeDefined();
      expect(target.transporterName).toBe('Blue Dart Express');
      expect(target.docketNo).toBe('BD-998877');
      expect(target.status).toBe('IN_TRANSIT');
    });

    it('returns line item details with HSN codes when fetching full dispatch by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/warehouse/dispatches/${testDispatchId}`)
        .set('Cookie', warehouseCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dispatchId).toBe(testDispatchId);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);

      const lineItem = res.body.data.items[0];
      expect(lineItem.partCode).toBeDefined();
      expect(lineItem.hsnCode).toBeDefined();
      expect(lineItem.taxableValue).toBe(5000);
    });

    it('denies delivery arrival acknowledgment to unauthorized location', async () => {
      const res = await request(app)
        .post(`/api/v1/warehouse/dispatches/${testDispatchId}/acknowledge`)
        .set('Cookie', foreignAsfCookie)
        .set('X-CSRF-Token', foreignAsfCsrf);

      expect(res.status).toBe(403);
    });

    it('successfully acknowledges arrival from authorized destination ASF and updates state', async () => {
      // Set linked service request to PENDING_SPARE_PART to test workflow advancement
      const conn = await getOracleConnection();
      try {
        await conn.execute(
          `UPDATE SERVICE_REQUESTS SET STATUS = 'PENDING_SPARE_PART' WHERE REQUEST_ID = :id`,
          { id: testRequestId }
        );
        await conn.commit();
      } finally {
        await conn.close();
      }

      const res = await request(app)
        .post(`/api/v1/warehouse/dispatches/${testDispatchId}/acknowledge`)
        .set('Cookie', asfCookie)
        .set('X-CSRF-Token', asfCsrf);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACKNOWLEDGED');

      // Verify that linked service request advanced to IN_PROGRESS_REPAIR
      const connCheck = await getOracleConnection();
      try {
        const srRes: any = await connCheck.execute(
          `SELECT STATUS FROM SERVICE_REQUESTS WHERE REQUEST_ID = :id`,
          { id: testRequestId },
          { outFormat: 4002 }
        );
        expect(srRes.rows[0].STATUS).toBe('IN_PROGRESS_REPAIR');

        // Verify PART_RECEIVED event was appended to history
        const eventRes: any = await connCheck.execute(
          `SELECT EVENT_TYPE, TO_STATE FROM SERVICE_REQUEST_EVENTS 
           WHERE REQUEST_ID = :id AND EVENT_TYPE = 'PART_RECEIVED'`,
          { id: testRequestId },
          { outFormat: 4002 }
        );
        expect(eventRes.rows.length).toBeGreaterThan(0);
        expect(eventRes.rows[0].TO_STATE).toBe('IN_PROGRESS_REPAIR');
      } finally {
        await connCheck.close();
      }
    });

    it('prevents duplicate delivery arrival acknowledgment', async () => {
      const res = await request(app)
        .post(`/api/v1/warehouse/dispatches/${testDispatchId}/acknowledge`)
        .set('Cookie', asfCookie)
        .set('X-CSRF-Token', asfCsrf);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });
  });

  // ============================================================================
  // 3. WAREHOUSE ACCESS TO REPORTS & OPERATIONAL TELEMETRY
  // ============================================================================
  describe('3. Warehouse Reports Access & RBAC Isolation', () => {
    it('allows Warehouse user to access authorized reports (stock valuation, parts consumption, operational queues)', async () => {
      const qRes = await request(app)
        .get('/api/v1/reports/operational-queues')
        .set('Cookie', warehouseCookie);
      expect(qRes.status).toBe(200);
      expect(qRes.body.success).toBe(true);

      const partsRes = await request(app)
        .get('/api/v1/reports/parts-consumption')
        .set('Cookie', warehouseCookie);
      expect(partsRes.status).toBe(200);
      expect(partsRes.body.success).toBe(true);

      const stockRes = await request(app)
        .get('/api/v1/reports/stock-valuation')
        .set('Cookie', warehouseCookie);
      expect(stockRes.status).toBe(200);
      expect(stockRes.body.success).toBe(true);
    });

    it('denies Warehouse user access to unauthorized financial claims audit', async () => {
      const res = await request(app)
        .get('/api/v1/reports/warranty-claims')
        .set('Cookie', warehouseCookie);

      expect(res.status).toBe(403);
    });

    it('denies Warehouse user access to admin-only operational telemetry and dashboard', async () => {
      const res = await request(app)
        .get('/api/v1/reports/admin/dashboard')
        .set('Cookie', warehouseCookie);

      expect(res.status).toBe(403);
    });
  });

  // ============================================================================
  // 4. ADMIN DASHBOARD: OPERATIONAL HEALTH, CAPACITY & BAR CHART
  // ============================================================================
  describe('4. Admin Dashboard Analytics, Health & Workload', () => {
    it('returns complete operational network health metrics in admin dashboard', async () => {
      const res = await request(app)
        .get('/api/v1/reports/admin/dashboard?period=7d')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.operationalNetwork).toBeDefined();
      expect(typeof data.operationalNetwork.totalActiveServiceCenters).toBe('number');
      expect(typeof data.operationalNetwork.totalActiveTechnicians).toBe('number');
      expect(typeof data.operationalNetwork.assignedRequests).toBe('number');
      expect(typeof data.operationalNetwork.activeJobs).toBe('number');
      expect(typeof data.operationalNetwork.openBacklog).toBe('number');
      expect(typeof data.operationalNetwork.pendingParts).toBe('number');
      expect(typeof data.operationalNetwork.dispatchesAwaitingAck).toBe('number');
    });

    it('returns service center workload with truthful capacity indicators', async () => {
      const res = await request(app)
        .get('/api/v1/reports/admin/dashboard?period=7d')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const workload = res.body.data.serviceCenterWorkload;
      expect(Array.isArray(workload)).toBe(true);
      expect(workload.length).toBeGreaterThan(0);

      const firstCenter = workload[0];
      expect(firstCenter.locationId).toBeDefined();
      expect(firstCenter.locationName).toBeDefined();
      expect(typeof firstCenter.activeTechnicians).toBe('number');
      expect(typeof firstCenter.assignedOpenJobs).toBe('number');
      expect(firstCenter.capacityConfigured).toBe(false);
      expect(firstCenter.configuredCapacity).toBeNull();
    });

    it('returns zero-filled volume trend series for standard period presets', async () => {
      const presets = ['today', '7d', '30d'];

      for (const p of presets) {
        const res = await request(app)
          .get(`/api/v1/reports/admin/dashboard?period=${p}`)
          .set('Cookie', adminCookie);

        expect(res.status).toBe(200);
        const trend = res.body.data.charts.volumeTrend;
        expect(Array.isArray(trend)).toBe(true);
        expect(trend.length).toBeGreaterThan(0);

        for (const point of trend) {
          expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(typeof point.registered).toBe('number');
          expect(typeof point.closed).toBe('number');
        }
      }
    });
  });
});
