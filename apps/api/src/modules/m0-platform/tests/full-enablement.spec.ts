import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PdfGeneratorService } from '../../../shared/services/pdf-generator.service.js';
import { EventsController } from '../events.controller.js';
import { ExpenseService } from '../../m6-finance/expense.service.js';
import { ReportsService } from '../../m6-finance/reports.service.js';
import { firstValueFrom } from 'rxjs';

function createMockKnex(tables: Record<string, any[]> = {}) {
  const handler: any = (tableName: string) => {
    const rawTable = tableName.split(' ')[0];
    const rows = tables[rawTable] ?? [];
    const chain: any = {
      _where: {},
      _limit: null,
      _offset: 0,
      leftJoin() { return chain; },
      join() { return chain; },
      select() { return chain; },
      where(arg1: any, arg2?: any) {
        return chain;
      },
      andWhere(arg1: any, arg2?: any) {
        return chain;
      },
      orderBy() { return chain; },
      limit(n: number) { chain._limit = n; return chain; },
      offset(n: number) { chain._offset = n; return chain; },
      groupBy() { return chain; },
      count() { return chain; },
      first() { return Promise.resolve(rows[0] ?? null); },
      insert(data: any) {
        const toInsert = Array.isArray(data) ? data : [data];
        const inserted = toInsert.map((d, i) => ({ id: `gen-${i + 1}`, ...d }));
        return {
          returning: () => Promise.resolve(inserted),
          then: (cb: any) => Promise.resolve(inserted).then(cb),
        };
      },
      update(data: any) {
        return Promise.resolve(1);
      },
      then(cb: any) {
        return Promise.resolve(rows).then(cb);
      },
    };
    return chain;
  };
  handler.raw = (sql: string) => sql;
  return handler;
}

describe('M0 & M6 Full Enablement Integration Tests', () => {
  const pdfGen = new PdfGeneratorService();

  it('TC-BE-01: PdfGeneratorService produces valid PDF buffer for Orders', async () => {
    const buf = await pdfGen.generateOrder({
      orderNo: 'ORD-2026-001',
      orderDate: '2026-11-12',
      customerName: 'Hotel Shivneri',
      customerGstin: '27AAAAA0000A1Z5',
      siteName: 'Pune Central Factory',
      lines: [
        { itemName: 'Paneer Block 1kg', qty: '10', unitPrice: '380.00', lineTotal: '3800.00' },
        { itemName: 'Fresh Curd Bucket 10kg', qty: '5', unitPrice: '650.00', lineTotal: '3250.00' },
      ],
      totalAmount: '7050.00',
      status: 'CONFIRMED',
    });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.toString('utf8', 0, 5)).toBe('%PDF-');
  });

  it('TC-BE-02: PdfGeneratorService produces valid PDF buffer for Quotes', async () => {
    const buf = await pdfGen.generateQuote({
      quoteNo: 'QUO-2026-004',
      quoteDate: '2026-11-12',
      validUntil: '2026-11-19',
      customerName: 'Cafe Goodluck',
      siteName: 'Deccan Depot',
      lines: [
        { itemName: 'Processed Cheese 1kg', qty: '20', unitPrice: '450.00', lineTotal: '9000.00' },
      ],
      totalAmount: '9000.00',
    });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.toString('utf8', 0, 5)).toBe('%PDF-');
  });

  it('TC-BE-03: PdfGeneratorService produces valid PDF buffer for Purchase Orders', async () => {
    const buf = await pdfGen.generatePurchaseOrder({
      poNo: 'PO-2026-012',
      poDate: '2026-11-12',
      supplierName: 'Baramati Agro Milk Producer',
      supplierGstin: '27BBBBB1111B1Z2',
      siteName: 'Main Dairy Plant',
      expectedDelivery: '2026-11-13',
      lines: [
        { itemName: 'Raw Cow Milk', qty: '1000', unitPrice: '34.50', lineTotal: '34500.00' },
      ],
      totalAmount: '34500.00',
    });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.toString('utf8', 0, 5)).toBe('%PDF-');
  });

  it('TC-BE-04: PdfGeneratorService produces valid PDF buffer for Customer Statements', async () => {
    const buf = await pdfGen.generateCustomerStatement({
      customerName: 'Vaishali Restaurant',
      statementDate: '2026-11-12',
      currentBalance: '15400.00',
      entries: [
        { date: '2026-11-01', refNo: 'INV-001', type: 'INVOICE', debit: '12000.00', credit: '-', balance: '12000.00' },
        { date: '2026-11-05', refNo: 'REC-001', type: 'RECEIPT', debit: '-', credit: '10000.00', balance: '2000.00' },
        { date: '2026-11-10', refNo: 'INV-002', type: 'INVOICE', debit: '13400.00', credit: '-', balance: '15400.00' },
      ],
    });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.toString('utf8', 0, 5)).toBe('%PDF-');
  });

  it('TC-BE-05: EventsController emits initial connected SSE message', async () => {
    const controller = new EventsController();
    const req = { user: { id: 'u-1', role: 'OWNER', siteId: 's-1' } };
    const stream = controller.stream(req);

    const firstMsg: any = await firstValueFrom(stream);
    expect(firstMsg.data.type).toBe('connected');
    expect(firstMsg.data.userId).toBe('u-1');
    expect(firstMsg.data.role).toBe('OWNER');
    expect(firstMsg.data.siteId).toBe('s-1');
  });

  it('TC-BE-06: ExpenseService.createExpense validates amount and creates cashbook entry', async () => {
    const mockKnex = createMockKnex();
    const service = new ExpenseService(mockKnex as any);

    await expect(
      service.createExpense(
        { siteId: 's-1', category: 'OFFICE', amount: '-100' },
        'u-1',
      ),
    ).rejects.toThrow();

    const result = await service.createExpense(
      { siteId: 's-1', category: 'OFFICE_TEA', amount: '250.00', refNo: 'TEA-01' },
      'u-1',
    );

    expect(result.amount).toBe(-250);
    expect(result.entry_type).toBe('EXPENSE_OFFICE_TEA');
  });

  it('TC-BE-07: ExpenseService.listExpenses returns expenses', async () => {
    const mockKnex = createMockKnex({
      cashbook_entries: [
        { id: '1', site_id: 's-1', entry_type: 'EXPENSE_FUEL', amount: '-1500', date: '2026-11-12' },
      ],
    });
    const service = new ExpenseService(mockKnex as any);
    const list = await service.listExpenses({ siteId: 's-1', category: 'FUEL' });
    expect(list).toHaveLength(1);
  });

  it('TC-BE-08: ReportsService.getSalesRegister queries tax invoices', async () => {
    const mockKnex = createMockKnex({
      tax_invoices: [
        { id: 'inv-1', invoice_no: 'INV-101', taxable_amount: '10000.00', cgst_amount: '250.00', sgst_amount: '250.00', total_amount: '10500.00' },
      ],
    });
    const service = new ReportsService(mockKnex as any);
    const register = await service.getSalesRegister({ siteId: 's-1' });
    expect(register).toHaveLength(1);
    expect(register[0].invoice_no).toBe('INV-101');
  });

  it('TC-BE-09: ReportsService.getGstSummary returns outward and inward ITC summaries', async () => {
    const mockKnex = createMockKnex({
      tax_invoices: [
        { total_taxable: '100000', total_cgst: '2500', total_sgst: '2500', total_igst: '0', grand_total: '105000', b2b_taxable: '60000', b2c_taxable: '40000' },
      ],
      supplier_bills: [
        { itc_taxable: '80000', itc_tax: '4000', itc_total: '84000' },
      ],
    });
    const service = new ReportsService(mockKnex as any);
    const summary = await service.getGstSummary({ siteId: 's-1' });
    expect(summary.outwardSupplies).toBeTruthy();
    expect(summary.inwardSuppliesITC).toBeTruthy();
  });
});

