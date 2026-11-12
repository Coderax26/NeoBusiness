/**
 * @neo/shared — Indian Currency (INR), Dual-UoM Quantity & IST Date Formatters
 *
 * Implements OD-003 (INR / ₹ with Indian lakh/crore grouping) and docs/claude/10_FE_Web_Frontend.md §3.5.
 */

import { fromScaled, toScaled } from './money.js';

export interface FormatINROptions {
  showSymbol?: boolean;
  decimals?: number;
}

/**
 * Formats a numeric or string value into Indian numbering grouping (e.g. ₹1,00,000.00).
 * Uses integer/string splitting to avoid floating-point rounding drift.
 */
export function formatINR(
  amount: string | number | null | undefined,
  options: FormatINROptions = {},
): string {
  const { showSymbol = true, decimals = 2 } = options;
  if (amount === null || amount === undefined || amount === '') {
    return showSymbol ? '₹0.00' : '0.00';
  }

  let scaled: bigint;
  try {
    scaled = toScaled(amount); // exact — no float drift (gap I-4)
  } catch {
    return showSymbol ? '₹0.00' : '0.00';
  }

  const isNegative = scaled < 0n;
  const fixed = fromScaled(isNegative ? -scaled : scaled, Math.min(decimals, 6));
  const [intPart, decPart] = fixed.split('.');

  // Indian numbering: last 3 digits, then groups of 2 digits
  let formattedInt = intPart;
  if (intPart.length > 3) {
    const lastThree = intPart.slice(-3);
    const otherDigits = intPart.slice(0, -3);
    const groupedOthers = otherDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    formattedInt = `${groupedOthers},${lastThree}`;
  }

  const prefix = showSymbol ? '₹' : '';
  const sign = isNegative ? '-' : '';
  return decPart !== undefined
    ? `${sign}${prefix}${formattedInt}.${decPart}`
    : `${sign}${prefix}${formattedInt}`;
}

/**
 * Parses a formatted INR string (e.g. "₹4,82,450.50") back into a clean decimal string ("482450.50").
 */
export function parseINR(formatted: string): string {
  const cleaned = formatted.replace(/[₹,\s]/g, '');
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) return '0.00';
  return parsed.toFixed(2);
}

export interface DualUomConfig {
  factor: number; // e.g. 1 crate = 20.31 kg
  secondaryUom: string; // e.g. 'kg'
}

/**
 * Formats a quantity with up to 3 decimals and optional dual-UoM approximation
 * (e.g., "40 crate ≈ 812.4 kg").
 */
export function formatQty(
  qty: string | number,
  uom: string,
  dualUom?: DualUomConfig,
): string {
  const num = typeof qty === 'string' ? Number(qty) : qty;
  if (Number.isNaN(num)) return `0 ${uom}`;

  const primaryStr = Number(num.toFixed(3)).toString();
  if (!dualUom) {
    return `${primaryStr} ${uom}`;
  }

  const secondaryVal = Number((num * dualUom.factor).toFixed(3)).toString();
  return `${primaryStr} ${uom} ≈ ${secondaryVal} ${dualUom.secondaryUom}`;
}

/**
 * Formats an ISO date/timestamp in Asia/Kolkata as "DD MMM YYYY" or "DD MMM YYYY, HH:mm".
 */
export function formatISTDate(
  isoOrDate: string | Date,
  includeTime = false,
): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '—';

  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime
      ? {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }
      : {}),
  });

  return formatter.format(d);
}

