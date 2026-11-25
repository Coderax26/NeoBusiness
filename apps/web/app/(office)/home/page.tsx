'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, AgingBuckets, StatCompare } from '@neo/ui';
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

function getGreetingPrefix() {
  const hr = new Date().getHours();
  if (hr < 12) return 'Good morning';
  if (hr < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function RoleHomePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [homeSummary, setHomeSummary] = useState<HomeSummary | null>(null);
  const [orderSummary, setOrderSummary] = useState<{
    counts: Record<string, number>;
    totalOrders: number;
  } | null>(null);
  const [pendingExceptions, setPendingExceptions] = useState<
    Array<{
      id?: string;
      exception_type?: string;
      reason?: string;
      entity_type?: string;
      entity_id?: string;
      title?: string;
      waiting_minutes?: number;
      value_at_risk?: number;
    }>
  >([]);
  const [exceptionsLoaded, setExceptionsLoaded] = useState(false);
  const [greeting, setGreeting] = useState('Good evening');
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
    setGreeting(getGreetingPrefix());
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
        // keep defaults
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
          // ignore
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

  const toggleTodo = (id: string) => {
    setTodoList((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  };

  const resolveTopException = async (excId: string, decision: 'APPROVE' | 'REJECT') => {
    await fetch(`/api/proxy/exceptions/${encodeURIComponent(excId)}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, action: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED' }),
    });
    setPendingExceptions((prev) => prev.filter((e) => e.id !== excId));
    setHomeSummary((prev) => (prev && prev.topException?.id === excId ? { ...prev, topException: null } : prev));
  };

  const isOwner = !user || user.role === 'OWNER';
  const firstName = (user?.name || (isOwner ? 'Owner' : 'Coordinator')).split(' ')[0];

  const orderCounts = orderSummary?.counts ?? {};
  const flowSteps = [
    { label: 'Draft', count: orderCounts.DRAFT ?? 0, tone: 'default' },
    { label: 'Confirmed', count: orderCounts.CONFIRMED ?? 0, tone: 'default' },
    { label: 'Being made', count: orderCounts.IN_PRODUCTION_SOURCING ?? 0, tone: 'default' },
    { label: 'Ready · need a trip', count: homeSummary?.readyOrdersCount ?? orderCounts.READY ?? 0, tone: 'hot' },
    { label: 'On the road', count: orderCounts.DISPATCHED ?? 0, tone: 'default' },
    { label: 'Delivered', count: (orderCounts.DELIVERED ?? 0) + (orderCounts.DELIVERED_FULL ?? 0), tone: 'done' },
  ];

  const decisionItems =
    pendingExceptions.length > 0
      ? pendingExceptions.slice(0, 3)
      : homeSummary?.topException
      ? [homeSummary.topException]
      : [];

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* 1. Morning / Evening Brief Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[34px] sm:text-[38px] leading-[1.1] font-medium tracking-[-0.012em] text-ink">
            {isOwner ? `${greeting}, ${firstName}.` : `Operations Desk — ${user?.name || 'Coordinator'}`}
          </h1>
          <p className="text-[16.5px] leading-relaxed text-ink-2 mt-2 max-w-2xl">
            {isOwner ? (
              <>
                You&apos;ve sold <strong className="font-semibold text-ink">{formatINR(homeSummary?.todaySalesInr ?? 0)}</strong> today across{' '}
                {homeSummary?.todayInvoiceCount ?? 0} invoices.{' '}
                <strong className="font-semibold text-ink">
                  {pendingCount} {pendingCount === 1 ? 'decision is' : 'decisions are'}
                </strong>{' '}
                waiting for you.
              </>
            ) : (
              'Your daily operations checklist and prioritized handovers.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Link href="/sales/orders/new">
            <Button variant="primary" size="md">
              + New Quick Order
            </Button>
          </Link>
          <Link href="/control/approvals">
            <Button variant="secondary" size="md">
              Approvals
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Two-Column Ledger Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 pt-2">
        {/* Left Column */}
        <div className="space-y-8 min-w-0">
          {isOwner ? (
            <>
              {/* Needs Your Decision (First, always) */}
              <section>
                <div className="flex items-baseline justify-between pb-2 bahi-section-rule">
                  <h2 className="text-[15px] font-semibold text-ink">
                    Needs your decision{' '}
                    <span className="text-ink-3 font-medium ml-1.5">{pendingCount}</span>
                  </h2>
                  <Link href="/control/approvals" className="text-[13.5px] font-medium text-action hover:underline">
                    Open approvals →
                  </Link>
                </div>

                {decisionItems.length === 0 ? (
                  <div className="py-5 border-b border-rule text-[14px] text-leaf">
                    All decisions cleared — nothing waiting in the queue.
                  </div>
                ) : (
                  <div className="divide-y divide-rule border-b border-rule">
                    {decisionItems.map((exc: any, idx: number) => {
                      const isCredit = String(exc.exception_type || '').includes('CREDIT');
                      return (
                        <div key={exc.id || idx} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-3 text-[13px]">
                              <span className={`inline-flex items-center gap-1.5 font-semibold ${isCredit ? 'text-madder' : 'text-haldi'}`}>
                                <span
                                  className={`w-[7px] h-[7px] bg-current ${
                                    isCredit ? 'rounded-[1px] rotate-45' : 'rounded-full'
                                  }`}
                                />
                                {(exc.exception_type || 'APPROVAL_REQUIRED').replace(/_/g, ' ')}
                              </span>
                              {exc.entity_id && (
                                <span className="text-ink-3 font-mono text-[12.5px]">{exc.entity_id}</span>
                              )}
                            </div>
                            <div className="text-[15px] font-medium text-ink mt-1">
                              {exc.title || exc.reason || `${exc.entity_type ?? 'Order'} ${exc.entity_id ?? exc.id}`}
                            </div>
                            <div className="text-[13px] text-ink-2 mt-0.5">
                              {exc.reason || 'Pending owner authorization.'}
                            </div>
                          </div>
                          {exc.id && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button size="sm" variant="primary" onClick={() => resolveTopException(exc.id, 'APPROVE')}>
                                Approve
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => resolveTopException(exc.id, 'REJECT')}>
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Today in Numbers (Ruled 4-column ledger strip) */}
              <section>
                <div className="flex items-baseline justify-between pb-2 bahi-section-rule">
                  <h2 className="text-[15px] font-semibold text-ink">Today in numbers</h2>
                  <span className="text-[13px] text-ink-3">Live business pulse</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-rule">
                  <div className="py-3.5 pr-4" title="Today's Sales (OD-020)">
                    <div className="text-[13px] text-ink-2">Sales</div>
                    <div className="font-serif text-[28px] leading-tight font-medium text-ink mt-1 tabular-nums">
                      {formatINR(homeSummary?.todaySalesInr ?? 0)}
                    </div>
                    <div className="text-[12.5px] text-ink-3 mt-1">
                      {homeSummary?.todayInvoiceCount ?? 0} invoices today
                    </div>
                  </div>

                  <div className="py-3.5 pl-4 sm:border-l border-rule pr-4">
                    <div className="text-[13px] text-ink-2">Collected</div>
                    <div className="font-serif text-[28px] leading-tight font-medium text-ink mt-1 tabular-nums">
                      {formatINR(homeSummary?.cashCollectedInr ?? 0)}
                    </div>
                    <div className="text-[12.5px] text-ink-3 mt-1">
                      {homeSummary?.pendingHandoversCount ?? 0} handovers pending
                    </div>
                  </div>

                  <div className="py-3.5 sm:pl-4 sm:border-l border-rule pr-4">
                    <div className="text-[13px] text-ink-2">Gross Margin</div>
                    <div className="font-serif text-[28px] leading-tight font-medium text-ink mt-1 tabular-nums">
                      {`${Number(homeSummary?.grossMarginPct ?? 0).toFixed(1)}%`}
                    </div>
                    <div className="text-[12.5px] text-ink-3 mt-1">Target 15%</div>
                  </div>

                  <div className="py-3.5 pl-4 border-l border-rule">
                    <div className="text-[13px] text-ink-2">Pending Approvals</div>
                    <div className={`font-serif text-[28px] leading-tight font-medium mt-1 tabular-nums ${pendingCount > 0 ? 'text-haldi' : 'text-leaf'}`}>
                      {pendingCount}
                    </div>
                    <div className="text-[12.5px] text-ink-3 mt-1">
                      {pendingCount > 0 ? 'Needs your review' : 'All clear'}
                    </div>
                  </div>
                </div>
              </section>

              {/* Orders Moving Today (Horizontal dashed flow line) */}
              <section>
                <div className="flex items-baseline justify-between pb-2 bahi-section-rule">
                  <h2 className="text-[15px] font-semibold text-ink">Orders moving today</h2>
                  <Link href="/sales/orders" className="text-[13.5px] font-medium text-action hover:underline">
                    All orders →
                  </Link>
                </div>

                <div className="relative flex flex-wrap sm:flex-nowrap justify-between gap-4 pt-4 pb-2">
                  <div
                    aria-hidden="true"
                    className="hidden sm:block absolute left-10 right-10 top-[34px] border-t border-dashed border-rule-strong"
                  />
                  {flowSteps.map((step) => (
                    <div key={step.label} className="relative z-10 text-center min-w-[84px] flex-1">
                      <div
                        className={`font-serif text-[26px] leading-none font-medium bg-sheet px-2.5 py-1 inline-block tabular-nums ${
                          step.tone === 'hot'
                            ? 'text-action'
                            : step.tone === 'done'
                            ? 'text-leaf'
                            : 'text-ink'
                        }`}
                      >
                        {step.count}
                      </div>
                      <div
                        className={`text-[13px] mt-1.5 ${
                          step.tone === 'hot' ? 'text-action font-semibold' : 'text-ink-2'
                        }`}
                      >
                        {step.label}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Live Operations Status Matrix & Accounts Receivable Aging Breakdown */}
              <section className="space-y-4">
                <div className="flex items-baseline justify-between pb-2 bahi-section-rule">
                  <h3 className="text-[15px] font-semibold text-ink">
                    Live Operations Status Matrix
                  </h3>
                  <span className="text-[13px] text-ink-3">Auto-refreshed 30s</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    variance="Factory floor"
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
                  <h4 className="text-[14px] font-semibold text-ink mb-2.5">
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
              </section>
            </>
          ) : (
            /* Coordinator View: Ruled Daily Operations To-Do Checklist */
            <section>
              <div className="flex items-baseline justify-between pb-2 bahi-section-rule">
                <div>
                  <h2 className="text-[15px] font-semibold text-ink">Daily Operations To-Do Checklist</h2>
                  <p className="text-[13px] text-ink-3 mt-0.5">
                    Click any task to jump straight to the filtered workspace
                  </p>
                </div>
                <span className="text-[13px] font-mono text-action font-semibold">
                  {todoList.filter((t) => t.done).length} / {todoList.length} Done
                </span>
              </div>

              <div className="divide-y divide-rule border-b border-rule">
                {todoList.map((item) => (
                  <div
                    key={item.id}
                    className="py-3 flex items-center justify-between hover:bg-paper/60 px-2 -mx-2 rounded-[3px] transition-colors"
                  >
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => toggleTodo(item.id)}
                        className="w-4 h-4 rounded-[2px] border-rule-strong text-action focus:ring-action"
                      />
                      <span
                        className={`text-[14px] font-medium ${
                          item.done ? 'line-through text-ink-3' : 'text-ink'
                        }`}
                      >
                        {item.label}
                      </span>
                    </label>

                    <div className="flex items-center gap-3">
                      <span className="text-[13px] font-mono px-2 py-0.5 rounded-[3px] bg-paper border border-rule text-ink-2">
                        {item.count}
                      </span>
                      <Link
                        href={item.href}
                        className="text-[13.5px] font-medium text-action hover:underline"
                      >
                        Open →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right Column (340px with hairline left rule) */}
        <aside className="lg:border-l lg:border-rule lg:pl-7 space-y-7">
          {/* Setup Progress (Owner only) */}
          {isOwner && (
            <div className="pb-5 border-b border-rule space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-semibold text-ink">
                  Your business is {homeSummary?.setupProgressPct ?? 0}% set up
                </h3>
              </div>
              <p className="text-[13px] text-ink-2 leading-relaxed">
                Complete Item Catalog, Suppliers, and Opening Balances to finish preparation.
              </p>
              <Link href="/admin/setup-wizard" className="inline-block">
                <Button variant="secondary" size="sm">
                  Continue Setup Wizard →
                </Button>
              </Link>
            </div>
          )}

          {/* Still to do today */}
          <div>
            <div className="flex items-baseline justify-between pb-2 bahi-section-rule">
              <h2 className="text-[15px] font-semibold text-ink">Still to do today</h2>
            </div>
            <ul className="divide-y divide-rule">
              <li className="py-2.5 flex gap-3 items-baseline text-[14px]">
                <span className="font-mono text-[12.5px] text-ink-3 w-14 shrink-0">Handover</span>
                <Link href="/finance/handovers" className="hover:text-action">
                  <span className="font-medium text-ink">Driver cash handovers</span>
                  <span className="block text-[13px] text-ink-3">
                    {homeSummary?.pendingHandoversCount ?? 0} waiting for verification
                  </span>
                </Link>
              </li>
              <li className="py-2.5 flex gap-3 items-baseline text-[14px]">
                <span className="font-mono text-[12.5px] text-ink-3 w-14 shrink-0">EOD</span>
                <Link href="/finance/eod" className="hover:text-action">
                  <span className="font-medium text-ink">Close the day</span>
                  <span className="block text-[13px] text-ink-3">Reconcile cash, bank &amp; cheques</span>
                </Link>
              </li>
              <li className="py-2.5 flex gap-3 items-baseline text-[14px]">
                <span className="font-mono text-[12.5px] text-ink-3 w-14 shrink-0">Prices</span>
                <Link href="/sales/prices" className="hover:text-action">
                  <span className="font-medium text-ink">Review daily price band</span>
                  <span className="block text-[13px] text-ink-3">Base, floor &amp; target rates</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Fast Shortcuts */}
          <div>
            <div className="flex items-baseline justify-between pb-2 bahi-section-rule">
              <h2 className="text-[15px] font-semibold text-ink">Fast Shortcuts</h2>
            </div>
            <ul className="divide-y divide-rule text-[14px]">
              <li>
                <Link href="/sales/orders/new" className="flex items-center justify-between py-2.5 text-ink-2 hover:text-action">
                  <span>New Sales Order</span>
                  <span className="text-ink-3">→</span>
                </Link>
              </li>
              <li>
                <Link href="/logistics/trips" className="flex items-center justify-between py-2.5 text-ink-2 hover:text-action">
                  <span>Plan Dispatch Trip</span>
                  <span className="text-ink-3">→</span>
                </Link>
              </li>
              <li>
                <Link href="/procurement/shortfalls" className="flex items-center justify-between py-2.5 text-ink-2 hover:text-action">
                  <span>Check Short Supplies</span>
                  <span className="text-ink-3">→</span>
                </Link>
              </li>
              <li>
                <Link href="/inventory/expiry" className="flex items-center justify-between py-2.5 text-ink-2 hover:text-action">
                  <span>Expiry Watchlist</span>
                  <span className="text-ink-3">→</span>
                </Link>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
