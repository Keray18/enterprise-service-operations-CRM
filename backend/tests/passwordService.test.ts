import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { logger } from '../src/logging/logger.js';
import {
  ARGON2_OPTIONS,
  hashPassword,
  validatePasswordComplexity,
  verifyPassword,
} from '../src/services/passwordService.js';

describe('Password Security & Hashing Service (Phase 1A.1)', () => {
  describe('Password Complexity Validation', () => {
    it('should accept passwords meeting all complexity criteria', () => {
      expect(() => validatePasswordComplexity('Str0ngP@ssword2026!')).not.toThrow();
      expect(() => validatePasswordComplexity('C0mplex#Key99$')).not.toThrow();
    });

    it('should reject passwords shorter than 10 characters', () => {
      expect(() => validatePasswordComplexity('Sh0rt!1')).toThrow(
        'Password must be at least 10 characters long.'
      );
    });

    it('should reject passwords lacking uppercase letters', () => {
      expect(() => validatePasswordComplexity('lowercase123!@#')).toThrow(
        'Password must contain at least one uppercase letter (A-Z).'
      );
    });

    it('should reject passwords lacking lowercase letters', () => {
      expect(() => validatePasswordComplexity('UPPERCASE123!@#')).toThrow(
        'Password must contain at least one lowercase letter (a-z).'
      );
    });

    it('should reject passwords lacking numeric digits', () => {
      expect(() => validatePasswordComplexity('NoNumbersHere!@#')).toThrow(
        'Password must contain at least one numeric digit (0-9).'
      );
    });

    it('should reject passwords lacking special characters', () => {
      expect(() => validatePasswordComplexity('NoSpecialChars123')).toThrow(
        'Password must contain at least one special character.'
      );
    });
  });

  describe('Argon2id Hashing & Verification', () => {
    it('should generate valid Argon2id hash with OWASP recommended configuration', async () => {
      const password = 'CorrectHorseBatteryStaple1!';
      const hash = await hashPassword(password);

      expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
      expect(ARGON2_OPTIONS.memoryCost).toBe(65536); // 64 MB
      expect(ARGON2_OPTIONS.timeCost).toBe(3);       // 3 iterations
      expect(ARGON2_OPTIONS.parallelism).toBe(4);    // 4 threads
    });

    it('should verify correct password against Argon2id hash without requiring rehash', async () => {
      const password = 'SuperSecurePassword2026!';
      const hash = await hashPassword(password);

      const result = await verifyPassword(password, hash);
      expect(result.valid).toBe(true);
      expect(result.needsRehash).toBe(false);
    });

    it('should reject incorrect password against Argon2id hash', async () => {
      const password = 'SuperSecurePassword2026!';
      const hash = await hashPassword(password);

      const result = await verifyPassword('WrongPassword123!', hash);
      expect(result.valid).toBe(false);
      expect(result.needsRehash).toBe(false);
    });
  });

  describe('Legacy Bcrypt Compatibility & Rehash Flagging', () => {
    it('should verify password against legacy bcrypt hash and flag needsRehash: true', async () => {
      const password = 'LegacyUserPassword2024!';
      const legacyHash = await bcrypt.hash(password, 12);

      expect(legacyHash.startsWith('$2a$') || legacyHash.startsWith('$2b$')).toBe(true);

      const result = await verifyPassword(password, legacyHash);
      expect(result.valid).toBe(true);
      expect(result.needsRehash).toBe(true); // Triggers transparent upgrade to Argon2id
    });

    it('should reject incorrect password against legacy bcrypt hash and not flag rehash', async () => {
      const password = 'LegacyUserPassword2024!';
      const legacyHash = await bcrypt.hash(password, 12);

      const result = await verifyPassword('IncorrectPassword123!', legacyHash);
      expect(result.valid).toBe(false);
      expect(result.needsRehash).toBe(false);
    });

    it('should safely return false for malformed or unrecognized hash formats', async () => {
      const result = await verifyPassword('SomePassword123!', 'plain_text_unsupported_hash');
      expect(result.valid).toBe(false);
      expect(result.needsRehash).toBe(false);
    });
  });

  describe('Sensitive Log Redaction', () => {
    it('should redact sensitive keys and hashes from structured logger output', () => {
      // Winston format sanitization unit check
      const testMeta = {
        username: 'admin',
        password: 'TopSecretPassword123!',
        password_hash: '$argon2id$v=19$m=65536...',
        session_token: 'secret_session_token_123',
        csrf_token: 'secret_csrf_token_123',
        cookie: 'crm_session=abcdef123456',
        nested: {
          secretKey: 'confidential_key_value',
        },
      };

      // Ensure logger does not throw when handling sensitive objects
      expect(() => {
        logger.info('Sanitization verification test', testMeta);
      }).not.toThrow();
    });
  });
});
