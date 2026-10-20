import crypto from 'crypto';
import oracledb from 'oracledb';
import {
  PaginatedResult,
  PincodeLookupResult,
  PincodeRecord,
  PincodeWithRelationsRecord,
} from '../../types/catalog.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToPincodeWithRelations(row: any): PincodeWithRelationsRecord {
  return {
    pincodeId: row.PINCODE_ID,
    pincode: row.PINCODE,
    stateId: row.STATE_ID,
    cityId: row.CITY_ID,
    defaultAsfId: row.DEFAULT_ASF_ID || undefined,
    isServiceable: row.IS_SERVICEABLE,
    versionNo: Number(row.VERSION_NO || 1),
    createdAt: new Date(row.CREATED_AT),
    updatedAt: new Date(row.UPDATED_AT),
    createdBy: row.CREATED_BY || undefined,
    updatedBy: row.UPDATED_BY || undefined,
    stateName: row.STATE_NAME,
    stateCode: row.STATE_CODE,
    cityName: row.CITY_NAME,
    defaultAsfCode: row.DEFAULT_ASF_CODE || undefined,
    defaultAsfName: row.DEFAULT_ASF_NAME || undefined,
  };
}

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  pincode: 'p.PINCODE',
  city_name: 'c.CITY_NAME',
  state_name: 's.STATE_NAME',
  is_serviceable: 'p.IS_SERVICEABLE',
  created_at: 'p.CREATED_AT',
  updated_at: 'p.UPDATED_AT',
};

export class PincodeRepository {
  async listPincodes(options: {
    search?: string;
    stateId?: string;
    cityId?: string;
    isServiceable?: 'Y' | 'N';
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<PincodeWithRelationsRecord>> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push('(p.PINCODE LIKE :search OR LOWER(c.CITY_NAME) LIKE :search OR LOWER(s.STATE_NAME) LIKE :search)');
      }

      if (options.stateId) {
        binds.stateId = options.stateId;
        whereClauses.push('p.STATE_ID = :stateId');
      }

      if (options.cityId) {
        binds.cityId = options.cityId;
        whereClauses.push('p.CITY_ID = :cityId');
      }

      if (options.isServiceable) {
        binds.isServiceable = options.isServiceable;
        whereClauses.push('p.IS_SERVICEABLE = :isServiceable');
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM PINCODES p
        JOIN STATES s ON p.STATE_ID = s.STATE_ID
        JOIN CITIES c ON p.CITY_ID = c.CITY_ID
        LEFT JOIN LOCATIONS l ON p.DEFAULT_ASF_ID = l.LOCATION_ID
        ${whereSql}
      `;
      const countResult = await conn.execute<any>(countSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      const total = Number(countResult.rows?.[0]?.CNT || 0);

      const sortColumn =
        (options.sortBy && ALLOWED_SORT_COLUMNS[options.sortBy.toLowerCase()]) || 'p.PINCODE';
      const sortDir = options.sortOrder?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

      const page = Math.max(1, options.page);
      const limit = Math.min(100, Math.max(1, options.limit));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const dataSql = `
        SELECT p.PINCODE_ID, p.PINCODE, p.STATE_ID, p.CITY_ID, p.DEFAULT_ASF_ID,
               p.IS_SERVICEABLE, p.VERSION_NO, p.CREATED_AT, p.UPDATED_AT, p.CREATED_BY, p.UPDATED_BY,
               s.STATE_NAME, s.STATE_CODE, c.CITY_NAME,
               l.LOCATION_CODE AS DEFAULT_ASF_CODE, l.LOCATION_NAME AS DEFAULT_ASF_NAME
        FROM PINCODES p
        JOIN STATES s ON p.STATE_ID = s.STATE_ID
        JOIN CITIES c ON p.CITY_ID = c.CITY_ID
        LEFT JOIN LOCATIONS l ON p.DEFAULT_ASF_ID = l.LOCATION_ID
        ${whereSql}
        ORDER BY ${sortColumn} ${sortDir}, p.PINCODE_ID ASC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      const items = (dataResult.rows || []).map(mapRowToPincodeWithRelations);

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

  async findById(pincodeId: string): Promise<PincodeWithRelationsRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT p.PINCODE_ID, p.PINCODE, p.STATE_ID, p.CITY_ID, p.DEFAULT_ASF_ID,
               p.IS_SERVICEABLE, p.VERSION_NO, p.CREATED_AT, p.UPDATED_AT, p.CREATED_BY, p.UPDATED_BY,
               s.STATE_NAME, s.STATE_CODE, c.CITY_NAME,
               l.LOCATION_CODE AS DEFAULT_ASF_CODE, l.LOCATION_NAME AS DEFAULT_ASF_NAME
        FROM PINCODES p
        JOIN STATES s ON p.STATE_ID = s.STATE_ID
        JOIN CITIES c ON p.CITY_ID = c.CITY_ID
        LEFT JOIN LOCATIONS l ON p.DEFAULT_ASF_ID = l.LOCATION_ID
        WHERE p.PINCODE_ID = :pincodeId
      `;
      const result = await conn.execute<any>(sql, { pincodeId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToPincodeWithRelations(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async findByPincode(pincode: string): Promise<PincodeRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT PINCODE_ID, PINCODE, STATE_ID, CITY_ID, DEFAULT_ASF_ID,
               IS_SERVICEABLE, VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM PINCODES
        WHERE PINCODE = :pincode
      `;
      const result = await conn.execute<any>(sql, { pincode: pincode.trim() }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      const row = result.rows[0];
      return {
        pincodeId: row.PINCODE_ID,
        pincode: row.PINCODE,
        stateId: row.STATE_ID,
        cityId: row.CITY_ID,
        defaultAsfId: row.DEFAULT_ASF_ID || undefined,
        isServiceable: row.IS_SERVICEABLE,
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

  async lookupPincode(pincode: string): Promise<PincodeLookupResult | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT p.PINCODE, p.STATE_ID, s.STATE_CODE, s.STATE_NAME,
               p.CITY_ID, c.CITY_NAME, p.IS_SERVICEABLE,
               p.DEFAULT_ASF_ID, l.LOCATION_CODE AS DEFAULT_ASF_CODE, l.LOCATION_NAME AS DEFAULT_ASF_NAME
        FROM PINCODES p
        JOIN STATES s ON p.STATE_ID = s.STATE_ID
        JOIN CITIES c ON p.CITY_ID = c.CITY_ID
        LEFT JOIN LOCATIONS l ON p.DEFAULT_ASF_ID = l.LOCATION_ID
        WHERE p.PINCODE = :pincode
      `;
      const result = await conn.execute<any>(sql, { pincode: pincode.trim() }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      const row = result.rows[0];
      return {
        pincode: row.PINCODE,
        stateId: row.STATE_ID,
        stateCode: row.STATE_CODE,
        stateName: row.STATE_NAME,
        cityId: row.CITY_ID,
        cityName: row.CITY_NAME,
        isServiceable: row.IS_SERVICEABLE,
        defaultAsfId: row.DEFAULT_ASF_ID || undefined,
        defaultAsfCode: row.DEFAULT_ASF_CODE || undefined,
        defaultAsfName: row.DEFAULT_ASF_NAME || undefined,
      };
    } finally {
      await conn.close();
    }
  }

  async createPincode(data: {
    pincode: string;
    stateId: string;
    cityId: string;
    defaultAsfId?: string;
    isServiceable?: 'Y' | 'N';
    createdBy?: string;
  }): Promise<PincodeWithRelationsRecord> {
    const conn = await getOracleConnection();
    try {
      const pincodeId = crypto.randomUUID();
      const sql = `
        INSERT INTO PINCODES (
          PINCODE_ID, PINCODE, STATE_ID, CITY_ID, DEFAULT_ASF_ID,
          IS_SERVICEABLE, VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        ) VALUES (
          :pincodeId, :pincode, :stateId, :cityId, :defaultAsfId,
          :isServiceable, 1, SYSTIMESTAMP, SYSTIMESTAMP, :createdBy, :createdBy
        )
      `;

      await conn.execute(
        sql,
        {
          pincodeId,
          pincode: data.pincode.trim(),
          stateId: data.stateId,
          cityId: data.cityId,
          defaultAsfId: data.defaultAsfId || null,
          isServiceable: data.isServiceable || 'Y',
          createdBy: data.createdBy || null,
        },
        { autoCommit: true }
      );

      const created = await this.findById(pincodeId);
      if (!created) throw new Error(`Failed to retrieve created Pincode record: ${pincodeId}`);
      return created;
    } finally {
      await conn.close();
    }
  }

  async updatePincode(
    pincodeId: string,
    data: {
      stateId: string;
      cityId: string;
      defaultAsfId?: string;
      isServiceable?: 'Y' | 'N';
      updatedBy?: string;
      versionNo: number;
    }
  ): Promise<PincodeWithRelationsRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE PINCODES
        SET STATE_ID = :stateId,
            CITY_ID = :cityId,
            DEFAULT_ASF_ID = :defaultAsfId,
            IS_SERVICEABLE = :isServiceable,
            VERSION_NO = VERSION_NO + 1,
            UPDATED_AT = SYSTIMESTAMP,
            UPDATED_BY = :updatedBy
        WHERE PINCODE_ID = :pincodeId
          AND VERSION_NO = :versionNo
      `;

      const result = await conn.execute(
        sql,
        {
          pincodeId,
          stateId: data.stateId,
          cityId: data.cityId,
          defaultAsfId: data.defaultAsfId || null,
          isServiceable: data.isServiceable || 'Y',
          updatedBy: data.updatedBy || null,
          versionNo: data.versionNo,
        },
        { autoCommit: true }
      );

      if (result.rowsAffected === 0) {
        return null;
      }

      return await this.findById(pincodeId);
    } finally {
      await conn.close();
    }
  }

  async updateStatus(
    pincodeId: string,
    isServiceable: 'Y' | 'N',
    versionNo: number,
    updatedBy?: string
  ): Promise<PincodeWithRelationsRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE PINCODES
        SET IS_SERVICEABLE = :isServiceable,
            VERSION_NO = VERSION_NO + 1,
            UPDATED_AT = SYSTIMESTAMP,
            UPDATED_BY = :updatedBy
        WHERE PINCODE_ID = :pincodeId
          AND VERSION_NO = :versionNo
      `;

      const result = await conn.execute(
        sql,
        {
          pincodeId,
          isServiceable,
          versionNo,
          updatedBy: updatedBy || null,
        },
        { autoCommit: true }
      );

      if (result.rowsAffected === 0) {
        return null;
      }

      return await this.findById(pincodeId);
    } finally {
      await conn.close();
    }
  }
}

export const pincodeRepository = new PincodeRepository();
