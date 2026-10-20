import crypto from 'crypto';

/**
 * Cryptographic utility functions for Check-In OTP, Happy Code, and verification secrets.
 * Phase 2A: Secure OTP generation, salted hashing, and timing-safe verification.
 */

/**
 * Generates a cryptographically secure 6-digit numerical OTP (100000 - 999999).
 */
export function generateCheckInOtp(): string {
  // crypto.randomInt is cryptographically strong (uses CSPRNG)
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
 * Computes SHA-256 HMAC or salted hash for OTP storage.
 * Never store raw OTP in database or logs!
 */
export function hashOtp(otp: string, salt: string): string {
  return crypto
    .createHash('sha256')
    .update(`${otp.trim()}:${salt}`)
    .digest('hex');
}

/**
 * Timing-safe comparison to prevent timing side-channel attacks on OTP verification.
 */
export function verifyOtp(providedOtp: string, salt: string, expectedHash: string): boolean {
  if (!providedOtp || !salt || !expectedHash) return false;
  const computedHash = hashOtp(providedOtp, salt);
  const bufA = Buffer.from(computedHash, 'utf8');
  const bufB = Buffer.from(expectedHash, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
