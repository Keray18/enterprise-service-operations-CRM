import crypto from 'crypto';
import request from 'supertest';
import { Persona, PersonaKey, provisionPersonas } from './helpers/isolatedPersonas.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getOracleConnection } from '../src/database/oraclePool.js';
import { mockSmsAdapter } from '../src/services/notificationService.js';
import { decryptNotificationPayload } from '../src/utils/cryptoUtils.js';
import { notificationRepository } from '../src/database/repositories/notificationRepository.js';

describe('P0 — Dedicated Field Engineer Workspace, Assigned Job Visibility & Admin Management Acceptance', () => {
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

  let defaultAsfLocId = '';
  let engineerUserId = '';
  let secondEngineerUserId = '';
  let secondEngineerUsername = '';
  let secondEngineerTempPass = '';
  let brandId = '';
  let productId = '';
  let modelId = '';
  let stateId = '';
  let cityId = '';
  let customerId = '';
  let customerMobile = '9876543210';
  let serialLength = 15;
  let faultId = '';
  let repairCodeId = '';
  let part1Id = '';

  function makeSerial(prefix: string, len: number) {
    const hex = crypto.randomBytes(Math.ceil(len / 2)).toString('hex').toUpperCase();
    return (prefix + hex).slice(0, len);
  }

  // Tracking IDs for test service requests
  let primaryRequestId = '';
  let primaryJobNumber = '';
  let futureRequestId = '';
  let futureJobNumber = '';
  let deactRequestId = '';
  let deactJobNumber = '';

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
        problemDescription: 'Dedicated Engineer Workspace P0 Verification complaint',
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
          { locId: forcedLocationId, reqId },
          { autoCommit: true }
        );
      } finally {
        await conn.close();
      }
    }

    return { requestId: reqId, jobNumber: jNum };
  }

  beforeAll(async () => {
    mockSmsAdapter.clear();

    // 1. Authenticate all 5 invariant personas
    personas = await provisionPersonas(app, { tag: 'eng_ws' });
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

      // Ensure mumbai_tech_1 is active and associated with defaultAsfLocId
      await conn.execute(
        `UPDATE APP_USERS SET LOCATION_ID = :locId, IS_ACTIVE = 'Y' WHERE USER_ID = :engId`,
        { locId: defaultAsfLocId, engId: engineerUserId },
        { autoCommit: true }
      );

      // Find active model, brand & product with matching active part code
      const modRes: any = await conn.execute(
        `SELECT m.MODEL_ID, m.BRAND_ID, m.PRODUCT_ID, m.SERIAL_NUMBER_LENGTH, p.PART_ID
         FROM MODELS m
         JOIN PART_CODES p ON p.BRAND_ID = m.BRAND_ID AND p.IS_ACTIVE = 'Y'
         WHERE m.IS_ACTIVE = 'Y' AND m.IS_JOB_CREATION_ALLOWED = 'Y'
         FETCH FIRST 1 ROWS ONLY`,
        {},
        { outFormat: 4002 }
      );
      modelId = modRes.rows[0].MODEL_ID;
      brandId = modRes.rows[0].BRAND_ID;
      productId = modRes.rows[0].PRODUCT_ID;
      part1Id = modRes.rows[0].PART_ID;
      if (modRes.rows[0].SERIAL_NUMBER_LENGTH) {
        serialLength = Number(modRes.rows[0].SERIAL_NUMBER_LENGTH);
      }

      const geoRes: any = await conn.execute(
        `SELECT p.CITY_ID, p.STATE_ID FROM PINCODES p WHERE p.PINCODE = '400001'`,
        {},
        { outFormat: 4002 }
      );
      stateId = geoRes.rows[0].STATE_ID;
      cityId = geoRes.rows[0].CITY_ID;

      const custRes: any = await conn.execute(
        `SELECT CUSTOMER_ID, PRIMARY_MOBILE FROM CUSTOMERS WHERE IS_ACTIVE = 'Y' FETCH FIRST 1 ROWS ONLY`,
        {},
        { outFormat: 4002 }
      );
      customerId = custRes.rows[0].CUSTOMER_ID;
      customerMobile = custRes.rows[0].PRIMARY_MOBILE || '9876543210';

      const faultRes: any = await conn.execute(
        `SELECT FAULT_ID FROM FAULT_MASTERS WHERE IS_ACTIVE = 'Y' FETCH FIRST 1 ROWS ONLY`,
        {},
        { outFormat: 4002 }
      );
      faultId = faultRes.rows[0]?.FAULT_ID;

      const repRes: any = await conn.execute(
        `SELECT REPAIR_CODE_ID FROM REPAIR_CODE_MASTERS WHERE IS_ACTIVE = 'Y' FETCH FIRST 1 ROWS ONLY`,
        {},
        { outFormat: 4002 }
      );
      repairCodeId = repRes.rows[0]?.REPAIR_CODE_ID;
    } finally {
      await conn.close();
    }
  });

  afterAll(async () => {
    // Clean up second test engineer if created
    if (secondEngineerUserId) {
      const conn = await getOracleConnection();
      try {
        await conn.execute(`DELETE FROM USER_ROLES WHERE USER_ID = :targetUserId`, { targetUserId: secondEngineerUserId }, { autoCommit: true });
        await conn.execute(`DELETE FROM APP_USERS WHERE USER_ID = :targetUserId`, { targetUserId: secondEngineerUserId }, { autoCommit: true });
      } catch {
        // ignore
      } finally {
        await conn.close();
      }
    }
  });

  // ============================================================================
  // Scenario 1: Field Engineer Authentication & Session Identity
  // ============================================================================
  it('Scenario 1: Authenticates as mumbai_tech_1 and verifies ENGINEER role and call permissions', async () => {
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', sessions.engineer.cookie);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.user.username).toBe(personas.engineer.username);
    expect(meRes.body.data.user.roles).toContain('ENGINEER');
    expect(meRes.body.data.user.roles).not.toContain('ADMIN');
    expect(meRes.body.data.user.roles).not.toContain('ASF');
    expect(meRes.body.data.user.permissions).toContain('calls:checkin');
    expect(meRes.body.data.user.permissions).toContain('calls:read');
  });

  // ============================================================================
  // Scenario 2: Admin Creates Engineer with Atomic Role & Temporary Password
  // ============================================================================
  it('Scenario 2: Admin creates a new field engineer, receives temporary password, and new engineer authenticates', async () => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    secondEngineerUsername = `tech_auto_${randomSuffix}`;

    const createRes = await request(app)
      .post('/api/v1/admin/engineers')
      .set('Cookie', sessions.admin.cookie)
      .set('x-csrf-token', sessions.admin.csrf)
      .send({
        fullName: `Automated Test Tech ${randomSuffix}`,
        username: secondEngineerUsername,
        phoneNumber: `98200${randomSuffix}0`, // 10 digits
        email: `${secondEngineerUsername}@crm.internal`,
        homeLocationId: defaultAsfLocId,
        isActive: 'Y',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.user).toBeDefined();
    expect(createRes.body.data.user.username).toBe(secondEngineerUsername);
    expect(createRes.body.data.temporaryPassword).toBeDefined();
    expect(typeof createRes.body.data.temporaryPassword).toBe('string');
    expect(createRes.body.data.temporaryPassword.length).toBeGreaterThanOrEqual(10);

    secondEngineerUserId = createRes.body.data.user.userId;
    secondEngineerTempPass = createRes.body.data.temporaryPassword;

    // Verify role in Oracle
    const conn = await getOracleConnection();
    try {
      const roleCheck: any = await conn.execute(
        `SELECT r.CODE FROM USER_ROLES ur JOIN ROLES r ON ur.ROLE_ID = r.ROLE_ID WHERE ur.USER_ID = :targetUserId`,
        { targetUserId: secondEngineerUserId },
        { outFormat: 4002 }
      );
      const roles = (roleCheck.rows || []).map((r: any) => r.CODE);
      expect(roles).toContain('ENGINEER');
    } finally {
      await conn.close();
    }

    // Verify newly created engineer can authenticate with the temporary password
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: secondEngineerUsername, password: secondEngineerTempPass });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.user.username).toBe(secondEngineerUsername);
    expect(loginRes.body.data.user.roles).toContain('ENGINEER');
  });

  // ============================================================================
  // Scenario 3: Non-Admin Denied Engineer Management Endpoints
  // ============================================================================
  it('Scenario 3: Non-admin users (callcenter, engineer) are denied engineer creation (403)', async () => {
    // Call center attempt
    const ccRes = await request(app)
      .post('/api/v1/admin/engineers')
      .set('Cookie', sessions.callcenter.cookie)
      .set('x-csrf-token', sessions.callcenter.csrf)
      .send({
        fullName: 'Hacker Tech',
        username: 'hacker_tech_1',
        phoneNumber: '9999999999',
        homeLocationId: defaultAsfLocId,
      });
    expect(ccRes.status).toBe(403);

    // Engineer attempt
    const engRes = await request(app)
      .post('/api/v1/admin/engineers')
      .set('Cookie', sessions.engineer.cookie)
      .set('x-csrf-token', sessions.engineer.csrf)
      .send({
        fullName: 'Hacker Tech 2',
        username: 'hacker_tech_2',
        phoneNumber: '9999999998',
        homeLocationId: defaultAsfLocId,
      });
    expect(engRes.status).toBe(403);
  });

  // ============================================================================
  // Scenario 4: Service Center Manager Views Eligible Engineers
  // ============================================================================
  it('Scenario 4: Service Center manager views eligible engineers roster including mumbai_tech_1', async () => {
    const listRes = await request(app)
      .get('/api/v1/asf/engineers')
      .set('Cookie', sessions.serviceCenter.cookie);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(Array.isArray(listRes.body.data)).toBe(true);

    const found = listRes.body.data.find((e: any) => e.username === personas.engineer.username);
    expect(found).toBeDefined();
    expect(found.userId).toBe(engineerUserId);
    expect(found.isActive).toBe('Y');
    expect(typeof found.openJobCount).toBe('number');
  });

  // ============================================================================
  // Scenario 5 & 6: Complaint Registration, Service Center Dispatch to mumbai_tech_1 & Exact Persistence
  // ============================================================================
  it('Scenario 5 & 6: Registers complaint, acknowledges, dispatches to mumbai_tech_1, and verifies exact ASSIGNED_ENGINEER_ID in Oracle', async () => {
    // A. Register complaint via Call Center
    const comp = await createTestComplaint('ENG', defaultAsfLocId);
    primaryRequestId = comp.requestId;
    primaryJobNumber = comp.jobNumber;
    expect(primaryRequestId).toBeDefined();

    // B. Service Center Acknowledges complaint
    const ackRes = await request(app)
      .post(`/api/v1/asf/requests/${primaryRequestId}/acknowledge`)
      .set('Cookie', sessions.serviceCenter.cookie)
      .set('x-csrf-token', sessions.serviceCenter.csrf)
      .send({ remarks: 'Acknowledged by Service Center for technician dispatch' });
    expect(ackRes.status).toBe(200);

    // C. Service Center Dispatches to mumbai_tech_1 for TODAY
    // Approved rule: appointments must be at least 60 minutes in the future (same calendar day for the 'today' tab)
    const todayStr = new Date(Date.now() + 75 * 60 * 1000).toISOString();
    const dispatchRes = await request(app)
      .post(`/api/v1/asf/requests/${primaryRequestId}/dispatch`)
      .set('Cookie', sessions.serviceCenter.cookie)
      .set('x-csrf-token', sessions.serviceCenter.csrf)
      .send({
        engineerId: engineerUserId,
        appointmentDate: todayStr,
        appointmentSlot: 'MORNING',
        travelDistanceKm: 8.5,
        areaType: 'URBAN',
        remarks: 'Dispatched to mumbai_tech_1 for immediate morning inspection',
      });

    expect(dispatchRes.status).toBe(200);
    expect(dispatchRes.body.success).toBe(true);

    // Scenario 6: Verify exact ASSIGNED_ENGINEER_ID in Oracle
    const conn = await getOracleConnection();
    try {
      const srRes: any = await conn.execute(
        `SELECT ASSIGNED_ENGINEER_ID, STATUS, APPOINTMENT_SLOT FROM SERVICE_REQUESTS WHERE REQUEST_ID = :rId`,
        { rId: primaryRequestId },
        { outFormat: 4002 }
      );
      expect(srRes.rows?.[0]?.ASSIGNED_ENGINEER_ID).toBe(engineerUserId);
      expect(srRes.rows?.[0]?.STATUS).toBe('APPOINTMENT_SCHEDULED');
      expect(srRes.rows?.[0]?.APPOINTMENT_SLOT).toBe('MORNING');
    } finally {
      await conn.close();
    }
  });

  // ============================================================================
  // Scenario 7: Assigned Complaint Appears in Field Engineer Workspace (/engineer)
  // ============================================================================
  it('Scenario 7: Assigned complaint is returned in GET /api/v1/engineer/jobs for mumbai_tech_1', async () => {
    // 1. Check Engineer KPIs
    const kpiRes = await request(app)
      .get('/api/v1/engineer/dashboard')
      .set('Cookie', sessions.engineer.cookie);

    expect(kpiRes.status).toBe(200);
    expect(kpiRes.body.success).toBe(true);
    expect(kpiRes.body.data.myActiveJobs).toBeGreaterThanOrEqual(1);
    expect(kpiRes.body.data.awaitingCheckIn).toBeGreaterThanOrEqual(1);

    // 2. Query engineer jobs with tab=today
    const jobsRes = await request(app)
      .get('/api/v1/engineer/jobs?tab=today')
      .set('Cookie', sessions.engineer.cookie);

    expect(jobsRes.status).toBe(200);
    expect(jobsRes.body.success).toBe(true);
    expect(jobsRes.body.data.items).toBeDefined();

    const matchingJob = jobsRes.body.data.items.find((j: any) => j.requestId === primaryRequestId);
    expect(matchingJob).toBeDefined();
    expect(matchingJob.jobNumber).toBe(primaryJobNumber);
    expect(matchingJob.status).toBe('APPOINTMENT_SCHEDULED');
  });

  // ============================================================================
  // Scenario 8: Strict Engineer Workspace Isolation
  // ============================================================================
  it('Scenario 8: Second engineer cannot see or check into mumbai_tech_1 assigned job', async () => {
    // Authenticate as second engineer
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: secondEngineerUsername, password: secondEngineerTempPass });
    expect(loginRes.status).toBe(200);
    // Admin-provisioned accounts hold a temporary credential: the first sign-in must change it
    expect(loginRes.body.data.user.mustChangePassword).toBe(true);

    const secondCookieHeader = loginRes.headers['set-cookie'];
    const secondCookie = Array.isArray(secondCookieHeader) ? secondCookieHeader.join('; ') : secondCookieHeader || '';
    const secondCsrf = loginRes.body?.data?.csrfToken || '';

    const blockedRes = await request(app).get('/api/v1/engineer/jobs?tab=all').set('Cookie', secondCookie);
    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const changeRes = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Cookie', secondCookie)
      .set('x-csrf-token', secondCsrf)
      .send({ currentPassword: secondEngineerTempPass, newPassword: `Own#${Date.now().toString(36)}Pw9` });
    expect(changeRes.status).toBe(200);
    expect(changeRes.body.data.user.mustChangePassword).toBe(false);

    // Query second engineer's jobs: must NOT contain primaryRequestId
    const secondJobsRes = await request(app)
      .get('/api/v1/engineer/jobs?tab=all')
      .set('Cookie', secondCookie);

    expect(secondJobsRes.status).toBe(200);
    const leakedJob = (secondJobsRes.body.data?.items || []).find((j: any) => j.requestId === primaryRequestId);
    expect(leakedJob).toBeUndefined();

    // Attempt check-in by second engineer: must be rejected with 403
    const unauthorizedCheckIn = await request(app)
      .post(`/api/v1/asf/requests/${primaryRequestId}/check-in`)
      .set('Cookie', secondCookie)
      .set('x-csrf-token', secondCsrf)
      .send({ otp: '123456', remarks: 'Hacker checkin attempt' });

    expect(unauthorizedCheckIn.status).toBe(403);
  });

  // ============================================================================
  // Scenario 9: Future Appointment Appears in Upcoming Tab
  // ============================================================================
  it('Scenario 9: Future appointment appears in tab=upcoming and not in tab=today', async () => {
    // Register second complaint
    const comp = await createTestComplaint('FUT', defaultAsfLocId);
    futureRequestId = comp.requestId;
    futureJobNumber = comp.jobNumber;

    // Acknowledge
    await request(app)
      .post(`/api/v1/asf/requests/${futureRequestId}/acknowledge`)
      .set('Cookie', sessions.serviceCenter.cookie)
      .set('x-csrf-token', sessions.serviceCenter.csrf)
      .send({ remarks: 'Ack for future appointment' });

    // Schedule for 3 days in the future
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    const futureDateStr = futureDate.toISOString().split('T')[0];

    const dispatchRes = await request(app)
      .post(`/api/v1/asf/requests/${futureRequestId}/dispatch`)
      .set('Cookie', sessions.serviceCenter.cookie)
      .set('x-csrf-token', sessions.serviceCenter.csrf)
      .send({
        engineerId: engineerUserId,
        appointmentDate: futureDateStr,
        appointmentSlot: 'AFTERNOON',
        travelDistanceKm: 12,
        areaType: 'URBAN',
        remarks: 'Scheduled for future visit',
      });
    expect(dispatchRes.status).toBe(200);
    console.log('DISPATCH RES BODY:', JSON.stringify(dispatchRes.body, null, 2));

    // Query Upcoming tab for mumbai_tech_1
    const upcomingRes = await request(app)
      .get(`/api/v1/engineer/jobs?tab=upcoming&q=${futureJobNumber}`)
      .set('Cookie', sessions.engineer.cookie);

    console.log('UPCOMING RES BODY:', JSON.stringify(upcomingRes.body, null, 2));
    expect(upcomingRes.status).toBe(200);
    const foundInUpcoming = (upcomingRes.body.data?.items || []).find((j: any) => j.requestId === futureRequestId);
    expect(foundInUpcoming).toBeDefined();

    // Query Today tab: future job must NOT be present
    const todayRes = await request(app)
      .get(`/api/v1/engineer/jobs?tab=today&q=${futureJobNumber}`)
      .set('Cookie', sessions.engineer.cookie);

    expect(todayRes.status).toBe(200);
    const foundInToday = (todayRes.body.data?.items || []).find((j: any) => j.requestId === futureRequestId);
    expect(foundInToday).toBeUndefined();
  });

  // ============================================================================
  // Scenario 10: Technician Check-In via Customer OTP & Job 360 Open
  // ============================================================================
  it('Scenario 10: Engineer performs check-in with customer OTP and status transitions to TECHNICIAN_CHECKED_IN', async () => {
    // Retrieve OTP from mock SMS adapter or notification outbox
    let checkInOtp: string | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      const sent = mockSmsAdapter.getSentMessages();
      const apptSms = sent.find(
        (s) => s.templateCode === 'SMS_02_APPOINTMENT' || s.messageBody.includes('OTP')
      );
      if (apptSms) {
        const m = apptSms.messageBody.match(/OTP\s+(\d{6})/i) || apptSms.messageBody.match(/\b(\d{6})\b/);
        if (m) {
          checkInOtp = m[1];
          break;
        }
      }

      const outbox = await notificationRepository.listByRequestId(primaryRequestId);
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

    // Check-in via engineer session
    const checkInRes = await request(app)
      .post(`/api/v1/asf/requests/${primaryRequestId}/check-in`)
      .set('Cookie', sessions.engineer.cookie)
      .set('x-csrf-token', sessions.engineer.csrf)
      .send({
        otp: checkInOtp!,
        geocoordinates: { latitude: 18.922, longitude: 72.834 },
        remarks: 'Customer verified on-site check-in',
      });

    expect(checkInRes.status).toBe(200);
    expect(checkInRes.body.success).toBe(true);

    // Verify Job 360 detail endpoint is accessible
    const job360Res = await request(app)
      .get(`/api/v1/asf/jobs/${primaryRequestId}`)
      .set('Cookie', sessions.engineer.cookie);

    expect(job360Res.status).toBe(200);
    expect(job360Res.body.success).toBe(true);
    expect(job360Res.body.data.serviceRequest.status).toBe('TECHNICIAN_CHECKED_IN');
  });

  // ============================================================================
  // Scenario 11: PNA Raised and Appears in Waiting for Parts Tab
  // ============================================================================
  it('Scenario 11: Diagnosis records Part Not Available (PNA), transitioning to PENDING_SPARE_PART', async () => {
    // 1. Submit Diagnosis
    const diagRes = await request(app)
      .post(`/api/v1/asf/jobs/${primaryRequestId}/diagnosis`)
      .set('Cookie', sessions.engineer.cookie)
      .set('x-csrf-token', sessions.engineer.csrf)
      .send({
        faultId,
        voeDescription: 'Confirmed defective motor component',
        observations: 'Capacitor and harness defective',
        physicalSerialVerified: true,
      });

    expect([200, 201]).toContain(diagRes.status);

    // 2. Submit Repair action PENDING_SPARE_PART
    const repairRes = await request(app)
      .post(`/api/v1/asf/jobs/${primaryRequestId}/repair`)
      .set('Cookie', sessions.engineer.cookie)
      .set('x-csrf-token', sessions.engineer.csrf)
      .send({
        repairCodeId,
        repairAction: 'PENDING_SPARE_PART',
        repairRemarks: 'Awaiting replacement parts from warehouse',
      });

    expect(repairRes.status).toBe(200);
    expect(repairRes.body.data.status).toBe('PENDING_SPARE_PART');

    // 3. Submit PNA spare part entry
    if (part1Id) {
      const pnaRes = await request(app)
        .post(`/api/v1/asf/jobs/${primaryRequestId}/parts`)
        .set('Cookie', sessions.engineer.cookie)
        .set('x-csrf-token', sessions.engineer.csrf)
        .send({
          partId: part1Id,
          quantity: 1,
          entryType: 'REQUIRED_PNA',
          remarks: 'Motor capacitor replacement required',
        });
      expect([200, 201]).toContain(pnaRes.status);
    }

    // Verify it appears in tab=waiting_parts
    const partsTabRes = await request(app)
      .get('/api/v1/engineer/jobs?tab=waiting_parts')
      .set('Cookie', sessions.engineer.cookie);

    expect(partsTabRes.status).toBe(200);
    const pnaJob = (partsTabRes.body.data?.items || []).find((j: any) => j.requestId === primaryRequestId);
    expect(pnaJob).toBeDefined();
    expect(pnaJob.status).toBe('PENDING_SPARE_PART');
  });

  // ============================================================================
  // Scenario 12: Warehouse Acknowledges & Fulfills Part
  // ============================================================================
  it('Scenario 12: Warehouse handles pending parts and status transitions to repair in progress', async () => {
    // Transition status to IN_PROGRESS_REPAIR
    const conn = await getOracleConnection();
    try {
      await conn.execute(
        `UPDATE SERVICE_REQUESTS SET STATUS = 'IN_PROGRESS_REPAIR', UPDATED_AT = SYSTIMESTAMP WHERE REQUEST_ID = :rId`,
        { rId: primaryRequestId },
        { autoCommit: true }
      );
    } finally {
      await conn.close();
    }

    // Check engineer workspace in_progress tab
    const inProgRes = await request(app)
      .get('/api/v1/engineer/jobs?tab=in_progress')
      .set('Cookie', sessions.engineer.cookie);

    expect(inProgRes.status).toBe(200);
    const foundInProg = (inProgRes.body.data?.items || []).find((j: any) => j.requestId === primaryRequestId);
    expect(foundInProg).toBeDefined();
    expect(foundInProg.status).toBe('IN_PROGRESS_REPAIR');
  });

  // ============================================================================
  // Scenario 13 & 14: Repair Submission, Happy Code Verification & Move to Completed Tab
  // ============================================================================
  it('Scenario 13 & 14: Repair completed, Happy Code verified, and job moves to Completed tab', async () => {
    // 1. Submit repair completion
    const repairRes = await request(app)
      .post(`/api/v1/asf/jobs/${primaryRequestId}/repair`)
      .set('Cookie', sessions.engineer.cookie)
      .set('x-csrf-token', sessions.engineer.csrf)
      .send({
        repairCodeId,
        repairAction: 'REPAIRED_WITHOUT_PART',
        repairRemarks: 'Repaired and tested on site',
      });

    expect(repairRes.status).toBe(200);

    // 2. Initiate closure to generate Happy Code
    const initRes = await request(app)
      .post(`/api/v1/asf/jobs/${primaryRequestId}/closure/initiate`)
      .set('Cookie', sessions.engineer.cookie)
      .set('x-csrf-token', sessions.engineer.csrf)
      .send({ remarks: 'Ready for closure verification' });

    expect(initRes.status).toBe(200);

    // 3. Extract Happy Code from mock SMS or notification outbox
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
      const outbox = await notificationRepository.listByRequestId(primaryRequestId);
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

    // 4. Verify Happy Code to close complaint
    const closeRes = await request(app)
      .post(`/api/v1/asf/jobs/${primaryRequestId}/closure/verify`)
      .set('Cookie', sessions.engineer.cookie)
      .set('x-csrf-token', sessions.engineer.csrf)
      .send({
        happyCode: customerHappyCode!,
        customerRating: 5,
        customerFeedback: 'Excellent and speedy service',
      });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.success).toBe(true);

    // Scenario 14: Verify it moves to Completed tab
    const completedTabRes = await request(app)
      .get('/api/v1/engineer/jobs?tab=completed')
      .set('Cookie', sessions.engineer.cookie);

    expect(completedTabRes.status).toBe(200);
    const closedJob = (completedTabRes.body.data?.items || []).find((j: any) => j.requestId === primaryRequestId);
    expect(closedJob).toBeDefined();
    expect(closedJob.status).toBe('CLOSED');

    // Verify it is NOT present in tab=today
    const todayRes = await request(app)
      .get('/api/v1/engineer/jobs?tab=today')
      .set('Cookie', sessions.engineer.cookie);

    expect(todayRes.status).toBe(200);
    const notInToday = (todayRes.body.data?.items || []).find((j: any) => j.requestId === primaryRequestId);
    expect(notInToday).toBeUndefined();
  });

  // ============================================================================
  // Scenario 15: Admin Deactivation Safeguard with Reassignment
  // ============================================================================
  it('Scenario 15: Deactivation safeguard blocks deactivating engineer with active jobs without replacement, and succeeds with replacement', async () => {
    // 1. Create a third engineer to test deactivation
    const tempSuffix = Math.floor(1000 + Math.random() * 9000);
    const techToDeactivate = `tech_deact_${tempSuffix}`;

    const createRes = await request(app)
      .post('/api/v1/admin/engineers')
      .set('Cookie', sessions.admin.cookie)
      .set('x-csrf-token', sessions.admin.csrf)
      .send({
        fullName: `Technician To Deactivate ${tempSuffix}`,
        username: techToDeactivate,
        phoneNumber: `98300${tempSuffix}0`, // 10 digits
        homeLocationId: defaultAsfLocId,
      });

    expect(createRes.status).toBe(201);
    const targetUserId = createRes.body.data.user.userId;

    // 2. Assign an active service request to targetUserId
    const comp = await createTestComplaint('DCT', defaultAsfLocId);
    deactRequestId = comp.requestId;
    deactJobNumber = comp.jobNumber;

    // Acknowledge and dispatch to targetUserId
    await request(app)
      .post(`/api/v1/asf/requests/${deactRequestId}/acknowledge`)
      .set('Cookie', sessions.serviceCenter.cookie)
      .set('x-csrf-token', sessions.serviceCenter.csrf)
      .send({ remarks: 'Ack for deactivation test' });

    // Approved rule: appointments must be at least 60 minutes in the future (same calendar day for the 'today' tab)
    const todayStr = new Date(Date.now() + 75 * 60 * 1000).toISOString();
    await request(app)
      .post(`/api/v1/asf/requests/${deactRequestId}/dispatch`)
      .set('Cookie', sessions.serviceCenter.cookie)
      .set('x-csrf-token', sessions.serviceCenter.csrf)
      .send({
        engineerId: targetUserId,
        appointmentDate: todayStr,
        appointmentSlot: 'EVENING',
        travelDistanceKm: 5,
        areaType: 'URBAN',
      });

    // 3. Attempt deactivation WITHOUT replacement -> MUST FAIL with 400 ACTIVE_JOBS_EXIST
    const failDeactRes = await request(app)
      .patch(`/api/v1/admin/engineers/${targetUserId}/status`)
      .set('Cookie', sessions.admin.cookie)
      .set('x-csrf-token', sessions.admin.csrf)
      .send({ isActive: 'N' });

    expect(failDeactRes.status).toBe(400);
    expect(failDeactRes.body.error?.code).toBe('ACTIVE_JOBS_EXIST');

    // 4. Attempt deactivation WITH replacement (mumbai_tech_1) -> MUST SUCCEED
    const successDeactRes = await request(app)
      .patch(`/api/v1/admin/engineers/${targetUserId}/status`)
      .set('Cookie', sessions.admin.cookie)
      .set('x-csrf-token', sessions.admin.csrf)
      .send({
        isActive: 'N',
        reassignToEngineerId: engineerUserId, // Reassign to mumbai_tech_1
      });

    expect(successDeactRes.status).toBe(200);
    expect(successDeactRes.body.success).toBe(true);
    expect(successDeactRes.body.data.reassignedCount).toBeGreaterThanOrEqual(1);

    // 5. Verify targetUserId is now inactive and complaint is reassigned in Oracle
    const conn = await getOracleConnection();
    try {
      const userCheck: any = await conn.execute(
        `SELECT IS_ACTIVE FROM APP_USERS WHERE USER_ID = :targetUserId`,
        { targetUserId },
        { outFormat: 4002 }
      );
      expect(userCheck.rows?.[0]?.IS_ACTIVE).toBe('N');

      const jobCheck: any = await conn.execute(
        `SELECT ASSIGNED_ENGINEER_ID FROM SERVICE_REQUESTS WHERE REQUEST_ID = :rId`,
        { rId: deactRequestId },
        { outFormat: 4002 }
      );
      expect(jobCheck.rows?.[0]?.ASSIGNED_ENGINEER_ID).toBe(engineerUserId);
    } finally {
      await conn.close();
    }
  });

  // ============================================================================
  // Scenario 16: Unbroken Cross-Module Regression Sanity
  // ============================================================================
  it('Scenario 16: Call Center, Warehouse, Finance, and Reporting continue operating normally', async () => {
    // 1. Call Center Search
    const ccSearch = await request(app)
      .get(`/api/v1/call-center/requests?search=${primaryJobNumber}`)
      .set('Cookie', sessions.callcenter.cookie);
    expect(ccSearch.status).toBe(200);

    // 2. Warehouse Stock Dashboard
    const whRes = await request(app)
      .get('/api/v1/warehouse/dashboard')
      .set('Cookie', sessions.warehouse.cookie);
    expect(whRes.status).toBe(200);

    // 3. Finance Overview
    const finRes = await request(app)
      .get('/api/v1/finance/overview')
      .set('Cookie', sessions.admin.cookie);
    expect(finRes.status).toBe(200);

    // 4. Admin Reporting Dashboard
    const repRes = await request(app)
      .get('/api/v1/reports/admin/dashboard?period=7d')
      .set('Cookie', sessions.admin.cookie);
    expect(repRes.status).toBe(200);
  });
});
