import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getOracleConnection } from '../src/database/oraclePool.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { generateTemporaryPassword, hashPassword } from '../src/services/passwordService.js';
import { systemConfigService } from '../src/services/systemConfigService.js';
import { loginPersona, resolvePersonaLocations } from './helpers/isolatedPersonas.js';

/**
 * Phase 3 acceptance: provider Super Admin, client Admin restrictions, secure provisioning,
 * mandatory first-login change, credential reset and session revocation, privilege escalation.
 */
describe('Phase 3 — Provider Super Admin & Client Admin Account Governance', () => {
  const app = createApp();
  const tag = `p3_${Date.now().toString(36)}`;

  const superAdmin = { userId: crypto.randomUUID(), username: `${tag}_sa`, password: generateTemporaryPassword(), cookie: '', csrf: '' };
  const clientAdmin = { userId: crypto.randomUUID(), username: `${tag}_adm`, password: generateTemporaryPassword(), cookie: '', csrf: '' };
  const otherAdmin = { userId: crypto.randomUUID(), username: `${tag}_adm2`, password: generateTemporaryPassword() };
  const callCenter = { userId: crypto.randomUUID(), username: `${tag}_cc`, password: generateTemporaryPassword(), cookie: '', csrf: '' };
  let asfLocationId = '';
  let warehouseLocationId = '';

  async function provision(u: { userId: string; username: string; password: string }, role: string, locationId?: string) {
    await userRepository.createUser({
      userId: u.userId,
      username: u.username,
      email: `${u.username}@crm.test`,
      fullName: `Phase3 ${role}`,
      passwordHash: await hashPassword(u.password),
      locationId,
    });
    await rbacRepository.assignRoleToUser(u.userId, role, 'PHASE3_TEST_SETUP');
  }

  beforeAll(async () => {
    const locs = await resolvePersonaLocations();
    asfLocationId = locs.defaultAsfId;
    warehouseLocationId = locs.warehouseId;
    await provision(superAdmin, 'SUPER_ADMIN');
    await provision(clientAdmin, 'ADMIN');
    await provision(otherAdmin, 'ADMIN');
    await provision(callCenter, 'CALL_CENTER');
    Object.assign(superAdmin, await loginPersona(app, superAdmin.username, superAdmin.password));
    Object.assign(clientAdmin, await loginPersona(app, clientAdmin.username, clientAdmin.password));
    Object.assign(callCenter, await loginPersona(app, callCenter.username, callCenter.password));
  });

  afterAll(async () => {
    // Leave no maintenance mode or altered policy behind
    const conn = await getOracleConnection();
    try {
      await conn.execute(`UPDATE SYSTEM_CONFIG SET CONFIG_VALUE = 'false' WHERE CONFIG_KEY = 'app.maintenance_mode'`);
      await conn.commit();
    } finally {
      await conn.close();
    }
    systemConfigService.invalidateCache();
  });

  // ---------------------------------------------------------------------------------------------
  describe('1. Provider Super Admin workspace', () => {
    it('serves dashboard, health, notification failures, audit logs and configuration from live data', async () => {
      const dash = await request(app).get('/api/v1/super-admin/dashboard').set('Cookie', superAdmin.cookie);
      expect(dash.status).toBe(200);
      expect(dash.body.data.accountsByRole.map((r: any) => r.role)).toEqual(
        expect.arrayContaining(['SUPER_ADMIN', 'ADMIN', 'CALL_CENTER', 'ASF', 'ENGINEER', 'WAREHOUSE'])
      );

      const health = await request(app).get('/api/v1/super-admin/health').set('Cookie', superAdmin.cookie);
      expect(health.status).toBe(200);
      expect(health.body.data.database.connected).toBe(true);
      expect(health.body.data.workers.jobs).toHaveLength(3);
      expect(health.body.data.notifications.countsByStatus).toBeDefined();
      // No secrets in the provider health payload
      const raw = JSON.stringify(health.body);
      expect(raw).not.toMatch(/ORACLE_PASSWORD|connectString|NOTIFICATION_ENCRYPTION_KEY|OTP_HASH_PEPPER/i);

      const failures = await request(app).get('/api/v1/super-admin/notifications/failures').set('Cookie', superAdmin.cookie);
      expect(failures.status).toBe(200);
      for (const item of failures.body.data.items) {
        expect(item.recipient).not.toMatch(/^\d{10}$/); // masked
        expect(item).not.toHaveProperty('messageBody');
        expect(item).not.toHaveProperty('encryptedPayload');
      }

      const audit = await request(app).get('/api/v1/super-admin/audit-logs?limit=5').set('Cookie', superAdmin.cookie);
      expect(audit.status).toBe(200);
      expect(Array.isArray(audit.body.data.logs)).toBe(true);

      const cfg = await request(app).get('/api/v1/super-admin/config').set('Cookie', superAdmin.cookie);
      expect(cfg.status).toBe(200);
      const editable = cfg.body.data.items.filter((c: any) => c.editable).map((c: any) => c.configKey);
      expect(editable).toEqual(expect.arrayContaining(['security.max_failed_logins', 'app.maintenance_mode']));
    });

    it('validates provider configuration and rejects non-editable keys', async () => {
      const bad = await request(app)
        .patch('/api/v1/super-admin/config/security.max_failed_logins')
        .set('Cookie', superAdmin.cookie)
        .set('x-csrf-token', superAdmin.csrf)
        .send({ value: '999' });
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('INVALID_CONFIG_VALUE');

      const readOnly = await request(app)
        .patch('/api/v1/super-admin/config/notifications.sms_provider')
        .set('Cookie', superAdmin.cookie)
        .set('x-csrf-token', superAdmin.csrf)
        .send({ value: 'OTHER' });
      expect(readOnly.status).toBe(400);
      expect(readOnly.body.error.code).toBe('CONFIG_KEY_NOT_EDITABLE');
    });

    it('is not reachable by client Admin or operational roles', async () => {
      for (const u of [clientAdmin, callCenter]) {
        for (const path of ['/api/v1/super-admin/dashboard', '/api/v1/super-admin/admins', '/api/v1/super-admin/config']) {
          const res = await request(app).get(path).set('Cookie', u.cookie);
          expect(res.status).toBe(403);
        }
      }
    });

    it('provider Super Admin has no client business data access', async () => {
      const res = await request(app).get('/api/v1/call-center/serviceability/400001').set('Cookie', superAdmin.cookie);
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('2. Secure client Admin provisioning, first-login change and lifecycle', () => {
    let newAdminId = '';
    let newAdminUsername = '';
    let tempPassword = '';

    it('Super Admin creates a client Admin with a one-time CSPRNG temporary password', async () => {
      newAdminUsername = `${tag}_newadm`;
      const res = await request(app)
        .post('/api/v1/super-admin/admins')
        .set('Cookie', superAdmin.cookie)
        .set('x-csrf-token', superAdmin.csrf)
        .send({ fullName: 'Client Admin New', username: newAdminUsername, email: `${newAdminUsername}@client.test`, phoneNumber: '9876501234' });
      expect(res.status).toBe(201);
      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.body.data.account.roles).toEqual(['ADMIN']);
      expect(res.body.data.account.mustChangePassword).toBe('Y');
      tempPassword = res.body.data.temporaryPassword;
      expect(tempPassword.length).toBeGreaterThanOrEqual(12);
      newAdminId = res.body.data.account.userId;

      // Never persisted in plaintext and never returned again
      const stored = await userRepository.findById(newAdminId);
      expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(stored?.passwordHash).not.toContain(tempPassword);
      const list = await request(app).get(`/api/v1/super-admin/admins?search=${newAdminUsername}`).set('Cookie', superAdmin.cookie);
      expect(JSON.stringify(list.body)).not.toContain(tempPassword);
    });

    it('temporary credential only unlocks the password change; weak or reused passwords are rejected', async () => {
      const login = await loginPersona(app, newAdminUsername, tempPassword);
      const me = await request(app).get('/api/v1/auth/me').set('Cookie', login.cookie);
      expect(me.body.data.user.mustChangePassword).toBe(true);

      const blocked = await request(app).get('/api/v1/admin/staff').set('Cookie', login.cookie);
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

      const weak = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', login.cookie)
        .set('x-csrf-token', login.csrf)
        .send({ currentPassword: tempPassword, newPassword: 'alllowercase1' });
      expect(weak.status).toBe(400);

      const reuse = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', login.cookie)
        .set('x-csrf-token', login.csrf)
        .send({ currentPassword: tempPassword, newPassword: tempPassword });
      expect(reuse.status).toBe(400);

      const ok = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', login.cookie)
        .set('x-csrf-token', login.csrf)
        .send({ currentPassword: tempPassword, newPassword: 'Client#Admin2026Secure' });
      expect(ok.status).toBe(200);
      expect(ok.body.data.user.mustChangePassword).toBe(false);

      const unblocked = await request(app).get('/api/v1/admin/staff').set('Cookie', login.cookie);
      expect(unblocked.status).toBe(200);
    });

    it('credential reset issues a new temporary password and revokes every active session', async () => {
      const session = await loginPersona(app, newAdminUsername, 'Client#Admin2026Secure');
      const reset = await request(app)
        .post(`/api/v1/super-admin/admins/${newAdminId}/reset-credentials`)
        .set('Cookie', superAdmin.cookie)
        .set('x-csrf-token', superAdmin.csrf)
        .send({});
      expect(reset.status).toBe(200);
      expect(reset.body.data.revokedSessions).toBeGreaterThanOrEqual(1);
      expect(reset.body.data.account.mustChangePassword).toBe('Y');

      const stale = await request(app).get('/api/v1/auth/me').set('Cookie', session.cookie);
      expect(stale.status).toBe(401);
      const oldPw = await request(app).post('/api/v1/auth/login').send({ username: newAdminUsername, password: 'Client#Admin2026Secure' });
      expect(oldPw.status).toBe(401);
      const newPw = await request(app).post('/api/v1/auth/login').send({ username: newAdminUsername, password: reset.body.data.temporaryPassword });
      expect(newPw.status).toBe(200);
    });

    it('suspension revokes sessions and blocks sign-in; reactivation restores access', async () => {
      const session = await loginPersona(app, otherAdmin.username, otherAdmin.password);
      const suspend = await request(app)
        .patch(`/api/v1/super-admin/admins/${otherAdmin.userId}/status`)
        .set('Cookie', superAdmin.cookie)
        .set('x-csrf-token', superAdmin.csrf)
        .send({ isActive: 'N', reason: 'Contract paused' });
      expect(suspend.status).toBe(200);
      expect(suspend.body.data.revokedSessions).toBeGreaterThanOrEqual(1);
      expect((await request(app).get('/api/v1/auth/me').set('Cookie', session.cookie)).status).toBe(401);
      expect((await request(app).post('/api/v1/auth/login').send({ username: otherAdmin.username, password: otherAdmin.password })).status).toBe(403);

      const reactivate = await request(app)
        .patch(`/api/v1/super-admin/admins/${otherAdmin.userId}/status`)
        .set('Cookie', superAdmin.cookie)
        .set('x-csrf-token', superAdmin.csrf)
        .send({ isActive: 'Y' });
      expect(reactivate.status).toBe(200);
      expect((await request(app).post('/api/v1/auth/login').send({ username: otherAdmin.username, password: otherAdmin.password })).status).toBe(200);
    });

    it('explicit session revocation logs out the account everywhere', async () => {
      const session = await loginPersona(app, otherAdmin.username, otherAdmin.password);
      const res = await request(app)
        .post(`/api/v1/super-admin/admins/${otherAdmin.userId}/revoke-sessions`)
        .set('Cookie', superAdmin.cookie)
        .set('x-csrf-token', superAdmin.csrf)
        .send({});
      expect(res.status).toBe(200);
      expect((await request(app).get('/api/v1/auth/me').set('Cookie', session.cookie)).status).toBe(401);
    });

    it('Super Admin cannot manage operational staff or other Super Admins, nor create Super Admins', async () => {
      const staff = await request(app)
        .patch(`/api/v1/super-admin/admins/${callCenter.userId}/status`)
        .set('Cookie', superAdmin.cookie)
        .set('x-csrf-token', superAdmin.csrf)
        .send({ isActive: 'N' });
      expect(staff.status).toBe(403);

      const self = await request(app)
        .patch(`/api/v1/super-admin/admins/${superAdmin.userId}/status`)
        .set('Cookie', superAdmin.cookie)
        .set('x-csrf-token', superAdmin.csrf)
        .send({ isActive: 'N' });
      expect(self.status).toBe(403);
      expect(self.body.error.code).toBe('ACCOUNT_NOT_MANAGEABLE');
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('3. Client Admin restrictions and operational staff management', () => {
    let engineerId = '';

    it('client Admin provisions each operational role with the right organisation association', async () => {
      const cases: Array<{ role: string; locationId?: string }> = [
        { role: 'CALL_CENTER' },
        { role: 'ASF', locationId: asfLocationId },
        { role: 'ENGINEER', locationId: asfLocationId },
        { role: 'WAREHOUSE', locationId: warehouseLocationId },
      ];
      for (const c of cases) {
        const username = `${tag}_${c.role.toLowerCase()}`;
        const res = await request(app)
          .post('/api/v1/admin/staff')
          .set('Cookie', clientAdmin.cookie)
          .set('x-csrf-token', clientAdmin.csrf)
          .send({ role: c.role, fullName: `Staff ${c.role}`, username, email: `${username}@client.test`, locationId: c.locationId });
        expect(res.status).toBe(201);
        expect(res.body.data.account.roles).toEqual([c.role]);
        expect(res.body.data.account.mustChangePassword).toBe('Y');
        if (c.role === 'ENGINEER') engineerId = res.body.data.account.userId;
      }

      // Location association is enforced for location-bound roles
      const missing = await request(app)
        .post('/api/v1/admin/staff')
        .set('Cookie', clientAdmin.cookie)
        .set('x-csrf-token', clientAdmin.csrf)
        .send({ role: 'ASF', fullName: 'No Location', username: `${tag}_noloc`, email: `${tag}_noloc@client.test` });
      expect(missing.status).toBe(400);
      expect(missing.body.error.code).toBe('LOCATION_REQUIRED');
    });

    it('client Admin cannot create Admin or Super Admin accounts', async () => {
      for (const role of ['ADMIN', 'SUPER_ADMIN']) {
        const res = await request(app)
          .post('/api/v1/admin/staff')
          .set('Cookie', clientAdmin.cookie)
          .set('x-csrf-token', clientAdmin.csrf)
          .send({ role, fullName: 'Escalation Attempt', username: `${tag}_esc_${role.toLowerCase()}`, email: `${tag}_esc_${role.toLowerCase()}@x.test` });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('PRIVILEGE_ESCALATION_DENIED');
        expect(await userRepository.findByUsernameOrEmail(`${tag}_esc_${role.toLowerCase()}`)).toBeNull();
      }
    });

    it('client Admin cannot modify, reset, suspend or revoke another Admin (or a Super Admin)', async () => {
      for (const target of [otherAdmin.userId, superAdmin.userId]) {
        const attempts = [
          request(app).patch(`/api/v1/admin/staff/${target}`).set('Cookie', clientAdmin.cookie).set('x-csrf-token', clientAdmin.csrf).send({ fullName: 'Hijacked' }),
          request(app).post(`/api/v1/admin/staff/${target}/reset-credentials`).set('Cookie', clientAdmin.cookie).set('x-csrf-token', clientAdmin.csrf).send({}),
          request(app).patch(`/api/v1/admin/staff/${target}/status`).set('Cookie', clientAdmin.cookie).set('x-csrf-token', clientAdmin.csrf).send({ isActive: 'N' }),
          request(app).post(`/api/v1/admin/staff/${target}/revoke-sessions`).set('Cookie', clientAdmin.cookie).set('x-csrf-token', clientAdmin.csrf).send({}),
        ];
        for (const res of await Promise.all(attempts)) {
          expect(res.status).toBe(403);
        }
      }
      const untouched = await userRepository.findById(otherAdmin.userId);
      expect(untouched?.fullName).not.toBe('Hijacked');
      expect(untouched?.isActive).toBe('Y');
    });

    it('client Admin cannot reach provider configuration or infrastructure controls', async () => {
      const cfg = await request(app).patch('/api/v1/super-admin/config/app.maintenance_mode').set('Cookie', clientAdmin.cookie).set('x-csrf-token', clientAdmin.csrf).send({ value: 'true' });
      expect(cfg.status).toBe(403);
      const diag = await request(app).get('/api/v1/system/diagnostics').set('Cookie', clientAdmin.cookie);
      expect(diag.status).toBe(403);
      // Client Admin no longer holds provider-level system:config
      const me = await request(app).get('/api/v1/auth/me').set('Cookie', clientAdmin.cookie);
      expect(me.body.data.user.permissions).not.toContain('system:config');
      expect(me.body.data.user.permissions).not.toContain('admins:manage');
    });

    it('privilege escalation via request tampering is impossible (role field ignored on update; no role-change endpoint)', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/staff/${engineerId}`)
        .set('Cookie', clientAdmin.cookie)
        .set('x-csrf-token', clientAdmin.csrf)
        .send({ fullName: 'Engineer Renamed', role: 'ADMIN', roles: ['ADMIN', 'SUPER_ADMIN'] });
      expect(res.status).toBe(200);
      expect(res.body.data.account.roles).toEqual(['ENGINEER']);
      expect(await rbacRepository.getUserRoles(engineerId)).toEqual(['ENGINEER']);
    });

    it('operational users cannot use account management at all', async () => {
      const res = await request(app).get('/api/v1/admin/staff').set('Cookie', callCenter.cookie);
      expect(res.status).toBe(403);
      const create = await request(app)
        .post('/api/v1/admin/staff')
        .set('Cookie', callCenter.cookie)
        .set('x-csrf-token', callCenter.csrf)
        .send({ role: 'CALL_CENTER', fullName: 'x', username: `${tag}_ccx`, email: `${tag}_ccx@x.test` });
      expect(create.status).toBe(403);
    });

    it('client Admin listing never exposes privileged accounts', async () => {
      const res = await request(app).get(`/api/v1/admin/staff?search=${tag}&limit=100`).set('Cookie', clientAdmin.cookie);
      expect(res.status).toBe(200);
      for (const acc of res.body.data.items) {
        expect(acc.roles).not.toContain('ADMIN');
        expect(acc.roles).not.toContain('SUPER_ADMIN');
      }
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('4. Provider maintenance mode', () => {
    it('blocks client users while the provider keeps access', async () => {
      const on = await request(app)
        .patch('/api/v1/super-admin/config/app.maintenance_mode')
        .set('Cookie', superAdmin.cookie)
        .set('x-csrf-token', superAdmin.csrf)
        .send({ value: 'true' });
      expect(on.status).toBe(200);

      const client = await request(app).get('/api/v1/admin/staff').set('Cookie', clientAdmin.cookie);
      expect(client.status).toBe(503);
      expect(client.body.error.code).toBe('MAINTENANCE_MODE');
      const provider = await request(app).get('/api/v1/super-admin/dashboard').set('Cookie', superAdmin.cookie);
      expect(provider.status).toBe(200);

      const off = await request(app)
        .patch('/api/v1/super-admin/config/app.maintenance_mode')
        .set('Cookie', superAdmin.cookie)
        .set('x-csrf-token', superAdmin.csrf)
        .send({ value: 'false' });
      expect(off.status).toBe(200);
      expect((await request(app).get('/api/v1/admin/staff').set('Cookie', clientAdmin.cookie)).status).toBe(200);
    });
  });

  it('records an audit trail for provisioning and denied escalation attempts', async () => {
    const res = await request(app).get(`/api/v1/super-admin/audit-logs?search=${tag}&limit=200`).set('Cookie', superAdmin.cookie);
    expect(res.status).toBe(200);
    const all = await request(app).get('/api/v1/super-admin/audit-logs?action=ACCOUNT_CREATE&limit=50').set('Cookie', superAdmin.cookie);
    expect(all.body.data.logs.length).toBeGreaterThan(0);
    const denied = await request(app).get('/api/v1/super-admin/audit-logs?outcome=FAILURE&limit=50').set('Cookie', superAdmin.cookie);
    expect(denied.body.data.logs.some((l: any) => l.actorId === clientAdmin.userId)).toBe(true);
  });
});
