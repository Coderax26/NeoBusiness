'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatINR, resolveExceptionWithConcurrency, type ExceptionItem, type ExceptionType } from '@neo/shared';
import { PulseHeader } from '../../../../src/components/PulseHeader';
import { type SitePulseSnapshot } from '../../../../src/lib/control-tower-data';

export default function ControlTowerDashboardPage() {
  const [siteId, setSiteId] = useState<string>('all');
  const [tvMode, setTvMode] = useState<boolean>(false);
  const [simulateOffline, setSimulateOffline] = useState<boolean>(false);
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [snapshot, setSnapshot] = useState<SitePulseSnapshot>({
    siteId: 'all',
    siteName: 'All Sites (Aggregated)',
    todaySalesInr: 0,
    salesDeltaPct: 0,
    grossMarginPct: 0,
    cashCollectedInr: 0,
    ordersToDispatch: 0,
    batchesRunning: 0,
    trucksOnRoadLabel: '0 Active',
    supplierShortfalls: 0,
    yesterdayEodStatus: 'CLOSED',
    yesterdayEodMinutes: 0,
  });
  const [alertCount, setAlertCount] = useState(0);
  const [trend, setTrend] = useState<Array<{ day: string; salesInr: number }>>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/proxy/admin/sites')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const mappedSites = list.map((s: any) => ({ id: s.id, name: s.name }));
        setSites(mappedSites);
        const stored =
          typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') : null;
        if (stored && mappedSites.some((s: any) => s.id === stored)) {
          setSiteId(stored);
        } else if (mappedSites[0]?.id) {
          setSiteId(mappedSites[0].id);
        }
      })
      .catch(() => {});

    fetch('/api/proxy/stock-alerts')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setAlertCount(list.length);
      })
      .catch(() => {});

    fetch('/api/proxy/exceptions')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setExceptions(
          list.map((e: any) => {
            const payload =
              typeof e.context_payload_json === 'string'
                ? (() => {
                    try {
                      return JSON.parse(e.context_payload_json);
                    } catch {
                      return {};
                    }
                  })()
                : (e.context_payload_json ?? e.payload_json ?? {});
            return {
              id: e.id,
              type: (e.exception_type ?? e.type ?? 'PRICE_OVERRIDE') as ExceptionType,
              status: e.status ?? 'PENDING',
              title: payload?.title ?? e.title ?? e.reason ?? `${e.exception_type ?? 'Exception'}`,
              siteId: e.site_id ?? 'all',
              siteName: e.site_name ?? 'Site',
              amountInr: Number(e.value_at_risk ?? e.amount_inr ?? e.amount ?? 0),
              waitingMinutes: Number(e.waiting_minutes ?? 0),
              escalatesInMinutes: Number(e.escalates_in_minutes ?? 30),
              originOrderNo: e.reference_id ?? e.entity_no ?? '',
              facts: typeof payload === 'object' && payload ? payload : {},
            };
          }),
        );
      })
      .catch(() => setExceptions([]));
  }, []);

  useEffect(() => {
    const encodedSite = encodeURIComponent(siteId);
    Promise.all([
      fetch(`/api/proxy/dashboard/pulse?siteId=${encodedSite}`),
      fetch(`/api/proxy/dashboard/status-matrix?siteId=${encodedSite}`),
    ])
      .then(async ([pulseRes, matrixRes]) => {
        if (pulseRes.status === 403) {
          setToast('Pulse financials are restricted for your role.');
        }
        const pulseJson = pulseRes.ok ? await pulseRes.json() : null;
        const matrixJson = matrixRes.ok ? await matrixRes.json() : null;
        const d = pulseJson?.data ?? pulseJson ?? {};
        const m = matrixJson?.data ?? matrixJson ?? {};
        if (!pulseJson && !matrixJson) return;
        const trucksActive = Number(m.trucksOnRoad ?? d.activeTrips ?? 0);
        setSnapshot((prev) => ({
          ...prev,
          siteId,
          siteName: d.siteName ?? (siteId === 'all' ? 'All Sites (Aggregated)' : sites.find((s) => s.id === siteId)?.name ?? 'Site'),
          todaySalesInr: Number(d.todaySalesInr ?? d.todaysSales ?? d.todaySales ?? 0),
          salesDeltaPct: Number(d.salesDeltaPct ?? 0),
          grossMarginPct:
            d.grossMarginPct !== null && d.grossMarginPct !== undefined
              ? Number(d.grossMarginPct)
              : 0,
          cashCollectedInr: Number(d.cashCollectedInr ?? d.cashCollectedToday ?? d.cashCollected ?? 0),
          ordersToDispatch: Number(m.ordersPendingDispatch ?? d.ordersToDispatch ?? 0),
          batchesRunning: Number(m.batchesRunning ?? d.batchesRunning ?? 0),
          trucksOnRoadLabel: d.trucksOnRoadLabel ?? `${trucksActive} Active`,
          supplierShortfalls: Number(m.supplierShortfalls ?? d.supplierShortfalls ?? 0),
          yesterdayEodStatus: d.yesterdayEodStatus ?? 'CLOSED',
          yesterdayEodMinutes: Number(d.yesterdayEodMinutes ?? 0),
        }));
        if (Array.isArray(d.salesTrend)) setTrend(d.salesTrend);
      })
      .catch(() => {
        setToast('Failed to load Control Tower pulse data.');
      });
  }, [siteId, sites]);

  const pendingExceptions = useMemo(
    () => exceptions.filter((e) => e.status === 'PENDING' && (siteId === 'all' || e.siteId === siteId)),
    [exceptions, siteId],
  );

  async function quickResolve(exc: ExceptionItem, action: 'APPROVE' | 'REJECT') {
    const res = resolveExceptionWithConcurrency({
      exceptions,
      exceptionId: exc.id,
      action,
      actorName: 'Owner',
      stepUpPassword: 'verified-session-stepup',
    });
    try {
      const apiRes = await fetch(`/api/proxy/exceptions/${exc.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          remarks: `${action === 'APPROVE' ? 'Approved' : 'Rejected'} via Control Tower`,
        }),
      });
      if (!apiRes.ok) {
        const errBody = await apiRes.json().catch(() => null);
        throw new Error(errBody?.message || errBody?.error?.message || `HTTP ${apiRes.status}`);
      }
      setExceptions(res.exceptions);
      setToast(
        res.originOrderUnlocked
          ? `${res.friendlyMessage} Order ${exc.originOrderNo} unlocked for dispatch!`
          : res.friendlyMessage,
      );
    } catch (err) {
      setToast(`Failed to resolve exception: ${(err as Error).message}`);
    }
  }

  return (
    <div className={tvMode ? 'fixed inset-0 z-50 overflow-y-auto bg-zinc-950 p-6 text-zinc-100' : 'space-y-6'}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">
            Owner Control Tower
          </h1>
          <p className="text-sm text-zinc-400">
            Exception-first command centre: live pulse, operational queues, inline approvals, and site comparison.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="all">All Sites (Aggregated)</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSimulateOffline((v) => !v)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200"
          >
            {simulateOffline ? 'Resume Live Sync' : 'Simulate Offline'}
          </button>
          <button
            type="button"
            onClick={() => setTvMode((v) => !v)}
            className="rounded-lg bg-zinc-100 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-200"
          >
            {tvMode ? 'Exit TV Mode' : 'TV / Wall Mode'}
          </button>
        </div>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-2.5 text-sm font-medium text-emerald-300">
          {toast}
        </div>
      )}

      {/* F10-01 Pulse Header */}
      <PulseHeader
        siteId={siteId}
        pendingDecisionsCount={pendingExceptions.length}
        simulateOffline={simulateOffline}
      />

      {/* F10-02 Status Matrix & Needs Your Decision */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-100 space-y-4">
          <h2 className="text-base font-bold">Operations Status Matrix</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/sales/orders" className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 hover:border-blue-500">
              <div className="text-xs text-zinc-400">Orders to Dispatch</div>
              <div className="mt-1 text-2xl font-bold text-zinc-100">{snapshot.ordersToDispatch}</div>
            </Link>
            <Link href="/production/work-orders" className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 hover:border-orange-500">
              <div className="text-xs text-zinc-400">Batches Running</div>
              <div className="mt-1 text-2xl font-bold text-zinc-100">{snapshot.batchesRunning}</div>
            </Link>
            <Link href="/logistics/dispatch" className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 hover:border-emerald-500">
              <div className="text-xs text-zinc-400">Trucks on Road</div>
              <div className="mt-1 text-sm font-bold text-zinc-100">{snapshot.trucksOnRoadLabel}</div>
            </Link>
            <Link href="/procurement/shortfalls" className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 hover:border-rose-500">
              <div className="text-xs text-zinc-400">Supplier Shortfalls</div>
              <div className="mt-1 text-2xl font-bold text-rose-400">{snapshot.supplierShortfalls}</div>
            </Link>
          </div>
        </div>

        {/* Inline Decisions Panel */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-100 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Needs Your Decision</h2>
            <Link href="/control/approvals" className="text-xs font-semibold text-teal-400 hover:underline">
              Open Approvals Centre →
            </Link>
          </div>
          {pendingExceptions.length === 0 ? (
            <p className="py-6 text-center text-sm text-emerald-400 font-semibold">
              ✓ All pending exceptions cleared!
            </p>
          ) : (
            <div className="space-y-3">
              {pendingExceptions.slice(0, 3).map((exc) => (
                <div key={exc.id} className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300">{exc.type.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-zinc-400">Escalates in {exc.escalatesInMinutes}m</span>
                  </div>
                  <div className="mt-1 font-semibold text-zinc-100">{exc.title}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => quickResolve(exc, 'APPROVE')}
                      className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      ✓ Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => quickResolve(exc, 'REJECT')}
                      className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500"
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 30-Day Sales Trend + Stock Alerts + Yesterday's EOD */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-100 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Sales Trend (Last 30 Days)</h2>
            <Link href="/control/analytics" className="text-xs font-semibold text-teal-400 hover:underline">
              Explore Analytics →
            </Link>
          </div>
          {trend.length === 0 ? (
            <div className="mt-6 text-xs text-zinc-400">Live trend data populates as invoices are posted.</div>
          ) : (
            <div className="mt-4 flex items-end gap-3 h-36">
              {trend.map((pt) => (
                <div key={pt.day} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-md bg-teal-500 transition-all"
                    style={{ height: `${Math.min(110, Math.max(8, Math.round((pt.salesInr / 500000) * 110)))}px` }}
                    title={`${pt.day}: ${formatINR(pt.salesInr)}`}
                  />
                  <span className="text-[10px] text-zinc-400">{pt.day}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Link href="/control/stock-alerts" className="block rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-100 hover:border-amber-500">
            <div className="text-xs font-semibold text-zinc-400">Stock Alerts</div>
            <div className="mt-1 text-2xl font-bold text-amber-400">{alertCount} Active Alerts</div>
          </Link>
          <Link href="/finance/eod" className="block rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-100 hover:border-emerald-500">
            <div className="text-xs font-semibold text-zinc-400">Yesterday&apos;s EOD</div>
            <div className="mt-1 text-xl font-bold text-emerald-400">
              {snapshot.yesterdayEodStatus} ({snapshot.yesterdayEodMinutes} min)
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

