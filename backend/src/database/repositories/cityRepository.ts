import crypto from 'crypto';
import oracledb from 'oracledb';
import { CityRecord, CityWithRelationsRecord, PaginatedResult } from '../../types/catalog.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToCityWithRelations(row: any): CityWithRelationsRecord {
  return {
    cityId: row.CITY_ID,
    cityName: row.CITY_NAME,
    stateId: row.STATE_ID,
    isActive: row.IS_ACTIVE,
    versionNo: Number(row.VERSION_NO || 1),
    createdAt: new Date(row.CREATED_AT),
    updatedAt: new Date(row.UPDATED_AT),
    createdBy: row.CREATED_BY || undefined,
    updatedBy: row.UPDATED_BY || undefined,
    stateName: row.STATE_NAME,
    stateCode: row.STATE_CODE,
    zone: row.ZONE,
  };
}

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  city_name: 'c.CITY_NAME',
  state_name: 's.STATE_NAME',
  state_code: 's.STATE_CODE',
  is_active: 'c.IS_ACTIVE',
  created_at: 'c.CREATED_AT',
  updated_at: 'c.UPDATED_AT',
};

export class CityRepository {
  async listCities(options: {
    search?: string;
    stateId?: string;
    isActive?: 'Y' | 'N';
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<CityWithRelationsRecord>> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push('(LOWER(c.CITY_NAME) LIKE :search OR LOWER(s.STATE_NAME) LIKE :search)');
      }

      if (options.stateId) {
        binds.stateId = options.stateId;
        whereClauses.push('c.STATE_ID = :stateId');
      }

      if (options.isActive) {
        binds.isActive = options.isActive;
        whereClauses.push('c.IS_ACTIVE = :isActive');
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM CITIES c
        JOIN STATES s ON c.STATE_ID = s.STATE_ID
        ${whereSql}
      `;
      const countResult = await conn.execute<any>(countSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      const total = Number(countResult.rows?.[0]?.CNT || 0);

      const sortColumn =
        (options.sortBy && ALLOWED_SORT_COLUMNS[options.sortBy.toLowerCase()]) || 'c.CITY_NAME';
      const sortDir = options.sortOrder?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

      const page = Math.max(1, options.page);
      const limit = Math.min(100, Math.max(1, options.limit));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const dataSql = `
        SELECT c.CITY_ID, c.CITY_NAME, c.STATE_ID, c.IS_ACTIVE,
               c.VERSION_NO, c.CREATED_AT, c.UPDATED_AT, c.CREATED_BY, c.UPDATED_BY,
               s.STATE_NAME, s.STATE_CODE, s.ZONE
        FROM CITIES c
        JOIN STATES s ON c.STATE_ID = s.STATE_ID
        ${whereSql}
        ORDER BY ${sortColumn} ${sortDir}, c.CITY_ID ASC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      const items = (dataResult.rows || []).map(mapRowToCityWithRelations);

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

  async findById(cityId: string): Promise<CityWithRelationsRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT c.CITY_ID, c.CITY_NAME, c.STATE_ID, c.IS_ACTIVE,
               c.VERSION_NO, c.CREATED_AT, c.UPDATED_AT, c.CREATED_BY, c.UPDATED_BY,
               s.STATE_NAME, s.STATE_CODE, s.ZONE
        FROM CITIES c
        JOIN STATES s ON c.STATE_ID = s.STATE_ID
        WHERE c.CITY_ID = :cityId
      `;
      const result = await conn.execute<any>(sql, { cityId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToCityWithRelations(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async findByNameAndState(cityName: string, stateId: string): Promise<CityRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT CITY_ID, CITY_NAME, STATE_ID, IS_ACTIVE,
               VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM CITIES
        WHERE LOWER(CITY_NAME) = LOWER(:cityName)
          AND STATE_ID = :stateId
      `;
      const result = await conn.execute<any>(
        sql,
        { cityName: cityName.trim(), stateId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (!result.rows || result.rows.length === 0) return null;
      const row = result.rows[0];
      return {
        cityId: row.CITY_ID,
        cityName: row.CITY_NAME,
        stateId: row.STATE_ID,
        isActive: row.IS_ACTIVE,
        versionNo: Number(row.VERSION_NO || 1),
        createdAt: new Date(row.CREATED_AT),
        updatedAt: new Date(row.UPDATED_AT),
        createdBy: row.CREATED_BY || undefined,
        updatedBy: row.UPDATED_BY || undefined,
      };
    } finally {
      await conn.close();
    }
  }

  async createCity(data: {
    cityName: string;
    stateId: string;
    isActive?: 'Y' | 'N';
    createdBy?: string;
  }): Promise<CityWithRelationsRecord> {
    const conn = await getOracleConnection();
    try {
      const cityId = crypto.randomUUID();
      const sql = `
        INSERT INTO CITIES (
          CITY_ID, CITY_NAME, STATE_ID, IS_ACTIVE,
          VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        ) VALUES (
          :cityId, :cityName, :stateId, :isActive,
          1, SYSTIMESTAMP, SYSTIMESTAMP, :createdBy, :createdBy
        )
      `;

      await conn.execute(
        sql,
        {
          cityId,
          cityName: data.cityName.trim(),
          stateId: data.stateId,
          isActive: data.isActive || 'Y',
          createdBy: data.createdBy || null,
        },
        { autoCommit: true }
      );

      const created = await this.findById(cityId);
      if (!created) throw new Error(`Failed to retrieve created City record: ${cityId}`);
      return created;
    } finally {
      await conn.close();
    }
  }

  async updateCity(
    cityId: string,
    data: {
      cityName: string;
      stateId: string;
      isActive?: 'Y' | 'N';
      updatedBy?: string;
      versionNo: number;
    }
  ): Promise<CityWithRelationsRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE CITIES
        SET CITY_NAME = :cityName,
            STATE_ID = :stateId,
            IS_ACTIVE = :isActive,
            VERSION_NO = VERSION_NO + 1,
            UPDATED_AT = SYSTIMESTAMP,
            UPDATED_BY = :updatedBy
        WHERE CITY_ID = :cityId
          AND VERSION_NO = :versionNo
      `;

      const result = await conn.execute(
        sql,
        {
          cityId,
          cityName: data.cityName.trim(),
          stateId: data.stateId,
          isActive: data.isActive || 'Y',
          updatedBy: data.updatedBy || null,
          versionNo: data.versionNo,
        },
        { autoCommit: true }
      );

      if (result.rowsAffected === 0) {
        return null;
      }

      return await this.findById(cityId);
    } finally {
      await conn.close();
    }
  }

  async updateStatus(
    cityId: string,
    isActive: 'Y' | 'N',
    versionNo: number,
    updatedBy?: string
  ): Promise<CityWithRelationsRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE CITIES
        SET IS_ACTIVE = :isActive,
            VERSION_NO = VERSION_NO + 1,
            UPDATED_AT = SYSTIMESTAMP,
            UPDATED_BY = :updatedBy
        WHERE CITY_ID = :cityId
          AND VERSION_NO = :versionNo
      `;

      const result = await conn.execute(
        sql,
        {
          cityId,
          isActive,
          versionNo,
          updatedBy: updatedBy || null,
        },
        { autoCommit: true }
      );

      if (result.rowsAffected === 0) {
        return null;
      }

      return await this.findById(cityId);
    } finally {
      await conn.close();
    }
  }

  async countReferencingPincodes(cityId: string): Promise<number> {
    const conn = await getOracleConnection();
    try {
      const sql = `SELECT COUNT(*) AS CNT FROM PINCODES WHERE CITY_ID = :cityId AND IS_SERVICEABLE = 'Y'`;
      const res = await conn.execute<any>(sql, { cityId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return Number(res.rows?.[0]?.CNT || 0);
    } finally {
      await conn.close();
    }
  }
}

export const cityRepository = new CityRepository();
