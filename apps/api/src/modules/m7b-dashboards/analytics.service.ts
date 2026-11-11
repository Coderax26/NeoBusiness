import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Money } from '../../shared/utils/money.util.js';
import {
  ANALYTICS_PORT,
  type AnalyticsPort,
  type CustomerProfitabilityResponse,
  type SupplierScorecardResponse,
  type YieldTrendResponse,
  type ARAgingResponse,
} from '../../shared/ports/ports.interface.js';

/**
 * AnalyticsService — Strategic analytics queries for Owner
 *
 * All queries read from materialized views (mv_customer_profitability, mv_supplier_scorecard,
 * mv_yield_trend, mv_ar_aging) for fast analytical queries. RLS is enforced via the middleware.
 */

@Injectable()
export class AnalyticsService implements AnalyticsPort {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  /**
   * AC3: Customer Profitability Analytics
   * Returns customer profitability with revenue, gross profit, margin %, ranked by margin
   * Cached via mv_customer_profitability (refreshed nightly)
   */
  async getCustomerProfitability(
    siteId: string,
    dateRange: { from: string; to: string },
  ): Promise<CustomerProfitabilityResponse[]> {
    // Validate date format
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dateRange.from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateRange.to)
    ) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }

    // Query with date filter (materialized view doesn't have date filter, so we query base tables)
    const results = await this.knex.raw(
      `
      SELECT
        c.id as customer_id,
        c.business_name,
        c.customer_code,
        COUNT(DISTINCT so.id) as order_count,
        SUM(so.total_amount)::numeric(14,2) as revenue,
        (SUM(so.total_amount) - COALESCE(SUM(so_cost), 0))::numeric(14,2) as gross_profit,
        CASE
          WHEN SUM(so.total_amount) > 0
          THEN ROUND((SUM(so.total_amount) - COALESCE(SUM(so_cost), 0)) / SUM(so.total_amount) * 100, 2)
          ELSE 0
        END as gross_margin_pct,
        MAX(so.created_at)::date as last_order_date
      FROM customers c
      LEFT JOIN sales_orders so ON so.customer_id = c.id
      LEFT JOIN LATERAL (
        SELECT SUM(sol.ordered_qty * sol.floor_price_snapshot) AS so_cost
        FROM sales_order_lines sol WHERE sol.order_id = so.id
      ) sc ON true
      WHERE so.order_status NOT IN ('CANCELLED')
        AND so.created_at >= ?::date
        AND so.created_at < (?::date + INTERVAL '1 day')
        AND c.default_site_id = ?
      GROUP BY c.id, c.business_name, c.customer_code
      ORDER BY gross_margin_pct DESC
    `,
      [dateRange.from, dateRange.to, siteId],
    );

    return results.rows.map((row: any) => ({
      customerId: String(row.customer_id),
      businessName: row.business_name,
      customerCode: row.customer_code,
      orderCount: Number(row.order_count),
      revenue: String(row.revenue),
      grossProfit: String(row.gross_profit),
      grossMarginPct: String(row.gross_margin_pct),
      lastOrderDate: row.last_order_date ? String(row.last_order_date) : null,
    }));
  }

  /**
   * AC4: Supplier Scorecard
   * Returns fill rate and avg price variance %
   * Cached via mv_supplier_scorecard (refreshed nightly)
   */
  async getSupplierScorecard(
    siteId: string,
    dateRange: { from: string; to: string },
  ): Promise<SupplierScorecardResponse[]> {
    // Validate date format
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dateRange.from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateRange.to)
    ) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }

    // Query with date filter (materialized view doesn't have date filter, so we query base tables)
    const results = await this.knex.raw(
      `
      SELECT
        s.id as supplier_id,
        s.company_name,
        s.supplier_code,
        COUNT(DISTINCT po.id) as po_count,
        COUNT(DISTINCT gr.id) as grn_count,
        COALESCE(SUM(grl.received_qty) / NULLIF(SUM(pol.confirmed_qty), 0), 0) as fill_rate,
        COALESCE(AVG(pol.price_variance_pct), 0) as avg_price_variance_pct,
        MAX(gr.received_at)::date as last_receipt_date
      FROM suppliers s
      LEFT JOIN purchase_orders po ON po.supplier_id = s.id
      LEFT JOIN purchase_order_lines pol ON pol.po_id = po.id
      LEFT JOIN goods_receipts gr ON gr.po_id = po.id
      LEFT JOIN goods_receipt_lines grl ON grl.grn_id = gr.id AND grl.item_id = pol.item_id
      WHERE po.po_status NOT IN ('CANCELLED', 'DRAFT')
        AND po.created_at >= ?::date
        AND po.created_at < (?::date + INTERVAL '1 day')
        AND po.receiving_site_id = ?
      GROUP BY s.id, s.company_name, s.supplier_code
      ORDER BY fill_rate DESC
    `,
      [dateRange.from, dateRange.to, siteId],
    );

    return results.rows.map((row: any) => ({
      supplierId: String(row.supplier_id),
      companyName: row.company_name,
      supplierCode: row.supplier_code,
      poCount: Number(row.po_count),
      grnCount: Number(row.grn_count),
      fillRate: Number(row.fill_rate),
      avgPriceVariancePct: Number(row.avg_price_variance_pct),
      lastReceiptDate: row.last_receipt_date
        ? String(row.last_receipt_date)
        : null,
    }));
  }

  /**
   * AC5: Factory Yield & Wastage Trend
   * Returns weekly yield % and wastage %
   * Cached via mv_yield_trend (refreshed nightly)
   */
  async getYieldTrend(
    siteId: string,
    dateRange: { from: string; to: string },
  ): Promise<YieldTrendResponse[]> {
    // Validate date format
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dateRange.from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateRange.to)
    ) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }

    // Query with date filter
    const results = await this.knex.raw(
      `
      SELECT
        wo.site_id,
        DATE_TRUNC('week', wo.created_at)::date AS week_start,
        SUM(wo.planned_qty)::numeric(14,3) AS total_planned,
        SUM(woo.actual_qty)::numeric(14,3) AS total_output,
        CASE
          WHEN SUM(wo.planned_qty) > 0
          THEN ROUND(SUM(woo.actual_qty) / SUM(wo.planned_qty) * 100, 2)
          ELSE 0
        END AS yield_pct,
        SUM(wr.qty)::numeric(14,3) AS total_wastage,
        CASE
          WHEN SUM(woo.actual_qty) > 0
          THEN ROUND(SUM(wr.qty) / SUM(woo.actual_qty) * 100, 2)
          ELSE 0
        END AS wastage_pct
      FROM production_work_orders wo
      LEFT JOIN work_order_outputs woo ON woo.work_order_id = wo.id
      LEFT JOIN wastage_records wr ON wr.work_order_id = wo.id
      WHERE wo.status = 'COMPLETED'
        AND wo.created_at >= ?::date
        AND wo.created_at < (?::date + INTERVAL '1 day')
        AND wo.site_id = ?
      GROUP BY wo.site_id, DATE_TRUNC('week', wo.created_at)
      ORDER BY week_start
    `,
      [dateRange.from, dateRange.to, siteId],
    );

    return results.rows.map((row: any) => ({
      siteId: String(row.site_id),
      weekStart: String(row.week_start),
      totalPlanned: String(row.total_planned),
      totalOutput: String(row.total_output),
      yieldPct: Number(row.yield_pct),
      totalWastage: String(row.total_wastage),
      wastagePct: Number(row.wastage_pct),
    }));
  }

  /**
   * AC6: AR Aging
   * Returns 4 aging buckets: 0-7, 8-15, 16-30, 30+
   * Cached via mv_ar_aging (refreshed nightly)
   */
  /**
   * AC6: AR Aging
   * Returns 4 aging buckets: 0-7, 8-15, 16-30, 30+
   *
   * Bucket definitions (due days from CURRENT_DATE):
   * - 0-7 days: due_date >= CURRENT_DATE - 7 days
   * - 8-15 days: due_date < CURRENT_DATE - 7 days AND due_date >= CURRENT_DATE - 15 days
   * - 16-30 days: due_date < CURRENT_DATE - 15 days AND due_date >= CURRENT_DATE - 30 days
   * - 30+ days: due_date < CURRENT_DATE - 30 days
   */
  async getARAging(siteId: string): Promise<ARAgingResponse[]> {
    const results = await this.knex.raw(
      `
      SELECT
        c.id as customer_id,
        c.business_name,
        c.customer_code,
        COALESCE(SUM(i.balance_due), 0)::numeric(14,2) as total_outstanding,
        COALESCE(SUM(i.balance_due) FILTER (
          WHERE i.due_date >= CURRENT_DATE - INTERVAL '7 days'
        ), 0)::numeric(14,2) as aging_0_7,
        COALESCE(SUM(i.balance_due) FILTER (
          WHERE i.due_date < CURRENT_DATE - INTERVAL '7 days'
          AND i.due_date >= CURRENT_DATE - INTERVAL '15 days'
        ), 0)::numeric(14,2) as aging_8_15,
        COALESCE(SUM(i.balance_due) FILTER (
          WHERE i.due_date < CURRENT_DATE - INTERVAL '15 days'
          AND i.due_date >= CURRENT_DATE - INTERVAL '30 days'
        ), 0)::numeric(14,2) as aging_16_30,
        COALESCE(SUM(i.balance_due) FILTER (
          WHERE i.due_date < CURRENT_DATE - INTERVAL '30 days'
        ), 0)::numeric(14,2) as aging_30_plus
      FROM customers c
      JOIN invoices i ON i.customer_id = c.id
      WHERE i.balance_due > 0
        AND i.status NOT IN ('CANCELLED', 'PAID')
        AND c.default_site_id = ?
      GROUP BY c.id, c.business_name, c.customer_code
      HAVING COALESCE(SUM(i.balance_due), 0) > 0
      ORDER BY total_outstanding DESC
    `,
      [siteId],
    );

    return results.rows.map((row: any) => ({
      customerId: String(row.customer_id),
      businessName: row.business_name,
      customerCode: row.customer_code,
      totalOutstanding: String(row.total_outstanding),
      aging_0_7: String(row.aging_0_7),
      aging_8_15: String(row.aging_8_15),
      aging_16_30: String(row.aging_16_30),
      aging_30_plus: String(row.aging_30_plus),
    }));
  }
}
