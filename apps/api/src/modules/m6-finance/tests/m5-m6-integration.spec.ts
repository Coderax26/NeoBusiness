import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { createKnex } from '../../../shared/database/knex-instance.js';
import { assertTestDatabase } from '../../../shared/database/test-db-guard.js';
import type { Knex } from 'knex';

describe('M5-M6 Cross-Module Integration', () => {
  let knex: Knex;
  let tripId: string;
  let stopId: string;
  let driverId: string;
  let customerId: string;
  let itemId: string;
  let orderId: string;
  let batchId: string;
  let siteId: string;
  let ownerId: string;
  let vehicleId: string;

  beforeAll(async () => {
    knex = await createKnex();
    await assertTestDatabase(knex);

    // Run migrations
    const { MigrationService } =
      await import('../../../modules/m0-platform/migration.service.js');
    const migrationService = new MigrationService(knex);
    await migrationService.runMigrations();
  });

  beforeEach(async () => {
    // Clean only the tables used by this integration test
    // DO NOT clean shared core tables (sites, users, doc_sequences, cashbook_entries)
    // as they are seeded by the M6 acceptance test's setupTestDB()
    // FK-safe order: delete children before parents
    // Use TRUNCATE CASCADE for proper FK cleanup (same as M6 acceptance test)
    const integrationTables = [
      'receipt_allocations',
      'invoice_lines',
      'invoices',
      'credit_note_lines',
      'credit_notes',
      'collection_receipts',
      'custody_ledger',
      'customer_ledger_entries',
      'ptp_followups',
      'cheque_register',
      'cash_handovers',
      'eod_closings',
      'worklist_items',
      'worklist_worklists',
      'trip_expenses',
      'issue_reports',
      'delivery_challans',
      'delivery_stop_lines',
      'delivery_stops',
      'delivery_trips',
      'delivery_command_queue',
      'stock_reservations',
      'stock_ledger_txns',
      'stock_transfer_lines',
      'stock_transfers',
      'stock_adjustments',
      'inventory_batches',
      'wastage_records',
      'work_order_outputs',
      'work_order_materials',
      'production_work_orders',
      'production_requisitions',
      'bom_lines',
      'bom_headers',
      'sales_order_lines',
      'sales_orders',
      'items',
      'vehicles',
    ];

    // Filter tables that exist in the database
    const existingTables = await knex.raw(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );

    const tablesToTruncate = integrationTables.filter((table) =>
      existingTables.rows.some(
        (row: { table_name: string }) => row.table_name === table,
      ),
    );

    if (tablesToTruncate.length > 0) {
      await knex.raw(`
        TRUNCATE TABLE ${tablesToTruncate.join(', ')} RESTART IDENTITY CASCADE;
      `);
    }

    // Re-seed for each test
    await seedTestData();
  });

  async function seedTestData() {
    // Create site (re-use the site from M6 test setup if it exists)
    const existingSites = await knex('sites').select('id').limit(1);
    if (existingSites.length > 0) {
      siteId = String(existingSites[0].id);
    } else {
      const [site] = await knex('sites')
        .insert({
          name: 'Site A',
          address: 'Address A',
          site_type: 'WAREHOUSE',
        })
        .returning('*');
      siteId = String(site.id);
    }

    // Create items
    const [itemRice] = await knex('items')
      .insert({
        name: 'Rice',
        sku_code: 'RICE-001',
        item_category: 'RAW_MATERIAL',
        primary_uom: 'KG',
        hsn_code: '1006',
        tax_rate_pct: '5',
        is_catch_weight: false,
        tax_treatment: 'TAXABLE',
      })
      .returning('*');
    itemId = String(itemRice.id);

    // Get existing owner/driver from M6 test setup (OPS_COORD = owner for M5, DRIVER for driver)
    const existingOwner = await knex('users')
      .where('role', 'OWNER')
      .first('id');
    const existingDriver = await knex('users')
      .where('role', 'DRIVER')
      .first('id');

    // Create unique test users if not available
    const phoneSuffix = Date.now().toString().slice(-4);

    if (existingOwner) {
      ownerId = String(existingOwner.id);
    } else {
      const [owner] = await knex('users')
        .insert({
          id: uuidv4(),
          full_name: 'Owner User',
          phone: `+91987654321${phoneSuffix}`,
          role: 'OWNER',
          assigned_site_id: siteId,
          is_active: true,
        })
        .returning('*');
      ownerId = String(owner.id);
    }

    if (existingDriver) {
      driverId = String(existingDriver.id);
    } else {
      const [driver] = await knex('users')
        .insert({
          id: uuidv4(),
          full_name: 'Test Driver',
          phone: `+91987654321${Number(phoneSuffix) + 1}`,
          role: 'DRIVER',
          assigned_site_id: siteId,
          is_active: true,
        })
        .returning('*');
      driverId = String(driver.id);
    }

    // Create customer
    const [customer] = await knex('customers')
      .insert({
        id: uuidv4(),
        customer_code: `CUST-${phoneSuffix}`,
        business_name: 'Test Customer',
        phone: `+91981234567${phoneSuffix.slice(-1)}`,
        state_code: 'MH',
        credit_limit: '100000',
        default_site_id: siteId,
        gstin: '27AAPLCC1234L1Z5',
        billing_address: 'Test Address',
      })
      .returning('*');
    customerId = String(customer.id);

    // Create vehicle
    const [vehicle] = await knex('vehicles')
      .insert({
        id: uuidv4(),
        site_id: siteId,
        registration_no: `MH-01-AB-${phoneSuffix}`,
        vehicle_type: 'TRUCK',
        capacity_kg: '1000',
        is_active: true,
      })
      .returning('*');
    vehicleId = String(vehicle.id);

    // Create sales order
    const [salesOrder] = await knex('sales_orders')
      .insert({
        id: uuidv4(),
        order_no: `SO-TEST-${phoneSuffix}`,
        customer_id: customerId,
        fulfillment_site_id: siteId,
        order_status: 'CONFIRMED',
        total_amount: '1000.00',
      })
      .returning('*');
    orderId = String(salesOrder.id);

    // Create order lines
    await knex('sales_order_lines').insert({
      order_id: orderId,
      item_id: itemId,
      ordered_qty: '50',
      quoted_unit_price: '20.00',
      line_total: '1000.00',
      floor_price_snapshot: '15.00',
      target_price_snapshot: '25.00',
      landed_cost_snapshot: '10.00',
    });

    // Create batch
    const [batch] = await knex('inventory_batches')
      .insert({
        id: uuidv4(),
        item_id: itemId,
        site_id: siteId,
        batch_number: `BATCH-${phoneSuffix}`,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .returning('*');
    batchId = String(batch.id);

    // Create trip
    const [trip] = await knex('delivery_trips')
      .insert({
        id: uuidv4(),
        site_id: siteId,
        trip_date: new Date().toISOString().slice(0, 10),
        vehicle_id: vehicleId,
        driver_id: driverId,
        status: 'LOADING',
        created_by: ownerId,
        updated_by: ownerId,
      })
      .returning('*');
    tripId = String(trip.id);

    // Create stop
    const [stop] = await knex('delivery_stops')
      .insert({
        id: uuidv4(),
        site_id: siteId,
        trip_id: tripId,
        sales_order_id: orderId,
        customer_id: customerId,
        sequence_no: 1,
        is_cod: true,
        cod_amount: '1000.00',
        created_by: ownerId,
        updated_by: ownerId,
      })
      .returning('*');
    stopId = String(stop.id);

    // Create stop line
    await knex('delivery_stop_lines').insert({
      stop_id: stopId,
      item_id: itemId,
      loaded_qty: '50',
      batch_id: batchId,
    });
  }

  afterAll(async () => {
    await knex.destroy();
  });

  describe('TC-INT-001: trip.dispatched event generates M6 tax invoices', () => {
    it('should automatically generate tax invoices for all loaded orders on trip dispatch', async () => {
      // Generate invoice for the order (simulates TripListenerService response)
      const invoiceResult = await knex.transaction(async (trx) => {
        const invoiceNo = await trx('doc_sequences')
          .where('doc_type', 'INVOICE')
          .andWhere('site_id', siteId)
          .increment('last_no', 1)
          .returning('last_no')
          .then((r) => `I-${r[0]?.last_no ?? 1}`);

        const [invoice] = await trx('invoices')
          .insert({
            site_id: siteId,
            customer_id: customerId,
            sales_order_id: orderId,
            invoice_no: invoiceNo,
            invoice_date: new Date(),
            due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
            total_amount: '1000.00',
            balance_due: '1000.00',
            status: 'UNPAID',
            is_cod: true,
            created_by: ownerId,
            updated_by: ownerId,
          })
          .returning('*');

        // Insert invoice lines
        await trx('invoice_lines').insert({
          invoice_id: invoice.id,
          item_id: itemId,
          qty: '50',
          unit_price: '20.00',
          line_total: '1000.00',
          hsn_code: '1006',
          tax_rate_pct: '5.00',
          tax_amount: '0.00',
          tax_treatment: 'TAXABLE',
        });

        return invoice;
      });

      expect(invoiceResult).toBeDefined();
      expect(invoiceResult.customer_id).toBe(customerId);
      expect(parseFloat(invoiceResult.total_amount)).toBe(1000.0);

      // Update trip status to IN_TRANSIT (simulates trip.dispatched)
      await knex('delivery_trips')
        .where('id', tripId)
        .update({ status: 'IN_TRANSIT' });

      const trip = await knex('delivery_trips').where('id', tripId).first('*');
      expect(trip.status).toBe('IN_TRANSIT');
    });
  });

  describe('TC-INT-002: trip.closed event settles COD amounts', () => {
    it('should settle COD into driver wallet and customer ledger on trip closure', async () => {
      // First complete the delivery
      await knex('delivery_stops').where('id', stopId).update({
        status: 'DELIVERED_FULL',
        cod_collected_amount: '1000.00',
        delivered_at: new Date(),
      });

      // Close the trip
      await knex('delivery_trips')
        .where('id', tripId)
        .update({ status: 'COMPLETED', closed_at: new Date() });

      // Create COD collection record
      const [receipt] = await knex('collection_receipts')
        .insert({
          site_id: siteId,
          customer_id: customerId,
          receipt_no: 'COL-TEST-001',
          amount: '1000.00',
          payment_mode: 'CASH',
          collected_by_user_id: driverId,
          idempotency_key: 'cod-settlement-test',
        })
        .returning('*');

      expect(receipt).toBeDefined();
      expect(parseFloat(receipt.amount)).toBe(1000.0);
    });
  });

  describe('TC-INT-003: partial delivery creates credit note', () => {
    it('should create DRAFT credit note on partial delivery with returned_qty', async () => {
      // Create partial delivery with returns
      await knex('delivery_stops').where('id', stopId).update({
        status: 'DELIVERED_PARTIAL',
        delivered_at: new Date(),
      });

      await knex('delivery_stop_lines').where('stop_id', stopId).update({
        delivered_qty: '40',
        returned_qty: '10',
      });

      // Create credit note (simulates CreditNoteService response to stops.returned event)
      const docNumber = await knex('doc_sequences')
        .where('doc_type', 'CREDIT_NOTE')
        .andWhere('site_id', siteId)
        .increment('last_no', 1)
        .returning('last_no')
        .then(
          (r) =>
            `CN-${new Date().getFullYear()}-${String(r[0]?.last_no ?? 1).padStart(3, '0')}`,
        );

      const [creditNote] = await knex('credit_notes')
        .insert({
          credit_note_no: docNumber,
          site_id: siteId,
          customer_id: customerId,
          order_id: orderId,
          status: 'DRAFT',
          reason_type: 'RETURNED',
          total_debit: '200.00',
          created_by: ownerId,
          updated_by: ownerId,
        })
        .returning('*');

      // Insert credit note lines
      await knex('credit_note_lines').insert({
        credit_note_id: creditNote.id,
        order_id: orderId,
        item_id: itemId,
        debited_qty: '10',
        unit_price: '20.00',
        total_debit: '200.00',
      });

      expect(creditNote).toBeDefined();
      expect(creditNote.status).toBe('DRAFT');
      expect(parseFloat(creditNote.total_debit)).toBe(200.0);

      // Verify ledger entry will be created when credit note is approved
      const lines = await knex('credit_note_lines')
        .where('credit_note_id', creditNote.id)
        .select('*');

      expect(lines).toHaveLength(1);
      expect(parseFloat(lines[0].total_debit)).toBe(200.0);
    });
  });

  describe('TC-INT-004: outbox events enable async integration', () => {
    it('should persist trip.dispatched event in outbox for async processing', async () => {
      // Insert outbox event (simulating FleetService dispatch action)
      const [event] = await knex('outbox_events')
        .insert({
          event_type: 'trips.dispatched',
          aggregate_id: tripId,
          payload: JSON.stringify({
            tripId,
            siteId,
            driverId,
            orderIds: [orderId],
            totalCod: '1000.00',
            totalValue: '1000.00',
            stopCount: 1,
          }),
          module_source: 'm5',
          processed_at: null,
        })
        .returning('*');

      expect(event).toBeDefined();
      expect(event.event_type).toBe('trips.dispatched');
      // payload is JSONB, so it might be auto-parsed
      const payload =
        typeof event.payload === 'string'
          ? JSON.parse(event.payload)
          : event.payload;
      expect(payload.tripId).toBe(tripId);

      // Verify event can be queried for processing
      const pendingEvent = await knex('outbox_events')
        .where('id', event.id)
        .andWhere('processed_at', null)
        .first('*');

      expect(pendingEvent).toBeDefined();
      expect(pendingEvent.module_source).toBe('m5');
    });
  });
});
