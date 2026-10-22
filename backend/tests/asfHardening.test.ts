import crypto from 'crypto';
import oracledb from 'oracledb';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { mockSmsAdapter, notificationService } from '../src/services/notificationService.js';
import { hashPassword } from '../src/services/passwordService.js';
import { slaMonitoringService } from '../src/services/slaMonitoringService.js';
import {
  decryptNotificationPayload,
  encryptNotificationPayload,
  generateCheckInOtp,
  generateSalt,
  hashOtp,
  validateCryptoConfig,
  verifyOtp,
} from '../src/utils/cryptoUtils.js';

describe('Phase 2A.1 — OTP Secret Protection, Outbox Hardening & SLA Authorization', () => {
  const app = createApp();
  const PASSWORD = 'TestPassword123#';

  let asfLocationId: string;
  const asfManagerUserId = crypto.randomUUID();
  const engineerUserId = crypto.randomUUID();
  const adminUserId = crypto.randomUUID();

  let asfCookie: string;
  let asfCsrf: string;
  let engCookie: string;
  let engCsrf: string;
  let adminCookie: string;
  let adminCsrf: string;

  let brandId: string;
  let productId: string;
  let modelId: string;
  let customerId: string;
  const customerPhone = '9876549999';

  beforeAll(async () => {
    // 1. Provision location
    const loc = await locationRepository.createLocation({
      locationCode: `SEC_${Date.now().toString(36).toUpperCase()}`,
      locationName: 'Security Validation Center',
      partyType: 'ASF',
    });
    asfLocationId = loc.locationId;

    const passHash = await hashPassword(PASSWORD);

    // 2. Provision ASF Manager (has asf:read, calls:assign, etc., but NOT sla:manage)
    await userRepository.createUser({
      userId: asfManagerUserId,
      username: `asf_sec_${Date.now().toString(36)}`,
      email: `asf_sec_${Date.now().toString(36)}@crm.internal`,
      fullName: 'ASF Security Manager',
      passwordHash: passHash,
      locationId: asfLocationId,
      phoneNumber: '9876541111',
    });
    await rbacRepository.assignRoleToUser(asfManagerUserId, 'ASF', 'SETUP');

    // 3. Provision Field Engineer
    await userRepository.createUser({
      userId: engineerUserId,
      username: `eng_sec_${Date.now().toString(36)}`,
      email: `eng_sec_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Field Engineer Security',
      passwordHash: passHash,
      locationId: asfLocationId,
      phoneNumber: '9876542222',
    });
    await rbacRepository.assignRoleToUser(engineerUserId, 'ENGINEER', 'SETUP');

    // 4. Provision System Admin (has sla:manage via V010 migration)
    await userRepository.createUser({
      userId: adminUserId,
      username: `admin_sec_${Date.now().toString(36)}`,
      email: `admin_sec_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Admin Security Lead',
      passwordHash: passHash,
    });
    await rbacRepository.assignRoleToUser(adminUserId, 'ADMIN', 'SETUP');

    // 5. Login helper
    const login = async (uid: string) => {
      const u = await userRepository.findById(uid);
      const res = await request(app).post('/api/v1/auth/login').send({
        username: u!.username,
        password: PASSWORD,
      });
      const cookie = res.headers['set-cookie']?.find((c: string) => c.startsWith('crm_session='));
      return { cookie: cookie!, csrf: res.body.data.csrfToken as string };
    };

    const sAsf = await login(asfManagerUserId);
    asfCookie = sAsf.cookie;
    asfCsrf = sAsf.csrf;

    const sEng = await login(engineerUserId);
    engCookie = sEng.cookie;
    engCsrf = sEng.csrf;

    const sAdmin = await login(adminUserId);
    adminCookie = sAdmin.cookie;
    adminCsrf = sAdmin.csrf;

    // 6. Master references
    const brands = await brandRepository.listBrands({ page: 1, limit: 1 });
    brandId = brands.items[0]!.brandId;

    const products = await productRepository.listProducts({ brandId, page: 1, limit: 1 });
    productId = products.items[0]!.productId;

    const models = await modelRepository.listModels({ productId, page: 1, limit: 1 });
    modelId = models.items[0]!.modelId;

    const pincodes = await pincodeRepository.listPincodes({ page: 1, limit: 1, isServiceable: 'Y' });
    const pRecord = pincodes.items[0];

    const cust = await customerRepository.createCustomer({
      fullName: 'Vikram Malhotra',
      primaryMobile: customerPhone,
      addressLine: 'Suite 901, Cyber Park',
      stateId: pRecord.stateId,
      cityId: pRecord.cityId,
      pincode: pRecord.pincode,
    });
    customerId = cust.customerId;
  });

  afterAll(async () => {
    await closeOraclePool();
  });

  beforeEach(() => {
    mockSmsAdapter.clear();
  });

  async function createTicket(options?: { status?: any; slaOffsetHours?: number }) {
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
          assignedLocationId: asfLocationId,
          customerAddress: 'Suite 901, Cyber Park',
          customerPincode: '400001',
          customerPhone,
          registeredBy: adminUserId,
          registeredByUsername: 'admin_sec',
          sla48hExpiresAt,
        },
        conn
      );

      await serviceRequestEventRepository.createEvent(
        {
          requestId: sr.requestId,
          fromState: 'NONE',
          toState: options?.status || 'REGISTERED',
          eventType: 'REGISTERED',
          triggeredByUserId: adminUserId,
          triggeredByUsername: 'admin_sec',
          triggeredByRole: 'ADMIN',
          remarks: 'Test ticket initialized',
          metadataJson: { jobNumber },
        },
        conn
      );

      await conn.commit();
      return sr;
    } finally {
      await conn.close();
    }
  }

  // =========================================================================
  // SECTION 1: OTP Secret Protection & Cryptographic Binding
  // =========================================================================
  describe('1. Cryptographic Protection of OTP Verification', () => {
    it('validates crypto configuration successfully at startup', () => {
      expect(() => validateCryptoConfig()).not.toThrow();
    });

    it('generates a 6-digit OTP and secure random salt', () => {
      const otp = generateCheckInOtp();
      expect(otp).toMatch(/^\d{6}$/);

      const salt = generateSalt(16);
      expect(salt).toHaveLength(32); // 16 bytes = 32 hex chars
    });

    it('produces a deterministic HMAC-SHA-256 digest bound to requestId', () => {
      const requestId = crypto.randomUUID();
      const salt = generateSalt();
      const otp = '458921';

      const digest1 = hashOtp({ otp, salt, requestId, purpose: 'CHECK_IN' });
      const digest2 = hashOtp({ otp, salt, requestId, purpose: 'CHECK_IN' });

      expect(digest1).toHaveLength(64);
      expect(digest1).toBe(digest2);
    });

    it('prevents cross-request OTP substitution: different requestId produces different digest', () => {
      const salt = generateSalt();
      const otp = '654321';
      const reqIdA = crypto.randomUUID();
      const reqIdB = crypto.randomUUID();

      const digestA = hashOtp({ otp, salt, requestId: reqIdA, purpose: 'CHECK_IN' });
      const digestB = hashOtp({ otp, salt, requestId: reqIdB, purpose: 'CHECK_IN' });

      expect(digestA).not.toBe(digestB);

      // Verifying with reqIdB using digestA must fail
      const isValidCross = verifyOtp({
        providedOtp: otp,
        salt,
        requestId: reqIdB,
        expectedHash: digestA,
        purpose: 'CHECK_IN',
      });
      expect(isValidCross).toBe(false);
    });

    it('accepts correct OTP and rejects incorrect OTP with constant-time verification', () => {
      const requestId = crypto.randomUUID();
      const salt = generateSalt();
      const correctOtp = '882109';
      const wrongOtp = '882100';

      const expectedHash = hashOtp({ otp: correctOtp, salt, requestId });

      expect(verifyOtp({ providedOtp: correctOtp, salt, requestId, expectedHash })).toBe(true);
      expect(verifyOtp({ providedOtp: wrongOtp, salt, requestId, expectedHash })).toBe(false);
      expect(verifyOtp({ providedOtp: '', salt, requestId, expectedHash })).toBe(false);
    });
  });

  // =========================================================================
  // SECTION 2: Notification Outbox Hardening (AES-256-GCM Authenticated Encryption)
  // =========================================================================
  describe('2. Outbox Payload Encryption & Tamper Resistance', () => {
    it('encrypts plaintext payload using AES-256-GCM with 12-byte IV and 16-byte auth tag', () => {
      const plaintext = 'Dear Customer, your OTP is 771234';
      const encrypted = encryptNotificationPayload(plaintext);

      expect(encrypted.encryptedPayload).toBeDefined();
      expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex
      expect(encrypted.authTag).toHaveLength(32); // 16 bytes = 32 hex
      expect(encrypted.keyVersion).toBe('v1');
      expect(encrypted.encryptedPayload).not.toContain('771234');
    });

    it('decrypts authenticated payload correctly inside trusted delivery path', () => {
      const plaintext = 'Confidential SMS OTP Body: 902143';
      const encrypted = encryptNotificationPayload(plaintext);

      const decrypted = decryptNotificationPayload({
        encryptedPayload: encrypted.encryptedPayload,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
      });

      expect(decrypted).toBe(plaintext);
    });

    it('rejects tampered ciphertext and fails authentication tag check', () => {
      const plaintext = 'Dear Customer, your OTP is 112233';
      const encrypted = encryptNotificationPayload(plaintext);

      // Flip the last hex char of ciphertext
      const lastChar = encrypted.encryptedPayload.slice(-1);
      const flippedChar = lastChar === 'a' ? 'b' : 'a';
      const tamperedPayload = encrypted.encryptedPayload.slice(0, -1) + flippedChar;

      expect(() =>
        decryptNotificationPayload({
          encryptedPayload: tamperedPayload,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
        })
      ).toThrow();
    });

    it('rejects corrupted authentication tag', () => {
      const plaintext = 'Dear Customer, your OTP is 998877';
      const encrypted = encryptNotificationPayload(plaintext);

      // Tamper with the authentication tag
      const corruptedTag = '00000000000000000000000000000000';

      expect(() =>
        decryptNotificationPayload({
          encryptedPayload: encrypted.encryptedPayload,
          iv: encrypted.iv,
          authTag: corruptedTag,
          keyVersion: encrypted.keyVersion,
        })
      ).toThrow();
    });
  });

  // =========================================================================
  // SECTION 3: End-to-End Operational Lifecycle & Outbox Security
  // =========================================================================
  describe('3. Dispatch, Outbox Verification, Zero-Retention & API Redaction', () => {
    it('dispatches appointment: persists ciphertext in outbox, never plaintext OTP', async () => {
      const ticket = await createTicket();

      const appointmentDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0];

      const res = await request(app)
        .post(`/api/v1/asf/requests/${ticket.requestId}/dispatch`)
        .set('Cookie', asfCookie)
        .set('X-CSRF-Token', asfCsrf)
        .send({
          engineerId: engineerUserId,
          appointmentDate,
          appointmentSlot: '14:00 - 16:00',
          travelDistanceKm: 12.5,
          areaType: 'LOCAL',
          remarks: 'Dispatched for security audit test',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Wait for background notification processor to deliver SMS
      await new Promise((r) => setTimeout(r, 150));

      // 1. Inspect SERVICE_REQUEST_VERIFICATIONS in Oracle
      const verification = await verificationRepository.findByRequestId(ticket.requestId);
      expect(verification).not.toBeNull();
      expect(verification?.checkInOtpHash).toHaveLength(64); // HMAC-SHA-256
      expect(verification?.checkInOtpSalt).toHaveLength(32); // 16-byte salt
      expect(verification?.checkInVerifiedAt).toBeUndefined();

      // 2. Inspect NOTIFICATIONS_OUTBOX in Oracle directly
      const conn = await getOracleConnection();
      try {
        const outboxRows = await conn.execute<any>(
          `SELECT NOTIFICATION_ID, TEMPLATE_CODE, MESSAGE_BODY, IS_ENCRYPTED, 
                  ENCRYPTED_PAYLOAD, ENCRYPTION_IV, AUTH_TAG, STATUS
           FROM NOTIFICATIONS_OUTBOX 
           WHERE REQUEST_ID = :id AND TEMPLATE_CODE = 'SMS_02_APPOINTMENT'`,
          { id: ticket.requestId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        expect(outboxRows.rows).toBeDefined();
        expect(outboxRows.rows!.length).toBeGreaterThanOrEqual(1);
        const row = outboxRows.rows![0];

        expect(row.IS_ENCRYPTED).toBe('Y');
        // Critical: plaintext column must NOT contain the OTP
        expect(row.MESSAGE_BODY).not.toMatch(/\b\d{6}\b/);

        // Since the async processor immediately delivers in test environment,
        // verify zero-retention cleanup: upon SENT status, ciphertext is purged
        if (row.STATUS === 'SENT') {
          expect(row.ENCRYPTED_PAYLOAD).toBeNull();
          expect(row.ENCRYPTION_IV).toBeNull();
          expect(row.AUTH_TAG).toBeNull();
          expect(row.MESSAGE_BODY).toBe('[DELIVERED_AND_PURGED]');
        }
      } finally {
        await conn.close();
      }

      // 3. Inspect SMS Adapter: the adapter received the decrypted text with the valid OTP
      const sentMsgs = mockSmsAdapter.getSentMessages();
      const appointmentSms = sentMsgs.find(
        (m) => m.templateCode === 'SMS_02_APPOINTMENT' && m.recipient === customerPhone
      );
      expect(appointmentSms).toBeDefined();
      expect(appointmentSms!.messageBody).toContain('Service Request #');
      const otpMatch = appointmentSms!.messageBody.match(/OTP (\d{6})/);
      expect(otpMatch).not.toBeNull();
      const checkInOtp = otpMatch![1];

      // 4. Test Notification History API Redaction: GET /api/v1/call-center/requests/:id/notifications
      const apiRes = await request(app)
        .get(`/api/v1/call-center/requests/${ticket.requestId}/notifications`)
        .set('Cookie', asfCookie);

      expect(apiRes.status).toBe(200);
      expect(apiRes.body.success).toBe(true);
      const apiNotifications = apiRes.body.data;
      const apiSms2 = apiNotifications.find((n: any) => n.templateCode === 'SMS_02_APPOINTMENT');
      expect(apiSms2).toBeDefined();

      // Ensure API redacts message body and completely strips cryptographic metadata
      expect(apiSms2.messageBody).toBe('[PROTECTED_OTP_NOTIFICATION]');
      expect(apiSms2.encryptedPayload).toBeUndefined();
      expect(apiSms2.encryptionIv).toBeUndefined();
      expect(apiSms2.authTag).toBeUndefined();
      expect(apiSms2.keyVersion).toBeUndefined();
      // Ensure safe metadata is intact
      expect(apiSms2.notificationId).toBeDefined();
      expect(apiSms2.status).toBe('SENT');
      expect(apiSms2.channel).toBe('SMS');

      // 5. Check-In with the OTP: Engineer checks in successfully
      const checkInRes = await request(app)
        .post(`/api/v1/asf/requests/${ticket.requestId}/check-in`)
        .set('Cookie', engCookie)
        .set('X-CSRF-Token', engCsrf)
        .send({ otp: checkInOtp });

      expect(checkInRes.status).toBe(200);
      expect(checkInRes.body.success).toBe(true);
      expect(checkInRes.body.data.serviceRequest.status).toBe('TECHNICIAN_CHECKED_IN');
      expect(checkInRes.body.data.verified).toBe(true);

      // Verification record is marked verified and OTP is consumed
      const verifiedRecord = await verificationRepository.findByRequestId(ticket.requestId);
      expect(verifiedRecord?.checkInVerifiedAt).toBeDefined();

      // Attempting to reuse the OTP fails
      const reuseRes = await request(app)
        .post(`/api/v1/asf/requests/${ticket.requestId}/check-in`)
        .set('Cookie', engCookie)
        .set('X-CSRF-Token', engCsrf)
        .send({ otp: checkInOtp });

      expect(reuseRes.status).toBe(400);
      expect(reuseRes.body.error.code).toBe('INVALID_STATUS');
    });

    it('handles incorrect OTP and enforces 5-attempt lockout', async () => {
      const ticket = await createTicket();
      const appointmentDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0];

      await request(app)
        .post(`/api/v1/asf/requests/${ticket.requestId}/dispatch`)
        .set('Cookie', asfCookie)
        .set('X-CSRF-Token', asfCsrf)
        .send({
          engineerId: engineerUserId,
          appointmentDate,
          appointmentSlot: '10:00 - 12:00',
          travelDistanceKm: 8,
          areaType: 'LOCAL',
        });

      // Attempt 1 to 4: Incorrect OTP
      for (let i = 1; i <= 4; i++) {
        const wrongRes = await request(app)
          .post(`/api/v1/asf/requests/${ticket.requestId}/check-in`)
          .set('Cookie', engCookie)
          .set('X-CSRF-Token', engCsrf)
          .send({ otp: '000000' });

        expect(wrongRes.status).toBe(400);
        expect(wrongRes.body.error.code).toBe('INVALID_OTP');
        expect(wrongRes.body.error.message).toContain(`${5 - i} attempt(s) remaining`);
      }

      // Attempt 5: Final failed attempt
      const attempt5Res = await request(app)
        .post(`/api/v1/asf/requests/${ticket.requestId}/check-in`)
        .set('Cookie', engCookie)
        .set('X-CSRF-Token', engCsrf)
        .send({ otp: '000000' });

      expect(attempt5Res.status).toBe(400);
      expect(attempt5Res.body.error.code).toBe('INVALID_OTP');

      // Attempt 6: Locked out
      const lockedRes = await request(app)
        .post(`/api/v1/asf/requests/${ticket.requestId}/check-in`)
        .set('Cookie', engCookie)
        .set('X-CSRF-Token', engCsrf)
        .send({ otp: '000000' });

      expect(lockedRes.status).toBe(400);
      expect(lockedRes.body.error.code).toBe('OTP_LOCKED');
    });

    it('regenerates OTP (SMS 6): supersedes old OTP and encrypts SMS 6 payload', async () => {
      const ticket = await createTicket();
      const appointmentDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0];

      await request(app)
        .post(`/api/v1/asf/requests/${ticket.requestId}/dispatch`)
        .set('Cookie', asfCookie)
        .set('X-CSRF-Token', asfCsrf)
        .send({
          engineerId: engineerUserId,
          appointmentDate,
          appointmentSlot: '16:00 - 18:00',
          travelDistanceKm: 5,
          areaType: 'LOCAL',
        });

      // Get original OTP from SMS 2
      const firstSms = mockSmsAdapter
        .getSentMessages()
        .find((m) => m.templateCode === 'SMS_02_APPOINTMENT');
      const oldOtp = firstSms!.messageBody.match(/OTP (\d{6})/)?.[1];
      expect(oldOtp).toBeDefined();

      // Regenerate OTP
      const regenRes = await request(app)
        .post(`/api/v1/asf/requests/${ticket.requestId}/regenerate-otp`)
        .set('Cookie', asfCookie)
        .set('X-CSRF-Token', asfCsrf)
        .send({ reason: 'Customer did not receive initial SMS' });

      expect(regenRes.status).toBe(200);
      expect(regenRes.body.success).toBe(true);

      // Verify SMS 6 was delivered by adapter
      const regenSms = mockSmsAdapter
        .getSentMessages()
        .find((m) => m.templateCode === 'SMS_06_OTP_REGEN');
      expect(regenSms).toBeDefined();
      const newOtp = regenSms!.messageBody.match(/OTP (\d{6})/)?.[1];
      expect(newOtp).toBeDefined();
      expect(newOtp).not.toBe(oldOtp);

      // Old OTP is superseded and rejected
      const oldOtpRes = await request(app)
        .post(`/api/v1/asf/requests/${ticket.requestId}/check-in`)
        .set('Cookie', engCookie)
        .set('X-CSRF-Token', engCsrf)
        .send({ otp: oldOtp! });

      expect(oldOtpRes.status).toBe(400);
      expect(oldOtpRes.body.error.code).toBe('INVALID_OTP');

      // New OTP works
      const newOtpRes = await request(app)
        .post(`/api/v1/asf/requests/${ticket.requestId}/check-in`)
        .set('Cookie', engCookie)
        .set('X-CSRF-Token', engCsrf)
        .send({ otp: newOtp! });

      expect(newOtpRes.status).toBe(200);
      expect(newOtpRes.body.data.serviceRequest.status).toBe('TECHNICIAN_CHECKED_IN');
      expect(newOtpRes.body.data.verified).toBe(true);
    });

    it('handles simulated gateway failure: updates outbox to FAILED without leaking secret', async () => {
      const ticket = await createTicket();
      const appointmentDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0];

      // Simulate gateway failure on next send
      mockSmsAdapter.setFailNext(true);

      const res = await request(app)
        .post(`/api/v1/asf/requests/${ticket.requestId}/dispatch`)
        .set('Cookie', asfCookie)
        .set('X-CSRF-Token', asfCsrf)
        .send({
          engineerId: engineerUserId,
          appointmentDate,
          appointmentSlot: '11:00 - 13:00',
          travelDistanceKm: 10,
          areaType: 'LOCAL',
        });

      expect(res.status).toBe(200);

      // Give worker brief moment to complete async failure handling
      await new Promise((r) => setTimeout(r, 100));

      // Inspect NOTIFICATIONS_OUTBOX in DB
      const conn = await getOracleConnection();
      try {
        const outboxRows = await conn.execute<any>(
          `SELECT NOTIFICATION_ID, STATUS, ERROR_MESSAGE, RETRY_COUNT, ENCRYPTED_PAYLOAD
           FROM NOTIFICATIONS_OUTBOX
           WHERE REQUEST_ID = :id AND TEMPLATE_CODE = 'SMS_02_APPOINTMENT'`,
          { id: ticket.requestId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const row = outboxRows.rows?.[0];
        expect(row).toBeDefined();
        expect(row.STATUS).toBe('FAILED');
        expect(row.RETRY_COUNT).toBeGreaterThanOrEqual(1);
        expect(row.ERROR_MESSAGE).toContain('SIMULATED_GATEWAY_TIMEOUT');
        // Encrypted payload is preserved for retry
        expect(row.ENCRYPTED_PAYLOAD).not.toBeNull();
      } finally {
        await conn.close();
      }
    });

    it('rejects tampered outbox payload during delivery without crashing', async () => {
      const ticket = await createTicket();

      // Enqueue a tampered encrypted notification record manually in outbox
      const encrypted = encryptNotificationPayload('Dear Customer, OTP is 123456');
      const tamperedAuthTag = 'abcdef0123456789abcdef0123456789'; // Bad tag

      const outboxItem = await notificationRepository.enqueueNotification({
        requestId: ticket.requestId,
        channel: 'SMS',
        recipient: customerPhone,
        templateCode: 'SMS_02_APPOINTMENT',
        messageBody: '[ENCRYPTED_OTP_PAYLOAD]',
        isEncrypted: 'Y',
        encryptedPayload: encrypted.encryptedPayload,
        encryptionIv: encrypted.iv,
        authTag: tamperedAuthTag,
        keyVersion: 'v1',
      });

      // Process notification through trusted worker
      await notificationService.processNotification(outboxItem);

      // Verify that outbox status was transitioned to FAILED safely
      const updated = await notificationRepository.findById(outboxItem.notificationId);
      expect(updated).not.toBeNull();
      expect(updated?.status).toBe('FAILED');
      expect(updated?.errorMessage).toBeDefined();
    });

    it('preserves SMS 1 registration acknowledgement behavior unencrypted', async () => {
      const ticket = await createTicket();

      const sms1Body = notificationService.buildSms1Message(ticket.jobNumber);
      const outboxItem = await notificationRepository.enqueueNotification({
        requestId: ticket.requestId,
        channel: 'SMS',
        recipient: customerPhone,
        templateCode: 'SMS_01_REGISTRATION',
        messageBody: sms1Body,
        isEncrypted: 'N',
      });

      await notificationService.processNotification(outboxItem);

      // Notification API returns plaintext SMS 1 body (non-sensitive acknowledgement)
      const list = await notificationRepository.listByRequestId(ticket.requestId);
      const sms1 = list.find((n) => n.templateCode === 'SMS_01_REGISTRATION');
      expect(sms1).toBeDefined();
      expect(sms1?.isEncrypted).toBe('N');
      expect(sms1?.messageBody).toContain(`registered your service request #${ticket.jobNumber}`);
    });
  });

  // =========================================================================
  // SECTION 4: Restrict SLA Evaluation Permissions (sla:manage)
  // =========================================================================
  describe('4. SLA Evaluation Permissions & Concurrency Idempotency', () => {
    it('rejects unauthenticated requests to POST /api/v1/asf/sla/evaluate with 401', async () => {
      const res = await request(app).post('/api/v1/asf/sla/evaluate');
      expect(res.status).toBe(401);
    });

    it('rejects read-only or operational ASF users without sla:manage permission with 403', async () => {
      // asfManager has role 'ASF' which has asf:read, calls:assign, calls:update, but NOT sla:manage
      const res = await request(app)
        .post('/api/v1/asf/sla/evaluate')
        .set('Cookie', asfCookie)
        .set('X-CSRF-Token', asfCsrf);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows Admin user with sla:manage permission to trigger SLA evaluation with 200', async () => {
      // Create an overdue ticket (registered 50 hours ago)
      const overdueTicket = await createTicket({ status: 'REGISTERED', slaOffsetHours: 50 });

      const res = await request(app)
        .post('/api/v1/asf/sla/evaluate')
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', adminCsrf);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.evaluatedCount).toBeGreaterThanOrEqual(1);

      // Verify the ticket was marked SLA_BREACHED_48H = 'Y'
      const updatedTicket = await serviceRequestRepository.findById(overdueTicket.requestId);
      expect(updatedTicket?.slaBreached48h).toBe('Y');

      // Verify lifecycle event SLA_48H_BREACHED was logged
      const events = await serviceRequestEventRepository.listEventsByRequestId(overdueTicket.requestId);
      const breachEvent = events.find((e) => e.eventType === 'SLA_48H_BREACHED');
      expect(breachEvent).toBeDefined();
      expect(breachEvent?.triggeredByRole).toBe('SYSTEM');
    });

    it('guarantees repeated SLA evaluation is idempotent and does not create duplicate breach events', async () => {
      // Trigger evaluation again immediately
      const res2 = await request(app)
        .post('/api/v1/asf/sla/evaluate')
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', adminCsrf);

      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);

      // The newBreachesCount for already-breached tickets must not re-breach
      // Verify breach event count for previously breached tickets has not duplicated
      const conn = await getOracleConnection();
      try {
        const countRes = await conn.execute<any>(
          `SELECT REQUEST_ID, COUNT(*) AS EVENT_COUNT 
           FROM SERVICE_REQUEST_EVENTS 
           WHERE EVENT_TYPE = 'SLA_48H_BREACHED'
           GROUP BY REQUEST_ID
           HAVING COUNT(*) > 1`
        );
        expect(countRes.rows?.length || 0).toBe(0);
      } finally {
        await conn.close();
      }
    });
  });

  // =========================================================================
  // SECTION 5: Legacy Remediation Verification
  // =========================================================================
  describe('5. Database Remediation & Legacy Integrity', () => {
    it('verifies that no unencrypted OTP-bearing notifications exist in NOTIFICATIONS_OUTBOX', async () => {
      const conn = await getOracleConnection();
      try {
        const res = await conn.execute<any>(
          `SELECT COUNT(*) AS INSECURE_COUNT
           FROM NOTIFICATIONS_OUTBOX
           WHERE TEMPLATE_CODE IN ('SMS_02_APPOINTMENT', 'SMS_06_OTP_REGEN')
             AND IS_ENCRYPTED = 'N'
             AND MESSAGE_BODY NOT LIKE '[REDACTED%'`
        );
        const insecureCount = res.rows?.[0]?.[0] || 0;
        expect(insecureCount).toBe(0);
      } finally {
        await conn.close();
      }
    });

    it('verifies sla:manage permission is seeded and assigned to ADMIN', async () => {
      const conn = await getOracleConnection();
      try {
        const permRes = await conn.execute<any>(
          `SELECT CODE, MODULE, DESCRIPTION 
           FROM PERMISSIONS 
           WHERE CODE = 'sla:manage'`,
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        expect(permRes.rows?.length).toBe(1);
        expect(permRes.rows![0].CODE).toBe('sla:manage');

        const roleRes = await conn.execute<any>(
          `SELECT r.CODE 
           FROM ROLE_PERMISSIONS rp
           JOIN ROLES r ON rp.ROLE_ID = r.ROLE_ID
           JOIN PERMISSIONS p ON rp.PERMISSION_ID = p.PERMISSION_ID
           WHERE p.CODE = 'sla:manage'`,
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const rolesWithPerm = roleRes.rows?.map((r: any) => r.CODE);
        expect(rolesWithPerm).toContain('ADMIN');
        expect(rolesWithPerm).not.toContain('ASF');
      } finally {
        await conn.close();
      }
    });
  });
});
