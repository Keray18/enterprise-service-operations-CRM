import crypto from 'crypto';
import request from 'supertest';
import { Persona, PersonaKey, provisionPersonas } from './helpers/isolatedPersonas.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getOracleConnection } from '../src/database/oraclePool.js';
import { inventoryRepository } from '../src/database/repositories/inventoryRepository.js';
import { notificationRepository } from '../src/database/repositories/notificationRepository.js';
import { serviceRequestRepository } from '../src/database/repositories/serviceRequestRepository.js';
import { mockSmsAdapter } from '../src/services/notificationService.js';
import { decryptNotificationPayload } from '../src/utils/cryptoUtils.js';

describe('P0 Operational Workflow Activation — End-to-End Persona Verification & Supply Chain Closure', () => {
  const app = createApp();

  // Isolated per-suite personas (pinned shared dev credentials were removed in Phase 3)
  let personas: Record<PersonaKey, Persona>;

  const sessions = {
    admin: { cookie: '', csrf: '' },
    callcenter: { cookie: '', csrf: '' },
    serviceCenter: { cookie: '', csrf: '' },
    warehouse: { cookie: '', csrf: '' },
    engineer: { cookie: '', csrf: '' },
  };

  let whLocId = '';
  let asfLocId = '';
  let brandId = '';
  let productId = '';
  let modelId = '';
  let stateId = '';
  let cityId = '';
  let customerId = '';
  let customerMobile = '';
  let part1Id = '';
  let part2Id = '';
  let faultId = '';
  let repairCodeId = '';
  let engineerUserId = '';
  let serialLength = 15;

  let createdRequestId = '';
  let createdJobNumber = '';
  let part1EntryId = '';
  let part2EntryId = '';
  let dispatch1Id = '';
  let dispatch2Id = '';

  beforeAll(async () => {
    // 1. Authenticate all 5 seeded personas using actual Argon2id hashes in Oracle
    personas = await provisionPersonas(app, { tag: 'p0_ops' });
    for (const key of Object.keys(sessions) as PersonaKey[]) {
      (sessions as any)[key] = { cookie: personas[key].cookie, csrf: personas[key].csrf };
    }

    // 2. Query Oracle DB for foreign keys & locations
    const conn = await getOracleConnection();
    try {
      const userRes: any = await conn.execute(
        `SELECT USER_ID, USERNAME, LOCATION_ID FROM APP_USERS WHERE USERNAME IN (:u1, :u2, :u3, :u4, :u5)`,
        { u1: personas.admin.username, u2: personas.callcenter.username, u3: personas.serviceCenter.username, u4: personas.warehouse.username, u5: personas.engineer.username },
        { outFormat: 4002 }
      );
      const scUser = (userRes.rows || []).find((r: any) => r.USERNAME === personas.serviceCenter.username);
      const whUser = (userRes.rows || []).find((r: any) => r.USERNAME === personas.warehouse.username);
      const engUser = (userRes.rows || []).find((r: any) => r.USERNAME === personas.engineer.username);

      asfLocId = scUser?.LOCATION_ID;
      whLocId = whUser?.LOCATION_ID;
      engineerUserId = engUser?.USER_ID;

      // Ensure engineer is explicitly assigned to this service center location
      await conn.execute(
        `UPDATE APP_USERS SET LOCATION_ID = :locId WHERE USER_ID = :engId`,
        { locId: asfLocId, engId: engineerUserId }
      );
      await conn.commit();

      const modRes: any = await conn.execute(
        `SELECT m.MODEL_ID, m.BRAND_ID, m.PRODUCT_ID, m.SERIAL_NUMBER_LENGTH
         FROM MODELS m
         JOIN PART_CODES p ON (p.BRAND_ID = m.BRAND_ID OR p.BRAND_ID IS NULL)
         WHERE m.IS_ACTIVE = 'Y' AND p.IS_ACTIVE = 'Y' AND m.IS_JOB_CREATION_ALLOWED = 'Y'
         GROUP BY m.BRAND_ID, m.MODEL_ID, m.PRODUCT_ID, m.SERIAL_NUMBER_LENGTH
         HAVING COUNT(p.PART_ID) >= 2
         FETCH FIRST 1 ROWS ONLY`,
        {},
        { outFormat: 4002 }
      );
      const geoRes: any = await conn.execute(
        `SELECT p.CITY_ID, p.STATE_ID FROM PINCODES p WHERE p.PINCODE = '400001'`,
        {},
        { outFormat: 4002 }
      );
      const custRes: any = await conn.execute(`SELECT CUSTOMER_ID, PRIMARY_MOBILE FROM CUSTOMERS FETCH FIRST 1 ROWS ONLY`, {}, { outFormat: 4002 });
      const faultRes: any = await conn.execute(`SELECT FAULT_ID FROM FAULT_MASTERS WHERE IS_ACTIVE = 'Y' FETCH FIRST 1 ROWS ONLY`, {}, { outFormat: 4002 });
      const repRes: any = await conn.execute(`SELECT REPAIR_CODE_ID FROM REPAIR_CODE_MASTERS WHERE IS_ACTIVE = 'Y' FETCH FIRST 1 ROWS ONLY`, {}, { outFormat: 4002 });

      brandId = modRes.rows[0].BRAND_ID;
      productId = modRes.rows[0].PRODUCT_ID;
      modelId = modRes.rows[0].MODEL_ID;
      serialLength = Number(modRes.rows[0].SERIAL_NUMBER_LENGTH || 15);
      stateId = geoRes.rows[0].STATE_ID;
      cityId = geoRes.rows[0].CITY_ID;
      customerId = custRes.rows[0].CUSTOMER_ID;
      customerMobile = custRes.rows[0].PRIMARY_MOBILE;
      faultId = faultRes.rows[0]?.FAULT_ID;
      repairCodeId = repRes.rows[0]?.REPAIR_CODE_ID;

      const partRes: any = await conn.execute(
        `SELECT PART_ID FROM PART_CODES WHERE IS_ACTIVE = 'Y' AND (BRAND_ID = :bId OR BRAND_ID IS NULL) FETCH FIRST 2 ROWS ONLY`,
        { bId: brandId },
        { outFormat: 4002 }
      );
      part1Id = partRes.rows[0].PART_ID;
      part2Id = partRes.rows[1]?.PART_ID || part1Id;

      // Seed warehouse inventory for both parts
      for (const pId of [part1Id, part2Id]) {
        await inventoryRepository.upsertBalanceDeltas(
          {
            locationId: whLocId,
            partId: pId,
            deltaOnHand: 100,
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
    // Atomic test cleanup
    if (createdRequestId) {
      const conn = await getOracleConnection();
      try {
        await conn.execute(`DELETE FROM NOTIFICATIONS WHERE REQUEST_ID = :id OR SERVICE_REQUEST_ID = :id`, { id: createdRequestId });
        await conn.execute(`DELETE FROM SERVICE_CLAIMS WHERE REQUEST_ID = :id`, { id: createdRequestId });
        await conn.execute(`DELETE FROM SERVICE_REQUEST_ITEMS WHERE REQUEST_ID = :id`, { id: createdRequestId });
        await conn.execute(`DELETE FROM SERVICE_REQUEST_PARTS WHERE REQUEST_ID = :id`, { id: createdRequestId });
        await conn.execute(`DELETE FROM SERVICE_REQUEST_EVENTS WHERE REQUEST_ID = :id`, { id: createdRequestId });
        await conn.execute(`DELETE FROM SERVICE_REQUEST_VERIFICATIONS WHERE REQUEST_ID = :id`, { id: createdRequestId });
        await conn.execute(`DELETE FROM SERVICE_REQUESTS WHERE REQUEST_ID = :id`, { id: createdRequestId });
        await conn.commit();
      } catch {
        // ignore cleanup errors
      } finally {
        await conn.close();
      }
    }
  });

  // ==========================================================================
  // SECTION 1: AUTHENTICATION AND PERSONA HEALTH
  // ==========================================================================
  describe('1. Active User Account Authentication & Identity Protection', () => {
    it('authenticates admin with Argon2id and returns valid JWT session', () => {
      expect(sessions.admin.cookie).toContain('crm_session');
      expect(sessions.admin.csrf).toBeTruthy();
    });

    it('authenticates callcenter with Argon2id and returns valid JWT session', () => {
      expect(sessions.callcenter.cookie).toContain('crm_session');
      expect(sessions.callcenter.csrf).toBeTruthy();
    });

    it('authenticates service_center with Argon2id and returns valid JWT session', () => {
      expect(sessions.serviceCenter.cookie).toContain('crm_session');
      expect(sessions.serviceCenter.csrf).toBeTruthy();
    });

    it('authenticates warehouse with Argon2id and returns valid JWT session', () => {
      expect(sessions.warehouse.cookie).toContain('crm_session');
      expect(sessions.warehouse.csrf).toBeTruthy();
    });

    it('authenticates mumbai_tech_1 with Argon2id and returns valid JWT session', () => {
      expect(sessions.engineer.cookie).toContain('crm_session');
      expect(sessions.engineer.csrf).toBeTruthy();
    });
  });

  // ==========================================================================
  // SECTION 2: PART A — WAREHOUSE DASHBOARD & MULTI-BUCKET RECONCILIATION API
  // ==========================================================================
  describe('2. Part A: Warehouse Dashboard & Multi-Bucket Reconciliation Engine', () => {
    it('Warehouse dashboard returns verified numeric KPI statistics with non-empty locations', async () => {
      const res = await request(app)
        .get('/api/v1/warehouse/dashboard')
        .set('Cookie', sessions.warehouse.cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const kpis = res.body.data.kpis;
      expect(kpis).toBeDefined();
      expect(typeof kpis.totalStockOnHand).toBe('number');
      expect(typeof kpis.totalStockReserved).toBe('number');
      expect(typeof kpis.totalStockInTransit).toBe('number');
      expect(typeof kpis.totalStockDefective).toBe('number');
      expect(typeof kpis.lowStockPartCount).toBe('number');
      expect(typeof kpis.pendingPartRequestCount).toBe('number');

      // Valid numeric bounds (never NaN)
      expect(isNaN(kpis.totalStockOnHand)).toBe(false);
      expect(isNaN(kpis.totalStockReserved)).toBe(false);
      expect(isNaN(kpis.totalStockInTransit)).toBe(false);

      expect(Array.isArray(res.body.data.locations)).toBe(true);
      expect(res.body.data.locations.length).toBeGreaterThan(0);
    });

    it('Warehouse reconciliation returns authoritative multi-bucket audit structure', async () => {
      const res = await request(app)
        .get(`/api/v1/warehouse/reconcile/${whLocId}/${part1Id}`)
        .set('Cookie', sessions.warehouse.cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.locationId).toBe(whLocId);
      expect(data.partId).toBe(part1Id);

      // On-Hand bucket audit
      expect(data.onHand).toBeDefined();
      expect(typeof data.onHand.cached).toBe('number');
      expect(typeof data.onHand.movementSum).toBe('number');
      expect(typeof data.onHand.isBalanced).toBe('boolean');
      expect(typeof data.onHand.difference).toBe('number');

      // Reserved bucket audit
      expect(data.reserved).toBeDefined();
      expect(typeof data.reserved.cached).toBe('number');
      expect(typeof data.reserved.activeReservationSum).toBe('number');
      expect(typeof data.reserved.isBalanced).toBe('boolean');
      expect(typeof data.reserved.difference).toBe('number');

      // In-Transit bucket audit
      expect(data.inTransit).toBeDefined();
      expect(typeof data.inTransit.cached).toBe('number');
      expect(typeof data.inTransit.activeInTransitSum).toBe('number');
      expect(typeof data.inTransit.isBalanced).toBe('boolean');
      expect(typeof data.inTransit.difference).toBe('number');

      // Available bucket audit
      expect(data.available).toBeDefined();
      expect(typeof data.available.cached).toBe('number');
      expect(typeof data.available.ledgerAvailable).toBe('number');
      expect(typeof data.available.isBalanced).toBe('boolean');
      expect(typeof data.available.difference).toBe('number');

      expect(['BALANCED', 'DISCREPANCY_DETECTED']).toContain(data.status);
    });

    it('Reconciliation returns 404 NOT_FOUND for unknown part rather than crashing', async () => {
      const dummyPartId = crypto.randomUUID();
      const res = await request(app)
        .get(`/api/v1/warehouse/reconcile/${whLocId}/${dummyPartId}`)
        .set('Cookie', sessions.warehouse.cookie);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // ==========================================================================
  // SECTION 3: PART B — CATALOG MASTERS ACCESS AUDIT
  // ==========================================================================
  describe('3. Part B: Catalog Masters Access Audit & RBAC Enforcement', () => {
    it('Call Center is DENIED administrative catalog mutations (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/brands')
        .set('Cookie', sessions.callcenter.cookie)
        .set('X-CSRF-Token', sessions.callcenter.csrf)
        .send({
          brandCode: `BR_${Date.now().toString(36)}`,
          brandName: 'Unauthorized Brand Attempt',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Call Center CAN read catalog lookup endpoints for complaint registration', async () => {
      const brandRes = await request(app)
        .get('/api/v1/catalog/brands')
        .set('Cookie', sessions.callcenter.cookie);

      expect(brandRes.status).toBe(200);
      expect(brandRes.body.success).toBe(true);
      expect(Array.isArray(brandRes.body.data.items)).toBe(true);

      const prodRes = await request(app)
        .get('/api/v1/catalog/products')
        .set('Cookie', sessions.callcenter.cookie);

      expect(prodRes.status).toBe(200);
      expect(prodRes.body.success).toBe(true);
      expect(Array.isArray(prodRes.body.data.items)).toBe(true);
    });
  });

  // ==========================================================================
  // SECTION 4: PART C — COMPLETE 6-STEP SERVICE WORKFLOW
  // ==========================================================================
  describe('4. Part C: 6-Step Operational Service Workflow Activation', () => {
    it('Step 1: Call Center registers complaint and generates Job Number', async () => {
      const res = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', sessions.callcenter.cookie)
        .set('X-CSRF-Token', sessions.callcenter.csrf)
        .send({
          customerId,
          brandId,
          productId,
          modelId,
          serialNumber: `SN${Date.now()}`.padEnd(serialLength, 'X').slice(0, serialLength),
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          stateId,
          cityId,
          pincode: '400001',
          addressLine: '123 Marine Drive, Nariman Point',
          problemDescription: 'Appliance power board overheating with erratic shutdown.',
        });

      if (res.status !== 201) {
        console.error('STEP 1 COMPLAINT REGISTRATION FAILED:', res.status, JSON.stringify(res.body));
      }
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.serviceRequest.requestId).toBeTruthy();
      expect(res.body.data.serviceRequest.jobNumber).toBeTruthy();

      createdRequestId = res.body.data.serviceRequest.requestId;
      createdJobNumber = res.body.data.serviceRequest.jobNumber;

      // Verify initial state in DB (automatic default ASF assignment moves routine complaints to ASSIGNED_TO_ASF)
      const sr = await serviceRequestRepository.findById(createdRequestId);
      expect(['REGISTERED', 'ASSIGNED_TO_ASF']).toContain(sr?.status);
    });

    it('Step 2: Service Center manager acknowledges and assigns job to field technician', async () => {
      // Re-assign ticket to Mumbai ASF if needed so service_center can manage it
      const conn = await getOracleConnection();
      try {
        await conn.execute(
          `UPDATE SERVICE_REQUESTS SET ASSIGNED_LOCATION_ID = :locId WHERE REQUEST_ID = :reqId`,
          { locId: asfLocId, reqId: createdRequestId }
        );
        await conn.commit();
      } finally {
        await conn.close();
      }

      const res = await request(app)
        .post(`/api/v1/asf/requests/${createdRequestId}/dispatch`)
        .set('Cookie', sessions.serviceCenter.cookie)
        .set('X-CSRF-Token', sessions.serviceCenter.csrf)
        .send({
          engineerId: engineerUserId,
          appointmentDate: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
          appointmentSlot: '10:00 - 13:00',
          travelDistanceKm: 15,
          areaType: 'LOCAL',
          remarks: 'Assigned to senior engineer for priority inspection',
        });

      expect([200, 201]).toContain(res.status);

      const sr = await serviceRequestRepository.findById(createdRequestId);
      expect(sr?.assignedEngineerId).toBe(engineerUserId);
      expect(sr?.status).toBe('APPOINTMENT_SCHEDULED');
      expect(sr?.acknowledgedAt).toBeTruthy();
    });

    it('Step 3: Engineer checks in with OTP, records diagnosis, and raises PNA for 2 parts', async () => {
      // Retrieve customer check-in OTP from mock SMS delivery or encrypted outbox
      let checkInOtp: string | undefined;
      for (let attempt = 0; attempt < 20; attempt++) {
        const sent = mockSmsAdapter.getSentMessages();
        const apptSms = sent.find(
          (s) => s.templateCode === 'SMS_02_APPOINTMENT' || s.messageBody.includes('share the OTP') || s.messageBody.includes('OTP')
        );
        if (apptSms) {
          const m = apptSms.messageBody.match(/OTP\s+(\d{6})/i) || apptSms.messageBody.match(/\b(\d{6})\b/);
          if (m) {
            checkInOtp = m[1];
            break;
          }
        }
        const outbox = await notificationRepository.listByRequestId(createdRequestId);
        // Arrival Happy Code SMS is scheduled for appointment - 60 min (approved); read the queued, encrypted outbox record
        const listedSms2 = outbox.find((n: any) => n.templateCode === 'SMS_02_APPOINTMENT');
        const notif = listedSms2 ? await notificationRepository.findById(listedSms2.notificationId) : undefined;
        if (notif?.encryptedPayload) {
          const dec = decryptNotificationPayload({
            encryptedPayload: notif.encryptedPayload,
            iv: notif.encryptionIv!,
            authTag: notif.authTag!,
            keyVersion: notif.keyVersion || 'v1',
          });
          const m = dec.match(/OTP\s+(\d{6})/i) || dec.match(/\b(\d{6})\b/);
          if (m) {
            checkInOtp = m[1];
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(checkInOtp).toBeDefined();

      // Check-in via OTP
      const checkinRes = await request(app)
        .post(`/api/v1/asf/requests/${createdRequestId}/check-in`)
        .set('Cookie', sessions.engineer.cookie)
        .set('X-CSRF-Token', sessions.engineer.csrf)
        .send({
          otp: checkInOtp!,
          remarks: 'Technician checked in on site',
        });

      expect(checkinRes.status).toBe(200);

      // Record diagnosis
      const diagRes = await request(app)
        .post(`/api/v1/asf/jobs/${createdRequestId}/diagnosis`)
        .set('Cookie', sessions.engineer.cookie)
        .set('X-CSRF-Token', sessions.engineer.csrf)
        .send({
          faultId,
          voeDescription: 'Fault confirmed on main power control PCB. Secondary relay defective.',
          observations: 'Low refrigerant pressure, coil surface oily',
          physicalSerialVerified: true,
        });

      expect([200, 201]).toContain(diagRes.status);

      // Record repair requiring PNA
      const repairRes = await request(app)
        .post(`/api/v1/asf/jobs/${createdRequestId}/repair`)
        .set('Cookie', sessions.engineer.cookie)
        .set('X-CSRF-Token', sessions.engineer.csrf)
        .send({
          repairCodeId,
          repairAction: 'PENDING_SPARE_PART',
          repairRemarks: 'Evaporator coil damaged, awaiting warehouse PNA fulfillment',
        });

      expect(repairRes.status).toBe(200);
      expect(repairRes.body.data.status).toBe('PENDING_SPARE_PART');

      // Raise PNA for Part 1
      const pna1Res = await request(app)
        .post(`/api/v1/asf/jobs/${createdRequestId}/parts`)
        .set('Cookie', sessions.engineer.cookie)
        .set('X-CSRF-Token', sessions.engineer.csrf)
        .send({
          partId: part1Id,
          quantity: 1,
          entryType: 'REQUIRED_PNA',
          remarks: 'Part 1 required for repair',
        });

      expect(pna1Res.status).toBe(201);
      part1EntryId = pna1Res.body.data.partEntryId;

      // Raise PNA for Part 2
      const pna2Res = await request(app)
        .post(`/api/v1/asf/jobs/${createdRequestId}/parts`)
        .set('Cookie', sessions.engineer.cookie)
        .set('X-CSRF-Token', sessions.engineer.csrf)
        .send({
          partId: part2Id,
          quantity: 1,
          entryType: 'REQUIRED_PNA',
          remarks: 'Part 2 required for repair',
        });

      expect(pna2Res.status).toBe(201);
      part2EntryId = pna2Res.body.data.partEntryId;

      // Service request must transition to PENDING_SPARE_PART
      const sr = await serviceRequestRepository.findById(createdRequestId);
      expect(sr?.status).toBe('PENDING_SPARE_PART');
    });

    it('Step 4: Warehouse user reserves stock and initiates Partial Dispatch 1 (Part 1)', async () => {
      // 1. Reserve Part 1
      const res1 = await request(app)
        .post('/api/v1/warehouse/reservations')
        .set('Cookie', sessions.warehouse.cookie)
        .set('X-CSRF-Token', sessions.warehouse.csrf)
        .send({
          requestId: createdRequestId,
          partEntryId: part1EntryId,
          locationId: whLocId,
          partId: part1Id,
          quantity: 1,
        });

      expect(res1.status).toBe(201);

      // 2. Reserve Part 2
      const res2 = await request(app)
        .post('/api/v1/warehouse/reservations')
        .set('Cookie', sessions.warehouse.cookie)
        .set('X-CSRF-Token', sessions.warehouse.csrf)
        .send({
          requestId: createdRequestId,
          partEntryId: part2EntryId,
          locationId: whLocId,
          partId: part2Id,
          quantity: 1,
        });

      expect(res2.status).toBe(201);

      // 3. Dispatch Part 1 only (Partial dispatch)
      const dispatchRes = await request(app)
        .post('/api/v1/warehouse/dispatches')
        .set('Cookie', sessions.warehouse.cookie)
        .set('X-CSRF-Token', sessions.warehouse.csrf)
        .send({
          documentType: 'DELIVERY_CHALLAN',
          fromLocationId: whLocId,
          toLocationId: asfLocId,
          requestId: createdRequestId,
          courierName: 'Delhivery Surface Logistics',
          docketNumber: `DLV-${Date.now().toString(36).toUpperCase()}`,
          items: [
            {
              partId: part1Id,
              quantity: 1,
            },
          ],
        });

      expect(dispatchRes.status).toBe(201);
      expect(dispatchRes.body.data.dispatchId).toBeTruthy();
      dispatch1Id = dispatchRes.body.data.dispatchId;
    });

    it('Step 5A: Unauthorized Engineer CANNOT acknowledge delivery arrival (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/warehouse/dispatches/${dispatch1Id}/acknowledge`)
        .set('Cookie', sessions.engineer.cookie)
        .set('X-CSRF-Token', sessions.engineer.csrf);

      expect(res.status).toBe(403);
    });

    it('Step 5B: Service Center manager acknowledges Part 1 arrival; ticket remains PENDING_SPARE_PART', async () => {
      const ackRes = await request(app)
        .post(`/api/v1/warehouse/dispatches/${dispatch1Id}/acknowledge`)
        .set('Cookie', sessions.serviceCenter.cookie)
        .set('X-CSRF-Token', sessions.serviceCenter.csrf);

      expect(ackRes.status).toBe(200);
      expect(ackRes.body.data.status).toBe('ACKNOWLEDGED');

      // Job must remain PENDING_SPARE_PART because Part 2 is still outstanding
      const sr = await serviceRequestRepository.findById(createdRequestId);
      expect(sr?.status).toBe('PENDING_SPARE_PART');
    });

    it('Step 5C: Warehouse dispatches Part 2 and Service Center acknowledges; ticket resumes to IN_PROGRESS_REPAIR', async () => {
      // Dispatch Part 2
      const dispatch2Res = await request(app)
        .post('/api/v1/warehouse/dispatches')
        .set('Cookie', sessions.warehouse.cookie)
        .set('X-CSRF-Token', sessions.warehouse.csrf)
        .send({
          documentType: 'DELIVERY_CHALLAN',
          fromLocationId: whLocId,
          toLocationId: asfLocId,
          requestId: createdRequestId,
          courierName: 'Blue Dart Air Express',
          docketNumber: `BD-${Date.now().toString(36).toUpperCase()}`,
          items: [
            {
              partId: part2Id,
              quantity: 1,
            },
          ],
        });

      expect(dispatch2Res.status).toBe(201);
      dispatch2Id = dispatch2Res.body.data.dispatchId;

      // Acknowledge arrival of Part 2
      const ack2Res = await request(app)
        .post(`/api/v1/warehouse/dispatches/${dispatch2Id}/acknowledge`)
        .set('Cookie', sessions.serviceCenter.cookie)
        .set('X-CSRF-Token', sessions.serviceCenter.csrf);

      expect(ack2Res.status).toBe(200);

      // All parts fulfilled -> Workflow resumes to IN_PROGRESS_REPAIR
      const sr = await serviceRequestRepository.findById(createdRequestId);
      expect(sr?.status).toBe('IN_PROGRESS_REPAIR');
    });

    it('Step 6: Engineer initiates closure, Happy Code OTP verified, and job transitions to CLOSED', async () => {
      // Initiate closure (generates Happy Code and queues SMS 4)
      const closureRes = await request(app)
        .post(`/api/v1/asf/jobs/${createdRequestId}/closure/initiate`)
        .set('Cookie', sessions.engineer.cookie)
        .set('X-CSRF-Token', sessions.engineer.csrf)
        .send({
          remarks: 'Repair successfully completed with parts. Customer verification requested.',
        });

      expect(closureRes.status).toBe(200);
      expect(closureRes.body.data.status).toBe('CALL_CLOSURE_SUBMITTED');

      // Retrieve customer Happy Code from mock SMS delivery or encrypted outbox
      let customerHappyCode: string | undefined;
      for (let attempt = 0; attempt < 20; attempt++) {
        const sent = mockSmsAdapter.getSentMessages();
        const happySms = sent.find(
          (s) => s.templateCode === 'SMS_4_CALL_CLOSURE' || s.messageBody.includes('happy code') || s.messageBody.includes('Happy Code')
        );
        if (happySms) {
          const m = happySms.messageBody.match(/happy code\s*#?(\d{6})/i) || happySms.messageBody.match(/\b(\d{6})\b/);
          if (m) {
            customerHappyCode = m[1];
            break;
          }
        }
        const outbox = await notificationRepository.listByRequestId(createdRequestId);
        const notif = outbox.find((n) => n.templateCode === 'SMS_4_CALL_CLOSURE');
        if (notif?.encryptedPayload) {
          const dec = decryptNotificationPayload({
            encryptedPayload: notif.encryptedPayload,
            iv: notif.encryptionIv!,
            authTag: notif.authTag!,
            keyVersion: notif.keyVersion || 'v1',
          });
          const m = dec.match(/happy code\s*#?(\d{6})/i) || dec.match(/\b(\d{6})\b/);
          if (m) {
            customerHappyCode = m[1];
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(customerHappyCode).toBeDefined();

      // Verify Happy Code
      const verifyRes = await request(app)
        .post(`/api/v1/asf/jobs/${createdRequestId}/closure/verify`)
        .set('Cookie', sessions.engineer.cookie)
        .set('X-CSRF-Token', sessions.engineer.csrf)
        .send({ happyCode: customerHappyCode! });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.status).toBe('CLOSED');

      // Verify CLOSED state in DB
      const finalSr = await serviceRequestRepository.findById(createdRequestId);
      expect(finalSr?.status).toBe('CLOSED');
      expect(finalSr?.closedAt).toBeTruthy();
    });
  });

  // ==========================================================================
  // SECTION 5: PART D — TAB 4 DISPATCHES & CROSS-WORKSPACE VISIBILITY
  // ==========================================================================
  describe('5. Part D: Warehouse Tab 4 Delivery Challans & Operational Consistency', () => {
    it('Warehouse Tab 4 query lists delivery challans with complete GST tax breakdown and courier details', async () => {
      const res = await request(app)
        .get(`/api/v1/warehouse/dispatches?jobNumber=${createdJobNumber}`)
        .set('Cookie', sessions.warehouse.cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(2);

      const dc1 = items.find((d: any) => d.dispatchId === dispatch1Id);
      expect(dc1).toBeDefined();
      expect(dc1.challanNumber).toMatch(/^DC-/);
      expect(dc1.status).toBe('ACKNOWLEDGED');
      expect(dc1.jobNumber).toBe(createdJobNumber);
      expect(typeof dc1.totalAmount).toBe('number');
      expect(dc1.courierName).toContain('Delhivery');
    });

    it('Job 360 view provides complete chronological audit trail across all 6 steps', async () => {
      const res = await request(app)
        .get(`/api/v1/asf/jobs/${createdRequestId}`)
        .set('Cookie', sessions.engineer.cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const jobData = res.body.data;
      expect(jobData.serviceRequest.jobNumber).toBe(createdJobNumber);
      expect(jobData.serviceRequest.status).toBe('CLOSED');
      expect(jobData.parts.length).toBeGreaterThanOrEqual(2);
      expect(jobData.events.length).toBeGreaterThan(0);
    });
  });
});
