import type { Knex } from 'knex';

/**
 * Safety rail to prevent destructive test operations (TRUNCATE, DROP, DELETE)
 * from ever running against a development or production database.
 */
export async function assertTestDatabase(knex: Knex): Promise<void> {
  const result = await knex.raw('SELECT current_database() as db');
  const currentDb: string = result?.rows?.[0]?.db ?? '';

  if (!currentDb.endsWith('_test')) {
    throw new Error(
      `[CRITICAL SAFETY GUARD] Refusing to run destructive test setup on non-test database "${currentDb}". ` +
      `Ensure DATABASE_URL or DATABASE_URL_TEST points to a database ending with "_test" (e.g. neobus_test).`
    );
  }
}
