import { Injectable } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';

@Injectable()
export class ReportsService {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  async getSalesRegister(filters: {
    siteId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(filters.limit ?? 100, 500);
    const offset = filters.offset ?? 0;

    let query = this.knex('invoices as ti')
      .leftJoin('customers as c', 'ti.customer_id', 'c.id')
      .leftJoin('sites as s', 'ti.site_id', 's.id')
      .whereNot('ti.status', 'CANCELLED')
      .select(
        'ti.id',
        'ti.invoice_no',
        'ti.invoice_date',
        'ti.due_date',
        'ti.status as payment_status',
        'ti.taxable_amount as taxable_amount',
        'ti.cgst as cgst_amount',
        'ti.sgst as sgst_amount',
        'ti.igst as igst_amount',
        'ti.total_amount',
        'c.business_name as customer_name',
        'c.gstin as customer_gstin',
        's.name as site_name',
      )
      .limit(limit)
      .offset(offset)
      .orderBy('ti.invoice_date', 'desc');

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (filters.siteId && uuidRe.test(filters.siteId)) query = query.where('ti.site_id', filters.siteId);
    if (filters.dateFrom) query = query.andWhere('ti.invoice_date', '>=', filters.dateFrom);
    if (filters.dateTo) query = query.andWhere('ti.invoice_date', '<=', filters.dateTo);

    const rows = await query;
    return rows;
  }

  async getPurchaseRegister(filters: {
    siteId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(filters.limit ?? 100, 500);
    const offset = filters.offset ?? 0;

    let query = this.knex('supplier_bills as sb')
      .leftJoin('suppliers as s', 'sb.supplier_id', 's.id')
      .select(
        'sb.id',
        'sb.bill_number',
        'sb.bill_date',
        'sb.due_date',
        'sb.status',
        'sb.three_way_status as match_status',
        'sb.subtotal as subtotal_amount',
        'sb.tax_total as tax_amount',
        'sb.total_amount',
        's.company_name as supplier_name',
        's.gstin as supplier_gstin',
      )
      .limit(limit)
      .offset(offset)
      .orderBy('sb.bill_date', 'desc');

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (filters.siteId && uuidRe.test(filters.siteId)) query = query.where('sb.site_id', filters.siteId);
    if (filters.dateFrom) query = query.andWhere('sb.bill_date', '>=', filters.dateFrom);
    if (filters.dateTo) query = query.andWhere('sb.bill_date', '<=', filters.dateTo);

    const rows = await query;
    return rows;
  }

  async getGstSummary(filters: {
    siteId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    let salesQuery = this.knex('invoices as ti')
      .leftJoin('customers as c', 'ti.customer_id', 'c.id')
      .whereNot('ti.status', 'CANCELLED')
      .select(
        this.knex.raw('COALESCE(SUM(ti.taxable_amount), 0) as total_taxable'),
        this.knex.raw('COALESCE(SUM(ti.cgst), 0) as total_cgst'),
        this.knex.raw('COALESCE(SUM(ti.sgst), 0) as total_sgst'),
        this.knex.raw('COALESCE(SUM(ti.igst), 0) as total_igst'),
        this.knex.raw('COALESCE(SUM(ti.total_amount), 0) as grand_total'),
        this.knex.raw(`
          COALESCE(SUM(CASE WHEN c.gstin IS NOT NULL AND c.gstin != '' THEN ti.taxable_amount ELSE 0 END), 0) as b2b_taxable
        `),
        this.knex.raw(`
          COALESCE(SUM(CASE WHEN c.gstin IS NULL OR c.gstin = '' THEN ti.taxable_amount ELSE 0 END), 0) as b2c_taxable
        `),
      );

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (filters.siteId && uuidRe.test(filters.siteId)) salesQuery = salesQuery.where('ti.site_id', filters.siteId);
    if (filters.dateFrom) salesQuery = salesQuery.andWhere('ti.invoice_date', '>=', filters.dateFrom);
    if (filters.dateTo) salesQuery = salesQuery.andWhere('ti.invoice_date', '<=', filters.dateTo);

    const [sales] = await salesQuery;

    let purchaseQuery = this.knex('supplier_bills as sb')
      .select(
        this.knex.raw('COALESCE(SUM(sb.subtotal), 0) as itc_taxable'),
        this.knex.raw('COALESCE(SUM(sb.tax_total), 0) as itc_tax'),
        this.knex.raw('COALESCE(SUM(sb.total_amount), 0) as itc_total'),
      );

    if (filters.siteId && uuidRe.test(filters.siteId)) purchaseQuery = purchaseQuery.where('sb.site_id', filters.siteId);
    if (filters.dateFrom) purchaseQuery = purchaseQuery.andWhere('sb.bill_date', '>=', filters.dateFrom);
    if (filters.dateTo) purchaseQuery = purchaseQuery.andWhere('sb.bill_date', '<=', filters.dateTo);

    const [purchases] = await purchaseQuery;

    return {
      outwardSupplies: sales,
      inwardSuppliesITC: purchases,
      period: {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      },
    };
  }

  async getPnlSnapshot(filters: {
    siteId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validSiteId =
      filters.siteId && uuidRe.test(filters.siteId) ? filters.siteId : undefined;

    let salesQuery = this.knex('invoices')
      .whereNot('status', 'CANCELLED')
      .select(this.knex.raw('COALESCE(SUM(total_amount), 0)::numeric(14,2) as total'));
    if (validSiteId) salesQuery = salesQuery.where('site_id', validSiteId);
    if (filters.dateFrom) salesQuery = salesQuery.where('invoice_date', '>=', filters.dateFrom);
    if (filters.dateTo) salesQuery = salesQuery.where('invoice_date', '<=', filters.dateTo);

    let cogsQuery = this.knex('supplier_bills')
      .whereNotIn('status', ['REJECTED', 'DRAFT'])
      .select(this.knex.raw('COALESCE(SUM(total_amount), 0)::numeric(14,2) as total'));
    if (validSiteId) cogsQuery = cogsQuery.where('site_id', validSiteId);
    if (filters.dateFrom) cogsQuery = cogsQuery.where('bill_date', '>=', filters.dateFrom);
    if (filters.dateTo) cogsQuery = cogsQuery.where('bill_date', '<=', filters.dateTo);

    let wastageQuery = this.knex('stock_adjustments as sa')
      .leftJoin('inventory_batches as ib', 'ib.id', 'sa.batch_id')
      .leftJoin('items as i', 'i.id', 'sa.item_id')
      .where('sa.status', 'APPROVED')
      .whereIn('sa.adjustment_type', ['WRITEOFF', 'EXPIRY_REMOVAL', 'SHRINKAGE'])
      .select(
        this.knex.raw(
          'COALESCE(SUM(sa.qty * COALESCE(ib.landed_cost_per_unit, i.latest_landed_cost, 0)), 0)::numeric(14,2) as total',
        ),
      );
    if (validSiteId) wastageQuery = wastageQuery.where('sa.site_id', validSiteId);
    if (filters.dateFrom) wastageQuery = wastageQuery.where('sa.created_at', '>=', filters.dateFrom);
    if (filters.dateTo) wastageQuery = wastageQuery.where('sa.created_at', '<=', `${filters.dateTo}T23:59:59Z`);

    let cashbookExpQuery = this.knex('cashbook_entries')
      .where('entry_type', 'like', 'EXPENSE%')
      .select(this.knex.raw('COALESCE(SUM(ABS(amount)), 0)::numeric(14,2) as total'));
    if (validSiteId) cashbookExpQuery = cashbookExpQuery.where('site_id', validSiteId);
    if (filters.dateFrom) cashbookExpQuery = cashbookExpQuery.where('date', '>=', filters.dateFrom);
    if (filters.dateTo) cashbookExpQuery = cashbookExpQuery.where('date', '<=', filters.dateTo);

    let tripExpQuery = this.knex('trip_expenses')
      .select(this.knex.raw('COALESCE(SUM(amount), 0)::numeric(14,2) as total'));
    if (validSiteId) tripExpQuery = tripExpQuery.where('site_id', validSiteId);
    if (filters.dateFrom) tripExpQuery = tripExpQuery.where('logged_at', '>=', filters.dateFrom);
    if (filters.dateTo) tripExpQuery = tripExpQuery.where('logged_at', '<=', `${filters.dateTo}T23:59:59Z`);

    const [salesRow, cogsRow, wastageRow, cashbookExpRow, tripExpRow] = await Promise.all([
      salesQuery.first(),
      cogsQuery.first(),
      wastageQuery.first().catch(() => ({ total: '0.00' })),
      cashbookExpQuery.first().catch(() => ({ total: '0.00' })),
      tripExpQuery.first().catch(() => ({ total: '0.00' })),
    ]);

    const sales = Number(salesRow?.total ?? 0);
    const cogs = Number(cogsRow?.total ?? 0);
    const wastage = Number((wastageRow as any)?.total ?? 0);
    const expenses =
      Number((cashbookExpRow as any)?.total ?? 0) +
      Number((tripExpRow as any)?.total ?? 0);
    const netProfit = sales - cogs - wastage - expenses;

    return {
      siteId: validSiteId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      salesInr: sales.toFixed(2),
      cogsInr: cogs.toFixed(2),
      wastageInr: wastage.toFixed(2),
      expensesInr: expenses.toFixed(2),
      netProfitInr: netProfit.toFixed(2),
    };
  }
}

