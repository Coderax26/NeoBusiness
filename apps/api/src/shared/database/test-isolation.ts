import type { Knex } from 'knex';

/**
 * Test Isolation Utility
 *
 * Provides advisory lock-based isolation for parallel test workers.
 * PostgreSQL advisory locks ensure only one worker can perform
 * destructive operations (TRUNCATE/DELETE) on shared tables at a time.
 *
 * Usage in test files:
 *   beforeEach(async () => {
 *     await withTestIsolation(knex, async () => {
 *       await knex.raw('TRUNCATE TABLE ...');
 *       await knex('table').insert(...);
 *     });
 *   });
 */

const TEST_ISOLATION_LOCK_KEY = 12345678; // Stable key for test isolation

/**
 * Acquire an exclusive advisory lock for test isolation.
 * This prevents parallel workers from conflicting on shared database operations.
 *
 * Waits up to 30 seconds for the lock to become available.
 * Throws if timeout is reached.
 *
 * @param knex - Knex instance
 * @param fn - Async function to execute while holding the lock
 * @param timeoutMs - Maximum time to wait for lock (default 30000ms)
 */
export async function withTestIsolation<T>(
  knex: Knex,
  fn: () => Promise<T>,
  timeoutMs = 30000,
): Promise<T> {
  const start = Date.now();

  // Try to acquire the advisory lock with timeout
  while (Date.now() - start < timeoutMs) {
    const result = await knex.raw(
      'SELECT pg_try_advisory_lock(?) as acquired',
      [TEST_ISOLATION_LOCK_KEY],
    );

    if (result.rows[0].acquired) {
      try {
        return await fn();
      } finally {
        // Always release the lock
        await knex.raw('SELECT pg_advisory_unlock(?)', [
          TEST_ISOLATION_LOCK_KEY,
        ]);
      }
    }

    // Wait a bit before retrying (exponential backoff to reduce contention)
    const waitTime = Math.min(100 + Math.random() * 50, 500);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  throw new Error(
    `Test isolation lock timeout after ${timeoutMs}ms. ` +
      'Another test worker may be holding the lock. ' +
      'Check for long-running transactions or stuck tests.',
  );
}
