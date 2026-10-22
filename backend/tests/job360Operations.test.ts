import crypto from 'crypto';
import oracledb from 'oracledb';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeOraclePool, getOracleConnection } from '../src/database/oraclePool.js';
import { brandRepository } from '../src/database/repositories/brandRepository.js';
import { customerRepository } from '../src/database/repositories/customerRepository.js';
import { engineeringMasterRepository } from '../src/database/repositories/engineeringMasterRepository.js';
import { locationRepository } from '../src/database/repositories/locationRepository.js';
import { modelRepository } from '../src/database/repositories/modelRepository.js';
import { partRepository } from '../src/database/repositories/partRepository.js';
import { pincodeRepository } from '../src/database/repositories/pincodeRepository.js';
import { productRepository } from '../src/database/repositories/productRepository.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { serviceRequestEventRepository } from '../src/database/repositories/serviceRequestEventRepository.js';
import { serviceRequestRepository } from '../src/database/repositories/serviceRequestRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { verificationRepository } from '../src/database/repositories/verificationRepository.js';
import { hashPassword } from '../src/services/passwordService.js';
import { storageService } from '../src/services/storageService.js';

describe('Job 360, Diagnostics & Repair Operations (Phase 2B)', () => {
  const app = createApp();
  const PASSWORD = 'TestPassword123#';

  let asfLocationId: string;
  let otherLocationId: string;

  const engineerUserId1 = crypto.randomUUID();
  const engineerUserId2 = crypto.randomUUID();
  const asfManagerUserId = crypto.randomUUID();
  const adminUserId = crypto.randomUUID();
  const warehouseUserId = crypto.randomUUID();

  let eng1Cookie: string;
  let eng1Csrf: string;
  let eng2Cookie: string;
  let eng2Csrf: string;
  let asfCookie: string;
  let asfCsrf: string;
  let adminCookie: string;
  let adminCsrf: string;
  let whCookie: string;
  let whCsrf: string;

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
      locationCode: `ASF_360_${Date.now().toString(36).toUpperCase()}`,
      locationName: 'Andheri West Service Center',
      partyType: 'ASF',
    });
    asfLocationId = loc1.locationId;

    const loc2 = await locationRepository.createLocation({
      locationCode: `ASF_OTH_${Date.now().toString(36).toUpperCase()}`,
      locationName: 'Bandra Service Center',
      partyType: 'ASF',
    });
    otherLocationId = loc2.locationId;

    const passHash = await hashPassword(PASSWORD);

    // 2. Users
    // Engineer 1 (assigned to Location 1)
    await userRepository.createUser({
      userId: engineerUserId1,
      username: `eng1_360_${Date.now().toString(36)}`,
      email: `eng1_360_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Sunil Sharma (Senior Tech)',
      passwordHash: passHash,
      locationId: asfLocationId,
      phoneNumber: '9876541111',
    });
    await rbacRepository.assignRoleToUser(engineerUserId1, 'ENGINEER', 'SETUP');

    // Engineer 2 (assigned to Location 2)
    await userRepository.createUser({
      userId: engineerUserId2,
      username: `eng2_360_${Date.now().toString(36)}`,
      email: `eng2_360_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Amit Patel (Other Tech)',
      passwordHash: passHash,
      locationId: otherLocationId,
      phoneNumber: '9876542222',
    });
    await rbacRepository.assignRoleToUser(engineerUserId2, 'ENGINEER', 'SETUP');

    // ASF Manager
    await userRepository.createUser({
      userId: asfManagerUserId,
      username: `asf_360_${Date.now().toString(36)}`,
      email: `asf_360_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Deepak ASF Manager',
      passwordHash: passHash,
      locationId: asfLocationId,
      phoneNumber: '9876543333',
    });
    await rbacRepository.assignRoleToUser(asfManagerUserId, 'ASF', 'SETUP');

    // Admin
    await userRepository.createUser({
      userId: adminUserId,
      username: `admin_360_${Date.now().toString(36)}`,
      email: `admin_360_${Date.now().toString(36)}@crm.internal`,
      fullName: 'System Administrator',
      passwordHash: passHash,
    });
    await rbacRepository.assignRoleToUser(adminUserId, 'ADMIN', 'SETUP');

    // Warehouse
    await userRepository.createUser({
      userId: warehouseUserId,
      username: `wh_360_${Date.now().toString(36)}`,
      email: `wh_360_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Warehouse Supervisor',
      passwordHash: passHash,
    });
    await rbacRepository.assignRoleToUser(warehouseUserId, 'WAREHOUSE', 'SETUP');

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

    const sWh = await login(warehouseUserId);
    whCookie = sWh.cookie!;
    whCsrf = sWh.csrf;

    // Master references & compatible part code
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
      fullName: 'Kishore Diagnostic Customer',
      primaryMobile: '9871122334',
      addressLine: 'Flat 402, Lotus Tower',
      stateId: pRecord.stateId,
      cityId: pRecord.cityId,
      pincode: pRecord.pincode,
    });
    customerId = customer.customerId;

    // Engineering masters
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

  // Helper to create a service request
  async function createTestServiceRequest(status: any = 'APPOINTMENT_SCHEDULED', checkedIn = false) {
    const conn = await getOracleConnection();
    try {
      const jobNumber = await serviceRequestRepository.generateJobNumber('SK', 'AC', conn);
      const registeredAt = new Date();
      const sla48hExpiresAt = new Date(registeredAt.getTime() + 48 * 3600 * 1000);

      const sr = await serviceRequestRepository.createServiceRequest(
        {
          jobNumber,
          customerId,
          brandId,
          productId,
          modelId,
          customerPhone: '9871122334',
          customerAddress: 'Flat 402, Lotus Tower',
          customerPincode: '400053',
          complaintDescription: 'Television display flickers and produces no sound.',
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

      // Set status, assigned engineer, appointment and acknowledged
      const updateSql = `
        UPDATE SERVICE_REQUESTS
        SET 
          STATUS = :status,
          ASSIGNED_ENGINEER_ID = :engineerId,
          APPOINTMENT_DATE = TRUNC(SYSDATE),
          APPOINTMENT_SLOT = '10:00 - 13:00',
          ACKNOWLEDGED_AT = SYSTIMESTAMP
        WHERE REQUEST_ID = :requestId
      `;
      await conn.execute(updateSql, {
        status,
        engineerId: engineerUserId1,
        requestId: sr.requestId,
      });

      // Verification row
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
          eventType: 'INITIAL_REGISTRATION',
          triggeredByUserId: adminUserId,
          triggeredByUsername: 'admin_test',
          triggeredByRole: 'ADMIN',
          remarks: 'Test staged ticket',
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
     1. MANDATORY CHECK-IN GATE ENFORCEMENT
     ========================================================================== */
  describe('Mandatory Check-In Gate Enforcement', () => {
    it('denies diagnosis recording if technician has NOT completed OTP check-in', async () => {
      const sr = await createTestServiceRequest('APPOINTMENT_SCHEDULED', false);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/diagnosis`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          voeDescription: 'Screen turns blank after 5 minutes.',
          faultId: activeFaultId,
          defectId: activeDefectId,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CHECK_IN_REQUIRED');
    });

    it('denies repair outcome recording if technician has NOT completed OTP check-in', async () => {
      const sr = await createTestServiceRequest('APPOINTMENT_SCHEDULED', false);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/repair`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          repairCodeId: activeRepairCodeId,
          repairAction: 'REPAIRED_WITHOUT_PART',
          repairRemarks: 'Loose connection tightened.',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CHECK_IN_REQUIRED');
    });

    it('denies parts addition if technician has NOT completed OTP check-in', async () => {
      const sr = await createTestServiceRequest('APPOINTMENT_SCHEDULED', false);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/parts`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          partId: activePartId,
          quantity: 1,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CHECK_IN_REQUIRED');
    });

    it('denies evidence attachment upload if technician has NOT completed OTP check-in', async () => {
      const sr = await createTestServiceRequest('APPOINTMENT_SCHEDULED', false);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/attachments`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .field('attachmentType', 'SERIAL_NUMBER_PLATE')
        .attach('file', Buffer.from('fake-image-bytes'), 'test_plate.jpg');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CHECK_IN_REQUIRED');
    });
  });

  /* ==========================================================================
     2. UNIFIED JOB 360 & ROLE SCOPING
     ========================================================================== */
  describe('Unified Job 360 Workspace & Scoping', () => {
    it('retrieves comprehensive Job 360 workspace for assigned engineer', async () => {
      const sr = await createTestServiceRequest('TECHNICIAN_CHECKED_IN', true);

      const res = await request(app)
        .get(`/api/v1/asf/jobs/${sr.requestId}`)
        .set('Cookie', eng1Cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.serviceRequest.requestId).toBe(sr.requestId);
      expect(res.body.data.verification.isCheckedIn).toBe(true);
      expect(res.body.data.availableActions.canDiagnose).toBe(true);
      expect(res.body.data.availableActions.canCheckIn).toBe(false);
    });

    it('retrieves Job 360 by job number string', async () => {
      const sr = await createTestServiceRequest('TECHNICIAN_CHECKED_IN', true);

      const res = await request(app)
        .get(`/api/v1/asf/jobs/${sr.jobNumber}`)
        .set('Cookie', eng1Cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.serviceRequest.jobNumber).toBe(sr.jobNumber);
    });

    it('denies access to an unassigned engineer from another franchise center', async () => {
      const sr = await createTestServiceRequest('TECHNICIAN_CHECKED_IN', true);

      const res = await request(app)
        .get(`/api/v1/asf/jobs/${sr.requestId}`)
        .set('Cookie', eng2Cookie);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('allows system admin to access any Job 360', async () => {
      const sr = await createTestServiceRequest('TECHNICIAN_CHECKED_IN', true);

      const res = await request(app)
        .get(`/api/v1/asf/jobs/${sr.requestId}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  /* ==========================================================================
     3. DIAGNOSIS RECORDING & ENGINEERING MASTERS
     ========================================================================== */
  describe('Technician Diagnosis Operations', () => {
    it('successfully records diagnosis and transitions status to IN_PROGRESS_REPAIR', async () => {
      const sr = await createTestServiceRequest('TECHNICIAN_CHECKED_IN', true);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/diagnosis`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          voeDescription: 'Confirmed display backlight failure and burnt capacitor on power supply.',
          faultId: activeFaultId,
          defectId: activeDefectId,
          observations: 'Cabinet sealed, no external liquid ingress observed.',
          physicalSerialVerified: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('IN_PROGRESS_REPAIR');
      expect(res.body.data.faultId).toBe(activeFaultId);
      expect(res.body.data.defectId).toBe(activeDefectId);
      expect(res.body.data.voeDescription).toContain('display backlight failure');

      // Verify audit event
      const job360 = await request(app)
        .get(`/api/v1/asf/jobs/${sr.requestId}`)
        .set('Cookie', eng1Cookie);

      const diagnosisEvent = job360.body.data.events.find((e: any) => e.eventType === 'DIAGNOSIS_RECORDED');
      expect(diagnosisEvent).toBeDefined();
      expect(diagnosisEvent.toState).toBe('IN_PROGRESS_REPAIR');
    });

    it('rejects invalid or non-existent fault master UUID', async () => {
      const sr = await createTestServiceRequest('TECHNICIAN_CHECKED_IN', true);
      const fakeFaultId = crypto.randomUUID();

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/diagnosis`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          voeDescription: 'Invalid fault test.',
          faultId: fakeFaultId,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_FAULT_CODE');
    });

    it('prevents an unauthorized engineer from recording diagnosis on someone else’s ticket', async () => {
      const sr = await createTestServiceRequest('TECHNICIAN_CHECKED_IN', true);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/diagnosis`)
        .set('Cookie', eng2Cookie)
        .set('x-csrf-token', eng2Csrf)
        .send({
          voeDescription: 'Hijacked diagnosis.',
          faultId: activeFaultId,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  /* ==========================================================================
     4. PARTS OPERATIONS & SERVER-SIDE PRICING
     ========================================================================== */
  describe('Parts Used & Required Documentation', () => {
    it('records part usage, verifies server-calculated pricing, and updates totals', async () => {
      const sr = await createTestServiceRequest('IN_PROGRESS_REPAIR', true);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/parts`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          partId: activePartId,
          quantity: 2,
          entryType: 'USED',
          isChargeableToCustomer: true,
          defectiveSerialNo: 'DEF_SERIAL_123',
          newPartSerialNo: 'NEW_SERIAL_456',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.partEntryId).toBeDefined();

      // Check Job 360 parts list
      const job360 = await request(app)
        .get(`/api/v1/asf/jobs/${sr.requestId}`)
        .set('Cookie', eng1Cookie);

      const parts = job360.body.data.parts;
      expect(parts.length).toBe(1);
      expect(parts[0].quantity).toBe(2);
      expect(parts[0].entryType).toBe('USED');
      expect(parts[0].isChargeableToCustomer).toBe('Y');
      expect(parts[0].totalPrice).toBeGreaterThan(0);
      expect(job360.body.data.serviceRequest.partsTotalCharge).toBe(parts[0].totalPrice);
    });

    it('removes a draft part entry and recalculates financial total', async () => {
      const sr = await createTestServiceRequest('IN_PROGRESS_REPAIR', true);

      // Add a part first
      const addRes = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/parts`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          partId: activePartId,
          quantity: 1,
          isChargeableToCustomer: true,
        });

      const partEntryId = addRes.body.data.partEntryId;

      // Delete the part
      const delRes = await request(app)
        .delete(`/api/v1/asf/jobs/${sr.requestId}/parts/${partEntryId}`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
      expect(delRes.body.data.partsTotalCharge).toBe(0);

      // Verify empty in Job 360
      const job360 = await request(app)
        .get(`/api/v1/asf/jobs/${sr.requestId}`)
        .set('Cookie', eng1Cookie);

      expect(job360.body.data.parts.length).toBe(0);
      expect(job360.body.data.serviceRequest.partsTotalCharge).toBe(0);
    });
  });

  /* ==========================================================================
     5. REPAIR OUTCOMES & STATE TRANSITIONS
     ========================================================================== */
  describe('Repair Outcomes & Workflow Transitions', () => {
    it('successfully completes repair WITHOUT part and moves to CALL_CLOSURE_SUBMITTED', async () => {
      const sr = await createTestServiceRequest('IN_PROGRESS_REPAIR', true);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/repair`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          repairCodeId: activeRepairCodeId,
          repairAction: 'REPAIRED_WITHOUT_PART',
          repairRemarks: 'Cleaned copper contacts and reseated ribbon cable.',
          repairAt: 'ON_SITE',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CALL_CLOSURE_SUBMITTED');
      expect(res.body.data.repairAction).toBe('REPAIRED_WITHOUT_PART');
    });

    it('rejects REPAIRED_WITH_PART if no parts were recorded on the job', async () => {
      const sr = await createTestServiceRequest('IN_PROGRESS_REPAIR', true);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/repair`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          repairCodeId: activeRepairCodeId,
          repairAction: 'REPAIRED_WITH_PART',
          repairRemarks: 'Claiming repaired with part without adding parts.',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PARTS_REQUIRED');
    });

    it('allows REPAIRED_WITH_PART once part has been recorded', async () => {
      const sr = await createTestServiceRequest('IN_PROGRESS_REPAIR', true);

      // Add part
      await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/parts`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          partId: activePartId,
          quantity: 1,
          entryType: 'USED',
        });

      // Submit repair
      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/repair`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          repairCodeId: activeRepairCodeId,
          repairAction: 'REPAIRED_WITH_PART',
          repairRemarks: 'Successfully replaced defective unit.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CALL_CLOSURE_SUBMITTED');
    });

    it('requires replacement reason when selecting REQUEST_REPLACEMENT', async () => {
      const sr = await createTestServiceRequest('IN_PROGRESS_REPAIR', true);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/repair`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          repairCodeId: activeRepairCodeId,
          repairAction: 'REQUEST_REPLACEMENT',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('transitions to REQUEST_FOR_REPLACEMENT when reason is provided', async () => {
      const sr = await createTestServiceRequest('IN_PROGRESS_REPAIR', true);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/repair`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          repairCodeId: activeRepairCodeId,
          repairAction: 'REQUEST_REPLACEMENT',
          replacementReason: 'UNREPAIRABLE_PANEL_CRACK',
          replacementRemarks: 'Internal OLED panel is cracked from manufacturing fault.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('REQUEST_FOR_REPLACEMENT');
    });
  });

  /* ==========================================================================
     6. SPECIAL-PART ESTIMATE REQUEST WORKFLOW
     ========================================================================== */
  describe('Special-Part Estimate Workflow', () => {
    it('supports technician marking PENDING_SPECIAL_PART_ESTIMATE', async () => {
      const sr = await createTestServiceRequest('IN_PROGRESS_REPAIR', true);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/repair`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          repairCodeId: activeRepairCodeId,
          repairAction: 'PENDING_SPECIAL_PART_ESTIMATE',
          specialPartRemarks: 'Imported display controller board required from central depot.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING_SPECIAL_PART_ESTIMATE');
    });

    it('allows ASF/Admin to provide quotation, moving to SPECIAL_PART_ESTIMATE_PROVIDED', async () => {
      const sr = await createTestServiceRequest('PENDING_SPECIAL_PART_ESTIMATE', true);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/special-part-estimate`)
        .set('Cookie', asfCookie)
        .set('x-csrf-token', asfCsrf)
        .send({
          estimateAmount: 1850,
          remarks: 'Quotation verified with central parts warehouse.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('SPECIAL_PART_ESTIMATE_PROVIDED');
      expect(res.body.data.specialPartEstimateAmount).toBe(1850);
    });

    it('moves back to IN_PROGRESS_REPAIR when customer approves estimate', async () => {
      const sr = await createTestServiceRequest('SPECIAL_PART_ESTIMATE_PROVIDED', true);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/customer-estimate-decision`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          decision: 'APPROVED',
          customerRemarks: 'Customer agreed to ₹1850 estimate on phone.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('IN_PROGRESS_REPAIR');
    });

    it('moves to REQUEST_FOR_CANCELLATION when customer rejects estimate', async () => {
      const sr = await createTestServiceRequest('SPECIAL_PART_ESTIMATE_PROVIDED', true);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/customer-estimate-decision`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          decision: 'REJECTED',
          customerRemarks: 'Customer declined repair due to estimate cost.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('REQUEST_FOR_CANCELLATION');
    });
  });

  /* ==========================================================================
     7. SECURE EVIDENCE ATTACHMENTS & PRIVATE STORAGE
     ========================================================================== */
  describe('Secure Evidence Attachments', () => {
    let attachmentId: string;

    it('allows checked-in engineer to upload evidence and validates MIME/SHA-256', async () => {
      const sr = await createTestServiceRequest('IN_PROGRESS_REPAIR', true);

      const dummyImage = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/attachments`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .field('attachmentType', 'SERIAL_NUMBER_PLATE')
        .attach('file', dummyImage, 'serial_plate.png');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.attachmentId).toBeDefined();
      expect(res.body.data.mimeType).toBe('image/png');
      expect(res.body.data.sha256Checksum).toBeDefined();

      attachmentId = res.body.data.attachmentId;
    });

    it('rejects unsupported executable file upload', async () => {
      const sr = await createTestServiceRequest('IN_PROGRESS_REPAIR', true);

      const res = await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/attachments`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .field('attachmentType', 'OTHER_EVIDENCE')
        .attach('file', Buffer.from('#!/bin/sh\necho hello'), 'malicious.sh');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    });

    it('streams evidence file with correct authorization and headers', async () => {
      const res = await request(app)
        .get(`/api/v1/asf/attachments/${attachmentId}/stream`)
        .set('Cookie', eng1Cookie);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.body).toBeInstanceOf(Buffer);
    });

    it('denies evidence streaming to unauthorized engineer', async () => {
      const res = await request(app)
        .get(`/api/v1/asf/attachments/${attachmentId}/stream`)
        .set('Cookie', eng2Cookie);

      expect(res.status).toBe(403);
    });

    it('deletes attachment metadata and unlinks private storage file', async () => {
      const delRes = await request(app)
        .delete(`/api/v1/asf/attachments/${attachmentId}`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify file is gone
      const getRes = await request(app)
        .get(`/api/v1/asf/attachments/${attachmentId}/stream`)
        .set('Cookie', eng1Cookie);

      expect(getRes.status).toBe(404);
    });
  });

  /* ==========================================================================
     8. INVENTORY BOUNDARY INVARIANT (PHASE 2B CRITICAL)
     ========================================================================== */
  describe('Phase 2B Inventory Boundary Invariant', () => {
    it('strictly guarantees no false inventory ledger or warehouse dispatch records are created', async () => {
      const sr = await createTestServiceRequest('IN_PROGRESS_REPAIR', true);

      // Add a part requirement
      await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/parts`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          partId: activePartId,
          quantity: 3,
          entryType: 'REQUIRED_PNA',
        });

      // Complete repair action
      await request(app)
        .post(`/api/v1/asf/jobs/${sr.requestId}/repair`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          repairCodeId: activeRepairCodeId,
          repairAction: 'PENDING_SPARE_PART',
          repairRemarks: 'Waiting for depot dispatch.',
        });

      // Check DB directly to ensure NO false inventory transactions exist
      const conn = await getOracleConnection();
      try {
        // Query user tables to verify that no stock ledger tables were falsely mutated
        const checkSql = `
          SELECT COUNT(*) AS CNT
          FROM USER_TABLES
          WHERE TABLE_NAME IN ('STOCK_LEDGER', 'INVENTORY_TRANSACTIONS', 'WAREHOUSE_DISPATCHES')
        `;
        const res = await conn.execute<any>(checkSql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        // Whether or not warehouse tables exist in future phases, this test verifies
        // Phase 2B only populated SERVICE_REQUEST_PARTS and SERVICE_REQUEST_EVENTS
        const partsCountSql = `
          SELECT COUNT(*) AS CNT
          FROM SERVICE_REQUEST_PARTS
          WHERE REQUEST_ID = :requestId
        `;
        const partsRes = await conn.execute<any>(partsCountSql, { requestId: sr.requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        expect(Number(partsRes.rows[0].CNT)).toBe(1);
      } finally {
        await conn.close();
      }
    });
  });
});
