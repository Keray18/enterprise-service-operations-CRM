import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeOraclePool, getOracleConnection } from '../src/database/oraclePool.js';
import { brandRepository } from '../src/database/repositories/brandRepository.js';
import { customerFeedbackRepository } from '../src/database/repositories/customerFeedbackRepository.js';
import { engineeringMasterRepository } from '../src/database/repositories/engineeringMasterRepository.js';
import { modelRepository } from '../src/database/repositories/modelRepository.js';
import { productRepository } from '../src/database/repositories/productRepository.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { serviceRequestRepository } from '../src/database/repositories/serviceRequestRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { verificationRepository } from '../src/database/repositories/verificationRepository.js';
import { hashPassword } from '../src/services/passwordService.js';
import oracledb from 'oracledb';

describe('P0 — Service Center Routing Correction, Secure Dev OTP Preview & Post-Service Customer Feedback Acceptance', () => {
  const app = createApp();

  const ADMIN_PASSWORD = 'AdminPassword123#';
  const ASF_PASSWORD = 'AsfPassword123#';
  const CC_PASSWORD = 'CallCenterPassword123#';
  const ENG_PASSWORD = 'EngPassword123#';

  const adminUserId = crypto.randomUUID();
  const asfUserId = crypto.randomUUID();
  const ccUserId = crypto.randomUUID();
  const engDelhiUserId = crypto.randomUUID();
  const engGzbUserId = crypto.randomUUID();

  let adminSessionCookie: string;
  let adminCsrfToken: string;
  let asfSessionCookie: string;
  let asfCsrfToken: string;
  let ccSessionCookie: string;
  let ccCsrfToken: string;
  let engSessionCookie: string;
  let engCsrfToken: string;

  let activeBrandId: string;
  let activeProductId: string;
  let activeModelId: string;
  let activeFaultId: string;
  let activeRepairCodeId: string;

  const DELHI_ASF_ID = '00000000-0000-0000-0004-000000000012'; // Delhi Franchise Service Center
  const GZB_ASF_ID = '00000000-0000-0000-0004-000000000010'; // Ghaziabad Franchise Service Center
  const DELHI_STATE_ID = '00000000-0000-0000-0004-000000000002';
  const NEW_DELHI_CITY_ID = '00000000-0000-0000-0005-000000000003';
  const PARYAVARAN_PINCODE = '110017';

  let createdRequestId: string;
  let createdJobNumber: string;
  let devCheckInOtp: string;
  let closureHappyCode: string;
  let feedbackTokenUrl: string;
  let rawFeedbackToken: string;
  let testSerial1: string;
  let testSerial2: string;

  beforeAll(async () => {
    process.env['ENABLE_DEV_OTP_PREVIEW'] = 'true';
    process.env['ALLOW_GLOBAL_DEFAULT_FALLBACK'] = 'false';

    // 1. Setup Admin
    const adminHash = await hashPassword(ADMIN_PASSWORD);
    await userRepository.createUser({
      userId: adminUserId,
      username: `admin_p0_${Date.now().toString(36)}`,
      email: `admin_p0_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Enterprise Administrator P0',
      passwordHash: adminHash,
    });
    await rbacRepository.assignRoleToUser(adminUserId, 'ADMIN', 'SETUP');

    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: (await userRepository.findById(adminUserId))!.username, password: ADMIN_PASSWORD });
    expect(adminLogin.status).toBe(200);
    adminSessionCookie = adminLogin.headers['set-cookie'][0];
    adminCsrfToken = adminLogin.body.data.csrfToken;

    // 2. Setup ASF Manager (Delhi Center)
    const asfHash = await hashPassword(ASF_PASSWORD);
    await userRepository.createUser({
      userId: asfUserId,
      username: `asf_p0_${Date.now().toString(36)}`,
      email: `asf_p0_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Delhi Service Center Manager',
      passwordHash: asfHash,
      locationId: DELHI_ASF_ID,
    });
    await rbacRepository.assignRoleToUser(asfUserId, 'ASF', 'SETUP');

    const asfLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: (await userRepository.findById(asfUserId))!.username, password: ASF_PASSWORD });
    expect(asfLogin.status).toBe(200);
    asfSessionCookie = asfLogin.headers['set-cookie'][0];
    asfCsrfToken = asfLogin.body.data.csrfToken;

    // 3. Setup Call Center User
    const ccHash = await hashPassword(CC_PASSWORD);
    await userRepository.createUser({
      userId: ccUserId,
      username: `cc_p0_${Date.now().toString(36)}`,
      email: `cc_p0_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Call Center Agent P0',
      passwordHash: ccHash,
    });
    await rbacRepository.assignRoleToUser(ccUserId, 'CALL_CENTER', 'SETUP');

    const ccLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: (await userRepository.findById(ccUserId))!.username, password: CC_PASSWORD });
    expect(ccLogin.status).toBe(200);
    ccSessionCookie = ccLogin.headers['set-cookie'][0];
    ccCsrfToken = ccLogin.body.data.csrfToken;

    // 4. Setup Field Engineers (Delhi & Ghaziabad)
    const engHash = await hashPassword(ENG_PASSWORD);
    await userRepository.createUser({
      userId: engDelhiUserId,
      username: `eng_del_${Date.now().toString(36)}`,
      email: `eng_del_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Engineer Delhi Home',
      passwordHash: engHash,
      locationId: DELHI_ASF_ID,
    });
    await rbacRepository.assignRoleToUser(engDelhiUserId, 'ENGINEER', 'SETUP');

    await userRepository.createUser({
      userId: engGzbUserId,
      username: `eng_gzb_${Date.now().toString(36)}`,
      email: `eng_gzb_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Engineer Ghaziabad Home',
      passwordHash: engHash,
      locationId: GZB_ASF_ID,
    });
    await rbacRepository.assignRoleToUser(engGzbUserId, 'ENGINEER', 'SETUP');

    const engLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: (await userRepository.findById(engDelhiUserId))!.username, password: ENG_PASSWORD });
    expect(engLogin.status).toBe(200);
    engSessionCookie = engLogin.headers['set-cookie'][0];
    engCsrfToken = engLogin.body.data.csrfToken;

    // 5. Catalog setup
    const models = await modelRepository.listModels({ isActive: 'Y', page: 1, limit: 10 });
    const eligibleModel = models.items.find((m) => m.isJobCreationAllowed === 'Y') || models.items[0]!;
    activeModelId = eligibleModel.modelId;
    activeBrandId = eligibleModel.brandId;
    activeProductId = eligibleModel.productId;
    const serialLen = eligibleModel.serialNumberLength || 15;
    testSerial1 = 'P1' + Math.random().toString().slice(2, 2 + serialLen - 2).padEnd(serialLen - 2, '0');
    testSerial2 = 'P2' + Math.random().toString().slice(2, 2 + serialLen - 2).padEnd(serialLen - 2, '0');

    // 6. Engineering Masters setup
    const faults = await engineeringMasterRepository.listFaults({ activeOnly: true });
    activeFaultId = faults[0]!.faultId;

    const repairCodes = await engineeringMasterRepository.listRepairCodes({ activeOnly: true });
    activeRepairCodeId = repairCodes[0]!.repairCodeId;
  });

  afterAll(async () => {
    await closeOraclePool();
  });

  // ============================================================================
  // Scenario 1: Customer Pincode Geographic Service Center Resolution
  // ============================================================================
  it('Scenario 1: Customer Pincode Geographic Service Center Resolution routes 110017 to Delhi Franchise Center', async () => {
    const mobile = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const regRes = await request(app)
      .post('/api/v1/call-center/complaints')
      .set('Cookie', ccSessionCookie)
      .set('x-csrf-token', ccCsrfToken)
      .send({
        brandId: activeBrandId,
        productId: activeProductId,
        modelId: activeModelId,
        callType: 'REPAIR',
        serviceType: 'ON_SITE',
        stateId: DELHI_STATE_ID,
        cityId: NEW_DELHI_CITY_ID,
        pincode: PARYAVARAN_PINCODE,
        addressLine: 'Paryavaran Complex, Block B',
        problemDescription: 'Cooling fan making loud noise on start',
        serialNumber: testSerial1,
        newCustomer: {
          customerCategory: 'INDIVIDUAL',
          fullName: 'P0 Pincode Routing Customer',
          primaryMobile: mobile,
          addressLine: 'Paryavaran Complex, Block B',
          pincode: PARYAVARAN_PINCODE,
          stateId: DELHI_STATE_ID,
          cityId: NEW_DELHI_CITY_ID,
        },
      });

    expect(regRes.status).toBe(201);
    expect(regRes.body.success).toBe(true);
    const sr = regRes.body.data.serviceRequest;
    expect(sr.assignedLocationId).toBe(DELHI_ASF_ID);
    expect(sr.status).toBe('ASSIGNED_TO_ASF');
    expect(sr.assignmentSource).toBe('GEOGRAPHIC_PINCODE');

    createdRequestId = sr.requestId;
    createdJobNumber = sr.jobNumber;
  });

  // ============================================================================
  // Scenario 2: Prohibit Unintended Center Assignment (Fallback Disabled)
  // ============================================================================
  it('Scenario 2: Unmapped or unserviceable pincode routes to UNASSIGNED_PENDING / REGISTERED when fallback is disabled', async () => {
    const mobile = `97${Math.floor(10000000 + Math.random() * 90000000)}`;
    const regRes = await request(app)
      .post('/api/v1/call-center/complaints')
      .set('Cookie', ccSessionCookie)
      .set('x-csrf-token', ccCsrfToken)
      .send({
        brandId: activeBrandId,
        productId: activeProductId,
        modelId: activeModelId,
        callType: 'REPAIR',
        serviceType: 'ON_SITE',
        stateId: DELHI_STATE_ID,
        cityId: NEW_DELHI_CITY_ID,
        pincode: '999999',
        addressLine: 'Remote Hill Road',
        problemDescription: 'Power supply trips immediately',
        serialNumber: testSerial2,
        newCustomer: {
          customerCategory: 'INDIVIDUAL',
          fullName: 'Unmapped Area Customer',
          primaryMobile: mobile,
          addressLine: 'Remote Hill Road',
          pincode: '999999',
          stateId: DELHI_STATE_ID,
          cityId: NEW_DELHI_CITY_ID,
        },
      });

    expect(regRes.status).toBe(201);
    expect(regRes.body.data.serviceRequest.status).toBe('REGISTERED');
    expect(regRes.body.data.serviceRequest.assignedLocationId).toBeFalsy();
    expect(regRes.body.data.serviceRequest.assignmentSource).toBe('UNASSIGNED_PENDING');
  });

  // ============================================================================
  // Scenario 3: Real Complaint TTASLE2611124751 Routing Reconciliation
  // ============================================================================
  it('Scenario 3: Complaint TTASLE2611124751 is assigned to Delhi Franchise Service Center matching pincode 110017 and technician Sumit', async () => {
    const conn = await getOracleConnection();
    try {
      const res = await conn.execute<any>(
        `SELECT sr.REQUEST_ID, sr.JOB_NUMBER, sr.ASSIGNED_LOCATION_ID, l.LOCATION_CODE, sr.ASSIGNED_ENGINEER_ID, u.FULL_NAME AS TECH_NAME
         FROM SERVICE_REQUESTS sr
         JOIN LOCATIONS l ON sr.ASSIGNED_LOCATION_ID = l.LOCATION_ID
         LEFT JOIN APP_USERS u ON sr.ASSIGNED_ENGINEER_ID = u.USER_ID
         WHERE sr.JOB_NUMBER = 'TTASLE2611124751'`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      expect(res.rows?.length).toBe(1);
      const row = res.rows![0];
      expect(row.ASSIGNED_LOCATION_ID).toBe(DELHI_ASF_ID);
      expect(row.LOCATION_CODE).toBe('ASF_DELHI');
      expect(row.ASSIGNED_ENGINEER_ID).toBe('c7a886e8-d1d8-476c-95a0-8594a0ccddfa'); // Sumit
      expect(row.TECH_NAME).toBe('Sumit');
    } finally {
      await conn.close();
    }
  });

  // ============================================================================
  // Scenario 4: Acknowledgment and Dispatch Modal Alignment
  // ============================================================================
  it('Scenario 4: Service Center acknowledges complaint and dispatches home technician with Center Aligned indicator', async () => {
    // Acknowledge
    const ackRes = await request(app)
      .post(`/api/v1/asf/requests/${createdRequestId}/acknowledge`)
      .set('Cookie', asfSessionCookie)
      .set('x-csrf-token', asfCsrfToken)
      .send({ remarks: 'Acknowledged by Delhi Service Center Manager' });

    expect(ackRes.status).toBe(200);

    // Tomorrow's date
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const tomorrowStr = d.toISOString().split('T')[0];

    // Dispatch Delhi Home Engineer
    const dispatchRes = await request(app)
      .post(`/api/v1/asf/requests/${createdRequestId}/dispatch`)
      .set('Cookie', asfSessionCookie)
      .set('x-csrf-token', asfCsrfToken)
      .send({
        engineerId: engDelhiUserId,
        appointmentDate: tomorrowStr,
        appointmentSlot: 'MORNING',
        travelDistanceKm: 6.5,
        areaType: 'LOCAL',
        remarks: 'Scheduled for morning on-site repair',
      });

    expect(dispatchRes.status).toBe(200);
    expect(dispatchRes.body.success).toBe(true);
    expect(dispatchRes.body.data.status).toBe('APPOINTMENT_SCHEDULED');

    // Scenario 5: Check dev OTP preview
    expect(dispatchRes.body.data.devOtpPreview).toBeDefined();
    expect(/^\d{6}$/.test(dispatchRes.body.data.devOtpPreview)).toBe(true);
    devCheckInOtp = dispatchRes.body.data.devOtpPreview;
  });

  // ============================================================================
  // Scenario 5: Cryptographic Anti-Tamper OTP Storage Guardrail
  // ============================================================================
  it('Scenario 5: Plaintext Check-In OTP is NEVER persisted in Oracle Database', async () => {
    const conn = await getOracleConnection();
    try {
      const vRes = await conn.execute<any>(
        `SELECT CHECK_IN_OTP_HASH, CHECK_IN_OTP_SALT FROM SERVICE_REQUEST_VERIFICATIONS WHERE REQUEST_ID = :requestId`,
        { requestId: createdRequestId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      expect(vRes.rows?.length).toBe(1);
      const row = vRes.rows![0];
      expect(row.CHECK_IN_OTP_HASH).toBeDefined();
      expect(row.CHECK_IN_OTP_HASH.length).toBe(64); // SHA-256 hex length
      expect(row.CHECK_IN_OTP_HASH).not.toBe(devCheckInOtp); // Cannot equal plaintext OTP
    } finally {
      await conn.close();
    }
  });

  // ============================================================================
  // Scenario 6: Production Mode OTP Security Guardrail
  // ============================================================================
  it('Scenario 6: Production mode strictly omits dev OTP preview field', async () => {
    const originalEnv = process.env['NODE_ENV'];
    try {
      // Temporarily set NODE_ENV to production
      (process.env as any)['NODE_ENV'] = 'production';

      const regenRes = await request(app)
        .post(`/api/v1/asf/requests/${createdRequestId}/regenerate-otp`)
        .set('Cookie', asfSessionCookie)
        .set('x-csrf-token', asfCsrfToken)
        .send({ reason: 'Customer requested resend' });

      expect(regenRes.status).toBe(200);
      expect(regenRes.body.data.devOtpPreview).toBeUndefined();
    } finally {
      (process.env as any)['NODE_ENV'] = originalEnv;
    }
  });

  // ============================================================================
  // Scenario 7: Role Authorization Enforcement on OTP Previews
  // ============================================================================
  it('Scenario 7: Unauthorized roles (Engineer/Call Center) never receive dev OTP preview', async () => {
    // Regenerate as engineer
    const engRegen = await request(app)
      .post(`/api/v1/asf/requests/${createdRequestId}/regenerate-otp`)
      .set('Cookie', engSessionCookie)
      .set('x-csrf-token', engCsrfToken)
      .send({ reason: 'Technician on-site retry' });

    expect(engRegen.status).toBe(200);
    // Engineer does NOT receive devOtpPreview
    expect(engRegen.body.data.devOtpPreview).toBeUndefined();
  });

  // ============================================================================
  // Scenario 8: OTP Regeneration with Development Preview for Authorized ASF
  // ============================================================================
  it('Scenario 8: Manager regenerating Check-In OTP receives fresh dev preview', async () => {
    const mgrRegen = await request(app)
      .post(`/api/v1/asf/requests/${createdRequestId}/regenerate-otp`)
      .set('Cookie', asfSessionCookie)
      .set('x-csrf-token', asfCsrfToken)
      .send({ reason: 'Manager resend at location' });

    expect(mgrRegen.status).toBe(200);
    expect(mgrRegen.body.data.devOtpPreview).toBeDefined();
    expect(/^\d{6}$/.test(mgrRegen.body.data.devOtpPreview)).toBe(true);
    devCheckInOtp = mgrRegen.body.data.devOtpPreview;
  });

  // ============================================================================
  // Scenario 9: Technician Check-In & Repair Evidence Validation
  // ============================================================================
  it('Scenario 9: Technician verifies Check-In OTP and closure is blocked without repair action', async () => {
    // Check-in
    const checkInRes = await request(app)
      .post(`/api/v1/asf/requests/${createdRequestId}/check-in`)
      .set('Cookie', engSessionCookie)
      .set('x-csrf-token', engCsrfToken)
      .send({
        otp: devCheckInOtp,
        checkInLatitude: 28.5244,
        checkInLongitude: 77.1855,
        remarks: 'Arrived at Paryavaran Complex customer residence',
      });

    expect(checkInRes.status).toBe(200);
    expect(checkInRes.body.data.serviceRequest.status).toBe('TECHNICIAN_CHECKED_IN');
    // Approved rule: successful arrival verification immediately issues the separate Completion Happy Code
    expect(checkInRes.body.data.completionHappyCodeIssued).toBe(true);
    expect(/^\d{6}$/.test(checkInRes.body.data.devHappyCodePreview)).toBe(true);
    closureHappyCode = checkInRes.body.data.devHappyCodePreview;

    // Attempt to initiate closure without repair outcome
    const prematureClosure = await request(app)
      .post(`/api/v1/asf/jobs/${createdRequestId}/closure/initiate`)
      .set('Cookie', engSessionCookie)
      .set('x-csrf-token', engCsrfToken)
      .send({ remarks: 'Attempting closure before repair' });

    expect(prematureClosure.status).toBe(400);
    expect(prematureClosure.body.error.code).toBe('REPAIR_ACTION_REQUIRED');
  });

  // ============================================================================
  // Scenario 10: Service Center Repair Handoff and Confirmation
  // ============================================================================
  it('Scenario 10: Recording diagnosis and repair unlocks closure and issues customer Happy Code', async () => {
    // Record Diagnosis
    const diagRes = await request(app)
      .post(`/api/v1/asf/jobs/${createdRequestId}/diagnosis`)
      .set('Cookie', engSessionCookie)
      .set('x-csrf-token', engCsrfToken)
      .send({
        voeDescription: 'High frequency bearing squeal detected from cooling fan motor assembly',
        observations: 'Rotor shaft alignment shifted due to transit vibration',
        faultId: activeFaultId,
      });
    expect(diagRes.status).toBe(200);

    // Record Repair
    const repairRes = await request(app)
      .post(`/api/v1/asf/jobs/${createdRequestId}/repair`)
      .set('Cookie', engSessionCookie)
      .set('x-csrf-token', engCsrfToken)
      .send({
        repairCodeId: activeRepairCodeId,
        repairAction: 'REPAIRED_WITHOUT_PART',
        repairRemarks: 'Re-aligned fan motor bracket and tightened damper screws. Noise eliminated.',
      });
    expect(repairRes.status).toBe(200);

    // Initiate Closure (Handoff to Service Center)
    const closureRes = await request(app)
      .post(`/api/v1/asf/jobs/${createdRequestId}/closure/initiate`)
      .set('Cookie', engSessionCookie)
      .set('x-csrf-token', engCsrfToken)
      .send({ remarks: 'Repair complete. Product tested in front of customer.' });

    expect(closureRes.status).toBe(200);
    expect(closureRes.body.data.status).toBe('CALL_CLOSURE_SUBMITTED');
    // The Completion Happy Code was already issued at arrival; closure must not issue a second one
    expect(closureRes.body.data.devHappyCodePreview).toBeUndefined();
    expect(closureHappyCode).toMatch(/^\d{6}$/);
  });

  // ============================================================================
  // Scenario 11: Return for Correction Workflow
  // ============================================================================
  it('Scenario 11: Service Center returns repair to technician for rework and reverts status to IN_PROGRESS_REPAIR', async () => {
    // Return for correction with mandatory justification
    const returnRes = await request(app)
      .post(`/api/v1/asf/jobs/${createdRequestId}/closure/return`)
      .set('Cookie', asfSessionCookie)
      .set('x-csrf-token', asfCsrfToken)
      .send({
        reason: 'Customer reported faint vibration persists at high RPM. Please re-check motor mounts.',
      });

    expect(returnRes.status).toBe(200);
    expect(returnRes.body.data.status).toBe('IN_PROGRESS_REPAIR');

    // Verify DB state
    const sr = await serviceRequestRepository.findById(createdRequestId);
    expect(sr?.status).toBe('IN_PROGRESS_REPAIR');

    // Technician fixes and re-submits closure
    const resubmitRes = await request(app)
      .post(`/api/v1/asf/jobs/${createdRequestId}/closure/initiate`)
      .set('Cookie', engSessionCookie)
      .set('x-csrf-token', engCsrfToken)
      .send({ remarks: 'Mounts re-torqued with rubber washers. Zero vibration confirmed.' });

    expect(resubmitRes.status).toBe(200);
    expect(resubmitRes.body.data.status).toBe('CALL_CLOSURE_SUBMITTED');
    // Still the unused Completion Happy Code issued at arrival
    expect(resubmitRes.body.data.devHappyCodePreview).toBeUndefined();
  });

  // ============================================================================
  // Scenario 12: Happy Code Verification and Permanent Call Closure
  // ============================================================================
  it('Scenario 12: Happy Code verification permanently closes ticket and generates feedback invitation', async () => {
    const verifyRes = await request(app)
      .post(`/api/v1/asf/jobs/${createdRequestId}/closure/verify`)
      .set('Cookie', engSessionCookie)
      .set('x-csrf-token', engCsrfToken)
      .send({
        happyCode: closureHappyCode,
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.status).toBe('CLOSED');
    expect(verifyRes.body.data.feedbackToken).toBeDefined();
    expect(verifyRes.body.data.feedbackUrl).toBeDefined();

    rawFeedbackToken = verifyRes.body.data.feedbackToken;
    feedbackTokenUrl = verifyRes.body.data.feedbackUrl;

    const sr = await serviceRequestRepository.findById(createdRequestId);
    expect(sr?.status).toBe('CLOSED');
  });

  // ============================================================================
  // Scenario 13: Post-Service Customer Feedback via Opaque Token
  // ============================================================================
  it('Scenario 13: Public customer feedback submission via opaque token updates CSAT telemetry', async () => {
    // 1. Public GET feedback summary using token (no authentication cookie)
    const publicGet = await request(app).get(`/api/v1/feedback/${rawFeedbackToken}`);
    expect(publicGet.status).toBe(200);
    expect(publicGet.body.success).toBe(true);
    expect(publicGet.body.data.jobNumber).toBe(createdJobNumber);
    expect(publicGet.body.data.status).toBe('PENDING');
    expect(publicGet.body.data.alreadySubmitted).toBe(false);
    expect(publicGet.body.data.customerPhone).toBeUndefined(); // PII protection

    // 2. Public POST feedback submission
    const submitRes = await request(app)
      .post(`/api/v1/feedback/${rawFeedbackToken}`)
      .send({
        overallRating: 5,
        techRating: 5,
        repairRating: 5,
        issueResolved: 'Y',
        comments: 'Prompt service! Technician Sumit was very courteous and professional.',
      });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.success).toBe(true);

    // 3. Single-use enforcement: second POST should fail with 409
    const duplicateRes = await request(app)
      .post(`/api/v1/feedback/${rawFeedbackToken}`)
      .send({
        overallRating: 4,
        techRating: 4,
        repairRating: 4,
        issueResolved: 'Y',
      });

    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body.error.code).toBe('ALREADY_SUBMITTED');

    // 4. Verify feedback telemetry metrics
    const metrics = await customerFeedbackRepository.getFeedbackMetrics();
    expect(metrics.received).toBeGreaterThan(0);
    expect(metrics.averageRating).toBeGreaterThanOrEqual(1);
  });
});
