import crypto from 'crypto';
import fs from 'fs';
import oracledb from 'oracledb';
import { closeOraclePool, getOracleConnection } from '../database/oraclePool.js';
import { rbacRepository } from '../database/repositories/rbacRepository.js';
import { sessionRepository } from '../database/repositories/sessionRepository.js';
import { systemAuditRepository } from '../database/repositories/systemAuditRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { generateTemporaryPassword, hashPassword } from '../services/passwordService.js';

/**
 * Backend-only provisioning of provider Super Admin accounts.
 *
 * There is deliberately NO HTTP endpoint that creates or modifies SUPER_ADMIN accounts and no
 * default password. Running this CLI requires server access and the database credentials.
 *
 *   pnpm db:super-admin create --username=<u> --email=<e> --name="<Full Name>" [--phone=<10 digits>] [--output=<file>]
 *   pnpm db:super-admin list
 *   pnpm db:super-admin reset --username=<u> [--output=<file>]
 *   pnpm db:super-admin deactivate --username=<u>
 *   pnpm db:super-admin activate --username=<u>
 *
 * `create` refuses to add a second Super Admin unless --additional is passed.
 * `deactivate` refuses to suspend the last active Super Admin.
 * Temporary passwords are shown once (or written to an owner-only --output file) and must be
 * changed at first sign-in.
 */

const ROLE = 'SUPER_ADMIN';

function argValue(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function emitCredential(username: string, temporaryPassword: string): void {
  const output = argValue('output');
  if (output) {
    fs.writeFileSync(output, `${username}\t${temporaryPassword}\n`, { encoding: 'utf8', mode: 0o600 });
    console.log(`Temporary credential written to ${output} (owner-only). Deliver it securely and delete the file.`);
  } else {
    console.log('\n  Temporary password (shown once, must be changed at first sign-in):');
    console.log(`  ${temporaryPassword}\n`);
  }
}

async function audit(action: string, userId: string, conn: oracledb.Connection, changes?: Record<string, any>) {
  await systemAuditRepository.recordEvent(
    {
      actorId: null,
      actorRole: 'SYSTEM',
      actorUsername: 'super-admin-cli',
      action,
      resource: 'APP_USERS',
      recordIdentifier: userId,
      outcome: 'SUCCESS',
      justification: 'Backend Super Admin provisioning CLI',
      changes: changes || null,
    },
    conn
  );
}

async function requireSuperAdmin(username: string) {
  const user = await userRepository.findByUsernameOrEmail(username);
  if (!user) throw new Error(`Account '${username}' not found.`);
  const conn = await getOracleConnection();
  try {
    const res = await conn.execute<any>(
      `SELECT COUNT(*) AS C FROM USER_ROLES ur JOIN ROLES r ON r.ROLE_ID = ur.ROLE_ID WHERE ur.USER_ID = :id AND r.CODE = :role`,
      { id: user.userId, role: ROLE },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (Number(res.rows?.[0]?.C || 0) === 0) throw new Error(`Account '${username}' is not a Super Admin.`);
  } finally {
    await conn.close();
  }
  return user;
}

async function create(): Promise<void> {
  const username = (argValue('username') || '').trim().toLowerCase();
  const email = (argValue('email') || '').trim().toLowerCase();
  const fullName = (argValue('name') || '').trim();
  const phone = argValue('phone')?.replace(/\D/g, '');
  if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) throw new Error('--username is required (3-50 chars, lowercase letters/digits/._-).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('--email must be a valid address.');
  if (fullName.length < 2) throw new Error('--name is required.');
  if (phone && !/^[6-9]\d{9}$/.test(phone)) throw new Error('--phone must be a 10-digit Indian mobile number.');

  const activeCount = await userRepository.countActiveUsersWithRole(ROLE);
  if (activeCount > 0 && !process.argv.includes('--additional')) {
    throw new Error(`${activeCount} active Super Admin account(s) already exist. Pass --additional to provision another.`);
  }
  if (await userRepository.findByUsernameOrEmail(username)) throw new Error(`Username '${username}' already exists.`);
  if (await userRepository.findByUsernameOrEmail(email)) throw new Error(`Email '${email}' already exists.`);

  const temporaryPassword = generateTemporaryPassword();
  const userId = crypto.randomUUID();
  const conn = await getOracleConnection();
  try {
    await userRepository.createUser(
      { userId, username, email, fullName, phoneNumber: phone, passwordHash: await hashPassword(temporaryPassword), mustChangePassword: 'Y' },
      conn
    );
    await rbacRepository.assignRoleToUser(userId, ROLE, 'SUPER_ADMIN_CLI', conn);
    await audit('SUPER_ADMIN_CREATE', userId, conn, { username });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
  console.log(`Super Admin '${username}' provisioned (user ID ${userId}).`);
  emitCredential(username, temporaryPassword);
}

async function list(): Promise<void> {
  const page = await userRepository.listAccountsByRoles({ roleCodes: [ROLE], limit: 100 });
  console.table(
    page.items.map((a) => ({
      username: a.username,
      email: a.email,
      active: a.isActive,
      mustChangePassword: a.mustChangePassword,
      activeSessions: a.activeSessions,
      lastLoginAt: a.lastLoginAt?.toISOString() || '',
    }))
  );
}

async function reset(): Promise<void> {
  const user = await requireSuperAdmin(argValue('username') || '');
  const temporaryPassword = generateTemporaryPassword();
  const conn = await getOracleConnection();
  try {
    await userRepository.setCredential(user.userId, await hashPassword(temporaryPassword), 'Y', conn);
    const revoked = await sessionRepository.revokeAllUserSessions(user.userId, conn);
    await audit('CREDENTIAL_RESET', user.userId, conn, { revokedSessions: revoked });
    await conn.commit();
    console.log(`Credential reset for '${user.username}'; ${revoked} session(s) revoked.`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
  emitCredential(user.username, temporaryPassword);
}

async function setActive(isActive: 'Y' | 'N'): Promise<void> {
  const user = await requireSuperAdmin(argValue('username') || '');
  const conn = await getOracleConnection();
  try {
    if (isActive === 'N') {
      // Lock all Super Admin rows so two concurrent deactivations cannot both pass the guard
      await conn.execute(
        `SELECT u.USER_ID FROM APP_USERS u
          WHERE u.USER_ID IN (SELECT ur.USER_ID FROM USER_ROLES ur JOIN ROLES r ON r.ROLE_ID = ur.ROLE_ID WHERE r.CODE = :role)
          FOR UPDATE`,
        { role: ROLE }
      );
      const active = await userRepository.countActiveUsersWithRole(ROLE, conn);
      if (user.isActive === 'Y' && active <= 1) {
        throw new Error('Refusing to deactivate the last active Super Admin. Provision another Super Admin first.');
      }
    }
    await userRepository.setUserActive(user.userId, isActive, conn);
    const revoked = isActive === 'N' ? await sessionRepository.revokeAllUserSessions(user.userId, conn) : 0;
    await audit(isActive === 'Y' ? 'ACCOUNT_ACTIVATE' : 'ACCOUNT_SUSPEND', user.userId, conn, { revokedSessions: revoked });
    await conn.commit();
    console.log(`Super Admin '${user.username}' is now ${isActive === 'Y' ? 'active' : 'suspended'}${revoked ? ` (${revoked} session(s) revoked)` : ''}.`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'test') throw new Error('This CLI must not run with NODE_ENV=test.');
  const command = process.argv[2];
  switch (command) {
    case 'create':
      return create();
    case 'list':
      return list();
    case 'reset':
      return reset();
    case 'deactivate':
      return setActive('N');
    case 'activate':
      return setActive('Y');
    default:
      throw new Error('Usage: superAdminAccounts <create|list|reset|deactivate|activate> [options]');
  }
}

main()
  .catch((err) => {
    console.error(`[FATAL] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeOraclePool();
  });
