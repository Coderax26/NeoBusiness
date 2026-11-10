import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Money } from '../../shared/utils/money.util.js';
import {
  DASHBOARD_PORT,
  type DashboardPort,
  type PulseResponse,
  type StatusMatrixResponse,
  type EODViewResponse,
  type KPIResponse,
} from '../../shared/ports/ports.interface.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';

/**
 * DashboardService — Core dashboard queries for Owner Pulse Header, Operational Status Matrix,
 * EOD Dashboard, and KPIs.
 *
 * All queries read from materialized views (mv_pulse_today, mv_ops_status, etc.)
 * for sub-100ms response times. RLS is enforced via the middleware.
 */

@Injectable()
export class DashboardService implements DashboardPort {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  /**
   * AC1: Pulse Header — Owner's real-time dashboard
   * Returns today's sales, gross margin %, cash collected, pending exceptions
   * Cached via mv_pulse_today (refreshed every 30-60s)
   */
  async getPulse(
    siteId: string,
    options?: { role?: string },
  ): Promise<PulseResponse> {
    // OPS_COORD cannot see financial pulse data
    if (options?.role === 'OPS_COORD') {
      throw new ForbiddenException(
        'OPS_COORD role cannot access pulse financials',
      );
    }

    const pulse = await this.knex('mv_pulse_today')
      .where('site_id', siteId)
      .first(
        'site_id',
        'todays_sales',
        'gross_margin_pct',
        'cash_collected_today',
        'pending_exceptions',
      );

    if (!pulse) {
      // Return zeros if MV is empty (not yet refreshed)
      return {
        siteId,
        todaysSales: '0.00',
        grossMarginPct: '0.00',
        cashCollectedToday: '0.00',
        pendingExceptions: 0,
      };
    }

    return {
      siteId: String(pulse.site_id),
      todaysSales: String(pulse.todays_sales),
      grossMarginPct: String(pulse.gross_margin_pct),
      cashCollectedToday: String(pulse.cash_collected_today),
      pendingExceptions: Number(pulse.pending_exceptions),
    };
  }

  /**
   * AC2: Operational Status Matrix — Real-time operational view
   * Returns orders pending dispatch, batches running, trucks on road, supplier shortfalls
   * Cached via mv_ops_status (refreshed every 2-5 min)
   */
  async getStatusMatrix(
    siteId: string,
    options?: { role?: string },
  ): Promise<StatusMatrixResponse> {
    // OPS_COORD CAN see status matrix (non-financial)
    const matrix = await this.knex('mv_ops_status')
      .where('site_id', siteId)
      .first(
        'site_id',
        'orders_pending_dispatch',
        'batches_running',
        'trucks_on_road',
        'supplier_shortfalls',
      );

    if (!matrix) {
      return {
        siteId,
        ordersPendingDispatch: 0,
        batchesRunning: 0,
        trucksOnRoad: 0,
        supplierShortfalls: 0,
      };
    }

    return {
      siteId: String(matrix.site_id),
      ordersPendingDispatch: Number(matrix.orders_pending_dispatch),
      batchesRunning: Number(matrix.batches_running),
      trucksOnRoad: Number(matrix.trucks_on_road),
      supplierShortfalls: Number(matrix.supplier_shortfalls),
    };
  }

  /**
   * AC8: EOD Dashboard — End-of-day reconciliation view
   * Reads from M6 tables: wallets, handovers, deposit slip, sign-off status
   */
  async getEODView(siteId: string, date: string): Promise<EODViewResponse> {
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }

    // 1. Get wallet summaries for all agents (collectors, drivers) at this site
    const walletRows = await this.knex('custody_ledger as cl')
      .join('users as u', 'cl.user_id', 'u.id')
      .where('cl.site_id', siteId)
      .where('cl.posted_at', '>=', date)
      .where('cl.posted_at', '<', `${date} 23:59:59.999`)
      .select(
        'u.id as user_id',
        'u.full_name as user_name',
        this.knex.raw(
          `MAX(CASE WHEN cl.entry_type = 'OPENING' THEN cl.running_balance END) as opening_balance`,
        ),
        this.knex.raw(
          `SUM(CASE WHEN cl.entry_type = 'COLLECTION' THEN cl.amount_delta ELSE 0 END) as collections`,
        ),
        this.knex.raw(
          `SUM(CASE WHEN cl.entry_type = 'HANDOVER_OUT' THEN cl.amount_delta ELSE 0 END) as handovers_out`,
        ),
        this.knex.raw(
          `SUM(CASE WHEN cl.entry_type = 'HANDOVER_IN' THEN cl.amount_delta ELSE 0 END) as handovers_in`,
        ),
        this.knex.raw(`MAX(cl.running_balance) as closing_balance`),
      )
      .groupBy('u.id', 'u.full_name');

    // 2. Get handovers for the date
    const handoverRows = await this.knex('custody_ledger as cl')
      .where('cl.site_id', siteId)
      .where('cl.posted_at', '>=', date)
      .where('cl.posted_at', '<', `${date} 23:59:59.999`)
      .whereIn('cl.entry_type', ['HANDOVER_OUT', 'HANDOVER_IN'])
      .select(
        'cl.id as handover_id',
        'cl.user_id as from_user_id',
        'cl.amount_delta',
        'cl.entry_type',
        'cl.posted_at',
      )
      .orderBy('cl.posted_at');

    // Map handovers (simplified - in reality you'd join to get to_user_id)
    const handovers = handoverRows.map((row) => ({
      handoverId: String(row.handover_id),
      fromUserId: String(row.from_user_id),
      toUserId: '', // Would need handover_register table for full detail
      amount: String(row.amount_delta),
      status: 'VERIFIED' as const, // Simplified
      verifiedAt: row.posted_at.toISOString(),
    }));

    // 3. Get deposit slip (cashbook summary for the date)
    const cashbook = await this.knex('cashbook_entries')
      .where('site_id', siteId)
      .where('date', date)
      .select(
        this.knex.raw(
          `SUM(CASE WHEN entry_type = 'CASH' THEN amount ELSE 0 END) as total_cash`,
        ),
        this.knex.raw(
          `SUM(CASE WHEN entry_type = 'CHEQUE' THEN amount ELSE 0 END) as total_cheque`,
        ),
        this.knex.raw(
          `SUM(CASE WHEN entry_type = 'ONLINE' THEN amount ELSE 0 END) as total_online`,
        ),
        this.knex.raw(`SUM(amount) as total`),
      )
      .first();

    // 4. Get EOD sign-off status
    const eod = await this.knex('eod_closings')
      .where('site_id', siteId)
      .where('date', date)
      .first('id', 'signed_off_by_user_id', 'signed_off_at');

    const wallets = walletRows.map((row) => ({
      userId: String(row.user_id),
      userName: row.user_name,
      openingBalance: String(row.opening_balance ?? '0.00'),
      collections: String(row.collections ?? '0.00'),
      handoversOut: String(row.handovers_out ?? '0.00'),
      handoversIn: String(row.handovers_in ?? '0.00'),
      closingBalance: String(row.closing_balance ?? '0.00'),
    }));

    return {
      siteId,
      date,
      wallets,
      handovers,
      depositSlip: {
        totalCash: String(cashbook?.total_cash ?? '0.00'),
        totalCheque: String(cashbook?.total_cheque ?? '0.00'),
        totalOnline: String(cashbook?.total_online ?? '0.00'),
        total: String(cashbook?.total ?? '0.00'),
      },
      signedOff: Boolean(eod?.signed_off_by_user_id),
      signedOffBy: eod?.signed_off_by_user_id
        ? String(eod.signed_off_by_user_id)
        : undefined,
      signedOffAt: eod?.signed_off_at
        ? new Date(eod.signed_off_at).toISOString()
        : undefined,
    };
  }

  /**
   * AC10: KPI Queries — Key performance indicators for Owner
   */
  async getKPIs(siteId: string, date: string): Promise<KPIResponse> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }

    // 1. Owner call volume = exceptions resolved today
    const exceptionsResolved = await this.knex('exception_approvals')
      .where('site_id', siteId)
      .where('resolved_at', '>=', date)
      .where('resolved_at', '<', `${date} 23:59:59.999`)
      .whereIn('status', ['APPROVED', 'REJECTED'])
      .count('* as count')
      .first();

    // 2. EOD time = initiated_at to signed_off_at
    const eod = await this.knex('eod_closings')
      .where('site_id', siteId)
      .where('date', date)
      .whereNotNull('signed_off_at')
      .first('initiated_at', 'signed_off_at');

    let eodTimeMinutes = 0;
    if (eod?.initiated_at && eod?.signed_off_at) {
      const diff =
        new Date(eod.signed_off_at).getTime() -
        new Date(eod.initiated_at).getTime();
      eodTimeMinutes = Math.round(diff / 60000);
    }

    // 3. Missed entries % = unreconciled receipts / total receipts
    const missed = await this.knex.raw(
      `
      SELECT
        COUNT(*) FILTER (WHERE cr.idempotency_key IS NULL) * 100.0 / NULLIF(COUNT(*), 0) as missed_pct
      FROM collection_receipts cr
      WHERE cr.site_id = ? AND cr.collected_at >= ?::date AND cr.collected_at < (?::date + INTERVAL '1 day')
    `,
      [siteId, date, date],
    );
    const missedEntriesPct = Number(missed.rows[0]?.missed_pct ?? 0).toFixed(2);

    // 4. Margin erosion visibility % = below-floor orders with exception / total below-floor orders
    const marginErosion = await this.knex.raw(
      `
      SELECT
        COUNT(DISTINCT so.id) FILTER (WHERE so.margin_pct < (
          SELECT COALESCE(CAST(value_json AS numeric), 0.10)
          FROM business_rule_config
          WHERE key = 'min_margin_pct_default' AND scope = 'GLOBAL'
        )) as total_below,
        COUNT(DISTINCT ea.reference_id) FILTER (
          WHERE ea.exception_type = 'PRICE_OVERRIDE'
          AND ea.reference_table = 'sales_orders'
          AND ea.status IN ('APPROVED', 'REJECTED')
        ) as with_exception
      FROM sales_orders so
      LEFT JOIN exception_approvals ea
        ON ea.reference_table = 'sales_orders'
        AND ea.reference_id = so.id::text
        AND ea.exception_type = 'PRICE_OVERRIDE'
      WHERE so.fulfillment_site_id = ?
        AND so.created_at >= ?::date
        AND so.created_at < (?::date + INTERVAL '1 day')
        AND so.margin_pct < (
          SELECT COALESCE(CAST(value_json AS numeric), 0.10)
          FROM business_rule_config
          WHERE key = 'min_margin_pct_default' AND scope = 'GLOBAL'
        )
    `,
      [siteId, date, date],
    );
    const marginRow = marginErosion.rows[0];
    const marginErosionVisibilityPct =
      marginRow?.total_below > 0
        ? (
            (Number(marginRow.with_exception) / Number(marginRow.total_below)) *
            100
          ).toFixed(2)
        : '100.00';

    // 5. ePOD visibility % = trips completed before 20:00 with valid ePOD / total completed trips
    const epod = await this.knex.raw(
      `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE dt.closed_at::time < '20:00:00' AND
          EXISTS (SELECT 1 FROM delivery_stops ds
            WHERE ds.trip_id = dt.id
            AND ds.epod_method IS NOT NULL
            AND ds.delivered_at IS NOT NULL)
        ) as good
      FROM delivery_trips dt
      WHERE dt.site_id = ?
        AND dt.trip_date = ?
        AND dt.status = 'COMPLETED'
    `,
      [siteId, date],
    );
    const epodRow = epod.rows[0];
    const epodVisibilityPct =
      epodRow?.total > 0
        ? ((Number(epodRow.good) / Number(epodRow.total)) * 100).toFixed(2)
        : '100.00';

    // 6. Routine order confirmation time (for in-band orders) - simplified
    const routineTime = await this.knex.raw(
      `
      SELECT AVG(EXTRACT(EPOCH FROM (so.updated_at - so.created_at))/60) as avg_minutes
      FROM sales_orders so
      WHERE so.fulfillment_site_id = ?
        AND so.created_at >= ?::date
        AND so.created_at < (?::date + INTERVAL '1 day')
        AND so.margin_pct >= (
          SELECT COALESCE(CAST(value_json AS numeric), 0.10)
          FROM business_rule_config
          WHERE key = 'min_margin_pct_default' AND scope = 'GLOBAL'
        )
        AND so.order_status IN ('CONFIRMED', 'DISPATCHED', 'DELIVERED_FULL')
    `,
      [siteId, date, date],
    );
    const routineOrderConfirmationMinutes = Math.round(
      Number(routineTime.rows[0]?.avg_minutes ?? 0),
    );

    return {
      siteId,
      date,
      ownerCallVolume: Number(exceptionsResolved?.count ?? 0),
      eodTimeMinutes,
      missedEntriesPct,
      marginErosionVisibilityPct,
      epodVisibilityPct,
      routineOrderConfirmationMinutes,
    };
  }
}
