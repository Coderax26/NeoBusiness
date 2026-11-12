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

    let query = this.knex('tax_invoices as ti')
      .leftJoin('customers as c', 'ti.customer_id', 'c.id')
      .leftJoin('sites as s', 'ti.site_id', 's.id')
      .select(
        'ti.id',
        'ti.invoice_no',
        'ti.invoice_date',
        'ti.due_date',
        'ti.payment_status',
        'ti.taxable_amount',
        'ti.cgst_amount',
        'ti.sgst_amount',
        'ti.igst_amount',
        'ti.total_amount',
        'c.legal_name as customer_name',
        'c.gstin as customer_gstin',
        's.name as site_name',
      )
      .limit(limit)
      .offset(offset)
      .orderBy('ti.invoice_date', 'desc');

    if (filters.siteId) query = query.where('ti.site_id', filters.siteId);
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
        'sb.match_status',
        'sb.subtotal_amount',
        'sb.tax_amount',
        'sb.total_amount',
        's.legal_name as supplier_name',
        's.gstin as supplier_gstin',
      )
      .limit(limit)
      .offset(offset)
      .orderBy('sb.bill_date', 'desc');

    if (filters.siteId) query = query.where('sb.receiving_site_id', filters.siteId);
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
    let salesQuery = this.knex('tax_invoices as ti')
      .leftJoin('customers as c', 'ti.customer_id', 'c.id')
      .select(
        this.knex.raw('COALESCE(SUM(ti.taxable_amount), 0) as total_taxable'),
        this.knex.raw('COALESCE(SUM(ti.cgst_amount), 0) as total_cgst'),
        this.knex.raw('COALESCE(SUM(ti.sgst_amount), 0) as total_sgst'),
        this.knex.raw('COALESCE(SUM(ti.igst_amount), 0) as total_igst'),
        this.knex.raw('COALESCE(SUM(ti.total_amount), 0) as grand_total'),
        this.knex.raw(`
          COALESCE(SUM(CASE WHEN c.gstin IS NOT NULL AND c.gstin != '' THEN ti.taxable_amount ELSE 0 END), 0) as b2b_taxable
        `),
        this.knex.raw(`
          COALESCE(SUM(CASE WHEN c.gstin IS NULL OR c.gstin = '' THEN ti.taxable_amount ELSE 0 END), 0) as b2c_taxable
        `),
      );

    if (filters.siteId) salesQuery = salesQuery.where('ti.site_id', filters.siteId);
    if (filters.dateFrom) salesQuery = salesQuery.andWhere('ti.invoice_date', '>=', filters.dateFrom);
    if (filters.dateTo) salesQuery = salesQuery.andWhere('ti.invoice_date', '<=', filters.dateTo);

    const [sales] = await salesQuery;

    let purchaseQuery = this.knex('supplier_bills as sb')
      .select(
        this.knex.raw('COALESCE(SUM(sb.subtotal_amount), 0) as itc_taxable'),
        this.knex.raw('COALESCE(SUM(sb.tax_amount), 0) as itc_tax'),
        this.knex.raw('COALESCE(SUM(sb.total_amount), 0) as itc_total'),
      );

    if (filters.siteId) purchaseQuery = purchaseQuery.where('sb.receiving_site_id', filters.siteId);
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
}

