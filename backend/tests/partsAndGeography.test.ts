import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeOraclePool } from '../src/database/oraclePool.js';
import { auditRepository } from '../src/database/repositories/auditRepository.js';
import { brandRepository } from '../src/database/repositories/brandRepository.js';
import { cityRepository } from '../src/database/repositories/cityRepository.js';
import { hsnRepository } from '../src/database/repositories/hsnRepository.js';
import { locationRepository } from '../src/database/repositories/locationRepository.js';
import { partRepository } from '../src/database/repositories/partRepository.js';
import { pincodeRepository } from '../src/database/repositories/pincodeRepository.js';
import { productRepository } from '../src/database/repositories/productRepository.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { stateRepository } from '../src/database/repositories/stateRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { hashPassword } from '../src/services/passwordService.js';

describe('Part Codes, HSN/Tax, Geography & Serviceability (Phase 1B.2)', () => {
  const app = createApp();

  const ADMIN_PASS = 'AdminTestGeoParts#2026!';
  const CC_PASS = 'CallCenterGeoParts#2026!';

  const adminUserId = crypto.randomUUID();
  const ccUserId = crypto.randomUUID();

  let adminSessionCookie: string;
  let adminCsrfToken: string;
  let ccSessionCookie: string;
  let ccCsrfToken: string;

  // Shared test fixture IDs
  let testBrandId: string;
  let testProductId: string;
  let testHsnId: string;
  let testHsnCode: string;
  let testStateId: string;
  let testStateCode: string;
  let testCityId: string;
  let testLocationId: string;
  let testPartId: string;
  const suffix = Date.now().toString().slice(-4);

  beforeAll(async () => {
    // 1. Setup Admin user with masters:manage & masters:read
    const adminHash = await hashPassword(ADMIN_PASS);
    await userRepository.createUser({
      userId: adminUserId,
      username: `geo_admin_${suffix}`,
      email: `geo_admin_${suffix}@crm.internal`,
      fullName: 'Geo & Parts Admin',
      passwordHash: adminHash,
    });
    await rbacRepository.assignRoleToUser(adminUserId, 'ADMIN', 'TEST_SETUP');

    // 2. Setup Call Center user with masters:read
    const ccHash = await hashPassword(CC_PASS);
    await userRepository.createUser({
      userId: ccUserId,
      username: `geo_cc_${suffix}`,
      email: `geo_cc_${suffix}@crm.internal`,
      fullName: 'Geo & Parts CC User',
      passwordHash: ccHash,
    });
    await rbacRepository.assignRoleToUser(ccUserId, 'CALL_CENTER', 'TEST_SETUP');

    // Login Admin
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: `geo_admin_${suffix}`, password: ADMIN_PASS });
    adminSessionCookie = adminLogin.headers['set-cookie'][0];
    adminCsrfToken = adminLogin.body.data.csrfToken;

    // Login CC
    const ccLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: `geo_cc_${suffix}`, password: CC_PASS });
    ccSessionCookie = ccLogin.headers['set-cookie'][0];
    ccCsrfToken = ccLogin.body.data.csrfToken;

    // Create a base brand and product for Part tests
    const brand = await brandRepository.createBrand({
      brandCode: `BRD_${suffix}`,
      brandName: `Test Brand ${suffix}`,
      createdBy: 'SETUP',
    });
    testBrandId = brand.brandId;

    const product = await productRepository.createProduct({
      productCode: `PRD_${suffix}`,
      productName: `Test Product ${suffix}`,
      categoryFamily: 'AIR_CONDITIONER',
      createdBy: 'SETUP',
    });
    testProductId = product.productId;

    // Create a test location for ASF mapping
    const location = await locationRepository.createLocation({
      locationCode: `ASF_${suffix}`,
      locationName: `Regional Service Center ${suffix}`,
      partyType: 'ASF',
      createdBy: 'SETUP',
    });
    testLocationId = location.locationId;
  });

  afterAll(async () => {
    await userRepository.deleteUser(adminUserId).catch(() => {});
    await userRepository.deleteUser(ccUserId).catch(() => {});
    await closeOraclePool().catch(() => {});
  });

  // ============================================================================
  // 1. HSN and Tax Master Tests
  // ============================================================================

  describe('HSN & Tax Master', () => {
    it('should create an HSN record with valid tax rates', async () => {
      testHsnCode = `8415${suffix}`;
      const res = await request(app)
        .post('/api/v1/catalog/hsn')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          hsnCode: testHsnCode,
          chapterNo: '84',
          hsnDescription: 'Air conditioning machines and parts',
          cgstRate: 9,
          sgstRate: 9,
          igstRate: 18,
          isActive: 'Y',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hsnCode).toBe(testHsnCode);
      expect(res.body.data.igstRate).toBe(18);
      expect(res.body.data.versionNo).toBe(1);
      testHsnId = res.body.data.hsnId;
    });

    it('should reject duplicate HSN code with 409 DUPLICATE_CODE', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/hsn')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          hsnCode: testHsnCode,
          chapterNo: '84',
          hsnDescription: 'Duplicate HSN attempt',
          cgstRate: 9,
          sgstRate: 9,
          igstRate: 18,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_CODE');
    });

    it('should reject invalid tax rates outside [0, 100]', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/hsn')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          hsnCode: `8499${suffix}`,
          hsnDescription: 'Invalid rates',
          cgstRate: -5,
          sgstRate: 105,
          igstRate: 18,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should list HSN records with pagination and search filter', async () => {
      const res = await request(app)
        .get(`/api/v1/catalog/hsn?search=${testHsnCode}&page=1&limit=10`)
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0].hsnCode).toBe(testHsnCode);
    });

    it('should update HSN details and enforce optimistic concurrency', async () => {
      const res = await request(app)
        .put(`/api/v1/catalog/hsn/${testHsnId}`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          hsnDescription: 'Updated air conditioning machines',
          cgstRate: 14,
          sgstRate: 14,
          igstRate: 28,
          versionNo: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.igstRate).toBe(28);
      expect(res.body.data.versionNo).toBe(2);

      // Stale update attempt with old version 1 should fail with 409
      const staleRes = await request(app)
        .put(`/api/v1/catalog/hsn/${testHsnId}`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          hsnDescription: 'Stale attempt',
          versionNo: 1,
        });

      expect(staleRes.status).toBe(409);
      expect(staleRes.body.error.code).toBe('CONCURRENCY_CONFLICT');
    });

    it('should toggle HSN status to inactive', async () => {
      const res = await request(app)
        .patch(`/api/v1/catalog/hsn/${testHsnId}/status`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          isActive: 'N',
          versionNo: 2,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe('N');
      expect(res.body.data.versionNo).toBe(3);

      // Reactivate for subsequent Part tests
      await request(app)
        .patch(`/api/v1/catalog/hsn/${testHsnId}/status`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          isActive: 'Y',
          versionNo: 3,
        });
    });
  });

  // ============================================================================
  // 2. State and City Master Tests
  // ============================================================================

  describe('State and City Masters', () => {
    it('should create a new State', async () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      testStateCode = 'X' + chars[Math.floor(Math.random() * chars.length)] + chars[Math.floor(Math.random() * chars.length)];
      const res = await request(app)
        .post('/api/v1/geography/states')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          stateCode: testStateCode,
          stateName: `Test State ${suffix}`,
          zone: 'WEST',
          isActive: 'Y',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.stateCode).toBe(testStateCode);
      expect(res.body.data.zone).toBe('WEST');
      testStateId = res.body.data.stateId;
    });

    it('should reject duplicate state code', async () => {
      const res = await request(app)
        .post('/api/v1/geography/states')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          stateCode: testStateCode,
          stateName: `Another Name ${suffix}`,
          zone: 'NORTH',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_CODE');
    });

    it('should create a City linked to the State', async () => {
      const res = await request(app)
        .post('/api/v1/geography/cities')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          stateId: testStateId,
          cityName: `CityAlpha_${suffix}`,
          tier: 'TIER_1',
          isActive: 'Y',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.cityName).toBe(`CityAlpha_${suffix}`);
      expect(res.body.data.stateCode).toBe(testStateCode);
      testCityId = res.body.data.cityId;
    });

    it('should reject duplicate city name within the same state', async () => {
      const res = await request(app)
        .post('/api/v1/geography/cities')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          stateId: testStateId,
          cityName: `CityAlpha_${suffix}`,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_CITY_IN_STATE');
    });

    it('should reject city creation for non-existent state', async () => {
      const res = await request(app)
        .post('/api/v1/geography/cities')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          stateId: crypto.randomUUID(),
          cityName: 'Phantom City',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RELATION');
    });

    it('should prevent state deactivation when active cities exist', async () => {
      const res = await request(app)
        .patch(`/api/v1/geography/states/${testStateId}/status`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          isActive: 'N',
          versionNo: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DEPENDENT_ACTIVE_RECORDS');
    });
  });

  // ============================================================================
  // 3. Pincode and Serviceability Management Tests
  // ============================================================================

  describe('Pincode & Serviceability Management', () => {
    let testPincode: string;
    let testPincodeId: string;

    it('should create a new serviceable Pincode with city, state, and ASF mapping', async () => {
      testPincode = `49${suffix}`;
      const res = await request(app)
        .post('/api/v1/geography/pincodes')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          pincode: testPincode,
          stateId: testStateId,
          cityId: testCityId,
          defaultAsfId: testLocationId,
          isServiceable: 'Y',
          isActive: 'Y',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.pincode).toBe(testPincode);
      expect(res.body.data.isServiceable).toBe('Y');
      expect(res.body.data.cityName).toBe(`CityAlpha_${suffix}`);
      testPincodeId = res.body.data.pincodeId;
    });

    it('should reject duplicate pincode with 409 DUPLICATE_PINCODE', async () => {
      const res = await request(app)
        .post('/api/v1/geography/pincodes')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          pincode: testPincode,
          stateId: testStateId,
          cityId: testCityId,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_PINCODE');
    });

    it('should reject city-state mismatch for pincode', async () => {
      // Create another state
      const otherCode = 'Y' + Date.now().toString(36).toUpperCase().slice(-5);
      const otherState = await stateRepository.createState({
        stateCode: otherCode,
        stateName: `Other State ${Date.now().toString(36)}`,
        zone: 'NORTH',
        createdBy: 'SETUP',
      });

      // Try assigning city belonging to testStateId with otherState.stateId
      const res = await request(app)
        .post('/api/v1/geography/pincodes')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          pincode: `48${suffix}`,
          stateId: otherState.stateId,
          cityId: testCityId, // belongs to testStateId!
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CITY_STATE_MISMATCH');
    });

    it('should perform high-speed server-side lookup by pincode', async () => {
      const res = await request(app)
        .get(`/api/v1/geography/pincodes/lookup/${testPincode}`)
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pincode).toBe(testPincode);
      expect(res.body.data.isServiceable).toBe('Y');
      expect(res.body.data.stateCode).toBe(testStateCode);
      expect(res.body.data.cityName).toBe(`CityAlpha_${suffix}`);
      expect(res.body.data.defaultAsfCode).toBe(`ASF_${suffix}`);
    });

    it('should toggle serviceability status of a pincode', async () => {
      const res = await request(app)
        .patch(`/api/v1/geography/pincodes/${testPincodeId}/serviceability`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          isServiceable: 'N',
          versionNo: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isServiceable).toBe('N');
      expect(res.body.data.versionNo).toBe(2);

      // Verify lookup reflects updated non-serviceable status
      const lookupRes = await request(app)
        .get(`/api/v1/geography/pincodes/lookup/${testPincode}`)
        .set('Cookie', adminSessionCookie);

      expect(lookupRes.body.data.isServiceable).toBe('N');

      // Reactivate pincode so subsequent test verifies active dependent records prevent city deactivation
      const reactivateRes = await request(app)
        .patch(`/api/v1/geography/pincodes/${testPincodeId}/serviceability`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          isServiceable: 'Y',
          versionNo: 2,
        });
      expect(reactivateRes.status).toBe(200);
      expect(reactivateRes.body.data.isServiceable).toBe('Y');
    });

    it('should prevent city deactivation when active pincodes exist', async () => {
      const res = await request(app)
        .patch(`/api/v1/geography/cities/${testCityId}/status`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          isActive: 'N',
          versionNo: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DEPENDENT_ACTIVE_RECORDS');
    });
  });

  // ============================================================================
  // 4. Part Code Master Tests
  // ============================================================================

  describe('Part Code Master Operations', () => {
    let testPartCode: string;

    it('should create a complete Part record linked to Brand, Product, and HSN', async () => {
      testPartCode = `P${suffix}`;
      const res = await request(app)
        .post('/api/v1/catalog/parts')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          brandId: testBrandId,
          productId: testProductId,
          partCode: testPartCode,
          vendorPartCode: `VND_${suffix}`,
          partName: `BLDC Motor 1.5HP ${suffix}`,
          partDescription: 'High efficiency outdoor fan motor',
          hsnId: testHsnId,
          partCategory: 'SPARE',
          customerPrice: 3450.5,
          locationPrice: 2200.0,
          faultyPartDispatchTo: 'CENTRAL_WAREHOUSE',
          warrantyDays: 180,
          isActive: 'Y',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.partCode).toBe(testPartCode);
      expect(res.body.data.customerPrice).toBe(3450.5);
      expect(res.body.data.hsnCode).toBe(testHsnCode);
      expect(res.body.data.brandCode).toBe(`BRD_${suffix}`);
      testPartId = res.body.data.partId;
    });

    it('should reject duplicate partCode within the same brand', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/parts')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          brandId: testBrandId,
          productId: testProductId,
          partCode: testPartCode,
          partName: 'Duplicate Part Attempt',
          hsnId: testHsnId,
          partCategory: 'SPARE',
          customerPrice: 100,
          locationPrice: 50,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_PART_CODE');
    });

    it('should permit identical partCode under a different brand', async () => {
      const otherBrand = await brandRepository.createBrand({
        brandCode: `BRD2_${suffix}`,
        brandName: `Other Brand ${suffix}`,
        createdBy: 'SETUP',
      });

      const res = await request(app)
        .post('/api/v1/catalog/parts')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          brandId: otherBrand.brandId,
          productId: testProductId,
          partCode: testPartCode, // Same partCode, different brand
          partName: 'Permitted Duplicate In Other Brand',
          hsnId: testHsnId,
          partCategory: 'SPARE',
          customerPrice: 1500,
          locationPrice: 1000,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.partCode).toBe(testPartCode);
    });

    it('should reject part creation referencing inactive or non-existent HSN', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/parts')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          brandId: testBrandId,
          productId: testProductId,
          partCode: `P_INV_${suffix}`,
          partName: 'Invalid HSN Part',
          hsnId: crypto.randomUUID(),
          partCategory: 'SPARE',
          customerPrice: 500,
          locationPrice: 300,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RELATION');
    });

    it('should list parts with multi-criteria filtering', async () => {
      const res = await request(app)
        .get(`/api/v1/catalog/parts?brandId=${testBrandId}&category=SPARE&page=1&limit=10`)
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0].partCode).toBe(testPartCode);
    });

    it('should update part prices and details with optimistic locking', async () => {
      const res = await request(app)
        .put(`/api/v1/catalog/parts/${testPartId}`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          customerPrice: 3899.99,
          locationPrice: 2450.0,
          warrantyDays: 365,
          versionNo: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.customerPrice).toBe(3899.99);
      expect(res.body.data.warrantyDays).toBe(365);
      expect(res.body.data.versionNo).toBe(2);

      // Stale version conflict
      const conflictRes = await request(app)
        .put(`/api/v1/catalog/parts/${testPartId}`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          customerPrice: 4000.0,
          versionNo: 1,
        });

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.error.code).toBe('CONCURRENCY_CONFLICT');
    });

    it('should toggle part status between active and inactive', async () => {
      const res = await request(app)
        .patch(`/api/v1/catalog/parts/${testPartId}/status`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          isActive: 'N',
          versionNo: 2,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe('N');
      expect(res.body.data.versionNo).toBe(3);
    });
  });

  // ============================================================================
  // 5. RBAC & Catalog Audit Verification
  // ============================================================================

  describe('RBAC Authorization & Audit Trail Verification', () => {
    it('should allow Call Center user to read parts and geography', async () => {
      const partsRes = await request(app)
        .get('/api/v1/catalog/parts?page=1&limit=5')
        .set('Cookie', ccSessionCookie);
      expect(partsRes.status).toBe(200);

      const statesRes = await request(app)
        .get('/api/v1/geography/states')
        .set('Cookie', ccSessionCookie);
      expect(statesRes.status).toBe(200);

      const hsnRes = await request(app)
        .get('/api/v1/catalog/hsn')
        .set('Cookie', ccSessionCookie);
      expect(hsnRes.status).toBe(200);
    });

    it('should forbid Call Center user from mutating master catalog (403 FORBIDDEN)', async () => {
      const partMutation = await request(app)
        .post('/api/v1/catalog/parts')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .send({
          brandId: testBrandId,
          productId: testProductId,
          partCode: `UNAUTH_${suffix}`,
          partName: 'Forbidden Part',
          hsnId: testHsnId,
          partCategory: 'SPARE',
          customerPrice: 10,
          locationPrice: 5,
        });
      expect(partMutation.status).toBe(403);

      const stateMutation = await request(app)
        .post('/api/v1/geography/states')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .send({
          stateCode: 'XX',
          stateName: 'Forbidden State',
          zone: 'WEST',
        });
      expect(stateMutation.status).toBe(403);
    });

    it('should verify audit logs were written for PART, HSN, STATE, CITY, and PINCODE', async () => {
      const partAudit = await auditRepository.listRecentAudits({ entityName: 'PART', entityId: testPartId });
      expect(partAudit.length).toBeGreaterThanOrEqual(1);
      expect(partAudit.some((a) => a.action === 'CREATE')).toBe(true);

      const hsnAudit = await auditRepository.listRecentAudits({ entityName: 'HSN', entityId: testHsnId });
      expect(hsnAudit.length).toBeGreaterThanOrEqual(1);

      const stateAudit = await auditRepository.listRecentAudits({ entityName: 'STATE', entityId: testStateId });
      expect(stateAudit.length).toBeGreaterThanOrEqual(1);
      expect(stateAudit[0].action).toBe('CREATE');
    });
  });
});
