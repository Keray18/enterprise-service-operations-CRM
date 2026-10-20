import crypto from 'crypto';
import oracledb from 'oracledb';
import { PaginatedResult, StateRecord } from '../../types/catalog.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToState(row: any): StateRecord {
  return {
    stateId: row.STATE_ID,
    stateCode: row.STATE_CODE,
    stateName: row.STATE_NAME,
    zone: row.ZONE,
    isActive: row.IS_ACTIVE,
    versionNo: Number(row.VERSION_NO || 1),
    createdAt: new Date(row.CREATED_AT),
    updatedAt: new Date(row.UPDATED_AT),
    createdBy: row.CREATED_BY || undefined,
    updatedBy: row.UPDATED_BY || undefined,
  };
}

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  state_code: 'STATE_CODE',
  state_name: 'STATE_NAME',
  zone: 'ZONE',
  is_active: 'IS_ACTIVE',
  created_at: 'CREATED_AT',
  updated_at: 'UPDATED_AT',
};

export class StateRepository {
  async listStates(options: {
    search?: string;
    zone?: string;
    isActive?: 'Y' | 'N';
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<StateRecord>> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push('(LOWER(STATE_CODE) LIKE :search OR LOWER(STATE_NAME) LIKE :search)');
      }

      if (options.zone) {
        binds.zone = options.zone.toUpperCase();
        whereClauses.push('ZONE = :zone');
      }

      if (options.isActive) {
        binds.isActive = options.isActive;
        whereClauses.push('IS_ACTIVE = :isActive');
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countSql = `SELECT COUNT(*) AS CNT FROM STATES ${whereSql}`;
      const countResult = await conn.execute<any>(countSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      const total = Number(countResult.rows?.[0]?.CNT || 0);

      const sortColumn =
        (options.sortBy && ALLOWED_SORT_COLUMNS[options.sortBy.toLowerCase()]) || 'STATE_NAME';
      const sortDir = options.sortOrder?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

      const page = Math.max(1, options.page);
      const limit = Math.min(100, Math.max(1, options.limit));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const dataSql = `
        SELECT STATE_ID, STATE_CODE, STATE_NAME, ZONE, IS_ACTIVE,
               VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM STATES
        ${whereSql}
        ORDER BY ${sortColumn} ${sortDir}, STATE_ID ASC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      const items = (dataResult.rows || []).map(mapRowToState);

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

  async findById(stateId: string): Promise<StateRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT STATE_ID, STATE_CODE, STATE_NAME, ZONE, IS_ACTIVE,
               VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM STATES
        WHERE STATE_ID = :stateId
      `;
      const result = await conn.execute<any>(sql, { stateId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToState(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async findByCode(stateCode: string): Promise<StateRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT STATE_ID, STATE_CODE, STATE_NAME, ZONE, IS_ACTIVE,
               VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM STATES
        WHERE LOWER(STATE_CODE) = LOWER(:stateCode)
      `;
      const result = await conn.execute<any>(sql, { stateCode: stateCode.trim() }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToState(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async findByName(stateName: string): Promise<StateRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT STATE_ID, STATE_CODE, STATE_NAME, ZONE, IS_ACTIVE,
               VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        FROM STATES
        WHERE LOWER(STATE_NAME) = LOWER(:stateName)
      `;
      const result = await conn.execute<any>(sql, { stateName: stateName.trim() }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToState(result.rows[0]);
    } finally {
      await conn.close();
    }
  }

  async createState(data: {
    stateCode: string;
    stateName: string;
    zone: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'CENTRAL' | 'NORTH_EAST';
    isActive?: 'Y' | 'N';
    createdBy?: string;
  }): Promise<StateRecord> {
    const conn = await getOracleConnection();
    try {
      const stateId = crypto.randomUUID();
      const sql = `
        INSERT INTO STATES (
          STATE_ID, STATE_CODE, STATE_NAME, ZONE, IS_ACTIVE,
          VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
        ) VALUES (
          :stateId, :stateCode, :stateName, :zone, :isActive,
          1, SYSTIMESTAMP, SYSTIMESTAMP, :createdBy, :createdBy
        )
      `;

      await conn.execute(
        sql,
        {
          stateId,
          stateCode: data.stateCode.toUpperCase().trim(),
          stateName: data.stateName.trim(),
          zone: data.zone,
          isActive: data.isActive || 'Y',
          createdBy: data.createdBy || null,
        },
        { autoCommit: true }
      );

      const created = await this.findById(stateId);
      if (!created) throw new Error(`Failed to retrieve created State record: ${stateId}`);
      return created;
    } finally {
      await conn.close();
    }
  }

  async updateState(
    stateId: string,
    data: {
      stateName: string;
      zone: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'CENTRAL' | 'NORTH_EAST';
      isActive?: 'Y' | 'N';
      updatedBy?: string;
      versionNo: number;
    }
  ): Promise<StateRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE STATES
        SET STATE_NAME = :stateName,
            ZONE = :zone,
            IS_ACTIVE = :isActive,
            VERSION_NO = VERSION_NO + 1,
            UPDATED_AT = SYSTIMESTAMP,
            UPDATED_BY = :updatedBy
        WHERE STATE_ID = :stateId
          AND VERSION_NO = :versionNo
      `;

      const result = await conn.execute(
        sql,
        {
          stateId,
          stateName: data.stateName.trim(),
          zone: data.zone,
          isActive: data.isActive || 'Y',
          updatedBy: data.updatedBy || null,
          versionNo: data.versionNo,
        },
        { autoCommit: true }
      );

      if (result.rowsAffected === 0) {
        return null;
      }

      return await this.findById(stateId);
    } finally {
      await conn.close();
    }
  }

  async updateStatus(
    stateId: string,
    isActive: 'Y' | 'N',
    versionNo: number,
    updatedBy?: string
  ): Promise<StateRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        UPDATE STATES
        SET IS_ACTIVE = :isActive,
            VERSION_NO = VERSION_NO + 1,
            UPDATED_AT = SYSTIMESTAMP,
            UPDATED_BY = :updatedBy
        WHERE STATE_ID = :stateId
          AND VERSION_NO = :versionNo
      `;

      const result = await conn.execute(
        sql,
        {
          stateId,
          isActive,
          versionNo,
          updatedBy: updatedBy || null,
        },
        { autoCommit: true }
      );

      if (result.rowsAffected === 0) {
        return null;
      }

      return await this.findById(stateId);
    } finally {
      await conn.close();
    }
  }

  async countReferencingCities(stateId: string): Promise<number> {
    const conn = await getOracleConnection();
    try {
      const sql = `SELECT COUNT(*) AS CNT FROM CITIES WHERE STATE_ID = :stateId AND IS_ACTIVE = 'Y'`;
      const res = await conn.execute<any>(sql, { stateId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return Number(res.rows?.[0]?.CNT || 0);
    } finally {
      await conn.close();
    }
  }

  async countReferencingPincodes(stateId: string): Promise<number> {
    const conn = await getOracleConnection();
    try {
      const sql = `SELECT COUNT(*) AS CNT FROM PINCODES WHERE STATE_ID = :stateId AND IS_SERVICEABLE = 'Y'`;
      const res = await conn.execute<any>(sql, { stateId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return Number(res.rows?.[0]?.CNT || 0);
    } finally {
      await conn.close();
    }
  }
}

export const stateRepository = new StateRepository();
