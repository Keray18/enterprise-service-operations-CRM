import crypto from 'crypto';
import request from 'supertest';
import { Persona, PersonaKey, provisionPersonas } from './helpers/isolatedPersonas.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { generateTemporaryPassword, hashPassword } from '../src/services/passwordService.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getOracleConnection } from '../src/database/oraclePool.js';
import { serviceRequestEventRepository } from '../src/database/repositories/serviceRequestEventRepository.js';
import { serviceRequestRepository } from '../src/database/repositories/serviceRequestRepository.js';
import { verificationRepository } from '../src/database/repositories/verificationRepository.js';

describe('P0 Centralized Technician Directory & Manual Assignment Recovery Acceptance Suite', () => {
  const app = createApp();

  // Isolated per-suite personas (pinned shared dev credentials were removed in Phase 3)
  let personas: Record<PersonaKey, Persona>;
  let secondEngineerUsername = '';
  let secondEngineerPassword = '';

  const sessions = {
    admin: { cookie: '', csrf: '' },
    callcenter: { cookie: '', csrf: '' },
    serviceCenter: { cookie: '', csrf: '' },
    warehouse: { cookie: '', csrf: '' },
    engineer: { cookie: '', csrf: '' },
  };

  let defaultAsfLocId = '';
  let alternateAsfLocId = '';
  let engineerUserId = '';
  let inactiveEngineerId = '';
  let secondEngineerUserId = '';
  let secondEngineerLocationId = '';
  let brandId = '';
  let productId = '';
  let modelId = '';
  let stateId = '';
  let cityId = '';
  let customerId = '';
  let customerMobile = '9876543210';
  let serialLength = 15;

  function makeSerial(prefix: string, len: number) {
    const hex = crypto.randomBytes(Math.ceil(len / 2)).toString('hex').toUpperCase();
    return (prefix + hex).slice(0, len);
  }

  // Tracking IDs for test service requests
  let req1Id = '';
  let req1JobNumber = '';
  let req2CrossId = '';
  let req2JobNumber = '';
  let req6AckId = '';
  let req6JobNumber = '';
  let req11IdempId = '';
  let req11JobNumber = '';

  beforeAll(async () => {
    // 1. Authenticate all 5 invariant personas
    personas = await provisionPersonas(app, { tag: 'tech_dir' });
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
      const engUser = (userRes.rows || []).find((r: any) => r.USERNAME === personas.engineer.username);

      defaultAsfLocId = scUser?.LOCATION_ID;
      engineerUserId = engUser?.USER_ID;

      // Find an alternate active ASF location
      const altAsfRes: any = await conn.execute(
        `SELECT LOCATION_ID FROM LOCATIONS WHERE PARTY_TYPE = 'ASF' AND IS_ACTIVE = 'Y' AND LOCATION_ID <> :defId FETCH FIRST 1 ROWS ONLY`,
        { defId: defaultAsfLocId },
        { outFormat: 4002 }
      );
      if (altAsfRes.rows?.[0]?.LOCATION_ID) {
        alternateAsfLocId = altAsfRes.rows[0].LOCATION_ID;
      } else {
        // Create an alternate ASF location for cross-center testing
        alternateAsfLocId = crypto.randomUUID();
        await conn.execute(
          `INSERT INTO LOCATIONS (LOCATION_ID, LOCATION_CODE, LOCATION_NAME, PARTY_TYPE, IS_ACTIVE, IS_DEFAULT, IS_TEST_FIXTURE, DATA_ORIGIN, CREATED_BY)
           VALUES (:locId, 'ASF_ALT_99', 'Pune Alternate Service Center', 'ASF', 'Y', 'N', 'Y', 'TEST_FIXTURE', 'TEST_SETUP')`,
          { locId: alternateAsfLocId }
        );
      }

      // Ensure mumbai_tech_1 is active and associated with defaultAsfLocId
      await conn.execute(
        `UPDATE APP_USERS SET LOCATION_ID = :locId, IS_ACTIVE = 'Y' WHERE USER_ID = :engId`,
        { locId: defaultAsfLocId, engId: engineerUserId }
      );

      // Create or find an inactive engineer for Scenario 3
      const inactEngRes: any = await conn.execute(
        `SELECT u.USER_ID FROM APP_USERS u
         JOIN USER_ROLES ur ON u.USER_ID = ur.USER_ID
         JOIN ROLES r ON ur.ROLE_ID = r.ROLE_ID
         WHERE r.CODE = 'ENGINEER' AND u.IS_ACTIVE = 'N' FETCH FIRST 1 ROWS ONLY`,
        {},
        { outFormat: 4002 }
      );
      if (inactEngRes.rows?.[0]?.USER_ID) {
        inactiveEngineerId = inactEngRes.rows[0].USER_ID;
      } else {
        inactiveEngineerId = crypto.randomUUID();
        await conn.execute(
          `INSERT INTO APP_USERS (USER_ID, USERNAME, EMAIL, FULL_NAME, PASSWORD_HASH, PHONE_NUMBER, LOCATION_ID, IS_ACTIVE)
           VALUES (:userId, 'inactive_tech_test', 'inactive@crm.com', 'Inactive Technician', 'argon2id_hash', '9999990000', :locId, 'N')`,
          { userId: inactiveEngineerId, locId: defaultAsfLocId }
        );
        // Link to ENGINEER role
        const engRoleRes: any = await conn.execute(
          `SELECT ROLE_ID FROM ROLES WHERE CODE = 'ENGINEER'`,
          {},
          { outFormat: 4002 }
        );
        const roleId = engRoleRes.rows[0].ROLE_ID;
        await conn.execute(
          `INSERT INTO USER_ROLES (USER_ID, ROLE_ID, ASSIGNED_BY) VALUES (:userId, :roleId, '00000000-0000-0000-0000-000000000001')`,
          { userId: inactiveEngineerId, roleId }
        );
      }

      // Second active engineer for Scenario 9 (isolated account with its own random credential)
      secondEngineerUserId = crypto.randomUUID();
      secondEngineerLocationId = alternateAsfLocId;
      secondEngineerUsername = `t_eng2_${Date.now().toString(36)}`;
      secondEngineerPassword = generateTemporaryPassword();
      await userRepository.createUser({
        userId: secondEngineerUserId,
        username: secondEngineerUsername,
        email: `${secondEngineerUsername}@crm.test`,
        fullName: 'Field Engineer Pune',
        passwordHash: await hashPassword(secondEngineerPassword),
        phoneNumber: '9999990002',
        locationId: alternateAsfLocId,
      });
      await rbacRepository.assignRoleToUser(secondEngineerUserId, 'ENGINEER', 'TEST_PERSONA_SETUP');

      // Find active model & product
      const modRes: any = await conn.execute(
        `SELECT m.MODEL_ID, m.BRAND_ID, m.PRODUCT_ID, m.SERIAL_NUMBER_LENGTH
         FROM MODELS m
         WHERE m.IS_ACTIVE = 'Y' AND m.IS_JOB_CREATION_ALLOWED = 'Y'
         FETCH FIRST 1 ROWS ONLY`,
        {},
        { outFormat: 4002 }
      );
      modelId = modRes.rows[0].MODEL_ID;
      brandId = modRes.rows[0].BRAND_ID;
      productId = modRes.rows[0].PRODUCT_ID;
      serialLength = modRes.rows[0].SERIAL_NUMBER_LENGTH || 15;

      const geoRes: any = await conn.execute(
        `SELECT p.CITY_ID, p.STATE_ID FROM PINCODES p WHERE p.PINCODE = '400001'`,
        {},
        { outFormat: 4002 }
      );
      stateId = geoRes.rows[0].STATE_ID;
      cityId = geoRes.rows[0].CITY_ID;

      // Find or create customer
      const custRes: any = await conn.execute(
        `SELECT CUSTOMER_ID, PRIMARY_MOBILE FROM CUSTOMERS WHERE IS_ACTIVE = 'Y' FETCH FIRST 1 ROWS ONLY`,
        {},
        { outFormat: 4002 }
      );
      customerId = custRes.rows[0].CUSTOMER_ID;
      customerMobile = custRes.rows[0].PRIMARY_MOBILE;

      await conn.commit();
    } finally {
      await conn.close();
    }
  });

  afterAll(async () => {
    // Restore default state
    const conn = await getOracleConnection();
    try {
      await conn.execute(
        `UPDATE APP_USERS SET LOCATION_ID = :locId WHERE USER_ID = :engId`,
        { locId: defaultAsfLocId, engId: engineerUserId }
      );
      await conn.commit();
    } finally {
      await conn.close();
    }
  });

  // Helper to create a complaint via Call Center
  async function createTestComplaint(serialPrefix: string, forcedLocationId?: string): Promise<{ requestId: string; jobNumber: string }> {
    const serial = makeSerial(serialPrefix, serialLength);
    const regRes = await request(app)
      .post('/api/v1/call-center/complaints')
      .set('Cookie', sessions.callcenter.cookie)
      .set('x-csrf-token', sessions.callcenter.csrf)
      .send({
        customerId,
        brandId,
        productId,
        modelId,
        serialNumber: serial,
        purchaseDate: '2026-01-15',
        callType: 'REPAIR',
        serviceType: 'ON_SITE',
        pincode: '400001',
        stateId,
        cityId,
        addressLine: '101 Marine Drive, Mumbai',
        problemDescription: 'Unit power fluctuating requiring diagnostic inspection',
      });

    if (regRes.status !== 201) {
      console.error('REGISTRATION ERROR:', regRes.status, JSON.stringify(regRes.body));
    }
    expect(regRes.status).toBe(201);
    expect(regRes.body.success).toBe(true);

    const sr = regRes.body.data.serviceRequest;
    const reqId = sr.requestId;
    const jNum = sr.jobNumber;

    if (forcedLocationId) {
      const conn = await getOracleConnection();
      try {
        await conn.execute(
          `UPDATE SERVICE_REQUESTS SET ASSIGNED_LOCATION_ID = :locId WHERE REQUEST_ID = :reqId`,
          { locId: forcedLocationId, reqId }
        );
        await conn.commit();
      } finally {
        await conn.close();
      }
    }

    return { requestId: reqId, jobNumber: jNum };
  }

  // =========================================================================
  // SCENARIO 1: Active engineer mumbai_tech_1 appears in directory
  // =========================================================================
  it('Scenario 1: Active engineer mumbai_tech_1 appears in directory with complete contract and open job count', async () => {
    const res = await request(app)
      .get('/api/v1/asf/engineers')
      .set('Cookie', sessions.serviceCenter.cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const tech1 = res.body.data.find((e: any) => e.username === personas.engineer.username);
    expect(tech1).toBeDefined();
    expect(tech1.userId).toBe(engineerUserId);
    expect(tech1.fullName).toBe('Field Engineer Mumbai');
    expect(tech1.isActive).toBe('Y');
    expect(tech1.homeLocationId).toBe(defaultAsfLocId);
    expect(typeof tech1.openJobCount).toBe('number');
    expect(['AVAILABLE', 'ACTIVE', 'BUSY']).toContain(tech1.availabilityStatus);
  });

  // =========================================================================
  // SCENARIO 2: Service Center manager can assign cross-location engineer
  // =========================================================================
  it('Scenario 2: Service Center manager can assign a cross-location engineer to a complaint', async () => {
    // Create complaint assigned to default ASF location
    const complaint = await createTestComplaint('XLOC', defaultAsfLocId);
    req2CrossId = complaint.requestId;
    req2JobNumber = complaint.jobNumber;

    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const dispatchRes = await request(app)
      .post(`/api/v1/asf/requests/${req2CrossId}/dispatch`)
      .set('Cookie', sessions.serviceCenter.cookie)
      .set('x-csrf-token', sessions.serviceCenter.csrf)
      .send({
        engineerId: secondEngineerUserId, // engineer belongs to alternateAsfLocId, complaint is defaultAsfLocId
        appointmentDate: tomorrow,
        appointmentSlot: 'MORNING',
        travelDistanceKm: 12,
        areaType: 'LOCAL',
        remarks: 'Cross-location assignment Mumbai center -> Pune engineer',
      });

    expect(dispatchRes.status).toBe(200);
    expect(dispatchRes.body.success).toBe(true);
    expect(dispatchRes.body.data.serviceRequest.status).toBe('APPOINTMENT_SCHEDULED');
    expect(dispatchRes.body.data.serviceRequest.assignedEngineerId).toBe(secondEngineerUserId);
  });

  // =========================================================================
  // SCENARIO 3: Inactive engineers cannot be assigned
  // =========================================================================
  it('Scenario 3: Inactive engineers cannot be assigned and return 400 INVALID_ENGINEER', async () => {
    const complaint = await createTestComplaint('INACT');
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const dispatchRes = await request(app)
      .post(`/api/v1/asf/requests/${complaint.requestId}/dispatch`)
      .set('Cookie', sessions.serviceCenter.cookie)
      .set('x-csrf-token', sessions.serviceCenter.csrf)
      .send({
        engineerId: inactiveEngineerId,
        appointmentDate: tomorrow,
        appointmentSlot: 'MORNING',
      });

    expect(dispatchRes.status).toBe(400);
    expect(dispatchRes.body.success).toBe(false);
    expect(dispatchRes.body.error?.code).toBe('INVALID_ENGINEER');
  });

  // =========================================================================
  // SCENARIO 4: Users without management permissions (ENGINEER) get 403 on /engineers
  // =========================================================================
  it('Scenario 4: Field engineer user receives 403 Forbidden on /api/v1/asf/engineers', async () => {
    const res = await request(app)
      .get('/api/v1/asf/engineers')
      .set('Cookie', sessions.engineer.cookie);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // =========================================================================
  // SCENARIO 5: Engineers cannot assign or reassign themselves
  // =========================================================================
  it('Scenario 5: Field engineer cannot call dispatch endpoint to assign themselves', async () => {
    const complaint = await createTestComplaint('ENGSELF');
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const res = await request(app)
      .post(`/api/v1/asf/requests/${complaint.requestId}/dispatch`)
      .set('Cookie', sessions.engineer.cookie)
      .set('x-csrf-token', sessions.engineer.csrf)
      .send({
        engineerId: engineerUserId,
        appointmentDate: tomorrow,
        appointmentSlot: 'MORNING',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // =========================================================================
  // SCENARIO 6: Acknowledged complaint scheduled without repeating acknowledgment
  // =========================================================================
  it('Scenario 6: Acknowledged complaint scheduled without duplicate acknowledgment event', async () => {
    const complaint = await createTestComplaint('ACKSCHED');
    req6CrossId: req6AckId = complaint.requestId;
    req6JobNumber = complaint.jobNumber;

    // 1. Explicitly acknowledge complaint
    const ackRes = await request(app)
      .post(`/api/v1/asf/requests/${req6AckId}/acknowledge`)
      .set('Cookie', sessions.serviceCenter.cookie)
      .set('x-csrf-token', sessions.serviceCenter.csrf)
      .send({ remarks: 'First acknowledged by manager' });

    expect(ackRes.status).toBe(200);
    expect(ackRes.body.data.serviceRequest.status).toBe('ACKNOWLEDGED');

    // 2. Dispatch the acknowledged complaint
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const dispatchRes = await request(app)
      .post(`/api/v1/asf/requests/${req6AckId}/dispatch`)
      .set('Cookie', sessions.serviceCenter.cookie)
      .set('x-csrf-token', sessions.serviceCenter.csrf)
      .send({
        engineerId: engineerUserId,
        appointmentDate: tomorrow,
        appointmentSlot: 'AFTERNOON',
        remarks: 'Scheduled after acknowledgment',
      });

    expect(dispatchRes.status).toBe(200);
    expect(dispatchRes.body.data.serviceRequest.status).toBe('APPOINTMENT_SCHEDULED');

    // 3. Verify event log has exactly 1 ACKNOWLEDGED event and 1 APPOINTMENT_SCHEDULED event
    const conn = await getOracleConnection();
    try {
      const evRes: any = await conn.execute(
        `SELECT EVENT_TYPE FROM SERVICE_REQUEST_EVENTS WHERE REQUEST_ID = :reqId ORDER BY CREATED_AT ASC`,
        { reqId: req6AckId },
        { outFormat: 4002 }
      );
      const eventTypes = (evRes.rows || []).map((r: any) => r.EVENT_TYPE);
      const ackCount = eventTypes.filter((t: string) => t === 'ASF_ACKNOWLEDGED' || t === 'ACKNOWLEDGED').length;
      const schedCount = eventTypes.filter((t: string) => t === 'APPOINTMENT_SCHEDULED').length;

      expect(ackCount).toBe(1);
      expect(schedCount).toBe(1);
    } finally {
      await conn.close();
    }
  });

  // =========================================================================
  // SCENARIO 7: Successful dispatch persists correct engineer and appointment in DB
  // =========================================================================
  it('Scenario 7: Successful dispatch persists correct engineer and appointment details in Oracle DB', async () => {
    const complaint = await createTestComplaint('PERSIST');
    req1Id = complaint.requestId;
    req1JobNumber = complaint.jobNumber;

    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const dispatchRes = await request(app)
      .post(`/api/v1/asf/requests/${req1Id}/dispatch`)
      .set('Cookie', sessions.serviceCenter.cookie)
      .set('x-csrf-token', sessions.serviceCenter.csrf)
      .send({
        engineerId: engineerUserId,
        appointmentDate: tomorrow,
        appointmentSlot: 'EVENING',
        travelDistanceKm: 8,
        areaType: 'LOCAL',
        remarks: 'Persistence validation dispatch',
      });

    expect(dispatchRes.status).toBe(200);

    const conn = await getOracleConnection();
    try {
      const res: any = await conn.execute(
        `SELECT STATUS, ASSIGNED_ENGINEER_ID, APPOINTMENT_SLOT, TRAVEL_DISTANCE_KM, AREA_TYPE
         FROM SERVICE_REQUESTS WHERE REQUEST_ID = :reqId`,
        { reqId: req1Id },
        { outFormat: 4002 }
      );
      const row = res.rows[0];
      expect(row.STATUS).toBe('APPOINTMENT_SCHEDULED');
      expect(row.ASSIGNED_ENGINEER_ID).toBe(engineerUserId);
      expect(row.APPOINTMENT_SLOT).toBe('EVENING');
      expect(Number(row.TRAVEL_DISTANCE_KM)).toBe(8);
      expect(row.AREA_TYPE).toBe('LOCAL');
    } finally {
      await conn.close();
    }
  });

  // =========================================================================
  // SCENARIO 8: Assigned job appears in correct engineer queue
  // =========================================================================
  it('Scenario 8: Assigned job appears in correct engineer queue', async () => {
    const res = await request(app)
      .get(`/api/v1/asf/queue?q=${encodeURIComponent(req1JobNumber)}`)
      .set('Cookie', sessions.engineer.cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const items = res.body.data.items || [];
    const found = items.find((item: any) => item.requestId === req1Id);
    expect(found).toBeDefined();
    expect(found.jobNumber).toBe(req1JobNumber);
    expect(found.assignedEngineerId).toBe(engineerUserId);
  });

  // =========================================================================
  // SCENARIO 9: Another engineer cannot view or modify that job
  // =========================================================================
  it('Scenario 9: Another engineer cannot view or modify that job', async () => {
    // Authenticate as second engineer
    const secLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: secondEngineerUsername, password: secondEngineerPassword });
    expect(secLogin.status).toBe(200);

    const cookieHeader = secLogin.headers['set-cookie'];
    const secCookie = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader || '';
    const secCsrf = secLogin.body?.data?.csrfToken || '';

    {
      // Query queue as second engineer: req1Id must NOT be visible
      const queueRes = await request(app)
        .get('/api/v1/asf/queue')
        .set('Cookie', secCookie);

      expect(queueRes.status).toBe(200);
      const foundInSec = (queueRes.body.data.items || []).find((i: any) => i.requestId === req1Id);
      expect(foundInSec).toBeUndefined();

      // Attempt Check-In as second engineer on req1Id: must fail
      const checkInRes = await request(app)
        .post(`/api/v1/asf/requests/${req1Id}/check-in`)
        .set('Cookie', secCookie)
        .set('x-csrf-token', secCsrf)
        .send({ otp: '123456' });

      expect(checkInRes.status).toBe(403);
    }
  });

  // =========================================================================
  // SCENARIO 10: SMS 2 is queued exactly once
  // =========================================================================
  it('Scenario 10: SMS 2 notification is queued exactly once with encrypted OTP payload', async () => {
    const conn = await getOracleConnection();
    try {
      const res: any = await conn.execute(
        `SELECT NOTIFICATION_ID, TEMPLATE_CODE, IS_ENCRYPTED, STATUS
         FROM NOTIFICATIONS_OUTBOX
         WHERE REQUEST_ID = :reqId AND TEMPLATE_CODE = 'SMS_02_APPOINTMENT'`,
        { reqId: req1Id },
        { outFormat: 4002 }
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].IS_ENCRYPTED).toBe('Y');
    } finally {
      await conn.close();
    }
  });

  // =========================================================================
  // SCENARIO 11: Duplicate dispatch with idempotency key does not re-queue SMS
  // =========================================================================
  it('Scenario 11: Duplicate dispatch with idempotency key does not re-queue SMS or create duplicate appointment', async () => {
    const complaint = await createTestComplaint('IDEMPTEST');
    req11IdempId = complaint.requestId;
    req11JobNumber = complaint.jobNumber;

    const idempKey = `IDEMP-DISP-${Date.now()}`;
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // First dispatch
    const firstRes = await request(app)
      .post(`/api/v1/asf/requests/${req11IdempId}/dispatch`)
      .set('Cookie', sessions.serviceCenter.cookie)
      .set('x-csrf-token', sessions.serviceCenter.csrf)
      .send({
        engineerId: engineerUserId,
        appointmentDate: tomorrow,
        appointmentSlot: 'MORNING',
        idempotencyKey: idempKey,
      });

    expect(firstRes.status).toBe(200);
    expect(firstRes.body.data.smsQueued).toBe(true);

    // Second dispatch with same idempotencyKey
    const secondRes = await request(app)
      .post(`/api/v1/asf/requests/${req11IdempId}/dispatch`)
      .set('Cookie', sessions.serviceCenter.cookie)
      .set('x-csrf-token', sessions.serviceCenter.csrf)
      .send({
        engineerId: engineerUserId,
        appointmentDate: tomorrow,
        appointmentSlot: 'MORNING',
        idempotencyKey: idempKey,
      });

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data.smsQueued).toBe(false);

    // Verify SMS count in outbox is still exactly 1
    const conn = await getOracleConnection();
    try {
      const res: any = await conn.execute(
        `SELECT COUNT(*) AS CNT FROM NOTIFICATIONS_OUTBOX WHERE REQUEST_ID = :reqId AND TEMPLATE_CODE = 'SMS_02_APPOINTMENT'`,
        { reqId: req11IdempId },
        { outFormat: 4002 }
      );
      expect(Number(res.rows[0].CNT)).toBe(1);
    } finally {
      await conn.close();
    }
  });

  // =========================================================================
  // SCENARIO 12: 48-hour SLA remains consistent after assignment
  // =========================================================================
  it('Scenario 12: 48-hour SLA expiry remains consistent after assignment and ACKNOWLEDGED_AT is set', async () => {
    const conn = await getOracleConnection();
    try {
      const res: any = await conn.execute(
        `SELECT REGISTERED_AT, SLA_48H_EXPIRES_AT, ACKNOWLEDGED_AT
         FROM SERVICE_REQUESTS WHERE REQUEST_ID = :reqId`,
        { reqId: req1Id },
        { outFormat: 4002 }
      );
      const row = res.rows[0];
      expect(row.SLA_48H_EXPIRES_AT).toBeDefined();
      expect(row.ACKNOWLEDGED_AT).toBeDefined();

      const regTime = new Date(row.REGISTERED_AT).getTime();
      const slaTime = new Date(row.SLA_48H_EXPIRES_AT).getTime();
      const diffHours = (slaTime - regTime) / (1000 * 3600);
      expect(Math.round(diffHours)).toBe(48);
    } finally {
      await conn.close();
    }
  });

  // =========================================================================
  // SCENARIO 13: API error produces actionable UI error rather than empty list
  // =========================================================================
  it('Scenario 13: API error produces actionable structured error response', async () => {
    const badDispatch = await request(app)
      .post(`/api/v1/asf/requests/${req1Id}/dispatch`)
      .set('Cookie', sessions.serviceCenter.cookie)
      .set('x-csrf-token', sessions.serviceCenter.csrf)
      .send({
        engineerId: '00000000-0000-0000-0000-000000000000', // Non-existent user
        appointmentDate: '2026-10-25',
        appointmentSlot: 'MORNING',
      });

    expect(badDispatch.status).toBe(400);
    expect(badDispatch.body.success).toBe(false);
    expect(badDispatch.body.error?.code).toBe('INVALID_ENGINEER');
    expect(badDispatch.body.error?.message).toMatch(/invalid or inactive/i);
  });

  // =========================================================================
  // SCENARIO 14: Cross-location assignments produce CROSS_LOCATION_ASSIGNMENT event
  // =========================================================================
  it('Scenario 14: Cross-location assignment records auditable CROSS_LOCATION_ASSIGNMENT event in Oracle DB', async () => {
    const conn = await getOracleConnection();
    try {
      const events = await serviceRequestEventRepository.listEventsByRequestId(req2CrossId, conn);
      const crossEvent = events.find((ev) => ev.eventType === 'CROSS_LOCATION_ASSIGNMENT');
      expect(crossEvent).toBeDefined();

      const meta = typeof crossEvent!.metadataJson === 'string'
        ? JSON.parse(crossEvent!.metadataJson)
        : crossEvent!.metadataJson;
      expect(meta.engineerHomeLocationId).toBe(secondEngineerLocationId);
      expect(meta.ticketLocationId).toBe(defaultAsfLocId);
      expect(meta.engineerId).toBe(secondEngineerUserId);
    } finally {
      await conn.close();
    }
  });

  // =========================================================================
  // SCENARIO 15: Existing warehouse, finance, and call center workflows remain unaffected
  // =========================================================================
  it('Scenario 15: Existing Call Center, Warehouse, and Finance workflows remain unaffected', async () => {
    // 1. Call center requests search
    const ccQueue = await request(app)
      .get('/api/v1/call-center/requests')
      .set('Cookie', sessions.callcenter.cookie);
    expect(ccQueue.status).toBe(200);
    expect(ccQueue.body.success).toBe(true);

    // 2. Warehouse inventory stock
    const whStock = await request(app)
      .get('/api/v1/warehouse/stock')
      .set('Cookie', sessions.warehouse.cookie);
    expect(whStock.status).toBe(200);
    expect(whStock.body.success).toBe(true);

    // 3. Admin operational health metrics
    const adminHealth = await request(app)
      .get('/api/v1/reports/admin/dashboard')
      .set('Cookie', sessions.admin.cookie);
    expect(adminHealth.status).toBe(200);
    expect(adminHealth.body.success).toBe(true);
  });
});
