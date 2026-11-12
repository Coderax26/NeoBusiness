'use client';

import React from 'react';
import Link from 'next/link';
import { KpiCard } from '../../src/components/ui/KpiCard';
import { Button } from '../../src/components/ui/Button';

export default function HomePage() {
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Banner / Exception First (Principle P1) */}
      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h2 className="text-sm font-bold text-amber-200">
              3 Approvals Require Attention Today
            </h2>
            <p className="text-xs text-amber-300/80 mt-0.5">
              1 price override below floor, 1 credit limit breach, 1 supplier price spike.
            </p>
          </div>
        </div>
        <Link href="/approvals">
          <Button variant="secondary" size="sm" className="bg-amber-500/20 text-amber-200 border-amber-500/40">
            Review Approvals Inbox →
          </Button>
        </Link>
      </div>

      {/* Hero KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Today's Booked Sales"
          value="₹4,28,500"
          subtitle="42 orders confirmed"
          trend={{ direction: 'up', label: '+14% vs yesterday' }}
          sparklineValues={[310, 340, 290, 420, 390, 450, 428]}
          tone="default"
        />
        <KpiCard
          title="Deliveries In-Flight"
          value="18 Trips"
          subtitle="94% loaded on-time"
          trend={{ direction: 'up', label: '142 stops active' }}
          sparklineValues={[12, 14, 15, 17, 16, 18, 18]}
          tone="success"
        />
        <KpiCard
          title="Cash in Driver Custody"
          value="₹1,12,400"
          subtitle="Expected at EOD handover"
          trend={{ direction: 'neutral', label: '8 drivers' }}
          sparklineValues={[90, 95, 100, 105, 110, 112]}
          tone="warning"
        />
        <KpiCard
          title="Stock Expiry Watchlist"
          value="4 Batches"
          subtitle="Expiring within 7 days"
          trend={{ direction: 'down', label: 'Action required' }}
          sparklineValues={[8, 7, 6, 5, 4, 4]}
          tone="danger"
        />
      </div>

      {/* Quick Actions Strip */}
      <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Fast Actions (One-Click Operations)
        </h3>
        <div className="flex flex-wrap gap-3">
          <Link href="/sales/orders/new">
            <Button variant="primary" size="md">
              + Quick Order Entry
            </Button>
          </Link>
          <Link href="/procurement/requisitions">
            <Button variant="secondary" size="md">
              + Purchase Requisition
            </Button>
          </Link>
          <Link href="/inventory/stock-counts">
            <Button variant="secondary" size="md">
              + New Stock Count Sheet
            </Button>
          </Link>
          <Link href="/finance/handovers">
            <Button variant="secondary" size="md">
              Verify Cash Handover
            </Button>
          </Link>
          <Link href="/reports">
            <Button variant="ghost" size="md">
              View GST & Sales Registers →
            </Button>
          </Link>
        </div>
      </div>

      {/* Module Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <span>🛒</span> Commercial & Orders Tracker
            </h4>
            <Link href="/sales/orders" className="text-xs text-indigo-400 hover:underline">
              View All Orders →
            </Link>
          </div>
          <p className="text-xs text-zinc-400">
            Real-time sales lifecycle: draft orders, price band confirmations, kitchen dispatch, and delivery status tracking.
          </p>
          <div className="pt-2 flex gap-4 text-xs font-mono text-zinc-300">
            <div><span className="text-zinc-500">CONFIRMED:</span> 18</div>
            <div><span className="text-zinc-500">IN PRODUCTION:</span> 12</div>
            <div><span className="text-zinc-500">DISPATCHED:</span> 10</div>
          </div>
        </div>

        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <span>🚚</span> Logistics & Fleet Operations
            </h4>
            <Link href="/logistics/trips" className="text-xs text-indigo-400 hover:underline">
              Dispatch Board →
            </Link>
          </div>
          <p className="text-xs text-zinc-400">
            Vehicle loading confirmations (G-FLT-2), electronic delivery challans, and instant cash handover reconciliations.
          </p>
          <div className="pt-2 flex gap-4 text-xs font-mono text-zinc-300">
            <div><span className="text-zinc-500">SCHEDULED:</span> 3</div>
            <div><span className="text-zinc-500">LOADING:</span> 2</div>
            <div><span className="text-zinc-500">IN TRANSIT:</span> 13</div>
          </div>
        </div>
      </div>
    </div>
  );
}

