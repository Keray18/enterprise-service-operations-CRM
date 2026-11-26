import crypto from 'crypto';
import { hash } from '@node-rs/argon2';
import { closeOraclePool, getOracleConnection } from '../database/oraclePool.js';
import { rbacRepository } from '../database/repositories/rbacRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { ARGON2_OPTIONS, hashPassword, validatePasswordComplexity, verifyPassword } from '../services/passwordService.js';

interface DevAccountSpec {
  dashboard: string;
  role: string;
  username: string;
  email: string;
  fullName: string;
  route: string;
  preferredLocationType?: 'ASF' | 'CENTRAL_WAREHOUSE' | 'HEAD_OFFICE';
}

const DEV_ACCOUNTS: DevAccountSpec[] = [
  {
    dashboard: 'Admin Operations',
    role: 'ADMIN',
    username: 'admin',
    email: 'admin@crm.internal',
    fullName: 'System Operations Lead',
    route: '/admin',
  },
  {
    dashboard: 'Call Center',
    role: 'CALL_CENTER',
    username: 'callcenter',
    email: 'callcenter@crm.internal',
    fullName: 'Frontline Call Handler',
    route: '/call-center',
  },
  {
    dashboard: 'Service Center',
    role: 'ASF',
    username: 'service_center',
    email: 'servicecenter@crm.internal',
    fullName: 'Mumbai Service Center Lead',
    route: '/service-center',
    preferredLocationType: 'ASF',
  },
  {
    dashboard: 'Field Engineer',
    role: 'ENGINEER',
    username: 'mumbai_tech_1',
    email: 'tech1.mumbai@franchise.local',
    fullName: 'Field Engineer Mumbai',
    route: '/engineer',
    preferredLocationType: 'ASF',
  },
  {
    dashboard: 'Warehouse & Stores',
    role: 'WAREHOUSE',
    username: 'warehouse',
    email: 'warehouse@crm.internal',
    fullName: 'Central Warehouse Coordinator',
    route: '/warehouse',
    preferredLocationType: 'CENTRAL_WAREHOUSE',
  },
];

/**
 * Pinned development credentials for core operational personas.
 * Invariant: These credentials MUST NEVER be rotated, reset, or randomized in the development environment.
 */
export const PROTECTED_DEV_CREDENTIALS: Record<string, string> = {
  admin: 'Admin@123',
  callcenter: 'callCenter@123',
  warehouse: 'wareHouse@123',
  service_center: 'serviceCenter@123',
  mumbai_tech_1: 'fieldEng@123',
};

export async function seedDevAccounts(options?: { defaultPassword?: string }): Promise<Array<{
  dashboard: string;
  role: string;
  username: string;
  password: string;
  status: string;
  location: string;
  route: string;
}>> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('SECURITY VIOLATION: seedDevAccounts is strictly restricted to development and test environments.');
  }

  const conn = await getOracleConnection();
  const results: Array<{
    dashboard: string;
    role: string;
    username: string;
    password: string;
    status: string;
    location: string;
    route: string;
  }> = [];

  try {
    // 1. Fetch available anchor locations
    const locRes = await conn.execute<any>(
      `SELECT LOCATION_ID, LOCATION_CODE, LOCATION_NAME, PARTY_TYPE 
       FROM LOCATIONS 
       WHERE IS_ACTIVE = 'Y' 
       ORDER BY CREATED_AT ASC`,
      {},
      { outFormat: (conn as any).constructor.OUT_FORMAT_OBJECT || 4002 }
    );
    const locations = (locRes.rows || []).map((r: any) => ({
      locationId: r.LOCATION_ID,
      locationCode: r.LOCATION_CODE,
      locationName: r.LOCATION_NAME,
      partyType: r.PARTY_TYPE,
    }));

    const asfLocation =
      locations.find((l: any) => l.partyType === 'ASF' && (l.locationCode === 'ASF_8441' || l.locationId === '025a2dc3-dca6-4736-a83e-75fe0615871a')) ||
      locations.find((l: any) => l.partyType === 'ASF') ||
      locations[0];
    const whLocation = locations.find((l: any) => l.partyType === 'CENTRAL_WAREHOUSE') || locations[0];
    const hqLocation = locations.find((l: any) => l.partyType === 'HEAD_OFFICE') || locations[0];

    // 2. Process each spec
    for (const spec of DEV_ACCOUNTS) {
      // Determine designated location
      let targetLocationId: string | undefined = undefined;
      let targetLocationName = 'None (Global Scope)';

      if (spec.preferredLocationType === 'ASF' && asfLocation) {
        targetLocationId = asfLocation.locationId;
        targetLocationName = `${asfLocation.locationName} (${asfLocation.locationCode})`;
      } else if (spec.preferredLocationType === 'CENTRAL_WAREHOUSE' && whLocation) {
        targetLocationId = whLocation.locationId;
        targetLocationName = `${whLocation.locationName} (${whLocation.locationCode})`;
      } else if (spec.preferredLocationType === 'HEAD_OFFICE' && hqLocation) {
        targetLocationId = hqLocation.locationId;
        targetLocationName = `${hqLocation.locationName} (${hqLocation.locationCode})`;
      }

      // Determine plain password
      const isProtected = Object.prototype.hasOwnProperty.call(PROTECTED_DEV_CREDENTIALS, spec.username);
      const plainPassword = isProtected
        ? PROTECTED_DEV_CREDENTIALS[spec.username]!
        : options?.defaultPassword ||
          process.env['DEV_ACCOUNT_PASSWORD'] ||
          `CrmPass#${crypto.randomBytes(6).toString('base64url')}!9`;

      if (!isProtected) {
        validatePasswordComplexity(plainPassword);
      }

      // Check if user already exists
      const existingUser = await userRepository.findByUsernameOrEmail(spec.username);

      let userId: string;
      if (existingUser) {
        userId = existingUser.userId;
        // If protected, verify if current password already matches; only update hash if not matching
        const isCurrentMatch = isProtected && (await verifyPassword(plainPassword, existingUser.passwordHash)).valid;
        const shouldUpdateHash = !isProtected || !isCurrentMatch;

        if (shouldUpdateHash) {
          const passwordHash = isProtected
            ? await hash(plainPassword, ARGON2_OPTIONS)
            : await hashPassword(plainPassword);

          await conn.execute(
            `UPDATE APP_USERS 
             SET PASSWORD_HASH = :pwdHash, 
                 IS_ACTIVE = 'Y', 
                 FAILED_LOGIN_ATTEMPTS = 0, 
                 LOCKED_UNTIL = NULL,
                 LOCATION_ID = NVL(:locationId, LOCATION_ID),
                 UPDATED_AT = SYSTIMESTAMP 
             WHERE USER_ID = :userId`,
            {
              pwdHash: passwordHash,
              locationId: targetLocationId || null,
              userId,
            },
            { autoCommit: true }
          );
        } else {
          // Preserve existing verified password hash without modification
          await conn.execute(
            `UPDATE APP_USERS 
             SET IS_ACTIVE = 'Y', 
                 FAILED_LOGIN_ATTEMPTS = 0, 
                 LOCKED_UNTIL = NULL,
                 LOCATION_ID = NVL(:locationId, LOCATION_ID),
                 UPDATED_AT = SYSTIMESTAMP 
             WHERE USER_ID = :userId`,
            {
              locationId: targetLocationId || null,
              userId,
            },
            { autoCommit: true }
          );
        }
      } else {
        const passwordHash = isProtected
          ? await hash(plainPassword, ARGON2_OPTIONS)
          : await hashPassword(plainPassword);

        userId = crypto.randomUUID();
        await userRepository.createUser({
          userId,
          username: spec.username,
          email: spec.email,
          fullName: spec.fullName,
          passwordHash,
          locationId: targetLocationId,
        });
      }

      // Ensure user has their designated role
      try {
        await rbacRepository.assignRoleToUser(userId, spec.role, 'DEV_SEED_UTILITY');
      } catch (err: any) {
        // Role might already be assigned
      }

      results.push({
        dashboard: spec.dashboard,
        role: spec.role,
        username: spec.username,
        password: plainPassword,
        status: 'Active',
        location: targetLocationName,
        route: spec.route,
      });
    }

    return results;
  } finally {
    await conn.close();
  }
}

// Direct CLI execution
if (process.argv[1]?.replace(/\\/g, '/').endsWith('seedDevAccounts.ts')) {
  (async () => {
    try {
      console.log('\n========================================================================================');
      console.log('>>> PROVISIONING DEVELOPMENT OPERATIONAL ACCOUNTS & ROLE CREDENTIALS');
      console.log('========================================================================================\n');

      const accounts = await seedDevAccounts();

      console.table(
        accounts.map((a) => ({
          Dashboard: a.dashboard,
          Role: a.role,
          Username: a.username,
          Password: a.password,
          Status: a.status,
          Location: a.location,
          Route: a.route,
        }))
      );

      console.log('\n========================================================================================');
      console.log('[SECURITY NOTICE] Passwords displayed above are generated for local development testing only.');
      console.log('[SECURITY NOTICE] Stored in Oracle as Argon2id hashes. Plaintext is never persisted.');
      console.log('========================================================================================\n');
    } catch (err) {
      console.error('Failed to seed dev accounts:', err);
      process.exit(1);
    } finally {
      await closeOraclePool(2);
      process.exit(0);
    }
  })();
}
