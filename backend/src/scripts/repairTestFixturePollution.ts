import oracledb from 'oracledb';
import { closeOraclePool, getOracleConnection } from '../database/oraclePool.js';
import { isTestFixtureLocationCode } from '../database/repositories/locationRepository.js';

/**
 * Repairs shared development-database state corrupted by automated test runs.
 *
 *  1. Locations created by test suites after V023 that were left classified as OPERATIONAL
 *     (the repository's fixture rules lagged behind V023) are reclassified as TEST_FIXTURE
 *     using exactly the V023 code rules, plus the partsAndGeography fixture pattern
 *     (CREATED_BY = 'SETUP', 'Regional Service Center NNNN').
 *     Rows flagged IS_DEFAULT = 'Y' are never reclassified.
 *  2. Restores the documented default Service Center invariant from V022
 *     (ASF_8441 is the single IS_DEFAULT ASF) when an aborted test left another default.
 *  3. Restores the V029 invariant: accounts whose only roles are removed roles
 *     (INFRA_OPS, FINANCE, BRAND, DISTRIBUTOR) are inactive with no live sessions
 *     (an earlier UAT suite re-enabled them).
 *
 * Report-only by default; pass --apply to write. Development/test databases only.
 */
async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Refusing to run against a production environment.');
  }
  const apply = process.argv.includes('--apply');
  const conn = await getOracleConnection();
  try {
    const v023 = await conn.execute<any>(
      `SELECT INSTALLED_ON FROM CRM_SCHEMA_HISTORY WHERE VERSION = '023' AND SUCCESS = 'Y'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const v023At: Date | undefined = v023.rows?.[0]?.INSTALLED_ON;
    if (!v023At) throw new Error('V023 has not been applied; nothing to repair.');

    const candidates = await conn.execute<any>(
      `SELECT LOCATION_ID, LOCATION_CODE, LOCATION_NAME, CREATED_BY
         FROM LOCATIONS
        WHERE IS_TEST_FIXTURE = 'N' AND DATA_ORIGIN = 'OPERATIONAL' AND IS_DEFAULT = 'N'
          AND CREATED_AT > :v023At`,
      { v023At },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const toReclassify = (candidates.rows || []).filter(
      (r: any) =>
        isTestFixtureLocationCode(String(r.LOCATION_CODE).toUpperCase()) ||
        (r.CREATED_BY === 'SETUP' && /^Regional Service Center \d{4}$/.test(String(r.LOCATION_NAME)) && /^ASF_\d{4}$/.test(String(r.LOCATION_CODE)))
    );
    console.log(`Locations created by tests after V023 still classified OPERATIONAL: ${toReclassify.length}`);

    const defaults = await conn.execute<any>(
      `SELECT LOCATION_ID, LOCATION_CODE FROM LOCATIONS WHERE IS_DEFAULT = 'Y'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const defaultCodes = (defaults.rows || []).map((r: any) => String(r.LOCATION_CODE));
    const defaultNeedsRepair = !(defaultCodes.length === 1 && defaultCodes[0] === 'ASF_8441');
    console.log(`Current default Service Center(s): ${defaultCodes.join(', ') || '(none)'}${defaultNeedsRepair ? '  -> will restore ASF_8441' : '  (ok)'}`);

    const legacyOnly = await conn.execute<any>(
      `SELECT u.USER_ID, u.USERNAME FROM APP_USERS u
        WHERE u.IS_ACTIVE = 'Y'
          AND EXISTS (SELECT 1 FROM USER_ROLES ur JOIN ROLES r ON r.ROLE_ID = ur.ROLE_ID
                       WHERE ur.USER_ID = u.USER_ID AND r.CODE IN ('INFRA_OPS','FINANCE','BRAND','DISTRIBUTOR'))
          AND NOT EXISTS (SELECT 1 FROM USER_ROLES ur JOIN ROLES r ON r.ROLE_ID = ur.ROLE_ID
                           WHERE ur.USER_ID = u.USER_ID AND r.IS_ACTIVE = 'Y')`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const legacyRows = (legacyOnly.rows || []) as Array<{ USER_ID: string; USERNAME: string }>;
    console.log(`Active accounts holding only removed roles (V029 invariant): ${legacyRows.length}${legacyRows.length ? ' -> ' + legacyRows.map((r) => r.USERNAME).join(', ') : ''}`);

    if (!apply) {
      console.log('Report only. Re-run with --apply to repair.');
      return;
    }

    for (const r of legacyRows) {
      await conn.execute(`UPDATE APP_USERS SET IS_ACTIVE = 'N', UPDATED_AT = SYSTIMESTAMP WHERE USER_ID = :id`, { id: r.USER_ID });
      await conn.execute(`UPDATE USER_SESSIONS SET REVOKED_AT = SYSTIMESTAMP WHERE USER_ID = :id AND REVOKED_AT IS NULL`, { id: r.USER_ID });
    }

    let reclassified = 0;
    for (const r of toReclassify) {
      const res = await conn.execute(
        `UPDATE LOCATIONS SET IS_TEST_FIXTURE = 'Y', DATA_ORIGIN = 'TEST_FIXTURE', UPDATED_AT = SYSTIMESTAMP
          WHERE LOCATION_ID = :id AND IS_DEFAULT = 'N'`,
        { id: r.LOCATION_ID }
      );
      reclassified += res.rowsAffected || 0;
    }
    if (defaultNeedsRepair) {
      const target = await conn.execute<any>(
        `SELECT COUNT(*) AS C FROM LOCATIONS WHERE LOCATION_CODE = 'ASF_8441' AND PARTY_TYPE = 'ASF' AND IS_ACTIVE = 'Y'`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (Number(target.rows?.[0]?.C || 0) === 1) {
        await conn.execute(`UPDATE LOCATIONS SET IS_DEFAULT = 'N' WHERE IS_DEFAULT = 'Y' AND LOCATION_CODE <> 'ASF_8441'`);
        await conn.execute(`UPDATE LOCATIONS SET IS_DEFAULT = 'Y' WHERE LOCATION_CODE = 'ASF_8441'`);
      } else {
        console.log('ASF_8441 is not a single active ASF location; default left unchanged.');
      }
    }
    await conn.commit();
    console.log(`Reclassified ${reclassified} location(s) as TEST_FIXTURE.${defaultNeedsRepair ? ' Default Service Center restored to ASF_8441.' : ''} Deactivated ${legacyRows.length} removed-role account(s).`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
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
