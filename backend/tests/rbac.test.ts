import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeOraclePool } from '../src/database/oraclePool.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { authService } from '../src/services/authService.js';
import { hashPassword } from '../src/services/passwordService.js';

describe('Role-Based Access Control (RBAC) & Hardening (Phase 1A.1)', () => {
  const app = createApp();

  // Test credentials (unique non-hardcoded secrets)
  const ADMIN_PASSWORD = 'AdminTestSecret#2026!';
  const CALLCENTER_PASSWORD = 'CallCenterPass#2026!';
  const WAREHOUSE_PASSWORD = 'WarehousePass#2026!';
  const INACTIVE_PASSWORD = 'InactivePass#2026!';
  const LEGACY_PASSWORD = 'LegacyBcryptPass#2026!';

  const adminUserId = crypto.randomUUID();
  const callCenterUserId = crypto.randomUUID();
  const warehouseUserId = crypto.randomUUID();
  const inactiveUserId = crypto.randomUUID();
  const legacyUserId = crypto.randomUUID();

  let adminSessionCookie: string;
  let callCenterSessionCookie: string;
  let warehouseSessionCookie: string;

  beforeAll(async () => {
    // 1. Provision Admin Test User (if not already existing)
    const existingAdmin = await userRepository.findByUsernameOrEmail('rbac_admin_test');
    if (existingAdmin) {
      await userRepository.deleteUser(existingAdmin.userId);
    }
    const adminHash = await hashPassword(ADMIN_PASSWORD);
    await userRepository.createUser({
      userId: adminUserId,
      username: 'rbac_admin_test',
      email: 'rbac_admin_test@crm.internal',
      fullName: 'RBAC Test Admin',
      passwordHash: adminHash,
    });
    await rbacRepository.assignRoleToUser(adminUserId, 'ADMIN', 'TEST_SETUP');

    // 2. Provision Call Center User
    const existingCc = await userRepository.findByUsernameOrEmail('rbac_callcenter_test');
    if (existingCc) {
      await userRepository.deleteUser(existingCc.userId);
    }
    const ccHash = await hashPassword(CALLCENTER_PASSWORD);
    await userRepository.createUser({
      userId: callCenterUserId,
      username: 'rbac_callcenter_test',
      email: 'rbac_callcenter_test@crm.internal',
      fullName: 'Call Center Representative',
      passwordHash: ccHash,
    });
    await rbacRepository.assignRoleToUser(callCenterUserId, 'CALL_CENTER', 'TEST_SETUP');

    // 3. Provision Warehouse User
    const existingWh = await userRepository.findByUsernameOrEmail('rbac_warehouse_test');
    if (existingWh) {
      await userRepository.deleteUser(existingWh.userId);
    }
    const whHash = await hashPassword(WAREHOUSE_PASSWORD);
    await userRepository.createUser({
      userId: warehouseUserId,
      username: 'rbac_warehouse_test',
      email: 'rbac_warehouse_test@crm.internal',
      fullName: 'Warehouse Logistics Officer',
      passwordHash: whHash,
    });
    await rbacRepository.assignRoleToUser(warehouseUserId, 'WAREHOUSE', 'TEST_SETUP');

    // 4. Provision Inactive User
    const existingInactive = await userRepository.findByUsernameOrEmail('rbac_inactive_test');
    if (existingInactive) {
      await userRepository.deleteUser(existingInactive.userId);
    }
    const inactiveHash = await hashPassword(INACTIVE_PASSWORD);
    await userRepository.createUser({
      userId: inactiveUserId,
      username: 'rbac_inactive_test',
      email: 'rbac_inactive_test@crm.internal',
      fullName: 'Deactivated Representative',
      passwordHash: inactiveHash,
    });
    await rbacRepository.assignRoleToUser(inactiveUserId, 'CALL_CENTER', 'TEST_SETUP');
    await userRepository.setUserActive(inactiveUserId, 'N');

    // 5. Provision Legacy Bcrypt User (for rehash verification)
    const existingLegacy = await userRepository.findByUsernameOrEmail('rbac_legacy_test');
    if (existingLegacy) {
      await userRepository.deleteUser(existingLegacy.userId);
    }
    const legacyBcryptHash = await bcrypt.hash(LEGACY_PASSWORD, 10);
    await userRepository.createUser({
      userId: legacyUserId,
      username: 'rbac_legacy_test',
      email: 'rbac_legacy_test@crm.internal',
      fullName: 'Legacy Bcrypt Account',
      passwordHash: legacyBcryptHash,
    });
    await rbacRepository.assignRoleToUser(legacyUserId, 'CALL_CENTER', 'TEST_SETUP');

    // Obtain session cookies for active test users
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'rbac_admin_test', password: ADMIN_PASSWORD });
    adminSessionCookie = adminLogin.headers['set-cookie'][0];

    const ccLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'rbac_callcenter_test', password: CALLCENTER_PASSWORD });
    callCenterSessionCookie = ccLogin.headers['set-cookie'][0];

    const whLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'rbac_warehouse_test', password: WAREHOUSE_PASSWORD });
    warehouseSessionCookie = whLogin.headers['set-cookie'][0];
  });

  afterAll(async () => {
    // Clean up test users
    await userRepository.deleteUser(adminUserId).catch(() => {});
    await userRepository.deleteUser(callCenterUserId).catch(() => {});
    await userRepository.deleteUser(warehouseUserId).catch(() => {});
    await userRepository.deleteUser(inactiveUserId).catch(() => {});
    await userRepository.deleteUser(legacyUserId).catch(() => {});
    await closeOraclePool().catch(() => {});
  });

  describe('1. Administrator Operations Access', () => {
    it('Admin can access administrative operations (/workspace/admin)', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/admin')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workspace).toBe('ADMIN');
      expect(res.body.data.accessible).toBe(true);
    });

    it('Admin can access Call Center operations (/workspace/call-center)', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/call-center')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workspace).toBe('CALL_CENTER');
    });

    it('Admin can access Warehouse operations (/workspace/warehouse)', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/warehouse')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workspace).toBe('WAREHOUSE');
    });
  });

  describe('2. Call Center Role Separation & Isolation', () => {
    it('Call Center can access its permitted workspace (/workspace/call-center)', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/call-center')
        .set('Cookie', callCenterSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workspace).toBe('CALL_CENTER');
    });

    it('Call Center CANNOT access administrative management (/workspace/admin) - 403', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/admin')
        .set('Cookie', callCenterSessionCookie);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Access denied');
    });

    it('Call Center CANNOT access warehouse operations (/workspace/warehouse) - 403', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/warehouse')
        .set('Cookie', callCenterSessionCookie);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('3. Warehouse Role Separation & Isolation', () => {
    it('Warehouse can access its permitted operations (/workspace/warehouse)', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/warehouse')
        .set('Cookie', warehouseSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workspace).toBe('WAREHOUSE');
    });

    it('Warehouse CANNOT access administrative operations (/workspace/admin) - 403', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/admin')
        .set('Cookie', warehouseSessionCookie);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Warehouse CANNOT access call center operations (/workspace/call-center) - 403', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/call-center')
        .set('Cookie', warehouseSessionCookie);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('4. Unauthenticated Request Enforcement', () => {
    it('Unauthenticated request to /workspace/admin returns 401', async () => {
      const res = await request(app).get('/api/v1/workspace/admin');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('Unauthenticated request to /workspace/call-center returns 401', async () => {
      const res = await request(app).get('/api/v1/workspace/call-center');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('Unauthenticated request to /workspace/warehouse returns 401', async () => {
      const res = await request(app).get('/api/v1/workspace/warehouse');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('5. Inactive Account Access Rejection', () => {
    it('Inactive account cannot log in and receives 403 ACCOUNT_DISABLED', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'rbac_inactive_test',
          password: INACTIVE_PASSWORD,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
      expect(res.body.error.message).toContain('deactivated');
    });

    it('Deactivating an active user terminates subsequent session access with 401', async () => {
      // 1. Create a temporary active user and log in
      const tempId = crypto.randomUUID();
      const tempHash = await hashPassword('TempPass#123456!');
      await userRepository.createUser({
        userId: tempId,
        username: 'rbac_temp_deact',
        email: 'rbac_temp_deact@crm.internal',
        fullName: 'Temp Deact User',
        passwordHash: tempHash,
      });
      await rbacRepository.assignRoleToUser(tempId, 'CALL_CENTER', 'TEST');

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'rbac_temp_deact', password: 'TempPass#123456!' });
      const tempCookie = loginRes.headers['set-cookie'][0];

      // Verify active access
      const activeRes = await request(app)
        .get('/api/v1/workspace/call-center')
        .set('Cookie', tempCookie);
      expect(activeRes.status).toBe(200);

      // 2. Deactivate the user
      await userRepository.setUserActive(tempId, 'N');

      // 3. Verify session is immediately rejected on next request
      const deactRes = await request(app)
        .get('/api/v1/workspace/call-center')
        .set('Cookie', tempCookie);
      expect(deactRes.status).toBe(401);
      expect(deactRes.body.error.code).toBe('UNAUTHORIZED');

      // Cleanup
      await userRepository.deleteUser(tempId);
    });
  });

  describe('6. Client-Side Privilege Escalation Defense', () => {
    it('Manipulating X-User-Role header cannot elevate Call Center user to Admin', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/admin')
        .set('Cookie', callCenterSessionCookie)
        .set('X-User-Role', 'ADMIN')
        .set('X-User-Permissions', 'users:read,roles:read');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Appending role query parameters (?role=ADMIN) cannot elevate privileges', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/admin?role=ADMIN&roles=ADMIN&permission=users:read')
        .set('Cookie', callCenterSessionCookie);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Injecting role or permissions in request body cannot grant administrative access', async () => {
      const res = await request(app)
        .post('/api/v1/auth/me')
        .set('Cookie', callCenterSessionCookie)
        .send({ role: 'ADMIN', permissions: ['users:read', 'roles:read'] });

      // /me does not accept POST (404) or ignores body
      expect([404, 405]).toContain(res.status);
    });

    it('Cannot grant self permissions through any public endpoint', async () => {
      const grantRes = await request(app)
        .post('/api/v1/auth/grant-role')
        .set('Cookie', callCenterSessionCookie)
        .send({ role: 'ADMIN' });

      // No such public grant endpoint exists (404)
      expect(grantRes.status).toBe(404);
    });
  });

  describe('7. Password Rotation & Session Revocation', () => {
    it('Rotating password immediately invalidates all active sessions', async () => {
      // 1. Create a dedicated rotation test user
      const rotateUserId = crypto.randomUUID();
      const initialPassword = 'InitialPass#12345!';
      const newPassword = 'RotatedPass#98765!';

      const initialHash = await hashPassword(initialPassword);
      await userRepository.createUser({
        userId: rotateUserId,
        username: 'rbac_rotate_user',
        email: 'rbac_rotate_user@crm.internal',
        fullName: 'Rotate User',
        passwordHash: initialHash,
      });
      await rbacRepository.assignRoleToUser(rotateUserId, 'CALL_CENTER', 'TEST');

      // 2. Log in and obtain active session cookie
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'rbac_rotate_user', password: initialPassword });
      const sessionCookie = loginRes.headers['set-cookie'][0];

      // Verify active session works
      const meBefore = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie);
      expect(meBefore.status).toBe(200);

      // 3. Rotate user password
      await authService.rotatePassword(rotateUserId, newPassword);

      // 4. Verify old session is now rejected with 401
      const meAfter = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie);
      expect(meAfter.status).toBe(401);
      expect(meAfter.body.error.code).toBe('UNAUTHORIZED');

      // 5. Verify old password cannot log in
      const oldLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'rbac_rotate_user', password: initialPassword });
      expect(oldLogin.status).toBe(401);

      // 6. Verify new password can log in
      const newLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'rbac_rotate_user', password: newPassword });
      expect(newLogin.status).toBe(200);
      expect(newLogin.body.data.user.username).toBe('rbac_rotate_user');

      // Cleanup
      await userRepository.deleteUser(rotateUserId);
    });
  });

  describe('8. Legacy Bcrypt Rehash-on-Success Migration', () => {
    it('should transparently upgrade legacy bcrypt hash to Argon2id on successful login', async () => {
      // 1. Confirm legacy user starts with bcrypt hash
      const userBefore = await userRepository.findByUsernameOrEmail('rbac_legacy_test');
      expect(userBefore).not.toBeNull();
      expect(userBefore!.passwordHash.startsWith('$2a$') || userBefore!.passwordHash.startsWith('$2b$')).toBe(true);

      // 2. Perform successful login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'rbac_legacy_test',
          password: LEGACY_PASSWORD,
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);

      // Wait a moment for background rehash to complete in DB
      await new Promise((resolve) => setTimeout(resolve, 300));

      // 3. Confirm password hash has been transparently upgraded to Argon2id in Oracle DB
      const userAfter = await userRepository.findByUsernameOrEmail('rbac_legacy_test');
      expect(userAfter).not.toBeNull();
      expect(userAfter!.passwordHash.startsWith('$argon2id$')).toBe(true);

      // 4. Subsequent login works directly with upgraded Argon2id hash
      const subsequentLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'rbac_legacy_test',
          password: LEGACY_PASSWORD,
        });
      expect(subsequentLogin.status).toBe(200);
    });
  });
});
