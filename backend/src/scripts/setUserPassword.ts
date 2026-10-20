import crypto from 'crypto';
import { closeOraclePool } from '../database/oraclePool.js';
import { sessionRepository } from '../database/repositories/sessionRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { hashPassword, validatePasswordComplexity } from '../services/passwordService.js';

export async function setUserPassword(options: {
  username: string;
  password?: string;
}): Promise<void> {
  const username = options.username.toLowerCase().trim();
  let password = options.password || process.env['USER_PASSWORD'];

  if (!password) {
    const randomSecret = crypto.randomBytes(16).toString('base64url');
    password = `Pass#${randomSecret}1!`;
    console.log(`[INFO] No password provided. Generated secure temporary password.`);
  }

  try {
    validatePasswordComplexity(password);
  } catch (err: unknown) {
    console.error(`\n[ERROR] Password does not meet enterprise security requirements:`);
    console.error(`  - ${(err as Error).message}`);
    console.error(`\nRequirements:`);
    console.error(`  - Minimum 10 characters`);
    console.error(`  - At least 1 uppercase letter (A-Z)`);
    console.error(`  - At least 1 lowercase letter (a-z)`);
    console.error(`  - At least 1 digit (0-9)`);
    console.error(`  - At least 1 special character (!@#$%^&*...)\n`);
    console.error(`Example valid password: Password#2026!\n`);
    process.exit(1);
  }

  const user = await userRepository.findByUsernameOrEmail(username);
  if (!user) {
    console.error(`\n[ERROR] User '${username}' does not exist in the database.`);
    console.error(`Run 'pnpm db:users' to see available accounts.\n`);
    process.exit(1);
  }

  const newHash = await hashPassword(password);
  await userRepository.updatePassword(user.userId, newHash);
  await userRepository.recordSuccessfulLogin(user.userId);
  await sessionRepository.revokeAllUserSessions(user.userId);

  console.log(`\n========================================================================================`);
  console.log(`>>> USER PASSWORD UPDATED SUCCESSFULLY`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`Username     : ${username}`);
  console.log(`User ID      : ${user.userId}`);
  console.log(`Full Name    : ${user.fullName}`);
  console.log(`Algorithm    : Argon2id`);
  console.log(`Sessions     : Invalidate all active sessions (revoked)`);
  console.log(`Status       : READY TO SIGN IN`);
  console.log(`========================================================================================\n`);
}

async function main() {
  try {
    const args = process.argv.slice(2);
    let username = 'admin';
    let password: string | undefined;

    for (const arg of args) {
      if (arg.startsWith('--username=')) {
        username = arg.split('=')[1] || 'admin';
      } else if (arg.startsWith('--password=')) {
        password = arg.split('=')[1];
      }
    }

    await setUserPassword({ username, password });
  } catch (err: unknown) {
    console.error('Failed to set password:', (err as Error).message);
    process.exit(1);
  } finally {
    await closeOraclePool();
  }
}

if (process.argv[1]?.includes('setUserPassword')) {
  main();
}
