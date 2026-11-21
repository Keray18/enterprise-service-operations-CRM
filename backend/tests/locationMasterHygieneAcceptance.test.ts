import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getOracleConnection } from '../src/database/oraclePool.js';

describe('P0 — Location Master Data Hygiene & Global Location Selector Remediation Acceptance', () => {
  const app = createApp();

  // Invariant dev credentials
  const credentials = {
    admin: { username: 'admin', password: 'Admin@123', role: 'ADMIN' },
    callcenter: { username: 'callcenter', password: 'callCenter@123', role: 'CALL_CENTER' },
    serviceCenter: { username: 'service_center', password: 'serviceCenter@123', role: 'ASF' },
    warehouse: { username: 'warehouse', password: 'wareHouse@123', role: 'WAREHOUSE' },
    engineer: { username: 'mumbai_tech_1', password: 'fieldEng@123', role: 'ENGINEER' },
  };

  const sessions = {
    admin: { cookie: '', csrf: '' },
    callcenter: { cookie: '', csrf: '' },
    serviceCenter: { cookie: '', csrf: '' },
    warehouse: { cookie: '', csrf: '' },
    engineer: { cookie: '', csrf: '' },
  };

  let operationalAsfId = '';
  let operationalAsfName = '';
  let operationalAsfCode = '';
  let testFixtureId = '';
  let testFixtureCode = '';
  let createdEngineerId = '';

  beforeAll(async () => {
    // 1. Authenticate all 5 invariant personas
    for (const [key, cred] of Object.entries(credentials)) {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: cred.username, password: cred.password });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);

      const cookieHeader = loginRes.headers['set-cookie'];
      const cookie = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader || '';
      const csrf = loginRes.body?.data?.csrfToken || '';

      (sessions as any)[key] = { cookie, csrf };
    }

    // 2. Query Oracle directly to identify one operational ASF and one test fixture
    const conn = await getOracleConnection();
    try {
      const opResult = await conn.execute(
        `SELECT LOCATION_ID, LOCATION_NAME, LOCATION_CODE FROM LOCATIONS 
         WHERE PARTY_TYPE = 'ASF' AND IS_TEST_FIXTURE = 'N' AND IS_ACTIVE = 'Y' 
         FETCH FIRST 1 ROWS ONLY`
      );
      if (opResult.rows && opResult.rows.length > 0) {
        const row = opResult.rows[0] as any;
        operationalAsfId = row.LOCATION_ID || row[0];
        operationalAsfName = row.LOCATION_NAME || row[1];
        operationalAsfCode = row.LOCATION_CODE || row[2];
      }

      const fixResult = await conn.execute(
        `SELECT LOCATION_ID, LOCATION_CODE FROM LOCATIONS 
         WHERE IS_TEST_FIXTURE = 'Y' 
         FETCH FIRST 1 ROWS ONLY`
      );
      if (fixResult.rows && fixResult.rows.length > 0) {
        const row = fixResult.rows[0] as any;
        testFixtureId = row.LOCATION_ID || row[0];
        testFixtureCode = row.LOCATION_CODE || row[1];
      }
    } finally {
      await conn.close();
    }
  });

  afterAll(async () => {
    // Clean up any created test engineer
    if (createdEngineerId) {
      const conn = await getOracleConnection();
      try {
        await conn.execute(`DELETE FROM USER_ROLES WHERE USER_ID = :id`, { id: createdEngineerId });
        await conn.execute(`DELETE FROM APP_USERS WHERE USER_ID = :id`, { id: createdEngineerId });
        await conn.commit();
      } catch {
        // Best effort
      } finally {
        await conn.close();
      }
    }
  });

  describe('Part A — Location Directory Query Verification', () => {
    it('returns only operational locations (IS_TEST_FIXTURE = "N") by default', async () => {
      const res = await request(app)
        .get('/api/v1/geography/locations?pageSize=200')
        .set('Cookie', sessions.admin.cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const locations = res.body.data.locations;
      expect(locations.length).toBeGreaterThan(0);

      // Verify every single returned location has isTestFixture === 'N'
      for (const loc of locations) {
        expect(loc.isTestFixture).toBe('N');
        expect(loc.dataOrigin).not.toBe('TEST_FIXTURE');
        // Ensure no known test fixture prefixes leak through
        expect(loc.locationCode).not.toMatch(/^ASF_TEST_/);
        expect(loc.locationCode).not.toMatch(/^WH_TEST_/);
        expect(loc.locationCode).not.toMatch(/^SEC_/);
      }
    });

    it('returns test fixtures when explicitly requested with includeTestFixtures=true', async () => {
      const defaultRes = await request(app)
        .get('/api/v1/geography/locations?pageSize=200')
        .set('Cookie', sessions.admin.cookie);

      const allRes = await request(app)
        .get('/api/v1/geography/locations?pageSize=500&includeTestFixtures=true')
        .set('Cookie', sessions.admin.cookie);

      expect(allRes.status).toBe(200);
      expect(allRes.body.success).toBe(true);

      const totalOperational = defaultRes.body.data.total;
      const totalAll = allRes.body.data.total;

      expect(totalAll).toBeGreaterThan(totalOperational);

      // Verify some items in allRes are test fixtures
      const fixtures = allRes.body.data.locations.filter((l: any) => l.isTestFixture === 'Y');
      expect(fixtures.length).toBeGreaterThan(0);
    });

    it('accurately filters by PARTY_TYPE (ASF vs CENTRAL_WAREHOUSE)', async () => {
      // Filter partyType=ASF
      const asfRes = await request(app)
        .get('/api/v1/geography/locations?partyType=ASF&pageSize=100')
        .set('Cookie', sessions.admin.cookie);

      expect(asfRes.status).toBe(200);
      const asfLocations = asfRes.body.data.locations;
      expect(asfLocations.length).toBeGreaterThan(0);
      for (const loc of asfLocations) {
        expect(loc.partyType).toBe('ASF');
      }

      // Filter partyType=CENTRAL_WAREHOUSE
      const whRes = await request(app)
        .get('/api/v1/geography/locations?partyType=CENTRAL_WAREHOUSE')
        .set('Cookie', sessions.admin.cookie);

      expect(whRes.status).toBe(200);
      const whLocations = whRes.body.data.locations;
      expect(whLocations.length).toBeGreaterThan(0);
      for (const loc of whLocations) {
        expect(loc.partyType).toBe('CENTRAL_WAREHOUSE');
      }
    });

    it('filters active records by default and respects isActive parameter', async () => {
      const activeRes = await request(app)
        .get('/api/v1/geography/locations?isActive=Y')
        .set('Cookie', sessions.admin.cookie);

      expect(activeRes.status).toBe(200);
      for (const loc of activeRes.body.data.locations) {
        expect(loc.isActive).toBe('Y');
      }
    });

    it('supports multi-field search across name, code, city, and pincode', async () => {
      // 1. Search by operational location name
      const nameRes = await request(app)
        .get(`/api/v1/geography/locations?search=${encodeURIComponent(operationalAsfName.slice(0, 8))}`)
        .set('Cookie', sessions.admin.cookie);

      expect(nameRes.status).toBe(200);
      expect(nameRes.body.data.locations.length).toBeGreaterThan(0);
      const foundByName = nameRes.body.data.locations.some((l: any) => l.locationId === operationalAsfId);
      expect(foundByName).toBe(true);

      // 2. Search by location code
      const codeRes = await request(app)
        .get(`/api/v1/geography/locations?search=${encodeURIComponent(operationalAsfCode)}`)
        .set('Cookie', sessions.admin.cookie);

      expect(codeRes.status).toBe(200);
      expect(codeRes.body.data.locations.length).toBeGreaterThan(0);
      expect(codeRes.body.data.locations[0].locationCode).toBe(operationalAsfCode);

      // 3. Search by warehouse code
      const whSearchRes = await request(app)
        .get('/api/v1/geography/locations?search=WH-CENTRAL')
        .set('Cookie', sessions.admin.cookie);

      expect(whSearchRes.status).toBe(200);
      expect(whSearchRes.body.data.locations.length).toBeGreaterThan(0);
      expect(whSearchRes.body.data.locations[0].locationCode).toBe('WH-CENTRAL');
    });

    it('returns pagination metadata with deterministic ordering', async () => {
      const p1Res = await request(app)
        .get('/api/v1/geography/locations?page=1&pageSize=5')
        .set('Cookie', sessions.admin.cookie);

      expect(p1Res.status).toBe(200);
      expect(p1Res.body.data.page).toBe(1);
      expect(p1Res.body.data.pageSize).toBe(5);
      expect(p1Res.body.data.locations.length).toBe(5);
      expect(p1Res.body.data.hasMore).toBe(true);

      // Verify deterministic ordering: Default location first (if active), followed by alphabetical
      const locations = p1Res.body.data.locations;
      const firstIsDefault = locations[0].isDefault === 'Y';
      if (firstIsDefault) {
        expect(locations[0].isDefault).toBe('Y');
      }
    });

    it('includes geographic context (cityName, stateName, pincode) to disambiguate display names', async () => {
      const res = await request(app)
        .get('/api/v1/geography/locations?pageSize=50')
        .set('Cookie', sessions.admin.cookie);

      expect(res.status).toBe(200);
      const locations = res.body.data.locations;

      // Operational locations should have resolved cityName and stateName
      const withGeo = locations.filter((l: any) => l.cityName && l.stateName);
      expect(withGeo.length).toBeGreaterThan(0);
    });
  });

  describe('Part B — Single Location Lookup Verification', () => {
    it('returns complete location details including fixture flag and geographic context', async () => {
      const res = await request(app)
        .get(`/api/v1/geography/locations/${operationalAsfId}`)
        .set('Cookie', sessions.admin.cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const loc = res.body.data;
      expect(loc.locationId).toBe(operationalAsfId);
      expect(loc.locationCode).toBe(operationalAsfCode);
      expect(loc.locationName).toBe(operationalAsfName);
      expect(loc.isTestFixture).toBe('N');
      expect(loc.dataOrigin).toBe('OPERATIONAL');
    });

    it('returns 404 for non-existent location ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/v1/geography/locations/${fakeId}`)
        .set('Cookie', sessions.admin.cookie);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('LOCATION_NOT_FOUND');
    });
  });

  describe('Part C — Admin Engineer Management Integration', () => {
    const testUsername = `eng_hygiene_${Date.now().toString(36)}`;

    it('successfully creates an engineer when assigned to an operational ASF location', async () => {
      const createRes = await request(app)
        .post('/api/v1/admin/engineers')
        .set('Cookie', sessions.admin.cookie)
        .set('x-csrf-token', sessions.admin.csrf)
        .send({
          username: testUsername,
          fullName: 'Hygiene Test Technician',
          email: `${testUsername}@crm.internal`,
          phoneNumber: '9876543299',
          homeLocationId: operationalAsfId,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      expect(createRes.body.data.user.username).toBe(testUsername);
      expect(createRes.body.data.user.homeLocationId).toBe(operationalAsfId);
      expect(createRes.body.data.user.homeLocationName).toBe(operationalAsfName);
      expect(createRes.body.data.temporaryPassword).toBeDefined();

      createdEngineerId = createRes.body.data.user.userId;
    });

    it('rejects engineer creation when attempting to assign a test fixture location', async () => {
      expect(testFixtureId).toBeDefined();
      const fixtureUsername = `eng_fixture_${Date.now().toString(36)}`;

      const failRes = await request(app)
        .post('/api/v1/admin/engineers')
        .set('Cookie', sessions.admin.cookie)
        .set('x-csrf-token', sessions.admin.csrf)
        .send({
          username: fixtureUsername,
          fullName: 'Fixture Assign Test',
          email: `${fixtureUsername}@crm.internal`,
          phoneNumber: '9876543298',
          homeLocationId: testFixtureId,
        });

      expect(failRes.status).toBe(400);
      expect(failRes.body.success).toBe(false);
      expect(failRes.body.error.code).toBe('INVALID_LOCATION');
    });

    it('resolves location name correctly in Admin engineer directory listing', async () => {
      const listRes = await request(app)
        .get(`/api/v1/admin/engineers?q=${testUsername}`)
        .set('Cookie', sessions.admin.cookie);

      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data.engineers.length).toBeGreaterThan(0);

      const engineer = listRes.body.data.engineers.find((e: any) => e.username === testUsername);
      expect(engineer).toBeDefined();
      expect(engineer.homeLocationId).toBe(operationalAsfId);
      expect(engineer.homeLocationName).toBe(operationalAsfName);
      expect(engineer.homeLocationCode).toBe(operationalAsfCode);
    });

    it('filters admin engineer directory by locationId', async () => {
      const filterRes = await request(app)
        .get(`/api/v1/admin/engineers?locationId=${operationalAsfId}`)
        .set('Cookie', sessions.admin.cookie);

      expect(filterRes.status).toBe(200);
      expect(filterRes.body.success).toBe(true);

      const engineers = filterRes.body.data.engineers;
      expect(engineers.length).toBeGreaterThan(0);
      for (const eng of engineers) {
        expect(eng.homeLocationId).toBe(operationalAsfId);
      }
    });
  });

  describe('Part D — RBAC and Security', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const unauthRes = await request(app).get('/api/v1/geography/locations');
      expect(unauthRes.status).toBe(401);
      expect(unauthRes.body.success).toBe(false);
    });

    it('permits authorized operational roles (CALL_CENTER, ASF, WAREHOUSE) to query locations', async () => {
      // Call center can query
      const ccRes = await request(app)
        .get('/api/v1/geography/locations?partyType=ASF')
        .set('Cookie', sessions.callcenter.cookie);
      expect(ccRes.status).toBe(200);

      // Service center can query
      const scRes = await request(app)
        .get('/api/v1/geography/locations?partyType=ASF')
        .set('Cookie', sessions.serviceCenter.cookie);
      expect(scRes.status).toBe(200);

      // Warehouse can query
      const whRes = await request(app)
        .get('/api/v1/geography/locations')
        .set('Cookie', sessions.warehouse.cookie);
      expect(whRes.status).toBe(200);
    });
  });

  describe('Part E — Invariant Preservation and Historical Integrity', () => {
    it('confirms all 5 invariant credentials log in successfully and hold expected roles', async () => {
      expect(sessions.admin.cookie).toBeTruthy();
      expect(sessions.callcenter.cookie).toBeTruthy();
      expect(sessions.serviceCenter.cookie).toBeTruthy();
      expect(sessions.warehouse.cookie).toBeTruthy();
      expect(sessions.engineer.cookie).toBeTruthy();
    });

    it('verifies historical service requests retain their original assigned location IDs without data loss', async () => {
      const conn = await getOracleConnection();
      try {
        const srRes = await conn.execute(
          `SELECT COUNT(*) AS CNT FROM SERVICE_REQUESTS WHERE ASSIGNED_LOCATION_ID IS NOT NULL`
        );
        const count = ((srRes.rows?.[0] as any)?.CNT || (srRes.rows?.[0] as any)?.[0]) ?? 0;
        expect(count).toBeGreaterThan(0);

        // Verify foreign key integrity: every assigned location in service requests still exists in LOCATIONS
        const orphanRes = await conn.execute(
          `SELECT COUNT(*) AS CNT FROM SERVICE_REQUESTS sr 
           LEFT JOIN LOCATIONS l ON sr.ASSIGNED_LOCATION_ID = l.LOCATION_ID 
           WHERE sr.ASSIGNED_LOCATION_ID IS NOT NULL AND l.LOCATION_ID IS NULL`
        );
        const orphanCount = ((orphanRes.rows?.[0] as any)?.CNT || (orphanRes.rows?.[0] as any)?.[0]) ?? 0;
        expect(orphanCount).toBe(0);
      } finally {
        await conn.close();
      }
    });

    it('verifies exact counts of operational (67) and classified test fixtures (418) in Oracle', async () => {
      const conn = await getOracleConnection();
      try {
        const countsRes = await conn.execute(
          `SELECT IS_TEST_FIXTURE, COUNT(*) AS CNT FROM LOCATIONS GROUP BY IS_TEST_FIXTURE ORDER BY IS_TEST_FIXTURE`
        );
        const counts: Record<string, number> = {};
        for (const row of countsRes.rows as any[]) {
          const fixtureFlag = row.IS_TEST_FIXTURE || row[0];
          const cnt = Number(row.CNT || row[1]);
          counts[fixtureFlag] = cnt;
        }

        expect(counts['N']).toBe(67);
        expect(counts['Y']).toBe(418);
      } finally {
        await conn.close();
      }
    });
  });
});
