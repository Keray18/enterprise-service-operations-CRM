import crypto from 'crypto';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { hashPassword } from '../src/services/passwordService.js';

describe('Authoritative Backend Authentication Gating & Role Isolation (P0 Fix)', () => {
  const app = createApp();

  const ADMIN_PASS = 'TestAdminPass#2026!';
  const CC_PASS = 'CallCenterPass#2026!';
  const WH_PASS = 'WarehousePass#2026!';

  const adminUserId = crypto.randomUUID();
  const callCenterUserId = crypto.randomUUID();
  const warehouseUserId = crypto.randomUUID();

  const uniqueSuffix = Date.now().toString(36);
  const adminUsername = `gating_admin_${uniqueSuffix}`;
  const ccUsername = `gating_cc_${uniqueSuffix}`;
  const whUsername = `gating_wh_${uniqueSuffix}`;

  let adminSessionCookie: string;
  let adminCsrfToken: string;
  let ccSessionCookie: string;
  let ccCsrfToken: string;
  let whSessionCookie: string;

  beforeAll(async () => {
    // 1. Provision Gating Admin
    const adminHash = await hashPassword(ADMIN_PASS);
    await userRepository.createUser({
      userId: adminUserId,
      username: adminUsername,
      email: `${adminUsername}@crm.internal`,
      fullName: 'Gating Admin Lead',
      passwordHash: adminHash,
    });
    await rbacRepository.assignRoleToUser(adminUserId, 'ADMIN', 'TEST_SETUP');

    // 2. Provision Gating Call Center User
    const ccHash = await hashPassword(CC_PASS);
    await userRepository.createUser({
      userId: callCenterUserId,
      username: ccUsername,
      email: `${ccUsername}@crm.internal`,
      fullName: 'Gating Call Center Agent',
      passwordHash: ccHash,
    });
    await rbacRepository.assignRoleToUser(callCenterUserId, 'CALL_CENTER', 'TEST_SETUP');

    // 3. Provision Gating Warehouse User
    const whHash = await hashPassword(WH_PASS);
    await userRepository.createUser({
      userId: warehouseUserId,
      username: whUsername,
      email: `${whUsername}@crm.internal`,
      fullName: 'Gating Warehouse Logistics',
      passwordHash: whHash,
    });
    await rbacRepository.assignRoleToUser(warehouseUserId, 'WAREHOUSE', 'TEST_SETUP');

    // Perform logins to obtain active session cookies
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: adminUsername, password: ADMIN_PASS });
    adminSessionCookie = adminLogin.headers['set-cookie'][0];
    adminCsrfToken = adminLogin.body.data.csrfToken;

    const ccLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: ccUsername, password: CC_PASS });
    ccSessionCookie = ccLogin.headers['set-cookie'][0];
    ccCsrfToken = ccLogin.body.data.csrfToken;

    const whLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: whUsername, password: WH_PASS });
    whSessionCookie = whLogin.headers['set-cookie'][0];
  });

  describe('1. Unauthenticated API Boundary Gating (Zero-Trust Backend)', () => {
    it('should reject unauthenticated access to /api/v1/call-center/requests/recent with 401', async () => {
      const res = await request(app).get('/api/v1/call-center/requests/recent');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject unauthenticated access to /api/v1/workspace/admin with 401', async () => {
      const res = await request(app).get('/api/v1/workspace/admin');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject unauthenticated access to /api/v1/workspace/call-center with 401', async () => {
      const res = await request(app).get('/api/v1/workspace/call-center');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject unauthenticated access to /api/v1/workspace/warehouse with 401', async () => {
      const res = await request(app).get('/api/v1/workspace/warehouse');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject forged/stale session cookies on protected endpoints with 401', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', 'crm_session=forged_token_000000000000000000000000');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('2. Role-Based Workspace Authorization & Segregation', () => {
    it('Call Center user CAN access /workspace/call-center (200)', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/call-center')
        .set('Cookie', ccSessionCookie);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workspace).toBe('CALL_CENTER');
    });

    it('Call Center user CANNOT access /workspace/admin (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/admin')
        .set('Cookie', ccSessionCookie);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Call Center user CANNOT access /workspace/warehouse (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/warehouse')
        .set('Cookie', ccSessionCookie);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Warehouse user CAN access /workspace/warehouse (200)', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/warehouse')
        .set('Cookie', whSessionCookie);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workspace).toBe('WAREHOUSE');
    });

    it('Warehouse user CANNOT access /workspace/admin (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/admin')
        .set('Cookie', whSessionCookie);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Warehouse user CANNOT access /workspace/call-center (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/call-center')
        .set('Cookie', whSessionCookie);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Admin user CAN access /workspace/admin (200)', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/admin')
        .set('Cookie', adminSessionCookie);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workspace).toBe('ADMIN');
    });

    it('Admin user CAN access /workspace/call-center (200)', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/call-center')
        .set('Cookie', adminSessionCookie);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('Admin user CAN access /workspace/warehouse (200)', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/warehouse')
        .set('Cookie', adminSessionCookie);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('3. Authoritative /api/v1/auth/me Identity Contract', () => {
    it('returns exact database identity and permissions for authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', ccSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.user.username).toBe(ccUsername);
      expect(res.body.data.user.fullName).toBe('Gating Call Center Agent');
      expect(res.body.data.user.roles).toContain('CALL_CENTER');
      expect(res.body.data.user.permissions).toContain('calls:read');
      expect(res.body.data.user.permissions).toContain('calls:create');
      // Must not possess admin permissions
      expect(res.body.data.user.permissions).not.toContain('users:create');
      expect(res.body.data.csrfToken).toBeDefined();
    });
  });

  describe('4. Session Revocation & Complete Server-Side Logout', () => {
    it('should revoke session in Oracle DB upon logout and reject subsequent calls', async () => {
      // 1. Perform logout with CSRF
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // 2. Subsequent call with same cookie MUST be rejected with 401
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', ccSessionCookie);

      expect(meRes.status).toBe(401);
      expect(meRes.body.success).toBe(false);
      expect(meRes.body.error.code).toBe('UNAUTHORIZED');

      // 3. Subsequent call to workspace route with revoked session must be 401
      const wsRes = await request(app)
        .get('/api/v1/workspace/call-center')
        .set('Cookie', ccSessionCookie);

      expect(wsRes.status).toBe(401);
    });
  });
});
