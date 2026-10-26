import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeOraclePool, getOracleConnection } from '../src/database/oraclePool.js';
import { locationRepository } from '../src/database/repositories/locationRepository.js';
import { partRepository } from '../src/database/repositories/partRepository.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { customerRepository } from '../src/database/repositories/customerRepository.js';
import { modelRepository } from '../src/database/repositories/modelRepository.js';
import { serviceRequestRepository } from '../src/database/repositories/serviceRequestRepository.js';
import { serviceRequestPartsRepository } from '../src/database/repositories/serviceRequestPartsRepository.js';
import { inventoryService } from '../src/services/inventoryService.js';
import { hashPassword } from '../src/services/passwordService.js';

describe('Phase 3 — Warehouse & Inventory Logistics', () => {
  const app = createApp();
  const PASSWORD = 'TestPassword123#';

  let centralWarehouseLocationId: string;
  let asfLocationId: string;
  let testPartId: string;
  let testPartId2: string;

  const warehouseUserId = crypto.randomUUID();
  const adminUserId = crypto.randomUUID();
  const callCenterUserId = crypto.randomUUID();
  const asfUserId = crypto.randomUUID();

  let whCookie: string;
  let whCsrf: string;
  let adminCookie: string;
  let adminCsrf: string;
  let ccCookie: string;
  let ccCsrf: string;
  let asfCookie: string;
  let asfCsrf: string;

  let testRequestId: string;
  let testPartEntryId: string;

  beforeAll(async () => {
    // 1. Locations: Central Warehouse and ASF Center
    const locWh = await locationRepository.createLocation({
      locationCode: `WH_TEST_${Date.now().toString(36).toUpperCase()}`,
      locationName: 'Central Regional Logistics Warehouse',
      partyType: 'CENTRAL_WAREHOUSE',
      isActive: 'Y',
    });
    centralWarehouseLocationId = locWh.locationId;

    const locAsf = await locationRepository.createLocation({
      locationCode: `ASF_TEST_${Date.now().toString(36).toUpperCase()}`,
      locationName: 'Andheri West Franchise Center',
      partyType: 'ASF',
      isActive: 'Y',
    });
    asfLocationId = locAsf.locationId;

    // 2. Parts
    const parts = await partRepository.listParts({ isActive: 'Y', page: 1, limit: 10 });
    if (parts.items.length >= 2) {
      testPartId = parts.items[0]!.partId;
      testPartId2 = parts.items[1]!.partId;
    } else {
      throw new Error('Pre-seeded active parts not found.');
    }

    // 3. Users: WAREHOUSE, ADMIN, CALL_CENTER, ASF
    const passHash = await hashPassword(PASSWORD);

    // Warehouse Executive
    await userRepository.createUser({
      userId: warehouseUserId,
      username: `wh_phase3_${Date.now().toString(36)}`,
      email: `wh_phase3_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Sanjay Warehouse Manager',
      passwordHash: passHash,
      locationId: centralWarehouseLocationId,
    });
    await rbacRepository.assignRoleToUser(warehouseUserId, 'WAREHOUSE', 'SETUP');

    // Admin
    await userRepository.createUser({
      userId: adminUserId,
      username: `admin_phase3_${Date.now().toString(36)}`,
      email: `admin_phase3_${Date.now().toString(36)}@crm.internal`,
      fullName: 'HO System Lead',
      passwordHash: passHash,
    });
    await rbacRepository.assignRoleToUser(adminUserId, 'ADMIN', 'SETUP');

    // Call Center
    await userRepository.createUser({
      userId: callCenterUserId,
      username: `cc_phase3_${Date.now().toString(36)}`,
      email: `cc_phase3_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Call Center Representative',
      passwordHash: passHash,
    });
    await rbacRepository.assignRoleToUser(callCenterUserId, 'CALL_CENTER', 'SETUP');

    // ASF User
    await userRepository.createUser({
      userId: asfUserId,
      username: `asf_phase3_${Date.now().toString(36)}`,
      email: `asf_phase3_${Date.now().toString(36)}@crm.internal`,
      fullName: 'ASF Franchisee Store Lead',
      passwordHash: passHash,
      locationId: asfLocationId,
    });
    await rbacRepository.assignRoleToUser(asfUserId, 'ASF', 'SETUP');

    // Login helper
    const login = async (uid: string) => {
      const u = await userRepository.findById(uid);
      const res = await request(app).post('/api/v1/auth/login').send({
        username: u!.username,
        password: PASSWORD,
      });
      const cookie = res.headers['set-cookie']?.find((c: string) => c.startsWith('crm_session='));
      return {
        cookie: cookie ? cookie.split(';')[0] : '',
        csrf: res.body.data.csrfToken as string,
      };
    };

    const whAuth = await login(warehouseUserId);
    whCookie = whAuth.cookie;
    whCsrf = whAuth.csrf;

    const adminAuth = await login(adminUserId);
    adminCookie = adminAuth.cookie;
    adminCsrf = adminAuth.csrf;

    const ccAuth = await login(callCenterUserId);
    ccCookie = ccAuth.cookie;
    ccCsrf = ccAuth.csrf;

    const asfAuth = await login(asfUserId);
    asfCookie = asfAuth.cookie;
    asfCsrf = asfAuth.csrf;

    // 4. Setup a Service Request needing parts
    const customer = await customerRepository.createCustomer({
      fullName: 'Rohan Sharma',
      primaryMobile: '9820098200',
      addressLine: 'Flat 101, Lake View Apts',
      stateId: '00000000-0000-0000-0004-000000000001',
      cityId: '00000000-0000-0000-0005-000000000001',
      pincode: '400001',
      customerCategory: 'INDIVIDUAL',
    });

    const models = await modelRepository.listModels({ limit: 1 });
    const model = models.items[0]!;

    const conn = await (await import('../src/database/oraclePool.js')).getOracleConnection();
    try {
      const jobNumber = await serviceRequestRepository.generateJobNumber('SK', 'AC', conn);
      const registeredAt = new Date();
      const sla48hExpiresAt = new Date(registeredAt.getTime() + 48 * 3600 * 1000);

      const sr = await serviceRequestRepository.createServiceRequest(
        {
          jobNumber,
          customerId: customer.customerId,
          brandId: model.brandId,
          productId: model.productId,
          modelId: model.modelId,
          customerPhone: '9820098200',
          customerAddress: 'Flat 101, Lake View Apts',
          customerPincode: '400001',
          complaintDescription: 'AC outdoor unit not powering on',
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          warrantyStatus: 'IN_WARRANTY',
          assignedLocationId: asfLocationId,
          status: 'PENDING_SPARE_PART',
          createdChannel: 'CALL_CENTER',
          registeredBy: adminUserId,
          registeredByUsername: 'admin_test',
          sla48hExpiresAt,
        },
        conn
      );
      testRequestId = sr.requestId;

      testPartEntryId = await serviceRequestPartsRepository.addPart(
        {
          requestId: testRequestId,
          partId: testPartId,
          quantity: 2,
          unitPrice: 500,
          totalPrice: 1000,
          isChargeableToCustomer: 'N',
          entryType: 'REQUIRED_PNA',
          status: 'PENDING_FULFILLMENT',
          actorUsername: 'eng_test',
        },
        conn
      );
      await conn.commit();
    } finally {
      await conn.close();
    }
  });

  afterAll(async () => {
    await closeOraclePool();
  });

  // ============================================================================
  // Test Suite 1: Inbound Goods Receiving Notes (GRN)
  // ============================================================================

  describe('1. Inbound Goods Receiving Notes (GRN)', () => {
    it('should reject goods receipt without items', async () => {
      const res = await request(app)
        .post('/api/v1/warehouse/grn')
        .set('Cookie', whCookie)
        .set('x-csrf-token', whCsrf)
        .send({
          receivingLocationId: centralWarehouseLocationId,
          supplierName: 'Bharat Electronics Components Ltd',
          supplierInvoiceNo: 'INV-2026-001',
          supplierInvoiceDate: '2026-10-22',
          items: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject goods receipt if accepted + rejected does not match received', async () => {
      const res = await request(app)
        .post('/api/v1/warehouse/grn')
        .set('Cookie', whCookie)
        .set('x-csrf-token', whCsrf)
        .send({
          receivingLocationId: centralWarehouseLocationId,
          supplierName: 'Bharat Electronics Components Ltd',
          supplierInvoiceNo: 'INV-2026-001',
          supplierInvoiceDate: '2026-10-22',
          items: [
            {
              partId: testPartId,
              receivedQty: 50,
              acceptedQty: 40,
              rejectedQty: 5, // Sum = 45 != 50
              unitPrice: 450,
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('QUANTITY_MISMATCH');
    });

    it('should successfully post GRN, increment on-hand stock, and log immutable movement', async () => {
      // Check stock before
      const balBefore = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId);
      const onHandBefore = balBefore ? balBefore.qtyOnHand : 0;

      const res = await request(app)
        .post('/api/v1/warehouse/grn')
        .set('Cookie', whCookie)
        .set('x-csrf-token', whCsrf)
        .send({
          receivingLocationId: centralWarehouseLocationId,
          supplierName: 'Bharat Electronics Components Ltd',
          supplierInvoiceNo: 'INV-2026-999',
          supplierInvoiceDate: '2026-10-22',
          poNumber: 'PO-2026-001',
          gateEntryNo: 'GE-2026-042',
          vehicleNo: 'MH-04-AB-1234',
          remarks: 'Batch inspected and accepted at dock 2',
          items: [
            {
              partId: testPartId,
              receivedQty: 25,
              acceptedQty: 20,
              rejectedQty: 5,
              unitPrice: 450,
              remarks: '5 units damaged in transport rejected',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.grnNumber).toMatch(/^GRN-/);

      // Verify on-hand stock incremented by accepted quantity (20)
      const balAfter = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId);
      expect(balAfter).not.toBeNull();
      expect(balAfter!.qtyOnHand).toBe(onHandBefore + 20);

      // Verify movement ledger entry was created
      const movements = await inventoryService.listMovements({
        locationId: centralWarehouseLocationId,
        partId: testPartId,
        movementType: 'GRN_RECEIPT',
        limit: 5,
      });

      expect(movements.items.length).toBeGreaterThan(0);
      const latestMov = movements.items[0]!;
      expect(latestMov.referenceType).toBe('GRN');
      expect(latestMov.quantity).toBe(20);
      expect(latestMov.stockBucket).toBe('ON_HAND');
    });
  });

  // ============================================================================
  // Test Suite 2: Part Reservations Linked to Service Requests
  // ============================================================================

  describe('2. Service Request Part Reservations', () => {
    it('should reject reservation if requested quantity exceeds available stock', async () => {
      const res = await request(app)
        .post('/api/v1/warehouse/reservations')
        .set('Cookie', whCookie)
        .set('x-csrf-token', whCsrf)
        .send({
          requestId: testRequestId,
          partEntryId: testPartEntryId,
          locationId: centralWarehouseLocationId,
          partId: testPartId,
          quantity: 999999, // Exceeds available
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('should successfully reserve stock without physical issue (available = on-hand - reserved)', async () => {
      const balBefore = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId);
      const onHandBefore = balBefore!.qtyOnHand;
      const reservedBefore = balBefore!.qtyReserved;

      const res = await request(app)
        .post('/api/v1/warehouse/reservations')
        .set('Cookie', whCookie)
        .set('x-csrf-token', whCsrf)
        .send({
          requestId: testRequestId,
          partEntryId: testPartEntryId,
          locationId: centralWarehouseLocationId,
          partId: testPartId,
          quantity: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reservationId).toBeDefined();

      // Verify on-hand remained unchanged, but reserved quantity increased
      const balAfter = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId);
      expect(balAfter!.qtyOnHand).toBe(onHandBefore);
      expect(balAfter!.qtyReserved).toBe(reservedBefore + 2);
      expect(balAfter!.qtyAvailable).toBe(onHandBefore - (reservedBefore + 2));

      // Verify duplicate reservation on same requirement is rejected
      const dupRes = await request(app)
        .post('/api/v1/warehouse/reservations')
        .set('Cookie', whCookie)
        .set('x-csrf-token', whCsrf)
        .send({
          requestId: testRequestId,
          partEntryId: testPartEntryId,
          locationId: centralWarehouseLocationId,
          partId: testPartId,
          quantity: 2,
        });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error.code).toBe('ALREADY_RESERVED');
    });

    it('should release reservation and restore available stock', async () => {
      // Find active reservation
      const resList = await inventoryService.listReservations({ status: 'ACTIVE', limit: 10 });
      const activeRes = resList.items.find((r) => r.requestId === testRequestId);
      expect(activeRes).toBeDefined();

      const balBefore = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId);

      const delRes = await request(app)
        .delete(`/api/v1/warehouse/reservations/${activeRes!.reservationId}`)
        .set('Cookie', whCookie)
        .set('x-csrf-token', whCsrf)
        .send({
          reason: 'Customer rescheduled appointment to next month',
        });

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      const balAfter = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId);
      expect(balAfter!.qtyReserved).toBe(balBefore!.qtyReserved - activeRes!.quantity);
    });
  });

  // ============================================================================
  // Test Suite 3: Outbound Dispatch, Delivery Challan & GST Computation
  // ============================================================================

  describe('3. Outbound Dispatches & Delivery Challans', () => {
    let createdDispatchId: string;

    it('should fulfill stock dispatch, decrement on-hand, increment in-transit, and compute GST lines', async () => {
      // Re-reserve 2 units for the test job
      await inventoryService.reservePartForJob(
        {
          requestId: testRequestId,
          partEntryId: testPartEntryId,
          locationId: centralWarehouseLocationId,
          partId: testPartId,
          quantity: 2,
        },
        {
          userId: warehouseUserId,
          username: 'wh_phase3',
          roles: ['WAREHOUSE'],
          sessionId: 'test',
        }
      );

      const balBefore = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId);

      const res = await request(app)
        .post('/api/v1/warehouse/dispatches')
        .set('Cookie', whCookie)
        .set('x-csrf-token', whCsrf)
        .send({
          documentType: 'DELIVERY_CHALLAN',
          fromLocationId: centralWarehouseLocationId,
          toLocationId: asfLocationId,
          requestId: testRequestId,
          courierName: 'BlueDart Express',
          docketNumber: 'BD-987654321',
          remarks: 'Urgent part shipment for field repair',
          items: [
            {
              partId: testPartId,
              quantity: 2,
              unitPrice: 500,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dispatchNumber).toMatch(/^DC-/);
      expect(res.body.data.totalAmount).toBeGreaterThan(1000); // Base 1000 + GST
      createdDispatchId = res.body.data.dispatchId;

      // Verify on-hand decremented by 2, reserved decremented by 2, in-transit incremented by 2
      const balAfter = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId);
      expect(balAfter!.qtyOnHand).toBe(balBefore!.qtyOnHand - 2);
      expect(balAfter!.qtyReserved).toBe(balBefore!.qtyReserved - 2);
      expect(balAfter!.qtyInTransit).toBe(balBefore!.qtyInTransit + 2);

      // Verify Service Request status transitioned to PART_DISPATCHED_TO_ASF
      const sr = await serviceRequestRepository.findById(testRequestId);
      expect(sr!.status).toBe('PART_DISPATCHED_TO_ASF');
    });

    it('should acknowledge dispatch arrival and transfer stock to destination ASF on-hand balance', async () => {
      const whBalBefore = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId);
      const asfBalBefore = await inventoryService.getStockBalance(asfLocationId, testPartId);
      const asfOnHandBefore = asfBalBefore ? asfBalBefore.qtyOnHand : 0;

      const res = await request(app)
        .post(`/api/v1/warehouse/dispatches/${createdDispatchId}/acknowledge`)
        .set('Cookie', asfCookie)
        .set('x-csrf-token', asfCsrf);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify source location in-transit decremented
      const whBalAfter = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId);
      expect(whBalAfter!.qtyInTransit).toBe(whBalBefore!.qtyInTransit - 2);

      // Verify destination location on-hand incremented
      const asfBalAfter = await inventoryService.getStockBalance(asfLocationId, testPartId);
      expect(asfBalAfter!.qtyOnHand).toBe(asfOnHandBefore + 2);

      // Verify double-acknowledgement is rejected
      const dupAck = await request(app)
        .post(`/api/v1/warehouse/dispatches/${createdDispatchId}/acknowledge`)
        .set('Cookie', asfCookie)
        .set('x-csrf-token', asfCsrf);

      expect(dupAck.status).toBe(400);
      expect(dupAck.body.error.code).toBe('INVALID_STATUS');
    });
  });

  // ============================================================================
  // Test Suite 4: Defective Part Returns & Quarantine Disposition
  // ============================================================================

  describe('4. Defective Part Returns & Quarantine Disposition', () => {
    let createdReturnId: string;

    it('should receive defective parts into warehouse quarantine', async () => {
      const whBalBefore = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId);
      const defectiveBefore = whBalBefore ? whBalBefore.qtyDefective : 0;

      const res = await request(app)
        .post('/api/v1/warehouse/returns')
        .set('Cookie', whCookie)
        .set('x-csrf-token', whCsrf)
        .send({
          fromLocationId: asfLocationId,
          toLocationId: centralWarehouseLocationId,
          requestId: testRequestId,
          items: [
            {
              partId: testPartId,
              quantity: 1,
              defectiveSerialNo: 'DEF-PCB-001',
              defectReason: 'Burnt power capacitor from voltage spike',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.returnNumber).toMatch(/^RET-/);
      createdReturnId = res.body.data.returnId;

      // Verify warehouse defective stock increased
      const whBalAfter = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId);
      expect(whBalAfter!.qtyDefective).toBe(defectiveBefore + 1);
    });

    it('should process return disposition (SCRAP) and decrement quarantine stock', async () => {
      const whBalBefore = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId);

      const res = await request(app)
        .post(`/api/v1/warehouse/returns/${createdReturnId}/disposition`)
        .set('Cookie', whCookie)
        .set('x-csrf-token', whCsrf)
        .send({
          disposition: 'SCRAP',
          remarks: 'Inspected by QA lead; irreparable catastrophic short-circuit certified for scrapping.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify quarantine stock decremented
      const whBalAfter = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId);
      expect(whBalAfter!.qtyDefective).toBe(whBalBefore!.qtyDefective - 1);
    });
  });

  // ============================================================================
  // Test Suite 5: Controlled Stock Adjustments & Reconciliation
  // ============================================================================

  describe('5. Stock Adjustments & Reconciliation Engine', () => {
    it('should require minimum audit remark for stock adjustment', async () => {
      const res = await request(app)
        .post('/api/v1/warehouse/adjustments')
        .set('Cookie', whCookie)
        .set('x-csrf-token', whCsrf)
        .send({
          locationId: centralWarehouseLocationId,
          partId: testPartId2,
          stockBucket: 'ON_HAND',
          adjustmentType: 'INCREASE',
          quantity: 5,
          reason: 'PHYSICAL_AUDIT_SURPLUS',
          remarks: 'abc', // Too short
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should perform controlled stock adjustment and log double-entry movement', async () => {
      const balBefore = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId2);
      const onHandBefore = balBefore ? balBefore.qtyOnHand : 0;

      const res = await request(app)
        .post('/api/v1/warehouse/adjustments')
        .set('Cookie', whCookie)
        .set('x-csrf-token', whCsrf)
        .send({
          locationId: centralWarehouseLocationId,
          partId: testPartId2,
          stockBucket: 'ON_HAND',
          adjustmentType: 'INCREASE',
          quantity: 10,
          reason: 'PHYSICAL_AUDIT_SURPLUS',
          remarks: 'Found unopened supplier box during annual inventory audit in Aisle 4B',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.adjustmentNumber).toMatch(/^ADJ-/);

      const balAfter = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId2);
      expect(balAfter!.qtyOnHand).toBe(onHandBefore + 10);
    });

    it('should verify stock reconciliation matches cached balances with movement sum and returns structured response', async () => {
      const res = await request(app)
        .get(`/api/v1/warehouse/reconcile/${centralWarehouseLocationId}/${testPartId2}`)
        .set('Cookie', whCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('BALANCED');
      expect(res.body.data.isReconciled).toBe(true);
      expect(res.body.data.discrepanciesFound).toBe(false);
      expect(res.body.data.onHand).toBeDefined();
      expect(res.body.data.onHand.isBalanced).toBe(true);
      expect(res.body.data.onHand.difference).toBe(0);
      expect(res.body.data.onHand.cached).toBe(res.body.data.onHand.movementSum);
      expect(res.body.data.reserved).toBeDefined();
      expect(res.body.data.reserved.isBalanced).toBe(true);
      expect(res.body.data.reserved.difference).toBe(0);
      expect(res.body.data.discrepancyOnHand).toBe(0);
      expect(res.body.data.discrepancyReserved).toBe(0);
      expect(res.body.data.lastCheckedAt).toBeDefined();
    });

    it('should guarantee reconciliation is strictly audit-only and does not mutate stock or movement records', async () => {
      const balBefore = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId2);
      const movementsBefore = await inventoryService.listMovements({
        locationId: centralWarehouseLocationId,
        partId: testPartId2,
      });

      const res = await request(app)
        .get(`/api/v1/warehouse/reconcile/${centralWarehouseLocationId}/${testPartId2}`)
        .set('Cookie', whCookie);

      expect(res.status).toBe(200);

      const balAfter = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId2);
      const movementsAfter = await inventoryService.listMovements({
        locationId: centralWarehouseLocationId,
        partId: testPartId2,
      });

      expect(balAfter!.qtyOnHand).toBe(balBefore!.qtyOnHand);
      expect(balAfter!.qtyReserved).toBe(balBefore!.qtyReserved);
      expect(balAfter!.versionNo).toBe(balBefore!.versionNo);
      expect(movementsAfter.total).toBe(movementsBefore.total);
    });

    it('should detect discrepancy when physical balance differs from immutable movement ledger', async () => {
      const conn = await getOracleConnection();
      try {
        // Artificially skew physical on-hand in INVENTORY_BALANCES without adding movement ledger entry
        await conn.execute(
          `UPDATE INVENTORY_BALANCES 
           SET QTY_ON_HAND = QTY_ON_HAND + 5 
           WHERE LOCATION_ID = :loc AND PART_ID = :part`,
          { loc: centralWarehouseLocationId, part: testPartId2 },
          { autoCommit: true }
        );

        const res = await request(app)
          .get(`/api/v1/warehouse/reconcile/${centralWarehouseLocationId}/${testPartId2}`)
          .set('Cookie', whCookie);

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('DISCREPANCY_DETECTED');
        expect(res.body.data.isReconciled).toBe(false);
        expect(res.body.data.discrepanciesFound).toBe(true);
        expect(res.body.data.onHand.isBalanced).toBe(false);
        expect(res.body.data.onHand.difference).toBe(5);
        expect(res.body.data.discrepancyOnHand).toBe(5);

        // Revert artificial skew to restore integrity
        await conn.execute(
          `UPDATE INVENTORY_BALANCES 
           SET QTY_ON_HAND = QTY_ON_HAND - 5 
           WHERE LOCATION_ID = :loc AND PART_ID = :part`,
          { loc: centralWarehouseLocationId, part: testPartId2 },
          { autoCommit: true }
        );
      } finally {
        await conn.close();
      }

      // Re-verify it is balanced again
      const restoreRes = await request(app)
        .get(`/api/v1/warehouse/reconcile/${centralWarehouseLocationId}/${testPartId2}`)
        .set('Cookie', whCookie);
      expect(restoreRes.body.data.status).toBe('BALANCED');
      expect(restoreRes.body.data.isReconciled).toBe(true);
    });

    it('should return valid balanced zero-quantity result for an empty warehouse location', async () => {
      const res = await request(app)
        .get(`/api/v1/warehouse/reconcile/${asfLocationId}/${testPartId2}`)
        .set('Cookie', whCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('BALANCED');
      expect(res.body.data.isReconciled).toBe(true);
      expect(res.body.data.onHand.cached).toBe(0);
      expect(res.body.data.onHand.movementSum).toBe(0);
      expect(res.body.data.onHand.difference).toBe(0);
      expect(res.body.data.reserved.cached).toBe(0);
      expect(res.body.data.reserved.activeReservationSum).toBe(0);
      expect(res.body.data.reserved.difference).toBe(0);
    });

    it('should return 404 when location or part does not exist', async () => {
      const fakeUuid = crypto.randomUUID();
      const resLoc = await request(app)
        .get(`/api/v1/warehouse/reconcile/${fakeUuid}/${testPartId2}`)
        .set('Cookie', whCookie);

      expect(resLoc.status).toBe(404);
      expect(resLoc.body.error.code).toBe('NOT_FOUND');

      const resPart = await request(app)
        .get(`/api/v1/warehouse/reconcile/${centralWarehouseLocationId}/${fakeUuid}`)
        .set('Cookie', whCookie);

      expect(resPart.status).toBe(404);
      expect(resPart.body.error.code).toBe('NOT_FOUND');
    });
  });


  // ============================================================================
  // Test Suite 6: Security & RBAC Gating
  // ============================================================================

  describe('6. Security & RBAC Enforcement', () => {
    it('should prevent Call Center user from adjusting stock (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/warehouse/adjustments')
        .set('Cookie', ccCookie)
        .set('x-csrf-token', ccCsrf)
        .send({
          locationId: centralWarehouseLocationId,
          partId: testPartId,
          stockBucket: 'ON_HAND',
          adjustmentType: 'DECREASE',
          quantity: 1,
          reason: 'SCRAP_WRITE_OFF',
          remarks: 'Unpermitted unauthorized write-off attempt',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow Admin to view movements and stock balances', async () => {
      const res = await request(app)
        .get('/api/v1/warehouse/stock')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();
    });

    it('should prevent Call Center user from executing reconciliation (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/warehouse/reconcile/${centralWarehouseLocationId}/${testPartId2}`)
        .set('Cookie', ccCookie);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject unauthenticated reconciliation requests (401 Unauthorized)', async () => {
      const res = await request(app)
        .get(`/api/v1/warehouse/reconcile/${centralWarehouseLocationId}/${testPartId2}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ============================================================================
  // Test Suite 7: Integration with Job 360 Context & Auto-Release on Cancel
  // ============================================================================

  describe('7. Job 360 Integration & Lifecycle Auto-Release', () => {
    it('should include warehouse reservations and dispatches in Job 360 detail response', async () => {
      const res = await request(app)
        .get(`/api/v1/asf/jobs/${testRequestId}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.warehouse).toBeDefined();
      expect(res.body.data.warehouse.dispatches).toBeDefined();
      expect(res.body.data.warehouse.dispatches.length).toBeGreaterThan(0);
    });

    it('should auto-release active reservations when job cancellation is approved', async () => {
      // 1. Create a new service request with an active reservation
      const customer = await customerRepository.createCustomer({
        fullName: 'Anita Deshmukh',
        primaryMobile: '9820098299',
        addressLine: 'Bandra West',
        stateId: '00000000-0000-0000-0004-000000000001',
        cityId: '00000000-0000-0000-0005-000000000001',
        pincode: '400050',
        customerCategory: 'INDIVIDUAL',
      });

      const models = await modelRepository.listModels({ limit: 1 });
      const model = models.items[0]!;

      const conn = await (await import('../src/database/oraclePool.js')).getOracleConnection();
      let partEntryId: string;
      let srRequestId: string;
      try {
        const jobNumber = await serviceRequestRepository.generateJobNumber('SK', 'AC', conn);
        const registeredAt = new Date();
        const sla48hExpiresAt = new Date(registeredAt.getTime() + 48 * 3600 * 1000);

        const sr = await serviceRequestRepository.createServiceRequest(
          {
            jobNumber,
            customerId: customer.customerId,
            brandId: model.brandId,
            productId: model.productId,
            modelId: model.modelId,
            customerPhone: '9820098299',
            customerAddress: 'Bandra West',
            customerPincode: '400050',
            complaintDescription: 'Test cancellation job',
            callType: 'REPAIR',
            serviceType: 'ON_SITE',
            warrantyStatus: 'IN_WARRANTY',
            assignedLocationId: asfLocationId,
            status: 'PENDING_SPARE_PART',
            createdChannel: 'CALL_CENTER',
            registeredBy: adminUserId,
            registeredByUsername: 'admin_test',
            sla48hExpiresAt,
          },
          conn
        );
        srRequestId = sr.requestId;

        partEntryId = await serviceRequestPartsRepository.addPart(
          {
            requestId: sr.requestId,
            partId: testPartId,
            quantity: 3,
            unitPrice: 500,
            totalPrice: 1500,
            isChargeableToCustomer: 'N',
            entryType: 'REQUIRED_PNA',
            status: 'PENDING_FULFILLMENT',
            actorUsername: 'eng_test',
          },
          conn
        );
        await conn.commit();
      } finally {
        await conn.close();
      }

      // Reserve 3 units
      await inventoryService.reservePartForJob(
        {
          requestId: srRequestId,
          partEntryId,
          locationId: centralWarehouseLocationId,
          partId: testPartId,
          quantity: 3,
        },
        {
          userId: warehouseUserId,
          username: 'wh_phase3',
          roles: ['WAREHOUSE'],
          sessionId: 'test',
        }
      );

      const balBefore = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId);
      const reservedBefore = balBefore!.qtyReserved;

      // 2. Request cancellation
      const reqCanc = await request(app)
        .post(`/api/v1/asf/jobs/${srRequestId}/cancellation`)
        .set('Cookie', ccCookie)
        .set('x-csrf-token', ccCsrf)
        .send({
          reasonCode: 'REASON_1',
          remarks: 'Customer relocated abroad; unable to service',
        });

      expect(reqCanc.status).toBe(201);
      const cancellationId = reqCanc.body.data.cancellationId;

      // 3. Admin approves cancellation
      const approveRes = await request(app)
        .post(`/api/v1/asf/cancellations/${cancellationId}/review`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          decision: 'APPROVED',
          reviewRemarks: 'Verified cancellation. Active reservations must be released.',
        });

      expect(approveRes.status).toBe(200);

      // Verify that the 3 reserved units were automatically released back to available
      const balAfter = await inventoryService.getStockBalance(centralWarehouseLocationId, testPartId);
      expect(balAfter!.qtyReserved).toBe(reservedBefore - 3);

      // Verify reservation status is now RELEASED
      const reservations = await inventoryService.listReservations({ status: 'RELEASED', limit: 10 });
      const releasedRes = reservations.items.find((r) => r.requestId === srRequestId);
      expect(releasedRes).toBeDefined();
      expect(releasedRes!.status).toBe('RELEASED');
    });
  });

  // ============================================================================
  // 10. Warehouse Dashboard & KPI Contract Integrity
  // ============================================================================

  describe('10. Warehouse Dashboard & KPI Contract Integrity', () => {
    it('returns full structured KPIs, locations, and recent records for authorized Warehouse user', async () => {
      const res = await request(app)
        .get('/api/v1/warehouse/dashboard')
        .set('Cookie', whCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dashboard = res.body.data;
      expect(dashboard).toBeDefined();

      // Verify nested kpis object
      expect(dashboard.kpis).toBeDefined();
      expect(typeof dashboard.kpis.totalStockOnHand).toBe('number');
      expect(typeof dashboard.kpis.totalStockReserved).toBe('number');
      expect(typeof dashboard.kpis.totalStockInTransit).toBe('number');
      expect(typeof dashboard.kpis.totalStockDefective).toBe('number');
      expect(typeof dashboard.kpis.lowStockPartCount).toBe('number');
      expect(typeof dashboard.kpis.pendingPartRequestCount).toBe('number');
      expect(typeof dashboard.kpis.dispatchesPendingArrival).toBe('number');

      // Verify locations array is populated with active locations
      expect(dashboard.locations).toBeInstanceOf(Array);
      expect(dashboard.locations.length).toBeGreaterThan(0);
      expect(dashboard.locations[0]).toHaveProperty('locationId');
      expect(dashboard.locations[0]).toHaveProperty('locationName');

      // Verify recent records arrays
      expect(dashboard.recentDispatches).toBeInstanceOf(Array);
      expect(dashboard.recentGrns).toBeInstanceOf(Array);

      // Verify flat backwards-compatibility properties
      expect(typeof dashboard.totalOnHandUnits).toBe('number');
      expect(dashboard.totalOnHandUnits).toBe(dashboard.kpis.totalStockOnHand);
    });

    it('rejects unauthenticated request to /api/v1/warehouse/dashboard (401)', async () => {
      const res = await request(app).get('/api/v1/warehouse/dashboard');
      expect(res.status).toBe(401);
    });
  });
});
