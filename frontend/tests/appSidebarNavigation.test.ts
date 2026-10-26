import { describe, expect, it } from 'vitest';

/**
 * Replicates the navigation item structure and filter logic from AppSidebar.tsx
 * to verify role- and permission-based item visibility invariants across all CRM personas.
 */

interface NavItem {
  label: string;
  href: string;
  requiredPermission?: string;
  requiredRole?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'CALL CENTER',
    items: [
      {
        label: 'Call Center Workspace',
        href: '/call-center',
        requiredPermission: 'calls:read',
      },
    ],
  },
  {
    title: 'SERVICE FRANCHISE',
    items: [
      {
        label: 'Franchise Queue & Jobs',
        href: '/asf',
        requiredPermission: 'asf:read',
      },
    ],
  },
  {
    title: 'WAREHOUSE & STORES',
    items: [
      {
        label: 'Warehouse & PNA Hub',
        href: '/warehouse',
        requiredPermission: 'inventory:read',
      },
    ],
  },
  {
    title: 'ADMIN & FINANCE',
    items: [
      {
        label: 'Admin Console',
        href: '/admin',
        requiredPermission: 'users:read',
      },
      {
        label: 'Catalog Masters',
        href: '/admin/masters',
        requiredPermission: 'masters:manage',
      },
      {
        label: 'Finance & Settlements',
        href: '/finance',
        requiredPermission: 'finance:read',
      },
      {
        label: 'System Diagnostics',
        href: '/admin/diagnostics',
        requiredRole: 'ADMIN',
      },
    ],
  },
];

function getVisibleNavItems(user: { roles: string[]; permissions: string[] }) {
  const hasPermission = (perm: string) => user.permissions.includes(perm);
  const hasRole = (role: string) => user.roles.includes(role);

  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (!item.requiredPermission && !item.requiredRole) return true;
      if (item.requiredPermission && !hasPermission(item.requiredPermission)) return false;
      if (item.requiredRole && !hasRole(item.requiredRole)) return false;
      return true;
    }),
  })).filter((section) => section.items.length > 0);
}

describe('AppSidebar Navigation Visibility & RBAC Protection', () => {
  it('Admin sees all items including Catalog Masters, Diagnostics, and Admin Console', () => {
    const admin = {
      roles: ['ADMIN'],
      permissions: [
        'users:read',
        'users:create',
        'users:update',
        'users:delete',
        'roles:read',
        'roles:manage',
        'calls:read',
        'calls:create',
        'calls:update',
        'calls:assign',
        'calls:close',
        'inventory:read',
        'inventory:manage',
        'inventory:dispatch',
        'asf:read',
        'asf:manage',
        'asf:claims',
        'masters:read',
        'masters:manage',
        'finance:read',
        'reports:view',
      ],
    };

    const visibleSections = getVisibleNavItems(admin);
    const visibleLabels = visibleSections.flatMap((s) => s.items.map((i) => i.label));

    expect(visibleLabels).toContain('Catalog Masters');
    expect(visibleLabels).toContain('Admin Console');
    expect(visibleLabels).toContain('System Diagnostics');
    expect(visibleLabels).toContain('Finance & Settlements');
    expect(visibleLabels).toContain('Call Center Workspace');
    expect(visibleLabels).toContain('Warehouse & PNA Hub');
    expect(visibleLabels).toContain('Franchise Queue & Jobs');
  });

  it('Call Center does NOT see Catalog Masters, Admin Console, or Diagnostics', () => {
    const callCenter = {
      roles: ['CALL_CENTER'],
      permissions: [
        'calls:read',
        'calls:create',
        'calls:update',
        'calls:assign',
        'masters:read', // Note: has masters:read for complaint lookup, but NOT masters:manage!
        'reports:view',
      ],
    };

    const visibleSections = getVisibleNavItems(callCenter);
    const visibleLabels = visibleSections.flatMap((s) => s.items.map((i) => i.label));

    expect(visibleLabels).toContain('Call Center Workspace');
    expect(visibleLabels).not.toContain('Catalog Masters');
    expect(visibleLabels).not.toContain('Admin Console');
    expect(visibleLabels).not.toContain('System Diagnostics');
    expect(visibleLabels).not.toContain('Finance & Settlements');
    expect(visibleLabels).not.toContain('Warehouse & PNA Hub');
    expect(visibleLabels).not.toContain('Franchise Queue & Jobs');
  });

  it('Warehouse does NOT see Catalog Masters or Admin Console', () => {
    const warehouse = {
      roles: ['WAREHOUSE'],
      permissions: [
        'inventory:read',
        'inventory:manage',
        'inventory:dispatch',
        'masters:read', // Has masters:read for part taxonomy, but NOT masters:manage!
        'reports:view',
      ],
    };

    const visibleSections = getVisibleNavItems(warehouse);
    const visibleLabels = visibleSections.flatMap((s) => s.items.map((i) => i.label));

    expect(visibleLabels).toContain('Warehouse & PNA Hub');
    expect(visibleLabels).not.toContain('Catalog Masters');
    expect(visibleLabels).not.toContain('Admin Console');
    expect(visibleLabels).not.toContain('System Diagnostics');
    expect(visibleLabels).not.toContain('Call Center Workspace');
  });

  it('Authorized Service Franchise (ASF) does NOT see Catalog Masters', () => {
    const asf = {
      roles: ['ASF'],
      permissions: [
        'calls:read',
        'calls:update',
        'calls:assign',
        'inventory:read',
        'asf:read',
        'asf:manage',
        'asf:claims',
        'masters:read',
      ],
    };

    const visibleSections = getVisibleNavItems(asf);
    const visibleLabels = visibleSections.flatMap((s) => s.items.map((i) => i.label));

    expect(visibleLabels).toContain('Franchise Queue & Jobs');
    expect(visibleLabels).toContain('Warehouse & PNA Hub'); // has inventory:read
    expect(visibleLabels).not.toContain('Catalog Masters');
    expect(visibleLabels).not.toContain('Admin Console');
  });

  it('Finance Officer does NOT see Catalog Masters', () => {
    const finance = {
      roles: ['FINANCE'],
      permissions: ['finance:read', 'finance:approve', 'finance:settle', 'reports:view'],
    };

    const visibleSections = getVisibleNavItems(finance);
    const visibleLabels = visibleSections.flatMap((s) => s.items.map((i) => i.label));

    expect(visibleLabels).toContain('Finance & Settlements');
    expect(visibleLabels).not.toContain('Catalog Masters');
    expect(visibleLabels).not.toContain('Admin Console');
  });

  it('Brand Partner does NOT see Catalog Masters', () => {
    const brand = {
      roles: ['BRAND'],
      permissions: ['finance:read', 'finance:wallets', 'reports:view'],
    };

    const visibleSections = getVisibleNavItems(brand);
    const visibleLabels = visibleSections.flatMap((s) => s.items.map((i) => i.label));

    expect(visibleLabels).toContain('Finance & Settlements');
    expect(visibleLabels).not.toContain('Catalog Masters');
    expect(visibleLabels).not.toContain('Admin Console');
  });
});
