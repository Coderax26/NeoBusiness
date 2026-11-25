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
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2 border-b-[1.5px] border-ink">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-ink">
            Today in numbers · {snapshot.siteName}
          </h2>
          <span className="text-[13px] text-ink-3">
            EOD {snapshot.yesterdayEodStatus}
          </span>
        </div>
        <div className="text-[13px]">
          <span
            className={staleness.isStale ? 'text-madder font-semibold' : 'text-ink-3'}
          >
            {staleness.isStale ? staleness.label : `Updated ${secondsAgo}s ago`}
          </span>
        </div>
      </div>

      {/* Ruled 4-column Bahi-Khata ledger strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b border-rule">
        <div className="py-3 pr-4" title="Sum of tax invoices issued today">
          <div className="text-[13px] text-ink-2">Today&apos;s Sales</div>
          <div className="mt-1 font-serif text-[30px] leading-tight font-medium text-ink tabular-nums">
            {pulseRestricted ? 'Owner Only' : formatINR(snapshot.todaySalesInr)}
          </div>
          {!pulseRestricted && (
            <div className={`text-[12.5px] mt-1 ${snapshot.salesDeltaPct >= 0 ? 'text-leaf' : 'text-madder'}`}>
              {snapshot.salesDeltaPct >= 0 ? `↑ ${snapshot.salesDeltaPct}%` : `↓ ${Math.abs(snapshot.salesDeltaPct)}%`} vs yesterday
            </div>
          )}
        </div>

        <div className="py-3 sm:pl-5 sm:border-l border-rule pr-4" title="(Sales - Landed Cost) / Sales">
          <div className="text-[13px] text-ink-2">Gross Margin</div>
          <div className="mt-1 font-serif text-[30px] leading-tight font-medium text-ink tabular-nums">
            {pulseRestricted ? 'Restricted' : `${snapshot.grossMarginPct}%`}
          </div>
          <div className="text-[12.5px] text-ink-3 mt-1">Target 15%</div>
        </div>

        <div className="py-3 lg:pl-5 lg:border-l border-rule pr-4" title="Cash + UPI + Bank receipts posted today">
          <div className="text-[13px] text-ink-2">Cash Collected Today</div>
          <div className="mt-1 font-serif text-[30px] leading-tight font-medium text-ink tabular-nums">
            {pulseRestricted ? 'Restricted' : formatINR(snapshot.cashCollectedInr)}
          </div>
          <div className="text-[12.5px] text-ink-3 mt-1">Cash, UPI &amp; bank</div>
        </div>

        <div className="py-3 sm:pl-5 sm:border-l border-rule" title="Pending exceptions awaiting Owner approval">
          <div className="text-[13px] text-ink-2">Needs Your Decision</div>
          <div className={`mt-1 font-serif text-[30px] leading-tight font-medium tabular-nums ${pendingDecisionsCount > 0 ? 'text-haldi' : 'text-leaf'}`}>
            {pendingDecisionsCount}
          </div>
          <div className="text-[12.5px] text-ink-3 mt-1">
            {pendingDecisionsCount > 0 ? 'Waiting for approval' : 'All clear'}
          </div>
        </div>
      </div>
    </div>
  );
}
