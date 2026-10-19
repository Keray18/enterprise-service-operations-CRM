/**
 * Sanitizes and validates a redirect target URL to prevent Open Redirect vulnerabilities.
 * Ensures the target is strictly a safe internal relative path.
 *
 * Security Requirements:
 * 1. Must be a non-empty string.
 * 2. Must start with a single forward slash ('/').
 * 3. Must NOT start with '//' (protocol-relative URL).
 * 4. Must NOT start with '/\' or contain backslashes '\\' (browser/OS path confusion bypass).
 * 5. Must NOT contain dangerous URI schemes (javascript:, data:, vbscript:).
 * 6. Must NOT contain ASCII control characters or CRLF injection.
 * 7. When resolved against a fixed dummy base origin, origin must remain unchanged.
 */
export function sanitizeRedirect(target: string | null | undefined, fallback = '/'): string {
  if (!target || typeof target !== 'string') {
    return fallback;
  }

  const trimmed = target.trim();
  if (!trimmed) {
    return fallback;
  }

  // Reject ASCII control characters and CRLF injection
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return fallback;
  }

  // Must begin with a single '/' and cannot begin with '//' or '/\' or contain any '\'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.includes('\\')) {
    return fallback;
  }

  // Reject unsafe schemes
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('javascript:') ||
    lower.includes('data:') ||
    lower.includes('vbscript:')
  ) {
    return fallback;
  }

  try {
    // Validate by resolving against a fixed dummy origin
    const parsed = new URL(trimmed, 'https://crm.internal.local');
    if (parsed.origin !== 'https://crm.internal.local') {
      return fallback;
    }
    // Return relative pathname + search + hash
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
