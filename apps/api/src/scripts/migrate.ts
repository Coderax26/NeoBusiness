/**
 * Standalone migration runner.
 *
 * Runs all pending SQL migrations from db/migrations/ against the
 * configured DATABASE_URL, then exits.
 *
 * Usage:
 *   node dist/scripts/migrate.js
 */

import 'dotenv/config'; // load .env before createKnex reads process.env

import { createKnex } from '../shared/database/knex-instance.js';
import { MigrationService } from '../modules/m0-platform/migration.service.js';

async function main(): Promise<void> {
  const knex = await createKnex();
  try {
    const migrationService = new MigrationService(knex);
    await migrationService.runMigrations();

    const status = await migrationService.getStatus();
    console.log('[migrate] applied:', status.applied);
    console.log('[migrate] pending:', status.pending);
    console.log('[migrate] done');
  } finally {
    await knex.destroy();
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
