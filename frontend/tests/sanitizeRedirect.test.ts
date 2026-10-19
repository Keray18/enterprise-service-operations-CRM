import { describe, expect, it } from 'vitest';
import { sanitizeRedirect } from '../src/lib/sanitizeRedirect';

describe('Login Redirect URL Sanitization (Phase 1A.1)', () => {
  describe('Safe internal relative redirects', () => {
    it('should allow simple root path', () => {
      expect(sanitizeRedirect('/')).toBe('/');
    });

    it('should allow valid workspace paths', () => {
      expect(sanitizeRedirect('/workspace/admin')).toBe('/workspace/admin');
      expect(sanitizeRedirect('/workspace/call-center')).toBe('/workspace/call-center');
      expect(sanitizeRedirect('/workspace/warehouse')).toBe('/workspace/warehouse');
    });

    it('should preserve query parameters on valid paths', () => {
      expect(sanitizeRedirect('/workspace/call-center?tab=active&page=2')).toBe(
        '/workspace/call-center?tab=active&page=2'
      );
    });

    it('should preserve hash fragments on valid paths', () => {
      expect(sanitizeRedirect('/workspace/admin#users-list')).toBe(
        '/workspace/admin#users-list'
      );
    });

    it('should preserve both query parameters and hash fragments', () => {
      expect(sanitizeRedirect('/workspace/warehouse?item=123#stock')).toBe(
        '/workspace/warehouse?item=123#stock'
      );
    });
  });

  describe('Unsafe external / absolute redirects', () => {
    it('should reject absolute HTTPS URLs', () => {
      expect(sanitizeRedirect('https://evil.com')).toBe('/');
      expect(sanitizeRedirect('https://evil.com/workspace/admin')).toBe('/');
    });

    it('should reject absolute HTTP URLs', () => {
      expect(sanitizeRedirect('http://attacker.com')).toBe('/');
      expect(sanitizeRedirect('http://localhost:9999/pwned')).toBe('/');
    });

    it('should reject protocol-relative URLs (//)', () => {
      expect(sanitizeRedirect('//evil.com')).toBe('/');
      expect(sanitizeRedirect('//evil.com/workspace/admin')).toBe('/');
      expect(sanitizeRedirect('///evil.com')).toBe('/');
    });

    it('should reject backslash bypasses (/\\ and \\\\)', () => {
      expect(sanitizeRedirect('/\\evil.com')).toBe('/');
      expect(sanitizeRedirect('\\\\evil.com')).toBe('/');
      expect(sanitizeRedirect('/evil.com\\path')).toBe('/');
    });

    it('should reject javascript: pseudo-protocol', () => {
      expect(sanitizeRedirect('javascript:alert(document.cookie)')).toBe('/');
      expect(sanitizeRedirect('/javascript:alert(1)')).toBe('/');
    });

    it('should reject data: and vbscript: URIs', () => {
      expect(sanitizeRedirect('data:text/html,<script>alert(1)</script>')).toBe('/');
      expect(sanitizeRedirect('/data:text/html;base64,...')).toBe('/');
      expect(sanitizeRedirect('vbscript:msgbox("hacked")')).toBe('/');
    });

    it('should reject paths lacking a leading forward slash', () => {
      expect(sanitizeRedirect('workspace/admin')).toBe('/');
      expect(sanitizeRedirect('evil.com')).toBe('/');
    });

    it('should reject control characters and newline injection', () => {
      expect(sanitizeRedirect('/workspace\r\nSet-Cookie: evil=1')).toBe('/');
      expect(sanitizeRedirect('/workspace\x00evil')).toBe('/');
      expect(sanitizeRedirect('/workspace\x1b[31mevil')).toBe('/');
    });
  });

  describe('Falsy and boundary conditions', () => {
    it('should return default fallback on null, undefined, or empty string', () => {
      expect(sanitizeRedirect(null)).toBe('/');
      expect(sanitizeRedirect(undefined)).toBe('/');
      expect(sanitizeRedirect('')).toBe('/');
      expect(sanitizeRedirect('   ')).toBe('/');
    });

    it('should respect custom fallback path', () => {
      expect(sanitizeRedirect(null, '/workspace/default')).toBe('/workspace/default');
      expect(sanitizeRedirect('https://evil.com', '/workspace/default')).toBe('/workspace/default');
      expect(sanitizeRedirect('/workspace/admin', '/workspace/default')).toBe('/workspace/admin');
    });
  });
});
