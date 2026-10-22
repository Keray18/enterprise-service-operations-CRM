import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware, verifySessionWithBackend } from '../src/middleware';

describe('Next.js Route Protection Middleware & Server-Boundary Gating', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const createMockRequest = (url: string, sessionCookie?: string): NextRequest => {
    const headers = new Headers();
    if (sessionCookie) {
      headers.set('cookie', `crm_session=${sessionCookie}`);
    }
    return new NextRequest(new URL(url, 'http://localhost:3000'), {
      headers,
    });
  };

  const mockBackendSession = (status: number, user?: any) => {
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      if (status === 200 && user) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { user },
          }),
        };
      }
      return {
        ok: false,
        status,
        json: async () => ({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Session expired or invalid' },
        }),
      };
    });
  };

  describe('1. Missing Session Cookie', () => {
    it('redirects unauthenticated request to / immediately to /login', async () => {
      const req = createMockRequest('/');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/login');
    });

    it('redirects unauthenticated request to /call-center to /login with sanitized return URL', async () => {
      const req = createMockRequest('/call-center');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(
        'http://localhost:3000/login?redirect=%2Fcall-center'
      );
    });

    it('redirects unauthenticated request to /admin to /login with redirect param', async () => {
      const req = createMockRequest('/admin');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(
        'http://localhost:3000/login?redirect=%2Fadmin'
      );
    });

    it('redirects unauthenticated request to /warehouse to /login with redirect param', async () => {
      const req = createMockRequest('/warehouse');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(
        'http://localhost:3000/login?redirect=%2Fwarehouse'
      );
    });

    it('redirects unauthenticated request to /asf/jobs/123 to /login with preserved params', async () => {
      const req = createMockRequest('/asf/jobs/123?tab=diagnosis');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(
        'http://localhost:3000/login?redirect=%2Fasf%2Fjobs%2F123%3Ftab%3Ddiagnosis'
      );
    });

    it('allows access to public /login without redirection loop', async () => {
      const req = createMockRequest('/login');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('allows access to static assets without redirection', async () => {
      const req = createMockRequest('/_next/static/chunks/main.js');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  });

  describe('2. Malformed Session Cookie', () => {
    it('rejects cookie with invalid characters and redirects to /login?sessionExpired=true', async () => {
      // Cookie with injection characters or spaces
      const req = createMockRequest('/call-center', 'invalid token with spaces!');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(
        'http://localhost:3000/login?sessionExpired=true&redirect=%2Fcall-center'
      );
      // Confirms session cookie deletion header was attached
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toBeDefined();
    });

    it('rejects truncated / overly short session token', async () => {
      const req = createMockRequest('/admin', 'short');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(
        'http://localhost:3000/login?sessionExpired=true&redirect=%2Fadmin'
      );
    });
  });

  describe('3. Nonexistent / Forged Session Cookie', () => {
    it('contacts backend /api/v1/auth/me, receives 401, and redirects with cookie deletion', async () => {
      mockBackendSession(401);

      const req = createMockRequest('/call-center', 'nonexistent_session_token_1234567890');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(
        'http://localhost:3000/login?sessionExpired=true&redirect=%2Fcall-center'
      );
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('redirects / request to /login?sessionExpired=true when session does not exist on backend', async () => {
      mockBackendSession(401);

      const req = createMockRequest('/', 'forged_session_token_abcdef123456');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(
        'http://localhost:3000/login?sessionExpired=true'
      );
    });
  });

  describe('4. Revoked Session Cookie (Post-Logout / Admin Invalidation)', () => {
    it('redirects to /login?sessionExpired=true when session was revoked server-side', async () => {
      mockBackendSession(401); // Server returns 401 for revoked sessions

      const req = createMockRequest('/warehouse', 'revoked_session_token_9999999999');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(
        'http://localhost:3000/login?sessionExpired=true&redirect=%2Fwarehouse'
      );
    });

    it('strips revoked session cookie when visiting /login directly', async () => {
      mockBackendSession(401);

      const req = createMockRequest('/login', 'revoked_session_token_9999999999');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toBeDefined();
    });
  });

  describe('5. Valid Authenticated Session', () => {
    const mockCallCenterUser = {
      userId: 'bcf1f601-e035-44d6-86b7-8fa5b14a5d8d',
      username: 'callcenter',
      fullName: 'Frontline Call Handler',
      roles: ['CALL_CENTER'],
      permissions: ['calls:read', 'calls:create'],
    };

    const mockAdminUser = {
      userId: 'a0000000-0000-0000-0000-000000000001',
      username: 'admin',
      fullName: 'System Operations Lead',
      roles: ['ADMIN'],
      permissions: ['users:read', 'masters:read'],
    };

    it('Case B.1: redirects valid session at / to their authorized landing workspace', async () => {
      mockBackendSession(200, mockCallCenterUser);

      const req = createMockRequest('/', 'valid_callcenter_session_12345');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/call-center');
    });

    it('Case B.2: redirects valid admin session at / to /admin', async () => {
      mockBackendSession(200, mockAdminUser);

      const req = createMockRequest('/', 'valid_admin_session_12345');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/admin');
    });

    it('Case B.3: allows valid session to access /call-center workspace (200 pass-through)', async () => {
      mockBackendSession(200, mockCallCenterUser);

      const req = createMockRequest('/call-center', 'valid_callcenter_session_12345');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('Case B.4: redirects authenticated user visiting /login away to their authorized workspace', async () => {
      mockBackendSession(200, mockAdminUser);

      const req = createMockRequest('/login', 'valid_admin_session_12345');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/admin');
    });
  });

  describe('6. Direct URL Access to Other Roles\' Workspaces (Server-Boundary Authorization)', () => {
    const mockCallCenterUser = {
      userId: 'bcf1f601-e035-44d6-86b7-8fa5b14a5d8d',
      username: 'callcenter',
      fullName: 'Frontline Call Handler',
      roles: ['CALL_CENTER'],
      permissions: ['calls:read', 'calls:create'],
    };

    const mockWarehouseUser = {
      userId: 'c0000000-0000-0000-0000-000000000002',
      username: 'warehouse',
      fullName: 'Central Warehouse Coordinator',
      roles: ['WAREHOUSE'],
      permissions: ['inventory:read', 'inventory:manage'],
    };

    const mockEngineerUser = {
      userId: 'd0000000-0000-0000-0000-000000000003',
      username: 'technician',
      fullName: 'Field Engineer Tech',
      roles: ['ENGINEER'],
      permissions: ['calls:read', 'calls:diagnose', 'calls:repair'],
    };

    const mockAdminUser = {
      userId: 'a0000000-0000-0000-0000-000000000001',
      username: 'admin',
      fullName: 'System Operations Lead',
      roles: ['ADMIN'],
      permissions: ['users:read', 'masters:read', 'inventory:read', 'calls:read'],
    };

    it('prevents Call Center user from opening /admin -> redirects to /call-center', async () => {
      mockBackendSession(200, mockCallCenterUser);

      const req = createMockRequest('/admin', 'valid_cc_token_123456');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/call-center');
    });

    it('prevents Call Center user from opening /warehouse -> redirects to /call-center', async () => {
      mockBackendSession(200, mockCallCenterUser);

      const req = createMockRequest('/warehouse', 'valid_cc_token_123456');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/call-center');
    });

    it('prevents Call Center user from opening /asf -> redirects to /call-center', async () => {
      mockBackendSession(200, mockCallCenterUser);

      const req = createMockRequest('/asf', 'valid_cc_token_123456');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/call-center');
    });

    it('prevents Warehouse user from opening /call-center -> redirects to /warehouse', async () => {
      mockBackendSession(200, mockWarehouseUser);

      const req = createMockRequest('/call-center', 'valid_wh_token_123456');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/warehouse');
    });

    it('prevents Warehouse user from opening /admin -> redirects to /warehouse', async () => {
      mockBackendSession(200, mockWarehouseUser);

      const req = createMockRequest('/admin', 'valid_wh_token_123456');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/warehouse');
    });

    it('prevents Warehouse user from opening /asf -> redirects to /warehouse', async () => {
      mockBackendSession(200, mockWarehouseUser);

      const req = createMockRequest('/asf', 'valid_wh_token_123456');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/warehouse');
    });

    it('prevents Field Engineer from opening /admin -> redirects to /asf', async () => {
      mockBackendSession(200, mockEngineerUser);

      const req = createMockRequest('/admin', 'valid_eng_token_123456');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/asf');
    });

    it('prevents Field Engineer from opening /call-center -> redirects to /asf', async () => {
      mockBackendSession(200, mockEngineerUser);

      const req = createMockRequest('/call-center', 'valid_eng_token_123456');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/asf');
    });

    it('prevents Field Engineer from opening /warehouse -> redirects to /asf', async () => {
      mockBackendSession(200, mockEngineerUser);

      const req = createMockRequest('/warehouse', 'valid_eng_token_123456');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/asf');
    });

    it('allows Admin to open all operational workspaces (200 pass-through)', async () => {
      mockBackendSession(200, mockAdminUser);

      for (const path of ['/admin', '/call-center', '/warehouse', '/asf']) {
        const req = createMockRequest(path, 'valid_admin_token_123456');
        const res = await middleware(req);
        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
      }
    });
  });

  describe('7. Fail-Safe Resilience on Backend Errors', () => {
    it('rejects access and redirects to /login?sessionExpired=true when backend connection fails', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const req = createMockRequest('/call-center', 'some_token_when_backend_is_down_1234');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(
        'http://localhost:3000/login?sessionExpired=true&redirect=%2Fcall-center'
      );
    });
  });
});
