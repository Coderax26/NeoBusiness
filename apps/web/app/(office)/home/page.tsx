'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  KpiCard,
  Button,
  AgingBuckets,
  StatCompare,
  ExceptionCard,
  Badge,
} from '@neo/ui';
import type { SessionUser } from '@neo/shared';

export default function RoleHomePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [todoList, setTodoList] = useState([
    { id: 'todo-1', label: 'Verify today’s base & floor prices', count: '1 missing', href: '/sales/prices', done: false },
    { id: 'todo-2', label: 'Confirm draft sales orders', count: '6 pending', href: '/sales/orders', done: false },
    { id: 'todo-3', label: 'Build dispatch trips for ready orders', count: '4 ready', href: '/logistics/trips', done: false },
    { id: 'todo-4', label: 'Verify driver cash handovers', count: '3 waiting', href: '/finance/handovers', done: false },
    { id: 'todo-5', label: 'Bank cheque deposit register', count: '2 cheques', href: '/finance/cheques', done: false },
    { id: 'todo-6', label: 'Customer promises to pay (PTP) due today', count: '5 due', href: '/finance/invoices', done: false },
    { id: 'todo-7', label: 'Raw material procurement shortfall', count: '1 open', href: '/procurement/shortfalls', done: false },
    { id: 'todo-8', label: 'Sign off yesterday’s EOD reconciliation', count: 'Pending', href: '/finance/eod', done: false },
  ]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  const toggleTodo = (id: string) => {
    setTodoList((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  };

  const isOwner = !user || user.role === 'OWNER';

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* 1. Welcoming Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            {isOwner ? `Good morning, ${user?.name || 'Owner'} 👋` : `Operations Desk — ${user?.name || 'Coordinator'}`}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {isOwner
              ? "Here's the pulse of your business across all active sites today."
              : 'Your daily operations checklist and prioritized handovers.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/sales/orders/new">
            <Button variant="primary" size="md">
              + New Quick Order
            </Button>
          </Link>
          <Link href="/approvals">
            <Button variant="secondary" size="md">
              Approvals Inbox
            </Button>
          </Link>
        </div>
      </div>

      {/* 2. Global Banners / Needs Attention First */}
      <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">⚠️</span>
          <div>
            <h2 className="text-sm font-bold text-amber-200">
              3 Approvals Require Attention Today
            </h2>
            <p className="text-xs text-amber-300/80 mt-0.5 leading-relaxed">
              1 price override below floor, 1 customer credit limit breach, and 1 supplier price spike.
            </p>
          </div>
        </div>
        <Link href="/approvals">
          <Button variant="secondary" size="sm" className="bg-amber-500/20 text-amber-200 border-amber-500/40">
            Resolve Exceptions →
          </Button>
        </Link>
      </div>

      {/* 3. Pulse KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Today's Sales (OD-020)"
          value="₹4,82,450"
          subtitle="42 invoices issued today"
          trend={{ direction: 'up', label: '+14% vs yesterday' }}
          sparklineValues={[310, 340, 290, 420, 390, 450, 482]}
          tone="default"
        />
        <KpiCard
          title="Gross Margin"
          value="18.4%"
          subtitle="Target: 18.0%"
          trend={{ direction: 'up', label: '+0.4% in band' }}
          sparklineValues={[16.2, 17.1, 17.5, 17.9, 18.2, 18.4]}
          tone="success"
        />
        <KpiCard
          title="Cash & Cheques in Custody"
          value="₹1,24,500"
          subtitle="8 drivers on active routes"
          trend={{ direction: 'neutral', label: 'EOD handover' }}
          sparklineValues={[90, 95, 100, 105, 110, 124]}
          tone="warning"
        />
        <KpiCard
          title="Actionable Exceptions"
          value="3 Pending"
          subtitle="2 commercial, 1 supply"
          trend={{ direction: 'down', label: 'Action required' }}
          sparklineValues={[7, 6, 5, 4, 3, 3]}
          tone="danger"
        />
      </div>

      {/* 4. Owner View: Operations Status Matrix & AR Waterfall OR Coordinator To-Do Checklist */}
      {isOwner ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Operations Status Matrix */}
          <div className="lg:col-span-2 p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Live Operations Status Matrix
              </h3>
              <span className="text-[11px] text-teal-400 font-mono">Auto-refreshed 30s</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-sans">
              <StatCompare
                label="Orders Staged for Dispatch"
                expected="18 Orders"
                actual="14 Orders"
                variance="-4 Pending"
                isFavorable={false}
              />
              <StatCompare
                label="Active Production Batches"
                expected="6 Batches"
                actual="6 Batches"
                variance="On Schedule"
                isFavorable={true}
              />
              <StatCompare
                label="Fleet Trucks on Road"
                expected="8 Trucks"
                actual="8 Active"
                variance="100% En Route"
                isFavorable={true}
              />
              <StatCompare
                label="Procurement Shortfall"
                expected="0 Items"
                actual="1 Item"
                variance="Alphonso 2MT"
                isFavorable={false}
              />
            </div>

            <div className="pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                Accounts Receivable Aging Breakdown
              </h4>
              <AgingBuckets
                buckets={[
                  { label: '0 – 7 Days', amount: '340000.00', count: 18, tone: 'info' },
                  { label: '8 – 15 Days', amount: '124000.00', count: 8, tone: 'warning' },
                  { label: '16 – 30 Days', amount: '68000.00', count: 4, tone: 'warning' },
                  { label: '30+ Days (Overdue)', amount: '32000.00', count: 2, tone: 'danger' },
                ]}
              />
            </div>
          </div>

          {/* Quick Exceptions Approval Mini-Feed */}
          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Top Priority Exception
              </h3>
              <Link href="/approvals" className="text-xs text-teal-400 hover:text-teal-300">
                See all →
              </Link>
            </div>

            <ExceptionCard
              id="EXP-001"
              type="PRICE_BELOW_FLOOR"
              title="SO-2611-0042 Price Override"
              summary="Quoted ₹420/kg for Alphonso Pulp (Floor: ₹435/kg). 1,200 kg."
              impact="Gross margin drops to 12.8% (-₹18,000)."
              onApprove={() => alert('Approved')}
              onReject={() => alert('Rejected')}
            />
          </div>
        </div>
      ) : (
        /* Coordinator View: Interactive To-Do Checklist */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Daily Operations To-Do Checklist</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Click any task to jump straight to the filtered workspace
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-teal-500/20 text-teal-300 font-bold font-mono">
                {todoList.filter((t) => t.done).length} / {todoList.length} Done
              </span>
            </div>

            <div className="divide-y divide-zinc-800">
              {todoList.map((item) => (
                <div
                  key={item.id}
                  className="py-3 flex items-center justify-between hover:bg-zinc-800/40 px-3 rounded-lg transition-colors"
                >
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleTodo(item.id)}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-teal-600 focus:ring-teal-500"
                    />
                    <span
                      className={`text-xs font-medium ${
                        item.done ? 'line-through text-zinc-500' : 'text-zinc-200'
                      }`}
                    >
                      {item.label}
                    </span>
                  </label>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {item.count}
                    </span>
                    <Link
                      href={item.href}
                      className="text-xs font-semibold text-teal-400 hover:text-teal-300"
                    >
                      Open →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 border-b border-zinc-800 pb-3">
              Fast Shortcuts
            </h3>
            <div className="flex flex-col gap-2.5">
              <Link href="/sales/orders/new">
                <Button variant="secondary" size="md" className="w-full justify-start text-xs">
                  📝 New Sales Order (N)
                </Button>
              </Link>
              <Link href="/logistics/trips">
                <Button variant="secondary" size="md" className="w-full justify-start text-xs">
                  🚚 Plan Dispatch Trip
                </Button>
              </Link>
              <Link href="/finance/handovers">
                <Button variant="secondary" size="md" className="w-full justify-start text-xs">
                  💵 Verify Driver Handover
                </Button>
              </Link>
              <Link href="/finance/eod">
                <Button variant="secondary" size="md" className="w-full justify-start text-xs">
                  🔒 Day Closing (EOD)
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
