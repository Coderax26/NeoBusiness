'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { KpiCard, Badge, Button, Card } from '@neo/ui';
import { formatINR } from '@neo/shared';

interface PipelineStage {
  id: string;
  label: string;
  countOrValue: string;
  subLabel: string;
  href: string;
  accent: string;
  badgeVariant?: 'default' | 'warning' | 'danger' | 'success';
}

export default function ProcurementPipelineHomePage() {
  const [selectedStage, setSelectedStage] = useState<string>('requisitions');
  const [scorecards, setScorecards] = useState<Array<{ fillRatePct: number; onTimePct: number; monthlySpend: number }>>([]);
  const [missingRatesCount, setMissingRatesCount] = useState(0);
  const [liveStats, setLiveStats] = useState<{
    openReqs: number;
    posToIssue: number;
    awaitingDelivery: number;
    billsToCheck: number;
    toPayAmount: number;
    openShortfalls: number;
    priceSpikes: number;
  }>({
    openReqs: 0,
    posToIssue: 0,
    awaitingDelivery: 0,
    billsToCheck: 0,
    toPayAmount: 0,
    openShortfalls: 0,
    priceSpikes: 0,
  });

  useEffect(() => {
    // Hydrate pipeline counts from backend BFF when available
    Promise.allSettled([
      fetch('/api/bff/procurement/requisitions').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/bff/procurement/purchase-orders').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/bff/procurement/shortfalls/all/open').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/bff/procurement/supplier-bills').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/proxy/procurement/suppliers').then((r) => (r.ok ? r.json() : null)),
    ]).then(([reqsRes, posRes, sfRes, billsRes, supRes]) => {
      const reqs = reqsRes.status === 'fulfilled' && Array.isArray(reqsRes.value?.data) ? reqsRes.value.data : (reqsRes.status === 'fulfilled' && Array.isArray(reqsRes.value) ? reqsRes.value : null);
      const pos = posRes.status === 'fulfilled' && Array.isArray(posRes.value?.data) ? posRes.value.data : (posRes.status === 'fulfilled' && Array.isArray(posRes.value) ? posRes.value : null);
      const sfs = sfRes.status === 'fulfilled' && Array.isArray(sfRes.value?.data) ? sfRes.value.data : (sfRes.status === 'fulfilled' && Array.isArray(sfRes.value) ? sfRes.value : null);
      const bills = billsRes.status === 'fulfilled' && Array.isArray(billsRes.value?.data) ? billsRes.value.data : (billsRes.status === 'fulfilled' && Array.isArray(billsRes.value) ? billsRes.value : null);
      const sups = supRes.status === 'fulfilled' && Array.isArray(supRes.value) ? supRes.value : null;

      if (sups) {
        setScorecards(
          sups.map((s: any) => ({
            fillRatePct: Number(s.fill_rate_pct ?? s.fillRatePct ?? 95),
            onTimePct: Number(s.on_time_pct ?? s.onTimePct ?? 92),
            monthlySpend: Number(s.monthly_spend ?? s.monthlySpend ?? 0),
          })),
        );
        setMissingRatesCount(sups.filter((s: any) => s.has_missing_rates || s.hasMissingRates).length);
      }

      if (!reqs && !pos && !sfs && !bills) return;
      setLiveStats((prev) => ({
        openReqs: reqs ? reqs.filter((r: any) => r.status === 'OPEN').length : prev.openReqs,
        posToIssue: pos
          ? pos.filter((p: any) => p.status === 'DRAFT' || p.status === 'WAITING_APPROVAL').length
          : prev.posToIssue,
        awaitingDelivery: pos
          ? pos.filter((p: any) => p.status === 'SENT_TO_SUPPLIER' || p.status === 'PARTLY_RECEIVED').length
          : prev.awaitingDelivery,
        billsToCheck: bills
          ? bills.filter((b: any) => b.status === 'RECEIVED' || b.status === 'VERIFIED').length
          : prev.billsToCheck,
        toPayAmount: bills
          ? bills
              .filter((b: any) => b.status !== 'PAID')
              .reduce((sum: number, b: any) => sum + Number(b.total_amount ?? b.totalAmount ?? 0), 0)
          : prev.toPayAmount,
        openShortfalls: sfs ? sfs.length : prev.openShortfalls,
        priceSpikes: pos ? pos.filter((p: any) => p.priceSpikeException).length : prev.priceSpikes,
      }));
    });
  }, []);

  const stages: PipelineStage[] = [
    {
      id: 'needs',
      label: 'Needs',
      countOrValue: '12',
      subLabel: 'SO + Min-stock triggers',
      href: '/procurement/requisitions?source=MIN_STOCK',
      accent: 'from-slate-500/20 to-slate-600/5 border-slate-700',
    },
    {
      id: 'requisitions',
      label: 'Requisitions',
      countOrValue: String(liveStats.openReqs),
      subLabel: 'Open to group & convert',
      href: '/procurement/requisitions',
      accent: 'from-indigo-500/20 to-indigo-600/5 border-indigo-500/40',
    },
    {
      id: 'pos-to-issue',
      label: 'POs to issue',
      countOrValue: String(liveStats.posToIssue),
      subLabel: 'Draft & waiting approval',
      href: '/procurement/purchase-orders?status=DRAFT',
      accent: 'from-amber-500/20 to-amber-600/5 border-amber-500/40',
    },
    {
      id: 'awaiting-delivery',
      label: 'Awaiting delivery',
      countOrValue: String(liveStats.awaitingDelivery),
      subLabel: 'Sent & partly received',
      href: '/procurement/grns',
      accent: 'from-sky-500/20 to-sky-600/5 border-sky-500/40',
    },
    {
      id: 'bills-to-check',
      label: 'Bills to check',
      countOrValue: String(liveStats.billsToCheck),
      subLabel: '3-way match verification',
      href: '/procurement/supplier-bills?status=RECEIVED',
      accent: 'from-purple-500/20 to-purple-600/5 border-purple-500/40',
    },
    {
      id: 'to-pay',
      label: 'To pay',
      countOrValue: formatINR(liveStats.toPayAmount),
      subLabel: 'Approved & open AP',
      href: '/procurement/supplier-bills?status=APPROVED',
      accent: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/40',
    },
  ];

  const avgFillRate = scorecards.length > 0
    ? (scorecards.reduce((s, r) => s + r.fillRatePct, 0) / scorecards.length).toFixed(1)
    : '0.0';
  const avgOnTime = scorecards.length > 0
    ? (scorecards.reduce((s, r) => s + r.onTimePct, 0) / scorecards.length).toFixed(1)
    : '0.0';
  const monthlySpend = scorecards.reduce((s, r) => s + r.monthlySpend, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
            <h1 className="text-2xl font-bold text-ink tracking-tight">
              Procurement &amp; Suppliers Pipeline
            </h1>
          </div>
          <p className="text-sm text-ink-3 mt-1">
            End-to-end Need → Requisition → Purchase Order → GRN → 3-Way Bill → Payment flow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/procurement/requisitions?action=new">
            <Button variant="secondary">+ New Requisition</Button>
          </Link>
          <Link href="/procurement/purchase-orders?action=new">
            <Button variant="primary">+ Build Purchase Order</Button>
          </Link>
        </div>
      </div>

      {/* Interactive Visual Pipeline */}
      <div className="bg-sheet border border-rule rounded-[4px] p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
            Live Purchase Pipeline (click any stage to open filtered workbench)
          </span>
          <span className="text-xs text-action">M2 Procurement · BR-03 &amp; BR-05 Guarded</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-stretch">
          {stages.map((stage, idx) => (
            <div key={stage.id} className="relative flex items-stretch">
              <Link
                href={stage.href}
                onMouseEnter={() => setSelectedStage(stage.id)}
                className={`flex-1 rounded-[3px] border bg-gradient-to-br p-4 transition-all hover:scale-[1.02] hover:border-indigo-400${stage.accent}${
                  selectedStage === stage.id ? 'ring-1 ring-indigo-500/60' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-ink-2">{stage.label}</span>
                  <span className="text-[11px] text-ink-3 font-mono">0{idx + 1}</span>
                </div>
                <div className="text-2xl font-bold text-ink mt-2 font-mono">
                  {stage.countOrValue}
                </div>
                <div className="text-[11px] text-ink-3 mt-1">{stage.subLabel}</div>
              </Link>
              {idx < stages.length - 1 && (
                <div className="hidden md:flex items-center justify-center px-1 text-ink-3 font-bold select-none">
                  ▶
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Exception Alert Strips */}
        <div className="mt-4 pt-4 border-t border-rule flex flex-wrap gap-3">
          <Link
            href="/procurement/shortfalls"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-madder-soft border border-madder/30 text-madder hover:opacity-90/20 transition-colors text-xs font-medium"
          >
            <span>⚠</span>
            <span>Shortfalls open ({liveStats.openShortfalls})</span>
            <span className="text-madder/80">→ Recover via backup PO</span>
          </Link>

          <Link
            href="/procurement/purchase-orders?status=WAITING_APPROVAL"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-haldi-soft border border-haldi/30 text-haldi hover:opacity-90/20 transition-colors text-xs font-medium"
          >
            <span>⚠</span>
            <span>Price spikes waiting approval ({liveStats.priceSpikes})</span>
            <span className="text-haldi">→ Owner sign-off needed</span>
          </Link>

          <Link
            href="/procurement/scorecards"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-action-soft border border-action/30 text-action hover:bg-action-hover/20 transition-colors text-xs font-medium"
          >
            <span>📉</span>
            <span>Missing rates alerts ({missingRatesCount})</span>
            <span className="text-action">→ Update supplier quotes</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Spend This Month"
          value={formatINR(monthlySpend)}
          subtitle={`Across ${scorecards.length} active suppliers`}
          trend={{ value: 'Live DB', direction: 'up' }}
        />
        <KpiCard
          title="Avg Supplier Fill Rate"
          value={`${avgFillRate}%`}
          subtitle="Delivered vs ordered qty"
          trend={{ value: 'Live scorecard', direction: 'up' }}
        />
        <KpiCard
          title="On-Time Delivery"
          value={`${avgOnTime}%`}
          subtitle="Arrived by expected date"
          trend={{ value: 'Live scorecard', direction: 'up' }}
        />
        <KpiCard
          title="Open Shortfalls"
          value={String(liveStats.openShortfalls)}
          subtitle="Unfulfilled demand items"
          trend={{ value: liveStats.openShortfalls > 0 ? 'Action needed' : 'All clear', direction: liveStats.openShortfalls > 0 ? 'down' : 'up' }}
        />
      </div>

      {/* Actionable Shortcuts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 bg-sheet border-rule">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink">Ready to Convert Requisitions</h3>
            <Badge variant="info">{liveStats.openReqs} open</Badge>
          </div>
          <p className="text-xs text-ink-3 mb-4">
            Group open requisitions by supplier to generate one consolidated Purchase Order per supplier.
          </p>
          <Link href="/procurement/requisitions?view=grouped">
            <Button variant="secondary" className="w-full">
              Group by Supplier &amp; Convert →
            </Button>
          </Link>
        </Card>

        <Card className="p-5 bg-sheet border-rule">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink">Shortfall Recovery Workbench</h3>
            <Badge variant="danger">{liveStats.openShortfalls} open</Badge>
          </div>
          <p className="text-xs text-ink-3 mb-4">
            Ranked backup suppliers within 2% tolerance (OD-010) ready for ≤3-click backup POs.
          </p>
          <Link href="/procurement/shortfalls">
            <Button variant="secondary" className="w-full">
              Open Shortfall Workbench →
            </Button>
          </Link>
        </Card>

        <Card className="p-5 bg-sheet border-rule">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink">3-Way Bill Verification &amp; AP</h3>
            <Badge variant="warning">{liveStats.billsToCheck} pending</Badge>
          </div>
          <p className="text-xs text-ink-3 mb-4">
            Compare PO vs GRN vs Bill with ✓/✗ line indicators, approve bills, and record payments.
          </p>
          <Link href="/procurement/supplier-bills">
            <Button variant="secondary" className="w-full">
              Review Supplier Bills →
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}

