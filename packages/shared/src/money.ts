/**
 * @neo/shared — Exact decimal money arithmetic (gap I-4)
 *
 * The API returns money as `numeric(14,2)` strings. The UI must never use IEEE-754
 * float maths on them. These helpers use scaled BigInt (6 fractional digits) so that
 * previews are exact and dependency-free. Results are decimal STRINGS; the server
 * remains the authority (P7) — client values are labelled "preview".
 */

const SCALE_DIGITS = 6;
const SCALE = 10n ** BigInt(SCALE_DIGITS);

export type MoneyInput = string | number | bigint | null | undefined;

/** Parse a decimal string / number into a scaled bigint (6 dp, truncating extra digits). */
export function toScaled(value: MoneyInput): bigint {
  if (value === null || value === undefined || value === '') return 0n;
  if (typeof value === 'bigint') return value * SCALE;
  let s = typeof value === 'number' ? numberToPlain(value) : value.trim().replace(/[₹,\s]/g, '');
  if (s === '' || s === '-' || s === '+') return 0n;
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!/^\d*\.?\d*$/.test(s)) throw new Error(`Invalid money value: ${String(value)}`);
  const [intPart = '0', fracRaw = ''] = s.split('.');
  const frac = (fracRaw + '0'.repeat(SCALE_DIGITS)).slice(0, SCALE_DIGITS);
  const result = BigInt(intPart || '0') * SCALE + BigInt(frac || '0');
  return negative ? -result : result;
}

function numberToPlain(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Invalid money value: ${n}`);
  const s = String(n);
  return /e/i.test(s) ? n.toFixed(SCALE_DIGITS) : s;
}

/** Round a scaled bigint to `dp` places (half away from zero) and render as a string. */
export function fromScaled(scaled: bigint, dp = 2): string {
  const neg = scaled < 0n;
  let abs = neg ? -scaled : scaled;
  const drop = BigInt(SCALE_DIGITS - dp);
  if (drop > 0n) {
    const unit = 10n ** drop;
    abs = (abs + unit / 2n) / unit;
  }
  const factor = 10n ** BigInt(dp);
  const intPart = abs / factor;
  const fracPart = abs % factor;
  const body = dp > 0 ? `${intPart}.${fracPart.toString().padStart(dp, '0')}` : `${intPart}`;
  const isZero = intPart === 0n && fracPart === 0n;
  return neg && !isZero ? `-${body}` : body;
}

export function addMoney(a: MoneyInput, b: MoneyInput, dp = 2): string {
  return fromScaled(toScaled(a) + toScaled(b), dp);
}

export function subMoney(a: MoneyInput, b: MoneyInput, dp = 2): string {
  return fromScaled(toScaled(a) - toScaled(b), dp);
}

/** price × quantity (quantity may carry up to 6 decimals, e.g. 12.5 kg). */
export function mulMoney(a: MoneyInput, b: MoneyInput, dp = 2): string {
  return fromScaled((toScaled(a) * toScaled(b)) / SCALE, dp);
}

/** (numerator / denominator) × 100 as a percentage string. Returns "0.00" when denominator is 0. */
export function pctOf(numerator: MoneyInput, denominator: MoneyInput, dp = 2): string {
  const d = toScaled(denominator);
  if (d === 0n) return fromScaled(0n, dp);
  const num = toScaled(numerator) * 100n * SCALE;
  let q = num / d;
  const r = num % d;
  const absR2 = (r < 0n ? -r : r) * 2n;
  const absD = d < 0n ? -d : d;
  if (absR2 >= absD) q += num < 0n !== d < 0n ? -1n : 1n;
  return fromScaled(q, dp);
}

/** -1, 0 or 1. */
export function cmpMoney(a: MoneyInput, b: MoneyInput): -1 | 0 | 1 {
  const x = toScaled(a);
  const y = toScaled(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function absMoney(a: MoneyInput, dp = 2): string {
  const x = toScaled(a);
  return fromScaled(x < 0n ? -x : x, dp);
}

/** Convenience for previews that still expose `number` fields: exact string → rounded number. */
export function moneyToNumber(value: string): number {
  return Number(value);
}
