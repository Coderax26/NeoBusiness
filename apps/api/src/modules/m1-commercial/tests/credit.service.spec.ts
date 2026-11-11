import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Knex } from 'knex';
import { createKnex } from '../../../shared/database/knex-instance.js';
import { CreditService } from '../credit.service.js';
import { Money } from '../../../shared/utils/money.util.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * CreditService Tests — BR-02 Credit Evaluation with Overdue Invoice Integration
 *
 * Tests the following scenarios:
 * 1. No overdue invoices — credit OK
 * 2. Overdue within tolerance (≤ max_overdue_days) — credit OK
 * 3. Overdue beyond max_overdue_days — credit HOLD
 * 4. Inactive customer — credit HOLD
 * 5. Credit limit breach + overdue combination
 */
describe('CreditService', () => {
  let knex: Knex;
  let creditService: CreditService;

  // Test data
  let siteId: string;
  let ownerId: string;
  let inactiveCustomerId: string;

  beforeAll(async () => {
    knex = await createKnex();

    // Run migrations to ensure schema exists
    const { MigrationService } =
      await import('../../../modules/m0-platform/migration.service.js');
    const migrationService = new MigrationService(knex);
    await migrationService.runMigrations();

    // Get test users from seed (or create if not exists)
    const owner = await knex('users')
      .where('role', 'OWNER')
      .first('id', 'assigned_site_id');

    if (owner) {
      ownerId = String(owner.id);
      const site = await knex('sites').first('id');
      siteId = String(site!.id);
    } else {
      // Create test users if seed data doesn't exist
      siteId = uuidv4();
      await knex('sites').insert({
        id: siteId,
        name: 'Test Site',
        site_type: 'WAREHOUSE',
        address: '123 Test St',
      });
      ownerId = uuidv4();
      await knex('users').insert({
        id: ownerId,
        full_name: 'Owner User',
        phone: '+919876540001',
        role: 'OWNER',
        assigned_site_id: siteId,
      });
    }

    creditService = new CreditService(knex);
    await creditService.onModuleInit();

    // Create an inactive test customer (for inactive customer tests)
    // Check if already exists (from previous test run)
    let existingInactive = await knex('customers')
      .where('customer_code', 'CUST-TEST-INACTIVE')
      .first('id');

    if (!existingInactive) {
      const [inactiveCust] = await knex('customers')
        .insert({
          customer_code: `CUST-TEST-INACTIVE`,
          business_name: 'Inactive Test Customer',
          contact_person: 'Test Contact',
          phone: '+919876540002',
          billing_address: '123 Test St',
          state_code: '29',
          credit_limit: 100000,
          credit_days: 30,
          max_overdue_days: 15,
          is_active: false, // INACTIVE
          default_site_id: siteId,
          current_ar_balance: 0,
        })
        .returning('id');

      inactiveCustomerId = String(inactiveCust.id);
    } else {
      inactiveCustomerId = String(existingInactive.id);
      // Update to ensure it's inactive
      await knex('customers')
        .where('id', inactiveCustomerId)
        .update({ is_active: false });
    }
  });

  afterAll(async () => {
    await knex?.destroy();
  });

  beforeEach(async () => {
    // Clean up test invoices first (due to FK constraints)
    // Don't clean up CUST-TEST-INACTIVE as it's used across tests for Scenario 4
    const testCustomerIds = await knex('customers')
      .where('customer_code', 'like', 'CUST-TEST-%')
      .andWhere('customer_code', '!=', 'CUST-TEST-INACTIVE')
      .select('id');

    if (testCustomerIds.length > 0) {
      const ids = testCustomerIds.map((c) => c.id);
      await knex('invoices').whereIn('customer_id', ids).del();
      await knex('customer_ledger_entries').whereIn('customer_id', ids).del();
      await knex('customers').whereIn('id', ids).del();
    }
  });

  /**
   * Test Case 1: No overdue invoices
   * Customer has no invoices or all invoices are current (due_date >= today)
   * Expected: Credit status OK
   */
  describe('Scenario 1: No overdue invoices', () => {
    it('should return OK when customer has no invoices', async () => {
      // Create test customer
      const [customer] = await knex('customers')
        .insert({
          customer_code: `CUST-TEST-001-${Date.now()}`,
          business_name: 'Test Customer No Invoices',
          contact_person: 'Test Contact',
          phone: '+919876543210',
          billing_address: '123 Test St',
          state_code: '29',
          credit_limit: 100000,
          credit_days: 30,
          max_overdue_days: 15,
          is_active: true,
          default_site_id: siteId,
          current_ar_balance: 0,
        })
        .returning('id');

      const customerId = String(customer.id);

      const result = await creditService.evaluate(customerId, '1000.00');

      expect(result.status).toBe('OK');
      expect(result.currentArBalance).toBe('0.00');
      expect(result.creditLimit).toBe('100000.00');
      expect(result.maxOverdueDays).toBe(15);
      expect(result.oldestOverdueDays).toBeNull();
      expect(result.reason).toBeUndefined();
    });
  });

  /**
   * Test Case 2: Overdue within tolerance
   * Customer has invoices that are overdue, but within max_overdue_days
   * Expected: Credit status OK (overdue is tolerated)
   */
  describe('Scenario 2: Overdue within tolerance', () => {
    it('should return OK when overdue invoices are within max_overdue_days', async () => {
      // Create test customer
      const [customer] = await knex('customers')
        .insert({
          customer_code: `CUST-TEST-002-${Date.now()}`,
          business_name: 'Within Tolerance Customer',
          contact_person: 'Test Contact',
          phone: '+919876543220',
          billing_address: '123 Test St',
          state_code: '29',
          credit_limit: 100000,
          credit_days: 30,
          max_overdue_days: 15,
          is_active: true,
          default_site_id: siteId,
          current_ar_balance: 50000,
        })
        .returning('id');

      const customerId = String(customer.id);

      // Create invoice that is 10 days overdue (within 15-day tolerance)
      const today = new Date();
      const invoiceDate = new Date(today);
      invoiceDate.setDate(invoiceDate.getDate() - 10);

      const [invoice] = await knex('invoices')
        .insert({
          customer_id: customerId,
          site_id: siteId,
          invoice_no: `INV-WITHIN-${Date.now()}`,
          invoice_date: invoiceDate,
          due_date: invoiceDate,
          total_amount: 5000,
          paid_amount: 0,
          balance_due: 5000,
          taxable_amount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          status: 'UNPAID',
        })
        .returning('id');

      // Add ledger entry for the invoice
      await knex('customer_ledger_entries').insert({
        site_id: siteId,
        customer_id: customerId,
        entry_type: 'INVOICE',
        debit: 5000,
        ref_id: invoice.id,
        ref_no: `INV-WITHIN-${Date.now()}`,
        running_balance: 50000,
      });

      // Update customer AR balance
      await knex('customers')
        .where('id', customerId)
        .update({ current_ar_balance: 50000 });

      const result = await creditService.evaluate(customerId, '1000.00');

      expect(result.status).toBe('OK');
      // Allow 1-day tolerance for day boundary calculations (10 or 11 days)
      expect(result.oldestOverdueDays).toBeGreaterThanOrEqual(9);
      expect(result.oldestOverdueDays).toBeLessThanOrEqual(11);
      expect(result.reason).toBeUndefined();

      // Cleanup verified in beforeEach
    });
  });

  /**
   * Test Case 3: Overdue beyond max_overdue_days
   * Customer has invoices that are overdue beyond their max_overdue_days threshold
   * Expected: Credit status HOLD
   */
  describe('Scenario 3: Overdue beyond max_overdue_days', () => {
    it('should return HOLD when overdue invoices exceed max_overdue_days', async () => {
      // Create test customer
      const [customer] = await knex('customers')
        .insert({
          customer_code: `CUST-TEST-003-${Date.now()}`,
          business_name: 'Beyond Tolerance Customer',
          contact_person: 'Test Contact',
          phone: '+919876543230',
          billing_address: '123 Test St',
          state_code: '29',
          credit_limit: 100000,
          credit_days: 30,
          max_overdue_days: 15,
          is_active: true,
          default_site_id: siteId,
          current_ar_balance: 1000,
        })
        .returning('id');

      const customerId = String(customer.id);

      // Create invoice that is 20 days overdue (beyond 15-day tolerance)
      const today = new Date();
      const invoiceDate = new Date(today);
      invoiceDate.setDate(invoiceDate.getDate() - 20);

      const [invoice] = await knex('invoices')
        .insert({
          customer_id: customerId,
          site_id: siteId,
          invoice_no: `INV-BEHIND-${Date.now()}`,
          invoice_date: invoiceDate,
          due_date: invoiceDate,
          total_amount: 1000,
          paid_amount: 0,
          balance_due: 1000,
          taxable_amount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          status: 'UNPAID',
        })
        .returning('id');

      // Add ledger entry
      await knex('customer_ledger_entries').insert({
        site_id: siteId,
        customer_id: customerId,
        entry_type: 'INVOICE',
        debit: 1000,
        ref_id: invoice.id,
        ref_no: `INV-BEHIND-${Date.now()}`,
        running_balance: 1000,
      });

      const result = await creditService.evaluate(customerId, '500.00');

      expect(result.status).toBe('HOLD');
      // Allow 1-day tolerance for day boundary calculations
      expect(result.oldestOverdueDays).toBeGreaterThanOrEqual(19);
      expect(result.oldestOverdueDays).toBeLessThanOrEqual(21);
      expect(result.reason).toContain('overdue');
    });

    it('should calculate oldestOverdueDays from multiple invoices', async () => {
      // Create test customer
      const [customer] = await knex('customers')
        .insert({
          customer_code: `CUST-TEST-004-${Date.now()}`,
          business_name: 'Multi-Invoice Customer',
          contact_person: 'Test Contact',
          phone: '+919876543240',
          billing_address: '123 Test St',
          state_code: '29',
          credit_limit: 100000,
          credit_days: 30,
          max_overdue_days: 15,
          is_active: true,
          default_site_id: siteId,
          current_ar_balance: 2000,
        })
        .returning('id');

      const customerId = String(customer.id);
      const today = new Date();

      // Invoice 1: 25 days overdue
      const invoiceDate1 = new Date(today);
      invoiceDate1.setDate(invoiceDate1.getDate() - 25);

      const [inv1] = await knex('invoices')
        .insert({
          customer_id: customerId,
          site_id: siteId,
          invoice_no: `INV-1-${Date.now()}`,
          invoice_date: invoiceDate1,
          due_date: invoiceDate1,
          total_amount: 1000,
          paid_amount: 0,
          balance_due: 1000,
          taxable_amount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          status: 'UNPAID',
        })
        .returning('id');

      // Invoice 2: 10 days overdue
      const invoiceDate2 = new Date(today);
      invoiceDate2.setDate(invoiceDate2.getDate() - 10);

      const [inv2] = await knex('invoices')
        .insert({
          customer_id: customerId,
          site_id: siteId,
          invoice_no: `INV-2-${Date.now()}`,
          invoice_date: invoiceDate2,
          due_date: invoiceDate2,
          total_amount: 1000,
          paid_amount: 0,
          balance_due: 1000,
          taxable_amount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          status: 'UNPAID',
        })
        .returning('id');

      // Add ledger entries
      await knex('customer_ledger_entries').insert([
        {
          site_id: siteId,
          customer_id: customerId,
          entry_type: 'INVOICE',
          debit: 1000,
          ref_id: inv1.id,
          ref_no: `INV-1-${Date.now()}`,
          running_balance: 1000,
        },
        {
          site_id: siteId,
          customer_id: customerId,
          entry_type: 'INVOICE',
          debit: 1000,
          ref_id: inv2.id,
          ref_no: `INV-2-${Date.now()}`,
          running_balance: 2000,
        },
      ]);

      const result = await creditService.evaluate(customerId, '1000.00');

      expect(result.status).toBe('HOLD');
      // Oldest overdue should be 25 days (the most overdue invoice)
      // Allow 1-day tolerance for day boundary calculations
      expect(result.oldestOverdueDays).toBeGreaterThanOrEqual(24);
      expect(result.oldestOverdueDays).toBeLessThanOrEqual(26);
    });
  });

  /**
   * Test Case 4: Inactive customer
   * Customer has is_active = false
   * Expected: Credit status HOLD, reason = "Customer is inactive"
   */
  describe('Scenario 4: Inactive customer', () => {
    it('should return HOLD for inactive customer regardless of credit balance', async () => {
      const customerId = inactiveCustomerId;

      const result = await creditService.evaluate(customerId, '100.00');

      expect(result.status).toBe('HOLD');
      expect(result.reason).toBe('Customer is inactive');
      expect(result.oldestOverdueDays).toBeNull();
    });

    it('should reject order even with zero balance for inactive customer', async () => {
      const customerId = inactiveCustomerId;

      // Verify no credit issues, but still rejected
      const result = await creditService.evaluate(customerId, '1.00');

      expect(result.status).toBe('HOLD');
      expect(result.currentArBalance).toBe('0.00');
    });
  });

  /**
   * Test Case 5: Credit limit breach plus overdue combination
   * Customer has both credit limit issues AND overdue invoices
   * Expected: HOLD with appropriate reason
   */
  describe('Scenario 5: Credit limit breach + overdue combination', () => {
    it('should return HOLD for credit limit breach even with overdue within tolerance', async () => {
      // Create test customer with low credit limit
      const [customer] = await knex('customers')
        .insert({
          customer_code: `CUST-TEST-005-${Date.now()}`,
          business_name: 'Combo Customer 1',
          contact_person: 'Test Contact',
          phone: '+919876543250',
          billing_address: '123 Test St',
          state_code: '29',
          credit_limit: 500, // Very low limit
          credit_days: 30,
          max_overdue_days: 15,
          is_active: true,
          default_site_id: siteId,
          current_ar_balance: 400, // High balance
        })
        .returning('id');

      const customerId = String(customer.id);

      // Create invoice 5 days overdue (within tolerance)
      const today = new Date();
      const invoiceDate = new Date(today);
      invoiceDate.setDate(invoiceDate.getDate() - 5);

      await knex('invoices').insert({
        customer_id: customerId,
        site_id: siteId,
        invoice_no: `INV-COMBO-${Date.now()}`,
        invoice_date: invoiceDate,
        due_date: invoiceDate,
        total_amount: 400,
        paid_amount: 0,
        balance_due: 400,
        taxable_amount: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        status: 'UNPAID',
      });

      // Update AR balance
      await knex('customers')
        .where('id', customerId)
        .update({ current_ar_balance: 400 });

      // Attempt to place order worth 200 - would exceed limit (400 + 200 = 600 > 500)
      const result = await creditService.evaluate(customerId, '200.00');

      expect(result.status).toBe('HOLD');
      // Credit limit breach should take precedence
      expect(result.reason).toContain('exceed credit limit');
    });

    it('should return HOLD for overdue beyond tolerance with available credit', async () => {
      // Create test customer
      const [customer] = await knex('customers')
        .insert({
          customer_code: `CUST-TEST-006-${Date.now()}`,
          business_name: 'Combo Customer 2',
          contact_person: 'Test Contact',
          phone: '+919876543260',
          billing_address: '123 Test St',
          state_code: '29',
          credit_limit: 10000,
          credit_days: 30,
          max_overdue_days: 15,
          is_active: true,
          default_site_id: siteId,
          current_ar_balance: 1000,
        })
        .returning('id');

      const customerId = String(customer.id);

      // Create invoice 25 days overdue (beyond tolerance)
      const today = new Date();
      const invoiceDate = new Date(today);
      invoiceDate.setDate(invoiceDate.getDate() - 25);

      await knex('invoices').insert({
        customer_id: customerId,
        site_id: siteId,
        invoice_no: `INV-OVER-${Date.now()}`,
        invoice_date: invoiceDate,
        due_date: invoiceDate,
        total_amount: 1000,
        paid_amount: 0,
        balance_due: 1000,
        taxable_amount: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        status: 'UNPAID',
      });

      // Update AR balance
      await knex('customers')
        .where('id', customerId)
        .update({ current_ar_balance: 1000 });

      // Customer has credit, but overdue is the issue
      const result = await creditService.evaluate(customerId, '100.00');

      expect(result.status).toBe('HOLD');
      expect(result.reason).toContain('overdue');
      // Allow 1-day tolerance for day boundary calculations
      expect(result.oldestOverdueDays).toBeGreaterThanOrEqual(24);
      expect(result.oldestOverdueDays).toBeLessThanOrEqual(26);
    });
  });

  /**
   * Additional edge cases
   */
  describe('Edge cases', () => {
    it('should handle customer with paid invoices only (zero balance due)', async () => {
      const [customer] = await knex('customers')
        .insert({
          customer_code: `CUST-TEST-007-${Date.now()}`,
          business_name: 'Paid Customer',
          contact_person: 'Test Contact',
          phone: '+919876543270',
          billing_address: '123 Test St',
          state_code: '29',
          credit_limit: 100000,
          credit_days: 30,
          max_overdue_days: 15,
          is_active: true,
          default_site_id: siteId,
          current_ar_balance: 0,
        })
        .returning('id');

      const customerId = String(customer.id);
      const customerCode = `CUST-TEST-007-${Date.now()}`;

      // Create invoice and immediately pay it (due date in future, so not overdue)
      const today = new Date();
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 30);

      const [invoice] = await knex('invoices')
        .insert({
          customer_id: customerId,
          site_id: siteId,
          invoice_no: `INV-PAID-${Date.now()}`,
          invoice_date: today,
          due_date: dueDate,
          total_amount: 500,
          paid_amount: 500, // Paid in full
          balance_due: 0,
          taxable_amount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          status: 'PAID',
        })
        .returning('id');

      const result = await creditService.evaluate(customerId, '100.00');

      expect(result.status).toBe('OK');

      // Cleanup - use customer_code to identify our test customer
      await knex('invoices').where('customer_id', customerId).del();
      await knex('customers').where('id', customerId).del();
    });

    it('should calculate days overdue correctly for invoice paid partially', async () => {
      const [customer] = await knex('customers')
        .insert({
          customer_code: `CUST-TEST-008-${Date.now()}`,
          business_name: 'Partial Payment Customer',
          contact_person: 'Test Contact',
          phone: '+919876543280',
          billing_address: '123 Test St',
          state_code: '29',
          credit_limit: 100000,
          credit_days: 30,
          max_overdue_days: 15,
          is_active: true,
          default_site_id: siteId,
          current_ar_balance: 500,
        })
        .returning('id');

      const customerId = String(customer.id);

      // Create overdue invoice with partial payment
      const today = new Date();
      const invoiceDate = new Date(today);
      invoiceDate.setDate(invoiceDate.getDate() - 20);

      const [invoice] = await knex('invoices')
        .insert({
          customer_id: customerId,
          site_id: siteId,
          invoice_no: `INV-PARTIAL-${Date.now()}`,
          invoice_date: invoiceDate,
          due_date: invoiceDate,
          total_amount: 1000,
          paid_amount: 500, // 50% paid
          balance_due: 500,
          taxable_amount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          status: 'PARTIAL',
        })
        .returning('id');

      // Add ledger entry
      await knex('customer_ledger_entries').insert({
        site_id: siteId,
        customer_id: customerId,
        entry_type: 'INVOICE',
        debit: 1000,
        ref_id: invoice.id,
        ref_no: `INV-PARTIAL-${Date.now()}`,
        running_balance: 500,
      });

      const result = await creditService.evaluate(customerId, '100.00');

      // Overdue beyond tolerance → HOLD
      expect(result.status).toBe('HOLD');
      // Allow 1-day tolerance for day boundary calculations
      expect(result.oldestOverdueDays).toBeGreaterThanOrEqual(20);
      expect(result.oldestOverdueDays).toBeLessThanOrEqual(22);

      // Cleanup
      await knex('invoices').where('customer_id', customerId).del();
      await knex('customer_ledger_entries')
        .where('customer_id', customerId)
        .del();
      await knex('customers').where('id', customerId).del();
    });
  });
});
