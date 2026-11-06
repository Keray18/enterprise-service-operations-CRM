import { Algorithm, hash } from '@node-rs/argon2';
import { closeOraclePool, getOracleConnection } from '../database/oraclePool.js';
import { ARGON2_OPTIONS, verifyPassword } from '../services/passwordService.js';

interface PasswordTarget {
  name: string;
  username: string;
  newPasswordPlain: string;
}

const TARGETS: PasswordTarget[] = [
  { name: 'Admin', username: 'admin', newPasswordPlain: 'Admin@123' },
  { name: 'Call Center', username: 'callcenter', newPasswordPlain: 'callCenter@123' },
  { name: 'Service Center', username: 'service_center', newPasswordPlain: 'serviceCenter@123' },
  { name: 'Warehouse', username: 'warehouse', newPasswordPlain: 'wareHouse@123' },
  { name: 'Field Engineer', username: 'mumbai_tech_1', newPasswordPlain: 'fieldEng@123' },
];

async function run() {
  console.log('\n========================================================================================');
  console.log('>>> UPDATING PASSWORDS FOR REQUESTED DASHBOARD ACCOUNTS');
  console.log('========================================================================================\n');

  const conn = await getOracleConnection();

  try {
    // Also check if an 'engineer' user exists in addition to 'mumbai_tech_1'
    const engCheck: any = await conn.execute(
      `SELECT USERNAME FROM APP_USERS WHERE LOWER(USERNAME) IN ('engineer', 'field_engineer', 'tech', 'mumbai_tech_1')`,
      [],
      { outFormat: 4002 }
    );
    const existingEngUsernames = (engCheck.rows || []).map((r: any) => r.USERNAME.toLowerCase());
    console.log('Existing engineer accounts in Oracle:', existingEngUsernames);

    // If 'engineer' exists as well, add it to targets so both are updated
    if (existingEngUsernames.includes('engineer') && !TARGETS.some((t) => t.username === 'engineer')) {
      TARGETS.push({ name: 'Field Engineer (Generic)', username: 'engineer', newPasswordPlain: 'fieldEng@123' });
    }

    const summary: any[] = [];

    for (const target of TARGETS) {
      // 1. Hash with Argon2id
      const passwordHash = await hash(target.newPasswordPlain, ARGON2_OPTIONS);

      // 2. Update user
      const updateRes: any = await conn.execute(
        `UPDATE APP_USERS
         SET PASSWORD_HASH = :pwdHash,
             IS_ACTIVE = 'Y',
             FAILED_LOGIN_ATTEMPTS = 0,
             LOCKED_UNTIL = NULL,
             UPDATED_AT = SYSTIMESTAMP
         WHERE LOWER(USERNAME) = LOWER(:username)`,
        { pwdHash: passwordHash, username: target.username },
        { autoCommit: true }
      );

      const updated = (updateRes.rowsAffected || 0) > 0;

      // 3. Invalidate active sessions
      if (updated) {
        await conn.execute(
          `DELETE FROM USER_SESSIONS WHERE USER_ID IN (SELECT USER_ID FROM APP_USERS WHERE LOWER(USERNAME) = LOWER(:username))`,
          { username: target.username },
          { autoCommit: true }
        );
      }

      // 4. Verify round-trip password check
      const userRes: any = await conn.execute(
        `SELECT USER_ID, USERNAME, PASSWORD_HASH, IS_ACTIVE FROM APP_USERS WHERE LOWER(USERNAME) = LOWER(:username)`,
        { username: target.username },
        { outFormat: 4002 }
      );

      let verified = false;
      if (userRes.rows && userRes.rows.length > 0) {
        const storedHash = userRes.rows[0].PASSWORD_HASH;
        const res = await verifyPassword(target.newPasswordPlain, storedHash);
        verified = res.valid;
      }

      summary.push({
        Dashboard: target.name,
        Username: target.username,
        'New Password': target.newPasswordPlain,
        Updated: updated ? 'YES' : 'USER_NOT_FOUND',
        'Argon2id Verified': verified ? 'SUCCESS' : 'FAILED',
      });
    }

    console.table(summary);
    console.log('\n========================================================================================');
    console.log('[SUCCESS] All requested dashboard passwords have been updated and verified in Oracle!');
    console.log('========================================================================================\n');
  } catch (err) {
    console.error('Failed to update passwords:', err);
    process.exit(1);
  } finally {
    await conn.close();
    await closeOraclePool(1);
    process.exit(0);
  }
}

run();

