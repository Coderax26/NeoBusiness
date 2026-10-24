import { type Knex } from 'knex';

/**
 * Create a standalone Knex instance for use outside the Nest DI system
 * (scripts, migrations, seeds).
 *
 * Configuration mirrors DatabaseModule.useFactory so the connection
 * string, pool, and migration settings are identical.
 */
export async function createKnex(): Promise<Knex> {
  const { default: knexFactory } = await import('knex');
  const knex: Knex = knexFactory({
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
    migrations: {
      directory: './db/migrations',
      tableName: 'knex_migrations',
      loadExtensions: ['.sql'],
    },
  });

  return knex;
}