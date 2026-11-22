'use client';

import React, { useEffect, useState } from 'react';
import { evaluatePulseStaleness, formatINR } from '@neo/shared';
import { type SitePulseSnapshot } from '../lib/control-tower-data';

interface PulseHeaderProps {
  siteId?: string;
  pendingDecisionsCount: number;
  simulateOffline?: boolean;
  onRefreshTick?: () => void;
}

const EMPTY_PULSE: SitePulseSnapshot = {
  siteId: 'all',
  siteName: 'All Sites',
  todaySalesInr: 0,
  salesDeltaPct: 0,
  grossMarginPct: 0,
  cashCollectedInr: 0,
  ordersToDispatch: 0,
  batchesRunning: 0,
  trucksOnRoadLabel: '0 Active',
  supplierShortfalls: 0,
  yesterdayEodStatus: 'PENDING',
  yesterdayEodMinutes: 0,
};

export function PulseHeader({
  siteId = 'all',
  pendingDecisionsCount,
  simulateOffline = false,
  onRefreshTick,
}: PulseHeaderProps) {
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [missedRefreshes, setMissedRefreshes] = useState(0);
  const [snapshot, setSnapshot] = useState<SitePulseSnapshot>(EMPTY_PULSE);
  const [pulseRestricted, setPulseRestricted] = useState(false);

  const loadPulse = () => {
    if (simulateOffline) return;
    const encodedSite = encodeURIComponent(siteId);
    Promise.all([
      fetch(`/api/proxy/dashboard/pulse?siteId=${encodedSite}`),
      fetch(`/api/proxy/dashboard/status-matrix?siteId=${encodedSite}`),
    ])
      .then(async ([pulseRes, matrixRes]) => {
        if (pulseRes.status === 403) {
          setPulseRestricted(true);
        } else if (pulseRes.ok) {
          setPulseRestricted(false);
        }
        const pulseJson = pulseRes.ok ? await pulseRes.json() : null;
        const matrixJson = matrixRes.ok ? await matrixRes.json() : null;
        const d = pulseJson?.data ?? pulseJson ?? {};
        const m = matrixJson?.data ?? matrixJson ?? {};
        if (!pulseJson && !matrixJson) return;
        const trucksActive = Number(m.trucksOnRoad ?? d.activeTrips ?? 0);
        setSnapshot({
          siteId,
          siteName: d.siteName ?? (siteId === 'all' ? 'All Sites (Aggregated)' : 'Site'),
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
        });
      })
      .catch(() => {
        setMissedRefreshes((m) => m + 1);
      });
  };

  useEffect(() => {
    loadPulse();
  }, [siteId]);

  useEffect(() => {
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 1;
      if (elapsed > 29) {
        elapsed = 0;
        setSecondsAgo(0);
        if (simulateOffline) {
          setMissedRefreshes((m) => m + 1);
        } else {
          setMissedRefreshes(0);
          loadPulse();
          onRefreshTick?.();
        }
      } else {
        setSecondsAgo(elapsed);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [simulateOffline, onRefreshTick, siteId]);

  const staleness = evaluatePulseStaleness(missedRefreshes);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Business Pulse · {snapshot.siteName}
          </span>
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
            Sales {snapshot.salesDeltaPct >= 0 ? `+${snapshot.salesDeltaPct}%` : `${snapshot.salesDeltaPct}%`} · EOD {snapshot.yesterdayEodStatus}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`rounded-full px-2.5 py-0.5 font-semibold ${
              staleness.isStale ? 'bg-rose-500/20 text-rose-300' : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            {staleness.isStale ? staleness.label : `Updated ${secondsAgo}s ago`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5" title="Formula: Sum of tax invoices issued today (OD-020)">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Today&apos;s Sales</span>
            <span className="cursor-help rounded-full bg-zinc-800 px-1.5 text-[10px] font-bold">i</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-xl font-bold text-zinc-100">
              {pulseRestricted ? 'Owner Only' : formatINR(snapshot.todaySalesInr)}
            </span>
            {!pulseRestricted && (
              <span className="text-xs font-semibold text-emerald-400">↑ {snapshot.salesDeltaPct}%</span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5" title="Formula: (Sales - Landed Cost) / Sales">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Gross Margin</span>
            <span className="cursor-help rounded-full bg-zinc-800 px-1.5 text-[10px] font-bold">i</span>
          </div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-400">
            {pulseRestricted ? 'Restricted' : `${snapshot.grossMarginPct}%`}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5" title="Formula: Cash + UPI + Bank receipts posted today">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Cash Collected Today</span>
            <span className="cursor-help rounded-full bg-zinc-800 px-1.5 text-[10px] font-bold">i</span>
          </div>
          <div className="mt-1 font-mono text-xl font-bold text-zinc-100">
            {pulseRestricted ? 'Restricted' : formatINR(snapshot.cashCollectedInr)}
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-950/25 p-3.5" title="Formula: Pending exceptions awaiting Owner approval">
          <div className="flex items-center justify-between text-xs text-amber-300">
            <span>Needs Your Decision</span>
            <span className="cursor-help rounded-full bg-amber-200 px-1.5 text-[10px] font-bold">i</span>
          </div>
          <div className="mt-1 font-mono text-xl font-bold text-amber-900">{pendingDecisionsCount}</div>
        </div>
      </div>
    </div>
  );
}

