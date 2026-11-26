import { AuthUser } from '../providers/AuthProvider';

/**
 * Deterministically resolves the authorized landing page for an authenticated user
 * based on their database-backed roles and effective permissions.
 *
 * Rules:
 * 1. ADMIN -> /admin (Head Office Governance, Catalog Masters, System Diagnostics)
 * 2. CALL_CENTER -> /call-center (Complaint intake, fast customer lookup, tracking)
 * 3. ASF or ENGINEER -> /asf (Franchise job queue, check-in, diagnosis, repair, closure)
 * 4. WAREHOUSE -> /warehouse (Logistics, PNA, parts inventory)
 * 5. Permission-based resolution if custom roles are present
 * 6. Returns null if the user has no authorized operational workspace
 */
export function resolveDefaultWorkspace(user: AuthUser | null): string | null {
  if (!user) {
    return null;
  }

  const roles = user.roles || [];
  const permissions = user.permissions || [];

  // Temporary credentials: the only reachable screen is the mandatory password change
  if (user.mustChangePassword) {
    return '/change-password';
  }

  // 0. Provider Super Admin (software provider) has a dedicated workspace
  if (roles.includes('SUPER_ADMIN')) {
    return '/super-admin';
  }

  // 1. Role-based resolution for the 5 client roles
  if (roles.includes('ADMIN')) {
    return '/admin';
  }
  if (roles.includes('CALL_CENTER') || roles.includes('CALL_CENTER_SUPERVISOR')) {
    return '/call-center';
  }
  if (roles.includes('ENGINEER') || roles.includes('SERVICE_ENGINEER')) {
    return '/engineer';
  }
  if (roles.includes('ASF') || roles.includes('ASF_MANAGER')) {
    return '/service-center';
  }
  if (roles.includes('WAREHOUSE')) {
    return '/warehouse';
  }

  // Inactive roles (FINANCE, BRAND, INFRA_OPS, DISTRIBUTOR) are not authorized
  const DEPRECATED_ROLES = ['FINANCE', 'BRAND', 'INFRA_OPS', 'DISTRIBUTOR'];
  if (roles.some((r) => DEPRECATED_ROLES.includes(r))) {
    return null;
  }

  // 2. Permission-based fallback for approved workspaces
  if (permissions.includes('users:read') || permissions.includes('masters:manage')) {
    return '/admin';
  }
  if (permissions.includes('calls:create') || (permissions.includes('calls:read') && !permissions.includes('asf:read') && !permissions.includes('calls:checkin'))) {
    return '/call-center';
  }
  if (permissions.includes('calls:checkin') && !permissions.includes('asf:read')) {
    return '/engineer';
  }
  if (permissions.includes('asf:read') || permissions.includes('calls:diagnose') || permissions.includes('calls:repair')) {
    return '/service-center';
  }
  if (permissions.includes('inventory:read')) {
    return '/warehouse';
  }

  return null;
}

/**
 * Checks if a user is authorized to access a given workspace route path.
 */
export function isAuthorizedForPath(user: AuthUser | null, pathname: string): boolean {
  if (!user) {
    return false;
  }

  const roles = user.roles || [];
  const permissions = user.permissions || [];

  // Mandatory first-login / reset password change gates every other screen
  if (pathname.startsWith('/change-password')) {
    return true;
  }
  if (user.mustChangePassword) {
    return false;
  }

  // Provider Super Admin workspace: provider only. The provider has no client business workspaces.
  if (pathname.startsWith('/super-admin')) {
    return roles.includes('SUPER_ADMIN');
  }
  if (roles.includes('SUPER_ADMIN') && !roles.some((r) => ['ADMIN', 'CALL_CENTER', 'ASF', 'ENGINEER', 'WAREHOUSE'].includes(r))) {
    return false;
  }

  // Deny access if user only possesses deprecated roles without approved roles
  const APPROVED_ROLES = ['ADMIN', 'CALL_CENTER', 'ASF', 'ENGINEER', 'WAREHOUSE'];
  const hasApprovedRole = roles.some((r) => APPROVED_ROLES.includes(r));
  const hasApprovedPerm = permissions.some((p) =>
    ['users:read', 'masters:manage', 'calls:read', 'calls:create', 'asf:read', 'calls:checkin', 'calls:diagnose', 'calls:repair', 'inventory:read', 'reports:view'].includes(p)
  );

  if (!hasApprovedRole && !hasApprovedPerm) {
    return false;
  }

  // 1. Technical Infrastructure Diagnostics (/admin/diagnostics)
  // Obsolete role-specific entry point: disabled in Phase 1 five-role architecture
  if (pathname.startsWith('/admin/diagnostics')) {
    return false;
  }

  // 2. Admin Engineer & Staff Management (/admin/engineers, /admin/staff)
  // Strictly restricted to the client Administrator
  if (pathname.startsWith('/admin/engineers') || pathname.startsWith('/admin/staff')) {
    return roles.includes('ADMIN');
  }

  // 3. Admin Workspace (/admin, /admin/masters)
  if (pathname.startsWith('/admin')) {
    return (
      roles.includes('ADMIN') ||
      permissions.includes('users:read') ||
      permissions.includes('masters:manage') ||
      permissions.includes('roles:manage')
    );
  }

  // 4. Dedicated Field Engineer Workspace (/engineer)
  if (pathname.startsWith('/engineer')) {
    return (
      roles.includes('ADMIN') ||
      roles.includes('ENGINEER') ||
      roles.includes('SERVICE_ENGINEER') ||
      permissions.includes('calls:checkin') ||
      permissions.includes('calls:diagnose') ||
      permissions.includes('calls:repair')
    );
  }

  // 5. Call Center Workspace (/call-center)
  if (pathname.startsWith('/call-center')) {
    return (
      roles.includes('ADMIN') ||
      roles.includes('CALL_CENTER') ||
      roles.includes('CALL_CENTER_SUPERVISOR') ||
      (permissions.includes('calls:create') && !roles.includes('ASF') && !roles.includes('ENGINEER'))
    );
  }

  // 6. Service Center / ASF Workspace (/service-center, /asf)
  // Job 360 subroutes (/asf/jobs/...) are accessible to assigned engineers
  if (pathname.startsWith('/asf/jobs') || pathname.startsWith('/service-center/jobs')) {
    return (
      roles.includes('ADMIN') ||
      roles.includes('ASF') ||
      roles.includes('ENGINEER') ||
      roles.includes('ASF_MANAGER') ||
      roles.includes('SERVICE_ENGINEER') ||
      permissions.includes('calls:diagnose') ||
      permissions.includes('calls:repair')
    );
  }

  if (pathname.startsWith('/service-center') || pathname.startsWith('/asf')) {
    return (
      roles.includes('ADMIN') ||
      roles.includes('ASF') ||
      roles.includes('ASF_MANAGER') ||
      permissions.includes('asf:read')
    );
  }

  // 7. Warehouse Workspace (/warehouse)
  if (pathname.startsWith('/warehouse')) {
    return (
      roles.includes('ADMIN') ||
      roles.includes('WAREHOUSE') ||
      permissions.includes('inventory:manage') ||
      permissions.includes('inventory:dispatch')
    );
  }

  // 8. Finance Workspace (/finance)
  // Only ADMIN retains operational access; removed roles (FINANCE, BRAND) are denied
  if (pathname.startsWith('/finance')) {
    return roles.includes('ADMIN');
  }

  return true;
}
