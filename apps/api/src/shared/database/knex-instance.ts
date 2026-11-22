import { type Knex } from 'knex';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Resolves a valid PostgreSQL connection URI from `DATABASE_URL` or falls back
 * to building one from `POSTGRES_*` environment variables when `DATABASE_URL`
 * is missing, contains unexpanded template syntax, or points to localhost in a
 * container environment with `POSTGRES_HOST` configured.
 */
export function resolveDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const raw = env.DATABASE_URL?.trim();
  const configuredHost = env.POSTGRES_HOST?.trim();

  let usable = false;
  if (raw && !raw.includes('${')) {
    try {
      const parsed = new URL(raw);
      const isLocal = LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
      const overridesLocal =
        configuredHost !== undefined &&
        configuredHost.length > 0 &&
        !LOCAL_HOSTS.has(configuredHost.toLowerCase());
      usable = Boolean(parsed.hostname) && !(isLocal && overridesLocal);
    } catch {
      usable = false;
    }
  }

  if (usable) {
    return raw;
  }

  const password = env.POSTGRES_PASSWORD?.trim();
  if (!password) {
    return raw;
  }

  const user = encodeURIComponent(env.POSTGRES_USER?.trim() || 'neobus_app');
  const pass = encodeURIComponent(password);
  const host = configuredHost || env.SERVICE_NAME_POSTGRES?.trim() || 'postgres';
  const port = env.POSTGRES_PORT?.trim() || '5432';
  const db = encodeURIComponent(env.POSTGRES_DB?.trim() || 'neobus_prod');
  const built = `postgresql://${user}:${pass}@${host}:${port}/${db}`;
  env.DATABASE_URL = built;
  return built;
}

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
    connection: resolveDatabaseUrl(),
    pool: { min: 2, max: 10 },
    migrations: {
      directory: './db/migrations',
      tableName: 'knex_migrations',
      loadExtensions: ['.sql'],
    },
  });

  return knex;
}
