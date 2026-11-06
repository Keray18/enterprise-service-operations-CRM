/**
 * Enterprise Data & Currency Formatters
 * 
 * Provides type-safe, consistent formatting across all business consoles.
 * Explicit zero values are authoritatively presented as ₹0.00.
 * Genuinely missing, unconfigured, or null/undefined values are rendered as '—' (em-dash),
 * preventing unapproved or missing financial records from being silently misrepresented.
 */

export interface CurrencyFormatOptions {
  fallback?: string;
  showSymbol?: boolean;
  decimals?: number;
}

/**
 * Formats monetary amounts in Indian Rupee (INR) representation.
 * 
 * - Explicit zero (0, "0", "0.00") -> "₹0.00"
 * - Valid number (1250.50) -> "₹1,250.50"
 * - Missing / null / undefined / NaN -> "—" (or custom fallback)
 */
export function formatCurrency(
  val: number | string | null | undefined,
  options: CurrencyFormatOptions = {}
): string {
  const { fallback = '—', showSymbol = true, decimals = 2 } = options;

  if (val === null || val === undefined || val === '') {
    return fallback;
  }

  const num = typeof val === 'number' ? val : Number(val);

  if (Number.isNaN(num)) {
    return fallback;
  }

  const formattedNumber = Math.abs(num).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const sign = num < 0 ? '-' : '';
  const symbol = showSymbol ? '₹' : '';

  return `${sign}${symbol}${formattedNumber}`;
}

/**
 * Formats numerical counts and quantities with Indian numbering groupings.
 */
export function formatNumber(
  val: number | string | null | undefined,
  fallback = '—'
): string {
  if (val === null || val === undefined || val === '') {
    return fallback;
  }

  const num = typeof val === 'number' ? val : Number(val);

  if (Number.isNaN(num)) {
    return fallback;
  }

  return num.toLocaleString('en-IN');
}

/**
 * Formats a percentage value with the given number of decimal places.
 */
export function formatPercentage(
  val: number | string | null | undefined,
  options: { decimals?: number; fallback?: string } = {}
): string {
  const { decimals = 1, fallback = '—' } = options;

  if (val === null || val === undefined || val === '') {
    return fallback;
  }

  const num = typeof val === 'number' ? val : Number(val);

  if (Number.isNaN(num)) {
    return fallback;
  }

  return `${num.toFixed(decimals)}%`;
}
