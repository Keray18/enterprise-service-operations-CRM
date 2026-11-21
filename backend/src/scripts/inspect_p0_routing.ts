import oracledb from 'oracledb';
import { getOracleConnection, closeOraclePool } from '../database/oraclePool.js';
import { locationRepository } from '../database/repositories/locationRepository.js';

async function main() {
  const conn = await getOracleConnection();
  try {
    // 1. Inspect Job TTASLE2611124751
    const srRes = await conn.execute(
      `SELECT *
       FROM service_requests
       WHERE job_number = 'TTASLE2611124751' OR job_number LIKE '%4751%'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('--- SERVICE REQUEST ---');
    console.log(JSON.stringify(srRes.rows, null, 2));

    // Check all locations where is_default = 'Y'
    const defLocs = await conn.execute(
      `SELECT location_id, location_code, location_name, is_default, is_active FROM locations WHERE is_default = 'Y'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('--- ALL LOCATIONS WHERE IS_DEFAULT = Y ---');
    console.log(JSON.stringify(defLocs.rows, null, 2));

    // Test locationRepository.findDefaultAsfs
    const defAsfs = await locationRepository.findDefaultAsfs(conn);
    console.log('--- LOCATION_REPOSITORY.FIND_DEFAULT_ASFS ---');
    console.log(JSON.stringify(defAsfs, null, 2));

    // 2. Inspect Assigned Location 00000000-0000-0000-0004-000000000010
    const assignedLoc = await conn.execute(
      `SELECT * FROM locations WHERE location_id = '00000000-0000-0000-0004-000000000010'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('--- ASSIGNED LOCATION 00000000-0000-0000-0004-000000000010 ---');
    console.log(JSON.stringify(assignedLoc.rows, null, 2));

    // 3. Inspect Delhi locations
    const delhiLoc = await conn.execute(
      `SELECT * FROM locations WHERE location_code LIKE '%DEL%' OR location_name LIKE '%Delhi%'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('--- DELHI LOCATIONS ---');
    console.log(JSON.stringify(delhiLoc.rows, null, 2));

    // 4. Inspect Engineer Sumit
    const engSumit = await conn.execute(
      `SELECT u.user_id, u.username, u.full_name, u.location_id, l.location_code, l.location_name
       FROM app_users u
       LEFT JOIN locations l ON u.location_id = l.location_id
       WHERE u.user_id = 'c7a886e8-d1d8-476c-95a0-8594a0ccddfa' OR u.full_name LIKE '%Sumit%' OR u.username LIKE '%sumit%'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('--- ENGINEER SUMIT ---');
    console.log(JSON.stringify(engSumit.rows, null, 2));

    // Get events for TTASLE2611124751
    const evRes = await conn.execute(
      `SELECT event_id, event_type, from_state, to_state, triggered_by_username, triggered_by_role, remarks, created_at
       FROM service_request_events
       WHERE request_id = '8e2576c7-79fc-4916-97e9-0011e7bbbb90'
       ORDER BY created_at ASC`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('--- SERVICE REQUEST EVENTS FOR 8e2576c7-79fc-4916-97e9-0011e7bbbb90 ---');
    console.log(JSON.stringify(evRes.rows, null, 2));

    // Also check all rows in PINCODES table where pincode like '110%' or pincode like '201%'
    const ncrPins = await conn.execute(
      `SELECT p.pincode, p.pincode_id, p.state_id, p.city_id, p.default_asf_id, p.is_serviceable, l.location_code, l.location_name
       FROM pincodes p
       LEFT JOIN locations l ON p.default_asf_id = l.location_id
       WHERE p.pincode IN ('110017', '110001', '201001', '201002', '122001', '121001')
       ORDER BY p.pincode`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('--- NCR PINCODES MAPPINGS ---');
    console.log(JSON.stringify(ncrPins.rows, null, 2));

    // 5. Inspect CUSTOMER_FEEDBACK
    const cfCols = await conn.execute(
      `SELECT column_name, data_type, nullable, data_default FROM user_tab_cols WHERE table_name = 'CUSTOMER_FEEDBACK' ORDER BY column_id`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('--- CUSTOMER_FEEDBACK COLUMNS ---');
    console.log(JSON.stringify(cfCols.rows, null, 2));

    const cfCount = await conn.execute(
      `SELECT COUNT(*) AS CNT FROM CUSTOMER_FEEDBACK`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('--- CUSTOMER_FEEDBACK COUNT ---');
    console.log(JSON.stringify(cfCount.rows, null, 2));
    // 6. Inspect SERVICE_REQUESTS status constraints
    const srConstraints = await conn.execute(
      `SELECT constraint_name, search_condition_vc FROM user_constraints WHERE table_name = 'SERVICE_REQUESTS' AND constraint_type = 'C'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('--- SERVICE_REQUESTS CONSTRAINTS ---');
    console.log(JSON.stringify(srConstraints.rows, null, 2));
  } finally {
    await conn.close();
    await closeOraclePool();
  }
}

main().catch(console.error);
