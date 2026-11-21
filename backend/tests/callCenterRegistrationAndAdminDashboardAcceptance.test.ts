import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeOraclePool, getOracleConnection } from '../src/database/oraclePool.js';
import { brandRepository } from '../src/database/repositories/brandRepository.js';
import { modelRepository } from '../src/database/repositories/modelRepository.js';
import { productRepository } from '../src/database/repositories/productRepository.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { hashPassword } from '../src/services/passwordService.js';

describe('P0/P1 — Call Center Registration Recovery & Admin Dashboard UX Optimization Acceptance', () => {
  const app = createApp();

  const CC_PASSWORD = 'CallCenterPassword123#';
  const ADMIN_PASSWORD = 'AdminPassword123#';

  const ccUserId = crypto.randomUUID();
  const adminUserId = crypto.randomUUID();

  let ccSessionCookie: string;
  let ccCsrfToken: string;
  let adminSessionCookie: string;
  let adminCsrfToken: string;

  let activeBrandId: string;
  let activeProductId: string;
  let activeModelId: string;
  let validSerialNumber: string;

  // Delhi Geography seeded via V024
  const DELHI_STATE_ID = '00000000-0000-0000-0004-000000000002';
  const NEW_DELHI_CITY_ID = '00000000-0000-0000-0005-000000000003';
  const PARYAVARAN_PINCODE = '110017';

  beforeAll(async () => {
    // 1. Create and authenticate Call Center User
    const ccHash = await hashPassword(CC_PASSWORD);
    await userRepository.createUser({
      userId: ccUserId,
      username: `cc_p0_${Date.now().toString(36)}`,
      email: `cc_p0_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Call Center Agent P0',
      passwordHash: ccHash,
    });
    await rbacRepository.assignRoleToUser(ccUserId, 'CALL_CENTER', 'SETUP');

    const ccLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: (await userRepository.findById(ccUserId))!.username, password: CC_PASSWORD });
    expect(ccLogin.status).toBe(200);
    ccSessionCookie = ccLogin.headers['set-cookie'][0];
    ccCsrfToken = ccLogin.body.data.csrfToken;

    // 2. Create and authenticate Admin User
    const adminHash = await hashPassword(ADMIN_PASSWORD);
    await userRepository.createUser({
      userId: adminUserId,
      username: `admin_p0_${Date.now().toString(36)}`,
      email: `admin_p0_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Admin Operations Lead',
      passwordHash: adminHash,
    });
    await rbacRepository.assignRoleToUser(adminUserId, 'ADMIN', 'SETUP');

    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: (await userRepository.findById(adminUserId))!.username, password: ADMIN_PASSWORD });
    expect(adminLogin.status).toBe(200);
    adminSessionCookie = adminLogin.headers['set-cookie'][0];
    adminCsrfToken = adminLogin.body.data.csrfToken;

    // 3. Resolve active Catalog data with job creation allowed
    const brands = await brandRepository.listBrands({ page: 1, limit: 10, isActive: 'Y' });
    activeBrandId = brands.items[0].brandId;

    const products = await productRepository.listProducts({ page: 1, limit: 10, isActive: 'Y' });
    activeProductId = products.items[0].productId;

    const models = await modelRepository.listModels({ brandId: activeBrandId, productId: activeProductId, isActive: 'Y' });
    const allowedModel = models.items.find((m) => m.isJobCreationAllowed === 'Y');
    if (allowedModel) {
      activeModelId = allowedModel.modelId;
    } else {
      const allModels = await modelRepository.listModels({ page: 1, limit: 50, isActive: 'Y' });
      const fallback = allModels.items.find((m) => m.isJobCreationAllowed === 'Y')!;
      activeBrandId = fallback.brandId;
      activeProductId = fallback.productId;
      activeModelId = fallback.modelId;
    }

    const selectedModel = await modelRepository.findById(activeModelId);
    const reqLen = selectedModel?.serialNumberLength || 15;
    validSerialNumber = ('SN' + '12345678901234567890').slice(0, reqLen);
  });

  afterAll(async () => {
    await closeOraclePool();
  });

  // =========================================================================
  // PART A: Call Center Registration P0 Acceptance
  // =========================================================================
  describe('PART A: Fast Call Registration & Indian Mobile Validation', () => {
    it('A1: Pincode 110017 resolves Delhi, New Delhi, and default ASF', async () => {
      const res = await request(app)
        .get(`/api/v1/call-center/serviceability/${PARYAVARAN_PINCODE}`)
        .set('Cookie', ccSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pincode).toBe(PARYAVARAN_PINCODE);
      expect(res.body.data.isServiceable).toBe(true);
      expect(res.body.data.stateId).toBe(DELHI_STATE_ID);
      expect(res.body.data.cityId).toBe(NEW_DELHI_CITY_ID);
      expect(res.body.data.defaultAsfName).toBeDefined();
    });

    it('A2: Rejects registration when primaryMobile starts with 4 (screenshot reproduction: 4567812375)', async () => {
      const res = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .send({
          newCustomer: {
            fullName: 'Rajat',
            primaryMobile: '4567812375',
            customerCategory: 'INDIVIDUAL',
            addressLine: 'Paryavaran Complex',
            stateId: DELHI_STATE_ID,
            cityId: NEW_DELHI_CITY_ID,
            pincode: PARYAVARAN_PINCODE,
            alternateMobile: '',
            email: '',
            landmark: '',
          },
          brandId: activeBrandId,
          productId: activeProductId,
          modelId: activeModelId,
          serialNumber: validSerialNumber,
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          addressLine: 'Paryavaran Complex',
          stateId: DELHI_STATE_ID,
          cityId: NEW_DELHI_CITY_ID,
          pincode: PARYAVARAN_PINCODE,
          idempotencyKey: `FAIL-456-${Date.now()}`,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const mobileIssue = (res.body.error.details || []).find((d: any) => d.field.includes('primaryMobile'));
      expect(mobileIssue?.message).toMatch(/6, 7, 8, or 9/i);
    });

    it('A3: Successfully registers complaint for Rajat with valid Indian mobile 9567812375 and empty optional fields', async () => {
      const uniqueMobile = `95678${Math.floor(10000 + Math.random() * 90000)}`;
      const res = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .send({
          newCustomer: {
            fullName: 'Rajat',
            primaryMobile: uniqueMobile,
            customerCategory: 'INDIVIDUAL',
            addressLine: 'Paryavaran Complex',
            stateId: DELHI_STATE_ID,
            cityId: NEW_DELHI_CITY_ID,
            pincode: PARYAVARAN_PINCODE,
            alternateMobile: '',
            email: '',
            landmark: '',
          },
          brandId: activeBrandId,
          productId: activeProductId,
          modelId: activeModelId,
          serialNumber: validSerialNumber,
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          addressLine: 'Paryavaran Complex',
          stateId: DELHI_STATE_ID,
          cityId: NEW_DELHI_CITY_ID,
          pincode: PARYAVARAN_PINCODE,
          problemDescription: 'Unit display is blank on startup',
          idempotencyKey: `PASS-RAJAT-${Date.now()}`,
        });

      if (res.status !== 201) {
        console.error('A3 FAILED WITH:', JSON.stringify(res.body));
      }
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.serviceRequest.jobNumber).toBeDefined();
      expect(res.body.data.customer.fullName).toBe('Rajat');
      expect(res.body.data.customer.primaryMobile).toBe(uniqueMobile);
      expect(res.body.data.customer.pincode).toBe(PARYAVARAN_PINCODE);
      expect(['REGISTERED', 'ASSIGNED_TO_ASF']).toContain(res.body.data.serviceRequest.status);
    });

    it('A4: Rejects registration when alternateMobile is non-empty but invalid format', async () => {
      const res = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .send({
          newCustomer: {
            fullName: 'Rajat Kumar',
            primaryMobile: '9811122233',
            customerCategory: 'INDIVIDUAL',
            addressLine: 'Paryavaran Complex',
            stateId: DELHI_STATE_ID,
            cityId: NEW_DELHI_CITY_ID,
            pincode: PARYAVARAN_PINCODE,
            alternateMobile: '2345678901', // Invalid Indian mobile
            email: '',
            landmark: '',
          },
          brandId: activeBrandId,
          productId: activeProductId,
          modelId: activeModelId,
          serialNumber: validSerialNumber,
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          addressLine: 'Paryavaran Complex',
          stateId: DELHI_STATE_ID,
          cityId: NEW_DELHI_CITY_ID,
          pincode: PARYAVARAN_PINCODE,
          idempotencyKey: `FAIL-ALT-${Date.now()}`,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      const altIssue = (res.body.error?.details || []).find((d: any) => d.field.includes('alternateMobile'));
      expect(altIssue?.message).toMatch(/alternate mobile/i);
    });

    it('A5: Rejects registration when email is non-empty but invalid format', async () => {
      const res = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .send({
          newCustomer: {
            fullName: 'Rajat Kumar',
            primaryMobile: '9811122233',
            customerCategory: 'INDIVIDUAL',
            addressLine: 'Paryavaran Complex',
            stateId: DELHI_STATE_ID,
            cityId: NEW_DELHI_CITY_ID,
            pincode: PARYAVARAN_PINCODE,
            alternateMobile: '',
            email: 'not-an-email-address',
            landmark: '',
          },
          brandId: activeBrandId,
          productId: activeProductId,
          modelId: activeModelId,
          serialNumber: validSerialNumber,
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          addressLine: 'Paryavaran Complex',
          stateId: DELHI_STATE_ID,
          cityId: NEW_DELHI_CITY_ID,
          pincode: PARYAVARAN_PINCODE,
          idempotencyKey: `FAIL-EMAIL-${Date.now()}`,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      const emailIssue = (res.body.error?.details || []).find((d: any) => d.field.includes('email'));
      expect(emailIssue?.message).toMatch(/email/i);
    });

    it('A6: Rejects registration when stateId and cityId mismatch the authoritative pincode geography', async () => {
      // Maharashtra state ID mismatched with Delhi pincode 110017
      const MAHA_STATE_ID = '00000000-0000-0000-0004-000000000001';
      const MUMBAI_CITY_ID = '00000000-0000-0000-0005-000000000001';

      const res = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .send({
          newCustomer: {
            fullName: 'Rajat Kumar',
            primaryMobile: '9811122233',
            customerCategory: 'INDIVIDUAL',
            addressLine: 'Paryavaran Complex',
            stateId: MAHA_STATE_ID,
            cityId: MUMBAI_CITY_ID,
            pincode: PARYAVARAN_PINCODE,
          },
          brandId: activeBrandId,
          productId: activeProductId,
          modelId: activeModelId,
          serialNumber: validSerialNumber,
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          addressLine: 'Paryavaran Complex',
          stateId: MAHA_STATE_ID,
          cityId: MUMBAI_CITY_ID,
          pincode: PARYAVARAN_PINCODE,
          idempotencyKey: `FAIL-GEO-${Date.now()}`,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('GEOGRAPHY_MISMATCH');
    });
  });

  // =========================================================================
  // PART B: Admin Dashboard & Paginated Workload Acceptance
  // =========================================================================
  describe('PART B: Admin Operations Dashboard & Paginated Workload API', () => {
    it('B1: Admin Dashboard returns exactly 66 operational Active Service Centers excluding test fixtures', async () => {
      const res = await request(app)
        .get('/api/v1/reports/admin/dashboard?period=7d')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      // Active Service Centers must be exactly 66 operational centers
      expect(data.operationalNetwork.totalActiveServiceCenters).toBe(66);
      expect(data.kpis.openBacklog).toBeGreaterThanOrEqual(0);
      expect(data.charts.volumeTrend.length).toBeGreaterThanOrEqual(7);

      // Volume trend has zero-filled daily buckets without missing dates
      for (const bucket of data.charts.volumeTrend) {
        expect(bucket.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(bucket.registered).toBeGreaterThanOrEqual(0);
        expect(bucket.closed).toBeGreaterThanOrEqual(0);
      }

      // SLA Compliance has valid metrics and denominators
      expect(data.charts.slaCompliance.ack48h.totalEligible).toBeGreaterThanOrEqual(0);
      expect(data.charts.slaCompliance.resolution168h.totalClosed).toBeGreaterThanOrEqual(0);
    });

    it('B2: GET /api/v1/reports/admin/service-centers delivers paginated operational workload in standard data envelope', async () => {
      const res = await request(app)
        .get('/api/v1/reports/admin/service-centers?page=1&limit=10&status=ACTIVE')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Contract invariant: res.body.data must contain items and pagination so apiClient unwraps them correctly
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBe(10);

      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.total).toBe(66);
      expect(res.body.data.pagination.totalPages).toBe(7);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(10);

      // Backward compatibility: top-level pagination also present
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBe(66);

      // Inspect first item structure
      const first = res.body.data.items[0];
      expect(first.locationId).toBeDefined();
      expect(first.locationCode).toBeDefined();
      expect(first.locationName).toBeDefined();
      expect(first.assignedOpenJobs).toBeGreaterThanOrEqual(0);
      expect(first.awaitingAck).toBeGreaterThanOrEqual(0);
      expect(first.inProgress).toBeGreaterThanOrEqual(0);
      expect(first.pendingParts).toBeGreaterThanOrEqual(0);
      expect(first.overdueJobs).toBeGreaterThanOrEqual(0);
      expect(first.activeTechnicians).toBeGreaterThanOrEqual(0);
      expect(first.isActive).toBe(true);
    });

    it('B3: Service centers workload supports search filtering by name or code', async () => {
      const res = await request(app)
        .get('/api/v1/reports/admin/service-centers?search=Mumbai&limit=10')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      for (const sc of res.body.data.items) {
        const matches =
          sc.locationName.toLowerCase().includes('mumbai') ||
          sc.locationCode.toLowerCase().includes('mum') ||
          (sc.cityName && sc.cityName.toLowerCase().includes('mumbai'));
        expect(matches).toBe(true);
      }
    });

    it('B4: Service centers workload supports sorting by activeTechnicians descending', async () => {
      const res = await request(app)
        .get('/api/v1/reports/admin/service-centers?sortBy=activeTechnicians&sortDir=desc&limit=10')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThan(0);

      for (let i = 0; i < items.length - 1; i++) {
        expect(items[i].activeTechnicians).toBeGreaterThanOrEqual(items[i + 1].activeTechnicians);
      }
    });

    it('B5: Call Center role is blocked from accessing Admin Service Center Workload endpoint', async () => {
      const res = await request(app)
        .get('/api/v1/reports/admin/service-centers')
        .set('Cookie', ccSessionCookie);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('B6: Returns empty items and zero total for unmatched search without throwing or crashing', async () => {
      const res = await request(app)
        .get('/api/v1/reports/admin/service-centers?search=NonExistentFranchise999XYZ')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
      expect(res.body.data.pagination.totalPages).toBe(1);
    });

    it('B7: Supports larger page sizes (limit=25 and limit=50)', async () => {
      const res25 = await request(app)
        .get('/api/v1/reports/admin/service-centers?page=1&limit=25&status=ACTIVE')
        .set('Cookie', adminSessionCookie);

      expect(res25.status).toBe(200);
      expect(res25.body.data.items.length).toBe(25);
      expect(res25.body.data.pagination.limit).toBe(25);
      expect(res25.body.data.pagination.totalPages).toBe(3); // 66 / 25 = 3 pages

      const res50 = await request(app)
        .get('/api/v1/reports/admin/service-centers?page=1&limit=50&status=ACTIVE')
        .set('Cookie', adminSessionCookie);

      expect(res50.status).toBe(200);
      expect(res50.body.data.items.length).toBe(50);
      expect(res50.body.data.pagination.limit).toBe(50);
      expect(res50.body.data.pagination.totalPages).toBe(2); // 66 / 50 = 2 pages
    });
  });
});
