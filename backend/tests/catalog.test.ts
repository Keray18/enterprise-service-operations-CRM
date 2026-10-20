import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeOraclePool } from '../src/database/oraclePool.js';
import { auditRepository } from '../src/database/repositories/auditRepository.js';
import { brandRepository } from '../src/database/repositories/brandRepository.js';
import { modelRepository } from '../src/database/repositories/modelRepository.js';
import { productRepository } from '../src/database/repositories/productRepository.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { hashPassword } from '../src/services/passwordService.js';

describe('Catalog Masters & Management (Phase 1B.1)', () => {
  const app = createApp();

  const ADMIN_PASS = 'AdminTestCatalog#2026!';
  const CC_PASS = 'CallCenterCatalog#2026!';
  const WH_PASS = 'WarehouseCatalog#2026!';

  const adminUserId = crypto.randomUUID();
  const ccUserId = crypto.randomUUID();
  const whUserId = crypto.randomUUID();

  let adminSessionCookie: string;
  let adminCsrfToken: string;
  let ccSessionCookie: string;
  let ccCsrfToken: string;
  let whSessionCookie: string;

  beforeAll(async () => {
    // 1. Setup Admin user
    const adminHash = await hashPassword(ADMIN_PASS);
    await userRepository.createUser({
      userId: adminUserId,
      username: 'catalog_admin_test',
      email: 'catalog_admin_test@crm.internal',
      fullName: 'Catalog Test Admin',
      passwordHash: adminHash,
    });
    await rbacRepository.assignRoleToUser(adminUserId, 'ADMIN', 'TEST_SETUP');

    // 2. Setup Call Center user
    const ccHash = await hashPassword(CC_PASS);
    await userRepository.createUser({
      userId: ccUserId,
      username: 'catalog_cc_test',
      email: 'catalog_cc_test@crm.internal',
      fullName: 'Catalog CC User',
      passwordHash: ccHash,
    });
    await rbacRepository.assignRoleToUser(ccUserId, 'CALL_CENTER', 'TEST_SETUP');

    // 3. Setup Warehouse user
    const whHash = await hashPassword(WH_PASS);
    await userRepository.createUser({
      userId: whUserId,
      username: 'catalog_wh_test',
      email: 'catalog_wh_test@crm.internal',
      fullName: 'Catalog WH User',
      passwordHash: whHash,
    });
    await rbacRepository.assignRoleToUser(whUserId, 'WAREHOUSE', 'TEST_SETUP');

    // Login Admin
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'catalog_admin_test', password: ADMIN_PASS });
    adminSessionCookie = adminLogin.headers['set-cookie'][0];
    adminCsrfToken = adminLogin.body.data.csrfToken;

    // Login CC
    const ccLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'catalog_cc_test', password: CC_PASS });
    ccSessionCookie = ccLogin.headers['set-cookie'][0];
    ccCsrfToken = ccLogin.body.data.csrfToken;

    // Login WH
    const whLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'catalog_wh_test', password: WH_PASS });
    whSessionCookie = whLogin.headers['set-cookie'][0];
  });

  afterAll(async () => {
    await userRepository.deleteUser(adminUserId).catch(() => {});
    await userRepository.deleteUser(ccUserId).catch(() => {});
    await userRepository.deleteUser(whUserId).catch(() => {});
    await closeOraclePool().catch(() => {});
  });

  // ============================================================================
  // 1. Brand Master Tests
  // ============================================================================

  describe('Brand Master Operations', () => {
    let createdBrandId: string;
    const testBrandCode = `TSTBRD_${Date.now().toString().slice(-4)}`;

    it('Admin can create a new brand and writes audit entry', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/brands')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          brandCode: testBrandCode,
          brandName: 'Test Brand Enterprise',
          logoUrl: 'https://example.com/logo.png',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.brandCode).toBe(testBrandCode);
      expect(res.body.data.brandName).toBe('Test Brand Enterprise');
      expect(res.body.data.versionNo).toBe(1);
      createdBrandId = res.body.data.brandId;

      // Verify audit log entry
      const audits = await auditRepository.listRecentAudits({ entityName: 'BRAND', entityId: createdBrandId });
      expect(audits.length).toBeGreaterThanOrEqual(1);
      expect(audits[0].action).toBe('CREATE');
    });

    it('Rejects duplicate brand code with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/brands')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          brandCode: testBrandCode,
          brandName: 'Duplicate Brand Code',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_CODE');
    });

    it('Validates brand fields and rejects invalid schema (400)', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/brands')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          brandCode: '', // Empty code
          brandName: 'A', // Too short
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('Retrieves brand detail by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/catalog/brands/${createdBrandId}`)
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.brandId).toBe(createdBrandId);
      expect(res.body.data.brandName).toBe('Test Brand Enterprise');
    });

    it('Updates brand details with optimistic concurrency protection', async () => {
      const res = await request(app)
        .put(`/api/v1/catalog/brands/${createdBrandId}`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          brandName: 'Test Brand Enterprise Updated',
          expectedVersion: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.brandName).toBe('Test Brand Enterprise Updated');
      expect(res.body.data.versionNo).toBe(2);
    });

    it('Rejects concurrent update when expectedVersion does not match (409)', async () => {
      const res = await request(app)
        .put(`/api/v1/catalog/brands/${createdBrandId}`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          brandName: 'Stale Update',
          expectedVersion: 1, // Current is 2
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONCURRENCY_CONFLICT');
    });

    it('Deactivates and reactivates a brand', async () => {
      // Deactivate
      const deactRes = await request(app)
        .patch(`/api/v1/catalog/brands/${createdBrandId}/status`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({ isActive: 'N' });

      expect(deactRes.status).toBe(200);
      expect(deactRes.body.data.isActive).toBe('N');

      // Reactivate
      const reactRes = await request(app)
        .patch(`/api/v1/catalog/brands/${createdBrandId}/status`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({ isActive: 'Y' });

      expect(reactRes.status).toBe(200);
      expect(reactRes.body.data.isActive).toBe('Y');
    });

    it('Lists brands with server-side filtering, sorting, and pagination', async () => {
      const res = await request(app)
        .get('/api/v1/catalog/brands?search=Skatercat&limit=5&page=1')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0].brandName).toContain('Skatercat');
    });
  });

  // ============================================================================
  // 2. Product Master Tests
  // ============================================================================

  describe('Product Master Operations', () => {
    let createdProductId: string;
    const testProductCode = `PRD_${Date.now().toString().slice(-4)}`;

    it('Admin can create a new product', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/products')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          productCode: testProductCode,
          productName: 'Smart Microwave Oven',
          categoryFamily: 'Kitchen Appliances',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.productCode).toBe(testProductCode);
      expect(res.body.data.categoryFamily).toBe('Kitchen Appliances');
      createdProductId = res.body.data.productId;
    });

    it('Rejects duplicate product code with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/products')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          productCode: testProductCode,
          productName: 'Duplicate Product',
          categoryFamily: 'Appliances',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_CODE');
    });

    it('Lists distinct product categories', async () => {
      const res = await request(app)
        .get('/api/v1/catalog/products/categories')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data).toContain('Home Appliances');
      expect(res.body.data).toContain('Kitchen Appliances');
    });

    it('Updates product details and toggles status', async () => {
      const updateRes = await request(app)
        .put(`/api/v1/catalog/products/${createdProductId}`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          productName: 'Smart Convection Microwave',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.productName).toBe('Smart Convection Microwave');

      const toggleRes = await request(app)
        .patch(`/api/v1/catalog/products/${createdProductId}/status`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({ isActive: 'N' });

      expect(toggleRes.status).toBe(200);
      expect(toggleRes.body.data.isActive).toBe('N');
    });
  });

  // ============================================================================
  // 3. Model Master Tests
  // ============================================================================

  describe('Model Master Operations', () => {
    let activeBrandId: string;
    let activeProductId: string;
    let inactiveBrandId: string;
    let createdModelId: string;
    const testModelCode = `MOD_${Date.now().toString().slice(-4)}`;

    beforeAll(async () => {
      // Find seeded brand and product
      const brand = await brandRepository.findByCode('SKC');
      activeBrandId = brand!.brandId;

      const product = await productRepository.findByCode('AC');
      activeProductId = product!.productId;

      // Create an inactive brand to test relation validation
      const inact = await brandRepository.createBrand({
        brandId: crypto.randomUUID(),
        brandCode: `INACT_${Date.now().toString().slice(-4)}`,
        brandName: 'Inactive Brand Co',
        isActive: 'N',
      });
      inactiveBrandId = inact.brandId;
    });

    it('Admin can create a complete model with full warranty & technical parameters', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/models')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          brandId: activeBrandId,
          productId: activeProductId,
          modelCode: testModelCode,
          modelName: 'Skatercat Eco Split AC 2.0 Ton',
          technicalName: 'Twin Rotary Dual Inverter Copper Coil',
          softwareVersion: 'v3.1.0',
          serialNumberLength: 15,
          checkSerialNumber: 'Y',
          isJobCreationAllowed: 'Y',
          isDoaAllowed: 'Y',
          isRepairable: 'Y',
          isReplacementAllowed: 'Y',
          customerWarrantyDays: 730,
          repairWarrantyDays: 90,
          replacementWindowDays: 30,
          doaDays: 7,
          amcDays: 365,
          amcAmount: 1400.0,
          isOutOfWarrantyServiced: 'Y',
          standardServiceCharge: 550.0,
          releaseDate: '2024-06-01',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.modelCode).toBe(testModelCode);
      expect(res.body.data.brandName).toBe('Skatercat');
      expect(res.body.data.productName).toBe('Air Conditioner');
      expect(res.body.data.customerWarrantyDays).toBe(730);
      createdModelId = res.body.data.modelId;
    });

    it('Rejects model referencing nonexistent Brand with 400 INVALID_RELATION', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/models')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          brandId: '00000000-0000-0000-0000-999999999999',
          productId: activeProductId,
          modelCode: `INVALID_${Date.now().toString().slice(-4)}`,
          modelName: 'Ghost Model',
          releaseDate: '2024-01-01',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RELATION');
    });

    it('Rejects model referencing deactivated Brand with 400 INACTIVE_RELATION', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/models')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          brandId: inactiveBrandId,
          productId: activeProductId,
          modelCode: `INACTMOD_${Date.now().toString().slice(-4)}`,
          modelName: 'Inactive Brand Model',
          releaseDate: '2024-01-01',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INACTIVE_RELATION');
    });

    it('Rejects duplicate model code under the same brand with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/models')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          brandId: activeBrandId,
          productId: activeProductId,
          modelCode: testModelCode, // duplicate
          modelName: 'Duplicate Model Test',
          releaseDate: '2024-01-01',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_CODE');
    });

    it('Allows same model code under a DIFFERENT brand', async () => {
      const daenyxBrand = await brandRepository.findByCode('DNX');
      const res = await request(app)
        .post('/api/v1/catalog/models')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          brandId: daenyxBrand!.brandId,
          productId: activeProductId,
          modelCode: testModelCode, // same code, different brand
          modelName: 'Daenyx Eco Split AC',
          releaseDate: '2024-01-01',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.brandCode).toBe('DNX');
    });

    it('Retrieves model by ID with populated Brand and Product details', async () => {
      const res = await request(app)
        .get(`/api/v1/catalog/models/${createdModelId}`)
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.modelId).toBe(createdModelId);
      expect(res.body.data.brandName).toBeDefined();
      expect(res.body.data.productName).toBeDefined();
    });

    it('Updates model settings and increments version', async () => {
      const res = await request(app)
        .put(`/api/v1/catalog/models/${createdModelId}`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          softwareVersion: 'v3.2.0-beta',
          standardServiceCharge: 600.0,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.softwareVersion).toBe('v3.2.0-beta');
      expect(res.body.data.standardServiceCharge).toBe(600);
      expect(res.body.data.versionNo).toBe(2);
    });

    it('Prevents activating model if parent brand is deactivated (400)', async () => {
      // Deactivate parent brand
      await brandRepository.setBrandActive(activeBrandId, 'N');

      const res = await request(app)
        .patch(`/api/v1/catalog/models/${createdModelId}/status`)
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({ isActive: 'Y' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INACTIVE_RELATION');

      // Restore brand active
      await brandRepository.setBrandActive(activeBrandId, 'Y');
    });
  });

  // ============================================================================
  // 4. Authorization & RBAC Enforcement Tests
  // ============================================================================

  describe('Authorization & RBAC Enforcement', () => {
    it('Denies unauthenticated access with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/catalog/brands');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('Call Center user CAN read catalog items (masters:read)', async () => {
      const res = await request(app)
        .get('/api/v1/catalog/models')
        .set('Cookie', ccSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toBeDefined();
    });

    it('Call Center user CANNOT create a brand (masters:manage missing - 403)', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/brands')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .send({
          brandCode: 'UNAUTH_CC',
          brandName: 'Unauthorized CC Brand',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Warehouse user CANNOT create or update a model (403)', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/models')
        .set('Cookie', whSessionCookie)
        .send({
          modelCode: 'UNAUTH_WH',
          modelName: 'Unauthorized WH Model',
        });

      // 403 Forbidden (RBAC / CSRF)
      expect([403]).toContain(res.status);
      expect(res.body.error.code).toBeDefined();
    });
  });

  // ============================================================================
  // 5. Audit Trail Verification
  // ============================================================================

  describe('Catalog Audit Trail', () => {
    it('Admin can view recent catalog audit logs', async () => {
      const res = await request(app)
        .get('/api/v1/catalog/audit-logs?limit=10')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const adminEntry = res.body.data.find(
        (log: any) => log.performedByUsername === 'catalog_admin_test'
      );
      expect(adminEntry).toBeDefined();
      expect(['CREATE', 'UPDATE', 'ACTIVATE', 'DEACTIVATE']).toContain(adminEntry.action);
    });
  });
});
