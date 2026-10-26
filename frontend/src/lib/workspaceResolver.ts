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

  // 1. Role-based resolution
  if (roles.includes('ADMIN')) {
    return '/admin';
  }
  if (roles.includes('CALL_CENTER') || roles.includes('CALL_CENTER_SUPERVISOR')) {
    return '/call-center';
  }
  if (roles.includes('ASF') || roles.includes('ENGINEER') || roles.includes('ASF_MANAGER') || roles.includes('SERVICE_ENGINEER')) {
    return '/asf';
  }
  if (roles.includes('WAREHOUSE')) {
    return '/warehouse';
  }
  if (roles.includes('FINANCE') || roles.includes('BRAND')) {
    return '/finance';
  }

  // 2. Permission-based fallback
  if (permissions.includes('users:read') || permissions.includes('masters:manage')) {
    return '/admin';
  }
  if (permissions.includes('calls:create') || (permissions.includes('calls:read') && !permissions.includes('asf:read'))) {
    return '/call-center';
  }
  if (permissions.includes('asf:read') || permissions.includes('calls:diagnose') || permissions.includes('calls:repair')) {
    return '/asf';
  }
  if (permissions.includes('inventory:read')) {
    return '/warehouse';
  }
  if (permissions.includes('finance:read') || permissions.includes('finance:wallets') || permissions.includes('finance:claims')) {
    return '/finance';
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

  // 1. Admin Workspace (/admin, /admin/masters, /admin/diagnostics)
  if (pathname.startsWith('/admin')) {
    return (
      roles.includes('ADMIN') ||
      permissions.includes('users:read') ||
      permissions.includes('masters:manage') ||
      permissions.includes('roles:manage')
    );
  }

  // 2. Call Center Workspace (/call-center)
  if (pathname.startsWith('/call-center')) {
    return (
      roles.includes('ADMIN') ||
      roles.includes('CALL_CENTER') ||
      roles.includes('CALL_CENTER_SUPERVISOR') ||
      (permissions.includes('calls:create') && !roles.includes('ASF') && !roles.includes('ENGINEER'))
    );
  }

  // 3. ASF / Technician Workspace (/asf, /asf/jobs/...)
  if (pathname.startsWith('/asf')) {
    return (
      roles.includes('ADMIN') ||
      roles.includes('ASF') ||
      roles.includes('ENGINEER') ||
      roles.includes('ASF_MANAGER') ||
      roles.includes('SERVICE_ENGINEER') ||
      permissions.includes('asf:read') ||
      permissions.includes('calls:diagnose') ||
      permissions.includes('calls:repair')
    );
  }

  // 4. Warehouse Workspace (/warehouse)
  if (pathname.startsWith('/warehouse')) {
    return (
      roles.includes('ADMIN') ||
      roles.includes('WAREHOUSE') ||
      permissions.includes('inventory:manage') ||
      permissions.includes('inventory:dispatch')
    );
  }

  // 5. Finance Workspace (/finance)
  if (pathname.startsWith('/finance')) {
    return (
      roles.includes('ADMIN') ||
      roles.includes('FINANCE') ||
      roles.includes('BRAND') ||
      permissions.includes('finance:read') ||
      permissions.includes('finance:wallets') ||
      permissions.includes('finance:claims') ||
      permissions.includes('finance:settle')
    );
  }

  return true;
}
