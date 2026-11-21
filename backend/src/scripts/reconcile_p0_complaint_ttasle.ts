import oracledb from 'oracledb';
import { getOracleConnection, closeOraclePool } from '../database/oraclePool.js';
import { asfService } from '../services/asfService.js';
import { userRepository } from '../database/repositories/userRepository.js';

async function main() {
  const conn = await getOracleConnection();
  try {
    const adminUser = await userRepository.findByUsernameOrEmail('admin');
    if (!adminUser) throw new Error('Admin user not found');

    const srRes = await conn.execute<any>(
      `SELECT REQUEST_ID, JOB_NUMBER, ASSIGNED_LOCATION_ID, ASSIGNED_ENGINEER_ID, STATUS, APPOINTMENT_DATE, APPOINTMENT_SLOT
       FROM SERVICE_REQUESTS
       WHERE JOB_NUMBER = 'TTASLE2611124751'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (!srRes.rows || srRes.rows.length === 0) {
      console.log('Complaint TTASLE2611124751 not found');
      return;
    }

    const row = srRes.rows[0];
    console.log('Before Reassignment:', row);

    // Reassign to Delhi Franchise Service Center (00000000-0000-0000-0004-000000000012)
    const result = await asfService.reassignComplaint(
      {
        requestId: row.REQUEST_ID,
        newLocationId: '00000000-0000-0000-0004-000000000012',
        remarks: 'P0 Audit: Reassigned to Delhi Franchise Service Center to match customer pincode 110017 and assigned technician home center',
        preserveAssignment: true,
      },
      {
        userId: adminUser.userId,
        username: adminUser.username,
        email: adminUser.email,
        fullName: adminUser.fullName,
        roles: ['ADMIN'],
        permissions: ['*'],
      }
    );

    console.log('Reassignment result message:', result.message);

    // Verify after reassignment
    const verifyRes = await conn.execute<any>(
      `SELECT sr.REQUEST_ID, sr.JOB_NUMBER, sr.ASSIGNED_LOCATION_ID, l.LOCATION_CODE, l.LOCATION_NAME,
              sr.ASSIGNED_ENGINEER_ID, u.FULL_NAME AS ENGINEER_NAME, sr.STATUS, sr.APPOINTMENT_DATE, sr.APPOINTMENT_SLOT
       FROM SERVICE_REQUESTS sr
       JOIN LOCATIONS l ON sr.ASSIGNED_LOCATION_ID = l.LOCATION_ID
       LEFT JOIN APP_USERS u ON sr.ASSIGNED_ENGINEER_ID = u.USER_ID
       WHERE sr.JOB_NUMBER = 'TTASLE2611124751'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    console.log('After Reassignment in Oracle:', JSON.stringify(verifyRes.rows, null, 2));
  } finally {
    await conn.close();
    await closeOraclePool();
  }
}

main().catch(console.error);
