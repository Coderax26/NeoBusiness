import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
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
  private readonly logger = new Logger(DashboardService.name);

  constructor(@InjectKnex() private readonly knex: Knex) {}

  private isUuid(v?: string): boolean {
    return Boolean(v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));
  }

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

    if (!this.isUuid(siteId)) {
      const rows = await this.knex('mv_pulse_today').select(
        'todays_sales',
        'gross_margin_pct',
        'cash_collected_today',
        'pending_exceptions',
      );
      if (rows.length === 0) {
        return {
          siteId: 'all',
          todaysSales: '0.00',
          grossMarginPct: '0.00',
          cashCollectedToday: '0.00',
          pendingExceptions: 0,
        };
      }
      const totalSales = rows.reduce((s, r) => s + Number(r.todays_sales || 0), 0);
      const totalCash = rows.reduce((s, r) => s + Number(r.cash_collected_today || 0), 0);
      const totalExceptions = rows.reduce((s, r) => s + Number(r.pending_exceptions || 0), 0);
      const weightedMargin =
        totalSales > 0
          ? rows.reduce(
              (s, r) => s + Number(r.todays_sales || 0) * Number(r.gross_margin_pct || 0),
              0,
            ) / totalSales
          : rows.reduce((s, r) => s + Number(r.gross_margin_pct || 0), 0) / rows.length;
      return {
        siteId: 'all',
        todaysSales: totalSales.toFixed(2),
        grossMarginPct: weightedMargin.toFixed(2),
        cashCollectedToday: totalCash.toFixed(2),
        pendingExceptions: totalExceptions,
      };
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
    if (!this.isUuid(siteId)) {
      const rows = await this.knex('mv_ops_status').select(
        'orders_pending_dispatch',
        'batches_running',
        'trucks_on_road',
        'supplier_shortfalls',
      );
      return {
        siteId: 'all',
        ordersPendingDispatch: rows.reduce((s, r) => s + Number(r.orders_pending_dispatch || 0), 0),
        batchesRunning: rows.reduce((s, r) => s + Number(r.batches_running || 0), 0),
        trucksOnRoad: rows.reduce((s, r) => s + Number(r.trucks_on_road || 0), 0),
        supplierShortfalls: rows.reduce((s, r) => s + Number(r.supplier_shortfalls || 0), 0),
      };
    }

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

    const siteFilter = this.isUuid(siteId) ? siteId : undefined;

    // 1. Get wallet summaries for all agents (collectors, drivers) at this site
    let walletQuery = this.knex('custody_ledger as cl')
      .join('users as u', 'cl.user_id', 'u.id')
      .where('cl.posted_at', '>=', date)
      .where('cl.posted_at', '<', `${date} 23:59:59.999`);
    if (siteFilter) walletQuery = walletQuery.where('cl.site_id', siteFilter);
    const walletRows = await walletQuery
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
    let handoverQuery = this.knex('custody_ledger as cl')
      .where('cl.posted_at', '>=', date)
      .where('cl.posted_at', '<', `${date} 23:59:59.999`)
      .whereIn('cl.entry_type', ['HANDOVER_OUT', 'HANDOVER_IN']);
    if (siteFilter) handoverQuery = handoverQuery.where('cl.site_id', siteFilter);
    const handoverRows = await handoverQuery
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
    let cashbookQuery = this.knex('cashbook_entries').where('date', date);
    if (siteFilter) cashbookQuery = cashbookQuery.where('site_id', siteFilter);
    const cashbook = await cashbookQuery
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
    let eodQuery = this.knex('eod_closings').where('date', date);
    if (siteFilter) eodQuery = eodQuery.where('site_id', siteFilter);
    const eod = await eodQuery.first('id', 'signed_off_by_user_id', 'signed_off_at');

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

    const siteFilter = this.isUuid(siteId) ? siteId : undefined;

    // 1. Owner call volume = exceptions resolved today
    let exceptionsQuery = this.knex('exception_approvals')
      .where('resolved_at', '>=', date)
      .where('resolved_at', '<', `${date} 23:59:59.999`)
      .whereIn('status', ['APPROVED', 'REJECTED']);
    if (siteFilter) exceptionsQuery = exceptionsQuery.where('site_id', siteFilter);
    const exceptionsResolved = await exceptionsQuery.count('* as count').first();

    // 2. EOD time = initiated_at to signed_off_at
    let eodQuery = this.knex('eod_closings')
      .where('date', date)
      .whereNotNull('signed_off_at');
    if (siteFilter) eodQuery = eodQuery.where('site_id', siteFilter);
    const eod = await eodQuery.first('initiated_at', 'signed_off_at');

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
      WHERE ${siteFilter ? 'cr.site_id = ? AND ' : ''}cr.collected_at >= ?::date AND cr.collected_at < (?::date + INTERVAL '1 day')
    `,
      siteFilter ? [siteFilter, date, date] : [date, date],
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
      WHERE ${siteFilter ? 'so.fulfillment_site_id = ? AND ' : ''}so.created_at >= ?::date
        AND so.created_at < (?::date + INTERVAL '1 day')
        AND so.margin_pct < (
          SELECT COALESCE(CAST(value_json AS numeric), 0.10)
          FROM business_rule_config
          WHERE key = 'min_margin_pct_default' AND scope = 'GLOBAL'
        )
    `,
      siteFilter ? [siteFilter, date, date] : [date, date],
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
      WHERE ${siteFilter ? 'dt.site_id = ? AND ' : ''}dt.trip_date = ?
        AND dt.status = 'COMPLETED'
    `,
      siteFilter ? [siteFilter, date] : [date],
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
      WHERE ${siteFilter ? 'so.fulfillment_site_id = ? AND ' : ''}so.created_at >= ?::date
        AND so.created_at < (?::date + INTERVAL '1 day')
        AND so.margin_pct >= (
          SELECT COALESCE(CAST(value_json AS numeric), 0.10)
          FROM business_rule_config
          WHERE key = 'min_margin_pct_default' AND scope = 'GLOBAL'
        )
        AND so.order_status IN ('CONFIRMED', 'DISPATCHED', 'DELIVERED_FULL')
    `,
      siteFilter ? [siteFilter, date, date] : [date, date],
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

  async getHomeSummary(role?: string, siteId?: string) {
    const validSiteId = this.isUuid(siteId) ? siteId : undefined;
    const runQuery = async <T>(
      label: string,
      fn: () => Promise<T>,
      fallback: T,
    ): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        this.logger.error(
          `getHomeSummary(${label}) failed: ${(err as Error).message}`,
        );
        return fallback;
      }
    };

    const runCount = async (
      label: string,
      fn: () => Promise<any>,
    ): Promise<number> => {
      try {
        const res = await fn();
        return Number(res?.c ?? res?.count ?? 0);
      } catch (err) {
        this.logger.error(
          `getHomeSummary(${label}) failed: ${(err as Error).message}`,
        );
        return 0;
      }
    };

    const arSiteClause = validSiteId ? ' AND site_id = ?' : '';
    const arBindings = validSiteId ? [validSiteId] : [];

    const [
      salesTodayRow,
      invTodayCount,
      cashTodayRow,
      activeTripsCount,
      stagedOrdersCount,
      readyOrdersCount,
      activeBatchesCount,
      pendingHandoversCount,
      pendingChequesCount,
      openExceptionsRows,
      arRows,
      rolloutRow,
    ] = await Promise.all([
      runQuery(
        'salesTodayRow',
        () =>
          this.knex('sales_orders')
            .whereIn('order_status', [
              'CONFIRMED',
              'IN_PRODUCTION_SOURCING',
              'READY',
              'DISPATCHED',
              'DELIVERED_FULL',
              'DELIVERED_PARTIAL',
              'CLOSED',
            ])
            .whereRaw(
              "(created_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date",
            )
            .modify((qb) => {
              if (validSiteId) qb.where('fulfillment_site_id', validSiteId);
            })
            .sum('total_amount as total')
            .first(),
        { total: 0 },
      ),
      runCount('invTodayCount', () =>
        this.knex('invoices')
          .whereNot('status', 'CANCELLED')
          .whereRaw(
            "invoice_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date",
          )
          .modify((qb) => {
            if (validSiteId) qb.where('site_id', validSiteId);
          })
          .count('* as c')
          .first(),
      ),
      runQuery(
        'cashTodayRow',
        () =>
          this.knex('collection_receipts')
            .whereRaw(
              "(collected_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date",
            )
            .modify((qb) => {
              if (validSiteId) qb.where('site_id', validSiteId);
            })
            .sum('amount as total')
            .first(),
        { total: 0 },
      ),
      runCount('activeTripsCount', () =>
        this.knex('delivery_trips')
          .whereIn('status', ['LOADING', 'IN_TRANSIT'])
          .modify((qb) => {
            if (validSiteId) qb.where('site_id', validSiteId);
          })
          .count('* as c')
          .first(),
      ),
      runCount('stagedOrdersCount', () =>
        this.knex('sales_orders')
          .whereIn('order_status', [
            'CONFIRMED',
            'IN_PRODUCTION_SOURCING',
            'READY',
          ])
          .modify((qb) => {
            if (validSiteId) qb.where('fulfillment_site_id', validSiteId);
          })
          .count('* as c')
          .first(),
      ),
      runCount('readyOrdersCount', () =>
        this.knex('sales_orders')
          .where('order_status', 'READY')
          .modify((qb) => {
            if (validSiteId) qb.where('fulfillment_site_id', validSiteId);
          })
          .count('* as c')
          .first(),
      ),
      runCount('activeBatchesCount', () =>
        this.knex('production_work_orders')
          .whereIn('status', ['PLANNED', 'IN_PROGRESS'])
          .modify((qb) => {
            if (validSiteId) qb.where('site_id', validSiteId);
          })
          .count('* as c')
          .first(),
      ),
      runCount('pendingHandoversCount', () =>
        this.knex('cash_handovers')
          .where('status', 'PENDING')
          .modify((qb) => {
            if (validSiteId) qb.where('site_id', validSiteId);
          })
          .count('* as c')
          .first(),
      ),
      runCount('pendingChequesCount', () =>
        this.knex('cheque_register as crg')
          .join('collection_receipts as cr', 'crg.receipt_id', 'cr.id')
          .whereIn('crg.status', ['RECEIVED', 'DEPOSITED'])
          .modify((qb) => {
            if (validSiteId) qb.where('cr.site_id', validSiteId);
          })
          .count('* as c')
          .first(),
      ),
      runQuery(
        'openExceptionsRows',
        () =>
          this.knex('exception_approvals')
            .where('status', 'PENDING')
            .modify((qb) => {
              if (validSiteId) qb.where('site_id', validSiteId);
            })
            .select(
              'id',
              'exception_type',
              'reference_table',
              'reference_id',
              'context_payload_json',
              'value_at_risk',
              'created_at',
            )
            .orderBy('created_at', 'desc')
            .limit(10),
        [] as any[],
      ),
      runQuery(
        'arRows',
        () =>
          this.knex.raw(
            `
        SELECT
          COALESCE(SUM(balance_due) FILTER (WHERE due_date >= CURRENT_DATE - INTERVAL '7 days'), 0)::numeric(14,2) as a0_7,
          COUNT(*) FILTER (WHERE balance_due > 0 AND due_date >= CURRENT_DATE - INTERVAL '7 days')::int as c0_7,
          COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '7 days' AND due_date >= CURRENT_DATE - INTERVAL '15 days'), 0)::numeric(14,2) as a8_15,
          COUNT(*) FILTER (WHERE balance_due > 0 AND due_date < CURRENT_DATE - INTERVAL '7 days' AND due_date >= CURRENT_DATE - INTERVAL '15 days')::int as c8_15,
          COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '15 days' AND due_date >= CURRENT_DATE - INTERVAL '30 days'), 0)::numeric(14,2) as a16_30,
          COUNT(*) FILTER (WHERE balance_due > 0 AND due_date < CURRENT_DATE - INTERVAL '15 days' AND due_date >= CURRENT_DATE - INTERVAL '30 days')::int as c16_30,
          COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '30 days'), 0)::numeric(14,2) as a30p,
          COUNT(*) FILTER (WHERE balance_due > 0 AND due_date < CURRENT_DATE - INTERVAL '30 days')::int as c30p
        FROM invoices
        WHERE balance_due > 0 AND status NOT IN ('CANCELLED', 'PAID')${arSiteClause}
      `,
            arBindings,
          ),
        { rows: [{}] } as any,
      ),
      runQuery(
        'rolloutRow',
        () =>
          this.knex('business_rule_config')
            .where({ key: 'ROLLOUT_CONFIG', scope: 'GLOBAL' })
            .first(),
        null as any,
      ),
    ]);

    const mappedExceptions = (openExceptionsRows as any[]).map((row) => {
      const payload =
        typeof row.context_payload_json === 'string'
          ? (() => {
              try {
                return JSON.parse(row.context_payload_json);
              } catch {
                return {};
              }
            })()
          : (row.context_payload_json ?? {});
      return {
        id: row.id,
        exception_type: row.exception_type,
        reason: payload?.summary ?? payload?.title ?? row.exception_type,
        entity_id: row.reference_id,
        entity_type: row.reference_table,
        value_at_risk: row.value_at_risk,
        created_at: row.created_at,
      };
    });

    let grossMarginPct: number | null = null;
    if (role === 'OWNER') {
      const pulse = await runQuery(
        'mv_pulse_today',
        async () => {
          if (validSiteId) {
            return this.knex('mv_pulse_today')
              .where('site_id', validSiteId)
              .select('gross_margin_pct')
              .first();
          }
          const rows = await this.knex('mv_pulse_today').select(
            'todays_sales',
            'gross_margin_pct',
          );
          if (rows.length === 0) return null;
          const totalSales = rows.reduce(
            (s, r) => s + Number(r.todays_sales ?? 0),
            0,
          );
          const avgMargin =
            totalSales > 0
              ? rows.reduce(
                  (s, r) =>
                    s +
                    Number(r.todays_sales ?? 0) *
                      Number(r.gross_margin_pct ?? 0),
                  0,
                ) / totalSales
              : rows.reduce(
                  (s, r) => s + Number(r.gross_margin_pct ?? 0),
                  0,
                ) / rows.length;
          return { gross_margin_pct: Number(avgMargin.toFixed(2)) };
        },
        null as any,
      );
      grossMarginPct = pulse ? Number(pulse.gross_margin_pct ?? 0) : 0;
    }

    const ar = arRows?.rows?.[0] || {};
    const setupSteps: Array<{ status?: string }> = Array.isArray(rolloutRow?.value_json?.setupSteps)
      ? rolloutRow.value_json.setupSteps
      : [];
    const completedSteps = setupSteps.filter((s) => s.status === 'COMPLETED').length;
    const setupProgressPct = setupSteps.length > 0 ? Math.round((completedSteps / setupSteps.length) * 100) : 0;

    return {
      todaySalesInr: Number((salesTodayRow as any)?.total ?? 0),
      todayInvoiceCount: invTodayCount,
      grossMarginPct,
      cashCollectedInr: Number((cashTodayRow as any)?.total ?? 0),
      activeTripsCount,
      stagedOrdersCount,
      readyOrdersCount,
      activeBatchesCount,
      pendingHandoversCount,
      pendingChequesCount,
      pendingExceptionsCount: mappedExceptions.length,
      topException: mappedExceptions[0] ?? null,
      setupProgressPct,
      arAging: [
        { label: '0 – 7 Days', amount: String(ar.a0_7 ?? '0.00'), count: Number(ar.c0_7 ?? 0), tone: 'info' },
        { label: '8 – 15 Days', amount: String(ar.a8_15 ?? '0.00'), count: Number(ar.c8_15 ?? 0), tone: 'warning' },
        { label: '16 – 30 Days', amount: String(ar.a16_30 ?? '0.00'), count: Number(ar.c16_30 ?? 0), tone: 'warning' },
        { label: '30+ Days (Overdue)', amount: String(ar.a30p ?? '0.00'), count: Number(ar.c30p ?? 0), tone: 'danger' },
      ],
    };
  }
}
