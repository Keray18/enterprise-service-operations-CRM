import crypto from 'crypto';
import oracledb from 'oracledb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOracleConnection } from '../src/database/oraclePool.js';
import { brandWalletRepository } from '../src/database/repositories/brandWalletRepository.js';
import { engineeringMasterRepository } from '../src/database/repositories/engineeringMasterRepository.js';
import { financialJournalRepository } from '../src/database/repositories/financialJournalRepository.js';
import { inventoryRepository } from '../src/database/repositories/inventoryRepository.js';
import { locationRepository } from '../src/database/repositories/locationRepository.js';
import { notificationRepository } from '../src/database/repositories/notificationRepository.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { reportingRepository } from '../src/database/repositories/reportingRepository.js';
import { serviceClaimRepository } from '../src/database/repositories/serviceClaimRepository.js';
import { serviceRequestEventRepository } from '../src/database/repositories/serviceRequestEventRepository.js';
import { serviceRequestRepository } from '../src/database/repositories/serviceRequestRepository.js';
import { slaPenaltyRepository } from '../src/database/repositories/slaPenaltyRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { asfService } from '../src/services/asfService.js';
import { callCenterService } from '../src/services/callCenterService.js';
import { financeService } from '../src/services/financeService.js';
import { inventoryService } from '../src/services/inventoryService.js';
import { job360Service } from '../src/services/job360Service.js';
import { mockSmsAdapter } from '../src/services/notificationService.js';
import { slaMonitoringService } from '../src/services/slaMonitoringService.js';
import { AuthenticatedUser } from '../src/types/auth.js';
import { decryptNotificationPayload } from '../src/utils/cryptoUtils.js';

describe('End-to-End Business UAT: Full CRM Service, Supply Chain & Financial Lifecycle', () => {
  // Test actors with strict role boundaries
  const callCenterActor: AuthenticatedUser = {
    userId: '00000000-0000-0000-0000-000000000005',
    username: 'cc_uat_agent',
    email: 'callcenter.uat@crm.internal',
    roles: ['CALL_CENTER'],
    permissions: ['calls:create', 'calls:read'],
  };

  let mumbaiAsfId: string;
  let delhiWhId: string;

  const asfManagerActor: AuthenticatedUser = {
    userId: '00000000-0000-0000-0000-000000000099',
    username: 'mumbai_asf_mgr',
    email: 'mumbai.asf@franchise.local',
    fullName: 'Mumbai Service Manager',
    roles: ['ASF'],
    permissions: ['asf:read', 'asf:manage', 'calls:read', 'calls:assign', 'calls:update', 'finance:claims'],
  };

  const technicianActor: AuthenticatedUser = {
    userId: '00000000-0000-0000-0000-000000000002',
    username: 'mumbai_tech_1',
    email: 'tech1.mumbai@franchise.local',
    fullName: 'Field Engineer Mumbai',
    roles: ['ENGINEER'],
    permissions: ['asf:read', 'calls:read', 'calls:checkin', 'calls:diagnose', 'calls:repair', 'calls:close'],
  };

  const warehouseActor: AuthenticatedUser = {
    userId: '00000000-0000-0000-0000-000000000007',
    username: 'central_wh_operator',
    email: 'warehouse.delhi@logistics.internal',
    fullName: 'Delhi Central Warehouse Lead',
    roles: ['WAREHOUSE'],
    permissions: ['inventory:read', 'inventory:manage', 'inventory:dispatch'],
  };

  const financeAuditorActor: AuthenticatedUser = {
    userId: '00000000-0000-0000-0000-000000000006',
    username: 'finance_officer',
    email: 'finance@enterprise.local',
    fullName: 'Corporate Finance Officer',
    roles: ['FINANCE'],
    permissions: ['finance:read', 'finance:claims', 'finance:approve', 'finance:post', 'finance:wallets', 'reports:view'],
  };

  const adminActor: AuthenticatedUser = {
    userId: '958d124e-135d-44de-b72c-f7ee96081205',
    username: 'admin',
    email: 'admin@enterprise.local',
    fullName: 'Enterprise Administrator',
    roles: ['ADMIN'],
    permissions: ['users:read', 'masters:manage', 'reports:view', 'sla:manage', 'finance:read', 'finance:approve'],
  };

  // Lifecycle state tracking
  let testCustomerId: string;
  let testBrandId: string;
  let testProductId: string;
  let testModelId: string;
  let testSerialLength = 15;
  let testPincode: string;
  let originalDefaultAsfId: string | null = null;
  let testPartId: string;
  let testFaultId: string;
  let testRepairCodeId: string;
  let testServiceRequestId: string;
  let testJobNumber: string;
  let testDispatchId: string;
  let testClaimId: string;
  const createdRequestIds: string[] = [];

  beforeAll(async () => {
    mockSmsAdapter.clear();
    const conn = await getOracleConnection();
    try {
      // 1. Provision valid locations
      const locAsf = await locationRepository.createLocation({
        locationCode: `ASF_UAT_${Date.now().toString(36).toUpperCase()}`,
        locationName: 'Mumbai Central Franchise Center',
        partyType: 'ASF',
        isActive: 'Y',
      });
      mumbaiAsfId = locAsf.locationId;
      asfManagerActor.locationId = mumbaiAsfId;
      technicianActor.locationId = mumbaiAsfId;

      const locWh = await locationRepository.createLocation({
        locationCode: `WH_UAT_${Date.now().toString(36).toUpperCase()}`,
        locationName: 'Delhi Central Logistics Hub',
        partyType: 'CENTRAL_WAREHOUSE',
        isActive: 'Y',
      });
      delhiWhId = locWh.locationId;
      warehouseActor.locationId = delhiWhId;

      // 2. Fetch valid active foreign keys
      const res = await conn.execute<any>(
        `SELECT c.CUSTOMER_ID, m.BRAND_ID, m.PRODUCT_ID, m.MODEL_ID, m.SERIAL_NUMBER_LENGTH
         FROM CUSTOMERS c, MODELS m
         WHERE c.IS_ACTIVE = 'Y' AND m.IS_ACTIVE = 'Y' AND ROWNUM = 1`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const row = res.rows?.[0];
      testCustomerId = row.CUSTOMER_ID;
      testBrandId = row.BRAND_ID;
      testProductId = row.PRODUCT_ID;
      testModelId = row.MODEL_ID;
      testSerialLength = row.SERIAL_NUMBER_LENGTH || 15;

      // 3. Configure valid serviceable pincode mapping to mumbaiAsfId
      const pinRes = await conn.execute<any>(
        `SELECT PINCODE, DEFAULT_ASF_ID FROM PINCODES WHERE IS_SERVICEABLE = 'Y' AND ROWNUM = 1`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      testPincode = pinRes.rows?.[0]?.PINCODE || '400001';
      originalDefaultAsfId = pinRes.rows?.[0]?.DEFAULT_ASF_ID || null;

      await conn.execute(
        `UPDATE PINCODES SET DEFAULT_ASF_ID = :asfId, IS_SERVICEABLE = 'Y' WHERE PINCODE = :pincode`,
        { asfId: mumbaiAsfId, pincode: testPincode }
      );

      // 4. Find or seed a valid part code compatible with testBrandId
      const partRes = await conn.execute<any>(
        `SELECT PART_ID FROM PART_CODES WHERE (BRAND_ID = :brandId OR BRAND_ID IS NULL) AND IS_ACTIVE = 'Y' AND ROWNUM = 1`,
        { brandId: testBrandId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (partRes.rows && partRes.rows.length > 0) {
        testPartId = partRes.rows[0].PART_ID;
      } else {
        const anyPart = await conn.execute<any>(
          `SELECT PART_ID FROM PART_CODES WHERE IS_ACTIVE = 'Y' AND ROWNUM = 1`,
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        testPartId = anyPart.rows?.[0]?.PART_ID || '00000000-0000-0000-0003-000000000001';
        await conn.execute(
          `UPDATE PART_CODES SET BRAND_ID = :brandId WHERE PART_ID = :partId`,
          { brandId: testBrandId, partId: testPartId }
        );
      }

      // 5. Find valid active fault and repair masters
      const faultRes = await conn.execute<any>(
        `SELECT FAULT_ID FROM FAULT_MASTERS WHERE IS_ACTIVE = 'Y' AND ROWNUM = 1`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      testFaultId = faultRes.rows?.[0]?.FAULT_ID;

      const repairRes = await conn.execute<any>(
        `SELECT REPAIR_CODE_ID FROM REPAIR_CODE_MASTERS WHERE IS_ACTIVE = 'Y' AND ROWNUM = 1`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      testRepairCodeId = repairRes.rows?.[0]?.REPAIR_CODE_ID;

      // 6. Ensure warehouse location has sufficient stock for test
      await inventoryRepository.upsertBalanceDeltas(
        {
          locationId: delhiWhId,
          partId: testPartId,
          deltaOnHand: 10,
        },
        conn
      );

      // 7. Ensure brand wallet exists and has sufficient funds
      const walletRes = await conn.execute<any>(
        `SELECT WALLET_ID, CURRENT_BALANCE FROM BRAND_WALLETS WHERE BRAND_ID = :brandId`,
        { brandId: testBrandId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (!walletRes.rows || walletRes.rows.length === 0) {
        await conn.execute(
          `INSERT INTO BRAND_WALLETS (
            WALLET_ID, BRAND_ID, CURRENT_BALANCE, STATUS,
            LOW_BALANCE_THRESHOLD, CREATED_AT, UPDATED_AT
          ) VALUES (
            :walletId, :brandId, 10000.0, 'ACTIVE', 500.0, SYSTIMESTAMP, SYSTIMESTAMP
          )`,
          { walletId: crypto.randomUUID(), brandId: testBrandId }
        );
      } else {
        await conn.execute(
          `UPDATE BRAND_WALLETS SET CURRENT_BALANCE = 10000.0, STATUS = 'ACTIVE' WHERE BRAND_ID = :brandId`,
          { brandId: testBrandId }
        );
      }

      // 8. Provision all test actors in APP_USERS so FK constraints succeed
      const allActors = [
        { actor: callCenterActor, role: 'CALL_CENTER', loc: null },
        { actor: asfManagerActor, role: 'ASF', loc: mumbaiAsfId },
        { actor: technicianActor, role: 'ENGINEER', loc: mumbaiAsfId },
        { actor: warehouseActor, role: 'WAREHOUSE', loc: delhiWhId },
        { actor: financeAuditorActor, role: 'FINANCE', loc: null },
      ];

      for (const item of allActors) {
        const u = await userRepository.findById(item.actor.userId);
        if (!u) {
          await userRepository.createUser({
            userId: item.actor.userId,
            username: item.actor.username,
            email: item.actor.email,
            fullName: item.actor.fullName || item.actor.username,
            passwordHash: 'seeded_uat_hash',
            locationId: item.loc || undefined,
            phoneNumber: '+919876543210',
          });
          await rbacRepository.assignRoleToUser(item.actor.userId, item.role, 'UAT_SETUP');
        } else {
          await conn.execute(
            `UPDATE APP_USERS SET LOCATION_ID = :loc, IS_ACTIVE = 'Y' WHERE USER_ID = :id`,
            { loc: item.loc, id: item.actor.userId }
          );
          const roles = await rbacRepository.getUserRoles(item.actor.userId);
          if (!roles.includes(item.role)) {
            await rbacRepository.assignRoleToUser(item.actor.userId, item.role, 'UAT_SETUP');
          }
        }
      }

      await conn.commit();
    } finally {
      await conn.close();
    }
  });

  afterAll(async () => {
    const conn = await getOracleConnection();
    try {
      // Restore pincode default ASF
      if (testPincode) {
        await conn.execute(
          `UPDATE PINCODES SET DEFAULT_ASF_ID = :asfId WHERE PINCODE = :pincode`,
          { asfId: originalDefaultAsfId, pincode: testPincode }
        );
      }

      // 1. Delete dependent SLA penalties, events, outbox, parts, verifications
      for (const reqId of createdRequestIds) {
        await conn.execute('DELETE FROM SLA_PENALTY_RECORDS WHERE SERVICE_REQUEST_ID = :id', { id: reqId });
        await conn.execute('DELETE FROM SERVICE_REQUEST_EVENTS WHERE REQUEST_ID = :id', { id: reqId });
        await conn.execute('DELETE FROM NOTIFICATIONS_OUTBOX WHERE REQUEST_ID = :id', { id: reqId });
        await conn.execute('DELETE FROM CLAIM_LINE_ITEMS WHERE SERVICE_REQUEST_ID = :id', { id: reqId });
        await conn.execute('DELETE FROM SERVICE_REQUEST_PARTS WHERE REQUEST_ID = :id', { id: reqId });
        await conn.execute('DELETE FROM SERVICE_REQUEST_VERIFICATIONS WHERE REQUEST_ID = :id', { id: reqId });
      }

      // 2. Delete dispatches referencing requests
      if (testDispatchId) {
        await conn.execute('DELETE FROM DISPATCH_ITEMS WHERE DISPATCH_ID = :id', { id: testDispatchId });
        await conn.execute('DELETE FROM STOCK_DISPATCHES WHERE DISPATCH_ID = :id', { id: testDispatchId });
      }

      // 3. Delete claims
      if (testClaimId) {
        await conn.execute('DELETE FROM CLAIM_LINE_ITEMS WHERE CLAIM_ID = :id', { id: testClaimId });
        await conn.execute('DELETE FROM SERVICE_CLAIMS WHERE CLAIM_ID = :id', { id: testClaimId });
      }

      // 4. Delete service requests
      for (const reqId of createdRequestIds) {
        await conn.execute('DELETE FROM SERVICE_REQUESTS WHERE REQUEST_ID = :id', { id: reqId });
      }

      // 5. Clear APP_USERS location references to prevent FK violation on LOCATIONS
      await conn.execute(
        `UPDATE APP_USERS SET LOCATION_ID = NULL WHERE USER_ID IN (
          '00000000-0000-0000-0000-000000000099',
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000007'
        )`
      );

      // 6. Delete inventory and locations
      if (delhiWhId) {
        await conn.execute('DELETE FROM INVENTORY_MOVEMENTS WHERE LOCATION_ID = :id OR SOURCE_LOCATION_ID = :id OR DEST_LOCATION_ID = :id', { id: delhiWhId });
        await conn.execute('DELETE FROM INVENTORY_BALANCES WHERE LOCATION_ID = :id', { id: delhiWhId });
        await conn.execute('DELETE FROM LOCATIONS WHERE LOCATION_ID = :id', { id: delhiWhId });
      }
      if (mumbaiAsfId) {
        await conn.execute('DELETE FROM INVENTORY_MOVEMENTS WHERE LOCATION_ID = :id OR SOURCE_LOCATION_ID = :id OR DEST_LOCATION_ID = :id', { id: mumbaiAsfId });
        await conn.execute('DELETE FROM INVENTORY_BALANCES WHERE LOCATION_ID = :id', { id: mumbaiAsfId });
        await conn.execute('DELETE FROM LOCATIONS WHERE LOCATION_ID = :id', { id: mumbaiAsfId });
      }

      await conn.commit();
    } finally {
      await conn.close();
    }
  });

  // ============================================================================
  // Step 1: Call Center Intake & Fast Complaint Registration
  // ============================================================================
  it('Step 1: Call Center registers a complaint using authorized model & customer lookup', async () => {
    const rawSn = `SN${Date.now()}`;
    const formattedSerial = rawSn.padEnd(testSerialLength, 'X').slice(0, testSerialLength);

    const registrationResult = await callCenterService.registerServiceRequest(
      {
        customerId: testCustomerId,
        brandId: testBrandId,
        productId: testProductId,
        modelId: testModelId,
        serialNumber: formattedSerial,
        callType: 'REPAIR',
        serviceType: 'ON_SITE',
        pincode: testPincode,
        addressLine: '123 Marine Drive, Nariman Point',
        problemDescription: 'Cooling coil not functioning properly. Customer requests immediate check.',
      },
      callCenterActor
    );

    expect(registrationResult.serviceRequest).toBeDefined();
    testServiceRequestId = registrationResult.serviceRequest.requestId;
    testJobNumber = registrationResult.serviceRequest.jobNumber;
    createdRequestIds.push(testServiceRequestId);

    expect(registrationResult.serviceRequest.status).toBe('REGISTERED');
    expect(registrationResult.serviceRequest.assignedLocationId).toBe(mumbaiAsfId);
    expect(registrationResult.serviceRequest.slaBreached48h).toBe('N');
    expect(registrationResult.serviceRequest.sla48hExpiresAt).toBeDefined();

    // Verify SMS 1 was queued in outbox
    expect(registrationResult.smsQueued).toBe(true);

    // Verify immutable transition event
    const events = await serviceRequestEventRepository.findByRequestId(testServiceRequestId);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].eventType).toBe('CALL_REGISTERED');
  });

  // ============================================================================
  // Step 2: ASF Receives, Assigns Engineer & Acknowledges the Job (Single-Commit)
  // ============================================================================
  it('Step 2: ASF Franchisee dispatches technician and acknowledges job within 48h SLA window', async () => {
    // Unassigned manager cannot dispatch for a different franchise location (Scoping violation check)
    const unauthorizedActor: AuthenticatedUser = {
      ...asfManagerActor,
      locationId: '00000000-0000-0000-0004-999999999999',
    };
    await expect(
      asfService.dispatchComplaint(
        {
          requestId: testServiceRequestId,
          engineerId: technicianActor.userId,
          appointmentDate: new Date(),
          appointmentSlot: '10:00 - 13:00',
        },
        unauthorizedActor
      )
    ).rejects.toThrow(/Cannot dispatch request assigned to another franchise center|FORBIDDEN/i);

    // Authorized Mumbai ASF manager assigns engineer and schedules appointment (Single-commit acknowledgment)
    const dispatchResult = await asfService.dispatchComplaint(
      {
        requestId: testServiceRequestId,
        engineerId: technicianActor.userId,
        appointmentDate: new Date(),
        appointmentSlot: '10:00 - 13:00',
        travelDistanceKm: 15,
        areaType: 'LOCAL',
        remarks: 'Assigned to senior engineer for priority inspection',
      },
      asfManagerActor
    );

    expect(dispatchResult.serviceRequest).toBeDefined();
    expect(dispatchResult.serviceRequest.status).toBe('APPOINTMENT_SCHEDULED');
    expect(dispatchResult.serviceRequest.acknowledgedAt).toBeDefined();
    expect(dispatchResult.serviceRequest.slaBreached48h).toBe('N');
    expect(dispatchResult.smsQueued).toBe(true);

    // Verify database record has acknowledged timestamp
    const updated = await serviceRequestRepository.findById(testServiceRequestId);
    expect(updated?.status).toBe('APPOINTMENT_SCHEDULED');
    expect(updated?.acknowledgedAt).toBeDefined();
    expect(updated?.slaBreached48h).toBe('N');
  });

  // ============================================================================
  // Step 3: Engineer Check-in, Diagnosis & PNA Spare Part Requirement
  // ============================================================================
  it('Step 3: Engineer checks in via customer OTP, diagnoses defect, and requests required PNA spare part', async () => {
    // 1. Retrieve customer Check-In OTP from mock SMS delivery or encrypted outbox
    let checkInOtp: string | undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      const sent = mockSmsAdapter.getSentMessages();
      const apptSms = sent.find((s) => s.templateCode === 'SMS_02_APPOINTMENT' || s.messageBody.includes('check-in OTP'));
      if (apptSms) {
        const m = apptSms.messageBody.match(/\b(\d{6})\b/);
        if (m) {
          checkInOtp = m[1];
          break;
        }
      }
      const outbox = await notificationRepository.listByRequestId(testServiceRequestId);
      const notif = outbox.find((n) => n.templateCode === 'SMS_02_APPOINTMENT');
      if (notif?.encryptedPayload) {
        const dec = decryptNotificationPayload({
          encryptedPayload: notif.encryptedPayload,
          iv: notif.encryptionIv!,
          authTag: notif.authTag!,
          keyVersion: notif.keyVersion || 'v1',
        });
        const m = dec.match(/\b(\d{6})\b/);
        if (m) {
          checkInOtp = m[1];
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(checkInOtp).toBeDefined();

    // 2. Engineer executes on-site check-in with verified OTP
    const checkInResult = await asfService.checkInWithOtp(
      {
        requestId: testServiceRequestId,
        otp: checkInOtp!,
        remarks: 'Technician arrived on customer site',
      },
      technicianActor
    );
    expect(checkInResult.verified).toBe(true);
    expect(checkInResult.serviceRequest.status).toBe('TECHNICIAN_CHECKED_IN');

    // 3. Engineer records defect diagnosis
    const diagnosedResult = await job360Service.recordDiagnosis(
      testServiceRequestId,
      {
        faultId: testFaultId,
        voeDescription: 'Cooling coil leak detected during physical inspection',
        observations: 'Low refrigerant pressure, coil surface oily',
        physicalSerialVerified: true,
      },
      technicianActor
    );
    expect(diagnosedResult.status).toBe('IN_PROGRESS_REPAIR');

    // 4. Engineer records repair action requiring PNA part (SLA timer paused per Decision 2.2)
    const repairResult = await job360Service.recordRepair(
      testServiceRequestId,
      {
        repairCodeId: testRepairCodeId,
        repairAction: 'PENDING_SPARE_PART',
        repairRemarks: 'Evaporator coil damaged, awaiting warehouse PNA fulfillment',
      },
      technicianActor
    );
    expect(repairResult.status).toBe('PENDING_SPARE_PART');

    // 5. Engineer records required PNA part entry on job
    const partResult = await job360Service.addPartToJob(
      testServiceRequestId,
      {
        partId: testPartId,
        quantity: 1,
        entryType: 'REQUIRED_PNA',
        remarks: 'Coil leaky, requires central warehouse PNA dispatch',
      },
      technicianActor
    );
    expect(partResult.partEntryId).toBeDefined();

    // Verify ticket status is PENDING_SPARE_PART in database
    const afterPart = await serviceRequestRepository.findById(testServiceRequestId);
    expect(afterPart?.status).toBe('PENDING_SPARE_PART');
  });

  // ============================================================================
  // Step 4: Central Warehouse Dispatches Part & Destination ASF Acknowledges Receipt
  // ============================================================================
  it('Step 4: Central Warehouse dispatches part and destination ASF acknowledges receipt', async () => {
    // 1. Warehouse dispatches the required part
    const dispatchRes = await inventoryService.fulfillStockDispatch(
      {
        documentType: 'DELIVERY_CHALLAN',
        fromLocationId: delhiWhId,
        toLocationId: mumbaiAsfId,
        requestId: testServiceRequestId,
        courierName: 'BlueDart Express',
        docketNumber: `BD-${Date.now().toString().slice(-8)}`,
        remarks: 'PNA part dispatch for job ' + testJobNumber,
        items: [{ partId: testPartId, quantity: 1 }],
      },
      warehouseActor
    );

    expect(dispatchRes.dispatchId).toBeDefined();
    testDispatchId = dispatchRes.dispatchId;

    // Verify request transitioned to PART_DISPATCHED_TO_ASF
    const dispatchedReq = await serviceRequestRepository.findById(testServiceRequestId);
    expect(dispatchedReq?.status).toBe('PART_DISPATCHED_TO_ASF');

    // 2. Destination ASF acknowledges arrival
    const ackDispatch = await inventoryService.acknowledgeDispatchArrival(testDispatchId, asfManagerActor);
    expect(ackDispatch.success).toBe(true);

    // Transition back to IN_PROGRESS_REPAIR for technician completion
    const conn = await getOracleConnection();
    try {
      await serviceRequestRepository.updateStatus(testServiceRequestId, 'IN_PROGRESS_REPAIR', conn);
      await conn.commit();
    } finally {
      await conn.close();
    }
  });

  // ============================================================================
  // Step 5: Engineer Completes Repair & Verified Customer Closure (Happy Code)
  // ============================================================================
  it('Step 5: Engineer completes repair and completes customer Happy Code OTP verification', async () => {
    // 1. Record completed repair with part
    await job360Service.recordRepair(
      testServiceRequestId,
      {
        repairCodeId: testRepairCodeId,
        repairAction: 'REPAIRED_WITH_PART',
        repairRemarks: 'Installed new coil from warehouse. Tested pressure and cooling.',
      },
      technicianActor
    );

    // Transition status to IN_PROGRESS_REPAIR to initiate customer closure
    const conn = await getOracleConnection();
    try {
      await serviceRequestRepository.updateStatus(testServiceRequestId, 'IN_PROGRESS_REPAIR', conn);
      await conn.commit();
    } finally {
      await conn.close();
    }

    // 2. Technician initiates closure (Generates Happy Code and queues SMS 4)
    const closureInit = await job360Service.initiateClosure(
      testServiceRequestId,
      technicianActor,
      'Repair successfully completed. Customer verification requested.'
    );
    expect(closureInit.status).toBe('CALL_CLOSURE_SUBMITTED');

    // 3. Retrieve customer Happy Code from mock SMS or encrypted outbox
    let customerHappyCode: string | undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      const sent = mockSmsAdapter.getSentMessages();
      const happySms = sent.find((s) => s.templateCode === 'SMS_4_CALL_CLOSURE' || s.messageBody.includes('Happy Code'));
      if (happySms) {
        const m = happySms.messageBody.match(/\b(\d{6})\b/);
        if (m) {
          customerHappyCode = m[1];
          break;
        }
      }
      const outbox = await notificationRepository.listByRequestId(testServiceRequestId);
      const notif = outbox.find((n) => n.templateCode === 'SMS_4_CALL_CLOSURE');
      if (notif?.encryptedPayload) {
        const dec = decryptNotificationPayload({
          encryptedPayload: notif.encryptedPayload,
          iv: notif.encryptionIv!,
          authTag: notif.authTag!,
          keyVersion: notif.keyVersion || 'v1',
        });
        const m = dec.match(/\b(\d{6})\b/);
        if (m) {
          customerHappyCode = m[1];
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(customerHappyCode).toBeDefined();

    // 4. Technician verifies customer Happy Code and permanently closes call
    const closureResult = await job360Service.verifyHappyCodeAndClose(
      testServiceRequestId,
      { happyCode: customerHappyCode! },
      technicianActor
    );
    expect(closureResult.status).toBe('CLOSED');

    const closedSr = await serviceRequestRepository.findById(testServiceRequestId);
    expect(closedSr?.status).toBe('CLOSED');
    expect(closedSr?.closedAt).toBeDefined();
  });

  // ============================================================================
  // Step 6: Monthly Warranty Claim Generation, Independent Audit & Balanced Journal
  // ============================================================================
  it('Step 6: Warranty claim is generated, reviewed by independent Finance user, and posted through balanced journal', async () => {
    const conn = await getOracleConnection();
    try {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;

      // 1. Generate claim batch for Mumbai ASF
      const testClaim = await serviceClaimRepository.createClaimBatch(
        {
          claimMonth: currentMonth,
          claimYear: currentYear,
          asfLocationId: mumbaiAsfId,
          brandId: testBrandId,
          totalJobsCount: 1,
          grossLaborAmount: 450.0,
          grossTravelAmount: 50.0,
          penaltyDeductionAmount: 0.0,
          netClaimAmount: 500.0,
          status: 'SUBMITTED',
          submittedBy: asfManagerActor.userId,
          submittedByUsername: asfManagerActor.username,
          remarks: 'UAT Monthly Claim Batch',
          lineItems: [
            {
              serviceRequestId: testServiceRequestId,
              jobNumber: testJobNumber,
              callType: 'REPAIR',
              productName: 'Air Conditioner',
              isHappyCodeVerified: 'Y',
              completionTatHours: 24,
              tatAppliedPercentage: 100,
              baseLaborAmount: 450.0,
              claimableLaborAmount: 450.0,
              travelKm: 15.0,
              travelAmount: 50.0,
              penaltyAmount: 0.0,
              netLineAmount: 500.0,
              auditStatus: 'VERIFIED',
              auditNote: 'Verified during end-to-end UAT',
            },
          ],
        },
        conn
      );
      await conn.commit();
      testClaimId = testClaim.claimId;
      expect(testClaim.status).toBe('SUBMITTED');

      // 2. Segregation of Duties: claimant cannot audit own claim
      await expect(
        financeService.auditClaimBatch(testClaimId, { action: 'APPROVE' }, asfManagerActor)
      ).rejects.toThrow(/Forbidden|Segregation of duties violation/i);

      // 3. Independent Finance user audits and approves claim (Posts balanced double-entry journal)
      const auditedClaim = await financeService.auditClaimBatch(
        testClaimId,
        { action: 'APPROVE', rejectionReason: undefined },
        financeAuditorActor
      );
      expect(auditedClaim.status).toBe('POSTED');
      expect(auditedClaim.journalId).toBeDefined();

      // 4. Verify journal immutability and balance: Total Debits == Total Credits
      const journal = await financialJournalRepository.getJournalById(auditedClaim.journalId!);
      expect(journal).toBeDefined();
      expect(journal!.status).toBe('POSTED');
      expect(journal!.totalDebit).toBe(journal!.totalCredit);
      expect(journal!.totalDebit).toBe(500.0);
    } finally {
      await conn.close();
    }
  });

  // ============================================================================
  // Step 7: Authorized Finance Personnel Inspect Settlement Lifecycle & Wallets
  // ============================================================================
  it('Step 7: Authorized Finance personnel inspect wallet and settlement integrity', async () => {
    // Unauthorized user denied (RBAC check on financial auditing)
    await expect(
      financeService.auditClaimBatch(testClaimId, { action: 'APPROVE' }, callCenterActor)
    ).rejects.toThrow(/Forbidden/i);

    // Authorized Finance user inspects brand wallet
    const wallet = await brandWalletRepository.getWalletByBrandId(testBrandId);
    expect(wallet).toBeDefined();
    expect(wallet!.status).toBe('ACTIVE');
    expect(wallet!.currentBalance).toBeGreaterThanOrEqual(0);
  });

  // ============================================================================
  // Step 8: SLA Breach Evaluation Produces Review Records Without Unauthorized Debits
  // ============================================================================
  it('Step 8: SLA breaches produce review records without unauthorized monetary posting', async () => {
    // Run SLA monitors
    const ackResult = await slaMonitoringService.evaluate48hSlaBreaches(adminActor.userId);
    expect(ackResult).toBeDefined();
    expect(typeof ackResult.evaluatedCount).toBe('number');

    const closureResult = await slaMonitoringService.evaluate168hSlaBreaches(adminActor.userId);
    expect(closureResult).toBeDefined();
    expect(typeof closureResult.evaluatedCount).toBe('number');

    // Verify all SLA penalties in PENDING_REVIEW have 0.0 calculated amount (hardcoded debit prohibited)
    const pendingPenalties = await slaPenaltyRepository.listPenalties({ status: 'PENDING_REVIEW' });
    for (const p of pendingPenalties.items) {
      expect(p.status).toBe('PENDING_REVIEW');
      expect(p.calculatedAmount).toBe(0.0);
      expect(p.configStatus).toBe('AWAITING_POLICY_CONFIGURATION');
    }
  });

  // ============================================================================
  // Step 9: Admin Dashboard KPIs and Reports Reflect Resulting Business Events
  // ============================================================================
  it('Step 9: Admin dashboard KPIs and Reports page reflect resulting operational & financial events accurately', async () => {
    // 1. Admin Dashboard Summary
    const dashboard = await reportingRepository.getAdminDashboardSummary('today', undefined, undefined, adminActor.permissions);
    expect(dashboard).toBeDefined();

    // Registered intake count must be >= 1
    expect(dashboard.kpis.totalInPeriod).toBeGreaterThanOrEqual(1);

    // Closed in period must be >= 1
    expect(dashboard.kpis.closedInPeriod).toBeGreaterThanOrEqual(1);

    // 48h Ack SLA on-time must be >= 1
    expect(dashboard.charts.slaCompliance.ack48h.onTime).toBeGreaterThanOrEqual(1);
    expect(dashboard.charts.slaCompliance.ack48h.rate).toBeGreaterThanOrEqual(0);

    // Happy Code verification rate must be evaluated on closed requests
    expect(dashboard.charts.customerOutcomes.happyCodeVerificationRate).toBeGreaterThanOrEqual(0);

    // 2. Warranty Claims Report
    const claimsReport = await reportingRepository.getWarrantyClaimsReport({
      asfLocationId: mumbaiAsfId,
      status: 'POSTED',
    });
    expect(claimsReport.length).toBeGreaterThanOrEqual(1);

    const targetClaim = claimsReport.find((c) => c.claimNumber === testJobNumber || c.netClaimAmount === 500);
    expect(targetClaim).toBeDefined();
    expect(targetClaim!.grossLaborAmount).toBe(450);
    expect(targetClaim!.grossTravelAmount).toBe(50);
    expect(targetClaim!.penaltyDeductionAmount).toBe(0);
    expect(targetClaim!.netClaimAmount).toBe(500);
    expect(targetClaim!.status).toBe('POSTED');
  });
});
