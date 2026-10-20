import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeOraclePool, getOracleConnection } from '../src/database/oraclePool.js';
import { brandRepository } from '../src/database/repositories/brandRepository.js';
import { customerRepository } from '../src/database/repositories/customerRepository.js';
import { locationRepository } from '../src/database/repositories/locationRepository.js';
import { modelRepository } from '../src/database/repositories/modelRepository.js';
import { notificationRepository } from '../src/database/repositories/notificationRepository.js';
import { pincodeRepository } from '../src/database/repositories/pincodeRepository.js';
import { productRepository } from '../src/database/repositories/productRepository.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { serviceRequestEventRepository } from '../src/database/repositories/serviceRequestEventRepository.js';
import { serviceRequestRepository } from '../src/database/repositories/serviceRequestRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { verificationRepository } from '../src/database/repositories/verificationRepository.js';
import { mockSmsAdapter } from '../src/services/notificationService.js';
import { hashPassword } from '../src/services/passwordService.js';
import { slaMonitoringService } from '../src/services/slaMonitoringService.js';

describe('ASF Operations, SLA Monitoring, Dispatch & OTP Check-In (Phase 2A)', () => {
  const app = createApp();

  const PASSWORD = 'TestPassword123#';

  let asfLocation1Id: string;
  let asfLocation2Id: string;

  const asfUserId1 = crypto.randomUUID();
  const asfUserId2 = crypto.randomUUID();
  const engineerUserId1 = crypto.randomUUID();
  const engineerUserId2 = crypto.randomUUID();
  const adminUserId = crypto.randomUUID();
  const warehouseUserId = crypto.randomUUID();

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
  let whCookie: string;
  let whCsrf: string;

  // Master references
  let brandId: string;
  let productId: string;
  let modelId: string;
  let customerId: string;
  const customerPhone = '9876543210';

  beforeAll(async () => {
    // A. Provision Locations
    const loc1 = await locationRepository.createLocation({
      locationCode: `ASF1_${Date.now().toString(36).toUpperCase()}`,
      locationName: 'Mumbai Central Franchise Center',
      partyType: 'ASF',
    });
    asfLocation1Id = loc1.locationId;

    const loc2 = await locationRepository.createLocation({
      locationCode: `ASF2_${Date.now().toString(36).toUpperCase()}`,
      locationName: 'Delhi North Franchise Center',
      partyType: 'ASF',
    });
    asfLocation2Id = loc2.locationId;

    const passHash = await hashPassword(PASSWORD);

    // B. Provision Users
    // 1. ASF Manager 1 (Location 1)
    await userRepository.createUser({
      userId: asfUserId1,
      username: `asf1_${Date.now().toString(36)}`,
      email: `asf1_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Mumbai ASF Manager',
      passwordHash: passHash,
      locationId: asfLocation1Id,
      phoneNumber: '9876540001',
    });
    await rbacRepository.assignRoleToUser(asfUserId1, 'ASF', 'SETUP');

    // 2. ASF Manager 2 (Location 2)
    await userRepository.createUser({
      userId: asfUserId2,
      username: `asf2_${Date.now().toString(36)}`,
      email: `asf2_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Delhi ASF Manager',
      passwordHash: passHash,
      locationId: asfLocation2Id,
      phoneNumber: '9876540002',
    });
    await rbacRepository.assignRoleToUser(asfUserId2, 'ASF', 'SETUP');

    // 3. Field Engineer 1 (Location 1)
    await userRepository.createUser({
      userId: engineerUserId1,
      username: `eng1_${Date.now().toString(36)}`,
      email: `eng1_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Rajesh Kumar (Field Tech)',
      passwordHash: passHash,
      locationId: asfLocation1Id,
      phoneNumber: '9876540011',
    });
    await rbacRepository.assignRoleToUser(engineerUserId1, 'ENGINEER', 'SETUP');

    // 4. Field Engineer 2 (Location 2)
    await userRepository.createUser({
      userId: engineerUserId2,
      username: `eng2_${Date.now().toString(36)}`,
      email: `eng2_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Vikram Singh (Field Tech)',
      passwordHash: passHash,
      locationId: asfLocation2Id,
      phoneNumber: '9876540012',
    });
    await rbacRepository.assignRoleToUser(engineerUserId2, 'ENGINEER', 'SETUP');

    // 5. System Admin
    await userRepository.createUser({
      userId: adminUserId,
      username: `admin_asf_${Date.now().toString(36)}`,
      email: `admin_asf_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Admin ASF Ops',
      passwordHash: passHash,
    });
    await rbacRepository.assignRoleToUser(adminUserId, 'ADMIN', 'SETUP');

    // 6. Warehouse User
    await userRepository.createUser({
      userId: warehouseUserId,
      username: `wh_asf_${Date.now().toString(36)}`,
      email: `wh_asf_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Warehouse Storekeeper',
      passwordHash: passHash,
    });
    await rbacRepository.assignRoleToUser(warehouseUserId, 'WAREHOUSE', 'SETUP');

    // C. Login helper
    const login = async (uid: string) => {
      const u = await userRepository.findById(uid);
      const res = await request(app).post('/api/v1/auth/login').send({
        username: u!.username,
        password: PASSWORD,
      });
      const cookie = res.headers['set-cookie']?.find((c: string) => c.startsWith('crm_session='));
      return { cookie, csrf: res.body.data.csrfToken };
    };

    const s1 = await login(asfUserId1);
    asf1Cookie = s1.cookie!;
    asf1Csrf = s1.csrf;

    const s2 = await login(asfUserId2);
    asf2Cookie = s2.cookie!;
    asf2Csrf = s2.csrf;

    const se1 = await login(engineerUserId1);
    eng1Cookie = se1.cookie!;
    eng1Csrf = se1.csrf;

    const se2 = await login(engineerUserId2);
    eng2Cookie = se2.cookie!;
    eng2Csrf = se2.csrf;

    const sa = await login(adminUserId);
    adminCookie = sa.cookie!;
    adminCsrf = sa.csrf;

    const sw = await login(warehouseUserId);
    whCookie = sw.cookie!;
    whCsrf = sw.csrf;

    // D. Fetch master records
    const brands = await brandRepository.listBrands({ page: 1, limit: 1 });
    brandId = brands.items[0]!.brandId;

    const products = await productRepository.listProducts({ brandId, page: 1, limit: 1 });
    productId = products.items[0]!.productId;

    const models = await modelRepository.listModels({ productId, page: 1, limit: 1 });
    modelId = models.items[0]!.modelId;

    // Customer
    const pincodes = await pincodeRepository.listPincodes({ page: 1, limit: 1, isServiceable: 'Y' });
    const pRecord = pincodes.items[0];

    const cust = await customerRepository.createCustomer({
      fullName: 'Suresh Raina',
      primaryMobile: customerPhone,
      addressLine: 'Flat 402, Sea Breeze Apt, Bandra',
      stateId: pRecord.stateId,
      cityId: pRecord.cityId,
      pincode: pRecord.pincode,
    });
    customerId = cust.customerId;
  });

  afterAll(async () => {
    await closeOraclePool();
  });

  /**
   * Helper to create a service request directly in DB for test staging
   */
  async function createTestServiceRequest(options?: {
    locationId?: string;
    engineerId?: string;
    status?: any;
    slaOffsetHours?: number;
    acknowledged?: boolean;
  }) {
    const conn = await getOracleConnection();
    try {
      const jobNumber = await serviceRequestRepository.generateJobNumber('SK', 'AC', conn);
      const registeredAt = options?.slaOffsetHours
        ? new Date(Date.now() - options.slaOffsetHours * 3600 * 1000)
        : new Date();
      const sla48hExpiresAt = new Date(registeredAt.getTime() + 48 * 3600 * 1000);

      const sr = await serviceRequestRepository.createServiceRequest(
        {
          jobNumber,
          customerId,
          brandId,
          productId,
          modelId,
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          status: options?.status || 'REGISTERED',
          warrantyStatus: 'IN_WARRANTY',
          assignedLocationId: options?.locationId,
          assignedEngineerId: options?.engineerId,
          customerAddress: 'Flat 402, Sea Breeze Apt, Bandra',
          customerPincode: '400001',
          customerPhone,
          registeredBy: adminUserId,
          registeredByUsername: 'admin_test',
          sla48hExpiresAt,
        },
        conn
      );

      if (options?.acknowledged) {
        await conn.execute(
          `UPDATE SERVICE_REQUESTS SET ACKNOWLEDGED_AT = SYSTIMESTAMP WHERE REQUEST_ID = :id`,
          { id: sr.requestId }
        );
      }

      await serviceRequestEventRepository.createEvent(
        {
          requestId: sr.requestId,
          fromState: 'NONE',
          toState: options?.status || 'REGISTERED',
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

  // ============================================================================
  // 1. ASF WORK QUEUE & LOCATION SCOPING
  // ============================================================================
  describe('1. ASF Incoming Queue & Authorization Scoping', () => {
    it('rejects unauthenticated requests to the ASF queue with 401', async () => {
      const res = await request(app).get('/api/v1/asf/queue');
      expect(res.status).toBe(401);
    });

    it('denies warehouse user lacking asf:read or calls:read permissions with 403', async () => {
      const res = await request(app)
        .get('/api/v1/asf/queue')
        .set('Cookie', whCookie);
      expect(res.status).toBe(403);
    });

    it('scopes ASF manager view to their own franchise location tickets', async () => {
      // Create ticket in Location 1
      const ticket1 = await createTestServiceRequest({ locationId: asfLocation1Id });
      // Create ticket in Location 2
      const ticket2 = await createTestServiceRequest({ locationId: asfLocation2Id });

      // ASF Manager 1 queries queue
      const res1 = await request(app)
        .get('/api/v1/asf/queue?view=all')
        .set('Cookie', asf1Cookie);

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);

      const items1 = res1.body.data.items;
      const foundT1 = items1.some((i: any) => i.requestId === ticket1.requestId);
      const foundT2 = items1.some((i: any) => i.requestId === ticket2.requestId);

      expect(foundT1).toBe(true);
      expect(foundT2).toBe(false); // Location 2 must NOT be visible to Location 1 manager

      // ASF Manager 2 queries queue
      const res2 = await request(app)
        .get('/api/v1/asf/queue?view=all')
        .set('Cookie', asf2Cookie);

      expect(res2.status).toBe(200);
      const items2 = res2.body.data.items;
      expect(items2.some((i: any) => i.requestId === ticket2.requestId)).toBe(true);
      expect(items2.some((i: any) => i.requestId === ticket1.requestId)).toBe(false);
    });

    it('allows Admin to view tickets across all locations and filter by locationId', async () => {
      const ticket1 = await createTestServiceRequest({ locationId: asfLocation1Id });
      const ticket2 = await createTestServiceRequest({ locationId: asfLocation2Id });

      // Admin queries all
      const resAll = await request(app)
        .get('/api/v1/asf/queue?view=all&limit=100')
        .set('Cookie', adminCookie);

      expect(resAll.status).toBe(200);
      const items = resAll.body.data.items;
      expect(items.some((i: any) => i.requestId === ticket1.requestId)).toBe(true);
      expect(items.some((i: any) => i.requestId === ticket2.requestId)).toBe(true);

      // Admin filters by location 1
      const resLoc1 = await request(app)
        .get(`/api/v1/asf/queue?view=all&locationId=${asfLocation1Id}`)
        .set('Cookie', adminCookie);

      expect(resLoc1.status).toBe(200);
      const loc1Items = resLoc1.body.data.items;
      expect(loc1Items.some((i: any) => i.requestId === ticket1.requestId)).toBe(true);
      expect(loc1Items.some((i: any) => i.requestId === ticket2.requestId)).toBe(false);
    });

    it('returns eligible active field engineers for the franchise location', async () => {
      const res = await request(app)
        .get(`/api/v1/asf/engineers/${asfLocation1Id}`)
        .set('Cookie', asf1Cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const engineers = res.body.data;
      expect(engineers.length).toBeGreaterThanOrEqual(1);

      const eng = engineers.find((e: any) => e.userId === engineerUserId1);
      expect(eng).toBeDefined();
      expect(eng.fullName).toBe('Rajesh Kumar (Field Tech)');
      expect(eng.locationId).toBe(asfLocation1Id);
    });

    it('prevents ASF manager from accessing engineers of another franchise location', async () => {
      const res = await request(app)
        .get(`/api/v1/asf/engineers/${asfLocation2Id}`)
        .set('Cookie', asf1Cookie); // ASF 1 accessing Location 2
      expect(res.status).toBe(403);
    });
  });

  // ============================================================================
  // 2. SINGLE-COMMIT DISPATCH & APPOINTMENT WORKFLOW
  // ============================================================================
  describe('2. Single-Commit Dispatch & Appointment Scheduling', () => {
    it('successfully dispatches request, sets appointment, generates OTP hash, and queues SMS 2', async () => {
      mockSmsAdapter.clear();
      const ticket = await createTestServiceRequest({ locationId: asfLocation1Id });

      const appointmentDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const payload = {
        appointmentDate,
        appointmentSlot: '10:00 AM - 01:00 PM',
        engineerId: engineerUserId1,
        travelDistanceKm: 12.5,
        areaType: 'LOCAL',
        remarks: 'Customer available in morning slot',
      };

      const res = await request(app)
        .post(`/api/v1/asf/requests/${ticket.requestId}/dispatch`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.smsQueued).toBe(true);

      const dispatched = res.body.data.serviceRequest;
      expect(dispatched.status).toBe('APPOINTMENT_SCHEDULED');
      expect(dispatched.assignedEngineerId).toBe(engineerUserId1);
      expect(dispatched.assignedEngineerName).toBe('Rajesh Kumar (Field Tech)');
      expect(dispatched.appointmentSlot).toBe('10:00 AM - 01:00 PM');
      expect(dispatched.travelDistanceKm).toBe(12.5);
      expect(dispatched.areaType).toBe('LOCAL');
      expect(dispatched.acknowledgedAt).toBeDefined();

      // Check database state
      const dbTicket = await serviceRequestRepository.findById(ticket.requestId);
      expect(dbTicket?.status).toBe('APPOINTMENT_SCHEDULED');
      expect(dbTicket?.acknowledgedAt).not.toBeNull();

      // Verify OTP Secret in SERVICE_REQUEST_VERIFICATIONS (Never raw OTP!)
      const verification = await verificationRepository.findByRequestId(ticket.requestId);
      expect(verification).not.toBeNull();
      expect(verification?.checkInOtpHash).toBeDefined();
      expect(verification?.checkInOtpHash).toHaveLength(64); // SHA-256 hex
      expect(verification?.checkInOtpSalt).toBeDefined();
      expect(verification?.checkInOtpAttempts).toBe(0);
      expect(verification?.checkInVerifiedAt).toBeUndefined();

      // Verify Lifecycle Event
      const events = await serviceRequestEventRepository.findByRequestId(ticket.requestId);
      const dispatchEvt = events.find((e) => e.toState === 'APPOINTMENT_SCHEDULED');
      expect(dispatchEvt).toBeDefined();
      expect(dispatchEvt?.eventType).toBe('APPOINTMENT_SCHEDULED');
      expect(dispatchEvt?.triggeredByUserId).toBe(asfUserId1);

      // Verify SMS 2 queued in NOTIFICATIONS_OUTBOX
      const outbox = await notificationRepository.listByRequestId(ticket.requestId);
      const sms2 = outbox.find((n) => n.templateCode === 'SMS_02_APPOINTMENT');
      expect(sms2).toBeDefined();
      expect(sms2?.recipient).toBe(customerPhone);
      expect(sms2?.messageBody).toContain(`Service Request #${ticket.jobNumber}`);
      expect(sms2?.messageBody).toContain('Rajesh Kumar (Field Tech)');
      expect(sms2?.messageBody).toContain('Please keep the required documents ready');
      expect(sms2?.messageBody).toMatch(/share the OTP \d{6}/); // contains 6-digit OTP in message
    });

    it('rejects dispatch to an engineer from a mismatched franchise location', async () => {
      const ticket = await createTestServiceRequest({ locationId: asfLocation1Id });

      // Try assigning engineer from Location 2 to Location 1 ticket
      const payload = {
        appointmentDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        appointmentSlot: '02:00 PM - 05:00 PM',
        engineerId: engineerUserId2, // Belongs to Location 2!
      };

      const res = await request(app)
        .post(`/api/v1/asf/requests/${ticket.requestId}/dispatch`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ENGINEER_LOCATION_MISMATCH');
    });

    it('rejects dispatch when ticket belongs to another franchise location', async () => {
      const ticket2 = await createTestServiceRequest({ locationId: asfLocation2Id });

      const payload = {
        appointmentDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        appointmentSlot: '10:00 AM - 01:00 PM',
        engineerId: engineerUserId1,
      };

      const res = await request(app)
        .post(`/api/v1/asf/requests/${ticket2.requestId}/dispatch`)
        .set('Cookie', asf1Cookie) // Manager 1 attempting to dispatch Location 2 ticket
        .set('x-csrf-token', asf1Csrf)
        .send(payload);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_LOCATION');
    });

    it('enforces CSRF protection on dispatch', async () => {
      const ticket = await createTestServiceRequest({ locationId: asfLocation1Id });

      const res = await request(app)
        .post(`/api/v1/asf/requests/${ticket.requestId}/dispatch`)
        .set('Cookie', asf1Cookie)
        .send({
          appointmentDate: new Date().toISOString(),
          appointmentSlot: '10:00 AM - 01:00 PM',
          engineerId: engineerUserId1,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
    });
  });

  // ============================================================================
  // 3. TECHNICIAN CHECK-IN & OTP VERIFICATION SECURITY
  // ============================================================================
  describe('3. Technician On-Site Check-In & OTP Verification Security', () => {
    let checkInTicketId: string;
    let expectedOtp: string;

    beforeAll(async () => {
      // Create ticket and dispatch to engineer 1
      const ticket = await createTestServiceRequest({ locationId: asfLocation1Id });
      checkInTicketId = ticket.requestId;

      mockSmsAdapter.clear();
      await request(app)
        .post(`/api/v1/asf/requests/${checkInTicketId}/dispatch`)
        .set('Cookie', asf1Cookie)
        .set('x-csrf-token', asf1Csrf)
        .send({
          appointmentDate: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
          appointmentSlot: '10:00 AM - 01:00 PM',
          engineerId: engineerUserId1,
        });

      // Extract the OTP delivered to the customer via SMS 2
      const sentSms = mockSmsAdapter.getSentMessages();
      const match = sentSms[0]?.messageBody.match(/share the OTP (\d{6})/);
      expectedOtp = match ? match[1]! : '123456';
    });

    it('rejects an unauthorized technician trying to check in to another engineer ticket with 403', async () => {
      // Engineer 2 attempts check-in to Engineer 1 ticket
      const res = await request(app)
        .post(`/api/v1/asf/requests/${checkInTicketId}/check-in`)
        .set('Cookie', eng2Cookie)
        .set('x-csrf-token', eng2Csrf)
        .send({ otp: expectedOtp });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_TECHNICIAN');
    });

    it('rejects incorrect OTP with 400 and increments failed attempts counter', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/requests/${checkInTicketId}/check-in`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({ otp: '000000' }); // Wrong OTP

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_OTP');
      expect(res.body.error.message).toContain('attempt(s) remaining');

      // Check verification record in DB
      const verif = await verificationRepository.findByRequestId(checkInTicketId);
      expect(verif?.checkInOtpAttempts).toBe(1);
    });

    it('locks out check-in after 5 failed OTP attempts', async () => {
      // Fail remaining 4 attempts
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post(`/api/v1/asf/requests/${checkInTicketId}/check-in`)
          .set('Cookie', eng1Cookie)
          .set('x-csrf-token', eng1Csrf)
          .send({ otp: '999999' });
      }

      // Check DB attempts counter is now 5
      const verif = await verificationRepository.findByRequestId(checkInTicketId);
      expect(verif?.checkInOtpAttempts).toBe(5);

      // 6th attempt (even with valid OTP) must now be rejected with OTP_LOCKED
      const lockedRes = await request(app)
        .post(`/api/v1/asf/requests/${checkInTicketId}/check-in`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({ otp: expectedOtp });

      expect(lockedRes.status).toBe(400);
      expect(lockedRes.body.error.code).toBe('OTP_LOCKED');
    });

    it('allows authorized OTP regeneration (SMS 6), superseding the locked OTP and resetting counter', async () => {
      mockSmsAdapter.clear();

      const regenRes = await request(app)
        .post(`/api/v1/asf/requests/${checkInTicketId}/regenerate-otp`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({ reason: 'Customer entered wrong code 5 times' });

      expect(regenRes.status).toBe(200);
      expect(regenRes.body.success).toBe(true);
      expect(regenRes.body.data.smsQueued).toBe(true);

      // Verify attempts reset to 0 in DB
      const verif = await verificationRepository.findByRequestId(checkInTicketId);
      expect(verif?.checkInOtpAttempts).toBe(0);
      expect(verif?.checkInRegeneratedCount).toBe(1);

      // Verify SMS 6 was queued and delivered
      const sentSms = mockSmsAdapter.getSentMessages();
      expect(sentSms.length).toBe(1);
      expect(sentSms[0]?.templateCode).toBe('SMS_06_OTP_REGEN');
      expect(sentSms[0]?.messageBody).toContain('Please share OTP');

      // Extract new OTP
      const match = sentSms[0]?.messageBody.match(/share OTP (\d{6})/);
      expectedOtp = match ? match[1]! : '';
      expect(expectedOtp).toHaveLength(6);
    });

    it('successfully checks in with correct customer OTP and records TECHNICIAN_CHECKED_IN state', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/requests/${checkInTicketId}/check-in`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({
          otp: expectedOtp,
          geocoordinates: { latitude: 19.076, longitude: 72.8777 },
          remarks: 'Technician arrived on customer site',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verified).toBe(true);

      const updated = res.body.data.serviceRequest;
      expect(updated.status).toBe('TECHNICIAN_CHECKED_IN');
      expect(updated.checkedInAt).toBeDefined();

      // Check DB state
      const dbTicket = await serviceRequestRepository.findById(checkInTicketId);
      expect(dbTicket?.status).toBe('TECHNICIAN_CHECKED_IN');
      expect(dbTicket?.checkedInAt).not.toBeNull();

      // Check verification record consumed
      const verif = await verificationRepository.findByRequestId(checkInTicketId);
      expect(verif?.checkInVerifiedAt).not.toBeNull();

      // Verify event logged
      const events = await serviceRequestEventRepository.findByRequestId(checkInTicketId);
      const checkInEvt = events.find((e) => e.toState === 'TECHNICIAN_CHECKED_IN');
      expect(checkInEvt).toBeDefined();
      expect(checkInEvt?.eventType).toBe('TECHNICIAN_CHECKED_IN');
      expect(checkInEvt?.triggeredByUserId).toBe(engineerUserId1);
    });

    it('rejects duplicate check-in submission once already checked in', async () => {
      const res = await request(app)
        .post(`/api/v1/asf/requests/${checkInTicketId}/check-in`)
        .set('Cookie', eng1Cookie)
        .set('x-csrf-token', eng1Csrf)
        .send({ otp: expectedOtp });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });

    it('allows field technician to view their assigned visits via /api/v1/asf/engineer-jobs', async () => {
      const res = await request(app)
        .get('/api/v1/asf/engineer-jobs')
        .set('Cookie', eng1Cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const jobs = res.body.data.items;
      expect(jobs.some((j: any) => j.requestId === checkInTicketId)).toBe(true);
    });
  });

  // ============================================================================
  // 4. 48-HOUR SLA MONITORING & EVALUATION
  // ============================================================================
  describe('4. 48-Hour Acknowledgement SLA Monitoring & Breach Flagging', () => {
    it('detects unacknowledged tickets exceeding 48h, flags SLA_BREACHED_48H = Y, and records event', async () => {
      // Create ticket aged 50 hours (exceeded 48h) without acknowledgment
      const overdueTicket = await createTestServiceRequest({
        locationId: asfLocation1Id,
        slaOffsetHours: 50,
        acknowledged: false,
      });

      // Execute SLA evaluation
      const evalRes = await request(app)
        .post('/api/v1/asf/sla/evaluate')
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf);

      expect(evalRes.status).toBe(200);
      expect(evalRes.body.success).toBe(true);

      const result = evalRes.body.data;
      expect(result.breachedRequestIds).toContain(overdueTicket.requestId);

      // Verify DB ticket is flagged
      const dbTicket = await serviceRequestRepository.findById(overdueTicket.requestId);
      expect(dbTicket?.slaBreached48h).toBe('Y');
      expect(dbTicket?.slaBreached48hAt).not.toBeNull();

      // Verify event was logged
      const events = await serviceRequestEventRepository.findByRequestId(overdueTicket.requestId);
      const breachEvt = events.find((e) => e.eventType === 'SLA_48H_BREACHED');
      expect(breachEvt).toBeDefined();
      expect(breachEvt?.triggeredByUsername).toBe('SYSTEM_SLA_DAEMON');

      // Verify repeated evaluation does NOT duplicate breach flag or event
      const repeatRes = await request(app)
        .post('/api/v1/asf/sla/evaluate')
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf);

      expect(repeatRes.status).toBe(200);
      expect(repeatRes.body.data.breachedRequestIds).not.toContain(overdueTicket.requestId);

      const eventsAfter = await serviceRequestEventRepository.findByRequestId(overdueTicket.requestId);
      const breachEvtsCount = eventsAfter.filter((e) => e.eventType === 'SLA_48H_BREACHED').length;
      expect(breachEvtsCount).toBe(1); // Exactly 1 immutable event
    });

    it('surfaces breached tickets in the overdue queue view (view=overdue)', async () => {
      const res = await request(app)
        .get('/api/v1/asf/queue?view=overdue')
        .set('Cookie', asf1Cookie);

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(1);

      // Verify computed slaStatus property
      const first = items[0];
      expect(first.slaStatus).toBeDefined();
      expect(first.slaStatus.isBreached).toBe(true);
      expect(first.slaStatus.statusLabel).toBe('BREACHED');
    });

    it('does not flag tickets that were acknowledged within the 48-hour threshold', async () => {
      const acknowledgedTicket = await createTestServiceRequest({
        locationId: asfLocation1Id,
        slaOffsetHours: 50,
        acknowledged: true, // Acknowledged!
      });

      const res = await request(app)
        .post('/api/v1/asf/sla/evaluate')
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf);

      expect(res.status).toBe(200);
      expect(res.body.data.breachedRequestIds).not.toContain(acknowledgedTicket.requestId);

      const dbTicket = await serviceRequestRepository.findById(acknowledgedTicket.requestId);
      expect(dbTicket?.slaBreached48h).toBe('N');
    });
  });
});
