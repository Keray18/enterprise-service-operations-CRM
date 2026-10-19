import winston from 'winston';
import { env } from '../config/env.js';
import { getCorrelationId } from '../middleware/correlationId.js';

const SENSITIVE_EXACT_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'newpassword',
  'oldpassword',
  'token',
  'sessiontoken',
  'session_token',
  'sessiontokenhash',
  'session_token_hash',
  'csrftoken',
  'csrf_token',
  'secret',
  'authorization',
  'cookie',
  'set-cookie',
  'check_in_otp',
  'happy_code',
  'otp',
  'oracle_password',
  'credentials',
]);

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (SENSITIVE_EXACT_KEYS.has(lower)) return true;
  return (
    lower.includes('password') ||
    lower.includes('secret') ||
    lower.includes('token') ||
    lower.includes('cookie') ||
    lower.includes('hash') ||
    lower.includes('credential')
  );
}

function sanitize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof val === 'object') {
      sanitized[key] = sanitize(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

const correlationIdFormat = winston.format((info) => {
  info['correlationId'] = getCorrelationId();
  return info;
});

const sanitizeFormat = winston.format((info) => {
  return sanitize(info) as winston.Logform.TransformableInfo;
});

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    correlationIdFormat(),
    sanitizeFormat(),
    env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.printf(({ timestamp, level, message, correlationId, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `[${timestamp}] [${level.toUpperCase()}] [${correlationId}]: ${message}${metaStr}`;
        })
  ),
  transports: [new winston.transports.Console()],
});
