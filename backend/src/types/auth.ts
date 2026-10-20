export interface UserRecord {
  userId: string;
  username: string;
  email: string;
  fullName: string;
  passwordHash: string;
  phoneNumber?: string;
  locationId?: string;
  isActive: 'Y' | 'N';
  failedLoginAttempts: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSessionRecord {
  sessionId: string;
  userId: string;
  sessionTokenHash: string;
  csrfToken: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  revokedAt?: Date;
  lastActiveAt: Date;
  createdAt: Date;
}

export interface AuthenticatedUser {
  userId: string;
  username: string;
  email: string;
  fullName: string;
  locationId?: string;
  roles: string[];
  permissions: string[];
}

export interface AuthSessionContext {
  sessionId: string;
  csrfToken: string;
}

export interface LoginResult {
  user: AuthenticatedUser;
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
}
