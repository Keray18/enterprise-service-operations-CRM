import crypto from 'crypto';
import oracledb from 'oracledb';
import { LocationRecord, PaginatedResult } from '../../types/catalog.js';
import { getOracleConnection } from '../oraclePool.js';

/**
 * Test-fixture location code rules. Mirrors the classification established by
 * V023__location_master_data_hygiene_and_classification.sql so that rows created after
 * that migration are classified identically.
 */
export function isTestFixtureLocationCode(codeUpper: string): boolean {
  return (
    codeUpper.includes('TEST') ||
    codeUpper.startsWith('SEC_') ||
    codeUpper.startsWith('ASF_360_') ||
    codeUpper.startsWith('ASF_OTH_') ||
    codeUpper.startsWith('ASF_2C_') ||
    codeUpper.startsWith('ASF_UAT_') ||
    codeUpper.startsWith('WH_UAT_') ||
    codeUpper.startsWith('ASF1_') ||
    codeUpper.startsWith('ASF2_') ||
    /_M[V-Z][0-9A-Z]{6,}/.test(codeUpper) // base36 Date.now() suffixes used by test fixtures
  );
}

function mapRowToLocation(row: any): LocationRecord {
  const isFixture = row.IS_TEST_FIXTURE === 'Y';
  return {
    locationId: row.LOCATION_ID,
    locationCode: row.LOCATION_CODE,
    locationName: row.LOCATION_NAME,
    partyType: row.PARTY_TYPE,
    isActive: row.IS_ACTIVE,
    isDefault: row.IS_DEFAULT || 'N',
    isTestFixture: isFixture ? 'Y' : 'N',
    dataOrigin: row.DATA_ORIGIN || (isFixture ? 'TEST_FIXTURE' : 'OPERATIONAL'),
    stateId: row.STATE_ID || undefined,
    stateName: row.STATE_NAME || undefined,
    cityName: row.CITY_NAME || undefined,
    pincode: row.PINCODE || undefined,
    // Client convenience aliases
    id: row.LOCATION_ID,
    code: row.LOCATION_CODE,
    name: row.LOCATION_NAME,
    city: row.CITY_NAME || undefined,
    state: row.STATE_NAME || undefined,
    versionNo: Number(row.VERSION_NO || 1),
    createdAt: new Date(row.CREATED_AT),
    updatedAt: new Date(row.UPDATED_AT),
    createdBy: row.CREATED_BY || undefined,
    updatedBy: row.UPDATED_BY || undefined,
  };
}

export class LocationRepository {
  async listLocations(options: {
    search?: string;
    partyType?: string | string[];
    isActive?: 'Y' | 'N';
    includeTestFixtures?: boolean;
    page: number;
    limit: number;
  }): Promise<PaginatedResult<LocationRecord>> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = ['1=1'];

      // Operational hygiene: exclude confirmed test fixtures by default
      if (!options.includeTestFixtures) {
        whereClauses.push("l.IS_TEST_FIXTURE = 'N'");
      }

      if (options.isActive) {
        binds.isActive = options.isActive;
        whereClauses.push('l.IS_ACTIVE = :isActive');
      }

      if (options.partyType) {
        if (Array.isArray(options.partyType)) {
          if (options.partyType.length > 0) {
            const ptBinds = options.partyType.map((pt, i) => {
              binds[`pt_${i}`] = pt.toUpperCase();
              return `:pt_${i}`;
            });
            whereClauses.push(`l.PARTY_TYPE IN (${ptBinds.join(', ')})`);
          }
        } else {
          binds.partyType = options.partyType.toUpperCase();
          whereClauses.push('l.PARTY_TYPE = :partyType');
        }
      }

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push(`(
          LOWER(l.LOCATION_CODE) LIKE :search OR
          LOWER(l.LOCATION_NAME) LIKE :search OR
          LOWER(c.CITY_NAME) LIKE :search OR
          LOWER(s.STATE_NAME) LIKE :search OR
          LOWER(pin_s.STATE_NAME) LIKE :search OR
          p_first.PINCODE LIKE :search
        )`);
      }

      const whereSql = whereClauses.join(' AND ');

      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM LOCATIONS l
        LEFT JOIN STATES s ON l.STATE_ID = s.STATE_ID
        LEFT JOIN (
          SELECT DEFAULT_ASF_ID, CITY_ID, STATE_ID, PINCODE,
                 ROW_NUMBER() OVER (PARTITION BY DEFAULT_ASF_ID ORDER BY PINCODE ASC) as RN
          FROM PINCODES
          WHERE DEFAULT_ASF_ID IS NOT NULL
        ) p_first ON l.LOCATION_ID = p_first.DEFAULT_ASF_ID AND p_first.RN = 1
        LEFT JOIN CITIES c ON p_first.CITY_ID = c.CITY_ID
        LEFT JOIN STATES pin_s ON p_first.STATE_ID = pin_s.STATE_ID
        WHERE ${whereSql}
      `;
      const countResult = await conn.execute<any>(countSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      const total = Number(countResult.rows?.[0]?.CNT || 0);

      const page = Math.max(1, options.page);
      const limit = Math.min(100, Math.max(1, options.limit));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const dataSql = `
        SELECT l.LOCATION_ID, l.LOCATION_CODE, l.LOCATION_NAME, l.PARTY_TYPE,
               l.IS_ACTIVE, l.IS_DEFAULT, l.IS_TEST_FIXTURE, l.DATA_ORIGIN,
               l.VERSION_NO, l.CREATED_AT, l.UPDATED_AT, l.CREATED_BY, l.UPDATED_BY,
               l.STATE_ID,
               NVL(s.STATE_NAME, pin_s.STATE_NAME) AS STATE_NAME,
               c.CITY_NAME,
               p_first.PINCODE
        FROM LOCATIONS l
        LEFT JOIN STATES s ON l.STATE_ID = s.STATE_ID
        LEFT JOIN (
          SELECT DEFAULT_ASF_ID, CITY_ID, STATE_ID, PINCODE,
                 ROW_NUMBER() OVER (PARTITION BY DEFAULT_ASF_ID ORDER BY PINCODE ASC) as RN
          FROM PINCODES
          WHERE DEFAULT_ASF_ID IS NOT NULL
        ) p_first ON l.LOCATION_ID = p_first.DEFAULT_ASF_ID AND p_first.RN = 1
        LEFT JOIN CITIES c ON p_first.CITY_ID = c.CITY_ID
        LEFT JOIN STATES pin_s ON p_first.STATE_ID = pin_s.STATE_ID
        WHERE ${whereSql}
        ORDER BY l.IS_DEFAULT DESC, l.LOCATION_NAME ASC, l.LOCATION_CODE ASC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      const items = (dataResult.rows || []).map(mapRowToLocation);
      const totalPages = Math.ceil(total / limit) || 1;

      return {
        locations: items,
        items,
        data: items,
        total,
        page,
        pageSize: limit,
        limit,
        totalPages,
        hasMore: page < totalPages,
      };
    } finally {
      await conn.close();
    }
  }

  async findById(locationId: string, externalConn?: oracledb.Connection): Promise<LocationRecord | null> {
    const conn = externalConn || (await getOracleConnection());
    try {
      const sql = `
        SELECT l.LOCATION_ID, l.LOCATION_CODE, l.LOCATION_NAME, l.PARTY_TYPE,
               l.IS_ACTIVE, l.IS_DEFAULT, l.IS_TEST_FIXTURE, l.DATA_ORIGIN,
               l.VERSION_NO, l.CREATED_AT, l.UPDATED_AT, l.CREATED_BY, l.UPDATED_BY,
               l.STATE_ID,
               NVL(s.STATE_NAME, pin_s.STATE_NAME) AS STATE_NAME,
               c.CITY_NAME,
               p_first.PINCODE
        FROM LOCATIONS l
        LEFT JOIN STATES s ON l.STATE_ID = s.STATE_ID
        LEFT JOIN (
          SELECT DEFAULT_ASF_ID, CITY_ID, STATE_ID, PINCODE,
                 ROW_NUMBER() OVER (PARTITION BY DEFAULT_ASF_ID ORDER BY PINCODE ASC) as RN
          FROM PINCODES
          WHERE DEFAULT_ASF_ID IS NOT NULL
        ) p_first ON l.LOCATION_ID = p_first.DEFAULT_ASF_ID AND p_first.RN = 1
        LEFT JOIN CITIES c ON p_first.CITY_ID = c.CITY_ID
        LEFT JOIN STATES pin_s ON p_first.STATE_ID = pin_s.STATE_ID
        WHERE l.LOCATION_ID = :locationId
      `;
      const result = await conn.execute<any>(sql, { locationId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToLocation(result.rows[0]);
    } finally {
      if (!externalConn) {
        await conn.close();
      }
    }
  }

  async findByCode(locationCode: string, externalConn?: oracledb.Connection): Promise<LocationRecord | null> {
    const conn = externalConn || (await getOracleConnection());
    try {
      const sql = `
        SELECT l.LOCATION_ID, l.LOCATION_CODE, l.LOCATION_NAME, l.PARTY_TYPE,
               l.IS_ACTIVE, l.IS_DEFAULT, l.IS_TEST_FIXTURE, l.DATA_ORIGIN,
               l.VERSION_NO, l.CREATED_AT, l.UPDATED_AT, l.CREATED_BY, l.UPDATED_BY,
               l.STATE_ID,
               NVL(s.STATE_NAME, pin_s.STATE_NAME) AS STATE_NAME,
               c.CITY_NAME,
               p_first.PINCODE
        FROM LOCATIONS l
        LEFT JOIN STATES s ON l.STATE_ID = s.STATE_ID
        LEFT JOIN (
          SELECT DEFAULT_ASF_ID, CITY_ID, STATE_ID, PINCODE,
                 ROW_NUMBER() OVER (PARTITION BY DEFAULT_ASF_ID ORDER BY PINCODE ASC) as RN
          FROM PINCODES
          WHERE DEFAULT_ASF_ID IS NOT NULL
        ) p_first ON l.LOCATION_ID = p_first.DEFAULT_ASF_ID AND p_first.RN = 1
        LEFT JOIN CITIES c ON p_first.CITY_ID = c.CITY_ID
        LEFT JOIN STATES pin_s ON p_first.STATE_ID = pin_s.STATE_ID
        WHERE LOWER(l.LOCATION_CODE) = LOWER(:locationCode)
      `;
      const result = await conn.execute<any>(sql, { locationCode: locationCode.trim() }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToLocation(result.rows[0]);
    } finally {
      if (!externalConn) {
        await conn.close();
      }
    }
  }

  async findDefaultAsfs(externalConn?: oracledb.Connection): Promise<LocationRecord[]> {
    const conn = externalConn || (await getOracleConnection());
    try {
      const sql = `
        SELECT l.LOCATION_ID, l.LOCATION_CODE, l.LOCATION_NAME, l.PARTY_TYPE,
               l.IS_ACTIVE, l.IS_DEFAULT, l.IS_TEST_FIXTURE, l.DATA_ORIGIN,
               l.VERSION_NO, l.CREATED_AT, l.UPDATED_AT, l.CREATED_BY, l.UPDATED_BY,
               l.STATE_ID,
               s.STATE_NAME,
               NULL AS CITY_NAME,
               NULL AS PINCODE
        FROM LOCATIONS l
        LEFT JOIN STATES s ON l.STATE_ID = s.STATE_ID
        WHERE l.PARTY_TYPE = 'ASF' AND l.IS_ACTIVE = 'Y' AND l.IS_DEFAULT = 'Y'
        ORDER BY l.LOCATION_CODE ASC
      `;
      const result = await conn.execute<any>(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (result.rows || []).map(mapRowToLocation);
    } finally {
      if (!externalConn) {
        await conn.close();
      }
    }
  }

  async findActiveAsfs(externalConn?: oracledb.Connection): Promise<LocationRecord[]> {
    const conn = externalConn || (await getOracleConnection());
    try {
      const sql = `
        SELECT l.LOCATION_ID, l.LOCATION_CODE, l.LOCATION_NAME, l.PARTY_TYPE,
               l.IS_ACTIVE, l.IS_DEFAULT, l.IS_TEST_FIXTURE, l.DATA_ORIGIN,
               l.VERSION_NO, l.CREATED_AT, l.UPDATED_AT, l.CREATED_BY, l.UPDATED_BY,
               l.STATE_ID,
               NVL(s.STATE_NAME, pin_s.STATE_NAME) AS STATE_NAME,
               c.CITY_NAME,
               p_first.PINCODE
        FROM LOCATIONS l
        LEFT JOIN STATES s ON l.STATE_ID = s.STATE_ID
        LEFT JOIN (
          SELECT DEFAULT_ASF_ID, CITY_ID, STATE_ID, PINCODE,
                 ROW_NUMBER() OVER (PARTITION BY DEFAULT_ASF_ID ORDER BY PINCODE ASC) as RN
          FROM PINCODES
          WHERE DEFAULT_ASF_ID IS NOT NULL
        ) p_first ON l.LOCATION_ID = p_first.DEFAULT_ASF_ID AND p_first.RN = 1
        LEFT JOIN CITIES c ON p_first.CITY_ID = c.CITY_ID
        LEFT JOIN STATES pin_s ON p_first.STATE_ID = pin_s.STATE_ID
        WHERE l.PARTY_TYPE = 'ASF' AND l.IS_ACTIVE = 'Y' AND l.IS_TEST_FIXTURE = 'N'
        ORDER BY l.IS_DEFAULT DESC, l.LOCATION_NAME ASC
      `;
      const result = await conn.execute<any>(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (result.rows || []).map(mapRowToLocation);
    } finally {
      if (!externalConn) {
        await conn.close();
      }
    }
  }

  async createLocation(data: {
    locationCode: string;
    locationName: string;
    partyType: 'ASF' | 'CENTRAL_WAREHOUSE' | 'REGIONAL_WAREHOUSE' | 'DISTRIBUTOR' | 'HEAD_OFFICE';
    isActive?: 'Y' | 'N';
    isDefault?: 'Y' | 'N';
    isTestFixture?: 'Y' | 'N';
    dataOrigin?: string;
    createdBy?: string;
    stateId?: string;
  }): Promise<LocationRecord> {
    const conn = await getOracleConnection();
    try {
      const locationId = crypto.randomUUID();
      const codeUpper = data.locationCode.trim().toUpperCase();
      const isFixture = data.isTestFixture || (isTestFixtureLocationCode(codeUpper) || data.createdBy === 'TEST_SETUP' ? 'Y' : 'N');
      const origin = data.dataOrigin || (isFixture === 'Y' ? 'TEST_FIXTURE' : 'OPERATIONAL');

      const sql = `
        INSERT INTO LOCATIONS (
          LOCATION_ID, LOCATION_CODE, LOCATION_NAME, PARTY_TYPE,
          IS_ACTIVE, IS_DEFAULT, IS_TEST_FIXTURE, DATA_ORIGIN,
          VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY, STATE_ID
        ) VALUES (
          :locationId, :locationCode, :locationName, :partyType,
          :isActive, :isDefault, :isTestFixture, :dataOrigin,
          1, SYSTIMESTAMP, SYSTIMESTAMP, :createdBy, :createdBy, :stateId
        )
      `;

      await conn.execute(
        sql,
        {
          locationId,
          locationCode: codeUpper,
          locationName: data.locationName.trim(),
          partyType: data.partyType,
          isActive: data.isActive || 'Y',
          isDefault: data.isDefault || 'N',
          isTestFixture: isFixture,
          dataOrigin: origin,
          createdBy: data.createdBy || null,
          stateId: data.stateId || null,
        },
        { autoCommit: true }
      );

      const created = await this.findById(locationId);
      if (!created) throw new Error(`Failed to retrieve created Location record: ${locationId}`);
      return created;
    } finally {
      await conn.close();
    }
  }
}

export const locationRepository = new LocationRepository();
