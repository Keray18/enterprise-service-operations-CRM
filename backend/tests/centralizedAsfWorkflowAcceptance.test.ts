import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getOracleConnection } from '../src/database/oraclePool.js';
import { inventoryRepository } from '../src/database/repositories/inventoryRepository.js';
import { locationRepository } from '../src/database/repositories/locationRepository.js';
import { notificationRepository } from '../src/database/repositories/notificationRepository.js';
import { serviceRequestRepository } from '../src/database/repositories/serviceRequestRepository.js';
import { verificationRepository } from '../src/database/repositories/verificationRepository.js';
import { mockSmsAdapter } from '../src/services/notificationService.js';
import { decryptNotificationPayload } from '../src/utils/cryptoUtils.js';

describe('P0 Centralized Service Center Assignment & End-to-End Operational Workflow Acceptance Suite', () => {
  const app = createApp();

  // Seeded invariant dev credentials
  const credentials = {
    admin: { username: 'admin', password: 'Admin@123', role: 'ADMIN' },
    callcenter: { username: 'callcenter', password: 'callCenter@123', role: 'CALL_CENTER' },
    serviceCenter: { username: 'service_center', password: 'serviceCenter@123', role: 'ASF' },
    warehouse: { username: 'warehouse', password: 'wareHouse@123', role: 'WAREHOUSE' },
    engineer: { username: 'mumbai_tech_1', password: 'fieldEng@123', role: 'ENGINEER' },
  };

  const sessions = {
    admin: { cookie: '', csrf: '' },
    callcenter: { cookie: '', csrf: '' },
    serviceCenter: { cookie: '', csrf: '' },
    warehouse: { cookie: '', csrf: '' },
    engineer: { cookie: '', csrf: '' },
  };

  let defaultAsfLocId = '';
  let alternateAsfLocId = '';
  let whLocId = '';
  let brandId = '';
  let productId = '';
  let modelId = '';
  let stateId = '';
  let cityId = '';
  let customerId = '';
  let customerMobile = '';
  let partId = '';
  let faultId = '';
  let repairCodeId = '';
  let engineerUserId = '';
  let callcenterUserId = '';
  let serialLength = 15;

  function makeSerial(prefix: string, len: number) {
    const hex = crypto.randomBytes(Math.ceil(len / 2)).toString('hex').toUpperCase();
    return (prefix + hex).slice(0, len);
  }

  // Variables for Scenario A (Happy Path)
  let happyRequestId = '';
  let happyJobNumber = '';
  let happySerial = '';
  let happyCheckInOtp = '';
  let happyPartEntryId = '';
  let happyDispatchId = '';
  let happyClosureOtp = '';

  // Variables for Scenario B (Ambiguous Default ASF)
  let ambiguousRequestId = '';

  // Variables for Scenario E (Reassignment / Rejection)
  let rejectRequestId = '';
  let rejectJobNumber = '';

  beforeAll(async () => {
    // 1. Authenticate all 5 invariant personas
    for (const [key, cred] of Object.entries(credentials)) {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: cred.username, password: cred.password });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);

      const cookieHeader = loginRes.headers['set-cookie'];
      const cookie = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader || '';
      const csrf = loginRes.body?.data?.csrfToken || '';

      (sessions as any)[key] = { cookie, csrf };
    }

    // 2. Query Oracle DB for foreign keys & locations
    const conn = await getOracleConnection();
    try {
      const userRes: any = await conn.execute(
        `SELECT USER_ID, USERNAME, LOCATION_ID FROM APP_USERS WHERE USERNAME IN ('service_center', 'warehouse', 'mumbai_tech_1', 'callcenter')`,
        {},
        { outFormat: 4002 }
      );
      const scUser = (userRes.rows || []).find((r: any) => r.USERNAME === 'service_center');
      const whUser = (userRes.rows || []).find((r: any) => r.USERNAME === 'warehouse');
      const engUser = (userRes.rows || []).find((r: any) => r.USERNAME === 'mumbai_tech_1');
      const ccUser = (userRes.rows || []).find((r: any) => r.USERNAME === 'callcenter');

      defaultAsfLocId = scUser?.LOCATION_ID;
      whLocId = whUser?.LOCATION_ID;
      engineerUserId = engUser?.USER_ID;
      callcenterUserId = ccUser?.USER_ID;

      // Find an alternate active ASF location for reassignment tests
      const altAsfRes: any = await conn.execute(
        `SELECT LOCATION_ID FROM LOCATIONS WHERE PARTY_TYPE = 'ASF' AND IS_ACTIVE = 'Y' AND LOCATION_ID <> :defId FETCH FIRST 1 ROWS ONLY`,
        { defId: defaultAsfLocId },
        { outFormat: 4002 }
      );
      alternateAsfLocId = altAsfRes.rows?.[0]?.LOCATION_ID || defaultAsfLocId;

      // Ensure default ASF has IS_DEFAULT = 'Y'
      await conn.execute(
        `UPDATE LOCATIONS SET IS_DEFAULT = 'Y' WHERE LOCATION_ID = :defId`,
        { defId: defaultAsfLocId }
      );
      // Ensure all other ASFs have IS_DEFAULT = 'N' initially
      await conn.execute(
        `UPDATE LOCATIONS SET IS_DEFAULT = 'N' WHERE LOCATION_ID <> :defId`,
        { defId: defaultAsfLocId }
      );
      // Ensure engineer is assigned to default ASF
      await conn.execute(
        `UPDATE APP_USERS SET LOCATION_ID = :locId WHERE USER_ID = :engId`,
        { locId: defaultAsfLocId, engId: engineerUserId }
      );
      await conn.commit();

      const modRes: any = await conn.execute(
        `SELECT m.MODEL_ID, m.BRAND_ID, m.PRODUCT_ID, m.SERIAL_NUMBER_LENGTH
         FROM MODELS m
         JOIN PART_CODES p ON (p.BRAND_ID = m.BRAND_ID OR p.BRAND_ID IS NULL)
         WHERE m.IS_ACTIVE = 'Y' AND p.IS_ACTIVE = 'Y' AND m.IS_JOB_CREATION_ALLOWED = 'Y'
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
      const partRes: any = await conn.execute(
        `SELECT PART_ID FROM PART_CODES WHERE (BRAND_ID = :bId OR BRAND_ID IS NULL) AND IS_ACTIVE = 'Y' FETCH FIRST 1 ROWS ONLY`,
        { bId: modRes.rows[0].BRAND_ID },
        { outFormat: 4002 }
      );

      brandId = modRes.rows[0].BRAND_ID;
      productId = modRes.rows[0].PRODUCT_ID;
      modelId = modRes.rows[0].MODEL_ID;
      serialLength = Number(modRes.rows[0].SERIAL_NUMBER_LENGTH || 15);
      stateId = geoRes.rows[0].STATE_ID;
      cityId = geoRes.rows[0].CITY_ID;
      customerId = custRes.rows[0].CUSTOMER_ID;
      customerMobile = custRes.rows[0].PRIMARY_MOBILE;
      faultId = faultRes.rows[0].FAULT_ID;
      repairCodeId = repRes.rows[0].REPAIR_CODE_ID;
      partId = partRes.rows[0].PART_ID;

      // Seed warehouse inventory for partId to ensure PNA dispatch can be fulfilled
      const currentWhStock = await inventoryRepository.getBalance(whLocId, partId);
      if (currentWhStock < 20) {
        await inventoryRepository.createEntry({
          locationId: whLocId,
          partId,
          entryType: 'GRN_RECEIPT',
          quantity: 50,
          unitCost: 200,
          referenceType: 'PO',
          referenceId: 'PO-SEEDED-P0',
          performedBy: whUser.USER_ID,
          remarks: 'Seeded initial warehouse stock for P0 acceptance tests',
        });
      }
    } finally {
      await conn.close();
    }
  });

  afterAll(async () => {
    // Restore default ASF setup
    const conn = await getOracleConnection();
    try {
      await conn.execute(
        `UPDATE LOCATIONS SET IS_DEFAULT = 'Y' WHERE LOCATION_ID = :defId`,
        { defId: defaultAsfLocId }
      );
      await conn.execute(
        `UPDATE LOCATIONS SET IS_DEFAULT = 'N' WHERE LOCATION_ID <> :defId`,
        { defId: defaultAsfLocId }
      );
      await conn.commit();
    } finally {
      await conn.close();
    }
  });

  // ==============================================================================
  // SCENARIO A: Happy Path End-to-End Operational Journey
  // ==============================================================================
  describe('Scenario A: Happy Path End-to-End Operational Journey', () => {
    it('A1. Call Center registers complaint; verifies automatic default ASF assignment without engineer', async () => {
      happySerial = makeSerial('HP', serialLength);

      const regRes = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', sessions.callcenter.cookie)
        .set('x-csrf-token', sessions.callcenter.csrf)
        .send({
          customerId,
          brandId,
          productId,
          modelId,
          serialNumber: happySerial,
          purchaseDate: '2026-01-15',
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          pincode: '400001',
          stateId,
          cityId,
          addressLine: '101 Marine Drive, Mumbai',
          problemDescription: 'Intermittent cooling failure requiring diagnostic inspection',
        });

      if (regRes.status !== 201) {
        console.error('A1 REGISTRATION ERROR:', regRes.status, JSON.stringify(regRes.body));
      }
      expect(regRes.status).toBe(201);
      expect(regRes.body.success).toBe(true);

      const sr = regRes.body.data.serviceRequest;
      happyRequestId = sr.requestId;
      happyJobNumber = sr.jobNumber;

      expect(happyJobNumber).toMatch(/^TT/);
      expect(sr.status).toBe('ASSIGNED_TO_ASF');
      expect(sr.assignedLocationId).toBe(defaultAsfLocId);
      expect(sr.assignedLocationName).toBeDefined();
      expect(sr.assignedEngineerId).toBeUndefined();
      expect(sr.assignmentSource).toBe('AUTOMATIC_DEFAULT_ASF');
      expect(sr.acknowledgedAt).toBeUndefined();

      // Verify Oracle DB lifecycle events
      const conn = await getOracleConnection();
      try {
        const eventsRes: any = await conn.execute(
          `SELECT EVENT_TYPE, FROM_STATE, TO_STATE FROM SERVICE_REQUEST_EVENTS WHERE REQUEST_ID = :id ORDER BY CREATED_AT ASC`,
          { id: happyRequestId },
          { outFormat: 4002 }
        );
        const eventTypes = eventsRes.rows.map((r: any) => r.EVENT_TYPE);
        expect(eventTypes).toContain('CALL_REGISTERED');
        expect(eventTypes).toContain('CALL_ASSIGNED_TO_ASF');
      } finally {
        await conn.close();
      }
    });

    it('A2. Service Center manager acknowledges complaint (Step A); records ACKNOWLEDGED_BY and stops 48h SLA timer', async () => {
      const ackRes = await request(app)
        .post(`/api/v1/asf/requests/${happyRequestId}/acknowledge`)
        .set('Cookie', sessions.serviceCenter.cookie)
        .set('x-csrf-token', sessions.serviceCenter.csrf)
        .send({ remarks: 'Franchise manager acknowledged incoming ticket' });

      expect(ackRes.status).toBe(200);
      expect(ackRes.body.success).toBe(true);
      expect(ackRes.body.data.acknowledgedAt).toBeDefined();
      expect(ackRes.body.data.acknowledgedBy).toBe('service_center');
      expect(ackRes.body.data.serviceRequest.status).toBe('ACKNOWLEDGED');

      // Idempotency check: acknowledging an already acknowledged ticket returns 200 cleanly
      const ackAgain = await request(app)
        .post(`/api/v1/asf/requests/${happyRequestId}/acknowledge`)
        .set('Cookie', sessions.serviceCenter.cookie)
        .set('x-csrf-token', sessions.serviceCenter.csrf)
        .send({});
      expect(ackAgain.status).toBe(200);
      expect(ackAgain.body.data.acknowledgedAt).toBe(ackRes.body.data.acknowledgedAt);
    });

    it('A3. Service Center manager manually assigns field technician & appointment (Step B); emits Check-In OTP', async () => {
      const apptDate = new Date(Date.now() + 86400000).toISOString().split('T')[0] + 'T10:00:00.000Z';

      const dispatchRes = await request(app)
        .post(`/api/v1/asf/requests/${happyRequestId}/dispatch`)
        .set('Cookie', sessions.serviceCenter.cookie)
        .set('x-csrf-token', sessions.serviceCenter.csrf)
        .send({
          appointmentDate: apptDate,
          appointmentSlot: '10:00 AM - 01:00 PM',
          engineerId: engineerUserId,
          travelDistanceKm: 12,
          areaType: 'LOCAL',
          remarks: 'Dispatched primary field technician for on-site diagnosis',
        });

      expect(dispatchRes.status).toBe(200);
      expect(dispatchRes.body.success).toBe(true);
      expect(dispatchRes.body.data.serviceRequest.status).toBe('APPOINTMENT_SCHEDULED');
      expect(dispatchRes.body.data.serviceRequest.assignedEngineerId).toBe(engineerUserId);

      // Verify OTP generation in verification table and retrieve Check-In OTP
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
        const outbox = await notificationRepository.listByRequestId(happyRequestId);
        const notif = outbox.find((n) => n.templateCode === 'SMS_02_APPOINTMENT');
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

      happyCheckInOtp = checkInOtp || '';
      expect(happyCheckInOtp).toMatch(/^\d{6}$/);

      const ver = await verificationRepository.findByRequestId(happyRequestId);
      expect(ver?.checkInOtpHash).toBeDefined();
      expect(ver?.checkInOtpSalt).toBeDefined();
    });

    it('A4. Field technician performs on-site check-in using customer OTP', async () => {
      const checkInRes = await request(app)
        .post(`/api/v1/asf/requests/${happyRequestId}/check-in`)
        .set('Cookie', sessions.engineer.cookie)
        .set('x-csrf-token', sessions.engineer.csrf)
        .send({
          otp: happyCheckInOtp,
          remarks: 'Arrived at customer residence; OTP verified',
        });

      expect(checkInRes.status).toBe(200);
      expect(checkInRes.body.success).toBe(true);
      expect(checkInRes.body.data.serviceRequest.status).toBe('TECHNICIAN_CHECKED_IN');
      expect(checkInRes.body.data.serviceRequest.checkedInAt).toBeDefined();
    });

    it('A5. Field technician records diagnosis and orders spare part (PNA required)', async () => {
      const diagRes = await request(app)
        .post(`/api/v1/asf/jobs/${happyRequestId}/diagnosis`)
        .set('Cookie', sessions.engineer.cookie)
        .set('x-csrf-token', sessions.engineer.csrf)
        .send({
          faultId,
          voeDescription: 'Defective compressor relay requiring replacement part',
          observations: 'Low refrigerant pressure, coil surface oily',
          physicalSerialVerified: true,
        });

      expect([200, 201]).toContain(diagRes.status);

      const repairRes = await request(app)
        .post(`/api/v1/asf/jobs/${happyRequestId}/repair`)
        .set('Cookie', sessions.engineer.cookie)
        .set('x-csrf-token', sessions.engineer.csrf)
        .send({
          repairCodeId,
          repairAction: 'PENDING_SPARE_PART',
          repairRemarks: 'Evaporator coil damaged, awaiting warehouse PNA fulfillment',
        });

      expect(repairRes.status).toBe(200);
      expect(repairRes.body.data.status).toBe('PENDING_SPARE_PART');

      const pnaRes = await request(app)
        .post(`/api/v1/asf/jobs/${happyRequestId}/parts`)
        .set('Cookie', sessions.engineer.cookie)
        .set('x-csrf-token', sessions.engineer.csrf)
        .send({
          partId,
          quantity: 1,
          entryType: 'REQUIRED_PNA',
          remarks: 'Part required for repair',
        });

      expect(pnaRes.status).toBe(201);
      happyPartEntryId = pnaRes.body.data.partEntryId;
      expect(happyPartEntryId).toBeDefined();
    });

    it('A6. Warehouse fulfills PNA order with Stock Dispatch and Delivery Challan', async () => {
      const dispatchRes = await request(app)
        .post('/api/v1/warehouse/dispatches')
        .set('Cookie', sessions.warehouse.cookie)
        .set('x-csrf-token', sessions.warehouse.csrf)
        .send({
          documentType: 'DELIVERY_CHALLAN',
          fromLocationId: whLocId,
          toLocationId: defaultAsfLocId,
          requestId: happyRequestId,
          courierName: 'SpeedPost Express',
          docketNumber: 'DLV-' + Date.now().toString(36).toUpperCase(),
          items: [
            {
              partId,
              quantity: 1,
            },
          ],
        });

      expect(dispatchRes.status).toBe(201);
      expect(dispatchRes.body.success).toBe(true);
      happyDispatchId = dispatchRes.body.data.dispatchId;

      // Verify Service Request transitions to PART_DISPATCHED_TO_ASF
      const checkRes = await request(app)
        .get(`/api/v1/call-center/requests/${happyRequestId}`)
        .set('Cookie', sessions.admin.cookie);
      expect(checkRes.body.data.status).toBe('PART_DISPATCHED_TO_ASF');
    });

    it('A7. Service Center receives and acknowledges delivery challan; stock credited to ASF on-hand', async () => {
      const receiveRes = await request(app)
        .post(`/api/v1/warehouse/dispatches/${happyDispatchId}/acknowledge`)
        .set('Cookie', sessions.serviceCenter.cookie)
        .set('x-csrf-token', sessions.serviceCenter.csrf);

      expect(receiveRes.status).toBe(200);
      expect(receiveRes.body.success).toBe(true);

      // After acknowledging part receipt, ticket moves to IN_PROGRESS_REPAIR
      const checkRes = await request(app)
        .get(`/api/v1/call-center/requests/${happyRequestId}`)
        .set('Cookie', sessions.admin.cookie);
      expect(checkRes.body.data.status).toBe('IN_PROGRESS_REPAIR');
    });

    it('A8. Field technician completes repair and submits call closure; generates Happy Code', async () => {
      const closureRes = await request(app)
        .post(`/api/v1/asf/jobs/${happyRequestId}/closure/initiate`)
        .set('Cookie', sessions.engineer.cookie)
        .set('x-csrf-token', sessions.engineer.csrf)
        .send({
          remarks: 'Repair successfully completed with parts. Customer verification requested.',
          laborCharge: 250,
        });

      expect(closureRes.status).toBe(200);
      expect(closureRes.body.success).toBe(true);
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
        const outbox = await notificationRepository.listByRequestId(happyRequestId);
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

      happyClosureOtp = customerHappyCode || '';
      expect(happyClosureOtp).toMatch(/^\d{6}$/);
    });

    it('A9. Call Center verifies customer Happy Code and finalizes closure', async () => {
      const verifyRes = await request(app)
        .post(`/api/v1/asf/jobs/${happyRequestId}/closure/verify`)
        .set('Cookie', sessions.engineer.cookie)
        .set('x-csrf-token', sessions.engineer.csrf)
        .send({
          happyCode: happyClosureOtp,
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data.status).toBe('CLOSED');

      // Verify CLOSED in DB
      const finalSr = await serviceRequestRepository.findById(happyRequestId);
      expect(finalSr?.status).toBe('CLOSED');
      expect(finalSr?.closedAt).toBeDefined();
    });
  });

  // ==============================================================================
  // SCENARIO B: Missing / Ambiguous Default ASF Handling
  // ==============================================================================
  describe('Scenario B: Missing / Ambiguous Default ASF Handling', () => {
    it('B1. Ambiguous default ASF: complaint remains in REGISTERED with assignmentFailedReason and appears in assignment_required queue', async () => {
      const conn = await getOracleConnection();
      try {
        // Set two default ASFs to trigger ambiguous configuration
        await conn.execute(
          `UPDATE LOCATIONS SET IS_DEFAULT = 'Y' WHERE LOCATION_ID IN (:id1, :id2)`,
          { id1: defaultAsfLocId, id2: alternateAsfLocId }
        );
        await conn.commit();
      } finally {
        await conn.close();
      }

      const ambSerial = makeSerial('AMB', serialLength);

      const regRes = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', sessions.callcenter.cookie)
        .set('x-csrf-token', sessions.callcenter.csrf)
        .send({
          customerId,
          brandId,
          productId,
          modelId,
          serialNumber: ambSerial,
          purchaseDate: '2026-02-01',
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          pincode: '400001',
          stateId,
          cityId,
          addressLine: 'Flat 4B, Nariman Point, Mumbai',
          problemDescription: 'Unit power fluctuating; requires technician',
        });

      if (regRes.status !== 201) {
        console.error('B1 REGISTRATION ERROR:', regRes.status, JSON.stringify(regRes.body));
      }
      expect(regRes.status).toBe(201);
      const sr = regRes.body.data.serviceRequest;
      ambiguousRequestId = sr.requestId;

      expect(sr.status).toBe('REGISTERED');
      expect(sr.assignedLocationId).toBeUndefined();
      expect(sr.assignmentSource).toBe('UNASSIGNED_PENDING');
      expect(sr.assignmentFailedReason).toContain('ambiguous default ASF configuration');

      // Verify it appears in Service Center queue under assignment_required view
      const queueRes = await request(app)
        .get(`/api/v1/asf/queue?view=assignment_required&q=${encodeURIComponent(sr.jobNumber)}`)
        .set('Cookie', sessions.serviceCenter.cookie);
      expect(queueRes.status).toBe(200);
      const found = queueRes.body.data.items.find((i: any) => i.requestId === ambiguousRequestId);
      expect(found).toBeDefined();

      // Verify it appears in Call Center tab new_registered
      const ccRes = await request(app)
        .get(`/api/v1/call-center/requests?tab=new_registered&jobNumber=${encodeURIComponent(sr.jobNumber)}`)
        .set('Cookie', sessions.callcenter.cookie);
      expect(ccRes.status).toBe(200);
      const foundCc = ccRes.body.data.items.find((i: any) => i.requestId === ambiguousRequestId);
      expect(foundCc).toBeDefined();

      // Clean up: reset alternate ASF to 'N'
      const cleanupConn = await getOracleConnection();
      try {
        await cleanupConn.execute(
          `UPDATE LOCATIONS SET IS_DEFAULT = 'N' WHERE LOCATION_ID = :id`,
          { id: alternateAsfLocId }
        );
        await cleanupConn.commit();
      } finally {
        await cleanupConn.close();
      }
    });

    it('B2. Administrator resolves unassigned ticket via Reassign API; moves to ASSIGNED_TO_ASF', async () => {
      const reassignRes = await request(app)
        .post(`/api/v1/asf/requests/${ambiguousRequestId}/reassign`)
        .set('Cookie', sessions.admin.cookie)
        .set('x-csrf-token', sessions.admin.csrf)
        .send({
          newLocationId: defaultAsfLocId,
          remarks: 'Resolved ambiguous routing; assigned to Regional Service Center',
        });

      expect(reassignRes.status).toBe(200);
      expect(reassignRes.body.success).toBe(true);
      expect(reassignRes.body.data.serviceRequest.status).toBe('ASSIGNED_TO_ASF');
      expect(reassignRes.body.data.serviceRequest.assignedLocationId).toBe(defaultAsfLocId);
      expect(reassignRes.body.data.serviceRequest.assignmentSource).toBe('REASSIGNMENT');
      expect(reassignRes.body.data.serviceRequest.assignmentFailedReason).toBeUndefined();
    });
  });

  // ==============================================================================
  // SCENARIO C: Central Visibility & Engineer Isolation
  // ==============================================================================
  describe('Scenario C: Central Visibility & Engineer Isolation', () => {
    it('C1. Two managers (or service_center and admin) see the centralized queue across all ASFs', async () => {
      const scQueue = await request(app)
        .get('/api/v1/asf/queue?view=all')
        .set('Cookie', sessions.serviceCenter.cookie);
      expect(scQueue.status).toBe(200);

      const adminQueue = await request(app)
        .get('/api/v1/asf/queue?view=all')
        .set('Cookie', sessions.admin.cookie);
      expect(adminQueue.status).toBe(200);

      // Both queues return positive records without location-scoping blind spots
      expect(scQueue.body.data.total).toBeGreaterThan(0);
      expect(adminQueue.body.data.total).toBeGreaterThan(0);
    });

    it('C2. Field engineer strictly sees ONLY complaints assigned to their authenticated identity', async () => {
      const engQueue = await request(app)
        .get('/api/v1/asf/queue?view=all')
        .set('Cookie', sessions.engineer.cookie);

      expect(engQueue.status).toBe(200);
      const items = engQueue.body.data.items;

      for (const item of items) {
        expect(item.assignedEngineerId).toBe(engineerUserId);
      }
    });

    it('C3. Field engineer cannot manipulate assignedEngineerId query parameter to access other jobs', async () => {
      // Engineer attempts to pass admin or arbitrary ID in query parameter
      const tamperedQueue = await request(app)
        .get(`/api/v1/asf/queue?assignedEngineerId=${callcenterUserId}`)
        .set('Cookie', sessions.engineer.cookie);

      expect(tamperedQueue.status).toBe(200);
      const items = tamperedQueue.body.data.items;

      // Backend security boundary overrides parameter with actor.userId
      for (const item of items) {
        expect(item.assignedEngineerId).toBe(engineerUserId);
      }
    });
  });

  // ==============================================================================
  // SCENARIO D: Manual Engineer Assignment Validation
  // ==============================================================================
  describe('Scenario D: Manual Engineer Assignment Validation', () => {
    let testRequestId = '';

    beforeAll(async () => {
      const regRes = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', sessions.callcenter.cookie)
        .set('x-csrf-token', sessions.callcenter.csrf)
        .send({
          customerId,
          brandId,
          productId,
          modelId,
          serialNumber: makeSerial('MD', serialLength),
          purchaseDate: '2026-01-20',
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          pincode: '400001',
          stateId,
          cityId,
          addressLine: 'Test Address',
          problemDescription: 'Testing manual technician validation',
        });
      if (regRes.status !== 201) {
        console.error('D REGISTRATION ERROR:', regRes.status, JSON.stringify(regRes.body));
      }
      expect(regRes.status).toBe(201);
      testRequestId = regRes.body.data.serviceRequest.requestId;
    });

    it('D1. Rejects assignment to non-existent or inactive technician with 400 INVALID_ENGINEER', async () => {
      const fakeUuid = crypto.randomUUID();
      const res = await request(app)
        .post(`/api/v1/asf/requests/${testRequestId}/dispatch`)
        .set('Cookie', sessions.serviceCenter.cookie)
        .set('x-csrf-token', sessions.serviceCenter.csrf)
        .send({
          appointmentDate: new Date(Date.now() + 86400000).toISOString(),
          appointmentSlot: '10:00 AM - 01:00 PM',
          engineerId: fakeUuid,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ENGINEER');
    });

    it('D2. Rejects assignment to user who lacks FIELD ENGINEER role with 400 INVALID_ENGINEER_ROLE', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/requests/${testRequestId}/dispatch`)
        .set('Cookie', sessions.serviceCenter.cookie)
        .set('x-csrf-token', sessions.serviceCenter.csrf)
        .send({
          appointmentDate: new Date(Date.now() + 86400000).toISOString(),
          appointmentSlot: '10:00 AM - 01:00 PM',
          engineerId: callcenterUserId, // Call center user does not have ENGINEER role
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ENGINEER_ROLE');
    });
  });

  // ==============================================================================
  // SCENARIO E: Reassignment & Rejection with Mandatory Reason
  // ==============================================================================
  describe('Scenario E: Reassignment & Rejection with Mandatory Reason', () => {
    beforeAll(async () => {
      const regRes = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', sessions.callcenter.cookie)
        .set('x-csrf-token', sessions.callcenter.csrf)
        .send({
          customerId,
          brandId,
          productId,
          modelId,
          serialNumber: makeSerial('REJ', serialLength),
          purchaseDate: '2026-02-10',
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          pincode: '400001',
          stateId,
          cityId,
          addressLine: '90 Colaba Causeway, Mumbai',
          problemDescription: 'Special commercial model needing specialized franchise',
        });
      if (regRes.status !== 201) {
        console.error('E REGISTRATION ERROR:', regRes.status, JSON.stringify(regRes.body));
      }
      expect(regRes.status).toBe(201);
      rejectRequestId = regRes.body.data.serviceRequest.requestId;
      rejectJobNumber = regRes.body.data.serviceRequest.jobNumber;
    });

    it('E1. Rejection requires mandatory reason and non-empty remarks', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/requests/${rejectRequestId}/reject-assignment`)
        .set('Cookie', sessions.serviceCenter.cookie)
        .set('x-csrf-token', sessions.serviceCenter.csrf)
        .send({
          reason: 'UNSUPPORTED_PRODUCT',
          remarks: '   ', // Blank remarks
        });

      expect(res.status).toBe(400);
    });

    it('E2. Field Engineer cannot reject franchise assignment (403 FORBIDDEN_ROLE)', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/requests/${rejectRequestId}/reject-assignment`)
        .set('Cookie', sessions.engineer.cookie)
        .set('x-csrf-token', sessions.engineer.csrf)
        .send({
          reason: 'UNSUPPORTED_PRODUCT',
          remarks: 'Engineer attempting rejection',
        });

      expect(res.status).toBe(403);
    });

    it('E3. ASF manager rejects assignment; sets REASSIGNMENT_REQUESTED = Y and surfaces in assignment_required queue', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/requests/${rejectRequestId}/reject-assignment`)
        .set('Cookie', sessions.serviceCenter.cookie)
        .set('x-csrf-token', sessions.serviceCenter.csrf)
        .send({
          reason: 'UNSUPPORTED_PRODUCT',
          remarks: 'This franchise lacks specialized equipment for commercial induction cooktop',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.serviceRequest.reassignmentRequested).toBe('Y');
      expect(res.body.data.serviceRequest.reassignmentReason).toBe('UNSUPPORTED_PRODUCT');
      expect(res.body.data.serviceRequest.status).not.toBe('CANCELLED');

      // Verify appears in assignment_required queue
      const queueRes = await request(app)
        .get(`/api/v1/asf/queue?view=assignment_required&q=${encodeURIComponent(rejectJobNumber)}`)
        .set('Cookie', sessions.serviceCenter.cookie);
      expect(queueRes.status).toBe(200);
      const found = queueRes.body.data.items.find((i: any) => i.requestId === rejectRequestId);
      expect(found).toBeDefined();
    });

    it('E4. Admin reassigns rejected ticket across ASFs; resets REASSIGNMENT_REQUESTED to N and updates assignedLocationId', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/requests/${rejectRequestId}/reassign`)
        .set('Cookie', sessions.admin.cookie)
        .set('x-csrf-token', sessions.admin.csrf)
        .send({
          newLocationId: alternateAsfLocId,
          remarks: 'Reassigned to specialized commercial franchise center',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.serviceRequest.status).toBe('ASSIGNED_TO_ASF');
      expect(res.body.data.serviceRequest.assignedLocationId).toBe(alternateAsfLocId);
      expect(res.body.data.serviceRequest.reassignmentRequested).toBe('N');
    });
  });

  // ==============================================================================
  // SCENARIO G: Duplicate Check & Retry Safety
  // ==============================================================================
  describe('Scenario G: Duplicate Check & Retry Safety', () => {
    it('G1. Duplicate check endpoint returns open complaints matching mobile number', async () => {
      const dupRes = await request(app)
        .get(`/api/v1/call-center/complaints/check-duplicates?mobile=${customerMobile}`)
        .set('Cookie', sessions.callcenter.cookie);

      expect(dupRes.status).toBe(200);
      expect(dupRes.body.success).toBe(true);
      expect(dupRes.body.data.hasDuplicates).toBe(true);
      expect(dupRes.body.data.duplicates.length).toBeGreaterThan(0);
    });

    it('G2. Duplicate check endpoint returns open complaint matching serial number', async () => {
      const dupRes = await request(app)
        .get(`/api/v1/call-center/complaints/check-duplicates?serialNumber=${happySerial}`)
        .set('Cookie', sessions.callcenter.cookie);

      expect(dupRes.status).toBe(200);
      expect(dupRes.body.success).toBe(true);
      // Notice happyRequestId was closed, so open duplicates may be 0 for this serial
      expect(Array.isArray(dupRes.body.data.duplicates)).toBe(true);
    });

    it('G3. Idempotent registration with duplicate idempotencyKey returns existing complaint without creating duplicate', async () => {
      const testKey = 'IDEMPOTENCY-' + Date.now();
      const idemSerial = makeSerial('IDEM', serialLength);

      const firstCall = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', sessions.callcenter.cookie)
        .set('x-csrf-token', sessions.callcenter.csrf)
        .send({
          customerId,
          brandId,
          productId,
          modelId,
          serialNumber: idemSerial,
          purchaseDate: '2026-03-01',
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          pincode: '400001',
          stateId,
          cityId,
          addressLine: 'Idempotency test address',
          problemDescription: 'Testing idempotency deduplication',
          idempotencyKey: testKey,
        });

      if (firstCall.status !== 201) {
        console.error('G3 REGISTRATION ERROR:', firstCall.status, JSON.stringify(firstCall.body));
      }
      expect(firstCall.status).toBe(201);
      const firstJobNo = firstCall.body.data.serviceRequest.jobNumber;

      // Second identical call
      const secondCall = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', sessions.callcenter.cookie)
        .set('x-csrf-token', sessions.callcenter.csrf)
        .send({
          customerId,
          brandId,
          productId,
          modelId,
          serialNumber: idemSerial,
          purchaseDate: '2026-03-01',
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          pincode: '400001',
          stateId,
          cityId,
          addressLine: 'Idempotency test address',
          problemDescription: 'Testing idempotency deduplication',
          idempotencyKey: testKey,
        });

      expect(secondCall.status).toBe(201);
      expect(secondCall.body.data.serviceRequest.jobNumber).toBe(firstJobNo);
      expect(secondCall.body.data.serviceRequest.requestId).toBe(firstCall.body.data.serviceRequest.requestId);
    });
  });

  // ==============================================================================
  // SCENARIO H: Negative Authorization Tests
  // ==============================================================================
  describe('Scenario H: Negative Authorization Tests', () => {
    it('H1. Field engineer cannot acknowledge service requests (403 FORBIDDEN_ROLE)', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/requests/${rejectRequestId}/acknowledge`)
        .set('Cookie', sessions.engineer.cookie)
        .set('x-csrf-token', sessions.engineer.csrf)
        .send({});

      expect(res.status).toBe(403);
    });

    it('H2. Field engineer cannot dispatch or assign service requests (403 FORBIDDEN_ROLE)', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/requests/${rejectRequestId}/dispatch`)
        .set('Cookie', sessions.engineer.cookie)
        .set('x-csrf-token', sessions.engineer.csrf)
        .send({
          appointmentDate: new Date().toISOString(),
          appointmentSlot: '10:00 AM - 01:00 PM',
          engineerId: engineerUserId,
        });

      expect(res.status).toBe(403);
    });

    it('H3. Field engineer cannot reassign complaints between Service Centers (403 FORBIDDEN_ROLE)', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/requests/${rejectRequestId}/reassign`)
        .set('Cookie', sessions.engineer.cookie)
        .set('x-csrf-token', sessions.engineer.csrf)
        .send({ newLocationId: defaultAsfLocId });

      expect(res.status).toBe(403);
    });

    it('H4. Non-admin (Service Center manager) cannot reassign complaints between Service Centers (403 FORBIDDEN_ROLE)', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/requests/${rejectRequestId}/reassign`)
        .set('Cookie', sessions.serviceCenter.cookie)
        .set('x-csrf-token', sessions.serviceCenter.csrf)
        .send({ newLocationId: alternateAsfLocId });

      expect(res.status).toBe(403);
    });
  });

  // ==============================================================================
  // SCENARIO I: UI Integration Contracts
  // ==============================================================================
  describe('Scenario I: UI Integration Contracts', () => {
    it('I1. Call Center tab queries (all, new_registered, assigned_asf, in_progress, closed) return 200 with contract data', async () => {
      const tabs = ['all', 'new_registered', 'assigned_asf', 'in_progress', 'closed'];

      for (const tab of tabs) {
        const res = await request(app)
          .get(`/api/v1/call-center/requests?tab=${tab}`)
          .set('Cookie', sessions.callcenter.cookie);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data.items)).toBe(true);
        expect(typeof res.body.data.total).toBe('number');
      }
    });

    it('I2. Service Center 12 operational views all return 200 with SLA status and enriched items', async () => {
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
        'assignment_required',
      ];

      for (const view of views) {
        const res = await request(app)
          .get(`/api/v1/asf/queue?view=${view}`)
          .set('Cookie', sessions.serviceCenter.cookie);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data.items)).toBe(true);
        expect(typeof res.body.data.total).toBe('number');

        for (const item of res.body.data.items) {
          expect(item.slaStatus).toBeDefined();
          expect(item.slaStatus.remainingHours).toBeDefined();
        }
      }
    });
  });
});

