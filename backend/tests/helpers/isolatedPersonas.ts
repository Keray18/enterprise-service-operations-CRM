import crypto from 'crypto';
import type { Express } from 'express';
import request from 'supertest';
import { getOracleConnection } from '../../src/database/oraclePool.js';
import { rbacRepository } from '../../src/database/repositories/rbacRepository.js';
import { userRepository } from '../../src/database/repositories/userRepository.js';
import { generateTemporaryPassword, hashPassword } from '../../src/services/passwordService.js';

/**
 * Isolated, per-suite operational personas.
 *
 * Replaces the shared development accounts (admin, callcenter, service_center, warehouse,
 * mumbai_tech_1) whose pinned passwords were removed in Phase 3. Each suite gets fresh
 * accounts with random credentials, placed at the same organisational locations the dev
 * personas use (the default Service Center and the central warehouse), so suites no longer
 * depend on — or mutate — shared accounts.
 */
export type PersonaKey = 'admin' | 'callcenter' | 'serviceCenter' | 'warehouse' | 'engineer';

export interface Persona {
  key: PersonaKey;
  role: string;
  userId: string;
  username: string;
  password: string;
  locationId?: string;
  cookie: string;
  csrf: string;
}

const ROLE_BY_KEY: Record<PersonaKey, string> = {
  admin: 'ADMIN',
  callcenter: 'CALL_CENTER',
  serviceCenter: 'ASF',
  warehouse: 'WAREHOUSE',
  engineer: 'ENGINEER',
};

const DEFAULT_FULL_NAMES: Record<PersonaKey, string> = {
  admin: 'System Operations Lead',
  callcenter: 'Frontline Call Handler',
  serviceCenter: 'Mumbai Service Center Lead',
  warehouse: 'Central Warehouse Coordinator',
  engineer: 'Field Engineer Mumbai',
};

/**
 * Resolves persona locations. Service Center and engineer personas are placed at the ASF that the
 * approved pincode routing (V025) assigns the suites' customer pincode to, so dispatch ownership
 * checks behave as in production.
 */
export async function resolvePersonaLocations(servicePincode = '400001'): Promise<{ defaultAsfId: string; warehouseId: string }> {
  const conn = await getOracleConnection();
  try {
    const routed: any = await conn.execute(
      `SELECT p.DEFAULT_ASF_ID FROM PINCODES p JOIN LOCATIONS l ON l.LOCATION_ID = p.DEFAULT_ASF_ID
        WHERE p.PINCODE = :pin AND p.IS_SERVICEABLE = 'Y' AND l.IS_ACTIVE = 'Y' AND l.PARTY_TYPE = 'ASF'`,
      { pin: servicePincode },
      { outFormat: 4002 }
    );
    const asf: any = routed.rows?.[0]?.DEFAULT_ASF_ID ? { rows: [{ LOCATION_ID: routed.rows[0].DEFAULT_ASF_ID }] } : await conn.execute(
      `SELECT LOCATION_ID FROM LOCATIONS
        WHERE PARTY_TYPE = 'ASF' AND IS_ACTIVE = 'Y' AND IS_TEST_FIXTURE = 'N'
        ORDER BY CASE WHEN IS_DEFAULT = 'Y' THEN 0 WHEN LOCATION_CODE = 'ASF_8441' THEN 1 ELSE 2 END, CREATED_AT
        FETCH FIRST 1 ROWS ONLY`,
      {},
      { outFormat: 4002 }
    );
    const wh: any = await conn.execute(
      `SELECT LOCATION_ID FROM LOCATIONS
        WHERE PARTY_TYPE = 'CENTRAL_WAREHOUSE' AND IS_ACTIVE = 'Y' AND IS_TEST_FIXTURE = 'N'
        ORDER BY CASE WHEN LOCATION_ID = '00000000-0000-0000-0008-000000000001' THEN 0 ELSE 1 END, CREATED_AT
        FETCH FIRST 1 ROWS ONLY`,
      {},
      { outFormat: 4002 }
    );
    return { defaultAsfId: asf.rows[0].LOCATION_ID, warehouseId: wh.rows[0].LOCATION_ID };
  } finally {
    await conn.close();
  }
}

export async function loginPersona(app: Express, username: string, password: string): Promise<{ cookie: string; csrf: string }> {
  const res = await request(app).post('/api/v1/auth/login').send({ username, password });
  if (res.status !== 200) {
    throw new Error(`Persona login failed for ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const header = res.headers['set-cookie'];
  const cookie = Array.isArray(header) ? header.join('; ') : header || '';
  return { cookie, csrf: res.body?.data?.csrfToken || '' };
}

export async function provisionPersonas(
  app: Express,
  options: {
    tag: string;
    servicePincode?: string;
    locations?: Partial<Record<PersonaKey, string | undefined>>;
    fullNames?: Partial<Record<PersonaKey, string>>;
  }
): Promise<Record<PersonaKey, Persona>> {
  const { defaultAsfId, warehouseId } = await resolvePersonaLocations(options.servicePincode);
  const defaultLocations: Record<PersonaKey, string | undefined> = {
    admin: undefined,
    callcenter: undefined,
    serviceCenter: defaultAsfId,
    warehouse: warehouseId,
    engineer: defaultAsfId,
  };
  const suffix = `${options.tag}_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`.toLowerCase();
  const personas = {} as Record<PersonaKey, Persona>;

  for (const key of Object.keys(ROLE_BY_KEY) as PersonaKey[]) {
    const password = generateTemporaryPassword();
    const userId = crypto.randomUUID();
    const username = `t_${key.toLowerCase()}_${suffix}`.slice(0, 50);
    const locationId = options.locations && key in options.locations ? options.locations[key] : defaultLocations[key];
    await userRepository.createUser({
      userId,
      username,
      email: `${username}@crm.test`,
      fullName: options.fullNames?.[key] || DEFAULT_FULL_NAMES[key],
      passwordHash: await hashPassword(password),
      phoneNumber: `98${String(crypto.randomInt(10_000_000, 99_999_999))}`,
      locationId,
    });
    await rbacRepository.assignRoleToUser(userId, ROLE_BY_KEY[key], 'TEST_PERSONA_SETUP');
    const session = await loginPersona(app, username, password);
    personas[key] = { key, role: ROLE_BY_KEY[key], userId, username, password, locationId, ...session };
  }
  return personas;
}
