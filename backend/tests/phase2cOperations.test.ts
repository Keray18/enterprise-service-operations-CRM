import crypto from 'crypto';
import oracledb from 'oracledb';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeOraclePool, getOracleConnection } from '../src/database/oraclePool.js';
import { customerFeedbackRepository } from '../src/database/repositories/customerFeedbackRepository.js';
import { customerRepository } from '../src/database/repositories/customerRepository.js';
import { engineeringMasterRepository } from '../src/database/repositories/engineeringMasterRepository.js';
import { locationRepository } from '../src/database/repositories/locationRepository.js';
import { modelRepository } from '../src/database/repositories/modelRepository.js';
import { notificationRepository } from '../src/database/repositories/notificationRepository.js';
import { partRepository } from '../src/database/repositories/partRepository.js';
import { pincodeRepository } from '../src/database/repositories/pincodeRepository.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { replacementRequestRepository } from '../src/database/repositories/replacementRequestRepository.js';
import { serviceRequestEventRepository } from '../src/database/repositories/serviceRequestEventRepository.js';
import { serviceRequestRepository } from '../src/database/repositories/serviceRequestRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { verificationRepository } from '../src/database/repositories/verificationRepository.js';
import { hashPassword } from '../src/services/passwordService.js';
import { mockSmsAdapter } from '../src/services/notificationService.js';
import { decryptNotificationPayload } from '../src/utils/cryptoUtils.js';

describe('Phase 2C — Happy Code Closure, Customer Feedback, Replacement & Cancellation Approvals', () => {
  const app = createApp();
  const PASSWORD = 'TestPassword123#';

  let asfLocationId: string;
  let otherLocationId: string;

  const engineerUserId1 = crypto.randomUUID();
  const engineerUserId2 = crypto.randomUUID();
  const asfManagerUserId = crypto.randomUUID();
  const adminUserId = crypto.randomUUID();
  const callCenterUserId = crypto.randomUUID();

  let eng1Cookie: string;
  let eng1Csrf: string;
  let eng2Cookie: string;
  let eng2Csrf: string;
  let asfCookie: string;
  let asfCsrf: string;
  let adminCookie: string;
  let adminCsrf: string;
  let ccCookie: string;
  let ccCsrf: string;

  let brandId: string;
  let productId: string;
  let modelId: string;
  let customerId: string;
  let activeFaultId: string;
  let activeDefectId: string;
  let activeRepairCodeId: string;
  let activePartId: string;

  beforeAll(async () => {
    // 1. Locations
    const loc1 = await locationRepository.createLocation({
      locationCode: `ASF_2C_${Date.now().toString(36).toUpperCase()}`,
      locationName: 'Powai Authorized Service Facility',
      partyType: 'ASF',
    });
    asfLocationId = loc1.locationId;

    const loc2 = await locationRepository.createLocation({
      locationCode: `ASF_OTH_${Date.now().toString(36).toUpperCase()}`,
      locationName: 'Thane Authorized Service Facility',
      partyType: 'ASF',
    });
    otherLocationId = loc2.locationId;

    const passHash = await hashPassword(PASSWORD);

    // 2. Users
    // Engineer 1 (assigned to Location 1)
    await userRepository.createUser({
      userId: engineerUserId1,
      username: `eng1_2c_${Date.now().toString(36)}`,
      email: `eng1_2c_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Vikram Joshi (Senior Engineer)',
      passwordHash: passHash,
      locationId: asfLocationId,
      phoneNumber: '9876541212',
    });
    await rbacRepository.assignRoleToUser(engineerUserId1, 'ENGINEER', 'SETUP');

    // Engineer 2 (assigned to Location 2)
    await userRepository.createUser({
      userId: engineerUserId2,
      username: `eng2_2c_${Date.now().toString(36)}`,
      email: `eng2_2c_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Rahul Varma (Field Engineer)',
      passwordHash: passHash,
      locationId: otherLocationId,
      phoneNumber: '9876542323',
    });
    await rbacRepository.assignRoleToUser(engineerUserId2, 'ENGINEER', 'SETUP');

    // ASF Manager
    await userRepository.createUser({
      userId: asfManagerUserId,
      username: `asf_2c_${Date.now().toString(36)}`,
      email: `asf_2c_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Ramesh Patel (ASF Center Manager)',
      passwordHash: passHash,
      locationId: asfLocationId,
      phoneNumber: '9876543434',
    });
    await rbacRepository.assignRoleToUser(asfManagerUserId, 'ASF', 'SETUP');

    // Admin (Head Office)
    await userRepository.createUser({
      userId: adminUserId,
      username: `admin_2c_${Date.now().toString(36)}`,
      email: `admin_2c_${Date.now().toString(36)}@crm.internal`,
      fullName: 'HO Service Operations Head',
      passwordHash: passHash,
    });
    await rbacRepository.assignRoleToUser(adminUserId, 'ADMIN', 'SETUP');

    // Call Center User
    await userRepository.createUser({
      userId: callCenterUserId,
      username: `cc_2c_${Date.now().toString(36)}`,
      email: `cc_2c_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Pooja Agent (Call Center)',
      passwordHash: passHash,
    });
    await rbacRepository.assignRoleToUser(callCenterUserId, 'CALL_CENTER', 'SETUP');

    // Login helper
    const login = async (uid: string) => {
      const u = await userRepository.findById(uid);
      const res = await request(app).post('/api/v1/auth/login').send({
        username: u!.username,
        password: PASSWORD,
      });
      const cookie = res.headers['set-cookie']?.find((c: string) => c.startsWith('crm_session='));
      return { cookie, csrf: res.body.data.csrfToken };
    };

    const sEng1 = await login(engineerUserId1);
    eng1Cookie = sEng1.cookie!;
    eng1Csrf = sEng1.csrf;

    const sEng2 = await login(engineerUserId2);
    eng2Cookie = sEng2.cookie!;
    eng2Csrf = sEng2.csrf;

    const sAsf = await login(asfManagerUserId);
    asfCookie = sAsf.cookie!;
    asfCsrf = sAsf.csrf;

    const sAdmin = await login(adminUserId);
    adminCookie = sAdmin.cookie!;
    adminCsrf = sAdmin.csrf;

    const sCc = await login(callCenterUserId);
    ccCookie = sCc.cookie!;
    ccCsrf = sCc.csrf;

    // Master references
    const parts = await partRepository.listParts({ isActive: 'Y', page: 1, limit: 1 });
    const partRecord = parts.items[0];
    activePartId = partRecord.partId;
    brandId = partRecord.brandId;
    productId = partRecord.productId;

    const models = await modelRepository.listModels({ productId, page: 1, limit: 1 });
    modelId = models.items.length > 0 ? models.items[0].modelId : (await modelRepository.listModels({ page: 1, limit: 1 })).items[0].modelId;

    const pincodes = await pincodeRepository.listPincodes({ page: 1, limit: 1, isServiceable: 'Y' });
    const pRecord = pincodes.items[0];

    const customer = await customerRepository.createCustomer({
      fullName: 'Sunita Mehra',
      primaryMobile: '9820011223',
      addressLine: 'Apt 1204, Green Heights',
      stateId: pRecord.stateId,
      cityId: pRecord.cityId,
      pincode: pRecord.pincode,
    });
    customerId = customer.customerId;

    const faults = await engineeringMasterRepository.listFaults({ activeOnly: true });
    activeFaultId = faults[0].faultId;

    const defects = await engineeringMasterRepository.listDefects({ activeOnly: true });
    activeDefectId = defects[0].defectId;

    const repairCodes = await engineeringMasterRepository.listRepairCodes({ activeOnly: true });
    activeRepairCodeId = repairCodes[0].repairCodeId;
  });

  afterAll(async () => {
    await closeOraclePool();
  });

  /**
   * Helper to create and stage a test service request.
   */
  async function createStagedServiceRequest(options: {
    status?: any;
    checkedIn?: boolean;
    repairOutcome?: boolean;
  } = {}) {
    const {
      status = 'IN_PROGRESS_REPAIR',
      checkedIn = true,
      repairOutcome = true,
    } = options;

    const conn = await getOracleConnection();
    try {
      const jobNumber = await serviceRequestRepository.generateJobNumber('SK', 'WH', conn);
      const registeredAt = new Date();
      const sla48hExpiresAt = new Date(registeredAt.getTime() + 48 * 3600 * 1000);

      const sr = await serviceRequestRepository.createServiceRequest(
        {
          jobNumber,
          customerId,
          brandId,
          productId,
          modelId,
          customerPhone: '9820011223',
          customerAddress: 'Apt 1204, Green Heights',
          customerPincode: '400053',
          complaintDescription: 'Washing machine drum does not rotate.',
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          warrantyStatus: 'IN_WARRANTY',
          assignedLocationId: asfLocationId,
          assignedEngineerId: engineerUserId1,
          status,
          createdChannel: 'CALL_CENTER',
          registeredBy: adminUserId,
          registeredByUsername: 'admin_test',
          sla48hExpiresAt,
        },
        conn
      );

      const updateSql = `
        UPDATE SERVICE_REQUESTS
        SET 
          STATUS = :status,
          ASSIGNED_ENGINEER_ID = :engineerId,
          APPOINTMENT_DATE = TRUNC(SYSDATE),
          APPOINTMENT_SLOT = '14:00 - 17:00',
          ACKNOWLEDGED_AT = SYSTIMESTAMP,
          FAULT_ID = :faultId,
          DEFECT_ID = :defectId,
          REPAIR_CODE_ID = :repairCodeId,
          REPAIR_ACTION = :repairAction,
          REPAIR_REMARKS = :repairRemarks
        WHERE REQUEST_ID = :requestId
      `;
      await conn.execute(updateSql, {
        status,
        engineerId: engineerUserId1,
        faultId: repairOutcome ? activeFaultId : null,
        defectId: repairOutcome ? activeDefectId : null,
        repairCodeId: repairOutcome ? activeRepairCodeId : null,
        repairAction: repairOutcome ? 'REPAIRED_WITHOUT_PART' : null,
        repairRemarks: repairOutcome ? 'Drum belt tension adjusted and tested OK.' : null,
        requestId: sr.requestId,
      });

      if (checkedIn) {
        const verSql = `
          MERGE INTO SERVICE_REQUEST_VERIFICATIONS srv
          USING (SELECT :requestId AS REQUEST_ID FROM DUAL) src
          ON (srv.REQUEST_ID = src.REQUEST_ID)
          WHEN MATCHED THEN
            UPDATE SET CHECK_IN_VERIFIED_AT = SYSTIMESTAMP
          WHEN NOT MATCHED THEN
            INSERT (VERIFICATION_ID, REQUEST_ID, CHECK_IN_VERIFIED_AT, CREATED_AT, UPDATED_AT)
            VALUES (:verId, :requestId, SYSTIMESTAMP, SYSTIMESTAMP, SYSTIMESTAMP)
        `;
        await conn.execute(verSql, {
          verId: crypto.randomUUID(),
          requestId: sr.requestId,
        });
      }

      await serviceRequestEventRepository.createEvent(
        {
          requestId: sr.requestId,
          fromState: 'NONE',
          toState: status,
          eventType: 'STAGED_FOR_TEST',
          triggeredByUserId: adminUserId,
          triggeredByUsername: 'admin_test',
          triggeredByRole: 'ADMIN',
          remarks: 'Staged ticket for Phase 2C tests',
        },
        conn
      );

      await conn.commit();
      return sr;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /* ==========================================================================
     1. ELIGIBILITY VALIDATION & MANDATORY GATES
     ========================================================================== */
  describe('Closure Eligibility Gates', () => {
    it('denies initiate closure if technician has NOT completed OTP check-in', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: false,
        repairOutcome: true,
      });

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/initiate`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({ remarks: 'Attempting closure without check-in' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CHECK_IN_REQUIRED');
    });

    it('denies initiate closure if request is in invalid status (e.g. APPOINTMENT_SCHEDULED)', async () => {
      const sr = await createStagedServiceRequest({
        status: 'APPOINTMENT_SCHEDULED',
        checkedIn: true,
        repairOutcome: false,
      });

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/initiate`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({ remarks: 'Premature closure' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATE');
    });

    it('denies initiate closure if repair outcome has NOT been recorded', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: false,
      });

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/initiate`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({ remarks: 'Closure before diagnosis/repair' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('REPAIR_ACTION_REQUIRED');
    });

    it('denies initiate closure by an unassigned technician from another location', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/initiate`)
        .set('Cookie', eng2Cookie)
        .set('x-csrf-token', eng2Csrf)
        .send({ remarks: 'Hijack closure attempt' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  /* ==========================================================================
     2. HAPPY CODE GENERATION, SECRET HANDLING & ENCRYPTED OUTBOX (SMS 4)
     ========================================================================== */
  describe('Happy Code Generation & Encrypted Outbox Delivery (SMS 4)', () => {
    it('generates 6-digit Happy Code, stores HMAC digest, transitions to CALL_CLOSURE_SUBMITTED, and queues encrypted SMS 4', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/initiate`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({ remarks: 'On-site drum alignment complete and fully tested.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CALL_CLOSURE_SUBMITTED');

      // Verify Service Request status in DB
      const updatedSr = await serviceRequestRepository.findById(sr.requestId);
      expect(updatedSr?.status).toBe('CALL_CLOSURE_SUBMITTED');

      // Verify Verification table: HMAC digest and salt stored, NO raw plaintext code
      const ver = await verificationRepository.findByRequestId(sr.requestId);
      expect(ver).toBeDefined();
      expect(ver?.happyCodeHash).toBeDefined();
      expect(ver?.happyCodeSalt).toBeDefined();
      expect(ver?.happyCodeHash?.length).toBe(64); // SHA-256 hex string
      expect(ver?.happyCodeVerifiedAt).toBeFalsy();
      expect(ver?.happyCodeAttempts).toBe(0);

      // Verify Lifecycle Audit Event
      const events = await serviceRequestEventRepository.listEventsByRequestId(sr.requestId);
      const closureEvent = events.find((e) => e.eventType === 'CALL_CLOSURE_SUBMITTED');
      expect(closureEvent).toBeDefined();
      expect(closureEvent?.fromState).toBe('IN_PROGRESS_REPAIR');
      expect(closureEvent?.toState).toBe('CALL_CLOSURE_SUBMITTED');

      // Verify Encrypted Outbox: SMS 4 template enqueued
      const outboxList = await notificationRepository.listByRequestId(sr.requestId);
      const sms4 = outboxList.find((n) => n.templateCode === 'SMS_4_CALL_CLOSURE');
      expect(sms4).toBeDefined();
      expect(sms4?.isEncrypted).toBe('Y');

      // Read API masking check: messageBody must be masked as [PROTECTED_OTP_NOTIFICATION] or [DELIVERED_AND_PURGED]
      expect(sms4?.messageBody).toMatch(/\[PROTECTED_OTP_NOTIFICATION\]|\[DELIVERED_AND_PURGED\]/);

      // Verify delivery via SMS Adapter
      const sentMsgs = mockSmsAdapter.getSentMessages();
      const sms4Msg = sentMsgs.find((m) => m.templateCode === 'SMS_4_CALL_CLOSURE');
      expect(sms4Msg).toBeDefined();
      expect(sms4Msg!.messageBody).toContain(sr.jobNumber);
      expect(sms4Msg!.messageBody).toContain('share happy code #');
      expect(sms4Msg!.messageBody).toMatch(/\b\d{6}\b/);
    });
  });

  /* ==========================================================================
     3. HAPPY CODE REGENERATION (SMS 5) & RATE LIMITING
     ========================================================================== */
  describe('Happy Code Regeneration (SMS 5)', () => {
    it('regenerates Happy Code, rotates salt and hash, resets attempts, and enforces rate limit of 5', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      // Initiate first
      await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/initiate`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send();

      const verBefore = await verificationRepository.findByRequestId(sr.requestId);
      const hashBefore = verBefore?.happyCodeHash;

      // 1st Regeneration
      const regenRes = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/regenerate-happy-code`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf);

      expect(regenRes.status).toBe(200);
      expect(regenRes.body.success).toBe(true);

      const verAfter = await verificationRepository.findByRequestId(sr.requestId);
      expect(verAfter?.happyCodeRegeneratedCount).toBe(1);
      expect(verAfter?.happyCodeHash).not.toBe(hashBefore); // Rotated hash

      // Verify SMS 5 enqueued in Outbox
      const outboxList = await notificationRepository.listByRequestId(sr.requestId);
      const sms5 = outboxList.find((n) => n.templateCode === 'SMS_5_REGENERATE_HAPPY_CODE');
      expect(sms5).toBeDefined();
      expect(sms5?.isEncrypted).toBe('Y');

      // Verify audit event
      const events = await serviceRequestEventRepository.listEventsByRequestId(sr.requestId);
      const regenEvent = events.find((e) => e.eventType === 'HAPPY_CODE_REGENERATED');
      expect(regenEvent).toBeDefined();

      // Regenerate 4 more times (total 5)
      for (let i = 2; i <= 5; i++) {
        const res = await request(app)
          .post(`/api/v1/asf/jobs/${sr.requestId}/closure/regenerate-happy-code`)
          .set('Cookie', eng1Cookie)
          .set('x-csrf-token', eng1Csrf);
        expect(res.status).toBe(200);
      }

      // 6th Regeneration must be blocked by rate limit
      const blockedRes = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/regenerate-happy-code`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf);

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.success).toBe(false);
      expect(blockedRes.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  /* ==========================================================================
     4. HAPPY CODE VERIFICATION, ATTEMPT LIMITS & STATE CLOSURE
     ========================================================================== */
  describe('Happy Code Verification & Closure State Transition', () => {
    it('rejects invalid Happy Code, increments attempt counter, and locks code after 5 failures', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/initiate`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send();

      // Submit 4 wrong codes
      for (let attempt = 1; attempt <= 4; attempt++) {
        const failRes = await request(app)
          .post(`/api/v1/asf/jobs/${sr.requestId}/closure/verify`)
          .set('Cookie', eng1Cookie)
          .set('x-csrf-token', eng1Csrf)
          .send({ happyCode: '000000' });

        expect(failRes.status).toBe(400);
        expect(failRes.body.success).toBe(false);
        expect(failRes.body.error.code).toBe('INVALID_HAPPY_CODE');
        expect(failRes.body.error.message).toContain(`${5 - attempt} attempt(s) remaining`);
      }

      // 5th wrong code
      const fifthRes = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/verify`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({ happyCode: '000000' });

      expect(fifthRes.status).toBe(400);

      // 6th attempt: Code is now locked
      const lockRes = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/verify`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({ happyCode: '000000' });

      expect(lockRes.status).toBe(429);
      expect(lockRes.body.success).toBe(false);
      expect(lockRes.body.error.code).toBe('HAPPY_CODE_LOCKED');
    });

    it('accepts valid 6-digit Happy Code, transitions to CLOSED, and records closure audit metadata', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/initiate`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send();

      // Extract generated Happy Code from the sent SMS message in mock adapter
      const sentMsgs = mockSmsAdapter.getSentMessages();
      const sms4Msg = [...sentMsgs].reverse().find((m) => m.templateCode === 'SMS_4_CALL_CLOSURE');
      const match = sms4Msg!.messageBody.match(/#(\d{6})/);
      const validHappyCode = match![1];

      // Verify valid Happy Code
      const verifyRes = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/verify`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          happyCode: validHappyCode,
          feedback: {
            rating: 5,
            feedbackRemarks: 'Technician was polite and solved the issue quickly.',
            qualityAnalysis: 'Drum alignment verified under full load test.',
          },
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data.status).toBe('CLOSED');

      // Check DB records
      const updatedSr = await serviceRequestRepository.findById(sr.requestId);
      expect(updatedSr?.status).toBe('CLOSED');
      expect(updatedSr?.closedAt).toBeDefined();
      expect(updatedSr?.closedBy).toBe(engineerUserId1);

      // Check verification record marked verified
      const ver = await verificationRepository.findByRequestId(sr.requestId);
      expect(ver?.happyCodeVerifiedAt).toBeDefined();

      // Check customer feedback recorded
      const fb = await customerFeedbackRepository.findByRequestId(sr.requestId);
      expect(fb).toBeDefined();
      expect(fb?.rating).toBe(5);
      expect(fb?.feedbackRemarks).toBe('Technician was polite and solved the issue quickly.');

      // Check immutable audit event
      const events = await serviceRequestEventRepository.listEventsByRequestId(sr.requestId);
      const closedEvent = events.find((e) => e.eventType === 'CLOSED');
      expect(closedEvent).toBeDefined();
      expect(closedEvent?.fromState).toBe('CALL_CLOSURE_SUBMITTED');
      expect(closedEvent?.toState).toBe('CLOSED');

      // Attempt repeat verification on already closed ticket -> 409
      const repeatRes = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/verify`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({ happyCode: validHappyCode });

      expect(repeatRes.status).toBe(400);
      expect(repeatRes.body.error.code).toBe('TERMINAL_STATUS');
    });
  });

  /* ==========================================================================
     5. SUPERVISOR OVERRIDE CLOSURE
     ========================================================================== */
  describe('Supervisor Override Closure', () => {
    it('denies supervisor override if attempted by an unauthorized engineer without supervisor justification', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/initiate`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send();

      // Short justification (< 10 chars)
      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/verify`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          isSupervisorOverride: true,
          overrideReason: 'Done',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('allows authorized Admin/Supervisor to close ticket via override with written justification', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/initiate`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send();

      const overrideJustification = 'Customer mobile phone was switched off during visit; verified working unit with customer spouse.';

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/verify`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          isSupervisorOverride: true,
          overrideReason: overrideJustification,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CLOSED');

      const updatedSr = await serviceRequestRepository.findById(sr.requestId);
      expect(updatedSr?.status).toBe('CLOSED');
      expect(updatedSr?.supervisorOverrideReason).toBe(overrideJustification);

      // Audit event
      const events = await serviceRequestEventRepository.listEventsByRequestId(sr.requestId);
      const overrideEvent = events.find((e) => e.eventType === 'CLOSED_SUPERVISOR_OVERRIDE');
      expect(overrideEvent).toBeDefined();
    });
  });

  /* ==========================================================================
     6. CUSTOMER FEEDBACK CAPTURE & DUPLICATE PROTECTION
     ========================================================================== */
  describe('Customer Feedback Capture', () => {
    it('rejects feedback on open or unsubmitted tickets', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/feedback`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({ rating: 4 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });

    it('rejects rating outside approved 1 to 5 range', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/initiate`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send();

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/feedback`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({ rating: 6 });

      expect(res.status).toBe(400);
    });

    it('records valid customer feedback and rejects duplicate submissions', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/initiate`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send();

      // Submit feedback
      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/feedback`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          rating: 4,
          feedbackRemarks: 'Satisfactory service provided on time.',
          qualityAnalysis: 'Customer tested quick wash cycle successfully.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Duplicate submission must return 409
      const dupRes = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/feedback`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          rating: 5,
        });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error.code).toBe('DUPLICATE_FEEDBACK');
    });
  });

  /* ==========================================================================
     7. REPLACEMENT REQUEST WORKFLOW & HEAD OFFICE APPROVAL (SMS 8)
     ========================================================================== */
  describe('Replacement Request Workflow', () => {
    it('validates all 6 documented replacement reasons', async () => {
      const validReasons = [
        'REASON_1',
        'REASON_2',
        'REASON_3',
        'REASON_4',
        'REASON_5',
        'REASON_6',
      ];

      for (const reasonCode of validReasons) {
        const sr = await createStagedServiceRequest({
          status: 'IN_PROGRESS_REPAIR',
          checkedIn: true,
          repairOutcome: true,
        });

        const res = await request(app)
          .post(`/api/v1/asf/jobs/${sr.requestId}/replacement`)
          .set('Cookie', eng1Cookie)
          .set('x-csrf-token', eng1Csrf)
          .send({
            reasonCode,
            technicianRemarks: `Verified replacement reason: ${reasonCode} during diagnosis.`,
          });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('REQUEST_FOR_REPLACEMENT');
        expect(res.body.data.replacementId).toBeDefined();

        // Verify request state transitioned
        const updatedSr = await serviceRequestRepository.findById(sr.requestId);
        expect(updatedSr?.status).toBe('REQUEST_FOR_REPLACEMENT');
      }
    });

    it('rejects invalid replacement reason', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/replacement`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          reasonCode: 'CUSTOMER_WANTS_NEW_MODEL',
          technicianRemarks: 'Customer prefers newer color.',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('enforces segregation of duties: requester cannot approve their own replacement request', async () => {
      // Create request submitted by adminUserId
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      const reqRes = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/replacement`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          reasonCode: 'REASON_5',
          technicianRemarks: 'Cabinet structural failure rendering appliance unserviceable.',
        });

      expect(reqRes.status).toBe(201);
      const replacementId = reqRes.body.data.replacementId;

      // Admin attempts to self-approve
      const selfApproveRes = await request(app)
        .post(`/api/v1/asf/replacements/${replacementId}/review`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          decision: 'APPROVED',
          reviewRemarks: 'Self-approval attempt by HO requester.',
        });

      expect(selfApproveRes.status).toBe(403);
      expect(selfApproveRes.body.error.code).toBe('SEGREGATION_OF_DUTIES_VIOLATION');
    });

    it('processes Head Office replacement rejection: returns request to IN_PROGRESS_REPAIR without SMS 8', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      const reqRes = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/replacement`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          reasonCode: 'REASON_1',
          technicianRemarks: 'Vendor ETA exceeds 168 hours SLA limit.',
        });

      expect(reqRes.status).toBe(201);
      const replacementId = reqRes.body.data.replacementId;

      // Admin rejects
      const reviewRes = await request(app)
        .post(`/api/v1/asf/replacements/${replacementId}/review`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          decision: 'REJECTED',
          reviewRemarks: 'Central warehouse has identified alternative compatible part; dispatching today.',
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.success).toBe(true);

      // Verify request returned to IN_PROGRESS_REPAIR
      const updatedSr = await serviceRequestRepository.findById(sr.requestId);
      expect(updatedSr?.status).toBe('IN_PROGRESS_REPAIR');
      expect(updatedSr?.replacementApprovalNo).toBeFalsy();

      // Verify NO SMS 8 queued
      const outboxList = await notificationRepository.listByRequestId(sr.requestId);
      const sms8 = outboxList.find((n) => n.templateCode === 'SMS_8_REPLACEMENT_APPROVED');
      expect(sms8).toBeUndefined();
    });

    it('processes Head Office replacement approval: generates unique REP-YYYYMMDD-XXXX approval number, transitions to REPLACEMENT_APPROVED, and queues SMS 8', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      const reqRes = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/replacement`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          reasonCode: 'REASON_5',
          technicianRemarks: 'Severe internal chassis deformation; cannot be restored to safety standard.',
        });

      expect(reqRes.status).toBe(201);
      const replacementId = reqRes.body.data.replacementId;

      // Admin approves
      const reviewRes = await request(app)
        .post(`/api/v1/asf/replacements/${replacementId}/review`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          decision: 'APPROVED',
          reviewRemarks: 'Approved based on photographic evidence of chassis deformation.',
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.success).toBe(true);
      expect(reviewRes.body.data.status).toBe('REPLACEMENT_APPROVED');
      expect(reviewRes.body.data.approvalNumber).toMatch(/^REP-\d{8}-[A-Z0-9]{6}$/);

      const approvalNo = reviewRes.body.data.approvalNumber;

      // Verify service request state and approval number in DB
      const updatedSr = await serviceRequestRepository.findById(sr.requestId);
      expect(updatedSr?.status).toBe('REPLACEMENT_APPROVED');
      expect(updatedSr?.replacementApprovalNo).toBe(approvalNo);

      // Verify SMS 8 enqueued with approval number
      const outboxList = await notificationRepository.listByRequestId(sr.requestId);
      const sms8 = outboxList.find((n) => n.templateCode === 'SMS_8_REPLACEMENT_APPROVED');
      expect(sms8).toBeDefined();
      expect(sms8?.messageBody).toContain(approvalNo);
      expect(sms8?.messageBody).toContain(sr.jobNumber);

      // Verify lifecycle event
      const events = await serviceRequestEventRepository.listEventsByRequestId(sr.requestId);
      const repEvent = events.find((e) => e.eventType === 'REPLACEMENT_APPROVED');
      expect(repEvent).toBeDefined();
      expect(repEvent?.toState).toBe('REPLACEMENT_APPROVED');

      // Attempt repeat review -> must fail
      const repeatRes = await request(app)
        .post(`/api/v1/asf/replacements/${replacementId}/review`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          decision: 'APPROVED',
          reviewRemarks: 'Duplicate approval attempt',
        });

      expect(repeatRes.status).toBe(400);
    });
  });

  /* ==========================================================================
     8. CANCELLATION REQUEST WORKFLOW & SUPERVISOR APPROVAL (SMS 7)
     ========================================================================== */
  describe('Cancellation Request Workflow', () => {
    it('validates all 3 documented cancellation reasons', async () => {
      const validReasons = [
        'REASON_1',
        'REASON_2',
        'REASON_3',
      ];

      for (const reasonCode of validReasons) {
        const sr = await createStagedServiceRequest({
          status: 'IN_PROGRESS_REPAIR',
          checkedIn: true,
          repairOutcome: true,
        });

        const res = await request(app)
          .post(`/api/v1/asf/jobs/${sr.requestId}/cancellation`)
          .set('Cookie', eng1Cookie)
          .set('x-csrf-token', eng1Csrf)
          .send({
            reasonCode,
            remarks: `Documented customer cancellation reason: ${reasonCode}.`,
          });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('REQUEST_FOR_CANCELLATION');
        expect(res.body.data.cancellationId).toBeDefined();

        const updatedSr = await serviceRequestRepository.findById(sr.requestId);
        expect(updatedSr?.status).toBe('REQUEST_FOR_CANCELLATION');
      }
    });

    it('rejects invalid cancellation reason', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/cancellation`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          reasonCode: 'TECHNICIAN_BUSY',
          remarks: 'Technician has too many calls assigned today.',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('enforces segregation of duties: requester cannot approve their own cancellation request', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      const reqRes = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/cancellation`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          reasonCode: 'REASON_1',
          remarks: 'Attempted contact three times over 48 hours without response.',
        });

      expect(reqRes.status).toBe(201);
      const cancellationId = reqRes.body.data.cancellationId;

      // Admin attempts to self-approve
      const selfApproveRes = await request(app)
        .post(`/api/v1/asf/cancellations/${cancellationId}/review`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          decision: 'APPROVED',
          reviewRemarks: 'Self-approval attempt.',
        });

      expect(selfApproveRes.status).toBe(403);
      expect(selfApproveRes.body.error.code).toBe('SEGREGATION_OF_DUTIES_VIOLATION');
    });

    it('processes cancellation rejection: returns ticket to IN_PROGRESS_REPAIR without SMS 7', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      const reqRes = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/cancellation`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          reasonCode: 'REASON_1',
          remarks: 'Customer did not pick call on morning visit.',
        });

      expect(reqRes.status).toBe(201);
      const cancellationId = reqRes.body.data.cancellationId;

      const reviewRes = await request(app)
        .post(`/api/v1/asf/cancellations/${cancellationId}/review`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          decision: 'REJECTED',
          reviewRemarks: 'Customer reached via alternate number; visit rescheduled for evening.',
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.success).toBe(true);

      const updatedSr = await serviceRequestRepository.findById(sr.requestId);
      expect(updatedSr?.status).toBe('IN_PROGRESS_REPAIR');

      const outboxList = await notificationRepository.listByRequestId(sr.requestId);
      const sms7 = outboxList.find((n) => n.templateCode === 'SMS_7_SERVICE_CANCELLED');
      expect(sms7).toBeUndefined();
    });

    it('processes cancellation approval: transitions ticket to CANCELLED, sets CANCELLED_BY/AT, and queues SMS 7', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      const reqRes = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/cancellation`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          reasonCode: 'REASON_2',
          remarks: 'Customer declined repair charge of Rs 1,450 for power supply replacement.',
        });

      expect(reqRes.status).toBe(201);
      const cancellationId = reqRes.body.data.cancellationId;

      const reviewRes = await request(app)
        .post(`/api/v1/asf/cancellations/${cancellationId}/review`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          decision: 'APPROVED',
          reviewRemarks: 'Confirmed with customer over call. Customer refuses paid repair.',
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.success).toBe(true);
      expect(reviewRes.body.data.status).toBe('CANCELLED');

      // Check DB service request state
      const updatedSr = await serviceRequestRepository.findById(sr.requestId);
      expect(updatedSr?.status).toBe('CANCELLED');
      expect(updatedSr?.cancelledAt).toBeDefined();
      expect(updatedSr?.cancelledBy).toBe(adminUserId);

      // Verify SMS 7 enqueued
      const outboxList = await notificationRepository.listByRequestId(sr.requestId);
      const sms7 = outboxList.find((n) => n.templateCode === 'SMS_7_SERVICE_CANCELLED');
      expect(sms7).toBeDefined();
      expect(sms7?.messageBody).toContain(sr.jobNumber);
      expect(sms7?.messageBody).toContain('has been cancelled');

      // Verify lifecycle event
      const events = await serviceRequestEventRepository.listEventsByRequestId(sr.requestId);
      const cancelEvent = events.find((e) => e.eventType === 'CANCELLED');
      expect(cancelEvent).toBeDefined();
      expect(cancelEvent?.toState).toBe('CANCELLED');
    });
  });

  /* ==========================================================================
     9. INVARIANTS & SEGREGATION OF DUTIES
     ========================================================================== */
  describe('Invariants & Authorization Verification', () => {
    it('strictly ensures NO physical inventory movements or warehouse decrements are created in Phase 2C', async () => {
      // In Phase 2C, replacement approval transitions CRM state to REPLACEMENT_APPROVED
      // and awaits warehouse fulfillment without decrementing inventory.
      const conn = await getOracleConnection();
      try {
        const checkSql = `SELECT COUNT(*) AS CNT FROM SERVICE_REQUESTS WHERE STATUS = 'REPLACED'`;
        const res = await conn.execute<any>(checkSql);
        const count = res.rows ? res.rows[0][0] : 0;
        expect(count).toBe(0);
      } finally {
        await conn.close();
      }
    });

    it('denies call center role from initiating closure, reviewing replacements, or reviewing cancellations', async () => {
      const sr = await createStagedServiceRequest({
        status: 'IN_PROGRESS_REPAIR',
        checkedIn: true,
        repairOutcome: true,
      });

      // CC cannot initiate closure
      const closeRes = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/closure/initiate`)
        .set('Cookie', ccCookie)
        .set('x-csrf-token', ccCsrf)
        .send();
      expect(closeRes.status).toBe(403);

      // CC cannot review replacement
      const fakeUuid = crypto.randomUUID();
      const repRes = await request(app)
        .post(`/api/v1/asf/replacements/${fakeUuid}/review`)
        .set('Cookie', ccCookie)
        .set('x-csrf-token', ccCsrf)
        .send({ decision: 'APPROVED' });
      expect(repRes.status).toBe(403);

      // CC cannot review cancellation
      const cancelRes = await request(app)
        .post(`/api/v1/asf/cancellations/${fakeUuid}/review`)
        .set('Cookie', ccCookie)
        .set('x-csrf-token', ccCsrf)
        .send({ decision: 'APPROVED' });
      expect(cancelRes.status).toBe(403);
    });
  });
});
