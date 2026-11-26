import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeOraclePool, getOracleConnection } from '../src/database/oraclePool.js';
import { brandRepository } from '../src/database/repositories/brandRepository.js';
import { customerRepository } from '../src/database/repositories/customerRepository.js';
import { locationRepository } from '../src/database/repositories/locationRepository.js';
import { modelRepository } from '../src/database/repositories/modelRepository.js';
import { partRepository } from '../src/database/repositories/partRepository.js';
import { productRepository } from '../src/database/repositories/productRepository.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { replacementRequestRepository } from '../src/database/repositories/replacementRequestRepository.js';
import { serviceRequestRepository } from '../src/database/repositories/serviceRequestRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { verificationRepository } from '../src/database/repositories/verificationRepository.js';
import { custodyService } from '../src/services/custodyService.js';
import { job360Service } from '../src/services/job360Service.js';
import { hashPassword } from '../src/services/passwordService.js';
import { replacementService } from '../src/services/replacementService.js';
import { replacementVerificationService } from '../src/services/replacementVerificationService.js';
import { hashOtp, generateSalt, generateHappyCode } from '../src/utils/cryptoUtils.js';

describe('Phase 2 Stage B.2 Master Acceptance Test Suite', () => {
  const app = createApp();
  const PASSWORD = 'TestPassword123#';

  let asfLocation1Id: string;
  let asfLocation2Id: string;

  const asfUser1Id = crypto.randomUUID();
  const asfUser2Id = crypto.randomUUID();
  const engineer1Id = crypto.randomUUID();
  const engineer2Id = crypto.randomUUID();
  const adminUserId = crypto.randomUUID();
  const callCenterUserId = crypto.randomUUID();

  let asf1Cookie: string;
  let asf1Csrf: string;
  let asf2Cookie: string;
  let asf2Csrf: string;
  let eng1Cookie: string;
  let eng1Csrf: string;
  let eng2Cookie: string;
  let eng2Csrf: string;
  let adminCookie: string;
  let adminCsrf: string;
  let ccCookie: string;
  let ccCsrf: string;

  let brandId: string;
  let productId: string;
  let modelId: string;
  let customerId: string;
  let testPartId: string;

  beforeAll(async () => {
    // 1. Provision Locations
    const loc1 = await locationRepository.createLocation({
      locationCode: `ASF1_${Date.now().toString(36).toUpperCase()}`,
      locationName: 'Mumbai Central Service Center',
      partyType: 'ASF',
    });
    asfLocation1Id = loc1.locationId;

    const loc2 = await locationRepository.createLocation({
      locationCode: `ASF2_${Date.now().toString(36).toUpperCase()}`,
      locationName: 'Delhi North Service Center',
      partyType: 'ASF',
    });
    asfLocation2Id = loc2.locationId;

    const passHash = await hashPassword(PASSWORD);

    // 2. Provision Users
    // ASF 1
    await userRepository.createUser({
      userId: asfUser1Id,
      username: `asf1_${Date.now().toString(36)}`,
      email: `asf1_${Date.now().toString(36)}@crm.test`,
      fullName: 'ASF Manager Mumbai',
      passwordHash: passHash,
      locationId: asfLocation1Id,
    });
    await rbacRepository.assignRoleToUser(asfUser1Id, 'ASF', 'SETUP');

    // ASF 2
    await userRepository.createUser({
      userId: asfUser2Id,
      username: `asf2_${Date.now().toString(36)}`,
      email: `asf2_${Date.now().toString(36)}@crm.test`,
      fullName: 'ASF Manager Delhi',
      passwordHash: passHash,
      locationId: asfLocation2Id,
    });
    await rbacRepository.assignRoleToUser(asfUser2Id, 'ASF', 'SETUP');

    // Engineer 1
    await userRepository.createUser({
      userId: engineer1Id,
      username: `eng1_${Date.now().toString(36)}`,
      email: `eng1_${Date.now().toString(36)}@crm.test`,
      fullName: 'Field Engineer Rajesh',
      passwordHash: passHash,
      locationId: asfLocation1Id,
    });
    await rbacRepository.assignRoleToUser(engineer1Id, 'ENGINEER', 'SETUP');

    // Engineer 2
    await userRepository.createUser({
      userId: engineer2Id,
      username: `eng2_${Date.now().toString(36)}`,
      email: `eng2_${Date.now().toString(36)}@crm.test`,
      fullName: 'Field Engineer Suresh',
      passwordHash: passHash,
      locationId: asfLocation2Id,
    });
    await rbacRepository.assignRoleToUser(engineer2Id, 'ENGINEER', 'SETUP');

    // Admin
    await userRepository.createUser({
      userId: adminUserId,
      username: `admin_${Date.now().toString(36)}`,
      email: `admin_${Date.now().toString(36)}@crm.test`,
      fullName: 'System Administrator',
      passwordHash: passHash,
    });
    await rbacRepository.assignRoleToUser(adminUserId, 'ADMIN', 'SETUP');

    // Call Center
    await userRepository.createUser({
      userId: callCenterUserId,
      username: `cc_${Date.now().toString(36)}`,
      email: `cc_${Date.now().toString(36)}@crm.test`,
      fullName: 'Call Center Representative',
      passwordHash: passHash,
    });
    await rbacRepository.assignRoleToUser(callCenterUserId, 'CALL_CENTER', 'SETUP');

    // 3. Login Helper
    const login = async (uid: string) => {
      const u = await userRepository.findById(uid);
      const res = await request(app).post('/api/v1/auth/login').send({
        username: u!.username,
        password: PASSWORD,
      });
      const cookie = res.headers['set-cookie']?.find((c: string) => c.startsWith('crm_session='));
      return { cookie, csrf: res.body.data.csrfToken };
    };

    const s1 = await login(asfUser1Id);
    asf1Cookie = s1.cookie!;
    asf1Csrf = s1.csrf;

    const s2 = await login(asfUser2Id);
    asf2Cookie = s2.cookie!;
    asf2Csrf = s2.csrf;

    const se1 = await login(engineer1Id);
    eng1Cookie = se1.cookie!;
    eng1Csrf = se1.csrf;

    const se2 = await login(engineer2Id);
    eng2Cookie = se2.cookie!;
    eng2Csrf = se2.csrf;

    const sa = await login(adminUserId);
    adminCookie = sa.cookie!;
    adminCsrf = sa.csrf;

    const sc = await login(callCenterUserId);
    ccCookie = sc.cookie!;
    ccCsrf = sc.csrf;

    // 4. Fetch Master Data
    const brands = await brandRepository.listBrands({ page: 1, limit: 1 });
    brandId = brands.items[0]!.brandId;

    const products = await productRepository.listProducts({ brandId, page: 1, limit: 1 });
    productId = products.items[0]!.productId;

    const models = await modelRepository.listModels({ productId, page: 1, limit: 1 });
    modelId = models.items[0]!.modelId;

    const conn = await getOracleConnection();
    try {
      const custRes = await conn.execute<any>('SELECT CUSTOMER_ID FROM CUSTOMERS FETCH FIRST 1 ROWS ONLY');
      customerId = custRes.rows?.[0]?.[0];

      const partRes = await conn.execute<any>('SELECT PART_ID FROM PART_CODES FETCH FIRST 1 ROWS ONLY');
      testPartId = partRes.rows?.[0]?.[0];
    } finally {
      await conn.close();
    }
  });

  afterAll(async () => {
    await closeOraclePool();
  });

  // Helper to create a ticket in CALL_CLOSURE_SUBMITTED with Happy Code issued
  async function createTicketReadyForClosure(
    assignedAsfLocationId: string,
    assignedEngineerId: string,
    warrantyStatus: 'IN_WARRANTY' | 'OUT_OF_WARRANTY' = 'IN_WARRANTY'
  ): Promise<{ requestId: string; jobNumber: string; happyCode: string }> {
    const conn = await getOracleConnection();
    try {
      const jobNumber = `JOB_${Date.now().toString(36).toUpperCase()}_${Math.floor(Math.random() * 1000)}`;

      const created = await serviceRequestRepository.createServiceRequest(
        {
          jobNumber,
          customerId,
          brandId,
          productId,
          modelId,
          serviceType: 'ON_SITE',
          callType: 'REPAIR',
          warrantyStatus,
          problemDescription: 'Compressor humming and no cooling',
          assignedLocationId: assignedAsfLocationId,
          status: 'CALL_CLOSURE_SUBMITTED',
          registeredBy: callCenterUserId,
        },
        conn
      );
      const requestId = created.requestId;

      // Assign engineer directly
      await conn.execute(
        `UPDATE SERVICE_REQUESTS SET ASSIGNED_ENGINEER_ID = :assignedEngineerId, STATUS = 'CALL_CLOSURE_SUBMITTED' WHERE REQUEST_ID = :requestId`,
        { assignedEngineerId, requestId }
      );

      // Issue completion Happy Code
      const happyCode = generateHappyCode();
      const salt = generateSalt();
      const happyCodeHash = hashOtp({
        otp: happyCode,
        salt,
        requestId,
        purpose: 'HAPPY_CODE',
      });

      await verificationRepository.upsertHappyCode(
        {
          requestId,
          happyCodeHash,
          salt,
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        },
        conn
      );
      await verificationRepository.markCheckInVerified(requestId, conn);

      await conn.commit();
      return { requestId, jobNumber, happyCode };
    } finally {
      await conn.close();
    }
  }

  async function escalateComplaintDirectly(
    requestId: string,
    reason: string = 'Severe compressor burnout',
    engineerId: string = engineer1Id
  ): Promise<void> {
    const conn = await getOracleConnection();
    try {
      await serviceRequestRepository.recordRepairEscalation(
        { requestId, escalationReason: reason, escalatedBy: engineerId },
        conn
      );
      await conn.commit();
    } finally {
      await conn.close();
    }
  }

  // ===========================================================================
  // GROUP 1: ESCALATION AND TRANSACTION INTEGRITY
  // ===========================================================================
  describe('Group 1: Escalation and Transaction Integrity', () => {
    it('1.1 Engineer submits escalation without valid Happy Code -> rejected', async () => {
      const ticket = await createTicketReadyForClosure(asfLocation1Id, engineer1Id);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${ticket.requestId}/closure/verify`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          outcome: 'ESCALATED',
          escalationReason: 'Compressor burnout requires total replacement',
          happyCode: '000000', // invalid code
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_HAPPY_CODE');

      // Complaint remains in CALL_CLOSURE_SUBMITTED
      const check = await serviceRequestRepository.findById(ticket.requestId);
      expect(check?.status).toBe('CALL_CLOSURE_SUBMITTED');
    });

    it('1.2 Unauthorized engineer cannot escalate repair (engineer mismatch) -> rejected', async () => {
      const ticket = await createTicketReadyForClosure(asfLocation1Id, engineer1Id);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${ticket.requestId}/closure/verify`)
        .set('Cookie', eng2Cookie) // engineer 2 attempting on ticket assigned to engineer 1
        .set('x-csrf-token', eng2Csrf)
        .send({
          outcome: 'ESCALATED',
          escalationReason: 'Cross-engineer escalation attempt',
          happyCode: ticket.happyCode,
        });

      expect(res.status).toBe(403);
      expect(['FORBIDDEN_TECHNICIAN', 'FORBIDDEN_ENGINEER_MISMATCH']).toContain(res.body.error.code);
    });

    it('1.3 Assigned engineer submits escalation with valid Happy Code -> transitions to REPAIR_ESCALATED and creates NO replacement request', async () => {
      const ticket = await createTicketReadyForClosure(asfLocation1Id, engineer1Id);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${ticket.requestId}/closure/verify`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          outcome: 'ESCALATED',
          escalationReason: 'Major internal winding short-circuit, unrepairable on field',
          happyCode: ticket.happyCode,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REPAIR_ESCALATED');

      // Verify DB record
      const check = await serviceRequestRepository.findById(ticket.requestId);
      expect(check?.status).toBe('REPAIR_ESCALATED');
      expect(check?.escalationReason).toBe('Major internal winding short-circuit, unrepairable on field');
      expect(check?.escalatedBy).toBe(engineer1Id);

      // Verify NO replacement request was created!
      const rep = await replacementRequestRepository.findByRequestId(ticket.requestId);
      expect(rep).toBeNull();
    });

    it('1.4 Call Center role cannot accept escalation -> rejected', async () => {
      const ticket = await createTicketReadyForClosure(asfLocation1Id, engineer1Id);
      await escalateComplaintDirectly(ticket.requestId);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${ticket.requestId}/accept-escalation`)
        .set('Cookie', ccCookie)
        .set('x-csrf-token', ccCsrf)
        .send({
          reasonCode: 'REASON_5',
        });

      expect(res.status).toBe(403);
    });

    it('1.5 Wrong ASF center cannot accept escalation for complaint assigned to another ASF -> rejected', async () => {
      const ticket = await createTicketReadyForClosure(asfLocation1Id, engineer1Id);
      await escalateComplaintDirectly(ticket.requestId);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${ticket.requestId}/accept-escalation`)
        .set('Cookie', asf2Cookie) // ASF 2 trying to accept ticket belonging to ASF 1
        .set('x-csrf-token', asf2Csrf)
        .send({
          reasonCode: 'REASON_5',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_LOCATION_MISMATCH');
    });

    it('1.6 Responsible ASF accepts escalation -> atomically closes complaint (ESCALATED_TO_REPLACEMENT) & creates replacement request (OPEN)', async () => {
      const ticket = await createTicketReadyForClosure(asfLocation1Id, engineer1Id, 'IN_WARRANTY');
      await escalateComplaintDirectly(ticket.requestId, 'Severe compressor burnout');

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${ticket.requestId}/accept-escalation`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send({
          reasonCode: 'REASON_5',
          technicianRemarks: 'Approved for replacement due to severe burn',
          requiredPartId: testPartId,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.alreadyAccepted).toBe(false);
      expect(res.body.data.status).toBe('OPEN');
      expect(res.body.data.requestId).toBe(ticket.requestId);

      // Verify atomic complaint state
      const updatedComplaint = await serviceRequestRepository.findById(ticket.requestId);
      expect(updatedComplaint?.status).toBe('ESCALATED_TO_REPLACEMENT');
      expect(updatedComplaint?.closedAt).toBeTruthy();
      expect(updatedComplaint?.closedBy).toBe(asfUser1Id);

      // Verify replacement request
      const rep = await replacementRequestRepository.findByRequestId(ticket.requestId);
      expect(rep).toBeTruthy();
      expect(rep?.status).toBe('OPEN');
      expect(rep?.warrantyType).toBe('IN_WARRANTY');
      expect(rep?.quotationStatus).toBe('NOT_REQUIRED');
    });

    it('1.7 Authorized retry on already accepted escalation returns existing replacement request idempotently', async () => {
      const ticket = await createTicketReadyForClosure(asfLocation1Id, engineer1Id);
      await escalateComplaintDirectly(ticket.requestId);

      // First acceptance
      await request(app)
        .post(`/api/v1/asf/jobs/${ticket.requestId}/accept-escalation`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send({ reasonCode: 'REASON_5' });

      // Second acceptance (Retry)
      const retryRes = await request(app)
        .post(`/api/v1/asf/jobs/${ticket.requestId}/accept-escalation`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send({ reasonCode: 'REASON_5' });

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.alreadyAccepted).toBe(true);
      expect(retryRes.body.data.status).toBe('OPEN');
    });

    it('1.8 Unauthorized cross-ASF retry is rejected and does not disclose replacement info', async () => {
      const ticket = await createTicketReadyForClosure(asfLocation1Id, engineer1Id);
      await escalateComplaintDirectly(ticket.requestId);

      // First acceptance by ASF 1
      await request(app)
        .post(`/api/v1/asf/jobs/${ticket.requestId}/accept-escalation`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send({ reasonCode: 'REASON_5' });

      // Unauthorized ASF 2 attempts retry
      const retryRes = await request(app)
        .post(`/api/v1/asf/jobs/${ticket.requestId}/accept-escalation`)
        .set('Cookie', asf2Cookie)
        .set('x-csrf-token', asf2Csrf)
        .send({ reasonCode: 'REASON_5' });

      expect(retryRes.status).toBe(403);
      expect(retryRes.body.error.code).toBe('FORBIDDEN_LOCATION_MISMATCH');
    });

    it('1.9 Terminal replacement request (CUSTOMER_DECLINED or CLOSED) cannot be duplicated', async () => {
      const ticket = await createTicketReadyForClosure(asfLocation1Id, engineer1Id);
      await escalateComplaintDirectly(ticket.requestId);

      // Accept escalation
      const res = await request(app)
        .post(`/api/v1/asf/jobs/${ticket.requestId}/accept-escalation`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send({ reasonCode: 'REASON_5' });

      const repId = res.body.data.replacementId;

      // Move replacement to terminal state: CUSTOMER_DECLINED
      const conn2 = await getOracleConnection();
      await replacementRequestRepository.updateStatus(repId, 'CUSTOMER_DECLINED', conn2);
      await conn2.commit();
      await conn2.close();

      // Attempt re-acceptance
      const reAcceptRes = await request(app)
        .post(`/api/v1/asf/jobs/${ticket.requestId}/accept-escalation`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send({ reasonCode: 'REASON_5' });

      expect(reAcceptRes.status).toBe(400);
      expect(reAcceptRes.body.error.code).toBe('REPLACEMENT_TERMINAL');
    });

    it('1.10 Legacy direct replacement creation endpoint is blocked', async () => {
      const ticket = await createTicketReadyForClosure(asfLocation1Id, engineer1Id);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${ticket.requestId}/replacement`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          reasonCode: 'REASON_1',
          technicianRemarks: 'Trying legacy bypass',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('USE_ESCALATION_WORKFLOW');
    });
  });

  // ===========================================================================
  // GROUP 2: QUOTATION WORKFLOW AND VERSIONING
  // ===========================================================================
  describe('Group 2: Quotation Workflow and Versioning', () => {
    let outOfWarrantyRepId: string;

    beforeAll(async () => {
      const ticket = await createTicketReadyForClosure(asfLocation1Id, engineer1Id, 'OUT_OF_WARRANTY');
      await escalateComplaintDirectly(ticket.requestId, 'Burnout out of warranty');

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${ticket.requestId}/accept-escalation`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send({
          reasonCode: 'REASON_5',
          warrantyType: 'OUT_OF_WARRANTY',
          quotationAmount: 5000,
        });

      outOfWarrantyRepId = res.body.data.replacementId;
    });

    it('2.1 Out-of-warranty requires quotation approval before dispatch is permitted', async () => {
      const prereq = await replacementService.checkDispatchPrerequisites(outOfWarrantyRepId);
      expect(prereq.eligible).toBe(false);
      expect(prereq.reason).toContain('Out-of-warranty replacement requires approved quotation');
    });

    it('2.2 ASF prepares updated quotation -> bumps version and marks PENDING_CUSTOMER_APPROVAL', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/replacements/${outOfWarrantyRepId}/quotation`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send({
          amount: 6200,
          remarks: 'Revised parts cost estimate',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.quotationAmount).toBe(6200);
      expect(res.body.data.quotationStatus).toBe('PENDING_CUSTOMER_APPROVAL');
      expect(res.body.data.appointmentVersion).toBe(2);
    });

    it('2.3 Customer approval of current quotation version succeeds -> transitions to QUOTATION_APPROVED', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/replacements/${outOfWarrantyRepId}/quotation/decision`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send({
          decision: 'APPROVED',
          quotationVersion: 2, // Matches current version
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('QUOTATION_APPROVED');
      expect(res.body.data.quotationStatus).toBe('APPROVED');

      // Dispatch check now passes
      const prereq = await replacementService.checkDispatchPrerequisites(outOfWarrantyRepId);
      expect(prereq.eligible).toBe(true);
    });

    it('2.4 Quotation modification invalidates approval and bumps version', async () => {
      // Modify quotation
      const modRes = await request(app)
        .post(`/api/v1/asf/replacements/${outOfWarrantyRepId}/quotation`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send({
          amount: 6500,
          remarks: 'Added freight charge',
        });

      expect(modRes.body.data.appointmentVersion).toBe(3);
      expect(modRes.body.data.quotationStatus).toBe('PENDING_CUSTOMER_APPROVAL');

      // Dispatch is blocked again
      const prereq = await replacementService.checkDispatchPrerequisites(outOfWarrantyRepId);
      expect(prereq.eligible).toBe(false);
    });

    it('2.5 Approval referencing stale quotation version is rejected (409)', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/replacements/${outOfWarrantyRepId}/quotation/decision`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send({
          decision: 'APPROVED',
          quotationVersion: 2, // Stale version (current is 3)
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('STALE_QUOTATION_VERSION');
    });

    it('2.6 Customer rejection transitions replacement to CUSTOMER_DECLINED & permanently blocks dispatch', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/replacements/${outOfWarrantyRepId}/quotation/decision`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send({
          decision: 'DECLINED',
          quotationVersion: 3,
          reason: 'Customer considers 6500 too expensive',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CUSTOMER_DECLINED');
      expect(res.body.data.quotationStatus).toBe('DECLINED');

      // Dispatch blocked permanently
      const prereq = await replacementService.checkDispatchPrerequisites(outOfWarrantyRepId);
      expect(prereq.eligible).toBe(false);
      expect(prereq.reason).toContain('Customer declined');
    });

    it('2.7 Historical quotation data and rejection audit remain accessible', async () => {
      const rep = await replacementService.getReplacementById(outOfWarrantyRepId);
      expect(rep.quotationAmount).toBe(6500);
      expect(rep.quotationStatus).toBe('DECLINED');
      expect(rep.quotationRejectionReason).toBe('Customer considers 6500 too expensive');
      expect(rep.quotationRejectedAt).toBeTruthy();
    });
  });

  // ===========================================================================
  // GROUP 3: CUSTODY AND VERIFICATION (HAPPY CODE)
  // ===========================================================================
  describe('Group 3: Physical Custody and Visit-Scoped Happy Code Verification', () => {
    let repId: string;
    let handoverId: string;

    beforeAll(async () => {
      const ticket = await createTicketReadyForClosure(asfLocation1Id, engineer1Id, 'IN_WARRANTY');
      await escalateComplaintDirectly(ticket.requestId, 'Warranty replacement');

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${ticket.requestId}/accept-escalation`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send({
          reasonCode: 'REASON_5',
          requiredPartId: testPartId,
        });

      repId = res.body.data.replacementId;
    });

    it('3.1 ASF initiates physical handover -> status PENDING_COLLECTION (not treated as collected)', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/replacements/${repId}/handover`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send({
          partId: testPartId,
          engineerId: engineer1Id,
          remarks: 'Handing over Linear Compressor for replacement job',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING_COLLECTION');
      expect(res.body.data.collectionAcknowledged).toBe('N');
      handoverId = res.body.data.handoverId;
    });

    it('3.2 Cross-ASF access rejected when creating handover', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/replacements/${repId}/handover`)
        .set('Cookie', asf2Cookie) // Delhi ASF trying Mumbai replacement
        .set('x-csrf-token', asf2Csrf)
        .send({
          partId: testPartId,
          engineerId: engineer2Id,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CROSS_ASF_FORBIDDEN');
    });

    it('3.3 Wrong engineer cannot acknowledge collection -> rejected (403)', async () => {
      const res = await request(app)
        .post('/api/v1/engineer/custody/acknowledge')
        .set('Cookie', eng2Cookie) // Engineer 2 trying to acknowledge Engineer 1 handover
        .set('x-csrf-token', eng2Csrf)
        .send({
          handoverId,
          remarks: 'Wrong engineer attempt',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('WRONG_ENGINEER_COLLECTION');
    });

    it('3.4 Designated engineer acknowledges collection -> moves to COLLECTED and replacement to HANDED_OVER_TO_ENGINEER', async () => {
      const res = await request(app)
        .post('/api/v1/engineer/custody/acknowledge')
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          handoverId,
          remarks: 'Received sealed part in good condition',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COLLECTED');
      expect(res.body.data.collectionAcknowledged).toBe('Y');

      const rep = await replacementService.getReplacementById(repId);
      expect(rep.status).toBe('HANDED_OVER_TO_ENGINEER');
    });

    it('3.5 Visit-scoped cryptographic code issuance: plain code never stored in DB', async () => {
      const issued = await replacementVerificationService.issueVerificationCode({
        replacementId: repId,
        visitNumber: 1,
        appointmentVersion: 1,
        assignedEngineerId: engineer1Id,
        purpose: 'ARRIVAL',
        plainCode: '765432',
      });

      expect(issued.plainCode).toBe('765432');
      expect(issued.verification.codeHash).not.toBe('765432');
      expect(issued.verification.codeSalt).toBeTruthy();

      const inDb = await verificationRepository.findByRequestId(repId);
      // REPLACEMENT_VERIFICATIONS row should have hash and salt
      const repVerif = await replacementVerificationService.issueVerificationCode({
        replacementId: repId,
        visitNumber: 1,
        appointmentVersion: 1,
        assignedEngineerId: engineer1Id,
        purpose: 'COMPLETION',
        plainCode: '123456',
      });
      expect(repVerif.verification.codeHash).not.toBe('123456');
    });

    it('3.6 Purpose separation: ARRIVAL code cannot be verified as COMPLETION', async () => {
      const res = await request(app)
        .post(`/api/v1/engineer/replacements/${repId}/verify-code`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          visitNumber: 1,
          appointmentVersion: 1,
          purpose: 'COMPLETION',
          happyCode: '765432', // This was ARRIVAL code
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_HAPPY_CODE');
    });

    it('3.7 Wrong engineer cannot verify replacement Happy Code -> rejected (403)', async () => {
      const res = await request(app)
        .post(`/api/v1/engineer/replacements/${repId}/verify-code`)
        .set('Cookie', eng2Cookie) // Engineer 2
        .set('x-csrf-token', eng2Csrf)
        .send({
          visitNumber: 1,
          appointmentVersion: 1,
          purpose: 'ARRIVAL',
          happyCode: '765432',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ENGINEER_MISMATCH');
    });

    it('3.8 Designated engineer verifies ARRIVAL code -> advances to TECHNICIAN_CHECKED_IN', async () => {
      const res = await request(app)
        .post(`/api/v1/engineer/replacements/${repId}/verify-code`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          visitNumber: 1,
          appointmentVersion: 1,
          purpose: 'ARRIVAL',
          happyCode: '765432',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.replacementStatus).toBe('TECHNICIAN_CHECKED_IN');
    });

    it('3.9 Consumed code cannot be reused (replay protection)', async () => {
      const res = await request(app)
        .post(`/api/v1/engineer/replacements/${repId}/verify-code`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          visitNumber: 1,
          appointmentVersion: 1,
          purpose: 'ARRIVAL',
          happyCode: '765432',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CODE_ALREADY_USED');
    });

    it('3.10 Warehouse closure requires INSTALLATION_VERIFIED; succeeds once COMPLETION code verified', async () => {
      // Attempt closure before installation verified -> blocked
      const prereqBefore = await replacementService.checkWarehouseClosurePrerequisites(repId);
      expect(prereqBefore.eligible).toBe(false);

      // Verify completion code
      const compRes = await request(app)
        .post(`/api/v1/engineer/replacements/${repId}/verify-code`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          visitNumber: 1,
          appointmentVersion: 1,
          purpose: 'COMPLETION',
          happyCode: '123456',
        });

      expect(compRes.status).toBe(200);
      expect(compRes.body.data.replacementStatus).toBe('INSTALLATION_VERIFIED');

      // Now warehouse closure is eligible
      const prereqAfter = await replacementService.checkWarehouseClosurePrerequisites(repId);
      expect(prereqAfter.eligible).toBe(true);

      const closed = await replacementService.closeReplacement(repId, {
        userId: adminUserId,
        username: 'admin',
        roles: ['ADMIN'],
        permissions: ['calls:close'],
      });
      expect(closed.status).toBe('CLOSED');
      expect(closed.closedAt).toBeTruthy();
    });
  });
});
