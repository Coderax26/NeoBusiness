'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatINR, resolveExceptionWithConcurrency, type ExceptionItem, type ExceptionType } from '@neo/shared';
import { Button } from '@neo/ui';
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
    <div className={tvMode ? 'fixed inset-0 z-50 overflow-y-auto bg-sheet p-8 text-ink space-y-6' : 'max-w-[1200px] mx-auto space-y-7'}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[32px] font-medium text-ink leading-tight">
            Business Overview
          </h1>
          <p className="text-[14px] text-ink-2 mt-1">
            Live pulse, operational queues, inline approvals, and site comparison.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="rounded-[3px] border border-rule-strong bg-sheet px-3 py-1.5 text-[13.5px] text-ink"
          >
            <option value="all">All Sites (Aggregated)</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSimulateOffline((v) => !v)}
          >
            {simulateOffline ? 'Resume Live Sync' : 'Pause Sync'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTvMode((v) => !v)}
          >
            {tvMode ? 'Exit TV View' : 'Show on TV'}
          </Button>
        </div>
      </div>

      {toast && (
        <div className="rounded-[3px] border-l-4 border-leaf bg-leaf-soft px-4 py-2.5 text-[13.5px] font-medium text-leaf">
          {toast}
        </div>
      )}

      {/* Pulse Header */}
      <PulseHeader
        siteId={siteId}
        pendingDecisionsCount={pendingExceptions.length}
        simulateOffline={simulateOffline}
      />

      {/* Operations & Needs Your Decision */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between pb-2 bahi-section-rule mb-1">
            <h2 className="text-[15px] font-semibold text-ink">Operations Status</h2>
          </div>
          <div className="divide-y divide-rule border-b border-rule">
            <Link href="/sales/orders" className="flex items-center justify-between py-3 hover:bg-paper/60 px-1.5 -mx-1.5 rounded-[3px]">
              <span className="text-[14px] text-ink-2">Orders to Dispatch</span>
              <span className="font-serif text-[22px] font-medium text-ink tabular-nums">{snapshot.ordersToDispatch}</span>
            </Link>
            <Link href="/production/work-orders" className="flex items-center justify-between py-3 hover:bg-paper/60 px-1.5 -mx-1.5 rounded-[3px]">
              <span className="text-[14px] text-ink-2">Batches Running</span>
              <span className="font-serif text-[22px] font-medium text-ink tabular-nums">{snapshot.batchesRunning}</span>
            </Link>
            <Link href="/logistics/dispatch" className="flex items-center justify-between py-3 hover:bg-paper/60 px-1.5 -mx-1.5 rounded-[3px]">
              <span className="text-[14px] text-ink-2">Trucks on Road</span>
              <span className="font-serif text-[18px] font-medium text-ink">{snapshot.trucksOnRoadLabel}</span>
            </Link>
            <Link href="/procurement/shortfalls" className="flex items-center justify-between py-3 hover:bg-paper/60 px-1.5 -mx-1.5 rounded-[3px]">
              <span className="text-[14px] text-ink-2">Supplier Shortfalls</span>
              <span className={`font-serif text-[22px] font-medium tabular-nums ${snapshot.supplierShortfalls > 0 ? 'text-madder' : 'text-ink'}`}>
                {snapshot.supplierShortfalls}
              </span>
            </Link>
          </div>
        </div>

        {/* Inline Decisions Panel */}
        <div>
          <div className="flex items-baseline justify-between pb-2 bahi-section-rule mb-1">
            <h2 className="text-[15px] font-semibold text-ink">Needs Your Decision</h2>
            <Link href="/control/approvals" className="text-[13.5px] font-medium text-action hover:underline">
              Open Approvals →
            </Link>
          </div>
          {pendingExceptions.length === 0 ? (
            <p className="py-6 text-[14px] text-leaf font-medium border-b border-rule">
              ✓ All pending exceptions cleared!
            </p>
          ) : (
            <div className="divide-y divide-rule border-b border-rule">
              {pendingExceptions.slice(0, 3).map((exc) => (
                <div key={exc.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-3 text-[13px]">
                      <span className="font-semibold text-haldi">{exc.type.replace(/_/g, ' ')}</span>
                      <span className="text-ink-3">Escalates in {exc.escalatesInMinutes}m</span>
                    </div>
                    <div className="mt-0.5 text-[14.5px] font-medium text-ink">{exc.title}</div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="primary" onClick={() => quickResolve(exc, 'APPROVE')}>
                      Approve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => quickResolve(exc, 'REJECT')}>
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 30-Day Sales Trend + Stock Alerts + Yesterday's EOD */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex items-baseline justify-between pb-2 bahi-section-rule">
            <h2 className="text-[15px] font-semibold text-ink">Sales Trend (Last 30 Days)</h2>
            <Link href="/control/analytics" className="text-[13.5px] font-medium text-action hover:underline">
              Explore Analytics →
            </Link>
          </div>
          {trend.length === 0 ? (
            <div className="mt-5 text-[13.5px] text-ink-3">Live trend data populates as invoices are posted.</div>
          ) : (
            <div className="mt-4 flex items-end gap-2.5 h-36 border-b border-rule-strong pb-1">
              {trend.map((pt, i) => (
                <div key={pt.day} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={`w-full transition-all ${i === trend.length - 1 ? 'bg-action' : 'bg-rule-strong'}`}
                    style={{ height: `${Math.min(110, Math.max(8, Math.round((pt.salesInr / 500000) * 110)))}px` }}
                    title={`${pt.day}: ${formatINR(pt.salesInr)}`}
                  />
                  <span className="text-[12px] text-ink-3">{pt.day}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="pb-2 bahi-section-rule">
            <h2 className="text-[15px] font-semibold text-ink">Keep an eye on</h2>
          </div>
          <Link href="/control/stock-alerts" className="block py-2 border-b border-rule hover:text-action">
            <div className="text-[13px] text-ink-3">Stock Alerts</div>
            <div className="mt-0.5 font-serif text-[24px] font-medium text-haldi">{alertCount} Active Alerts</div>
          </Link>
          <Link href="/finance/eod" className="block py-2 border-b border-rule hover:text-action">
            <div className="text-[13px] text-ink-3">Yesterday&apos;s EOD</div>
            <div className="mt-0.5 font-serif text-[24px] font-medium text-leaf">
              {snapshot.yesterdayEodStatus} ({snapshot.yesterdayEodMinutes} min)
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
