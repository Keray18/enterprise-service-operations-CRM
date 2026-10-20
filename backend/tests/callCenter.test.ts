import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeOraclePool, getOracleConnection } from '../src/database/oraclePool.js';
import { brandRepository } from '../src/database/repositories/brandRepository.js';
import { customerRepository } from '../src/database/repositories/customerRepository.js';
import { modelRepository } from '../src/database/repositories/modelRepository.js';
import { pincodeRepository } from '../src/database/repositories/pincodeRepository.js';
import { productRepository } from '../src/database/repositories/productRepository.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { serviceRequestRepository } from '../src/database/repositories/serviceRequestRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { mockSmsAdapter } from '../src/services/notificationService.js';
import { hashPassword } from '../src/services/passwordService.js';

describe('Fast Call Registration & Customer Lookup (Phase 1C)', () => {
  const app = createApp();

  const CC_PASSWORD = 'CallCenterPassword123#';
  const WH_PASSWORD = 'WarehousePassword123#';
  const ADMIN_PASSWORD = 'AdminPassword123#';

  const ccUserId = crypto.randomUUID();
  const whUserId = crypto.randomUUID();
  const adminUserId = crypto.randomUUID();

  let ccSessionCookie: string;
  let ccCsrfToken: string;
  let whSessionCookie: string;
  let whCsrfToken: string;
  let adminSessionCookie: string;
  let adminCsrfToken: string;

  // Master references from seeds
  let activeBrandId: string;
  let activeProductId: string;
  let activeModelId: string;
  let activeModelCode: string;
  let disabledModelId: string;
  let stateId: string;
  let cityId: string;
  let serviceablePincode: string;
  let nonServiceablePincode: string;

  beforeAll(async () => {
    // 1. Create Call Center User
    const ccHash = await hashPassword(CC_PASSWORD);
    await userRepository.createUser({
      userId: ccUserId,
      username: `cc_test_${Date.now().toString(36)}`,
      email: `cc_test_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Call Center Agent Test',
      passwordHash: ccHash,
    });
    await rbacRepository.assignRoleToUser(ccUserId, 'CALL_CENTER', 'SETUP');

    // 2. Create Warehouse User (no calls:read or calls:create)
    const whHash = await hashPassword(WH_PASSWORD);
    await userRepository.createUser({
      userId: whUserId,
      username: `wh_test_${Date.now().toString(36)}`,
      email: `wh_test_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Warehouse Storekeeper Test',
      passwordHash: whHash,
    });
    await rbacRepository.assignRoleToUser(whUserId, 'WAREHOUSE', 'SETUP');

    // 3. Create Admin User
    const adminHash = await hashPassword(ADMIN_PASSWORD);
    await userRepository.createUser({
      userId: adminUserId,
      username: `admin_cc_${Date.now().toString(36)}`,
      email: `admin_cc_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Call Center Admin Test',
      passwordHash: adminHash,
    });
    await rbacRepository.assignRoleToUser(adminUserId, 'ADMIN', 'SETUP');

    // 4. Authenticate Call Center
    const ccLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: (await userRepository.findById(ccUserId))!.username, password: CC_PASSWORD });
    expect(ccLogin.status).toBe(200);
    ccSessionCookie = ccLogin.headers['set-cookie'][0];
    ccCsrfToken = ccLogin.body.data.csrfToken;

    // 5. Authenticate Warehouse
    const whLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: (await userRepository.findById(whUserId))!.username, password: WH_PASSWORD });
    expect(whLogin.status).toBe(200);
    whSessionCookie = whLogin.headers['set-cookie'][0];
    whCsrfToken = whLogin.body.data.csrfToken;

    // 6. Authenticate Admin
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: (await userRepository.findById(adminUserId))!.username, password: ADMIN_PASSWORD });
    expect(adminLogin.status).toBe(200);
    adminSessionCookie = adminLogin.headers['set-cookie'][0];
    adminCsrfToken = adminLogin.body.data.csrfToken;

    // 7. Seed/Resolve Catalog Data
    const brands = await brandRepository.listBrands({ page: 1, limit: 10, isActive: 'Y' });
    activeBrandId = brands.items[0].brandId;

    const products = await productRepository.listProducts({ page: 1, limit: 10, isActive: 'Y' });
    activeProductId = products.items[0].productId;

    // Seed an active model with CHECK_SERIAL_NUMBER = 'Y' and length 15
    const model = await modelRepository.createModel({
      modelId: crypto.randomUUID(),
      brandId: activeBrandId,
      productId: activeProductId,
      modelCode: `MOD-TEST-${Date.now().toString(36).toUpperCase()}`,
      modelName: 'Fast Intake Test Inverter AC',
      serialNumberLength: 15,
      checkSerialNumber: 'Y',
      isJobCreationAllowed: 'Y',
      customerWarrantyDays: 365,
      releaseDate: new Date('2024-01-01'),
      createdBy: 'TEST_SUITE',
    });
    activeModelId = model.modelId;
    activeModelCode = model.modelCode;

    // Seed a model with IS_JOB_CREATION_ALLOWED = 'N'
    const disabledModel = await modelRepository.createModel({
      modelId: crypto.randomUUID(),
      brandId: activeBrandId,
      productId: activeProductId,
      modelCode: `MOD-DIS-${Date.now().toString(36).toUpperCase()}`,
      modelName: 'Discontinued Ineligible Model',
      serialNumberLength: 15,
      checkSerialNumber: 'Y',
      isJobCreationAllowed: 'N',
      customerWarrantyDays: 365,
      releaseDate: new Date('2020-01-01'),
      createdBy: 'TEST_SUITE',
    });
    disabledModelId = disabledModel.modelId;

    // Resolve Geography
    const pincodes = await pincodeRepository.listPincodes({ page: 1, limit: 10, isServiceable: 'Y' });
    serviceablePincode = pincodes.items[0].pincode;
    stateId = pincodes.items[0].stateId;
    cityId = pincodes.items[0].cityId;

    // Create a non-serviceable pincode for testing
    nonServiceablePincode = '99' + Math.floor(1000 + Math.random() * 9000).toString();
    const conn = await getOracleConnection();
    try {
      await conn.execute(
        `INSERT INTO PINCODES (PINCODE_ID, PINCODE, STATE_ID, CITY_ID, IS_SERVICEABLE, CREATED_BY)
         VALUES (:id, :pin, :stateId, :cityId, 'N', 'TEST_SUITE')`,
        {
          id: crypto.randomUUID(),
          pin: nonServiceablePincode,
          stateId,
          cityId,
        },
        { autoCommit: true }
      );
    } finally {
      await conn.close();
    }
  });

  afterAll(async () => {
    await closeOraclePool();
  });

  // ============================================================================
  // 1. Customer Lookup & Search Workflows
  // ============================================================================
  describe('1. Customer Lookup & Search', () => {
    it('should find existing customer by exact 10-digit mobile number', async () => {
      const res = await request(app)
        .get('/api/v1/customers/search?mobile=9820012345')
        .set('Cookie', ccSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      const customer = res.body.data.items[0];
      expect(customer.primaryMobile).toBe('9820012345');
      expect(customer.fullName).toBe('Rajesh Kumar Sharma');
      expect(customer.customerCode).toBe('C1001');
      expect(customer.stateName).toBeDefined();
      expect(customer.cityName).toBeDefined();
    });

    it('should normalize formatted phone numbers (+91, leading 0, spaces, dashes) for lookup', async () => {
      // Searching with +91 and spaces
      const res1 = await request(app)
        .get('/api/v1/customers/search?mobile=+91 98200 12345')
        .set('Cookie', ccSessionCookie);

      expect(res1.status).toBe(200);
      expect(res1.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res1.body.data.items[0].customerCode).toBe('C1001');

      // Searching with leading 0
      const res2 = await request(app)
        .get('/api/v1/customers/search?mobile=09820012345')
        .set('Cookie', ccSessionCookie);

      expect(res2.status).toBe(200);
      expect(res2.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res2.body.data.items[0].customerCode).toBe('C1001');
    });

    it('should return multiple customer records when several customers share the same mobile number', async () => {
      // Customers C1004 (Vikram Mehta) and C1005 (Sunita Mehta) share 9999988888
      const res = await request(app)
        .get('/api/v1/customers/search?mobile=9999988888')
        .set('Cookie', ccSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(2);
      const names = res.body.data.items.map((c: any) => c.fullName);
      expect(names).toContain('Vikram Mehta');
      expect(names).toContain('Sunita Mehta');
    });

    it('should return empty list when no matching customer is found', async () => {
      const res = await request(app)
        .get('/api/v1/customers/search?mobile=9111122222')
        .set('Cookie', ccSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(0);
      expect(res.body.data.total).toBe(0);
    });

    it('should find customer by customer code', async () => {
      const res = await request(app)
        .get('/api/v1/customers/search?code=C1002')
        .set('Cookie', ccSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].fullName).toBe('Pooja Verma');
    });

    it('should retrieve customer details by ID', async () => {
      const searchRes = await request(app)
        .get('/api/v1/customers/search?code=C1001')
        .set('Cookie', ccSessionCookie);
      const customerId = searchRes.body.data.items[0].customerId;

      const res = await request(app)
        .get(`/api/v1/customers/${customerId}`)
        .set('Cookie', ccSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.customerId).toBe(customerId);
      expect(res.body.data.customerCode).toBe('C1001');
      expect(res.body.data.stateName).toBeDefined();
    });
  });

  // ============================================================================
  // 2. Serviceability & Pincode Resolution
  // ============================================================================
  describe('2. Pincode Lookup & Serviceability Resolution', () => {
    it('should resolve a serviceable pincode with state, city and ASF info', async () => {
      const res = await request(app)
        .get(`/api/v1/call-center/serviceability/${serviceablePincode}`)
        .set('Cookie', ccSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.isServiceable).toBe(true);
      expect(res.body.data.pincode).toBe(serviceablePincode);
      expect(res.body.data.stateName).toBeDefined();
      expect(res.body.data.cityName).toBeDefined();
      expect(['SERVICEABLE', 'SERVICEABLE_NO_ASF']).toContain(res.body.data.status);
    });

    it('should identify an explicitly non-serviceable pincode', async () => {
      const res = await request(app)
        .get(`/api/v1/call-center/serviceability/${nonServiceablePincode}`)
        .set('Cookie', ccSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.isServiceable).toBe(false);
      expect(res.body.data.status).toBe('NON_SERVICEABLE');
    });

    it('should identify an unknown pincode not in geography master', async () => {
      const res = await request(app)
        .get('/api/v1/call-center/serviceability/100999')
        .set('Cookie', ccSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('UNKNOWN');
      expect(res.body.data.isServiceable).toBe(false);
    });

    it('should reject malformed pincodes with 400', async () => {
      const res = await request(app)
        .get('/api/v1/call-center/serviceability/ABCD12')
        .set('Cookie', ccSessionCookie);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PINCODE');
    });
  });

  // ============================================================================
  // 3. Complaint Registration & Business Validation
  // ============================================================================
  describe('3. Complaint Registration & Business Validation', () => {
    it('should successfully register a complaint for an existing customer', async () => {
      mockSmsAdapter.clear();
      const customer = (await customerRepository.searchCustomers({ code: 'C1001' })).items[0];

      const res = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .send({
          customerId: customer.customerId,
          brandId: activeBrandId,
          productId: activeProductId,
          modelId: activeModelId,
          serialNumber: 'SN1234567890123', // 15 chars
          purchaseDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          vocDescription: 'No Cooling / Low Cooling',
          problemDescription: 'AC runs but does not cool room properly',
          stateId,
          cityId,
          pincode: serviceablePincode,
          addressLine: customer.addressLine,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      // 1. Service request checks
      expect(data.serviceRequest).toBeDefined();
      expect(data.serviceRequest.status).toBe('REGISTERED');
      expect(data.serviceRequest.jobNumber).toMatch(/^TT[A-Z0-9]{4}\d{6}\d{4}$/);
      expect(data.serviceRequest.customerId).toBe(customer.customerId);
      expect(data.serviceRequest.warrantyStatus).toBe('IN_WARRANTY');

      // 2. SMS 1 Outbox & dispatch checks
      expect(data.smsQueued).toBe(true);

      // Verify event history in DB
      const eventsRes = await request(app)
        .get(`/api/v1/call-center/requests/${data.serviceRequest.requestId}/events`)
        .set('Cookie', ccSessionCookie);

      expect(eventsRes.status).toBe(200);
      expect(eventsRes.body.data.length).toBe(1);
      expect(eventsRes.body.data[0].fromState).toBe('NONE');
      expect(eventsRes.body.data[0].toState).toBe('REGISTERED');
      expect(eventsRes.body.data[0].eventType).toBe('CALL_REGISTERED');
      expect(eventsRes.body.data[0].triggeredByUserId).toBe(ccUserId);
    });

    it('should register a complaint with a new customer in a single atomic transaction', async () => {
      const newPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
      const res = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .send({
          newCustomer: {
            fullName: 'Anita Deshmukh',
            primaryMobile: newPhone,
            customerCategory: 'INDIVIDUAL',
            addressLine: 'Flat 503, Galaxy Tower',
            stateId,
            cityId,
            pincode: serviceablePincode,
          },
          brandId: activeBrandId,
          productId: activeProductId,
          modelId: activeModelId,
          serialNumber: 'SN9876543210987',
          purchaseDate: '2023-01-01', // over 365 days ago -> OUT_OF_WARRANTY
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          vocDescription: 'Water Leakage',
          problemDescription: 'Water dripping from indoor split unit',
          stateId,
          cityId,
          pincode: serviceablePincode,
          addressLine: 'Flat 503, Galaxy Tower',
        });

      expect(res.status).toBe(201);
      const data = res.body.data;
      expect(data.customer).toBeDefined();
      expect(data.customer.fullName).toBe('Anita Deshmukh');
      expect(data.customer.customerCode).toMatch(/^C\d+$/);
      expect(data.serviceRequest.warrantyStatus).toBe('OUT_OF_WARRANTY');
      expect(data.serviceRequest.customerId).toBe(data.customer.customerId);
    });

    it('should reject registration if model has IS_JOB_CREATION_ALLOWED = N', async () => {
      const customer = (await customerRepository.searchCustomers({ code: 'C1001' })).items[0];

      const res = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .send({
          customerId: customer.customerId,
          brandId: activeBrandId,
          productId: activeProductId,
          modelId: disabledModelId,
          serialNumber: 'SN1234567890123',
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          stateId,
          cityId,
          pincode: serviceablePincode,
          addressLine: customer.addressLine,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('JOB_CREATION_DISABLED');
    });

    it('should reject registration when serial number does not meet model length rule', async () => {
      const customer = (await customerRepository.searchCustomers({ code: 'C1001' })).items[0];

      // Model requires 15 characters; sending 6 characters
      const res = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .send({
          customerId: customer.customerId,
          brandId: activeBrandId,
          productId: activeProductId,
          modelId: activeModelId,
          serialNumber: 'SHORT1', // 6 chars instead of 15
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          stateId,
          cityId,
          pincode: serviceablePincode,
          addressLine: customer.addressLine,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_SERIAL_LENGTH');
    });

    it('should reject registration if model does not belong to specified brand', async () => {
      const customer = (await customerRepository.searchCustomers({ code: 'C1001' })).items[0];
      const brands = await brandRepository.listBrands({ page: 1, limit: 10 });
      const otherBrandId = brands.items.find((b) => b.brandId !== activeBrandId)!.brandId;

      const res = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .send({
          customerId: customer.customerId,
          brandId: otherBrandId, // mismatch!
          productId: activeProductId,
          modelId: activeModelId,
          serialNumber: 'SN1234567890123',
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          stateId,
          cityId,
          pincode: serviceablePincode,
          addressLine: customer.addressLine,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BRAND_MODEL_MISMATCH');
    });

    it('should reject registration for non-serviceable pincode', async () => {
      const customer = (await customerRepository.searchCustomers({ code: 'C1001' })).items[0];

      const res = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .send({
          customerId: customer.customerId,
          brandId: activeBrandId,
          productId: activeProductId,
          modelId: activeModelId,
          serialNumber: 'SN1234567890123',
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          stateId,
          cityId,
          pincode: nonServiceablePincode,
          addressLine: customer.addressLine,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NON_SERVICEABLE_PINCODE');
    });
  });

  // ============================================================================
  // 4. Data Integrity, Concurrency & Idempotency
  // ============================================================================
  describe('4. Data Integrity, Concurrency & Idempotency', () => {
    it('should generate guaranteed unique Job Numbers under concurrent submissions', async () => {
      const customer = (await customerRepository.searchCustomers({ code: 'C1001' })).items[0];

      // Launch 5 concurrent complaint registrations
      const promises = Array.from({ length: 5 }).map((_, i) =>
        request(app)
          .post('/api/v1/call-center/complaints')
          .set('Cookie', ccSessionCookie)
          .set('x-csrf-token', ccCsrfToken)
          .send({
            customerId: customer.customerId,
            brandId: activeBrandId,
            productId: activeProductId,
            modelId: activeModelId,
            serialNumber: `SNCONC${i}12345678`,
            callType: 'MAINTENANCE',
            serviceType: 'ON_SITE',
            problemDescription: `Concurrent request test ${i}`,
            stateId,
            cityId,
            pincode: serviceablePincode,
            addressLine: customer.addressLine,
          })
      );

      const results = await Promise.all(promises);
      results.forEach((res) => {
        expect(res.status).toBe(201);
      });

      const jobNumbers = results.map((r) => r.body.data.serviceRequest.jobNumber);
      const uniqueJobNumbers = new Set(jobNumbers);
      expect(uniqueJobNumbers.size).toBe(5);
    });

    it('should prevent double submission when client provides an idempotencyKey', async () => {
      const customer = (await customerRepository.searchCustomers({ code: 'C1001' })).items[0];
      const idempotencyKey = `IDEMP-${Date.now()}-${Math.random().toString(36)}`;

      const payload = {
        customerId: customer.customerId,
        brandId: activeBrandId,
        productId: activeProductId,
        modelId: activeModelId,
        serialNumber: 'SN1234567890123',
        callType: 'DEMO' as const,
        serviceType: 'ON_SITE' as const,
        problemDescription: 'Demo request with idempotency token',
        stateId,
        cityId,
        pincode: serviceablePincode,
        addressLine: customer.addressLine,
        idempotencyKey,
      };

      // First call
      const res1 = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .send(payload);

      expect(res1.status).toBe(201);
      const originalJobNumber = res1.body.data.serviceRequest.jobNumber;

      // Duplicate call with exact same idempotencyKey
      const res2 = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .send(payload);

      // Returns 201 with identical request without creating a duplicate job number
      expect(res2.status).toBe(201);
      expect(res2.body.data.serviceRequest.jobNumber).toBe(originalJobNumber);
      expect(res2.body.data.serviceRequest.requestId).toBe(res1.body.data.serviceRequest.requestId);
    });

    it('should search service requests by job number, mobile, or serial number', async () => {
      const recent = await serviceRequestRepository.listRecent({ limit: 1 });
      expect(recent.length).toBeGreaterThan(0);
      const targetJob = recent[0].jobNumber;
      const targetPhone = recent[0].customerPhone!;

      // Search by Job Number
      const searchByJob = await request(app)
        .get(`/api/v1/call-center/requests?jobNumber=${targetJob}`)
        .set('Cookie', ccSessionCookie);

      expect(searchByJob.status).toBe(200);
      expect(searchByJob.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(searchByJob.body.data.items[0].jobNumber).toBe(targetJob);

      // Search by Mobile
      const searchByPhone = await request(app)
        .get(`/api/v1/call-center/requests?mobile=${targetPhone}`)
        .set('Cookie', ccSessionCookie);

      expect(searchByPhone.status).toBe(200);
      expect(searchByPhone.body.data.items.length).toBeGreaterThanOrEqual(1);

      // Search recent complaints
      const recentRes = await request(app)
        .get('/api/v1/call-center/requests/recent?limit=5')
        .set('Cookie', ccSessionCookie);

      expect(recentRes.status).toBe(200);
      expect(recentRes.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // 5. Authorization & RBAC Security Enforcement
  // ============================================================================
  describe('5. RBAC & Security Enforcement', () => {
    it('should reject unauthenticated requests to call center endpoints with 401', async () => {
      const res = await request(app).get('/api/v1/customers/search?mobile=9820012345');
      expect(res.status).toBe(401);
    });

    it('should reject Warehouse users attempting to access call center search with 403', async () => {
      const res = await request(app)
        .get('/api/v1/customers/search?mobile=9820012345')
        .set('Cookie', whSessionCookie);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject Warehouse users attempting to register complaints with 403', async () => {
      const res = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', whSessionCookie)
        .set('x-csrf-token', whCsrfToken)
        .send({
          brandId: activeBrandId,
          productId: activeProductId,
          modelId: activeModelId,
          callType: 'REPAIR',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject state-changing complaint registrations without CSRF token with 403', async () => {
      const res = await request(app)
        .post('/api/v1/call-center/complaints')
        .set('Cookie', ccSessionCookie)
        // deliberately omitting x-csrf-token
        .send({
          brandId: activeBrandId,
          productId: activeProductId,
          modelId: activeModelId,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
    });

    it('should allow System Administrator to access call center workflows', async () => {
      const res = await request(app)
        .get('/api/v1/customers/search?mobile=9820012345')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
