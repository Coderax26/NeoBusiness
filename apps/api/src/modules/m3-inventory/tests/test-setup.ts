import { createKnex } from '../../../shared/database/knex-instance.js';
import { assertTestDatabase } from '../../../shared/database/test-db-guard.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Test helper to set up a fresh database state for the M3 acceptance tests.
 *
 * 1. Runs migrations to ensure all production tables exist (M0-M7a + M1 + M6 + M3).
 * 2. Truncates all M3-specific tables using CASCADE to clear data.
 * 3. Seeds a single site and three users (owner, coordinator, storekeeper).
 * 4. Seeds test items and inventory batches for testing.
 * 5. Returns the `knex` instance and mode-specific ids for use in tests.
 *
 * Module: m3-inventory (Inventory and Warehouse)
 * Test files: m3-inventory.service.spec.ts, m3-inventory.e2e-spec.ts
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
  // 2. Truncate M3-specific tables only (CASCADE clears data + dependents)
  // Do NOT truncate shared tables (users, sites, approval_policies, etc.)
  // as they're managed by other test suites and cause deadlocks when run in parallel.
  // -------------------------------------------------
  const m3TablesToTruncate = [
    'stock_adjustments',
    'stock_transfer_lines',
    'stock_transfers',
    'stock_reservations',
    'stock_ledger_txns',
    'inventory_batches',
  ];

  // Filter tables that exist in the database
  const existingTables = await knex.raw(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  );

  const tablesToTruncateFiltered = m3TablesToTruncate.filter((table) =>
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
  // 3. Seed a default site
  // -------------------------------------------------
  const siteId = uuidv4();
  await knex('sites').insert({
    id: siteId,
    name: 'Test Site A',
    site_type: 'WAREHOUSE',
    address: '123 Test St, Mumbai',
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Second site for transfer tests
  const siteBId = uuidv4();
  await knex('sites').insert({
    id: siteBId,
    name: 'Test Site B',
    site_type: 'WAREHOUSE',
    address: '456 Test Ave, Delhi',
    created_at: new Date(),
    updated_at: new Date(),
  });

  // -------------------------------------------------
  // 4. Seed users with roles expected by the tests
  // Use unique phone suffix to avoid conflicts when running in parallel
  // -------------------------------------------------
  const phoneSuffix = uuidv4().replace(/\D/g, '').slice(0, 8).padEnd(8, '0');
  const ownerId = uuidv4();
  const coordinatorId = uuidv4();
  const storekeeperId = uuidv4();
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
      phone: `+91987654${phoneSuffix}1`,
      role: 'OPS_COORD',
      assigned_site_id: siteId,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: storekeeperId,
      full_name: 'Storekeeper User',
      phone: `+91987654${phoneSuffix}2`,
      role: 'STOREKEEPER',
      assigned_site_id: siteId,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);

  // Seed approval policies for inventory exceptions
  await knex('approval_policies')
    .insert([
      {
        id: uuidv4(),
        exception_type: 'STOCK_OUT_OF_RANGE',
        primary_approver_role: 'OWNER',
        can_delegate: true,
        escalation_wait_minutes: 30,
        delegate_user_id: ownerId,
        updated_by: ownerId,
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        exception_type: 'RESERVATION_CONFLICT',
        primary_approver_role: 'OWNER',
        can_delegate: true,
        escalation_wait_minutes: 30,
        delegate_user_id: ownerId,
        updated_by: ownerId,
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        exception_type: 'ADJUSTMENT_VARIANCE',
        primary_approver_role: 'OWNER',
        can_delegate: false,
        escalation_wait_minutes: 60,
        updated_by: ownerId,
        updated_at: new Date(),
      },
    ])
    .onConflict('exception_type')
    .ignore();

  // -------------------------------------------------
  // 5. Seed test items (reuse existing or insert)
  // -------------------------------------------------
  const existingRice = await knex('items').where({ sku_code: 'RICE-001' }).first();
  const existingWheat = await knex('items').where({ sku_code: 'WHEAT-001' }).first();
  const existingSugar = await knex('items').where({ sku_code: 'SUGAR-001' }).first();

  const itemRiceId = existingRice?.id ?? uuidv4();
  const itemWheatId = existingWheat?.id ?? uuidv4();
  const itemSugarId = existingSugar?.id ?? uuidv4();

  const itemsToInsert = [];
  if (!existingRice) {
    itemsToInsert.push({
      id: itemRiceId,
      sku_code: 'RICE-001',
      name: 'Basmati Rice Premium',
      item_category: 'TRADED_GOOD',
      primary_uom: 'KG',
      tax_treatment: 'TAXABLE',
      hsn_code: '100630',
      tax_rate_pct: 0.05,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
  if (!existingWheat) {
    itemsToInsert.push({
      id: itemWheatId,
      sku_code: 'WHEAT-001',
      name: 'Wheat Whole Grain',
      item_category: 'TRADED_GOOD',
      primary_uom: 'KG',
      tax_treatment: 'TAXABLE',
      hsn_code: '100199',
      tax_rate_pct: 0.05,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
  if (!existingSugar) {
    itemsToInsert.push({
      id: itemSugarId,
      sku_code: 'SUGAR-001',
      name: 'Refined Sugar',
      item_category: 'PROCESSED_FG',
      primary_uom: 'KG',
      tax_treatment: 'TAXABLE',
      hsn_code: '170199',
      tax_rate_pct: 0.18,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  if (itemsToInsert.length > 0) {
    await knex('items').insert(itemsToInsert);
  }

  // -------------------------------------------------
  // 6. Seed test inventory batches with expiry dates for FEFO testing
  // -------------------------------------------------
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextMonth = new Date(today);
  nextMonth.setDate(nextMonth.getDate() + 30);

  const batchRice1Id = uuidv4();
  const batchRice2Id = uuidv4();
  const batchWheat1Id = uuidv4();
  const batchSugar1Id = uuidv4();

  await knex('inventory_batches').insert([
    // Rice - two batches with different expiry (FEFO test)
    {
      id: batchRice1Id,
      site_id: siteId,
      item_id: itemRiceId,
      batch_number: 'BATCH-RICE-2026-001',
      status: 'AVAILABLE',
      qty_on_hand: '1000.000',
      qty_committed: '0.000',
      expiry_date: tomorrow.toISOString().split('T')[0], // Expires tomorrow - FEFO first
      mfg_date: new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .split('T')[0],
      received_date: today.toISOString().split('T')[0],
      landed_cost_per_unit: '65.00',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: batchRice2Id,
      site_id: siteId,
      item_id: itemRiceId,
      batch_number: 'BATCH-RICE-2026-002',
      status: 'AVAILABLE',
      qty_on_hand: '500.000',
      qty_committed: '0.000',
      expiry_date: nextWeek.toISOString().split('T')[0], // Expires next week - FEFO second
      mfg_date: new Date(today.getFullYear(), today.getMonth(), 15)
        .toISOString()
        .split('T')[0],
      received_date: today.toISOString().split('T')[0],
      landed_cost_per_unit: '68.00',
      created_at: new Date(),
      updated_at: new Date(),
    },
    // Wheat - single batch
    {
      id: batchWheat1Id,
      site_id: siteId,
      item_id: itemWheatId,
      batch_number: 'BATCH-WHEAT-2026-001',
      status: 'AVAILABLE',
      qty_on_hand: '2000.000',
      qty_committed: '0.000',
      expiry_date: nextMonth.toISOString().split('T')[0],
      mfg_date: new Date(today.getFullYear(), today.getMonth(), 10)
        .toISOString()
        .split('T')[0],
      received_date: today.toISOString().split('T')[0],
      landed_cost_per_unit: '28.00',
      created_at: new Date(),
      updated_at: new Date(),
    },
    // Sugar - at Site B for transfer tests
    {
      id: batchSugar1Id,
      site_id: siteBId,
      item_id: itemSugarId,
      batch_number: 'BATCH-SUGAR-2026-001',
      status: 'AVAILABLE',
      qty_on_hand: '1500.000',
      qty_committed: '0.000',
      expiry_date: nextMonth.toISOString().split('T')[0],
      mfg_date: new Date(today.getFullYear(), today.getMonth(), 5)
        .toISOString()
        .split('T')[0],
      received_date: today.toISOString().split('T')[0],
      landed_cost_per_unit: '42.00',
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);

  // -------------------------------------------------
  // 7. Return useful ids for the tests
  // -------------------------------------------------
  return {
    knex,
    siteId,
    siteBId,
    ownerId,
    coordinatorId,
    storekeeperId,
    itemRiceId,
    itemWheatId,
    itemSugarId,
    batchRice1Id,
    batchRice2Id,
    batchWheat1Id,
    batchSugar1Id,
    today: today.toISOString().split('T')[0],
  };
}
