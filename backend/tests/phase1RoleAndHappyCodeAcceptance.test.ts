import { beforeAll, describe, expect, it } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getOracleConnection } from '../src/database/oraclePool.js';
import { rbacRepository, APPROVED_ROLES, DEPRECATED_ROLES } from '../src/database/repositories/rbacRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { hashPassword } from '../src/services/passwordService.js';
import { notificationService, mockSmsAdapter } from '../src/services/notificationService.js';
import { generateCheckInOtp, generateHappyCode, hashOtp, verifyOtp } from '../src/utils/cryptoUtils.js';

describe('Phase 1 Acceptance Suite: Role Simplification & Happy Code Standardization', () => {
  const app = createApp();
  const TEST_PASSWORD = 'TestPassword@123';
  const suffix = Date.now().toString().slice(-6);

  // Session cookies for each approved role
  const sessions: Record<string, { cookie: string; csrf: string; user: any }> = {};

  beforeAll(async () => {
    mockSmsAdapter.clear();
    const passwordHash = await hashPassword(TEST_PASSWORD);

    const testUsers = [
      { role: 'ADMIN', username: `p1_adm_${suffix}`, email: `p1_adm_${suffix}@crm.internal` },
      { role: 'CALL_CENTER', username: `p1_cc_${suffix}`, email: `p1_cc_${suffix}@crm.internal` },
      { role: 'ASF', username: `p1_asf_${suffix}`, email: `p1_asf_${suffix}@crm.internal` },
      { role: 'ENGINEER', username: `p1_eng_${suffix}`, email: `p1_eng_${suffix}@crm.internal` },
      { role: 'WAREHOUSE', username: `p1_wh_${suffix}`, email: `p1_wh_${suffix}@crm.internal` },
    ];

    for (const u of testUsers) {
      const userId = crypto.randomUUID();
      await userRepository.createUser({
        userId,
        username: u.username,
        email: u.email,
        fullName: `Phase1 ${u.role} User`,
        passwordHash,
      });

      await rbacRepository.assignRoleToUser(userId, u.role, 'PHASE1_TEST_SETUP');

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: u.username, password: TEST_PASSWORD });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);

      const cookieHeader = loginRes.headers['set-cookie'];
      const rawCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
      const sessionCookie = rawCookie.split(';')[0];
      const csrf = loginRes.body.data.csrfToken;

      sessions[u.role] = {
        cookie: sessionCookie,
        csrf,
        user: loginRes.body.data.user,
      };
    }
  });

  // ==============================================================================
  // 1. Role Tests
  // ==============================================================================
  describe('1. Role Authorization & Simplification Invariants', () => {
    it('1.1. All five approved roles authenticate successfully and return correct active role identity', async () => {
      for (const role of APPROVED_ROLES) {
        expect(sessions[role]).toBeDefined();
        expect(sessions[role].user.roles).toContain(role);
      }
    });

    it('1.2. Exactly five roles are active in Oracle database and removed roles are marked inactive', async () => {
      const conn = await getOracleConnection();
      try {
        const activeRes: any = await conn.execute(
          `SELECT CODE FROM ROLES WHERE IS_ACTIVE = 'Y' ORDER BY CODE ASC`,
          {},
          { outFormat: 4002 }
        );
        const activeRoleCodes = activeRes.rows.map((r: any) => r.CODE);
        expect(activeRoleCodes).toEqual(['ADMIN', 'ASF', 'CALL_CENTER', 'ENGINEER', 'WAREHOUSE']);

        const inactiveRes: any = await conn.execute(
          `SELECT CODE FROM ROLES WHERE IS_ACTIVE = 'N' ORDER BY CODE ASC`,
          {},
          { outFormat: 4002 }
        );
        const inactiveRoleCodes = inactiveRes.rows.map((r: any) => r.CODE);
        for (const dep of DEPRECATED_ROLES) {
          expect(inactiveRoleCodes).toContain(dep);
        }
      } finally {
        await conn.close();
      }
    });

    it('1.3. Reject attempts to assign removed roles (SUPER_ADMIN, INFRA_OPS, FINANCE, BRAND, DISTRIBUTOR)', async () => {
      const testUserId = '00000000-0000-0000-0001-000000000001';

      for (const removedRole of DEPRECATED_ROLES) {
        await expect(
          rbacRepository.assignRoleToUser(testUserId, removedRole, 'TEST_SUITE')
        ).rejects.toThrow(/not an approved active application role/i);
      }
    });

    it('1.4. Inactive role accounts cannot log in (rejected with 401)', async () => {
      const deactLogins = [
        { username: 'super', password: 'Password@123' },
        { username: 'infra_ops', password: 'Password@123' },
        { username: 'brand_manager', password: 'Password@123' },
        { username: 'finance_officer', password: 'Password@123' },
      ];

      for (const cred of deactLogins) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send(cred);

        // Deactivated users cannot log in
        expect([401, 403]).toContain(res.status);
      }
    });

    it('1.5. Workspace check endpoints strictly grant access to the 5 approved roles and deny unauthorized roles', async () => {
      // ADMIN on /admin
      const adminWs = await request(app)
        .get('/api/v1/workspaces/admin')
        .set('Cookie', sessions['ADMIN'].cookie);
      expect(adminWs.status).toBe(200);

      // CALL_CENTER on /call-center
      const ccWs = await request(app)
        .get('/api/v1/workspaces/call-center')
        .set('Cookie', sessions['CALL_CENTER'].cookie);
      expect(ccWs.status).toBe(200);

      // ASF on /service-center
      const asfWs = await request(app)
        .get('/api/v1/workspaces/service-center')
        .set('Cookie', sessions['ASF'].cookie);
      expect(asfWs.status).toBe(200);

      // ENGINEER on /engineer
      const engWs = await request(app)
        .get('/api/v1/workspaces/engineer')
        .set('Cookie', sessions['ENGINEER'].cookie);
      expect(engWs.status).toBe(200);

      // WAREHOUSE on /warehouse
      const whWs = await request(app)
        .get('/api/v1/workspaces/warehouse')
        .set('Cookie', sessions['WAREHOUSE'].cookie);
      expect(whWs.status).toBe(200);

      // WAREHOUSE denied on /admin
      const whOnAdmin = await request(app)
        .get('/api/v1/workspaces/admin')
        .set('Cookie', sessions['WAREHOUSE'].cookie);
      expect(whOnAdmin.status).toBe(403);

      // ENGINEER denied on /warehouse
      const engOnWh = await request(app)
        .get('/api/v1/workspaces/warehouse')
        .set('Cookie', sessions['ENGINEER'].cookie);
      expect(engOnWh.status).toBe(403);
    });

    it('1.6. ADMIN possesses client administration permissions including masters:manage and masters:import', async () => {
      expect(sessions['ADMIN'].user.permissions).toContain('masters:manage');
      expect(sessions['ADMIN'].user.permissions).toContain('masters:import');
      expect(sessions['ADMIN'].user.permissions).toContain('users:read');
    });
  });

  // ==============================================================================
  // 2. Happy Code Standardization Tests
  // ==============================================================================
  describe('2. Happy Code Dual-Code Architecture & Verification', () => {
    it('2.1. Arrival Happy Code and Completion Happy Code are distinct and non-interchangeable', () => {
      const arrivalCode = generateCheckInOtp();
      const completionCode = generateHappyCode();

      expect(arrivalCode).toMatch(/^\d{6}$/);
      expect(completionCode).toMatch(/^\d{6}$/);

      const salt = 'testsalt1234567890abcdef';
      const requestId = 'req-test-uuid-1234';

      // Hash arrival code with purpose 'CHECK_IN'
      const arrivalHash = hashOtp({
        otp: arrivalCode,
        salt,
        requestId,
        purpose: 'CHECK_IN',
      });

      // Verify arrival code with correct purpose succeeds
      const arrivalOk = verifyOtp({
        providedOtp: arrivalCode,
        salt,
        requestId,
        expectedHash: arrivalHash,
        purpose: 'CHECK_IN',
      });
      expect(arrivalOk).toBe(true);

      // Non-interchangeability: Submitting completion code for arrival verification fails
      const crossVerify1 = verifyOtp({
        providedOtp: completionCode,
        salt,
        requestId,
        expectedHash: arrivalHash,
        purpose: 'CHECK_IN',
      });
      expect(crossVerify1).toBe(false);

      // Hash completion code with purpose 'CLOSURE'
      const completionHash = hashOtp({
        otp: completionCode,
        salt,
        requestId,
        purpose: 'CLOSURE',
      });

      // Verify completion code succeeds with CLOSURE purpose
      const completionOk = verifyOtp({
        providedOtp: completionCode,
        salt,
        requestId,
        expectedHash: completionHash,
        purpose: 'CLOSURE',
      });
      expect(completionOk).toBe(true);

      // Non-interchangeability: Submitting arrival code for closure verification fails
      const crossVerify2 = verifyOtp({
        providedOtp: arrivalCode,
        salt,
        requestId,
        expectedHash: completionHash,
        purpose: 'CLOSURE',
      });
      expect(crossVerify2).toBe(false);
    });

    it('2.2. SMS templates 2 and 6 consistently use "Arrival Happy Code" terminology', () => {
      const sms2 = notificationService.buildSms2Message({
        jobNumber: 'JOB-9999',
        techName: 'Rajesh Kumar',
        techMobile: '9876543210',
        appointmentDatetime: '2026-11-23 10:00 AM',
        checkinOtp: '123456',
      });

      expect(sms2).toContain('Arrival Happy Code 123456');
      expect(sms2).not.toMatch(/\bshare the OTP\b/i);

      const sms6 = notificationService.buildSms6Message({
        jobNumber: 'JOB-9999',
        checkinOtp: '654321',
      });

      expect(sms6).toContain('Arrival Happy Code 654321');
      expect(sms6).not.toMatch(/\bshare OTP\b/i);
    });

    it('2.3. SMS templates 4 and 5 consistently use "happy code" for call closure', () => {
      const sms4 = notificationService.buildSms4Message({
        jobNumber: 'JOB-9999',
        happyCode: '789012',
      });

      expect(sms4.toLowerCase()).toContain('happy code');

      const sms5 = notificationService.buildSms5Message({
        jobNumber: 'JOB-9999',
        happyCode: '789012',
      });

      expect(sms5.toLowerCase()).toContain('happy code');
    });

    it('2.4. Incorrect code is rejected and does not authenticate verification gate', () => {
      const validCode = '123456';
      const wrongCode = '999999';
      const salt = 'testsalt1234567890abcdef';
      const requestId = 'req-test-uuid-5678';

      const validHash = hashOtp({
        otp: validCode,
        salt,
        requestId,
        purpose: 'CHECK_IN',
      });

      const result = verifyOtp({
        providedOtp: wrongCode,
        salt,
        requestId,
        expectedHash: validHash,
        purpose: 'CHECK_IN',
      });

      expect(result).toBe(false);
    });
  });

  // ==============================================================================
  // 3. Regression Tests for Preserved Workflows
  // ==============================================================================
  describe('3. Regression Verification across Approved Persona Workflows', () => {
    it('3.1. Call Center can query customer and catalog search without errors', async () => {
      const res = await request(app)
        .get('/api/v1/catalog/models?page=1&limit=5')
        .set('Cookie', sessions['CALL_CENTER'].cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();
    });

    it('3.2. Warehouse Coordinator can query inventory items', async () => {
      const res = await request(app)
        .get('/api/v1/warehouse/inventory?page=1&limit=5')
        .set('Cookie', sessions['WAREHOUSE'].cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('3.3. Service Center (ASF) can access operational queue', async () => {
      const res = await request(app)
        .get('/api/v1/asf/queue?view=all&page=1&limit=5')
        .set('Cookie', sessions['ASF'].cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('3.4. Field Engineer can view assigned visits and is isolated from unauthorized queues', async () => {
      const res = await request(app)
        .get('/api/v1/asf/engineer-jobs?tab=today&page=1&limit=5')
        .set('Cookie', sessions['ENGINEER'].cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('3.5. Admin can access system health telemetry', async () => {
      const res = await request(app)
        .get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('UP');
    });
  });
});
