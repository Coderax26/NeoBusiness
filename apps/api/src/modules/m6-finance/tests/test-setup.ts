import { createKnex } from '../../../shared/database/knex-instance.js';
import { assertTestDatabase } from '../../../shared/database/test-db-guard.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Test helper to set up a fresh database state for the M6 acceptance tests.
 *
 * 1. Runs migrations to ensure all production tables exist (M0-M7a + M6 009 worklist).
 * 2. Ensures any schema migration columns are up to date (ptp_followups, cash_handovers).
 * 3. Truncates all core M6 tables using CASCADE to clear data.
 * 4. Seeds a single site and three users (owner, coordinator, collector).
 * 5. Returns the `knex` instance and mode-specific ids for use in tests.
 *
 * Module: m6-finance (Collections & Financials)
 * Existing test files: m6-acceptance.spec.ts
 * User instruction: "Implement the approved plan in small steps. Run relevant tests and report every change and result."
 */
export async function setupTestDB() {
  const knex = await createKnex();
  await assertTestDatabase(knex);

  // -------------------------------------------------
  // 1. Run all migrations to ensure production schema
  // -------------------------------------------------
  const { MigrationService } =
    await import('../../../modules/m0-platform/migration.service.js');
  const migrationService = new MigrationService(knex);
  await migrationService.runMigrations();

  // -------------------------------------------------
  // 2. Ensure ptp_followups has updated_by column (if migration missed)
  // -------------------------------------------------
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ptp_followups' AND column_name = 'updated_by') THEN
        ALTER TABLE ptp_followups ADD COLUMN updated_by uuid REFERENCES users(id);
      END IF;
    END $$;
  `);

  // -------------------------------------------------
  // 3. Ensure cash_handovers has updated_by column (if migration missed)
  // -------------------------------------------------
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cash_handovers' AND column_name = 'updated_by') THEN
        ALTER TABLE cash_handovers ADD COLUMN updated_by uuid REFERENCES users(id);
      END IF;
    END $$;
  `);

  // -------------------------------------------------
  // Note: M5 tables (vehicles, delivery_trips, delivery_stops) and
  // cashbook_entries are now expected to exist via production migrations.
  // M5 is not yet implemented; if tests need these tables, they will be
  // added by M5 migrations when that module is built. For now, the
  // WorklistService gracefully handles missing M5 tables (empty results).
  // -------------------------------------------------

  // -------------------------------------------------
  // 4. Truncate M6-specific tables only (CASCADE clears data + dependents)
  // Do NOT truncate shared tables (users, sites, approval_policies, etc.)
  // as they're managed by other test suites and cause deadlocks when run in parallel.
  // -------------------------------------------------
  const m6TablesToTruncate = [
    'cash_handovers',
    'custody_ledger',
    'customer_ledger_entries',
    'collection_receipts',
    'receipt_allocations',
    'invoices',
    'invoice_lines',
    'ptp_followups',
    'eod_closings',
    'cheque_register',
    'worklist_items',
    'worklist_worklists',
  ];

  // Filter tables that exist in the database
  const existingTables = await knex.raw(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  );

  const tablesToTruncateFiltered = m6TablesToTruncate.filter((table) =>
    existingTables.rows.some(
      (row: { table_name: string }) => row.table_name === table,
    ),
  );

  if (tablesToTruncateFiltered.length > 0) {
    await knex.raw(`
      TRUNCATE TABLE ${tablesToTruncateFiltered.join(', ')} RESTART IDENTITY CASCADE;
    `);
  }

  // -------------------------------------------------
  // 5. Seed a default site
  // -------------------------------------------------
  const siteId = uuidv4();
  await knex('sites').insert({
    id: siteId,
    name: 'Test Site',
    site_type: 'WAREHOUSE',
    address: '123 Test St',
    created_at: new Date(),
    updated_at: new Date(),
  });

  // -------------------------------------------------
  // 6. Seed users with roles expected by the tests
  // Use unique phone suffix to avoid conflicts when running in parallel
  // -------------------------------------------------
  const phoneSuffix = Date.now().toString().slice(-4);
  const ownerId = uuidv4();
  const coordinatorId = uuidv4();
  const collectorId = uuidv4();
  await knex('users').insert([
    {
      id: ownerId,
      full_name: 'Owner User',
      phone: `+91987654${phoneSuffix}`,
      role: 'OWNER',
      assigned_site_id: siteId,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: coordinatorId,
      full_name: 'Coordinator User',
      phone: `+91987654${Number(phoneSuffix) + 1}`,
      role: 'OPS_COORD',
      assigned_site_id: siteId,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: collectorId,
      full_name: 'Collector User',
      phone: `+91987654${Number(phoneSuffix) + 2}`,
      role: 'COLLECTOR',
      assigned_site_id: siteId,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);

  // Seed approval policy for CASH_HANDOVER_VARIANCE (ignore if exists from other test suites)
  await knex('approval_policies')
    .insert({
      id: uuidv4(),
      exception_type: 'CASH_HANDOVER_VARIANCE',
      primary_approver_role: 'OWNER',
      can_delegate: true,
      escalation_wait_minutes: 30,
      delegate_user_id: ownerId,
      updated_by: ownerId,
      updated_at: new Date(),
    })
    .onConflict('exception_type')
    .ignore();

  // -------------------------------------------------
  // 7. Return useful ids for the tests
  // -------------------------------------------------
  return {
    knex,
    siteId,
    ownerId,
    coordinatorId,
    collectorId,
  };
}
