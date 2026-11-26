import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getOracleConnection } from '../src/database/oraclePool.js';
import { custodyRepository } from '../src/database/repositories/custodyRepository.js';
import { inventoryRepository } from '../src/database/repositories/inventoryRepository.js';
import { locationRepository } from '../src/database/repositories/locationRepository.js';
import { replacementCustodyRepository } from '../src/database/repositories/replacementCustodyRepository.js';
import { serviceRequestRepository } from '../src/database/repositories/serviceRequestRepository.js';
import { asfService } from '../src/services/asfService.js';
import { custodyService } from '../src/services/custodyService.js';
import { replacementService } from '../src/services/replacementService.js';
import { replacementVerificationService } from '../src/services/replacementVerificationService.js';
import { AuthenticatedUser } from '../src/types/auth.js';
import { provisionPersonas } from './helpers/isolatedPersonas.js';

/**
 * Phase 2 completion: barcode-verified physical custody and exception handling.
 * Failed validation must leave inventory and custody exactly as they were.
 */
describe('Phase 2 — Barcode-Verified Custody, Installation Evidence & Exceptions', () => {
  const app = createApp();
  const tag = Date.now().toString(36).toUpperCase();

  let warehouseId = '';
  let asfId = '';
  let partId = '';
  let partCode = '';
  let otherPartCode = '';
  let ids: { brandId: string; productId: string; modelId: string; customerId: string };
  let wh: AuthenticatedUser;
  let asf: AuthenticatedUser;
  let eng: AuthenticatedUser;
  let eng2: AuthenticatedUser;

  const actor = (p: { userId: string; username: string; role: string }, locationId?: string): AuthenticatedUser => ({
    userId: p.userId,
    username: p.username,
    email: `${p.username}@crm.test`,
    fullName: p.username,
    locationId,
    roles: [p.role],
    permissions: [],
  });

  async function balance() {
    const b = await inventoryRepository.getBalance(warehouseId, partId);
    return { onHand: b?.qtyOnHand ?? 0, reserved: b?.qtyReserved ?? 0, inTransit: b?.qtyInTransit ?? 0 };
  }

  async function escalatedReplacement(warrantyStatus: 'IN_WARRANTY' | 'OUT_OF_WARRANTY') {
    const conn = await getOracleConnection();
    let requestId = '';
    try {
      const jobNumber = await serviceRequestRepository.generateJobNumber('SK', 'CX', conn);
      const sr = await serviceRequestRepository.createServiceRequest(
        {
          jobNumber,
          customerId: ids.customerId,
          brandId: ids.brandId,
          productId: ids.productId,
          modelId: ids.modelId,
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          status: 'REPAIR_ESCALATED',
          warrantyStatus,
          assignedLocationId: asfId,
          assignedEngineerId: eng.userId,
          customerPhone: '9820012345',
          registeredBy: asf.userId,
          registeredByUsername: asf.username,
          sla48hExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        } as any,
        conn
      );
      requestId = sr.requestId;
      await conn.commit();
    } finally {
      await conn.close();
    }
    const accepted = await asfService.acceptEscalation(
      requestId,
      { reasonCode: 'REASON_5', requiredPartId: partId, warrantyType: warrantyStatus, quotationAmount: warrantyStatus === 'OUT_OF_WARRANTY' ? 3000 : undefined },
      asf
    );
    return accepted.replacement.replacementId as string;
  }

  beforeAll(async () => {
    const whLoc = await locationRepository.createLocation({ locationCode: `WH_CX_${tag}`, locationName: 'Custody Test Warehouse', partyType: 'CENTRAL_WAREHOUSE', isTestFixture: 'Y' });
    const asfLoc = await locationRepository.createLocation({ locationCode: `ASF_CX_${tag}`, locationName: 'Custody Test Service Center', partyType: 'ASF', isTestFixture: 'Y' });
    warehouseId = whLoc.locationId;
    asfId = asfLoc.locationId;

    const personas = await provisionPersonas(app, { tag: 'custody', locations: { serviceCenter: asfId, engineer: asfId, warehouse: warehouseId } });
    wh = actor({ userId: personas.warehouse.userId, username: personas.warehouse.username, role: 'WAREHOUSE' }, warehouseId);
    asf = actor({ userId: personas.serviceCenter.userId, username: personas.serviceCenter.username, role: 'ASF' }, asfId);
    eng = actor({ userId: personas.engineer.userId, username: personas.engineer.username, role: 'ENGINEER' }, asfId);
    const second = await provisionPersonas(app, { tag: 'custody2', locations: { engineer: asfId } });
    eng2 = actor({ userId: second.engineer.userId, username: second.engineer.username, role: 'ENGINEER' }, asfId);

    const conn = await getOracleConnection();
    try {
      const parts: any = await conn.execute(`SELECT PART_ID, PART_CODE FROM PART_CODES WHERE IS_ACTIVE = 'Y' FETCH FIRST 2 ROWS ONLY`, {}, { outFormat: 4002 });
      partId = parts.rows[0].PART_ID;
      partCode = parts.rows[0].PART_CODE;
      otherPartCode = `${parts.rows[1].PART_CODE}_X`;
      const m: any = await conn.execute(`SELECT MODEL_ID, BRAND_ID, PRODUCT_ID FROM MODELS WHERE IS_ACTIVE = 'Y' FETCH FIRST 1 ROWS ONLY`, {}, { outFormat: 4002 });
      const c: any = await conn.execute(`SELECT CUSTOMER_ID FROM CUSTOMERS FETCH FIRST 1 ROWS ONLY`, {}, { outFormat: 4002 });
      ids = { brandId: m.rows[0].BRAND_ID, productId: m.rows[0].PRODUCT_ID, modelId: m.rows[0].MODEL_ID, customerId: c.rows[0].CUSTOMER_ID };
      await inventoryRepository.upsertBalanceDeltas({ locationId: warehouseId, partId, deltaOnHand: 5 }, conn);
      await conn.commit();
    } finally {
      await conn.close();
    }
  });

  it('rejects a mismatched barcode at warehouse dispatch without moving stock or custody', async () => {
    const repId = await escalatedReplacement('IN_WARRANTY');
    const alloc = await replacementService.allocateStock(repId, warehouseId, wh);
    expect(alloc.status).toBe('STOCK_RESERVED');
    const before = await balance();

    await expect(
      replacementService.dispatchStockToAsf(repId, { courierName: 'BlueDart', docketNumber: 'BD1', barcode: otherPartCode, captureMethod: 'SCANNER' }, wh)
    ).rejects.toMatchObject({ code: 'BARCODE_MISMATCH' });
    await expect(replacementService.dispatchStockToAsf(repId, { courierName: 'BlueDart', docketNumber: 'BD1' }, wh)).rejects.toMatchObject({
      code: 'BARCODE_REQUIRED',
    });

    expect(await balance()).toEqual(before);
    expect((await replacementService.getReplacementById(repId)).status).toBe('STOCK_RESERVED');
    expect(await replacementCustodyRepository.listEvents(repId)).toHaveLength(0);

    // Scanner input with trailing CR/LF and lower case is normalised and accepted
    const ok = await replacementService.dispatchStockToAsf(
      repId,
      { courierName: 'BlueDart', docketNumber: 'BD1', barcode: `${partCode.toLowerCase()}\r\n`, captureMethod: 'SCANNER' },
      wh
    );
    expect(ok.status).toBe('DISPATCHED_TO_ASF');
    const after = await balance();
    expect(after.onHand).toBe(before.onHand - 1);
    expect(after.reserved).toBe(before.reserved - 1);
    expect(after.inTransit).toBe(before.inTransit + 1);
  });

  it('enforces the full custody chain with barcode checks and records installation evidence', async () => {
    const repId = await escalatedReplacement('IN_WARRANTY');
    await replacementService.allocateStock(repId, warehouseId, wh);

    // Handover is impossible before dispatch and ASF receipt
    await expect(custodyService.createHandover({ replacementId: repId, partId, engineerId: eng.userId }, asf)).rejects.toMatchObject({
      code: 'INVALID_CUSTODY_TRANSITION',
    });
    // Warehouse must not schedule engineers
    await expect(
      replacementService.scheduleInstallation(repId, { engineerId: eng.userId, appointmentDate: new Date(Date.now() + 3 * 3600e3).toISOString(), appointmentSlot: '10-12' }, wh)
    ).rejects.toMatchObject({ code: 'FORBIDDEN_ROLE' });

    await replacementService.dispatchStockToAsf(repId, { courierName: 'DTDC', docketNumber: 'D1', barcode: partCode }, wh);
    await expect(replacementService.acknowledgeAsfReceipt(repId, asf, { barcode: otherPartCode })).rejects.toMatchObject({ code: 'BARCODE_MISMATCH' });
    expect((await replacementService.getReplacementById(repId)).status).toBe('DISPATCHED_TO_ASF');
    const received = await replacementService.acknowledgeAsfReceipt(repId, asf, { barcode: partCode, captureMethod: 'MANUAL' });
    expect(received.status).toBe('RECEIVED_AT_ASF');

    // ASF assigns and schedules (>= 60 min), then hands over to the same engineer
    await expect(
      replacementService.scheduleInstallation(repId, { engineerId: eng.userId, appointmentDate: new Date(Date.now() + 30 * 60e3).toISOString(), appointmentSlot: '10-12' }, asf)
    ).rejects.toMatchObject({ code: 'INVALID_APPOINTMENT_TIME' });
    const scheduled = await replacementService.scheduleInstallation(
      repId,
      { engineerId: eng.userId, appointmentDate: new Date(Date.now() + 3 * 3600e3).toISOString(), appointmentSlot: '10-12' },
      asf
    );
    expect(scheduled.status).toBe('APPOINTMENT_SCHEDULED');
    await expect(custodyService.createHandover({ replacementId: repId, partId, engineerId: eng2.userId }, asf)).rejects.toMatchObject({
      code: 'ENGINEER_CUSTODY_MISMATCH',
    });
    const handover = await custodyService.createHandover({ replacementId: repId, partId, engineerId: eng.userId }, asf);
    expect(handover.status).toBe('PENDING_COLLECTION');

    // Arrival before collection is rejected
    await expect(replacementService.verifyInstallationArrival(repId, '123456', eng)).rejects.toMatchObject({ code: 'PART_NOT_COLLECTED' });

    // Collection: wrong engineer, wrong barcode rejected; state unchanged
    await expect(custodyService.acknowledgeCollection(handover.handoverId, undefined, eng2, { barcode: partCode })).rejects.toMatchObject({
      code: 'WRONG_ENGINEER_COLLECTION',
    });
    await expect(custodyService.acknowledgeCollection(handover.handoverId, undefined, eng, { barcode: otherPartCode })).rejects.toMatchObject({
      code: 'BARCODE_MISMATCH',
    });
    expect((await custodyRepository.findById(handover.handoverId))?.status).toBe('PENDING_COLLECTION');
    const collected = await custodyService.acknowledgeCollection(handover.handoverId, 'Collected', eng, { barcode: partCode, captureMethod: 'SCANNER' });
    expect(collected.status).toBe('COLLECTED');

    // Rescheduling invalidates the previous unused Arrival Happy Code
    const rescheduled = await replacementService.scheduleInstallation(
      repId,
      { engineerId: eng.userId, appointmentDate: new Date(Date.now() + 4 * 3600e3).toISOString(), appointmentSlot: '12-14' },
      asf
    );
    expect(rescheduled.appointmentVersion).toBe((scheduled.appointmentVersion || 1) + 1);
    expect(rescheduled.status).toBe('HANDED_OVER_TO_ENGINEER'); // collection progress preserved
    const conn = await getOracleConnection();
    try {
      const rows: any = await conn.execute(
        `SELECT APPOINTMENT_VERSION, IS_INVALIDATED FROM REPLACEMENT_VERIFICATIONS WHERE REPLACEMENT_ID = :id AND PURPOSE = 'ARRIVAL' ORDER BY APPOINTMENT_VERSION`,
        { id: repId },
        { outFormat: 4002 }
      );
      expect(rows.rows.map((r: any) => r.IS_INVALIDATED)).toEqual(['Y', 'N']);
    } finally {
      await conn.close();
    }

    // Replace the current arrival secret with a known value (simulating the customer's SMS)
    const version = rescheduled.appointmentVersion!;
    const conn2 = await getOracleConnection();
    let arrivalCode = '';
    try {
      const regen = await replacementVerificationService.regenerateCode(repId, version, 'ARRIVAL', conn2);
      arrivalCode = regen.plainCode;
      await conn2.commit();
    } finally {
      await conn2.close();
    }
    const arrival = await replacementService.verifyInstallationArrival(repId, arrivalCode, eng);
    expect(arrival.status).toBe('TECHNICIAN_CHECKED_IN');

    // Completion Happy Code was issued on arrival; read it via a controlled regeneration for the test
    const conn3 = await getOracleConnection();
    let completionCode = '';
    try {
      completionCode = (await replacementVerificationService.regenerateCode(repId, version, 'COMPLETION', conn3)).plainCode;
      await conn3.commit();
    } finally {
      await conn3.close();
    }

    // Wrong part rejected before the Completion Happy Code is consumed
    await expect(
      replacementService.completeInstallation(repId, { completionCode, installedPartCode: otherPartCode }, eng)
    ).rejects.toMatchObject({ code: 'WRONG_PART_INSTALLATION' });
    // Engineer cannot close the replacement
    await expect(replacementService.closeReplacement(repId, eng)).rejects.toMatchObject({ code: 'FORBIDDEN_ROLE' });

    const installed = await replacementService.completeInstallation(
      repId,
      { completionCode, installedPartCode: partCode, captureMethod: 'SCANNER', targetSerialNo: `SN-${tag}`, remarks: 'Installed and demonstrated' },
      eng
    );
    expect(installed.status).toBe('INSTALLATION_VERIFIED');

    const timeline = await replacementService.getCustodyTimeline(repId);
    expect(timeline.installation?.installedPartCode).toBe(partCode.toUpperCase());
    expect(timeline.installation?.serialNumber).toBe(`SN-${tag}`);
    expect(timeline.installation?.engineerId).toBe(eng.userId);
    expect(timeline.installation?.handoverId).toBe(handover.handoverId);
    expect(timeline.events.map((e) => e.eventType)).toEqual([
      'WAREHOUSE_DISPATCH',
      'ASF_RECEIPT',
      'ENGINEER_HANDOVER_INITIATED',
      'ENGINEER_COLLECTION',
      'CUSTOMER_INSTALLATION',
    ]);

    const closed = await replacementService.closeReplacement(repId, wh);
    expect(closed.status).toBe('CLOSED');
  });

  it('customer decline releases the un-dispatched reservation back to available stock and blocks dispatch', async () => {
    const repId = await escalatedReplacement('OUT_OF_WARRANTY');
    await expect(replacementService.allocateStock(repId, warehouseId, wh)).rejects.toMatchObject({ code: 'DISPATCH_PREREQUISITES_NOT_MET' });

    const rep = await replacementService.getReplacementById(repId);
    await expect(replacementService.recordQuotationDecision(repId, { decision: 'APPROVED' }, asf)).rejects.toMatchObject({
      code: 'QUOTATION_VERSION_REQUIRED',
    });
    await replacementService.recordQuotationDecision(repId, { decision: 'APPROVED', quotationVersion: rep.quotationVersion || 1 }, asf);
    const before = await balance();
    await replacementService.allocateStock(repId, warehouseId, wh);
    expect((await balance()).reserved).toBe(before.reserved + 1);

    // Revision after reservation requires re-approval; then customer declines
    const revised = await replacementService.prepareQuotation(repId, { amount: 3500 }, asf);
    expect(revised.quotationVersion).toBe((rep.quotationVersion || 1) + 1);
    expect((await replacementService.checkDispatchPrerequisites(repId)).eligible).toBe(false);
    const declined = await replacementService.recordQuotationDecision(repId, { decision: 'DECLINED', quotationVersion: revised.quotationVersion, reason: 'Too costly' }, asf);
    expect(declined.status).toBe('CUSTOMER_DECLINED');
    expect((await balance()).reserved).toBe(before.reserved);
    await expect(replacementService.dispatchStockToAsf(repId, { courierName: 'x', docketNumber: 'y', barcode: partCode }, wh)).rejects.toMatchObject({
      code: 'DISPATCH_PREREQUISITES_NOT_MET',
    });
  });

  it('keeps the replacement open in PENDING_STOCK and resumes when verified stock arrives', async () => {
    const emptyWh = await locationRepository.createLocation({ locationCode: `WH_CXE_${tag}`, locationName: 'Empty Custody Warehouse', partyType: 'CENTRAL_WAREHOUSE', isTestFixture: 'Y' });
    const repId = await escalatedReplacement('IN_WARRANTY');
    const first = await replacementService.allocateStock(repId, emptyWh.locationId, { ...wh, locationId: emptyWh.locationId });
    expect(first.status).toBe('PENDING_STOCK');
    await replacementService.allocateStock(repId, emptyWh.locationId, { ...wh, locationId: emptyWh.locationId });
    const conn = await getOracleConnection();
    try {
      const sms: any = await conn.execute(
        `SELECT COUNT(*) AS C FROM NOTIFICATIONS_OUTBOX WHERE REPLACEMENT_ID = :id AND TEMPLATE_CODE = 'SMS_STOCK_SHORTAGE'`,
        { id: repId },
        { outFormat: 4002 }
      );
      expect(Number(sms.rows[0].C)).toBe(1); // deduplicated
      await inventoryRepository.upsertBalanceDeltas({ locationId: emptyWh.locationId, partId, deltaOnHand: 1 }, conn);
      await conn.commit();
    } finally {
      await conn.close();
    }
    const resumed = await replacementService.allocateStock(repId, emptyWh.locationId, { ...wh, locationId: emptyWh.locationId });
    expect(resumed.status).toBe('STOCK_RESERVED');
  });

  it('exposes the custody timeline only to the responsible Service Center', async () => {
    const repId = await escalatedReplacement('IN_WARRANTY');
    const other = await provisionPersonas(app, { tag: 'custody3' });
    const res = await request(app).get(`/api/v1/asf/replacements/${repId}/custody`).set('Cookie', other.serviceCenter.cookie);
    expect(res.status).toBe(403);
  });
});
