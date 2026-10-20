import oracledb from 'oracledb';
import { closeOraclePool, getOracleConnection } from '../database/oraclePool.js';

export async function listUsers(): Promise<void> {
  const conn = await getOracleConnection();
  try {
    const sql = `
      SELECT 
        u.USER_ID,
        u.USERNAME,
        u.EMAIL,
        u.FULL_NAME,
        u.IS_ACTIVE,
        r.CODE AS ROLE_CODE,
        r.NAME AS ROLE_NAME,
        u.CREATED_AT
      FROM APP_USERS u
      LEFT JOIN USER_ROLES ur ON u.USER_ID = ur.USER_ID
      LEFT JOIN ROLES r ON ur.ROLE_ID = r.ROLE_ID
      ORDER BY u.CREATED_AT ASC
    `;

    const result = await conn.execute<any>(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });

    console.log(`\n========================================================================================`);
    console.log(`>>> CRM SYSTEM USERS & ROLE ASSIGNMENTS`);
    console.log(`----------------------------------------------------------------------------------------`);

    if (!result.rows || result.rows.length === 0) {
      console.log('No users found in database.');
    } else {
      console.table(
        result.rows.map((row: any) => ({
          Username: row.USERNAME,
          Role: row.ROLE_CODE || 'NONE',
          'Full Name': row.FULL_NAME,
          Email: row.EMAIL,
          Active: row.IS_ACTIVE,
        }))
      );
    }

    console.log(`========================================================================================\n`);
  } finally {
    await conn.close();
    await closeOraclePool();
  }
}

if (process.argv[1]?.includes('listUsers')) {
  listUsers().catch((err) => {
    console.error('Failed to list users:', err.message);
    process.exit(1);
  });
}
