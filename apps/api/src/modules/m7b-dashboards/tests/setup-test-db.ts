import { createKnex } from '../../../shared/database/knex-instance.js';
import { assertTestDatabase } from '../../../shared/database/test-db-guard.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Test helper to set up a fresh database state for the M7b unit tests.
 *
 * 1. Runs migrations to ensure all production tables exist (M0-M7a, M1-M6).
 * 2. Ensure all materialized views exist (after M7b implementation).
 * 3. Truncate M7b-specific tables (if any exist yet) using CASCADE to clear data.
 * 4. Seeds multiple sites and comprehensive test data for analytics queries.
 * 5. Seeds customers, suppliers, items, sales orders, POs, etc.
 * 6. Seeded data includes today's sales, collections, exceptions, etc.
 * 7. Returns the `knex` instance and mode-specific IDs for use in tests.
 *
 * Module: m7b-dashboards (Dashboards & Analytics)
 *
 * Notes:
 * - This file seeds cross-module data (customers, suppliers, items, etc.)
 *   because M7b queries materialized views that depend on M1-M6 data.
 * - Tests do NOT truncate shared tables (users, sites, items, etc.)
 *   as they're managed by other test suites and cause deadlocks in parallel.
 * - After M7b implementation, M7b-specific tables will be truncated per tests.
 *
 * To generate this test fixture companion data:
 *   1. Create a test day with:
 *      - 3 sales orders (confirmed, dispatched, delivered)
 *      - 2 purchase orders with GRN (closed)
 *      - 1 work order completed
 *      - 2 delivery trips (IN_TRANSIT)
 *      - 1 PO shortfall (OPEN)
 *      - 3 exceptions (PRICE_OVERRIDE, SUPPLIER_PRICE_SPIKE, ALLOCATION)
 *      - 2 collections (COD, ONLINE)
 *   2. Use M7b plan's pipeline query (mv_pulse_today, mv_ops_status, etc.)
 *   3. Verify expected values: revenue, margin%, cash collected, pending_exceptions
 *   4. Add this data into `beforeAll()` via Knex inserts
 *
 * Expected test failures (pre-implementation):
 * - Database module references: due to missing m7b-dashboards.module.ts
 * - Service instantiation: due to missing services
 * - Materialized view queries: due to missing mv_*.sql migrationBuilder
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
  // 2. Ensure unique identifiers for test data
  // Use timestamp suffix to avoid conflicts with seeded/persisted data
  // -------------------------------------------------
  const timeSuffix = Date.now().toString().slice(-4);

  // -------------------------------------------------
  // 3. Truncate M7b-specific tables (if any exist yet)
  // -------------------------------------------------
  // These tables will be created in M7b migration <timestamp>_m7b_dashboards_materialized_views.sql
  const m7bTablesToTruncate = [
    'mv_pulse_today',
    'mv_ops_status',
    'mv_inventory_alerts',
    'mv_customer_profitability',
    'mv_supplier_scorecard',
    'mv_yield_trend',
    'mv_ar_aging',
  ];

  const existingTables = await knex.raw(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  );

  const tablesToTruncateFiltered = m7bTablesToTruncate.filter((table) =>
    existingTables.rows.some(
      (row: { table_name: string }) => row.table_name === table,
    ),
  );

  if (tablesToTruncateFiltered.length > 0) {
    await knex.raw(
      `TRUNCATE TABLE ${tablesToTruncateFiltered.join(', ')} RESTART IDENTITY CASCADE;`,
    );
  }

  // -------------------------------------------------
  // 4. Seed multiple sites for RLS testing
  // -------------------------------------------------
  const siteAId = uuidv4();
  const siteBId = uuidv4();

  await knex('sites').insert([
    {
      id: siteAId,
      name: 'Site A - Warehouse',
      site_type: 'WAREHOUSE',
      address: '123 Warehouse Ave, City A',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: siteBId,
      name: 'Site B - Factory',
      site_type: 'FACTORY',
      address: '456 Factory Road, City B',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);

  // -------------------------------------------------
  // 4. Seed users for created_by references and collection author
  // Use unique phone suffix from UUID to avoid parallel test collisions
  // -------------------------------------------------
  const phoneSuffix = uuidv4().replace(/\D/g, '').slice(0, 8).padEnd(8, '0');
  const ownerId = uuidv4();
  const coordinatorId = uuidv4();
  const collectorId = uuidv4();

  await knex('users').insert([
    {
      id: ownerId,
      full_name: 'Test Owner',
      phone: `+91987654${phoneSuffix}`,
      role: 'OWNER',
      assigned_site_id: siteAId,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: coordinatorId,
      full_name: 'Test Coordinator',
      phone: `+91987654${Number(phoneSuffix) + 1}`,
      role: 'OPS_COORD',
      assigned_site_id: siteAId,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: collectorId,
      full_name: 'Test Collector',
      phone: `+91987654${Number(phoneSuffix) + 2}`,
      role: 'COLLECTOR',
      assigned_site_id: siteAId,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);

  // -------------------------------------------------
  // 5. Seed test items (TRADED_GOOD, PROCESSED_FG, RAW_MATERIAL)
  // -------------------------------------------------
  const itemSugarId = uuidv4();
  const itemMilkId = uuidv4();
  const itemFlourId = uuidv4();

  await knex('items').insert([
    {
      id: itemSugarId,
      sku_code: `SUR-001-${timeSuffix}`,
      name: 'White Sugar',
      item_category: 'TRADED_GOOD',
      primary_uom: 'KG',
      secondary_uom: null,
      tax_rate_pct: '18',
      hsn_code: '1701',
      is_catch_weight: false,
      tax_treatment: 'TAXABLE',
      min_margin_pct: '0.10',
      shelf_life_days: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: itemMilkId,
      sku_code: `MIL-002-${timeSuffix}`,
      name: 'Fresh Milk',
      item_category: 'PROCESSED_FG',
      primary_uom: 'LITER',
      secondary_uom: null,
      tax_rate_pct: '5',
      hsn_code: '0401',
      is_catch_weight: false,
      tax_treatment: 'TAXABLE',
      min_margin_pct: '0.10',
      shelf_life_days: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: itemFlourId,
      sku_code: `FLR-003-${timeSuffix}`,
      name: 'Whole Wheat Flour',
      item_category: 'PROCESSED_FG',
      primary_uom: 'KG',
      secondary_uom: null,
      tax_rate_pct: '5',
      hsn_code: '1101',
      is_catch_weight: false,
      tax_treatment: 'TAXABLE',
      min_margin_pct: '0.10',
      shelf_life_days: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);

  // -------------------------------------------------
  // 5. Seed suppliers and supplier_items
  // -------------------------------------------------
  const supplierAId = uuidv4();
  const supplierBId = uuidv4();

  await knex('suppliers').insert([
    {
      id: supplierAId,
      supplier_code: `UT-001-${timeSuffix}`,
      company_name: 'Urban Traders Ltd',
      phone: `+91987600000${timeSuffix}`,
      whatsapp_no: `+91987600000${timeSuffix}`,
      payment_terms_days: 30,
      gstin: null,
      reliability_score_pct: 95.0,
      lead_time_days_avg: 5,
      current_ap_balance: '0.00',
      is_approved: true,
      is_active: true,
      created_by: collectorId,
      created_at: new Date(),
      updated_by: collectorId,
      updated_at: new Date(),
    },
    {
      id: supplierBId,
      supplier_code: `FFA-002-${timeSuffix}`,
      company_name: 'Farm Fresh Agro',
      phone: `+91987600000${timeSuffix}`,
      whatsapp_no: `+91987600000${timeSuffix}`,
      payment_terms_days: 30,
      gstin: null,
      reliability_score_pct: 98.0,
      lead_time_days_avg: 3,
      current_ap_balance: '0.00',
      is_approved: true,
      is_active: true,
      created_by: collectorId,
      created_at: new Date(),
      updated_by: collectorId,
      updated_at: new Date(),
    },
  ]);

  await knex('supplier_items').insert([
    {
      supplier_id: supplierAId,
      item_id: itemSugarId,
      is_primary: true,
      pack_size: '1.000',
      min_order_qty: '1.000',
      created_by: collectorId,
      created_at: new Date(),
      updated_by: collectorId,
      updated_at: new Date(),
    },
    {
      supplier_id: supplierBId,
      item_id: itemFlourId,
      is_primary: true,
      pack_size: '1.000',
      min_order_qty: '1.000',
      created_by: collectorId,
      created_at: new Date(),
      updated_by: collectorId,
      updated_at: new Date(),
    },
  ]);

  // -------------------------------------------------
  // 8. Seed customers
  // -------------------------------------------------
  const customerAId = uuidv4();
  const customerBId = uuidv4();

  await knex('customers').insert([
    {
      id: customerAId,
      customer_code: `ST-001-${timeSuffix}`,
      business_name: 'Sweet Treats Confectionery',
      contact_person: 'Amit Kumar',
      phone: `+91987655000${timeSuffix}`,
      whatsapp_no: `+91987655000${timeSuffix}`,
      billing_address: '789 Main St, City A',
      gps_lat_lng: null,
      credit_limit: '200000.00',
      credit_days: 15,
      current_ar_balance: '0.00',
      max_overdue_days: 15,
      preferred_delivery_window: null,
      payment_reliability_score: null,
      default_site_id: siteAId,
      gstin: null,
      state_code: 'TN',
      credit_hold: false,
      price_tier: 'STANDARD',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: customerBId,
      customer_code: `HB-002-${timeSuffix}`,
      business_name: 'Healthy Bites Bakery',
      contact_person: 'Sneha Patel',
      phone: `+91987655000${timeSuffix}`,
      whatsapp_no: `+91987655000${timeSuffix}`,
      billing_address: '321 Bakery Lane, City B',
      gps_lat_lng: null,
      credit_limit: '150000.00',
      credit_days: 15,
      current_ar_balance: '0.00',
      max_overdue_days: 15,
      preferred_delivery_window: null,
      payment_reliability_score: null,
      default_site_id: siteAId,
      gstin: null,
      state_code: 'TN',
      credit_hold: false,
      price_tier: 'STANDARD',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);

  // -------------------------------------------------
  // 9. Seed sales orders for AC1 (Pulse Header)
  // -------------------------------------------------
  const today = new Date().toISOString().split('T')[0];

  // Sales Order 1: Confirmed (contributing to orders_pending_dispatch count)
  const salesOrderId1 = uuidv4();
  await knex('sales_orders').insert({
    id: salesOrderId1,
    order_no: `SO-261107-${timeSuffix}-01`,
    customer_id: customerAId,
    fulfillment_site_id: siteAId,
    order_status: 'CONFIRMED',
    total_amount: '50000.00',
    margin_pct: '8.00',
    credit_flag: 'COD_ONLY',
    payment_terms: 'COD',
    created_at: new Date(),
    updated_at: new Date(),
  });
  await knex('sales_order_lines').insert({
    order_id: salesOrderId1,
    item_id: itemSugarId,
    ordered_qty: '1000',
    quoted_unit_price: '50.00',
    floor_price_snapshot: '44.64', // cost 40 / (1 - 0.10) = 44.44, rounded up to 0.50 = 44.50 ~ 44.64
    target_price_snapshot: '50.00',
    landed_cost_snapshot: '40.00',
    margin_pct_snapshot: '11.52',
    allocated_from_stock_qty: '1000',
    requires_production_qty: '0',
    line_total: '50000.00',
    qty_secondary: null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Sales Order 2: Delivered (contributes to today's_sales)
  const salesOrderId2 = uuidv4();
  await knex('sales_orders').insert({
    id: salesOrderId2,
    order_no: `SO-261107-${timeSuffix}-02`,
    customer_id: customerAId,
    fulfillment_site_id: siteAId,
    order_status: 'DELIVERED_FULL',
    total_amount: '75000.00',
    margin_pct: '9.33',
    credit_flag: 'OK',
    payment_terms: 'CREDIT',
    created_at: new Date(),
    updated_at: new Date(),
  });
  await knex('sales_order_lines').insert({
    order_id: salesOrderId2,
    item_id: itemMilkId,
    ordered_qty: '1000',
    quoted_unit_price: '75.00',
    floor_price_snapshot: '55.56',
    target_price_snapshot: '75.00',
    landed_cost_snapshot: '50.00',
    margin_pct_snapshot: '14.0',
    allocated_from_stock_qty: '1000',
    requires_production_qty: '0',
    line_total: '75000.00',
    qty_secondary: null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Sales Order 3: Dispatched (contributes to today's_sales)
  const salesOrderId3 = uuidv4();
  await knex('sales_orders').insert({
    id: salesOrderId3,
    order_no: `SO-261107-${timeSuffix}-03`,
    customer_id: customerBId,
    fulfillment_site_id: siteAId,
    order_status: 'DISPATCHED',
    total_amount: '160000.00',
    margin_pct: '14.06',
    credit_flag: 'OK',
    payment_terms: 'CREDIT',
    created_at: new Date(),
    updated_at: new Date(),
  });
  await knex('sales_order_lines').insert({
    order_id: salesOrderId3,
    item_id: itemFlourId,
    ordered_qty: '2000',
    quoted_unit_price: '80.00',
    floor_price_snapshot: '53.33',
    target_price_snapshot: '80.00',
    landed_cost_snapshot: '55.00',
    margin_pct_snapshot: '16.67',
    allocated_from_stock_qty: '2000',
    requires_production_qty: '0',
    line_total: '160000.00',
    qty_secondary: null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // -------------------------------------------------
  // 10. Seed collections for AC1 (cash_collected_today)
  // -------------------------------------------------
  const collectionReceiptId1 = uuidv4();
  await knex('collection_receipts').insert({
    id: collectionReceiptId1,
    receipt_no: `CR-261107-${timeSuffix}-01`,
    customer_id: customerAId,
    site_id: siteAId,
    amount: '10000.00',
    on_account_amount: '0.00',
    payment_mode: 'COD',
    reference_no: null,
    collected_at: new Date(new Date().setHours(10, 0, 0, 0)), // Today 10:00 AM
    collected_by_user_id: collectorId,
    gps_lat_lng: null,
    device_id: null,
    idempotency_key: null,
    reverses_receipt_id: null,
    created_at: new Date(),
  });

  const collectionReceiptId2 = uuidv4();
  await knex('collection_receipts').insert({
    id: collectionReceiptId2,
    receipt_no: `CR-261107-${timeSuffix}-02`,
    customer_id: customerAId,
    site_id: siteAId,
    amount: '25000.00',
    on_account_amount: '0.00',
    payment_mode: 'ONLINE',
    reference_no: null,
    collected_at: new Date(new Date().setHours(14, 0, 0, 0)), // Today 2:00 PM
    collected_by_user_id: collectorId,
    gps_lat_lng: null,
    device_id: null,
    idempotency_key: null,
    reverses_receipt_id: null,
    created_at: new Date(),
  });

  // -------------------------------------------------
  // 13. Seed PO shortfall for AC2 (supplier_shortfalls)
  // -------------------------------------------------
  const poLineForShortfallId = uuidv4();
  const poAvailableId = uuidv4();
  await knex('purchase_orders').insert({
    id: poAvailableId,
    po_no: `PO-261107-${timeSuffix}-01`,
    supplier_id: supplierAId,
    receiving_site_id: siteAId,
    po_status: 'ISSUED',
    total_amount: '20000.00',
    created_by: collectorId,
    updated_by: collectorId,
    created_at: new Date(),
    updated_at: new Date(),
  });
  await knex('purchase_order_lines').insert({
    id: poLineForShortfallId,
    po_id: poAvailableId,
    item_id: itemSugarId,
    ordered_qty: '500',
    confirmed_qty: '500',
    received_qty: '0',
    unit_price: '40.00',
    last_purchase_price_snapshot: '40.00',
    price_variance_pct: '0.0000',
    created_by: collectorId,
    updated_by: collectorId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const poClosedId = uuidv4();
  const poLine2Id = uuidv4();
  await knex('purchase_orders').insert({
    id: poClosedId,
    po_no: `PO-261107-${timeSuffix}-02`,
    supplier_id: supplierBId,
    receiving_site_id: siteAId,
    po_status: 'CLOSED',
    total_amount: '15000.00',
    created_by: collectorId,
    updated_by: collectorId,
    created_at: new Date(),
    updated_at: new Date(),
  });
  await knex('purchase_order_lines').insert({
    id: poLine2Id,
    po_id: poClosedId,
    item_id: itemFlourId,
    ordered_qty: '300',
    confirmed_qty: '300',
    received_qty: '0',
    unit_price: '28.50',
    last_purchase_price_snapshot: '28.50',
    price_variance_pct: '0.0000',
    created_by: collectorId,
    updated_by: collectorId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Seed PO shortfall for exception ALLOCATION
  const shortfallId = uuidv4();
  await knex('po_shortfalls').insert({
    id: shortfallId,
    po_line_id: poLineForShortfallId,
    deficit_qty: '75',
    status: 'OPEN',
    created_by: collectorId,
    updated_by: collectorId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // -------------------------------------------------
  // 14. Seed exceptions for AC1 (pending_exceptions)
  // -------------------------------------------------
  const exceptionPendingId1 = uuidv4();
  await knex('exception_approvals').insert({
    id: exceptionPendingId1,
    exception_type: 'PRICE_OVERRIDE',
    reference_table: 'sales_orders',
    reference_id: salesOrderId1.toString(),
    requested_by: coordinatorId,
    site_id: siteAId,
    context_payload_json: {
      title: 'Price Override for Sweet Treats',
      summary: 'Customer bill rate < floor price',
      facts: {},
      actions: [
        { code: 'ACCEPT', label: 'Accept new price' },
        { code: 'SKIP', label: 'Skip shipment' },
      ],
    },
    status: 'PENDING',
    priority: 'NORMAL',
    value_at_risk: '5000.00',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    created_at: new Date(),
  });

  const exceptionPendingId2 = uuidv4();
  await knex('exception_approvals').insert({
    id: exceptionPendingId2,
    exception_type: 'SUPPLIER_PRICE_SPIKE',
    reference_table: 'purchase_orders',
    reference_id: poAvailableId.toString(),
    requested_by: coordinatorId,
    site_id: siteAId,
    context_payload_json: {
      title: 'Supplier Price Spike Detection',
      summary: '+12% price increase detected',
      facts: {},
      actions: [
        { code: 'APPROVE_SPIKE', label: 'Approve new price' },
        { code: 'RAISE_ISSUE', label: 'Raise issue with supplier' },
      ],
    },
    status: 'PENDING',
    priority: 'NORMAL',
    value_at_risk: '2400.00',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    created_at: new Date(),
  });

  const exceptionPendingId3 = uuidv4();
  await knex('exception_approvals').insert({
    id: exceptionPendingId3,
    exception_type: 'ALLOCATION',
    reference_table: 'po_shortfalls',
    reference_id: shortfallId.toString(),
    requested_by: coordinatorId,
    site_id: siteAId,
    context_payload_json: {
      title: 'Stock Allocation Required',
      summary: 'Price Saver Milk shortage > 500%',
      facts: {},
      actions: [
        { code: 'ALLOCATE_FULL', label: 'Allocate full order' },
        { code: 'ALLOCATE_PARTIAL', label: 'Allocate partial' },
      ],
    },
    status: 'PENDING',
    priority: 'HIGH',
    value_at_risk: '3000.00',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    created_at: new Date(),
  });

  // -------------------------------------------------
  // 14. Seed GRNs for supplier fill rate calculation
  // -------------------------------------------------
  const grnId1 = uuidv4();
  await knex('goods_receipts').insert({
    id: grnId1,
    grn_no: `GRN-261107-${timeSuffix}-01`,
    po_id: poAvailableId,
    supplier_id: supplierAId,
    received_at: new Date(),
    received_by: collectorId,
    site_id: siteAId,
    created_by: collectorId,
    updated_by: collectorId,
    created_at: new Date(),
    updated_at: new Date(),
  });
  await knex('goods_receipt_lines').insert({
    id: uuidv4(),
    grn_id: grnId1,
    item_id: itemSugarId,
    received_qty: '425', // 85% fill rate (425/500)
    batch_lot_no: 'B1',
    mfg_date: today,
    expiry_date: '2027-01-15',
    condition_note: 'OK',
    created_by: collectorId,
    updated_by: collectorId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const grnId2 = uuidv4();
  await knex('goods_receipts').insert({
    id: grnId2,
    grn_no: `GRN-261107-${timeSuffix}-02`,
    po_id: poClosedId,
    supplier_id: supplierBId,
    received_at: new Date(),
    received_by: collectorId,
    site_id: siteAId,
    created_by: collectorId,
    updated_by: collectorId,
    created_at: new Date(),
    updated_at: new Date(),
  });
  const grnLine2Id = uuidv4();
  await knex('goods_receipt_lines').insert({
    id: grnLine2Id,
    grn_id: grnId2,
    item_id: itemFlourId,
    received_qty: '300', // 100% fill rate
    batch_lot_no: 'B1',
    mfg_date: today,
    expiry_date: '2027-01-15',
    condition_note: 'OK',
    created_by: collectorId,
    updated_by: collectorId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // -------------------------------------------------
  // 15. Seed work orders for AC5 (yield_trend)
  // -------------------------------------------------
  const bomHeaderId = uuidv4();
  await knex('bom_headers').insert({
    id: bomHeaderId,
    bom_no: `BOM-261107-${timeSuffix}`,
    item_id: itemMilkId,
    site_id: siteAId,
    version: 1,
    status: 'ACTIVE',
    yield_pct: '92.50', // 925/1000 = 92.5%
    created_by: coordinatorId,
    updated_by: coordinatorId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const workOrderId1 = uuidv4();
  await knex('production_work_orders').insert({
    id: workOrderId1,
    wo_no: `WO-261107-${timeSuffix}`,
    site_id: siteAId,
    bom_header_id: bomHeaderId,
    status: 'COMPLETED',
    planned_qty: '1000',
    uom: 'KG',
    started_at: new Date(new Date().setHours(8, 0, 0, 0)),
    completed_at: new Date(new Date().setHours(16, 0, 0, 0)),
    created_by: coordinatorId,
    updated_by: coordinatorId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Add work order output to calculate yield
  await knex('work_order_outputs').insert({
    id: uuidv4(),
    work_order_id: workOrderId1,
    item_id: itemMilkId,
    planned_qty: '1000',
    actual_qty: '925', // 92.5% yield
    uom: 'KG',
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Add wastage record
  await knex('wastage_records').insert({
    id: uuidv4(),
    work_order_id: workOrderId1,
    item_id: itemMilkId,
    qty: '75',
    uom: 'KG',
    reason_type: 'NORMAL',
    status: 'APPROVED',
    approved_by: ownerId,
    created_by: coordinatorId,
    created_at: new Date(),
  });

  // -------------------------------------------------
  // 16. Seed exception_approvals for KPI queries (AC10)
  // -------------------------------------------------
  const exceptionResolvedId = uuidv4();
  await knex('exception_approvals').insert({
    id: exceptionResolvedId,
    exception_type: 'PRICE_OVERRIDE',
    reference_table: 'sales_orders',
    reference_id: salesOrderId2.toString(),
    requested_by: coordinatorId,
    site_id: siteAId,
    context_payload_json: {
      title: 'Price Override for Healthy Bites',
      summary: 'Customer bill rate < floor price',
      facts: {},
      actions: [
        { code: 'ACCEPT', label: 'Accept new price' },
        { code: 'SKIP', label: 'Skip shipment' },
      ],
    },
    status: 'APPROVED',
    priority: 'NORMAL',
    value_at_risk: '7500.00',
    resolved_by: ownerId,
    resolved_at: new Date(new Date().setHours(12, 0, 0, 0)), // Today 12:00 PM
    owner_remarks: 'Counter price accepted',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    created_at: new Date(),
  });

  // -------------------------------------------------
  // 17. Seed customers with AR for AC6 (AR aging)
  // The AR aging query joins customer_ledger_entries to invoices via ref_id
  // -------------------------------------------------
  const customerWithArId = uuidv4();
  await knex('customers').insert({
    id: customerWithArId,
    customer_code: `AR-001-${timeSuffix}`,
    business_name: 'Customer with AR',
    contact_person: 'Rahul Sharma',
    phone: `+91987656000${timeSuffix}`,
    whatsapp_no: `+91987656000${timeSuffix}`,
    billing_address: '100 Customer St, City A',
    gps_lat_lng: null,
    credit_limit: '300000.00',
    credit_days: 15,
    current_ar_balance: '0.00',
    max_overdue_days: 15,
    preferred_delivery_window: null,
    payment_reliability_score: null,
    default_site_id: siteAId,
    gstin: null,
    state_code: 'TN',
    credit_hold: false,
    price_tier: 'STANDARD',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // -------------------------------------------------
  // 18. Seed invoices with due dates for AC6 (AR aging)
  // -------------------------------------------------
  const invoiceAr1Id = uuidv4();
  await knex('invoices').insert({
    id: invoiceAr1Id,
    site_id: siteAId,
    customer_id: customerWithArId,
    invoice_no: `INV-AR-${timeSuffix}-01`,
    invoice_date: new Date(Date.now() - 18 * 86400000)
      .toISOString()
      .split('T')[0],
    due_date: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0], // 3 days overdue (0-7 bucket)
    total_amount: '50000.00',
    paid_amount: '10000.00',
    balance_due: '40000.00',
    taxable_amount: '50000.00',
    cgst: '0.00',
    sgst: '0.00',
    igst: '0.00',
    status: 'PARTIALLY_PAID',
    is_cod: false,
    created_at: new Date(),
    updated_at: new Date(),
    created_by: ownerId,
  });

  const invoiceAr2Id = uuidv4();
  await knex('invoices').insert({
    id: invoiceAr2Id,
    site_id: siteAId,
    customer_id: customerWithArId,
    invoice_no: `INV-AR-${timeSuffix}-02`,
    invoice_date: new Date(Date.now() - 25 * 86400000)
      .toISOString()
      .split('T')[0],
    due_date: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0], // 10 days overdue (8-15 bucket)
    total_amount: '100000.00',
    paid_amount: '0.00',
    balance_due: '100000.00',
    taxable_amount: '100000.00',
    cgst: '0.00',
    sgst: '0.00',
    igst: '0.00',
    status: 'UNPAID',
    is_cod: false,
    created_at: new Date(),
    updated_at: new Date(),
    created_by: ownerId,
  });

  // Seed customer_ledger_entries with aging buckets
  // 0-7 bucket: invoice due 5 days ago
  // 8-15 bucket: invoice due 10 days ago
  // 16-30 bucket: invoice due 25 days ago
  await knex('customer_ledger_entries').insert([
    {
      id: uuidv4(),
      site_id: siteAId,
      customer_id: customerWithArId,
      entry_type: 'INVOICE',
      debit: '50000.00',
      credit: '0.00',
      ref_id: invoiceAr1Id,
      ref_no: `INV-AR-${timeSuffix}-01`,
      posted_at: new Date(),
      running_balance: '50000.00',
      note: null,
      created_at: new Date(),
    },
    {
      id: uuidv4(),
      site_id: siteAId,
      customer_id: customerWithArId,
      entry_type: 'COLLECTION',
      debit: '0.00',
      credit: '10000.00',
      ref_id: collectionReceiptId1,
      ref_no: `CR-261107-${timeSuffix}-01`,
      posted_at: new Date(),
      running_balance: '40000.00',
      note: null,
      created_at: new Date(),
    },
    {
      id: uuidv4(),
      site_id: siteAId,
      customer_id: customerWithArId,
      entry_type: 'INVOICE',
      debit: '40000.00', // After collection, remaining AR
      credit: '0.00',
      ref_id: invoiceAr2Id,
      ref_no: `INV-AR-${timeSuffix}-02`,
      posted_at: new Date(),
      running_balance: '40000.00',
      note: null,
      created_at: new Date(),
    },
  ]);

  // -------------------------------------------------
  // 18. Seed inventory_batches for AC7 (stock alerts)
  // -------------------------------------------------
  const lowStockBatchId = uuidv4();
  await knex('inventory_batches').insert({
    id: lowStockBatchId,
    site_id: siteAId,
    item_id: itemSugarId,
    batch_number: 'BSL-20261027-001',
    expiry_date: '2026-11-30', // 52 days from now
    qty_on_hand: '500',
    qty_committed: '500',
    created_by: coordinatorId,
    updated_by: coordinatorId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const lowStockBatch2Id = uuidv4();
  await knex('inventory_batches').insert({
    id: lowStockBatch2Id,
    site_id: siteAId,
    item_id: itemMilkId,
    batch_number: 'BSL-20261027-002',
    expiry_date: new Date(Date.now() + 6 * 86400000)
      .toISOString()
      .split('T')[0], // 6 days from now
    qty_on_hand: '200',
    qty_committed: '0',
    created_by: coordinatorId,
    updated_by: coordinatorId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const overCommittedBatchId = uuidv4();
  await knex('inventory_batches').insert({
    id: overCommittedBatchId,
    site_id: siteAId,
    item_id: itemFlourId,
    batch_number: 'BSL-20261027-003',
    expiry_date: '2027-01-15',
    qty_on_hand: '1000',
    qty_committed: '1500', // Committed > on_hand
    created_by: coordinatorId,
    updated_by: coordinatorId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // -------------------------------------------------
  // 19. Seed delivery trips for AC2 (status matrix)
  // -------------------------------------------------
  const vehicleId1 = uuidv4();
  await knex('vehicles').insert({
    id: vehicleId1,
    site_id: siteAId,
    registration_no: `TN-01-AB-${timeSuffix}`,
    vehicle_type: 'TRUCK',
    capacity_kg: '10000.000',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const vehicleId2 = uuidv4();
  await knex('vehicles').insert({
    id: vehicleId2,
    site_id: siteAId,
    registration_no: `TN-02-AB-${timeSuffix}`,
    vehicle_type: 'TRUCK',
    capacity_kg: '10000.000',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const tripInTransitId1 = uuidv4();
  await knex('delivery_trips').insert({
    id: tripInTransitId1,
    site_id: siteAId,
    trip_no: `TR-261107-${timeSuffix}-01`,
    trip_date: new Date().toISOString().split('T')[0],
    origin_site_id: siteAId,
    vehicle_id: vehicleId1,
    driver_id: collectorId,
    status: 'IN_TRANSIT',
    started_at: new Date(new Date().setHours(6, 0, 0, 0)),
    created_by: coordinatorId,
    updated_by: coordinatorId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const tripInTransitId2 = uuidv4();
  await knex('delivery_trips').insert({
    id: tripInTransitId2,
    site_id: siteAId,
    trip_no: `TR-261107-${timeSuffix}-02`,
    trip_date: new Date().toISOString().split('T')[0],
    origin_site_id: siteAId,
    vehicle_id: vehicleId2,
    driver_id: collectorId,
    status: 'IN_TRANSIT',
    started_at: new Date(new Date().setHours(8, 0, 0, 0)),
    created_by: coordinatorId,
    updated_by: coordinatorId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // -------------------------------------------------
  // 20. Return useful IDs for tests
  // -------------------------------------------------
  return {
    knex,
    siteId: siteAId,
    siteBId,
    ownerId,
    coordinatorId,
    collectorId,
    supplierAId,
    supplierBId,
    customerAId,
    customerBId,
    customerWithArId,
    itemSugarId,
    itemMilkId,
    itemFlourId,
    poAvailableId,
    poClosedId,
    workOrderId1,
    lowStockBatchId,
    lowStockBatch2Id,
    overCommittedBatchId,
    tripInTransitId1,
    tripInTransitId2,
    salesOrderId1,
    salesOrderId2,
    salesOrderId3,
    exceptionPendingId1,
    exceptionPendingId2,
    exceptionPendingId3,
    shortfallId,
  };
}
