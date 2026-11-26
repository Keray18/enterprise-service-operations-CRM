/**
 * Account provisioning and lifecycle types shared by Provider Super Admin
 * (client Admin accounts) and client Admin (operational staff accounts).
 */

/** Roles a client Admin may provision and manage. */
export const OPERATIONAL_STAFF_ROLES = ['CALL_CENTER', 'ASF', 'ENGINEER', 'WAREHOUSE'] as const;
export type OperationalStaffRole = (typeof OPERATIONAL_STAFF_ROLES)[number];

/** Privileged roles that only the provider may hold or grant. */
export const PRIVILEGED_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;

export interface ManagedAccountRecord {
  userId: string;
  username: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  locationId?: string;
  locationCode?: string;
  locationName?: string;
  roles: string[];
  isActive: 'Y' | 'N';
  mustChangePassword: 'Y' | 'N';
  lastLoginAt?: Date;
  lockedUntil?: Date;
  activeSessions: number;
  createdAt: Date;
}

export interface ProvisionAccountInput {
  fullName: string;
  username: string;
  email: string;
  phoneNumber?: string;
  locationId?: string;
}

export interface ProvisionAccountResult {
  account: ManagedAccountRecord;
  /** Displayed exactly once to the provisioning actor; never persisted or logged. */
  temporaryPassword: string;
}

export interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}
