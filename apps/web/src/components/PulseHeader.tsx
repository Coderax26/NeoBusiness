'use client';

import React, { useEffect, useState } from 'react';
import { evaluatePulseStaleness, formatINR } from '@neo/shared';
import { SITE_PULSE_DATA, type SitePulseSnapshot } from '../lib/control-tower-data';

interface PulseHeaderProps {
  siteId?: string;
  pendingDecisionsCount: number;
  simulateOffline?: boolean;
  onRefreshTick?: () => void;
}

export function PulseHeader({
  siteId = 'all',
  pendingDecisionsCount,
  simulateOffline = false,
  onRefreshTick,
}: PulseHeaderProps) {
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [missedRefreshes, setMissedRefreshes] = useState(0);

  const snapshot: SitePulseSnapshot =
    SITE_PULSE_DATA.find((s) => s.siteId === siteId) ?? SITE_PULSE_DATA[0];

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
          onRefreshTick?.();
        }
      } else {
        setSecondsAgo(elapsed);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [simulateOffline, onRefreshTick]);

  const staleness = evaluatePulseStaleness(missedRefreshes);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Business Pulse · {snapshot.siteName}
          </span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            What changed since yesterday: Sales +{snapshot.salesDeltaPct}% · EOD closed in {snapshot.yesterdayEodMinutes} min
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`rounded-full px-2.5 py-0.5 font-semibold ${
              staleness.isStale ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {staleness.isStale ? staleness.label : `Updated ${secondsAgo}s ago`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3.5" title="Formula: Sum of tax invoices issued today (OD-020)">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Today&apos;s Sales</span>
            <span className="cursor-help rounded-full bg-slate-200 px-1.5 text-[10px] font-bold">i</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-xl font-bold text-slate-900">{formatINR(snapshot.todaySalesInr)}</span>
            <span className="text-xs font-semibold text-emerald-700">↑ {snapshot.salesDeltaPct}%</span>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 p-3.5" title="Formula: (Sales - Landed Cost) / Sales">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Gross Margin</span>
            <span className="cursor-help rounded-full bg-slate-200 px-1.5 text-[10px] font-bold">i</span>
          </div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-700">{snapshot.grossMarginPct}%</div>
        </div>

        <div className="rounded-xl bg-slate-50 p-3.5" title="Formula: Cash + UPI + Bank receipts posted today">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Cash Collected Today</span>
            <span className="cursor-help rounded-full bg-slate-200 px-1.5 text-[10px] font-bold">i</span>
          </div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900">{formatINR(snapshot.cashCollectedInr)}</div>
        </div>

        <div className="rounded-xl bg-amber-50 p-3.5" title="Formula: Pending exceptions awaiting Owner approval">
          <div className="flex items-center justify-between text-xs text-amber-800">
            <span>Needs Your Decision</span>
            <span className="cursor-help rounded-full bg-amber-200 px-1.5 text-[10px] font-bold">i</span>
          </div>
          <div className="mt-1 font-mono text-xl font-bold text-amber-900">{pendingDecisionsCount}</div>
        </div>
      </div>
    </div>
  );
}

