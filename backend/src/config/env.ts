import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load root .env first, fallback to local .env
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),

  // Oracle Database Configuration
  ORACLE_USER: z.string().min(1, 'ORACLE_USER is required'),
  ORACLE_PASSWORD: z.string().min(1, 'ORACLE_PASSWORD is required'),
  ORACLE_CONNECT_STRING: z.string().min(1, 'ORACLE_CONNECT_STRING is required'),
  ORACLE_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  ORACLE_POOL_MAX: z.coerce.number().int().positive().default(10),
  ORACLE_POOL_INCREMENT: z.coerce.number().int().positive().default(1),
  ORACLE_POOL_TIMEOUT: z.coerce.number().int().positive().default(60),
  ORACLE_QUEUE_TIMEOUT: z.coerce.number().int().nonnegative().default(5000),
});

export type EnvConfig = z.infer<typeof envSchema>;

let parsedEnv: EnvConfig;

// Provide test defaults when running in test environment
const rawEnv = {
  ...process.env,
  ...(process.env['NODE_ENV'] === 'test'
    ? {
        NODE_ENV: 'test',
        ORACLE_USER: process.env['ORACLE_USER'] || 'crm_test',
        ORACLE_PASSWORD: process.env['ORACLE_PASSWORD'] || 'test_secret',
        ORACLE_CONNECT_STRING: process.env['ORACLE_CONNECT_STRING'] || 'localhost:1521/TESTPDB',
      }
    : {}),
};

try {
  parsedEnv = envSchema.parse(rawEnv);
} catch (error) {
  if (error instanceof z.ZodError) {
    const missingVars = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    console.error('CRITICAL: Environment validation failed:');
    missingVars.forEach((msg) => console.error(`  - ${msg}`));
  } else {
    console.error('CRITICAL: Unexpected error during environment parsing:', error);
  }
  process.exit(1);
}

export const env = parsedEnv;
