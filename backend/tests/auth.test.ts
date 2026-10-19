import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { bootstrapAdmin } from '../src/scripts/bootstrapAdmin.js';
import { rotateAdminPassword } from '../src/scripts/rotateAdminPassword.js';

describe('Enterprise Authentication & RBAC (Phase 1A / 1A.1)', () => {
  const app = createApp();
  const TEST_ADMIN_PASSWORD = 'TestAdminPass#2026!';
  const COMPROMISED_LEGACY_PASSWORD = 'AdminPassword123!';

  beforeAll(async () => {
    // Ensure administrator exists and is rotated to the secure test secret
    await bootstrapAdmin({ password: TEST_ADMIN_PASSWORD });
    await rotateAdminPassword({ username: 'admin', newPassword: TEST_ADMIN_PASSWORD });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should successfully log in with valid credentials and set HttpOnly session cookie', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'admin',
          password: TEST_ADMIN_PASSWORD,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.username).toBe('admin');
      expect(res.body.data.user.roles).toContain('ADMIN');
      expect(res.body.data.user.permissions).toContain('users:read');
      expect(res.body.data.csrfToken).toBeDefined();

      // Check cookies
      const setCookieHeaders = res.headers['set-cookie'];
      expect(setCookieHeaders).toBeDefined();
      const cookiesStr = Array.isArray(setCookieHeaders) ? setCookieHeaders.join(';') : setCookieHeaders;
      expect(cookiesStr).toContain('crm_session=');
      expect(cookiesStr).toContain('crm_csrf=');
      expect(cookiesStr.toLowerCase()).toContain('httponly');
    });

    it('should reject previously disclosed compromised administrator credential with 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'admin',
          password: COMPROMISED_LEGACY_PASSWORD,
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Invalid username or password');
    });

    it('should reject invalid password with generic 401 error', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'admin',
          password: 'WrongPassword999!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Invalid username or password');
    });

    it('should reject non-existent user with identical generic 401 error (no user enumeration)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'unknown_ghost_user_9999',
          password: 'SomePassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Invalid username or password');
    });

    it('should return 400 on missing or invalid schema fields', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/auth/me & Session Restoration', () => {
    it('should restore session and return current user with valid session cookie', async () => {
      // 1. Log in
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'admin',
          password: TEST_ADMIN_PASSWORD,
        });

      const sessionCookie = loginRes.headers['set-cookie'][0];

      // 2. Query /me
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.user.username).toBe('admin');
      expect(meRes.body.data.user.roles).toContain('ADMIN');
      expect(meRes.body.data.csrfToken).toBeDefined();
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject invalid or forged session cookie with 401', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', 'crm_session=forged_invalid_token_1234567890abcdef');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('CSRF Protection & POST /api/v1/auth/logout', () => {
    it('should reject state-changing request if CSRF token is missing', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'admin',
          password: TEST_ADMIN_PASSWORD,
        });

      const sessionCookie = loginRes.headers['set-cookie'][0];

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', sessionCookie); // Missing x-csrf-token

      expect(logoutRes.status).toBe(403);
      expect(logoutRes.body.success).toBe(false);
      expect(logoutRes.body.error.code).toBe('CSRF_TOKEN_INVALID');
    });

    it('should reject state-changing request if CSRF token is mismatched', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'admin',
          password: TEST_ADMIN_PASSWORD,
        });

      const sessionCookie = loginRes.headers['set-cookie'][0];

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', sessionCookie)
        .set('x-csrf-token', 'wrong_csrf_token_value');

      expect(logoutRes.status).toBe(403);
      expect(logoutRes.body.success).toBe(false);
      expect(logoutRes.body.error.code).toBe('CSRF_TOKEN_INVALID');
    });

    it('should successfully log out and invalidate session when valid CSRF token is supplied', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'admin',
          password: TEST_ADMIN_PASSWORD,
        });

      const sessionCookie = loginRes.headers['set-cookie'][0];
      const csrfToken = loginRes.body.data.csrfToken;

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', sessionCookie)
        .set('x-csrf-token', csrfToken);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // Verify that session is revoked and cannot be reused
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie);

      expect(meRes.status).toBe(401);
      expect(meRes.body.success).toBe(false);
    });
  });

  describe('RBAC & Workspace Permissions', () => {
    it('should allow Admin access to /api/v1/workspace/admin', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'admin',
          password: TEST_ADMIN_PASSWORD,
        });

      const sessionCookie = loginRes.headers['set-cookie'][0];

      const res = await request(app)
        .get('/api/v1/workspace/admin')
        .set('Cookie', sessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workspace).toBe('ADMIN');
    });

    it('should deny unauthenticated access to protected workspace routes with 401', async () => {
      const res = await request(app).get('/api/v1/workspace/admin');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
