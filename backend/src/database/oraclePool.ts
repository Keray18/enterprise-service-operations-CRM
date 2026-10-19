import oracledb from 'oracledb';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';

let pool: oracledb.Pool | null = null;
let isInitializing = false;

export interface DatabaseReadinessResult {
  isReady: boolean;
  latencyMs?: number;
  error?: string;
  details?: {
    user: string;
    connectString: string;
    poolConnectionsOpen?: number;
    poolConnectionsInUse?: number;
  };
}

/**
 * Initializes the node-oracledb connection pool using Thin mode.
 */
export async function initOraclePool(): Promise<oracledb.Pool> {
  if (pool) {
    return pool;
  }

  if (isInitializing) {
    // Wait for in-flight initialization
    while (isInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (pool) return pool;
  }

  isInitializing = true;
  try {
    logger.info('Initializing Oracle connection pool (Thin Mode)...', {
      user: env.ORACLE_USER,
      connectString: env.ORACLE_CONNECT_STRING,
      poolMin: env.ORACLE_POOL_MIN,
      poolMax: env.ORACLE_POOL_MAX,
    });

    pool = await oracledb.createPool({
      user: env.ORACLE_USER,
      password: env.ORACLE_PASSWORD,
      connectString: env.ORACLE_CONNECT_STRING,
      poolMin: env.ORACLE_POOL_MIN,
      poolMax: env.ORACLE_POOL_MAX,
      poolIncrement: env.ORACLE_POOL_INCREMENT,
      poolTimeout: env.ORACLE_POOL_TIMEOUT,
      queueTimeout: env.ORACLE_QUEUE_TIMEOUT,
    });

    logger.info('Oracle connection pool initialized successfully');
    return pool;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to initialize Oracle connection pool', {
      error: errorMsg,
      user: env.ORACLE_USER,
      connectString: env.ORACLE_CONNECT_STRING,
    });
    pool = null;
    throw err;
  } finally {
    isInitializing = false;
  }
}

/**
 * Retrieves an active connection from the pool.
 */
export async function getOracleConnection(): Promise<oracledb.Connection> {
  if (!pool) {
    await initOraclePool();
  }
  if (!pool) {
    throw new Error('Oracle connection pool is not available');
  }
  return pool.getConnection();
}

/**
 * Gracefully terminates the Oracle connection pool with a timeout.
 */
export async function closeOraclePool(timeoutSeconds = 10): Promise<void> {
  if (!pool) {
    return;
  }

  try {
    logger.info('Closing Oracle connection pool gracefully...');
    await pool.close(timeoutSeconds);
    pool = null;
    logger.info('Oracle connection pool closed');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Error while closing Oracle connection pool', { error: errorMsg });
    pool = null;
  }
}

/**
 * Performs an active readiness probe against Oracle DB using a real query.
 * Never returns false positives or mock responses.
 */
export async function checkDatabaseReadiness(): Promise<DatabaseReadinessResult> {
  const start = Date.now();
  let conn: oracledb.Connection | null = null;

  try {
    if (!pool) {
      await initOraclePool();
    }
    if (!pool) {
      return {
        isReady: false,
        error: 'Oracle pool could not be initialized',
        details: {
          user: env.ORACLE_USER,
          connectString: env.ORACLE_CONNECT_STRING,
        },
      };
    }

    conn = await pool.getConnection();
    const result = await conn.execute('SELECT 1 AS HEALTHCHECK FROM DUAL');
    const latencyMs = Date.now() - start;

    if (result.rows && result.rows.length > 0) {
      return {
        isReady: true,
        latencyMs,
        details: {
          user: env.ORACLE_USER,
          connectString: env.ORACLE_CONNECT_STRING,
          poolConnectionsOpen: pool.connectionsOpen,
          poolConnectionsInUse: pool.connectionsInUse,
        },
      };
    }

    return {
      isReady: false,
      latencyMs,
      error: 'Query executed but returned unexpected payload',
      details: {
        user: env.ORACLE_USER,
        connectString: env.ORACLE_CONNECT_STRING,
      },
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);

    return {
      isReady: false,
      latencyMs,
      error: errorMsg,
      details: {
        user: env.ORACLE_USER,
        connectString: env.ORACLE_CONNECT_STRING,
      },
    };
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch {
        // Ignore close errors during probe
      }
    }
  }
}
