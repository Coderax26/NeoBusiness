'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { KpiCard, Badge, Button, Card } from '@neo/ui';
import { formatINR } from '@neo/shared';
import {
  INITIAL_REQUISITIONS,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_SHORTFALLS,
  INITIAL_SUPPLIER_BILLS,
  INITIAL_SUPPLIER_SCORECARDS,
  INITIAL_MISSING_RATES,
} from '../../../src/lib/procurement-data';

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
  const [liveStats, setLiveStats] = useState<{
    openReqs: number;
    posToIssue: number;
    awaitingDelivery: number;
    billsToCheck: number;
    toPayAmount: number;
    openShortfalls: number;
    priceSpikes: number;
  }>({
    openReqs: INITIAL_REQUISITIONS.filter((r) => r.status === 'OPEN').length,
    posToIssue: INITIAL_PURCHASE_ORDERS.filter(
      (p) => p.status === 'DRAFT' || p.status === 'WAITING_APPROVAL',
    ).length,
    awaitingDelivery: INITIAL_PURCHASE_ORDERS.filter(
      (p) => p.status === 'SENT_TO_SUPPLIER' || p.status === 'PARTLY_RECEIVED',
    ).length,
    billsToCheck: INITIAL_SUPPLIER_BILLS.filter(
      (b) => b.status === 'RECEIVED' || b.status === 'VERIFIED',
    ).length,
    toPayAmount: INITIAL_SUPPLIER_BILLS.filter((b) => b.status !== 'PAID').reduce(
      (acc, b) => acc + (b.totalAmount - b.paidAmount),
      0,
    ),
    openShortfalls: INITIAL_SHORTFALLS.filter((s) => s.status === 'OPEN').length,
    priceSpikes: INITIAL_PURCHASE_ORDERS.filter((p) => p.priceSpikeException).length,
  });

  useEffect(() => {
    // Hydrate pipeline counts from backend BFF when available
    Promise.allSettled([
      fetch('/api/bff/procurement/requisitions').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/bff/procurement/purchase-orders').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/bff/procurement/shortfalls/all/open').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/bff/procurement/supplier-bills').then((r) => (r.ok ? r.json() : null)),
    ]).then(([reqsRes, posRes, sfRes, billsRes]) => {
      const reqs = reqsRes.status === 'fulfilled' && Array.isArray(reqsRes.value?.data) ? reqsRes.value.data : null;
      const pos = posRes.status === 'fulfilled' && Array.isArray(posRes.value?.data) ? posRes.value.data : null;
      const sfs = sfRes.status === 'fulfilled' && Array.isArray(sfRes.value?.data) ? sfRes.value.data : null;
      const bills = billsRes.status === 'fulfilled' && Array.isArray(billsRes.value?.data) ? billsRes.value.data : null;

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

  const avgFillRate = (
    INITIAL_SUPPLIER_SCORECARDS.reduce((s, r) => s + r.fillRatePct, 0) /
    INITIAL_SUPPLIER_SCORECARDS.length
  ).toFixed(1);
  const avgOnTime = (
    INITIAL_SUPPLIER_SCORECARDS.reduce((s, r) => s + r.onTimePct, 0) /
    INITIAL_SUPPLIER_SCORECARDS.length
  ).toFixed(1);
  const monthlySpend = INITIAL_SUPPLIER_SCORECARDS.reduce((s, r) => s + r.monthlySpend, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Procurement &amp; Suppliers Pipeline
            </h1>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
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
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Live Purchase Pipeline (click any stage to open filtered workbench)
          </span>
          <span className="text-xs text-indigo-400">M2 Procurement · BR-03 &amp; BR-05 Guarded</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-stretch">
          {stages.map((stage, idx) => (
            <div key={stage.id} className="relative flex items-stretch">
              <Link
                href={stage.href}
                onMouseEnter={() => setSelectedStage(stage.id)}
                className={`flex-1 rounded-xl border bg-gradient-to-br p-4 transition-all hover:scale-[1.02] hover:border-indigo-400 ${stage.accent} ${
                  selectedStage === stage.id ? 'ring-1 ring-indigo-500/60' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-300">{stage.label}</span>
                  <span className="text-[11px] text-zinc-500 font-mono">0{idx + 1}</span>
                </div>
                <div className="text-2xl font-bold text-white mt-2 font-mono">
                  {stage.countOrValue}
                </div>
                <div className="text-[11px] text-zinc-400 mt-1">{stage.subLabel}</div>
              </Link>
              {idx < stages.length - 1 && (
                <div className="hidden md:flex items-center justify-center px-1 text-zinc-600 font-bold select-none">
                  ▶
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Exception Alert Strips */}
        <div className="mt-4 pt-4 border-t border-zinc-800/80 flex flex-wrap gap-3">
          <Link
            href="/procurement/shortfalls"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition-colors text-xs font-medium"
          >
            <span>⚠</span>
            <span>Shortfalls open ({liveStats.openShortfalls})</span>
            <span className="text-rose-400/80">→ Recover via backup PO</span>
          </Link>

          <Link
            href="/procurement/purchase-orders?status=WAITING_APPROVAL"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors text-xs font-medium"
          >
            <span>⚠</span>
            <span>Price spikes waiting approval ({liveStats.priceSpikes})</span>
            <span className="text-amber-400/80">→ Owner sign-off needed</span>
          </Link>

          <Link
            href="/procurement/scorecards"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 transition-colors text-xs font-medium"
          >
            <span>📉</span>
            <span>Missing rates alerts ({INITIAL_MISSING_RATES.length})</span>
            <span className="text-indigo-400/80">→ Update supplier quotes</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Spend This Month"
          value={formatINR(monthlySpend)}
          subtitle="Across 4 active suppliers"
          trend={{ value: '+4.2%', direction: 'up' }}
        />
        <KpiCard
          title="Avg Supplier Fill Rate"
          value={`${avgFillRate}%`}
          subtitle="Delivered vs ordered qty"
          trend={{ value: '+1.1%', direction: 'up' }}
        />
        <KpiCard
          title="On-Time Delivery"
          value={`${avgOnTime}%`}
          subtitle="Arrived by expected date"
          trend={{ value: '+0.8%', direction: 'up' }}
        />
        <KpiCard
          title="Open Shortfalls"
          value={String(liveStats.openShortfalls)}
          subtitle="Impacting 3 sales orders"
          trend={{ value: 'Action needed', direction: 'down' }}
        />
      </div>

      {/* Actionable Shortcuts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 bg-zinc-900 border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Ready to Convert Requisitions</h3>
            <Badge variant="info">{liveStats.openReqs} open</Badge>
          </div>
          <p className="text-xs text-zinc-400 mb-4">
            Group open requisitions by supplier to generate one consolidated Purchase Order per supplier.
          </p>
          <Link href="/procurement/requisitions?view=grouped">
            <Button variant="secondary" className="w-full">
              Group by Supplier &amp; Convert →
            </Button>
          </Link>
        </Card>

        <Card className="p-5 bg-zinc-900 border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Shortfall Recovery Workbench</h3>
            <Badge variant="danger">{liveStats.openShortfalls} open</Badge>
          </div>
          <p className="text-xs text-zinc-400 mb-4">
            Ranked backup suppliers within 2% tolerance (OD-010) ready for ≤3-click backup POs.
          </p>
          <Link href="/procurement/shortfalls">
            <Button variant="secondary" className="w-full">
              Open Shortfall Workbench →
            </Button>
          </Link>
        </Card>

        <Card className="p-5 bg-zinc-900 border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">3-Way Bill Verification &amp; AP</h3>
            <Badge variant="warning">{liveStats.billsToCheck} pending</Badge>
          </div>
          <p className="text-xs text-zinc-400 mb-4">
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

