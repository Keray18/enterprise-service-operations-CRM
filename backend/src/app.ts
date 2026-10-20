import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { checkDatabaseReadiness } from './database/oraclePool.js';
import { logger } from './logging/logger.js';
import { correlationIdMiddleware } from './middleware/correlationId.js';
import { AppError, errorHandler, sendError, sendSuccess } from './middleware/errorHandler.js';
import { asfRoutes } from './routes/asfRoutes.js';
import { authRouter } from './routes/authRoutes.js';
import { callCenterRouter } from './routes/callCenterRoutes.js';
import { catalogRouter } from './routes/catalogRoutes.js';
import { customerRouter } from './routes/customerRoutes.js';
import { geographyRouter } from './routes/geographyRoutes.js';
import { workspaceRouter } from './routes/workspaceRoutes.js';

export function createApp(): Express {
  const app: Express = express();

  // Security Headers
  app.use(helmet());

  // Strict CORS Configuration
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id', 'x-csrf-token'],
      exposedHeaders: ['x-correlation-id', 'x-csrf-token'],
      credentials: true,
    })
  );

  // Request Body Size Limit & Cookie Parser
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Correlation ID Tracking
  app.use(correlationIdMiddleware);

  // Request Logging
  app.use((req: Request, res: Response, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`, {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
      });
    });
    next();
  });

  // Global Rate Limiter
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later.',
      },
    },
  });
  app.use(globalLimiter);

  // ============================================================================
  // Health & System Diagnostic Endpoints
  // ============================================================================

  /**
   * Liveness Probe: Verifies the Express application process is running.
   */
  app.get('/health/live', (_req: Request, res: Response) => {
    sendSuccess(res, {
      status: 'UP',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
    });
  });

  /**
   * Readiness Probe: Verifies dependencies, specifically testing a real connection
   * to Oracle Database via SELECT 1 FROM DUAL. Returns 503 if unavailable.
   */
  app.get('/health/ready', async (_req: Request, res: Response) => {
    const dbStatus = await checkDatabaseReadiness();

    if (dbStatus.isReady) {
      sendSuccess(res, {
        status: 'READY',
        database: {
          connected: true,
          latencyMs: dbStatus.latencyMs,
          details: dbStatus.details,
        },
      });
    } else {
      // Accurately reflect that the database is not reachable. Do not fake responses.
      sendError(
        res,
        'Oracle Database is not reachable or ready',
        503,
        'DATABASE_UNAVAILABLE',
        {
          error: dbStatus.error,
          latencyMs: dbStatus.latencyMs,
          details: dbStatus.details,
        }
      );
    }
  });

  /**
   * System Info Endpoint: Basic architectural metadata for frontend verification.
   */
  app.get('/api/v1/system/info', (_req: Request, res: Response) => {
    sendSuccess(res, {
      name: 'Enterprise After-Sales Service CRM API',
      version: '0.1.0',
      phase: 'Phase 1A — Enterprise Authentication & RBAC',
      environment: env.NODE_ENV,
      architecture: 'High-Integrity Modular Monolith',
      authoritativeBoundary: 'Express REST API',
      database: 'Oracle Database 19c/23c (Thin Mode)',
    });
  });

  // ============================================================================
  // Application Domain Routes
  // ============================================================================
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/catalog', catalogRouter);
  app.use('/api/v1/geography', geographyRouter);
  app.use('/api/v1/customers', customerRouter);
  app.use('/api/v1/call-center', callCenterRouter);
  app.use('/api/v1/asf', asfRoutes);
  app.use('/api/v1/workspace', workspaceRouter);

  // 404 Route Not Found Handler
  app.use((req: Request, _res: Response, next) => {
    next(new AppError(`Endpoint not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
  });

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
}
