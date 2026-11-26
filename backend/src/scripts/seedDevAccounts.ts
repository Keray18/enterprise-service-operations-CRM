import crypto from 'crypto';
import { closeOraclePool, getOracleConnection } from '../database/oraclePool.js';
import { rbacRepository } from '../database/repositories/rbacRepository.js';
import { sessionRepository } from '../database/repositories/sessionRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { generateTemporaryPassword, hashPassword } from '../services/passwordService.js';

/**
 * Development persona provisioning (development / test databases only).
 *
 * Security model (Phase 3):
 *  - No password is pinned or hardcoded. Every credential this utility issues is a
 *    CSPRNG temporary password that must be changed at first sign-in.
 *  - Existing accounts keep their current credential (nobody is locked out) unless the
 *    operator explicitly asks for rotation with `--rotate`, which issues a new temporary
 *    credential and revokes the account's sessions.
 *  - Temporary passwords are printed once to the operator's console and never persisted.
 */
export interface DevAccountSpec {
  dashboard: string;
  role: 'ADMIN' | 'CALL_CENTER' | 'ASF' | 'ENGINEER' | 'WAREHOUSE';
  username: string;
  email: string;
  fullName: string;
  route: string;
  preferredLocationType?: 'ASF' | 'CENTRAL_WAREHOUSE';
}

export const DEV_ACCOUNTS: DevAccountSpec[] = [
  { dashboard: 'Admin Operations', role: 'ADMIN', username: 'admin', email: 'admin@crm.internal', fullName: 'System Operations Lead', route: '/admin' },
  { dashboard: 'Call Center', role: 'CALL_CENTER', username: 'callcenter', email: 'callcenter@crm.internal', fullName: 'Frontline Call Handler', route: '/call-center' },
  { dashboard: 'Service Center', role: 'ASF', username: 'service_center', email: 'servicecenter@crm.internal', fullName: 'Mumbai Service Center Lead', route: '/service-center', preferredLocationType: 'ASF' },
  { dashboard: 'Field Engineer', role: 'ENGINEER', username: 'mumbai_tech_1', email: 'tech1.mumbai@franchise.local', fullName: 'Field Engineer Mumbai', route: '/engineer', preferredLocationType: 'ASF' },
  { dashboard: 'Warehouse & Stores', role: 'WAREHOUSE', username: 'warehouse', email: 'warehouse@crm.internal', fullName: 'Central Warehouse Coordinator', route: '/warehouse', preferredLocationType: 'CENTRAL_WAREHOUSE' },
];

export interface SeedResult {
  dashboard: string;
  role: string;
  username: string;
  /** Present only when a new temporary credential was issued in this run. */
  temporaryPassword?: string;
  action: 'CREATED' | 'ROTATED' | 'PRESERVED';
  location: string;
  route: string;
}

export async function seedDevAccounts(options?: {
  rotate?: boolean;
  usernames?: string[];
  accounts?: DevAccountSpec[];
}): Promise<SeedResult[]> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('SECURITY VIOLATION: seedDevAccounts is strictly restricted to development and test environments.');
  }

  const specs = (options?.accounts || DEV_ACCOUNTS).filter(
    (s) => !options?.usernames || options.usernames.includes(s.username)
  );
  const results: SeedResult[] = [];

  const conn = await getOracleConnection();
  let asfLocation: { id: string; label: string } | undefined;
  let whLocation: { id: string; label: string } | undefined;
  try {
    const locRes = await conn.execute<any>(
      `SELECT LOCATION_ID, LOCATION_CODE, LOCATION_NAME, PARTY_TYPE, IS_DEFAULT
         FROM LOCATIONS
        WHERE IS_ACTIVE = 'Y' AND IS_TEST_FIXTURE = 'N'
        ORDER BY CASE WHEN IS_DEFAULT = 'Y' THEN 0 ELSE 1 END, CREATED_AT ASC`,
      {},
      { outFormat: 4002 }
    );
    const rows = (locRes.rows || []) as any[];
    const asf = rows.find((r) => r.PARTY_TYPE === 'ASF');
    const wh = rows.find((r) => r.PARTY_TYPE === 'CENTRAL_WAREHOUSE');
    if (asf) asfLocation = { id: asf.LOCATION_ID, label: `${asf.LOCATION_NAME} (${asf.LOCATION_CODE})` };
    if (wh) whLocation = { id: wh.LOCATION_ID, label: `${wh.LOCATION_NAME} (${wh.LOCATION_CODE})` };
  } finally {
    await conn.close();
  }

  for (const spec of specs) {
    const location =
      spec.preferredLocationType === 'ASF' ? asfLocation : spec.preferredLocationType === 'CENTRAL_WAREHOUSE' ? whLocation : undefined;
    const existing = await userRepository.findByUsernameOrEmail(spec.username);

    if (existing && !options?.rotate) {
      results.push({
        dashboard: spec.dashboard,
        role: spec.role,
        username: existing.username,
        action: 'PRESERVED',
        location: location?.label || 'None (Global Scope)',
        route: spec.route,
      });
      continue;
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    if (existing) {
      const tx = await getOracleConnection();
      try {
        await userRepository.setCredential(existing.userId, passwordHash, 'Y', tx);
        await sessionRepository.revokeAllUserSessions(existing.userId, tx);
        await tx.commit();
      } catch (err) {
        await tx.rollback();
        throw err;
      } finally {
        await tx.close();
      }
      results.push({
        dashboard: spec.dashboard,
        role: spec.role,
        username: existing.username,
        temporaryPassword,
        action: 'ROTATED',
        location: location?.label || 'None (Global Scope)',
        route: spec.route,
      });
      continue;
    }

    const userId = crypto.randomUUID();
    const tx = await getOracleConnection();
    try {
      await userRepository.createUser(
        {
          userId,
          username: spec.username,
          email: spec.email,
          fullName: spec.fullName,
          passwordHash,
          locationId: location?.id,
          mustChangePassword: 'Y',
        },
        tx
      );
      await rbacRepository.assignRoleToUser(userId, spec.role, 'DEV_SEED_UTILITY', tx);
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    } finally {
      await tx.close();
    }
    results.push({
      dashboard: spec.dashboard,
      role: spec.role,
      username: spec.username,
      temporaryPassword,
      action: 'CREATED',
      location: location?.label || 'None (Global Scope)',
      route: spec.route,
    });
  }

  return results;
}

// Direct CLI execution:  pnpm db:seed-dev-accounts [--rotate] [--only=user1,user2]
if (process.argv[1]?.replace(/\\/g, '/').endsWith('seedDevAccounts.ts')) {
  (async () => {
    let exitCode = 0;
    try {
      const rotate = process.argv.includes('--rotate');
      const onlyArg = process.argv.find((a) => a.startsWith('--only='));
      const usernames = onlyArg ? onlyArg.slice('--only='.length).split(',').map((u) => u.trim()).filter(Boolean) : undefined;

      console.log('\n>>> DEVELOPMENT PERSONA PROVISIONING' + (rotate ? ' (ROTATION REQUESTED)' : ''));
      const accounts = await seedDevAccounts({ rotate, usernames });
      console.table(
        accounts.map((a) => ({
          Dashboard: a.dashboard,
          Role: a.role,
          Username: a.username,
          Action: a.action,
          'Temporary Password (shown once)': a.temporaryPassword || '(unchanged)',
          Route: a.route,
        }))
      );
      console.log('[SECURITY] Temporary passwords are shown once, are not stored in plaintext, and must be changed at first sign-in.');
    } catch (err) {
      console.error('Failed to seed dev accounts:', err instanceof Error ? err.message : err);
      exitCode = 1;
    } finally {
      await closeOraclePool(2);
      process.exit(exitCode);
    }
  })();
}
