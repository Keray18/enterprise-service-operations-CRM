import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getOracleConnection } from '../src/database/oraclePool.js';
import { inventoryRepository } from '../src/database/repositories/inventoryRepository.js';
import { inventoryReservationRepository } from '../src/database/repositories/inventoryReservationRepository.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { serviceRequestRepository } from '../src/database/repositories/serviceRequestRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { seedDevAccounts } from '../src/scripts/seedDevAccounts.js';
import { inventoryService } from '../src/services/inventoryService.js';
import { hashPassword } from '../src/services/passwordService.js';

describe('Operational Workflow Acceptance — Engineer Isolation, Partial Dispatch & Multi-Role Verification', () => {
  const app = createApp();
  const TEST_PASS = 'TestPass#2026!Secured';
  const suffix = Date.now().toString(36);

  let adminCookie = '';
  let adminCsrf = '';
  let warehouseCookie = '';
  let warehouseCsrf = '';
  let asfCookie = '';
  let asfCsrf = '';
  let engineer1Cookie = '';
  let engineer1Csrf = '';
  let engineer2Cookie = '';
  let engineer2Csrf = '';
  let foreignAsfCookie = '';
  let foreignAsfCsrf = '';

  let asfLocId = '';
  let foreignAsfLocId = '';
  let whLocId = '';

  let brandId = '';
  let productId = '';
  let modelId = '';
  let customerId = '';
  let partAId = '';
  let partBId = '';
  let partCId = '';

  const users = {
    admin: { id: '', userId: crypto.randomUUID(), username: `admin_${suffix}`, role: 'ADMIN', roles: ['ADMIN'], locationId: null as string | null },
    warehouse: { id: '', userId: crypto.randomUUID(), username: `wh_${suffix}`, role: 'WAREHOUSE', roles: ['WAREHOUSE'], locationId: null as string | null },
    asf: { id: '', userId: crypto.randomUUID(), username: `asf_${suffix}`, role: 'ASF', roles: ['ASF'], locationId: null as string | null },
    engineer1: { id: '', userId: crypto.randomUUID(), username: `eng1_${suffix}`, role: 'ENGINEER', roles: ['ENGINEER'], locationId: null as string | null },
    engineer2: { id: '', userId: crypto.randomUUID(), username: `eng2_${suffix}`, role: 'ENGINEER', roles: ['ENGINEER'], locationId: null as string | null },
    foreignAsf: { id: '', userId: crypto.randomUUID(), username: `for_asf_${suffix}`, role: 'ASF', roles: ['ASF'], locationId: null as string | null },
  };
  for (const u of Object.values(users)) {
    u.id = u.userId;
  }

  // Track created entities for atomic cleanup
  const createdRequestIds: string[] = [];
  const createdDispatchIds: string[] = [];
  const createdPartEntryIds: string[] = [];

  beforeAll(async () => {
    const passwordHash = await hashPassword(TEST_PASS);
    const conn = await getOracleConnection();

    try {
      // 1. Fetch active locations
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
      users.engineer1.locationId = asfLocId;
      users.engineer2.locationId = asfLocId;
      users.foreignAsf.locationId = foreignAsfLocId;
      users.warehouse.locationId = whLocId;

      // 2. Provision test users
      for (const [key, u] of Object.entries(users)) {
        await userRepository.createUser({
          userId: u.id,
          username: u.username,
          email: `${u.username}@crm.test`,
          fullName: `Test ${u.role} (${key})`,
          passwordHash,
          locationId: u.locationId || undefined,
        });

        await rbacRepository.assignRoleToUser(u.id, u.role, 'SYSTEM_ACCEPTANCE_TEST');

        const loginRes = await request(app)
          .post('/api/v1/auth/login')
          .send({ username: u.username, password: TEST_PASS });

        const cookieHeader = loginRes.headers['set-cookie'];
        const cookie = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader || '';
        const csrfToken = loginRes.body?.data?.csrfToken || '';

        if (key === 'admin') { adminCookie = cookie; adminCsrf = csrfToken; }
        if (key === 'warehouse') { warehouseCookie = cookie; warehouseCsrf = csrfToken; }
        if (key === 'asf') { asfCookie = cookie; asfCsrf = csrfToken; }
        if (key === 'engineer1') { engineer1Cookie = cookie; engineer1Csrf = csrfToken; }
        if (key === 'engineer2') { engineer2Cookie = cookie; engineer2Csrf = csrfToken; }
        if (key === 'foreignAsf') { foreignAsfCookie = cookie; foreignAsfCsrf = csrfToken; }
      }

      // 3. Fetch foreign keys
      const brandRes: any = await conn.execute(`SELECT BRAND_ID FROM BRANDS FETCH FIRST 1 ROWS ONLY`, {}, { outFormat: 4002 });
      const prodRes: any = await conn.execute(`SELECT PRODUCT_ID FROM PRODUCTS FETCH FIRST 1 ROWS ONLY`, {}, { outFormat: 4002 });
      const modRes: any = await conn.execute(`SELECT MODEL_ID FROM MODELS FETCH FIRST 1 ROWS ONLY`, {}, { outFormat: 4002 });
      const custRes: any = await conn.execute(`SELECT CUSTOMER_ID FROM CUSTOMERS FETCH FIRST 1 ROWS ONLY`, {}, { outFormat: 4002 });
      const partRes: any = await conn.execute(`SELECT PART_ID FROM PART_CODES WHERE IS_ACTIVE = 'Y' FETCH FIRST 3 ROWS ONLY`, {}, { outFormat: 4002 });

      brandId = brandRes.rows[0].BRAND_ID;
      productId = prodRes.rows[0].PRODUCT_ID;
      modelId = modRes.rows[0].MODEL_ID;
      customerId = custRes.rows[0].CUSTOMER_ID;
      partAId = partRes.rows[0].PART_ID;
      partBId = partRes.rows[1]?.PART_ID || partAId;
      partCId = partRes.rows[2]?.PART_ID || partAId;

      // Seed positive stock balances for parts at warehouse
      for (const pId of [partAId, partBId, partCId]) {
        await inventoryRepository.upsertBalanceDeltas(
          {
            locationId: whLocId,
            partId: pId,
            deltaOnHand: 50,
          },
          conn
        );
      }

      await conn.commit();
    } finally {
      await conn.close();
    }
  });

  afterAll(async () => {
    const conn = await getOracleConnection();
    try {
      for (const dId of createdDispatchIds) {
        await conn.execute('DELETE FROM DISPATCH_ITEMS WHERE DISPATCH_ID = :id', { id: dId });
        await conn.execute('DELETE FROM STOCK_DISPATCHES WHERE DISPATCH_ID = :id', { id: dId });
      }
      for (const pId of createdPartEntryIds) {
        await conn.execute('DELETE FROM INVENTORY_RESERVATIONS WHERE PART_ENTRY_ID = :id', { id: pId });
        await conn.execute('DELETE FROM SERVICE_REQUEST_PARTS WHERE PART_ENTRY_ID = :id', { id: pId });
      }
      for (const rId of createdRequestIds) {
        await conn.execute('DELETE FROM NOTIFICATIONS_OUTBOX WHERE REQUEST_ID = :id', { id: rId });
        await conn.execute('DELETE FROM DISPATCH_ITEMS WHERE DISPATCH_ID IN (SELECT DISPATCH_ID FROM STOCK_DISPATCHES WHERE REQUEST_ID = :id)', { id: rId });
        await conn.execute('DELETE FROM STOCK_DISPATCHES WHERE REQUEST_ID = :id', { id: rId });
        await conn.execute('DELETE FROM INVENTORY_RESERVATIONS WHERE REQUEST_ID = :id', { id: rId });
        await conn.execute('DELETE FROM SERVICE_REQUEST_VERIFICATIONS WHERE REQUEST_ID = :id', { id: rId });
        await conn.execute('DELETE FROM SERVICE_REQUEST_EVENTS WHERE REQUEST_ID = :id', { id: rId });
        await conn.execute('DELETE FROM SERVICE_REQUEST_PARTS WHERE REQUEST_ID = :id', { id: rId });
        await conn.execute('DELETE FROM SERVICE_REQUESTS WHERE REQUEST_ID = :id', { id: rId });
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
  // PART 1: ASF VS ENGINEER WORKSPACE ISOLATION
  // ============================================================================
  describe('1. ASF vs Engineer Workspace & Operational Scoping', () => {
    let ticket1Id = '';
    let ticket1JobNo = '';
    let ticket2Id = '';
    let ticket2JobNo = '';

    beforeAll(async () => {
      const conn = await getOracleConnection();
      try {
        ticket1JobNo = `JOB-ISO1-${Date.now().toString().slice(-6)}`;
        const sr1 = await serviceRequestRepository.createServiceRequest(
          {
            jobNumber: ticket1JobNo,
            customerId,
            brandId,
            productId,
            modelId,
            callType: 'REPAIR',
            serviceType: 'ON_SITE',
            status: 'APPOINTMENT_SCHEDULED',
            warrantyStatus: 'IN_WARRANTY',
            assignedLocationId: asfLocId,
            assignedEngineerId: users.engineer1.id,
            customerAddress: 'Tech 1 Customer Address',
            customerPincode: '400001',
            customerPhone: '9876543211',
            sla48hExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          },
          conn
        );
        ticket1Id = sr1.requestId;
        createdRequestIds.push(ticket1Id);
        await conn.execute(
          `UPDATE SERVICE_REQUESTS SET ASSIGNED_ENGINEER_ID = :engId WHERE REQUEST_ID = :id`,
          { engId: users.engineer1.id, id: ticket1Id }
        );

        ticket2JobNo = `JOB-ISO2-${Date.now().toString().slice(-6)}`;
        const sr2 = await serviceRequestRepository.createServiceRequest(
          {
            jobNumber: ticket2JobNo,
            customerId,
            brandId,
            productId,
            modelId,
            callType: 'REPAIR',
            serviceType: 'ON_SITE',
            status: 'APPOINTMENT_SCHEDULED',
            warrantyStatus: 'IN_WARRANTY',
            assignedLocationId: asfLocId,
            assignedEngineerId: users.engineer2.id,
            customerAddress: 'Tech 2 Customer Address',
            customerPincode: '400002',
            customerPhone: '9876543212',
            sla48hExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          },
          conn
        );
        ticket2Id = sr2.requestId;
        createdRequestIds.push(ticket2Id);
        await conn.execute(
          `UPDATE SERVICE_REQUESTS SET ASSIGNED_ENGINEER_ID = :engId WHERE REQUEST_ID = :id`,
          { engId: users.engineer2.id, id: ticket2Id }
        );

        await conn.commit();
      } finally {
        await conn.close();
      }
    });

    it('ASF franchisee manager sees full center workload including tickets for both engineers', async () => {
      const res = await request(app)
        .get('/api/v1/asf/queue?view=all&limit=100&q=JOB-ISO')
        .set('Cookie', asfCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const items = res.body.data.items;
      const found1 = items.find((i: any) => i.requestId === ticket1Id);
      const found2 = items.find((i: any) => i.requestId === ticket2Id);

      expect(found1).toBeDefined();
      expect(found2).toBeDefined();
    });

    it('Engineer 1 sees ONLY service requests assigned to their own identity in /asf/queue', async () => {
      const res = await request(app)
        .get('/api/v1/asf/queue?view=all&limit=100&q=JOB-ISO')
        .set('Cookie', engineer1Cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const items = res.body.data.items;
      const found1 = items.find((i: any) => i.requestId === ticket1Id);
      const found2 = items.find((i: any) => i.requestId === ticket2Id);

      expect(found1).toBeDefined();
      expect(found2).toBeUndefined(); // Engineer 1 MUST NOT see Engineer 2's job
    });

    it('Engineers CANNOT manipulate query parameters to retrieve another engineer jobs', async () => {
      // Engineer 1 maliciously attempts to pass Engineer 2's ID in query params
      const res = await request(app)
        .get(`/api/v1/asf/queue?view=all&limit=100&q=JOB-ISO&assignedEngineerId=${users.engineer2.id}`)
        .set('Cookie', engineer1Cookie);

      expect(res.status).toBe(200);
      const items = res.body.data.items;

      // Parameter manipulation MUST be overridden to actor.userId
      const found2 = items.find((i: any) => i.requestId === ticket2Id);
      expect(found2).toBeUndefined();

      // All returned items must belong exclusively to Engineer 1
      for (const item of items) {
        expect(item.assignedEngineerId).toBe(users.engineer1.id);
      }
    });

    it('Engineers CANNOT perform Service Center management actions (dispatch, otp regen, sla audit)', async () => {
      // 1. Dispatch attempt
      const dispatchRes = await request(app)
        .post(`/api/v1/asf/requests/${ticket1Id}/dispatch`)
        .set('Cookie', engineer1Cookie)
        .set('X-CSRF-Token', engineer1Csrf)
        .send({
          engineerId: users.engineer1.id,
          appointmentDate: new Date().toISOString(),
          appointmentSlot: 'SLOT_1',
          travelDistanceKm: 5,
          areaType: 'LOCAL',
        });
      expect(dispatchRes.status).toBe(403);

      // 2. OTP regeneration attempt on another engineer's ticket
      const regenRes = await request(app)
        .post(`/api/v1/asf/requests/${ticket2Id}/regenerate-otp`)
        .set('Cookie', engineer1Cookie)
        .set('X-CSRF-Token', engineer1Csrf)
        .send({ reason: 'Technician on site' });
      expect(regenRes.status).toBe(403);

      // 3. SLA audit evaluation attempt
      const slaRes = await request(app)
        .post('/api/v1/asf/sla/evaluate')
        .set('Cookie', engineer1Cookie)
        .set('X-CSRF-Token', engineer1Csrf);
      expect(slaRes.status).toBe(403);

      // 4. Listing eligible engineers
      const listEngRes = await request(app)
        .get('/api/v1/asf/engineers')
        .set('Cookie', engineer1Cookie);
      expect(listEngRes.status).toBe(403);
    });

    it('Job 360 read access enforces isolation: Engineer can read own job but is denied other engineer job', async () => {
      // Engineer 1 reads own job
      const ownJobRes = await request(app)
        .get(`/api/v1/asf/jobs/${ticket1Id}`)
        .set('Cookie', engineer1Cookie);
      expect(ownJobRes.status).toBe(200);
      expect(ownJobRes.body.data.serviceRequest.requestId).toBe(ticket1Id);

      // Engineer 1 tries to read Engineer 2's job in the same franchise location
      const otherJobRes = await request(app)
        .get(`/api/v1/asf/jobs/${ticket2Id}`)
        .set('Cookie', engineer1Cookie);
      expect(otherJobRes.status).toBe(403);
      expect(otherJobRes.body.error.message).toContain('Access denied');

      // ASF manager can read both jobs
      const asfJob1Res = await request(app)
        .get(`/api/v1/asf/jobs/${ticket1Id}`)
        .set('Cookie', asfCookie);
      expect(asfJob1Res.status).toBe(200);

      const asfJob2Res = await request(app)
        .get(`/api/v1/asf/jobs/${ticket2Id}`)
        .set('Cookie', asfCookie);
      expect(asfJob2Res.status).toBe(200);
    });
  });

  // ============================================================================
  // PART 2: DELIVERY ACKNOWLEDGMENT AUTHORIZATION MATRIX
  // ============================================================================
  describe('2. Delivery Acknowledgment Authorization & Security Matrix', () => {
    let matrixDispatchId = '';

    beforeAll(async () => {
      const conn = await getOracleConnection();
      try {
        matrixDispatchId = crypto.randomUUID();
        createdDispatchIds.push(matrixDispatchId);

        await conn.execute(
          `INSERT INTO STOCK_DISPATCHES (
            DISPATCH_ID, DISPATCH_NUMBER, DOCUMENT_TYPE,
            FROM_LOCATION_ID, TO_LOCATION_ID, COURIER_NAME,
            DOCKET_NUMBER, SUBTOTAL_AMOUNT, CGST_AMOUNT, SGST_AMOUNT, IGST_AMOUNT,
            TOTAL_AMOUNT, TOTAL_QUANTITY, STATUS, DISPATCHED_BY, DISPATCH_DATE
          ) VALUES (
            :dispatchId, :dispatchNumber, 'DELIVERY_CHALLAN',
            :fromLocId, :toLocId, 'Express Logistics',
            'EXP-112233', 1000, 90, 90, 0,
            1180, 1, 'IN_TRANSIT', :dispatchedBy, CURRENT_TIMESTAMP
          )`,
          {
            dispatchId: matrixDispatchId,
            dispatchNumber: `DSP-MTX-${Date.now().toString().slice(-6)}`,
            fromLocId: whLocId,
            toLocId: asfLocId,
            dispatchedBy: users.warehouse.id,
          }
        );

        await conn.execute(
          `INSERT INTO DISPATCH_ITEMS (
            DISPATCH_ITEM_ID, DISPATCH_ID, PART_ID, QUANTITY,
            UNIT_PRICE, CGST_RATE, SGST_RATE, IGST_RATE,
            CGST_AMOUNT, SGST_AMOUNT, IGST_AMOUNT, TOTAL_AMOUNT
          ) VALUES (
            :itemId, :dispatchId, :partId, 1,
            1000, 9, 9, 0,
            90, 90, 0, 1180
          )`,
          { itemId: crypto.randomUUID(), dispatchId: matrixDispatchId, partId: partAId }
        );

        await inventoryRepository.upsertBalanceDeltas(
          { locationId: whLocId, partId: partAId, deltaInTransit: 1 },
          conn
        );

        await conn.commit();
      } finally {
        await conn.close();
      }
    });

    it('denies acknowledgment by a foreign ASF location (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/warehouse/dispatches/${matrixDispatchId}/acknowledge`)
        .set('Cookie', foreignAsfCookie)
        .set('X-CSRF-Token', foreignAsfCsrf);

      expect(res.status).toBe(403);
    });

    it('denies acknowledgment by an unauthorized Field Engineer (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/warehouse/dispatches/${matrixDispatchId}/acknowledge`)
        .set('Cookie', engineer1Cookie)
        .set('X-CSRF-Token', engineer1Csrf);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows acknowledgment by authorized destination ASF manager (200 OK)', async () => {
      const res = await request(app)
        .post(`/api/v1/warehouse/dispatches/${matrixDispatchId}/acknowledge`)
        .set('Cookie', asfCookie)
        .set('X-CSRF-Token', asfCsrf);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACKNOWLEDGED');
    });

    it('repeated acknowledgment request is rejected as INVALID_STATUS (400 Bad Request)', async () => {
      const res = await request(app)
        .post(`/api/v1/warehouse/dispatches/${matrixDispatchId}/acknowledge`)
        .set('Cookie', asfCookie)
        .set('X-CSRF-Token', asfCsrf);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });
  });

  // ============================================================================
  // PART 3: MULTIPLE PARTS AND PARTIAL DISPATCH LIFECYCLE
  // ============================================================================
  describe('3. Multiple Parts, Partial Dispatch, and Staged Arrival Workflow', () => {
    let multiReqId = '';
    let multiJobNo = '';
    let entryPartA = '';
    let entryPartB = '';
    let entryPartC = '';

    let partialDispatch1Id = '';
    let partialDispatch2Id = '';

    beforeAll(async () => {
      const conn = await getOracleConnection();
      try {
        multiJobNo = `JOB-PARTS-${Date.now().toString().slice(-6)}`;
        const sr = await serviceRequestRepository.createServiceRequest(
          {
            jobNumber: multiJobNo,
            customerId,
            brandId,
            productId,
            modelId,
            callType: 'REPAIR',
            serviceType: 'ON_SITE',
            status: 'PENDING_SPARE_PART',
            warrantyStatus: 'IN_WARRANTY',
            assignedLocationId: asfLocId,
            assignedEngineerId: users.engineer1.id,
            customerAddress: 'Multi-part customer address',
            customerPincode: '400001',
            customerPhone: '9876543210',
            sla48hExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          },
          conn
        );
        multiReqId = sr.requestId;
        createdRequestIds.push(multiReqId);

        // Add 3 required parts in SERVICE_REQUEST_PARTS (PENDING_FULFILLMENT)
        entryPartA = crypto.randomUUID();
        entryPartB = crypto.randomUUID();
        entryPartC = crypto.randomUUID();
        createdPartEntryIds.push(entryPartA, entryPartB, entryPartC);

        for (const [entryId, pId] of [
          [entryPartA, partAId],
          [entryPartB, partBId],
          [entryPartC, partCId],
        ]) {
          await conn.execute(
            `INSERT INTO SERVICE_REQUEST_PARTS (
              PART_ENTRY_ID, REQUEST_ID, PART_ID, QUANTITY,
              ENTRY_TYPE, STATUS, CREATED_BY, UPDATED_BY,
              CREATED_AT, UPDATED_AT
            ) VALUES (
              :entryId, :reqId, :partId, 1,
              'REQUIRED_PNA', 'PENDING_FULFILLMENT', 'SYSTEM_TEST', 'SYSTEM_TEST',
              SYSTIMESTAMP, SYSTIMESTAMP
            )`,
            { entryId, reqId: multiReqId, partId: pId }
          );
        }

        await conn.commit();
      } finally {
        await conn.close();
      }
    });

    it('Phase 1: Reserves all 3 parts at warehouse and increments QTY_RESERVED', async () => {
      // Warehouse reserves each part
      for (const [entryId, pId] of [
        [entryPartA, partAId],
        [entryPartB, partBId],
        [entryPartC, partCId],
      ]) {
        const res = await inventoryService.reservePartForJob(
          {
            requestId: multiReqId,
            partEntryId: entryId,
            locationId: whLocId,
            partId: pId,
            quantity: 1,
          },
          users.warehouse as any
        );
        expect(res.reservationId).toBeDefined();
      }

      // Verify active reservations in database
      const activeReservations = await inventoryReservationRepository.findActiveByRequestId(multiReqId);
      expect(activeReservations.length).toBe(3);
    });

    it('Phase 2: Partial Dispatch 1 — Dispatches Part A only (Reservations B & C remain ACTIVE)', async () => {
      const dispatchResult = await inventoryService.fulfillStockDispatch(
        {
          documentType: 'DELIVERY_CHALLAN',
          fromLocationId: whLocId,
          toLocationId: asfLocId,
          requestId: multiReqId,
          courierName: 'Blue Dart Logistics',
          docketNumber: 'BD-PART-01',
          items: [{ partId: partAId, quantity: 1, unitPrice: 1200 }],
        },
        users.warehouse as any
      );

      partialDispatch1Id = dispatchResult.dispatchId;
      createdDispatchIds.push(partialDispatch1Id);

      // Verify Dispatch 1 status
      const dispatch1 = await request(app)
        .get(`/api/v1/warehouse/dispatches/${partialDispatch1Id}`)
        .set('Cookie', warehouseCookie);
      expect(dispatch1.status).toBe(200);
      expect(dispatch1.body.data.status).toBe('IN_TRANSIT');

      // Verify that Part A reservation is fulfilled, while B and C remain ACTIVE
      const activeResAfter = await inventoryReservationRepository.findActiveByRequestId(multiReqId);
      expect(activeResAfter.length).toBe(2);
      expect(activeResAfter.map((r) => r.partId)).not.toContain(partAId);
    });

    it('Phase 3: Partial Receipt 1 — Part A arrives, PENDING_SPARE_PART does NOT transition prematurely', async () => {
      // Destination center acknowledges arrival of Dispatch 1
      const ackRes = await request(app)
        .post(`/api/v1/warehouse/dispatches/${partialDispatch1Id}/acknowledge`)
        .set('Cookie', asfCookie)
        .set('X-CSRF-Token', asfCsrf);

      expect(ackRes.status).toBe(200);
      expect(ackRes.body.data.status).toBe('ACKNOWLEDGED');

      // Crucial verification: Service request MUST REMAIN in PENDING_SPARE_PART!
      const conn = await getOracleConnection();
      try {
        const srRes: any = await conn.execute(
          `SELECT STATUS FROM SERVICE_REQUESTS WHERE REQUEST_ID = :id`,
          { id: multiReqId },
          { outFormat: 4002 }
        );
        expect(srRes.rows[0].STATUS).toBe('PENDING_SPARE_PART');

        // Check parts statuses: Part A is COMMITTED, Parts B and C are STILL PENDING_FULFILLMENT
        const partsRes: any = await conn.execute(
          `SELECT PART_ID, STATUS FROM SERVICE_REQUEST_PARTS WHERE REQUEST_ID = :id ORDER BY PART_ID`,
          { id: multiReqId },
          { outFormat: 4002 }
        );
        const partAStatus = partsRes.rows.find((r: any) => r.PART_ID === partAId)?.STATUS;
        const partBStatus = partsRes.rows.find((r: any) => r.PART_ID === partBId)?.STATUS;
        const partCStatus = partsRes.rows.find((r: any) => r.PART_ID === partCId)?.STATUS;

        expect(partAStatus).toBe('COMMITTED');
        expect(partBStatus).toBe('PENDING_FULFILLMENT');
        expect(partCStatus).toBe('PENDING_FULFILLMENT');

        // Verify PART_RECEIVED audit event mentions outstanding parts
        const eventRes: any = await conn.execute(
          `SELECT REMARKS, TO_STATE FROM SERVICE_REQUEST_EVENTS 
           WHERE REQUEST_ID = :id AND EVENT_TYPE = 'PART_RECEIVED' 
           ORDER BY CREATED_AT DESC FETCH FIRST 1 ROWS ONLY`,
          { id: multiReqId },
          { outFormat: 4002 }
        );
        expect(eventRes.rows[0].TO_STATE).toBe('PENDING_SPARE_PART');
        expect(eventRes.rows[0].REMARKS).toContain('2 required part(s) remain outstanding');
      } finally {
        await conn.close();
      }
    });

    it('Phase 4: Partial Dispatch 2 — Dispatches remaining Parts B and C', async () => {
      const dispatchResult = await inventoryService.fulfillStockDispatch(
        {
          documentType: 'DELIVERY_CHALLAN',
          fromLocationId: whLocId,
          toLocationId: asfLocId,
          requestId: multiReqId,
          courierName: 'Delhivery Speed',
          docketNumber: 'DLH-PART-02',
          items: [
            { partId: partBId, quantity: 1, unitPrice: 850 },
            { partId: partCId, quantity: 1, unitPrice: 600 },
          ],
        },
        users.warehouse as any
      );

      partialDispatch2Id = dispatchResult.dispatchId;
      createdDispatchIds.push(partialDispatch2Id);

      // Verify all active reservations are now fulfilled
      const remainingRes = await inventoryReservationRepository.findActiveByRequestId(multiReqId);
      expect(remainingRes.length).toBe(0);
    });

    it('Phase 5: Final Receipt — All parts received, workflow advances to IN_PROGRESS_REPAIR', async () => {
      // Destination acknowledges Dispatch 2
      const ackRes = await request(app)
        .post(`/api/v1/warehouse/dispatches/${partialDispatch2Id}/acknowledge`)
        .set('Cookie', asfCookie)
        .set('X-CSRF-Token', asfCsrf);

      expect(ackRes.status).toBe(200);

      // Check that all parts are now COMMITTED and ticket status is IN_PROGRESS_REPAIR
      const conn = await getOracleConnection();
      try {
        const srRes: any = await conn.execute(
          `SELECT STATUS FROM SERVICE_REQUESTS WHERE REQUEST_ID = :id`,
          { id: multiReqId },
          { outFormat: 4002 }
        );
        expect(srRes.rows[0].STATUS).toBe('IN_PROGRESS_REPAIR');

        const partsRes: any = await conn.execute(
          `SELECT COUNT(*) AS PENDING_COUNT FROM SERVICE_REQUEST_PARTS 
           WHERE REQUEST_ID = :id AND STATUS = 'PENDING_FULFILLMENT'`,
          { id: multiReqId },
          { outFormat: 4002 }
        );
        expect(Number(partsRes.rows[0].PENDING_COUNT)).toBe(0);

        // Verify final PART_RECEIVED event
        const eventRes: any = await conn.execute(
          `SELECT REMARKS, TO_STATE FROM SERVICE_REQUEST_EVENTS 
           WHERE REQUEST_ID = :id AND EVENT_TYPE = 'PART_RECEIVED' 
           ORDER BY CREATED_AT DESC FETCH FIRST 1 ROWS ONLY`,
          { id: multiReqId },
          { outFormat: 4002 }
        );
        expect(eventRes.rows[0].TO_STATE).toBe('IN_PROGRESS_REPAIR');
        expect(eventRes.rows[0].REMARKS).toContain('All required spare parts fulfilled');
      } finally {
        await conn.close();
      }
    });

    it('Phase 6: Cancellation during partial fulfillment auto-releases active un-dispatched reservations', async () => {
      const conn = await getOracleConnection();
      let cancelReqId = '';
      let cancelEntryA = '';
      let cancelEntryB = '';

      try {
        // 1. Create a service request with 2 parts
        const cancelJobNo = `JOB-CANC-${Date.now().toString().slice(-6)}`;
        const sr = await serviceRequestRepository.createServiceRequest(
          {
            jobNumber: cancelJobNo,
            customerId,
            brandId,
            productId,
            modelId,
            callType: 'REPAIR',
            serviceType: 'ON_SITE',
            status: 'PENDING_SPARE_PART',
            warrantyStatus: 'IN_WARRANTY',
            assignedLocationId: asfLocId,
            assignedEngineerId: users.engineer1.id,
            customerAddress: 'Cancel customer address',
            customerPincode: '400001',
            customerPhone: '9876543210',
            sla48hExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          },
          conn
        );
        cancelReqId = sr.requestId;
        createdRequestIds.push(cancelReqId);

        cancelEntryA = crypto.randomUUID();
        cancelEntryB = crypto.randomUUID();
        createdPartEntryIds.push(cancelEntryA, cancelEntryB);

        await conn.execute(
          `INSERT INTO SERVICE_REQUEST_PARTS (PART_ENTRY_ID, REQUEST_ID, PART_ID, QUANTITY, STATUS, CREATED_BY, UPDATED_BY)
           VALUES (:id, :reqId, :partId, 1, 'PENDING_FULFILLMENT', 'SYSTEM', 'SYSTEM')`,
          { id: cancelEntryA, reqId: cancelReqId, partId: partAId }
        );
        await conn.execute(
          `INSERT INTO SERVICE_REQUEST_PARTS (PART_ENTRY_ID, REQUEST_ID, PART_ID, QUANTITY, STATUS, CREATED_BY, UPDATED_BY)
           VALUES (:id, :reqId, :partId, 1, 'PENDING_FULFILLMENT', 'SYSTEM', 'SYSTEM')`,
          { id: cancelEntryB, reqId: cancelReqId, partId: partBId }
        );

        await conn.commit();

        // 2. Reserve both parts
        await inventoryService.reservePartForJob(
          { requestId: cancelReqId, partEntryId: cancelEntryA, locationId: whLocId, partId: partAId, quantity: 1 },
          users.warehouse as any
        );
        const resB = await inventoryService.reservePartForJob(
          { requestId: cancelReqId, partEntryId: cancelEntryB, locationId: whLocId, partId: partBId, quantity: 1 },
          users.warehouse as any
        );

        // 3. Fulfill/Dispatch Part A
        const cancelDisp = await inventoryService.fulfillStockDispatch(
          {
            documentType: 'DELIVERY_CHALLAN',
            fromLocationId: whLocId,
            toLocationId: asfLocId,
            requestId: cancelReqId,
            courierName: 'DHL Fast',
            docketNumber: 'DHL-CANC-01',
            items: [{ partId: partAId, quantity: 1, unitPrice: 1000 }],
          },
          users.warehouse as any
        );
        createdDispatchIds.push(cancelDisp.dispatchId);

        // Verify Part B reservation is still ACTIVE
        const resBBeforeRes: any = await conn.execute(
          `SELECT STATUS, RELEASE_REASON FROM INVENTORY_RESERVATIONS WHERE RESERVATION_ID = :id`,
          { id: resB.reservationId },
          { outFormat: 4002 }
        );
        expect(resBBeforeRes.rows[0]?.STATUS).toBe('ACTIVE');

        // 4. Simulate cancellation auto-release (invoked when cancellation is approved)
        await inventoryService.autoReleaseJobReservations(
          cancelReqId,
          'Service call cancelled: Customer shifted premises',
          users.admin as any,
          conn
        );
        await conn.commit();

        // 5. Verify Part B reservation is now RELEASED and deltaReserved was restored
        const resBAfterRes: any = await conn.execute(
          `SELECT STATUS, RELEASE_REASON FROM INVENTORY_RESERVATIONS WHERE RESERVATION_ID = :id`,
          { id: resB.reservationId },
          { outFormat: 4002 }
        );
        expect(resBAfterRes.rows[0]?.STATUS).toBe('RELEASED');
        expect(resBAfterRes.rows[0]?.RELEASE_REASON).toContain('Customer shifted premises');

        // Verify RESERVATION_RELEASE movement in ledger
        const mvtRes: any = await conn.execute(
          `SELECT MOVEMENT_TYPE, QUANTITY FROM INVENTORY_MOVEMENTS 
           WHERE REFERENCE_ID = :jobNo AND MOVEMENT_TYPE = 'RESERVATION_RELEASE'`,
          { jobNo: cancelJobNo },
          { outFormat: 4002 }
        );
        expect(mvtRes.rows.length).toBeGreaterThan(0);
      } finally {
        await conn.close();
      }
    });
  });

  // ============================================================================
  // PART 4: DEVELOPMENT CREDENTIAL SECURITY SAFEGUARDS
  // ============================================================================
  describe('4. Development Credential Security & Environment Boundaries', () => {
    it('seedDevAccounts strictly prevents execution when NODE_ENV is production', async () => {
      const prevEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';

      try {
        await expect(seedDevAccounts()).rejects.toThrow(
          'SECURITY VIOLATION: seedDevAccounts is strictly restricted to development and test environments.'
        );
      } finally {
        process.env['NODE_ENV'] = prevEnv;
      }
    });

    it('generates cryptographically random non-deterministic temporary passwords', async () => {
      const accounts1 = await seedDevAccounts();
      const accounts2 = await seedDevAccounts();

      expect(accounts1.length).toBe(8);
      expect(accounts2.length).toBe(8);

      // Verify that every generated password differs between executions (rotation safety)
      const pw1 = accounts1.find((a) => a.username === 'admin')?.password;
      const pw2 = accounts2.find((a) => a.username === 'admin')?.password;

      expect(pw1).toBeDefined();
      expect(pw2).toBeDefined();
      expect(pw1).not.toBe(pw2);
    });

    it('stores strictly Argon2id hashes in Oracle, never plaintext passwords', async () => {
      const conn = await getOracleConnection();
      try {
        const res: any = await conn.execute(
          `SELECT USERNAME, PASSWORD_HASH FROM APP_USERS WHERE USERNAME IN ('admin', 'service_center', 'mumbai_tech_1')`,
          {},
          { outFormat: 4002 }
        );

        for (const row of res.rows) {
          expect(row.PASSWORD_HASH).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
          expect(row.PASSWORD_HASH).not.toContain('CrmPass#');
        }
      } finally {
        await conn.close();
      }
    });
  });
});
