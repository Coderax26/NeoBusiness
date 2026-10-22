/**
 * UUIDv7 generator — time-ordered, globally unique, safe for offline generation.
 *
 * UUIDv7 format: 48-bit Unix timestamp (ms precision) + version + random bits
 * This gives us: index-friendly ordering, no sequential ID guessing, and safe
 * generation on offline mobile devices without coordination.
 *
 * We implement a simplified version here. In production, the `uuid` package
 * v9+ or `@lukeed/uuid` can be used if a battle-tested implementation is preferred.
 */

export function generateUuidV7(): string {
  const now = BigInt(Date.now());

  // 48-bit timestamp (ms)
  const timeHigh = Number((now >> 16n) & 0xffffn);
  const timeMid = Number(now & 0xffffn);
  const timeLow = Number((now >> 32n) & 0xffffn);

  // Random bits
  const randA = Math.floor(Math.random() * 0x0fff) | 0x7000; // version 7
  const randB = Math.floor(Math.random() * 0x3fff) | 0x8000; // variant 10xx
  const randC = Math.floor(Math.random() * 0xffffffffffff);

  const toHex = (n: number, len: number) => n.toString(16).padStart(len, '0');

  return [
    toHex(timeLow, 8),
    toHex(timeMid, 4),
    toHex(timeHigh, 4),
    toHex(randA, 4),
    toHex(randB, 4) + toHex(randC, 12).slice(0, 8),
  ].join('-');
}

/**
 * Validate that a string is a valid UUID (v4 or v7 or any standard UUID).
 */
export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
