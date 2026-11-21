import { getOracleConnection } from '../src/database/oracleClient.js';

async function main() {
  const conn = await getOracleConnection();
  try {
    // 1. Inspect Job TTASLE2611124751
    const srRes = await conn.execute(
      `SELECT request_id, job_number, status, customer_id, customer_name, customer_mobile, 
              service_address_line, service_pincode, service_city_id, service_state_id,
              assigned_location_id, assigned_engineer_id, default_asf_fallback_used,
              created_at, updated_at
       FROM service_requests
       WHERE job_number = 'TTASLE2611124751' OR job_number LIKE '%4751%'`,
      {},
      { outFormat: 4001 }
    );
    console.log('--- SERVICE REQUEST ---');
    console.log(JSON.stringify(srRes.rows, null, 2));

    if (srRes.rows && srRes.rows.length > 0) {
      const reqId = (srRes.rows[0] as any).REQUEST_ID;
      // Get events
      const evRes = await conn.execute(
        `SELECT event_id, event_type, from_state, to_state, triggered_by_user_id, remarks, created_at
         FROM service_request_events
         WHERE request_id = :reqId
         ORDER BY created_at ASC`,
        { reqId },
        { outFormat: 4001 }
      );
      console.log('--- EVENTS ---');
      console.log(JSON.stringify(evRes.rows, null, 2));
    }

    // 2. Inspect Pincode 110017 in PINCODES / LOCATIONS / MAPPINGS
    const pinRes = await conn.execute(
      `SELECT p.pincode, p.pincode_id, p.area_name, p.city_id, p.state_id, c.city_name, s.state_name
       FROM pincodes p
       LEFT JOIN cities c ON p.city_id = c.city_id
       LEFT JOIN states s ON p.state_id = s.state_id
       WHERE p.pincode = '110017'`,
      {},
      { outFormat: 4001 }
    );
    console.log('--- PINCODE 110017 ---');
    console.log(JSON.stringify(pinRes.rows, null, 2));

    // 3. Inspect table names related to pincode mappings
    const tabs = await conn.execute(
      `SELECT table_name FROM user_tables WHERE table_name LIKE '%PIN%' OR table_name LIKE '%MAPP%' OR table_name LIKE '%ASF%' OR table_name LIKE '%SERVICE%'`,
      {},
      { outFormat: 4001 }
    );
    console.log('--- TABLES ---');
    console.log(JSON.stringify(tabs.rows, null, 2));

    // 4. Inspect LOCATIONS for Delhi and Ghaziabad
    const locRes = await conn.execute(
      `SELECT location_id, location_code, location_name, location_type, city_id, state_id, is_active
       FROM locations
       WHERE location_code LIKE '%DEL%' OR location_code LIKE '%GZB%' OR location_name LIKE '%Ghaziabad%' OR location_name LIKE '%Delhi%'`,
      {},
      { outFormat: 4001 }
    );
    console.log('--- DELHI & GHAZIABAD LOCATIONS ---');
    console.log(JSON.stringify(locRes.rows, null, 2));

  } finally {
    await conn.close();
  }
}

main().catch(console.error);

