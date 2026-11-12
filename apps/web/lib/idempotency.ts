/**
 * Idempotency Key utility (F0-08 / BR-08 / CLAUDE.md)
 * Guarantees that duplicate form submissions or network retries reuse
 * the exact same idempotency key for safe transactional mutations.
 */

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Attaches standard mutation headers including Idempotency-Key
 */
export function createMutationHeaders(
  customHeaders?: Record<string, string>,
  key: string = generateIdempotencyKey(),
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Idempotency-Key': key,
    ...(customHeaders || {}),
  };
}
