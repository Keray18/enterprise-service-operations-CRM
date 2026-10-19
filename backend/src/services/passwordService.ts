import { Algorithm, hash, verify } from '@node-rs/argon2';
import bcrypt from 'bcryptjs';

export interface VerifyPasswordResult {
  valid: boolean;
  needsRehash: boolean;
}

export const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,       // 3 iterations
  parallelism: 4,    // 4 threads
  outputLen: 32,     // 32-byte key
};

export function validatePasswordComplexity(password: string): void {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string.');
  }
  if (password.length < 10) {
    throw new Error('Password must be at least 10 characters long.');
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error('Password must contain at least one uppercase letter (A-Z).');
  }
  if (!/[a-z]/.test(password)) {
    throw new Error('Password must contain at least one lowercase letter (a-z).');
  }
  if (!/[0-9]/.test(password)) {
    throw new Error('Password must contain at least one numeric digit (0-9).');
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    throw new Error('Password must contain at least one special character.');
  }
}

/**
 * Hashes a plaintext password using Argon2id (OWASP recommended parameters).
 */
export async function hashPassword(password: string): Promise<string> {
  validatePasswordComplexity(password);
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Verifies a plaintext password against a stored hash.
 * Supports both Argon2id ($argon2id$) and legacy bcrypt ($2a$, $2b$).
 * If verified with bcrypt, flags needsRehash=true for transparent upgrade.
 */
export async function verifyPassword(passwordPlain: string, storedHash: string): Promise<VerifyPasswordResult> {
  if (!storedHash || !passwordPlain) {
    return { valid: false, needsRehash: false };
  }

  // 1. Argon2id hash verification
  if (storedHash.startsWith('$argon2')) {
    try {
      const isValid = await verify(storedHash, passwordPlain);
      return { valid: isValid, needsRehash: false };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  // 2. Legacy bcrypt hash verification (with automatic upgrade flag)
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
    try {
      const isValid = await bcrypt.compare(passwordPlain, storedHash);
      return { valid: isValid, needsRehash: isValid };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  return { valid: false, needsRehash: false };
}
