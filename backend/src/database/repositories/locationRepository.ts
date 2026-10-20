import crypto from 'crypto';
import oracledb from 'oracledb';
import { LocationRecord, PaginatedResult } from '../../types/catalog.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToLocation(row: any): LocationRecord {
  return {
    locationId: row.LOCATION_ID,
    locationCode: row.LOCATION_CODE,
    locationName: row.LOCATION_NAME,
    partyType: row.PARTY_TYPE,
    isActive: row.IS_ACTIVE,
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
    partyType?: string;
    isActive?: 'Y' | 'N';
    page: number;
    limit: number;
  }): Promise<PaginatedResult<LocationRecord>> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push('(LOWER(LOCATION_CODE) LIKE :search OR LOWER(LOCATION_NAME) LIKE :search)');
      }

      if (options.partyType) {
        binds.partyType = options.partyType.toUpperCase();
        whereClauses.push('PARTY_TYPE = :partyType');
      }

      if (options.isActive) {
        binds.isActive = options.isActive;
        whereClauses.push('IS_ACTIVE = :isActive');
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countSql = `SELECT COUNT(*) AS CNT FROM LOCATIONS ${whereSql}`;
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
        SELECT LOCATION_ID, LOCATION_CODE, LOCATION_NAME, PARTY_TYPE,
               IS_ACTIVE, VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM LOCATIONS
        ${whereSql}
        ORDER BY LOCATION_NAME ASC, LOCATION_ID ASC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      const items = (dataResult.rows || []).map(mapRowToLocation);

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    } finally {
      await conn.close();
    }
  }

  async findById(locationId: string): Promise<LocationRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT LOCATION_ID, LOCATION_CODE, LOCATION_NAME, PARTY_TYPE,
               IS_ACTIVE, VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM LOCATIONS
        WHERE LOCATION_ID = :locationId
      `;
      const result = await conn.execute<any>(sql, { locationId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToLocation(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async findByCode(locationCode: string): Promise<LocationRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT LOCATION_ID, LOCATION_CODE, LOCATION_NAME, PARTY_TYPE,
               IS_ACTIVE, VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM LOCATIONS
        WHERE LOWER(LOCATION_CODE) = LOWER(:locationCode)
      `;
      const result = await conn.execute<any>(sql, { locationCode: locationCode.trim() }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToLocation(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async createLocation(data: {
    locationCode: string;
    locationName: string;
    partyType: 'ASF' | 'CENTRAL_WAREHOUSE' | 'REGIONAL_WAREHOUSE' | 'DISTRIBUTOR' | 'HEAD_OFFICE';
    isActive?: 'Y' | 'N';
    createdBy?: string;
  }): Promise<LocationRecord> {
    const conn = await getOracleConnection();
    try {
      const locationId = crypto.randomUUID();
      const sql = `
        INSERT INTO LOCATIONS (
          LOCATION_ID, LOCATION_CODE, LOCATION_NAME, PARTY_TYPE,
          IS_ACTIVE, VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        ) VALUES (
          :locationId, :locationCode, :locationName, :partyType,
          :isActive, 1, SYSTIMESTAMP, SYSTIMESTAMP, :createdBy, :createdBy
        )
      `;

      await conn.execute(
        sql,
        {
          locationId,
          locationCode: data.locationCode.trim().toUpperCase(),
          locationName: data.locationName.trim(),
          partyType: data.partyType,
          isActive: data.isActive || 'Y',
          createdBy: data.createdBy || null,
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
