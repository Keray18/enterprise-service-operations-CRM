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

    it('should route ASF franchisee to /service-center', () => {
      const user = createMockUser(['ASF'], ['asf:read', 'calls:read']);
      expect(resolveDefaultWorkspace(user)).toBe('/service-center');
    });

    it('should route ENGINEER field technician to /engineer', () => {
      const user = createMockUser(['ENGINEER'], ['calls:read', 'calls:diagnose', 'calls:repair']);
      expect(resolveDefaultWorkspace(user)).toBe('/engineer');
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

    it('should deny landing page to inactive FINANCE, BRAND, INFRA_OPS and DISTRIBUTOR roles', () => {
      expect(resolveDefaultWorkspace(createMockUser(['FINANCE'], ['finance:read']))).toBeNull();
      expect(resolveDefaultWorkspace(createMockUser(['BRAND'], ['finance:read']))).toBeNull();
      expect(resolveDefaultWorkspace(createMockUser(['INFRA_OPS'], ['system:audit']))).toBeNull();
      expect(resolveDefaultWorkspace(createMockUser(['DISTRIBUTOR'], []))).toBeNull();
    });

    it('routes the provider SUPER_ADMIN to the dedicated provider console', () => {
      expect(resolveDefaultWorkspace(createMockUser(['SUPER_ADMIN'], ['admins:manage', 'system:config']))).toBe('/super-admin');
    });

    it('routes any account holding a temporary credential to the mandatory password change', () => {
      const admin = { ...createMockUser(['ADMIN'], ['users:read']), mustChangePassword: true };
      expect(resolveDefaultWorkspace(admin)).toBe('/change-password');
      expect(isAuthorizedForPath(admin, '/admin')).toBe(false);
      expect(isAuthorizedForPath(admin, '/change-password')).toBe(true);
    });

    it('keeps the provider console and client workspaces mutually exclusive', () => {
      const provider = createMockUser(['SUPER_ADMIN'], ['admins:manage', 'system:config', 'audit:read']);
      const clientAdmin = createMockUser(['ADMIN'], ['users:read', 'users:create']);
      expect(isAuthorizedForPath(provider, '/super-admin/admins')).toBe(true);
      expect(isAuthorizedForPath(provider, '/admin')).toBe(false);
      expect(isAuthorizedForPath(provider, '/call-center')).toBe(false);
      expect(isAuthorizedForPath(clientAdmin, '/super-admin')).toBe(false);
      expect(isAuthorizedForPath(clientAdmin, '/admin/staff')).toBe(true);
      expect(isAuthorizedForPath(createMockUser(['ASF'], ['asf:read']), '/admin/staff')).toBe(false);
    });

    it('should route user with only finance:read to null', () => {
      const user = createMockUser([], ['finance:read']);
      expect(resolveDefaultWorkspace(user)).toBeNull();
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

    it('should allow Admin on all workspaces, but deny /admin/diagnostics without system:audit', () => {
      const admin = createMockUser(['ADMIN'], ['users:read', 'masters:read']);
      expect(isAuthorizedForPath(admin, '/admin')).toBe(true);
      expect(isAuthorizedForPath(admin, '/admin/masters')).toBe(true);
      expect(isAuthorizedForPath(admin, '/call-center')).toBe(true);
      expect(isAuthorizedForPath(admin, '/warehouse')).toBe(true);
      expect(isAuthorizedForPath(admin, '/asf')).toBe(true);
      expect(isAuthorizedForPath(admin, '/finance')).toBe(true);

      // Infrastructure diagnostics workspace is disabled in Phase 1
      expect(isAuthorizedForPath(admin, '/admin/diagnostics')).toBe(false);
    });

    it('should deny deprecated FINANCE and BRAND users access to workspaces', () => {
      const fin = createMockUser(['FINANCE'], ['finance:read', 'finance:approve', 'finance:settle']);
      expect(isAuthorizedForPath(fin, '/finance')).toBe(false);
      expect(isAuthorizedForPath(fin, '/admin/masters')).toBe(false);

      const brand = createMockUser(['BRAND'], ['finance:read', 'finance:wallets']);
      expect(isAuthorizedForPath(brand, '/finance')).toBe(false);
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

    it('should allow Field Engineer on /engineer and assigned Job 360', () => {
      const eng = createMockUser(['ENGINEER'], ['calls:read', 'calls:diagnose', 'calls:repair']);
      expect(isAuthorizedForPath(eng, '/engineer')).toBe(true);
      expect(isAuthorizedForPath(eng, '/asf/jobs/SR-2026-0001')).toBe(true);
      expect(isAuthorizedForPath(eng, '/service-center/jobs/SR-2026-0001')).toBe(true);
      expect(isAuthorizedForPath(eng, '/admin')).toBe(false);
      expect(isAuthorizedForPath(eng, '/call-center')).toBe(false);
      expect(isAuthorizedForPath(eng, '/warehouse')).toBe(false);
    });

    it('should deny /admin and /admin/masters for Call Center user even with masters:read permission', () => {
      const ccWithMastersRead = createMockUser(
        ['CALL_CENTER'],
        ['calls:read', 'calls:create', 'calls:update', 'masters:read']
      );
      expect(isAuthorizedForPath(ccWithMastersRead, '/call-center')).toBe(true);
      expect(isAuthorizedForPath(ccWithMastersRead, '/admin')).toBe(false);
      expect(isAuthorizedForPath(ccWithMastersRead, '/admin/masters')).toBe(false);
    });

    it('should deny /admin and /admin/masters for Warehouse user with masters:read', () => {
      const whWithMastersRead = createMockUser(
        ['WAREHOUSE'],
        ['inventory:read', 'inventory:manage', 'masters:read']
      );
      expect(isAuthorizedForPath(whWithMastersRead, '/warehouse')).toBe(true);
      expect(isAuthorizedForPath(whWithMastersRead, '/admin')).toBe(false);
      expect(isAuthorizedForPath(whWithMastersRead, '/admin/masters')).toBe(false);
    });

    it('should not resolve default workspace to /admin for user with only masters:read', () => {
      const userWithOnlyMastersRead = createMockUser([], ['masters:read']);
      expect(resolveDefaultWorkspace(userWithOnlyMastersRead)).toBeNull();
    });

    it('should resolve default workspace to /admin for user with masters:manage', () => {
      const userWithMastersManage = createMockUser([], ['masters:manage']);
      expect(resolveDefaultWorkspace(userWithMastersManage)).toBe('/admin');
    });
  });
});
