'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatINR, resolveExceptionWithConcurrency, type ExceptionItem } from '@neo/shared';
import { PulseHeader } from '../../../../src/components/PulseHeader';
import {
  INITIAL_EXCEPTIONS,
  OWNER_KPIS,
  SALES_TREND_30D,
  SITE_PULSE_DATA,
} from '../../../../src/lib/control-tower-data';

export default function ControlTowerDashboardPage() {
  const [siteId, setSiteId] = useState<string>('all');
  const [tvMode, setTvMode] = useState<boolean>(false);
  const [simulateOffline, setSimulateOffline] = useState<boolean>(false);
  const [exceptions, setExceptions] = useState<ExceptionItem[]>(INITIAL_EXCEPTIONS);
  const [toast, setToast] = useState<string | null>(null);

  const snapshot = useMemo(
    () => SITE_PULSE_DATA.find((s) => s.siteId === siteId) ?? SITE_PULSE_DATA[0],
    [siteId],
  );

  const pendingExceptions = useMemo(
    () => exceptions.filter((e) => e.status === 'PENDING' && (siteId === 'all' || e.siteId === siteId)),
    [exceptions, siteId],
  );

  function quickResolve(exc: ExceptionItem, action: 'APPROVE' | 'REJECT') {
    const res = resolveExceptionWithConcurrency({
      exceptions,
      exceptionId: exc.id,
      action,
      actorName: 'Owner',
      stepUpPassword: 'verified-session-stepup',
    });
    setExceptions(res.exceptions);
    setToast(
      res.originOrderUnlocked
        ? `${res.friendlyMessage} Order ${exc.originOrderNo} unlocked for dispatch!`
        : res.friendlyMessage,
    );
  }

  return (
    <div className={tvMode ? 'fixed inset-0 z-50 overflow-y-auto bg-slate-950 p-6 text-slate-100' : 'space-y-6'}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold ${tvMode ? 'text-white' : 'text-slate-900'}`}>
            Owner Control Tower
          </h1>
          <p className={`text-sm ${tvMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Exception-first command centre: live pulse, operational queues, inline approvals, and site comparison.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
          >
            {SITE_PULSE_DATA.map((s) => (
              <option key={s.siteId} value={s.siteId}>
                {s.siteName}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSimulateOffline((v) => !v)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          >
            {simulateOffline ? 'Resume Live Sync' : 'Simulate Offline'}
          </button>
          <button
            type="button"
            onClick={() => setTvMode((v) => !v)}
            className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            {tvMode ? 'Exit TV Mode' : 'TV / Wall Mode'}
          </button>
        </div>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
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
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 space-y-4">
          <h2 className="text-base font-bold">Operations Status Matrix</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/sales/orders" className="rounded-xl border border-slate-100 bg-slate-50 p-4 hover:border-blue-400">
              <div className="text-xs text-slate-500">Orders to Dispatch</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{snapshot.ordersToDispatch}</div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
                <div className="h-full w-3/4 rounded-full bg-blue-600" />
              </div>
            </Link>
            <Link href="/production/work-orders" className="rounded-xl border border-slate-100 bg-slate-50 p-4 hover:border-orange-400">
              <div className="text-xs text-slate-500">Batches Running</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{snapshot.batchesRunning}</div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
                <div className="h-full w-1/3 rounded-full bg-orange-500" />
              </div>
            </Link>
            <Link href="/logistics/dispatch" className="rounded-xl border border-slate-100 bg-slate-50 p-4 hover:border-emerald-400">
              <div className="text-xs text-slate-500">Trucks on Road</div>
              <div className="mt-1 text-sm font-bold text-slate-900">{snapshot.trucksOnRoadLabel}</div>
            </Link>
            <Link href="/procurement/shortfalls" className="rounded-xl border border-slate-100 bg-slate-50 p-4 hover:border-rose-400">
              <div className="text-xs text-slate-500">Supplier Shortfalls</div>
              <div className="mt-1 text-2xl font-bold text-rose-700">{snapshot.supplierShortfalls}</div>
            </Link>
          </div>
        </div>

        {/* Inline Decisions Panel */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Needs Your Decision</h2>
            <Link href="/control/approvals" className="text-xs font-semibold text-teal-700 hover:underline">
              Open Approvals Centre →
            </Link>
          </div>
          {pendingExceptions.length === 0 ? (
            <p className="py-6 text-center text-sm text-emerald-700 font-semibold">
              ✓ All pending exceptions cleared!
            </p>
          ) : (
            <div className="space-y-3">
              {pendingExceptions.slice(0, 3).map((exc) => (
                <div key={exc.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-800">{exc.type.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-slate-500">Escalates in {exc.escalatesInMinutes}m</span>
                  </div>
                  <div className="mt-1 font-semibold text-slate-900">{exc.title}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => quickResolve(exc, 'APPROVE')}
                      className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      ✓ Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => quickResolve(exc, 'REJECT')}
                      className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700"
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
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Sales Trend (Last 30 Days)</h2>
            <Link href="/control/analytics" className="text-xs font-semibold text-teal-700 hover:underline">
              Explore Analytics →
            </Link>
          </div>
          <div className="mt-4 flex items-end gap-3 h-36">
            {SALES_TREND_30D.map((pt) => (
              <div key={pt.day} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md bg-teal-600 transition-all"
                  style={{ height: `${Math.round((pt.salesInr / 500000) * 110)}px` }}
                  title={`${pt.day}: ${formatINR(pt.salesInr)}`}
                />
                <span className="text-[10px] text-slate-500">{pt.day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Link href="/control/stock-alerts" className="block rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 hover:border-amber-400">
            <div className="text-xs font-semibold text-slate-500">Stock Alerts</div>
            <div className="mt-1 text-2xl font-bold text-amber-700">4 Active Alerts</div>
            <div className="mt-1 text-xs text-slate-600">2 Low Stock · 1 Expiring Soon · 1 Drift</div>
          </Link>
          <Link href="/finance/eod" className="block rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 hover:border-emerald-400">
            <div className="text-xs font-semibold text-slate-500">Yesterday&apos;s EOD</div>
            <div className="mt-1 text-xl font-bold text-emerald-700">
              {snapshot.yesterdayEodStatus} ({snapshot.yesterdayEodMinutes} min)
            </div>
            <div className="mt-1 text-xs text-slate-600">Signed off by Owner · Deposit slip matched</div>
          </Link>
        </div>
      </div>

      {/* Owner KPIs & Multi-site comparison */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {OWNER_KPIS.map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900" title={k.hint}>
            <div className="text-xs text-slate-500">{k.label}</div>
            <div className="mt-1 text-lg font-bold text-slate-900">{k.value}</div>
          </div>
        ))}
      </div>

      {siteId === 'all' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold">
            Site Comparison (Owner All-Sites View)
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3 text-right">Today&apos;s Sales</th>
                <th className="px-4 py-3 text-right">Gross Margin</th>
                <th className="px-4 py-3 text-right">Cash Collected</th>
                <th className="px-4 py-3 text-right">Dispatch Queue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {SITE_PULSE_DATA.filter((s) => s.siteId !== 'all').map((s) => (
                <tr key={s.siteId}>
                  <td className="px-4 py-3 font-semibold">{s.siteName}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatINR(s.todaySalesInr)}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-700">{s.grossMarginPct}%</td>
                  <td className="px-4 py-3 text-right font-mono">{formatINR(s.cashCollectedInr)}</td>
                  <td className="px-4 py-3 text-right font-mono">{s.ordersToDispatch}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

