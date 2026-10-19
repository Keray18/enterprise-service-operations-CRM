import crypto from 'crypto';
import { closeOraclePool } from '../database/oraclePool.js';
import { rbacRepository } from '../database/repositories/rbacRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { logger } from '../logging/logger.js';
import { hashPassword, validatePasswordComplexity } from '../services/passwordService.js';

export async function bootstrapAdmin(options?: {
  username?: string;
  email?: string;
  password?: string;
  fullName?: string;
}): Promise<{ created: boolean; username: string }> {
  const username = (
    options?.username ||
    process.env['BOOTSTRAP_ADMIN_USERNAME'] ||
    'admin'
  ).toLowerCase().trim();

  const email = (
    options?.email ||
    process.env['BOOTSTRAP_ADMIN_EMAIL'] ||
    'admin@crm.internal'
  ).toLowerCase().trim();

  let password = options?.password || process.env['BOOTSTRAP_ADMIN_PASSWORD'];

  // Check if administrator already exists before processing passwords
  const existingUser = await userRepository.findByUsernameOrEmail(username);
  const existingEmail = await userRepository.findByUsernameOrEmail(email);

  if (existingUser || existingEmail) {
    const existing = existingUser || existingEmail;
    console.log(`\n========================================================================================`);
    console.log(`[INFO] Administrator user already exists (User ID: ${existing?.userId}, Username: ${existing?.username}).`);
    console.log(`[INFO] Preserving existing credentials. Skipped creation to prevent silent overwrite.`);
    console.log(`========================================================================================\n`);
    return { created: false, username: existing?.username || username };
  }

  // If no password provided via option or environment, generate a strong random secret
  if (!password) {
    const randomSecret = crypto.randomBytes(18).toString('base64url');
    password = `Adm#${randomSecret}9!`;
    console.log(`[NOTICE] No password supplied via BOOTSTRAP_ADMIN_PASSWORD. Generated strong unique password.`);
  }

  validatePasswordComplexity(password);

  console.log(`\n========================================================================================`);
  console.log(`>>> PROVISIONING INITIAL CRM ADMINISTRATOR ACCOUNT`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`Target Username : ${username}`);
  console.log(`Target Email    : ${email}`);

  // Hash password using Argon2id (OWASP recommended parameters)
  const passwordHash = await hashPassword(password);
  const userId = crypto.randomUUID();

  // Create user
  await userRepository.createUser({
    userId,
    username,
    email,
    fullName: options?.fullName || process.env['BOOTSTRAP_ADMIN_NAME'] || 'System Operations Lead',
    passwordHash,
  });

  // Assign ADMIN role
  await rbacRepository.assignRoleToUser(userId, 'ADMIN', 'SYSTEM_BOOTSTRAP');

  console.log(`[SUCCESS] Initial System Administrator provisioned successfully!`);
  console.log(`          User ID : ${userId}`);
  console.log(`          Role    : ADMIN (All capabilities assigned)`);
  console.log(`          Hash    : Argon2id`);
  console.log(`========================================================================================\n`);

  logger.info(`Administrator account created: ${username} (${userId})`);
  return { created: true, username };
}

async function main() {
  try {
    await bootstrapAdmin();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n[FATAL] Administrator bootstrap failed: ${msg}\n`);
    process.exitCode = 1;
  } finally {
    await closeOraclePool();
  }
}

// Execute when run directly
if (process.argv[1]?.includes('bootstrapAdmin')) {
  main();
}
