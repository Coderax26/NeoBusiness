import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import type { Knex } from 'knex';
import { createKnex } from '../../shared/database/knex-instance.js';
import { assertTestDatabase } from '../../shared/database/test-db-guard.js';
import { SupplierBillService } from './supplier-bill.service.js';
import { SupplierService } from './supplier.service.js';
import { POService } from './po.service.js';
import { GRNService } from './grn.service.js';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import { ConfigService } from '../m0-platform/config.service.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import { ExceptionService } from '../m7a-exceptions/exception.service.js';
import { NotificationService } from '../m7a-exceptions/notification.service.js';
import { BillStatus, THREE_WAY_STATUS } from './supplier-bill.types.js';

describe('SupplierBillService — Workstream A & B Integration Tests', () => {
  let knex: Knex;
  let service: SupplierBillService;
  let outbox: OutboxService;
  let docNumber: DocNumberService;

  let siteId: string;
  let supplierId: string;
  let poId: string;
  let grnId: string;
  let itemId: string;
  let batchId: string;
  let userId: string;

  beforeAll(async () => {
    knex = await createKnex();
    await assertTestDatabase(knex);

    const config = new ConfigService();
    const notification = new NotificationService(knex);
    const exception = new ExceptionService(knex, notification);
    outbox = new OutboxService(knex);
    docNumber = new DocNumberService(knex);

    const supplierSvc = new SupplierService(knex);
    const poSvc = new POService(knex, config, exception, notification, outbox);
    const grnSvc = new GRNService(
      knex,
      config,
      exception,
      notification,
      outbox,
    );

    service = new SupplierBillService(
      knex,
      supplierSvc,
      poSvc,
      grnSvc,
      outbox,
      docNumber,
    );
  }, 30000);

  afterAll(async () => {
    await knex?.destroy();
  });

  beforeEach(async () => {
    siteId = uuidv4();
    supplierId = uuidv4();
    poId = uuidv4();
    grnId = uuidv4();
    itemId = uuidv4();
    batchId = uuidv4();
    userId = uuidv4();

    // 1. Seed site
    await knex('sites').insert({
      id: siteId,
      name: 'Test Procurement Site',
      site_type: 'FACTORY',
      address: '123 Industrial Way, Chennai',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 2. Seed user
    await knex('users').insert({
      id: userId,
      assigned_site_id: siteId,
      role: 'OWNER',
      full_name: 'Procurement Manager',
      phone: `+91987${Date.now().toString().slice(-7)}`,
      pin_hash: 'test_hash',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 3. Seed supplier
    await knex('suppliers').insert({
      id: supplierId,
      supplier_code: `SUP-${Date.now().toString().slice(-4)}`,
      company_name: 'Alpha Ingredients Pvt Ltd',
      phone: `+91981${Date.now().toString().slice(-7)}`,
      payment_terms_days: 30,
      lead_time_days_avg: 5,
      reliability_score_pct: 95.0,
      current_ap_balance: '0.00',
      is_approved: true,
      is_active: true,
      created_by: userId,
      updated_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 4. Seed item
    await knex('items').insert({
      id: itemId,
      sku_code: `SKU-${Date.now().toString().slice(-4)}`,
      name: 'Raw Milk Powder',
      item_category: 'RAW_MATERIAL',
      primary_uom: 'KG',
      tax_rate_pct: '5',
      tax_treatment: 'TAXABLE',
      min_margin_pct: '0.10',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 5. Seed PO
    await knex('purchase_orders').insert({
      id: poId,
      supplier_id: supplierId,
      po_no: `PO-${Date.now().toString().slice(-4)}`,
      receiving_site_id: siteId,
      po_status: 'ISSUED',
      total_amount: '10500.00',
      expected_delivery: new Date(Date.now() + 86400000), // tomorrow
      created_by: userId,
      updated_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 6. Seed GRN
    await knex('goods_receipts').insert({
      id: grnId,
      po_id: poId,
      supplier_id: supplierId,
      site_id: siteId,
      grn_no: `GRN-${Date.now().toString().slice(-4)}`,
      received_by: userId,
      received_at: new Date(),
      created_by: userId,
      updated_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 7. Seed GRN lines
    await knex('goods_receipt_lines').insert({
      id: uuidv4(),
      grn_id: grnId,
      item_id: itemId,
      received_qty: '100.000',
      created_by: userId,
      updated_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 8. Seed inventory batch
    await knex('inventory_batches').insert({
      id: batchId,
      site_id: siteId,
      item_id: itemId,
      batch_number: `BAT-${Date.now().toString().slice(-4)}`,
      qty_on_hand: '100.000',
      qty_committed: '0.000',
      created_by: userId,
      updated_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  describe('Workstream A: Schema Compatibility & CRUD', () => {
    it('creates supplier bill with all required parent and item fields matching schema', async () => {
      const bill = await service.create(
        {
          po_id: poId,
          supplier_id: supplierId,
          site_id: siteId,
          due_days: 30,
          items: [
            {
              item_id: itemId,
              batch_id: batchId,
              item_name: 'Raw Milk Powder',
              quantity: '100.000',
              rate_per_unit: '100.00',
              tax_amount: '500.00',
              line_total: '10500.00',
              tax_treatment: 'TAXABLE',
              tax_rate: '5',
            },
          ],
        },
        userId,
      );

      expect(bill).toBeDefined();
      expect(bill.id).toBeDefined();
      expect(bill.bill_number).toBeDefined();
      expect(bill.status).toBe(BillStatus.PENDING_APPROVAL);
      expect(bill.three_way_status).toBe(THREE_WAY_STATUS.MATCHED);
      expect(bill.items).toHaveLength(1);
      expect(bill.items[0].quantity).toBe('100.000');
      expect(bill.total_amount).toBe('10500.00');

      // Verify direct database persistence
      const dbBill = await knex('supplier_bills')
        .where('id', bill.id)
        .first('*');
      expect(dbBill).toBeDefined();
      expect(dbBill.bill_no).toBe(bill.bill_number);
      expect(dbBill.bill_number).toBe(bill.bill_number);
      expect(Number(dbBill.amount)).toBe(10500.0);
      expect(Number(dbBill.total_amount)).toBe(10500.0);
      expect(dbBill.created_by).toBe(userId);
      expect(dbBill.updated_by).toBe(userId);
      expect(dbBill.status).toBe('PENDING_APPROVAL');

      // Verify items table
      const dbItems = await knex('supplier_bill_items')
        .where('bill_id', bill.id)
        .select('*');
      expect(dbItems).toHaveLength(1);
      expect(dbItems[0].id).toBeDefined();
      expect(dbItems[0].created_by).toBe(userId);
      expect(dbItems[0].updated_by).toBe(userId);
    });

    it('approves supplier bill and generates a valid tax invoice with document number', async () => {
      const bill = await service.create(
        {
          po_id: poId,
          supplier_id: supplierId,
          site_id: siteId,
          items: [
            {
              item_id: itemId,
              batch_id: batchId,
              item_name: 'Raw Milk Powder',
              quantity: '100.000',
              rate_per_unit: '100.00',
              tax_amount: '500.00',
              line_total: '10500.00',
            },
          ],
        },
        userId,
      );

      const approvedBill = await service.updateStatus(
        bill.id,
        {
          status: BillStatus.APPROVED,
          reason: '3-way match verified against GRN' as any,
        },
        userId,
      );

      expect(approvedBill.status).toBe(BillStatus.APPROVED);
      expect(approvedBill.approved_by).toBe(userId);
      expect(approvedBill.tax_invoice_id).toBeDefined();

      // Check tax invoice row in database
      const taxInvoice = await knex('tax_invoices')
        .where('id', approvedBill.tax_invoice_id)
        .first('*');

      expect(taxInvoice).toBeDefined();
      expect(taxInvoice.invoice_type).toBe('SUPPLIER_BILL');
      expect(taxInvoice.bill_id).toBe(bill.id);
      expect(taxInvoice.customer_id).toBe(supplierId);
      expect(taxInvoice.site_id).toBe(siteId);
      expect(taxInvoice.invoice_no).toBeDefined();
      expect(taxInvoice.invoice_no.length).toBeGreaterThan(0);
      expect(Number(taxInvoice.total_amount)).toBe(10500.0);
      expect(taxInvoice.status).toBe('GENERATED');
      expect(taxInvoice.created_by).toBe(userId);
    });

    it('rejects duplicate approval idempotently or with error', async () => {
      const bill = await service.create(
        {
          po_id: poId,
          supplier_id: supplierId,
          site_id: siteId,
          items: [
            {
              item_id: itemId,
              batch_id: batchId,
              item_name: 'Raw Milk Powder',
              quantity: '50.000',
              rate_per_unit: '100.00',
              tax_amount: '250.00',
              line_total: '5250.00',
            },
          ],
        },
        userId,
      );

      await service.updateStatus(
        bill.id,
        { status: BillStatus.APPROVED, reason: 'Verified' as any },
        userId,
      );

      await expect(
        service.updateStatus(
          bill.id,
          { status: BillStatus.APPROVED, reason: 'Duplicate' as any },
          userId,
        ),
      ).rejects.toThrow();
    });

    it('rejects invalid state machine transitions', async () => {
      const bill = await service.create(
        {
          po_id: poId,
          supplier_id: supplierId,
          site_id: siteId,
          items: [
            {
              item_id: itemId,
              batch_id: batchId,
              item_name: 'Raw Milk Powder',
              quantity: '10.000',
              rate_per_unit: '100.00',
              tax_amount: '50.00',
              line_total: '1050.00',
            },
          ],
        },
        userId,
      );

      // Cannot jump from PENDING_APPROVAL back to DRAFT without rejection
      await expect(
        service.updateStatus(bill.id, { status: BillStatus.DRAFT }, userId),
      ).rejects.toThrow();
    });
  });

  describe('Workstream B: Outbox Event Delivery & Reliability', () => {
    it('persists bill.created event into outbox_events table on bill creation', async () => {
      const bill = await service.create(
        {
          po_id: poId,
          supplier_id: supplierId,
          site_id: siteId,
          items: [
            {
              item_id: itemId,
              batch_id: batchId,
              item_name: 'Raw Milk Powder',
              quantity: '20.000',
              rate_per_unit: '100.00',
              tax_amount: '100.00',
              line_total: '2100.00',
            },
          ],
        },
        userId,
      );

      const outboxRow = await knex('outbox_events')
        .where('aggregate_id', bill.id)
        .andWhere('event_type', 'bill.created')
        .first('*');

      expect(outboxRow).toBeDefined();
      expect(outboxRow.module_source).toBe('m2');

      const payload =
        typeof outboxRow.payload === 'string'
          ? JSON.parse(outboxRow.payload)
          : outboxRow.payload;

      expect(payload.billId).toBe(bill.id);
      expect(payload.supplierId).toBe(supplierId);
      expect(payload.amount).toBe('2100.00');
    });

    it('persists bill.approved event into outbox_events table on bill approval', async () => {
      const bill = await service.create(
        {
          po_id: poId,
          supplier_id: supplierId,
          site_id: siteId,
          items: [
            {
              item_id: itemId,
              batch_id: batchId,
              item_name: 'Raw Milk Powder',
              quantity: '15.000',
              rate_per_unit: '100.00',
              tax_amount: '75.00',
              line_total: '1575.00',
            },
          ],
        },
        userId,
      );

      await service.updateStatus(
        bill.id,
        { status: BillStatus.APPROVED, reason: 'All checks passed' as any },
        userId,
      );

      const approvedEvent = await knex('outbox_events')
        .where('aggregate_id', bill.id)
        .andWhere('event_type', 'bill.approved')
        .first('*');

      expect(approvedEvent).toBeDefined();
      const payload =
        typeof approvedEvent.payload === 'string'
          ? JSON.parse(approvedEvent.payload)
          : approvedEvent.payload;

      expect(payload.billId).toBe(bill.id);
      expect(payload.approvedBy).toBe(userId);
      expect(payload.taxInvoiceId).toBeDefined();
      expect(payload.invoiceNo).toBeDefined();
    });

    it('rolls back parent and child rows if outbox persistence fails', async () => {
      // Mock outbox.raise to fail
      const originalRaise = outbox.raise.bind(outbox);
      outbox.raise = async () => {
        throw new Error('Forced Outbox Persistence Failure');
      };

      try {
        await expect(
          service.create(
            {
              po_id: poId,
              supplier_id: supplierId,
              site_id: siteId,
              items: [
                {
                  item_id: itemId,
                  batch_id: batchId,
                  item_name: 'Raw Milk Powder',
                  quantity: '10.000',
                  rate_per_unit: '100.00',
                  tax_amount: '50.00',
                  line_total: '1050.00',
                },
              ],
            },
            userId,
          ),
        ).rejects.toThrow('Forced Outbox Persistence Failure');

        // Confirm no orphaned bill row was committed
        const orphanedBills = await knex('supplier_bills')
          .where('supplier_id', supplierId)
          .andWhere('amount', 1050.0);

        expect(orphanedBills).toHaveLength(0);
      } finally {
        outbox.raise = originalRaise;
      }
    });
  });
});
