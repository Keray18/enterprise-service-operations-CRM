/**
 * Utility functions for Indian mobile number normalization and validation.
 */

/**
 * Normalizes an Indian mobile number into standard 10-digit format.
 * Strips non-digit characters, leading zero ('0'), or Indian country code ('91' / '+91').
 */
export function normalizeIndianMobile(raw: string): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');

  // Handle +91 or 91 country code prefix (12 digits)
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  // Handle leading zero (11 digits, e.g., 09820012345)
  else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  return digits;
}

/**
 * Validates whether the given string represents a valid 10-digit Indian mobile number
 * (standard mobile allocation blocks starting with 6, 7, 8, or 9).
 */
export function isValidIndianMobile(raw: string): boolean {
  const normalized = normalizeIndianMobile(raw);
  return /^[6-9]\d{9}$/.test(normalized);
}

/**
 * Formats a 10-digit normalized mobile number for human display (e.g. +91 98200 12345).
 */
export function formatIndianMobileDisplay(normalizedOrRaw: string): string {
  const norm = normalizeIndianMobile(normalizedOrRaw);
  if (norm.length === 10) {
    return `+91 ${norm.slice(0, 5)} ${norm.slice(5)}`;
  }
  return normalizedOrRaw;
}
