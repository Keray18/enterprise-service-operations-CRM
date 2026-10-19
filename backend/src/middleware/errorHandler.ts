import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logging/logger.js';
import { getCorrelationId } from './correlationId.js';

export interface ApiSuccessEnvelope<T = unknown> {
  success: true;
  data: T;
  meta: {
    correlationId: string;
    timestamp: string;
  };
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    correlationId: string;
    timestamp: string;
  };
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): Response {
  const envelope: ApiSuccessEnvelope<T> = {
    success: true,
    data,
    meta: {
      correlationId: getCorrelationId(),
      timestamp: new Date().toISOString(),
    },
  };
  return res.status(statusCode).json(envelope);
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 500,
  code = 'INTERNAL_ERROR',
  details?: unknown
): Response {
  const envelope: ApiErrorEnvelope = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
    meta: {
      correlationId: getCorrelationId(),
      timestamp: new Date().toISOString(),
    },
  };
  return res.status(statusCode).json(envelope);
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const correlationId = getCorrelationId();

  // Handle known application errors
  if (err instanceof AppError) {
    logger.warn(`AppError [${err.code}]: ${err.message}`, {
      statusCode: err.statusCode,
      details: err.details,
    });
    sendError(res, err.message, err.statusCode, err.code, err.details);
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const formattedDetails = err.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    logger.warn('Validation error', { details: formattedDetails });
    sendError(res, 'Request validation failed', 400, 'VALIDATION_ERROR', formattedDetails);
    return;
  }

  // Handle unexpected internal server errors
  logger.error(`Unhandled Exception: ${err.message}`, {
    stack: err.stack,
    correlationId,
  });

  // Never expose raw stack traces or internal database error messages to clients
  sendError(
    res,
    'An unexpected internal error occurred. Please contact system support.',
    500,
    'INTERNAL_SERVER_ERROR'
  );
}
