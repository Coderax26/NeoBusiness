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
import { formatINR, type SessionUser } from '@neo/shared';

interface HomeSummary {
  todaySalesInr: number;
  todayInvoiceCount: number;
  grossMarginPct: number | null;
  cashCollectedInr: number;
  activeTripsCount: number;
  stagedOrdersCount: number;
  readyOrdersCount: number;
  activeBatchesCount: number;
  pendingHandoversCount: number;
  pendingChequesCount: number;
  pendingExceptionsCount: number;
  topException: {
    id: string;
    exception_type?: string;
    reason?: string;
    entity_id?: string;
    entity_type?: string;
  } | null;
  setupProgressPct: number;
  arAging: Array<{
    label: string;
    amount: string;
    count: number;
    tone: 'info' | 'warning' | 'danger';
  }>;
}

export default function RoleHomePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [homeSummary, setHomeSummary] = useState<HomeSummary | null>(null);
  const [orderSummary, setOrderSummary] = useState<{
    counts: Record<string, number>;
    totalOrders: number;
  } | null>(null);
  const [pendingExceptions, setPendingExceptions] = useState<
    Array<{ id?: string; exception_type?: string }>
  >([]);
  const [exceptionsLoaded, setExceptionsLoaded] = useState(false);
  const [todoList, setTodoList] = useState([
    { id: 'todo-1', label: 'Verify today’s base & floor prices', count: 'Check prices', href: '/sales/prices', done: false },
    { id: 'todo-2', label: 'Confirm draft sales orders', count: '0 pending', href: '/sales/orders', done: false },
    { id: 'todo-3', label: 'Build dispatch trips for ready orders', count: '0 ready', href: '/logistics/trips', done: false },
    { id: 'todo-4', label: 'Verify driver cash handovers', count: '0 waiting', href: '/finance/handovers', done: false },
    { id: 'todo-5', label: 'Bank cheque deposit register', count: '0 cheques', href: '/finance/cheques', done: false },
    { id: 'todo-6', label: 'Customer promises to pay (PTP) due today', count: 'Check PTPs', href: '/finance/invoices', done: false },
    { id: 'todo-7', label: 'Raw material procurement shortfall', count: 'Check shortfalls', href: '/procurement/shortfalls', done: false },
    { id: 'todo-8', label: 'Sign off yesterday’s EOD reconciliation', count: 'Check EOD', href: '/finance/eod', done: false },
  ]);

  useEffect(() => {
    let active = true;

    const loadDashboard = async (userData: any, overrideSiteId?: string) => {
      const storedSite =
        typeof window !== 'undefined'
          ? localStorage.getItem('neobus_active_site_id')
          : null;
      const effectiveSite =
        overrideSiteId ??
        storedSite ??
        userData?.activeSiteId ??
        userData?.assigned_site_id ??
        userData?.sites?.[0]?.id ??
        '';
      const siteQuery =
        effectiveSite && effectiveSite !== 'all'
          ? `?siteId=${encodeURIComponent(effectiveSite)}`
          : '';

      try {
        const [summaryRes, homeRes] = await Promise.all([
          fetch(`/api/proxy/orders/summary${siteQuery}`),
          fetch(`/api/proxy/dashboard/home-summary${siteQuery}`),
        ]);

        if (active && homeRes.ok) {
          const h: HomeSummary = await homeRes.json();
          if (h && typeof h === 'object') {
            setHomeSummary(h);
            setTodoList((prev) =>
              prev.map((item) => {
                if (item.id === 'todo-3') return { ...item, count: `${h.readyOrdersCount} ready` };
                if (item.id === 'todo-4') return { ...item, count: `${h.pendingHandoversCount} waiting` };
                if (item.id === 'todo-5') return { ...item, count: `${h.pendingChequesCount} cheques` };
                return item;
              }),
            );
          }
        }

        if (active && summaryRes.ok) {
          const summary = await summaryRes.json();
          if (summary && typeof summary === 'object') {
            setOrderSummary(summary);
            const draftOrPending =
              (summary.counts?.DRAFT ?? 0) +
              (summary.counts?.PENDING_APPROVAL ?? 0);
            const readyCount = summary.counts?.READY ?? 0;
            setTodoList((prev) =>
              prev.map((item) => {
                if (item.id === 'todo-2') {
                  return { ...item, count: `${draftOrPending} pending` };
                }
                if (item.id === 'todo-3') {
                  return { ...item, count: `${readyCount} ready` };
                }
                return item;
              }),
            );
          }
        }
      } catch {
        // ignore network error; empty-state defaults stay visible
      }

      if (userData?.role === 'OWNER') {
        try {
          const exRes = await fetch('/api/proxy/exceptions?status=PENDING');
          if (active && exRes.ok) {
            const exList = await exRes.json();
            if (Array.isArray(exList)) {
              setPendingExceptions(exList);
              setExceptionsLoaded(true);
            }
          }
        } catch {
          // ignore network error
        }
      }
    };

    let currentUser: any = null;
    const onSiteChanged = (ev: Event) => {
      const nextSiteId = (ev as CustomEvent<string>).detail;
      if (currentUser) void loadDashboard(currentUser, nextSiteId);
    };
    window.addEventListener('neobus-site-changed', onSiteChanged);

    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then(async (data) => {
        if (!active || !data?.user) return;
        currentUser = data.user;
        setUser(data.user);
        await loadDashboard(data.user);
      })
      .catch(() => {});

    return () => {
      active = false;
      window.removeEventListener('neobus-site-changed', onSiteChanged);
    };
  }, []);

  const pendingCount = exceptionsLoaded
    ? pendingExceptions.length
    : (orderSummary?.counts?.PENDING_APPROVAL ?? 0);
  const priceOverrideCount = pendingExceptions.filter(
    (e) => e.exception_type === 'PRICE_OVERRIDE',
  ).length;
  const creditBreachCount = pendingExceptions.filter(
    (e) => e.exception_type === 'CREDIT_BREACH',
  ).length;
  const otherExceptionCount = Math.max(
    0,
    pendingCount - priceOverrideCount - creditBreachCount,
  );

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
          <Link href="/control/approvals">
            <Button variant="secondary" size="md">
              Approvals Inbox
            </Button>
          </Link>
        </div>
      </div>

      {/* Setup Wizard Progress Card (Owner only, F3-01) */}
      {isOwner && (
        <div className="p-4 rounded-2xl border border-teal-500/30 bg-teal-950/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/40 flex items-center justify-center text-lg font-bold">
              🚀
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">
                  Your business is {homeSummary?.setupProgressPct ?? 0}% set up
                </h2>
                <Badge tone="brand">Setup in progress</Badge>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5">
                Complete Item Catalog, Suppliers, and Opening Balances to finish preparation.
              </p>
            </div>
          </div>
          <Link href="/admin/setup-wizard">
            <Button variant="primary" size="sm">
              Continue Setup Wizard →
            </Button>
          </Link>
        </div>
      )}

      {/* 2. Global Banners / Needs Attention First */}
      <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">⚠️</span>
          <div>
            <h2 className="text-sm font-bold text-amber-200">
              {pendingCount} {pendingCount === 1 ? 'Approval Requires' : 'Approvals Require'} Attention Today
            </h2>
            <p className="text-xs text-amber-300/80 mt-0.5 leading-relaxed">
              {exceptionsLoaded
                ? pendingCount === 0
                  ? 'No pending approval exceptions right now.'
                  : `${priceOverrideCount} price override(s), ${creditBreachCount} credit breach(es), and ${otherExceptionCount} other exception(s).`
                : `${orderSummary?.counts?.PENDING_APPROVAL ?? 0} sales order(s) awaiting approval in database.`}
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
          value={formatINR(homeSummary?.todaySalesInr ?? 0)}
          subtitle={`${homeSummary?.todayInvoiceCount ?? 0} invoices in system`}
          trend={{ direction: 'neutral', label: 'Live DB' }}
          tone="default"
        />
        <KpiCard
          title="Gross Margin"
          value={
            isOwner
              ? `${Number(homeSummary?.grossMarginPct ?? 0).toFixed(1)}%`
              : 'Owner Only'
          }
          subtitle="Live materialized pulse"
          trend={{ direction: 'neutral', label: isOwner ? 'Owner view' : 'Restricted' }}
          tone="success"
        />
        <KpiCard
          title="Cash & Cheques in Custody"
          value={formatINR(homeSummary?.cashCollectedInr ?? 0)}
          subtitle={`${homeSummary?.activeTripsCount ?? 0} active routes`}
          trend={{ direction: 'neutral', label: 'EOD handover' }}
          tone="warning"
        />
        <KpiCard
          title="Actionable Exceptions"
          value={`${pendingCount} Pending`}
          subtitle={
            exceptionsLoaded
              ? `${priceOverrideCount + creditBreachCount} commercial, ${otherExceptionCount} operational`
              : `${orderSummary?.counts?.PENDING_APPROVAL ?? 0} orders pending approval`
          }
          trend={{
            direction: pendingCount > 0 ? 'down' : 'up',
            label: pendingCount > 0 ? 'Action required' : 'All clear',
          }}
          tone={pendingCount > 0 ? 'danger' : 'good'}
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
                expected={`${homeSummary?.stagedOrdersCount ?? 0} Staged`}
                actual={`${homeSummary?.readyOrdersCount ?? 0} Ready`}
                variance={`${homeSummary?.stagedOrdersCount ?? 0} in pipeline`}
                isFavorable={(homeSummary?.readyOrdersCount ?? 0) > 0}
              />
              <StatCompare
                label="Active Production Batches"
                expected="Work Orders"
                actual={`${homeSummary?.activeBatchesCount ?? 0} Active`}
                variance="Live factory status"
                isFavorable={true}
              />
              <StatCompare
                label="Fleet Trucks on Road"
                expected="Dispatched"
                actual={`${homeSummary?.activeTripsCount ?? 0} Active`}
                variance="Live trips"
                isFavorable={true}
              />
              <StatCompare
                label="Pending Cash Handovers"
                expected="0 Pending"
                actual={`${homeSummary?.pendingHandoversCount ?? 0} Pending`}
                variance={`${homeSummary?.pendingChequesCount ?? 0} cheques`}
                isFavorable={(homeSummary?.pendingHandoversCount ?? 0) === 0}
              />
            </div>

            <div className="pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                Accounts Receivable Aging Breakdown
              </h4>
              <AgingBuckets
                buckets={
                  homeSummary?.arAging ?? [
                    { label: '0 – 7 Days', amount: '0.00', count: 0, tone: 'info' },
                    { label: '8 – 15 Days', amount: '0.00', count: 0, tone: 'warning' },
                    { label: '16 – 30 Days', amount: '0.00', count: 0, tone: 'warning' },
                    { label: '30+ Days (Overdue)', amount: '0.00', count: 0, tone: 'danger' },
                  ]
                }
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

            {homeSummary?.topException ? (
              <ExceptionCard
                id={homeSummary.topException.id}
                type={homeSummary.topException.exception_type ?? 'APPROVAL_REQUIRED'}
                title={`${homeSummary.topException.entity_type ?? 'Order'} ${homeSummary.topException.entity_id ?? homeSummary.topException.id}`}
                summary={homeSummary.topException.reason ?? 'Requires owner approval.'}
                impact="Pending review in Approvals Inbox."
                onApprove={async () => {
                  await fetch(`/api/proxy/exceptions/${encodeURIComponent(homeSummary.topException!.id)}/resolve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ decision: 'APPROVE' }),
                  });
                  setHomeSummary((prev) => (prev ? { ...prev, topException: null } : prev));
                }}
                onReject={async () => {
                  await fetch(`/api/proxy/exceptions/${encodeURIComponent(homeSummary.topException!.id)}/resolve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ decision: 'REJECT' }),
                  });
                  setHomeSummary((prev) => (prev ? { ...prev, topException: null } : prev));
                }}
              />
            ) : (
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 text-xs text-zinc-400">
                No open exceptions in database.
              </div>
            )}
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
