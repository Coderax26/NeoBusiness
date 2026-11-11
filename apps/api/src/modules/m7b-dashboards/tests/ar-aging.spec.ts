import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import type { Knex } from 'knex';
import { createKnex } from '../../../shared/database/knex-instance.js';
import { assertTestDatabase } from '../../../shared/database/test-db-guard.js';
import { AnalyticsService } from '../analytics.service.js';

describe('AnalyticsService — Workstream D AR Aging Tests', () => {
  let knex: Knex;
  let service: AnalyticsService;

  let siteAId: string;
  let siteBId: string;
  let userId: string;

  beforeAll(async () => {
    knex = await createKnex();
    await assertTestDatabase(knex);
    service = new AnalyticsService(knex);
  }, 30000);

  afterAll(async () => {
    await knex?.destroy();
  });

  beforeEach(async () => {
    siteAId = uuidv4();
    siteBId = uuidv4();
    userId = uuidv4();

    await knex('sites').insert([
      {
        id: siteAId,
        name: 'Aging Site A',
        site_type: 'WAREHOUSE',
        address: '100 Site A Road',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: siteBId,
        name: 'Aging Site B',
        site_type: 'WAREHOUSE',
        address: '200 Site B Road',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);

    await knex('users').insert({
      id: userId,
      assigned_site_id: siteAId,
      role: 'OWNER',
      full_name: 'AR Manager',
      phone: `+91986${Date.now().toString().slice(-7)}`,
      pin_hash: 'hash',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  it('1 & 2: does not sum cumulative ledger snapshots — reports true invoice balance', async () => {
    const customerId = uuidv4();
    await knex('customers').insert({
      id: customerId,
      customer_code: `CUST-${Date.now().toString().slice(-4)}`,
      business_name: 'Cumulative Snapshot Customer',
      contact_person: 'Ramesh',
      phone: `+91985${Date.now().toString().slice(-7)}`,
      billing_address: '100 Snapshot Way',
      state_code: '33',
      default_site_id: siteAId,
      credit_limit: '100000.00',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const invoiceId = uuidv4();
    await knex('invoices').insert({
      id: invoiceId,
      site_id: siteAId,
      customer_id: customerId,
      invoice_no: `INV-TEST-01-${Date.now()}`,
      invoice_date: new Date(Date.now() - 10 * 86400000)
        .toISOString()
        .split('T')[0],
      due_date: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0], // 2 days ago (0-7 bucket)
      total_amount: '50000.00',
      paid_amount: '10000.00',
      balance_due: '40000.00',
      status: 'PARTIALLY_PAID',
      created_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Simulate 3 ledger entries with cumulative running balances:
    // Entry 1: invoice debit 50,000 -> running_balance = 50,000
    // Entry 2: payment credit 10,000 -> running_balance = 40,000
    // Entry 3: note/memo -> running_balance = 40,000
    // The previous buggy query would do 50,000 + 40,000 + 40,000 = 130,000!
    await knex('customer_ledger_entries').insert([
      {
        id: uuidv4(),
        site_id: siteAId,
        customer_id: customerId,
        entry_type: 'INVOICE',
        debit: '50000.00',
        credit: '0.00',
        ref_id: invoiceId,
        running_balance: '50000.00',
        posted_at: new Date(Date.now() - 10 * 86400000),
      },
      {
        id: uuidv4(),
        site_id: siteAId,
        customer_id: customerId,
        entry_type: 'COLLECTION',
        debit: '0.00',
        credit: '10000.00',
        ref_id: uuidv4(),
        running_balance: '40000.00',
        posted_at: new Date(Date.now() - 5 * 86400000),
      },
      {
        id: uuidv4(),
        site_id: siteAId,
        customer_id: customerId,
        entry_type: 'ADJUSTMENT',
        debit: '0.00',
        credit: '0.00',
        ref_id: uuidv4(),
        running_balance: '40000.00',
        posted_at: new Date(Date.now() - 1 * 86400000),
      },
    ]);

    const aging = await service.getARAging(siteAId);
    const row = aging.find((r) => r.customerId === customerId);

    expect(row).toBeDefined();
    // Must be 40000, NOT 130000!
    expect(Number(row!.totalOutstanding)).toBe(40000.0);
    expect(Number(row!.aging_0_7)).toBe(40000.0);
    expect(Number(row!.aging_8_15)).toBe(0.0);
    expect(Number(row!.aging_16_30)).toBe(0.0);
    expect(Number(row!.aging_30_plus)).toBe(0.0);
  });

  it('3, 4, 6: distributes multiple invoices across correct aging buckets', async () => {
    const customerId = uuidv4();
    await knex('customers').insert({
      id: customerId,
      customer_code: `CUST-MULTI-${Date.now().toString().slice(-4)}`,
      business_name: 'Multi Invoice Customer',
      contact_person: 'Suresh',
      phone: `+91984${Date.now().toString().slice(-7)}`,
      billing_address: '200 Multi Invoice St',
      state_code: '33',
      default_site_id: siteAId,
      credit_limit: '500000.00',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Invoice 1: 0-7 days (3 days overdue) -> 10,000
    await knex('invoices').insert({
      id: uuidv4(),
      site_id: siteAId,
      customer_id: customerId,
      invoice_no: `INV-B1-${Date.now()}`,
      due_date: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
      total_amount: '10000.00',
      paid_amount: '0.00',
      balance_due: '10000.00',
      status: 'UNPAID',
      created_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Invoice 2: 8-15 days (10 days overdue) -> 20,000
    await knex('invoices').insert({
      id: uuidv4(),
      site_id: siteAId,
      customer_id: customerId,
      invoice_no: `INV-B2-${Date.now()}`,
      due_date: new Date(Date.now() - 10 * 86400000)
        .toISOString()
        .split('T')[0],
      total_amount: '20000.00',
      paid_amount: '0.00',
      balance_due: '20000.00',
      status: 'UNPAID',
      created_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Invoice 3: 16-30 days (20 days overdue) -> 30,000
    await knex('invoices').insert({
      id: uuidv4(),
      site_id: siteAId,
      customer_id: customerId,
      invoice_no: `INV-B3-${Date.now()}`,
      due_date: new Date(Date.now() - 20 * 86400000)
        .toISOString()
        .split('T')[0],
      total_amount: '30000.00',
      paid_amount: '0.00',
      balance_due: '30000.00',
      status: 'UNPAID',
      created_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Invoice 4: 30+ days (45 days overdue) -> 40,000
    await knex('invoices').insert({
      id: uuidv4(),
      site_id: siteAId,
      customer_id: customerId,
      invoice_no: `INV-B4-${Date.now()}`,
      due_date: new Date(Date.now() - 45 * 86400000)
        .toISOString()
        .split('T')[0],
      total_amount: '40000.00',
      paid_amount: '0.00',
      balance_due: '40000.00',
      status: 'UNPAID',
      created_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const aging = await service.getARAging(siteAId);
    const row = aging.find((r) => r.customerId === customerId);

    expect(row).toBeDefined();
    expect(Number(row!.totalOutstanding)).toBe(100000.0);
    expect(Number(row!.aging_0_7)).toBe(10000.0);
    expect(Number(row!.aging_8_15)).toBe(20000.0);
    expect(Number(row!.aging_16_30)).toBe(30000.0);
    expect(Number(row!.aging_30_plus)).toBe(40000.0);
  });

  it('7: enforces site isolation — Site A queries never include Site B invoices', async () => {
    const custBId = uuidv4();
    await knex('customers').insert({
      id: custBId,
      customer_code: `CUST-SITEB-${Date.now().toString().slice(-4)}`,
      business_name: 'Site B Customer',
      contact_person: 'Ganesh',
      phone: `+91983${Date.now().toString().slice(-7)}`,
      billing_address: '300 Site B St',
      state_code: '33',
      default_site_id: siteBId,
      credit_limit: '100000.00',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await knex('invoices').insert({
      id: uuidv4(),
      site_id: siteBId,
      customer_id: custBId,
      invoice_no: `INV-SITEB-${Date.now()}`,
      due_date: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
      total_amount: '75000.00',
      paid_amount: '0.00',
      balance_due: '75000.00',
      status: 'UNPAID',
      created_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const siteAAging = await service.getARAging(siteAId);
    expect(siteAAging.find((r) => r.customerId === custBId)).toBeUndefined();

    const siteBAging = await service.getARAging(siteBId);
    const siteBRow = siteBAging.find((r) => r.customerId === custBId);
    expect(siteBRow).toBeDefined();
    expect(Number(siteBRow!.totalOutstanding)).toBe(75000.0);
  });

  it('8: excludes fully paid or zero-balance customers', async () => {
    const paidCustId = uuidv4();
    await knex('customers').insert({
      id: paidCustId,
      customer_code: `CUST-PAID-${Date.now().toString().slice(-4)}`,
      business_name: 'Fully Paid Customer',
      contact_person: 'Pooja',
      phone: `+91982${Date.now().toString().slice(-7)}`,
      billing_address: '400 Paid Way',
      state_code: '33',
      default_site_id: siteAId,
      credit_limit: '100000.00',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await knex('invoices').insert({
      id: uuidv4(),
      site_id: siteAId,
      customer_id: paidCustId,
      invoice_no: `INV-PAID-${Date.now()}`,
      due_date: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
      total_amount: '25000.00',
      paid_amount: '25000.00',
      balance_due: '0.00',
      status: 'PAID',
      created_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const aging = await service.getARAging(siteAId);
    expect(aging.find((r) => r.customerId === paidCustId)).toBeUndefined();
  });
});
