import { describe, expect, it } from 'vitest';
import { isAuthorizedForPath, resolveDefaultWorkspace } from '../src/lib/workspaceResolver';
import type { AuthUser } from '../src/providers/AuthProvider';

describe('Role-Based Landing Page Resolver (P0 Fix)', () => {
  const createMockUser = (roles: string[], permissions: string[] = []): AuthUser => ({
    userId: 'test-user-id',
    username: 'testuser',
    email: 'test@crm.internal',
    fullName: 'Test User',
    roles,
    permissions,
  });

  describe('resolveDefaultWorkspace', () => {
    it('should route null/unauthenticated user to null', () => {
      expect(resolveDefaultWorkspace(null)).toBeNull();
    });

    it('should route user with no roles or permissions to null', () => {
      const user = createMockUser([]);
      expect(resolveDefaultWorkspace(user)).toBeNull();
    });

    it('should route ADMIN to /admin', () => {
      const user = createMockUser(['ADMIN'], ['users:read', 'masters:read', 'calls:read']);
      expect(resolveDefaultWorkspace(user)).toBe('/admin');
    });

    it('should route CALL_CENTER to /call-center', () => {
      const user = createMockUser(['CALL_CENTER'], ['calls:read', 'calls:create']);
      expect(resolveDefaultWorkspace(user)).toBe('/call-center');
    });

    it('should route CALL_CENTER_SUPERVISOR to /call-center', () => {
      const user = createMockUser(['CALL_CENTER_SUPERVISOR'], ['calls:read', 'calls:close']);
      expect(resolveDefaultWorkspace(user)).toBe('/call-center');
    });

    it('should route ASF franchisee to /asf', () => {
      const user = createMockUser(['ASF'], ['asf:read', 'calls:read']);
      expect(resolveDefaultWorkspace(user)).toBe('/asf');
    });

    it('should route ENGINEER field technician to /asf', () => {
      const user = createMockUser(['ENGINEER'], ['calls:read', 'calls:diagnose', 'calls:repair']);
      expect(resolveDefaultWorkspace(user)).toBe('/asf');
    });

    it('should route WAREHOUSE coordinator to /warehouse', () => {
      const user = createMockUser(['WAREHOUSE'], ['inventory:read', 'inventory:manage']);
      expect(resolveDefaultWorkspace(user)).toBe('/warehouse');
    });

    it('should route user with only calls:read to /call-center', () => {
      const user = createMockUser([], ['calls:read']);
      expect(resolveDefaultWorkspace(user)).toBe('/call-center');
    });

    it('should route user with only inventory:read to /warehouse', () => {
      const user = createMockUser([], ['inventory:read']);
      expect(resolveDefaultWorkspace(user)).toBe('/warehouse');
    });

    it('should route FINANCE officer to /finance', () => {
      const user = createMockUser(['FINANCE'], ['finance:read', 'finance:approve']);
      expect(resolveDefaultWorkspace(user)).toBe('/finance');
    });

    it('should route BRAND partner to /finance', () => {
      const user = createMockUser(['BRAND'], ['finance:read', 'finance:wallets']);
      expect(resolveDefaultWorkspace(user)).toBe('/finance');
    });

    it('should route user with only finance:read to /finance', () => {
      const user = createMockUser([], ['finance:read']);
      expect(resolveDefaultWorkspace(user)).toBe('/finance');
    });
  });

  describe('isAuthorizedForPath', () => {
    it('should deny unauthenticated user for any protected path', () => {
      expect(isAuthorizedForPath(null, '/call-center')).toBe(false);
      expect(isAuthorizedForPath(null, '/admin')).toBe(false);
      expect(isAuthorizedForPath(null, '/warehouse')).toBe(false);
      expect(isAuthorizedForPath(null, '/asf')).toBe(false);
      expect(isAuthorizedForPath(null, '/finance')).toBe(false);
    });

    it('should allow Admin on all workspaces', () => {
      const admin = createMockUser(['ADMIN'], ['users:read', 'masters:read']);
      expect(isAuthorizedForPath(admin, '/admin')).toBe(true);
      expect(isAuthorizedForPath(admin, '/admin/masters')).toBe(true);
      expect(isAuthorizedForPath(admin, '/call-center')).toBe(true);
      expect(isAuthorizedForPath(admin, '/warehouse')).toBe(true);
      expect(isAuthorizedForPath(admin, '/asf')).toBe(true);
      expect(isAuthorizedForPath(admin, '/finance')).toBe(true);
    });

    it('should allow FINANCE user on /finance and deny on unauthorized admin masters', () => {
      const fin = createMockUser(['FINANCE'], ['finance:read', 'finance:approve', 'finance:settle']);
      expect(isAuthorizedForPath(fin, '/finance')).toBe(true);
      expect(isAuthorizedForPath(fin, '/admin/masters')).toBe(false);
    });

    it('should allow BRAND partner on /finance and deny on admin', () => {
      const brand = createMockUser(['BRAND'], ['finance:read', 'finance:wallets']);
      expect(isAuthorizedForPath(brand, '/finance')).toBe(true);
      expect(isAuthorizedForPath(brand, '/admin')).toBe(false);
    });

    it('should prevent Call Center user from accessing Admin, Warehouse, or ASF', () => {
      const cc = createMockUser(['CALL_CENTER'], ['calls:read', 'calls:create']);
      expect(isAuthorizedForPath(cc, '/call-center')).toBe(true);
      expect(isAuthorizedForPath(cc, '/admin')).toBe(false);
      expect(isAuthorizedForPath(cc, '/admin/masters')).toBe(false);
      expect(isAuthorizedForPath(cc, '/warehouse')).toBe(false);
      expect(isAuthorizedForPath(cc, '/asf')).toBe(false);
    });

    it('should prevent Warehouse user from accessing Call Center, Admin, or ASF', () => {
      const wh = createMockUser(['WAREHOUSE'], ['inventory:read', 'inventory:manage']);
      expect(isAuthorizedForPath(wh, '/warehouse')).toBe(true);
      expect(isAuthorizedForPath(wh, '/admin')).toBe(false);
      expect(isAuthorizedForPath(wh, '/call-center')).toBe(false);
      expect(isAuthorizedForPath(wh, '/asf')).toBe(false);
    });

    it('should allow ASF franchisee only on /asf', () => {
      const asf = createMockUser(['ASF'], ['asf:read', 'calls:read', 'inventory:read', 'masters:read']);
      expect(isAuthorizedForPath(asf, '/asf')).toBe(true);
      expect(isAuthorizedForPath(asf, '/admin')).toBe(false);
      expect(isAuthorizedForPath(asf, '/call-center')).toBe(false);
      expect(isAuthorizedForPath(asf, '/warehouse')).toBe(false);
    });

    it('should allow Field Engineer only on /asf', () => {
      const eng = createMockUser(['ENGINEER'], ['calls:read', 'calls:diagnose', 'calls:repair']);
      expect(isAuthorizedForPath(eng, '/asf')).toBe(true);
      expect(isAuthorizedForPath(eng, '/asf/jobs/SR-2026-0001')).toBe(true);
      expect(isAuthorizedForPath(eng, '/admin')).toBe(false);
      expect(isAuthorizedForPath(eng, '/call-center')).toBe(false);
      expect(isAuthorizedForPath(eng, '/warehouse')).toBe(false);
    });
  });
});
