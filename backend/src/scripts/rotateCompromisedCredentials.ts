import fs from 'fs';
import oracledb from 'oracledb';
import { closeOraclePool, getOracleConnection } from '../database/oraclePool.js';
import { sessionRepository } from '../database/repositories/sessionRepository.js';
import { systemAuditRepository } from '../database/repositories/systemAuditRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { generateTemporaryPassword, hashPassword, verifyPassword } from '../services/passwordService.js';

/**
 * Detects accounts whose current password matches a known-compromised value and rotates them.
 *
 * Candidate values are NEVER stored in source control. Supply them in a local file (one value
 * per line) outside the repository and point to it with --candidates=<path> or the
 * COMPROMISED_PASSWORDS_FILE environment variable. Delete the file afterwards.
 *
 * Usage:
 *   tsx src/scripts/rotateCompromisedCredentials.ts --candidates=/secure/path/list.txt            (report only)
 *   tsx src/scripts/rotateCompromisedCredentials.ts --candidates=/secure/path/list.txt --rotate   (rotate matches)
 *   ... --usernames=a,b,c                   limits the scan to the named accounts (full scan otherwise)
 *   ... --output=/secure/path/rotated.txt   writes the one-time temporary credentials to a local file
 *                                           with owner-only permissions instead of the console.
 *
 * Rotation issues a CSPRNG temporary password, sets MUST_CHANGE_PASSWORD = 'Y' and revokes every
 * session of the account, so the legitimate owner signs in with the new temporary value and
 * immediately chooses their own password. Inactive accounts are rotated but stay inactive.
 */
async function main(): Promise<void> {
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const candidatesPath = arg('candidates') || process.env['COMPROMISED_PASSWORDS_FILE'];
  const outputPath = arg('output');
  const rotate = process.argv.includes('--rotate');
  const scope = arg('usernames')?.split(',').map((u) => u.trim().toLowerCase()).filter(Boolean);

  if (!candidatesPath || !fs.existsSync(candidatesPath)) {
    throw new Error('Provide --candidates=<file> (or COMPROMISED_PASSWORDS_FILE) listing known-compromised passwords, one per line.');
  }
  const candidates = fs
    .readFileSync(candidatesPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (candidates.length === 0) {
    throw new Error('Candidate file is empty.');
  }

  const conn = await getOracleConnection();
  let users: Array<{ USER_ID: string; USERNAME: string; PASSWORD_HASH: string; IS_ACTIVE: string; ROLES: string | null }>;
  try {
    const res = await conn.execute<any>(
      `SELECT u.USER_ID, u.USERNAME, u.PASSWORD_HASH, u.IS_ACTIVE,
              (SELECT LISTAGG(r.CODE, ',') WITHIN GROUP (ORDER BY r.CODE)
                 FROM USER_ROLES ur JOIN ROLES r ON r.ROLE_ID = ur.ROLE_ID
                WHERE ur.USER_ID = u.USER_ID) AS ROLES
         FROM APP_USERS u`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    users = ((res.rows || []) as any[]).filter((u) => !scope || scope.includes(String(u.USERNAME).toLowerCase()));
  } finally {
    await conn.close();
  }

  console.log(`Scanning ${users.length} account(s) against ${candidates.length} candidate value(s)...`);
  const matches: typeof users = [];
  for (const u of users) {
    for (const candidate of candidates) {
      if ((await verifyPassword(candidate, u.PASSWORD_HASH)).valid) {
        matches.push(u);
        break;
      }
    }
  }

  console.log(`Accounts using a known-compromised password: ${matches.length}`);
  console.table(matches.map((m) => ({ username: m.USERNAME, active: m.IS_ACTIVE, roles: m.ROLES || '' })));

  if (!rotate || matches.length === 0) {
    if (!rotate && matches.length > 0) console.log('Report only. Re-run with --rotate to rotate these accounts.');
    return;
  }

  const issued: Array<{ username: string; temporaryPassword: string; revokedSessions: number }> = [];
  for (const m of matches) {
    const temporaryPassword = generateTemporaryPassword();
    const hash = await hashPassword(temporaryPassword);
    const tx = await getOracleConnection();
    try {
      await userRepository.setCredential(m.USER_ID, hash, 'Y', tx);
      const revokedSessions = await sessionRepository.revokeAllUserSessions(m.USER_ID, tx);
      await systemAuditRepository.recordEvent(
        {
          actorId: null,
          actorRole: 'SYSTEM',
          actorUsername: 'credential-rotation-script',
          action: 'CREDENTIAL_ROTATION',
          resource: 'APP_USERS',
          recordIdentifier: m.USER_ID,
          outcome: 'SUCCESS',
          justification: 'Password matched a known-compromised development credential',
          changes: { revokedSessions, temporaryCredential: true },
        },
        tx
      );
      await tx.commit();
      issued.push({ username: m.USERNAME, temporaryPassword, revokedSessions });
    } catch (err) {
      await tx.rollback();
      throw err;
    } finally {
      await tx.close();
    }
  }

  if (outputPath) {
    fs.writeFileSync(
      outputPath,
      issued.map((i) => `${i.username}\t${i.temporaryPassword}`).join('\n') + '\n',
      { encoding: 'utf8', mode: 0o600 }
    );
    console.log(`Rotated ${issued.length} account(s). One-time temporary credentials written to ${outputPath} (delete after distribution).`);
    console.table(issued.map((i) => ({ username: i.username, revokedSessions: i.revokedSessions })));
  } else {
    console.log(`Rotated ${issued.length} account(s). Temporary credentials (shown once, must be changed at first sign-in):`);
    console.table(issued);
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
