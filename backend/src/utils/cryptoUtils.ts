import crypto from 'crypto';
import { env } from '../config/env.js';

/**
 * Cryptographic utility functions for Check-In OTP, outbox encryption, and verification secrets.
 * Phase 2A.1: HMAC-SHA-256 OTP verification with server-side pepper and AES-256-GCM outbox encryption.
 */

function getPepper(): string {
  const pepper = env.OTP_HASH_PEPPER || process.env.OTP_HASH_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error('CRITICAL_SECURITY_ERROR: OTP_HASH_PEPPER is missing or less than 32 characters');
  }
  return pepper;
}

function getEncryptionKey(): Buffer {
  const rawKey = env.NOTIFICATION_ENCRYPTION_KEY || process.env.NOTIFICATION_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('CRITICAL_SECURITY_ERROR: NOTIFICATION_ENCRYPTION_KEY is missing');
  }

  // Support 64 hex characters (32 bytes) or 32 raw bytes
  if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }
  const utf8Buf = Buffer.from(rawKey, 'utf8');
  if (utf8Buf.length === 32) {
    return utf8Buf;
  }
  throw new Error('CRITICAL_SECURITY_ERROR: NOTIFICATION_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)');
}

/**
 * Validates cryptographic configuration at startup or service initialization.
 */
export function validateCryptoConfig(): void {
  getPepper();
  getEncryptionKey();
}

/**
 * Generates a cryptographically secure 6-digit numerical OTP (100000 - 999999).
 */
export function generateCheckInOtp(): string {
  const num = crypto.randomInt(100000, 1000000);
  return num.toString();
}

/**
 * Generates a cryptographically secure 6-digit numerical Happy Code (100000 - 999999).
 */
export function generateHappyCode(): string {
  const num = crypto.randomInt(100000, 1000000);
  return num.toString();
}

/**
 * Generates a cryptographically secure random hexadecimal salt.
 */
export function generateSalt(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Computes HMAC-SHA-256 digest binding requestId, purpose, salt, and OTP using server-side pepper.
 * Format: V1|{purpose}|{requestId}|{salt}|{otp}
 * Never store raw OTP in database or logs!
 */
export function hashOtp(params: {
  otp: string;
  salt: string;
  requestId: string;
  purpose?: string;
}): string {
  const pepper = getPepper();
  const purpose = params.purpose || 'CHECK_IN';
  const canonicalMessage = `V1|${purpose}|${params.requestId.trim()}|${params.salt.trim()}|${params.otp.trim()}`;
  return crypto.createHmac('sha256', pepper).update(canonicalMessage).digest('hex');
}

/**
 * Timing-safe comparison to prevent timing side-channel attacks on OTP verification.
 */
export function verifyOtp(params: {
  providedOtp: string;
  salt: string;
  requestId: string;
  expectedHash: string;
  purpose?: string;
}): boolean {
  if (!params.providedOtp || !params.salt || !params.requestId || !params.expectedHash) {
    return false;
  }

  const computedHash = hashOtp({
    otp: params.providedOtp,
    salt: params.salt,
    requestId: params.requestId,
    purpose: params.purpose,
  });

  const bufA = Buffer.from(computedHash, 'utf8');
  const bufB = Buffer.from(params.expectedHash, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface EncryptedNotificationPayload {
  encryptedPayload: string; // hex
  iv: string;               // hex
  authTag: string;          // hex
  keyVersion: string;
}

/**
 * Encrypts sensitive notification payload (such as SMS 2 and SMS 6 containing OTPs)
 * using authenticated AES-256-GCM.
 */
export function encryptNotificationPayload(
  plaintext: string,
  keyVersion = 'v1'
): EncryptedNotificationPayload {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit nonce for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(keyVersion, 'utf8'));

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encryptedPayload: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    keyVersion,
  };
}

/**
 * Decrypts and verifies authenticated notification payload inside trusted delivery path.
 * Throws if authentication tag verification fails (tampered payload or incorrect key).
 */
export function decryptNotificationPayload(params: {
  encryptedPayload: string;
  iv: string;
  authTag: string;
  keyVersion?: string;
}): string {
  const key = getEncryptionKey();
  const keyVersion = params.keyVersion || 'v1';
  const iv = Buffer.from(params.iv, 'hex');
  const authTag = Buffer.from(params.authTag, 'hex');

  if (iv.length !== 12) {
    throw new Error('INVALID_CIPHERTEXT: Initialization vector must be 12 bytes');
  }
  if (authTag.length !== 16) {
    throw new Error('INVALID_CIPHERTEXT: Authentication tag must be 16 bytes');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(keyVersion, 'utf8'));
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(params.encryptedPayload, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
