'use client';

import React, { useMemo, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatINR } from '@neo/shared';

export default function FinanceHomePage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [arAging, setArAging] = useState<any[]>([]);
  const [handovers, setHandovers] = useState<any[]>([]);
  const [cheques, setCheques] = useState<any[]>([]);
  const [ptps, setPtps] = useState<any[]>([]);
  const [codStops, setCodStops] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    const storedSite =
      typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') : null;
    const siteQuery =
      storedSite && storedSite !== 'all' ? `?siteId=${encodeURIComponent(storedSite)}` : '';
    Promise.allSettled([
      fetch(`/api/proxy/invoices${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/collections/receipts${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/analytics/ar/aging${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/handovers${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/cheques${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/ptp${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/cod-settlements/pending${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([invRes, rcpRes, arRes, hndRes, chqRes, ptpRes, codRes]) => {
        if (!active) return;
        const pick = (r: PromiseSettledResult<any>) =>
          r.status === 'fulfilled'
            ? Array.isArray(r.value)
              ? r.value
              : Array.isArray(r.value?.data)
                ? r.value.data
                : []
            : [];
        setInvoices(pick(invRes));
        setReceipts(pick(rcpRes));
        setArAging(pick(arRes));
        setHandovers(pick(hndRes));
        setCheques(pick(chqRes));
        setPtps(pick(ptpRes));
        setCodStops(pick(codRes));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const invoicedToday = useMemo(
    () =>
      invoices
        .filter((i) => String(i.invoiceDate || i.invoice_date || '').startsWith(today))
        .reduce((s, i) => s + Number(i.totalAmount ?? i.total_amount ?? 0), 0),
    [invoices, today],
  );
  const collectedToday = useMemo(
    () =>
      receipts
        .filter((r) => String(r.date || r.payment_date || '').startsWith(today) && !r.reversed)
        .reduce((s, r) => s + Number(r.amount ?? 0), 0),
    [receipts, today],
  );
  const totalToCollect = useMemo(
    () => arAging.reduce((s, c) => s + Number(c.totalOutstanding ?? c.total_outstanding ?? 0), 0),
    [arAging],
  );
  const overdue30Plus = useMemo(
    () => arAging.reduce((s, c) => s + Number(c.bucket30Plus ?? c.aging_30_plus ?? c.bucket_30_plus ?? 0), 0),
    [arAging],
  );
  const cashWithFieldStaff = useMemo(
    () =>
      handovers
        .filter((h) => h.status === 'PENDING')
        .reduce((s, h) => s + Number(h.expectedCash ?? h.expected_cash ?? h.expected_amount ?? 0), 0),
    [handovers],
  );

  const agingTotals = useMemo(() => {
    const b0 = arAging.reduce((s, c) => s + Number(c.bucket0to7 ?? c.aging_0_7 ?? 0), 0);
    const b8 = arAging.reduce((s, c) => s + Number(c.bucket8to15 ?? c.aging_8_15 ?? 0), 0);
    const b16 = arAging.reduce((s, c) => s + Number(c.bucket16to30 ?? c.aging_16_30 ?? 0), 0);
    const b30 = arAging.reduce((s, c) => s + Number(c.bucket30Plus ?? c.aging_30_plus ?? 0), 0);
    const total = b0 + b8 + b16 + b30 || 1;
    return { b0, b8, b16, b30, total };
  }, [arAging]);

  const pendingHandovers = handovers.filter((h) => h.status === 'PENDING').length;
  const chequesToDeposit = cheques.filter((c) => c.status === 'RECEIVED').length;
  const ptpsDueToday = ptps.filter((p) => p.bucket === 'TODAY' || p.bucket === 'OVERDUE' || p.status === 'OPEN').length;
  const codToSettle = codStops.filter((s) => s.status === 'PENDING').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Money &amp; Finance Control</h1>
          <p className="text-sm text-ink-3">
            Live receivables, cash custody (BR-07), cheques, COD settlement, and guided End-of-Day close.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/finance/collections"
            className="rounded-lg bg-leaf px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            + Record Payment
          </Link>
          <Link
            href="/finance/eod"
            className="rounded-lg border border-rule bg-sheet px-4 py-2 text-sm font-semibold text-ink hover:bg-sunken"
          >
            End-of-Day Close →
          </Link>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-[3px] border border-rule bg-sheet p-4">
          <div className="text-xs font-medium text-ink-3">Invoiced Today</div>
          <div className="mt-1 font-mono text-xl font-bold text-ink">{formatINR(invoicedToday)}</div>
        </div>
        <div className="rounded-[3px] border border-rule bg-sheet p-4">
          <div className="text-xs font-medium text-ink-3">Collected Today</div>
          <div className="mt-1 font-mono text-xl font-bold text-leaf">{formatINR(collectedToday)}</div>
        </div>
        <div className="rounded-[3px] border border-rule bg-sheet p-4">
          <div className="text-xs font-medium text-ink-3">Total To Collect</div>
          <div className="mt-1 font-mono text-xl font-bold text-ink">{formatINR(totalToCollect)}</div>
        </div>
        <div className="rounded-[3px] border border-rule bg-sheet p-4">
          <div className="text-xs font-medium text-ink-3">Overdue 30+ Days</div>
          <div className="mt-1 font-mono text-xl font-bold text-madder">{formatINR(overdue30Plus)}</div>
        </div>
        <div className="rounded-[3px] border border-rule bg-sheet p-4">
          <div className="text-xs font-medium text-ink-3">Cash with Field Staff</div>
          <div className="mt-1 font-mono text-xl font-bold text-haldi">{formatINR(cashWithFieldStaff)}</div>
        </div>
      </div>

      {/* AR Aging Strip */}
      <div className="rounded-[3px] border border-rule bg-sheet p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">AR Aging Breakdown</h2>
          <Link href="/finance/receivables" className="text-xs font-semibold text-leaf hover:underline">
            View Full Aging →
          </Link>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-sunken">
          <div className="bg-emerald-500" style={{ width: `${(agingTotals.b0 / agingTotals.total) * 100}%` }} />
          <div className="bg-amber-400" style={{ width: `${(agingTotals.b8 / agingTotals.total) * 100}%` }} />
          <div className="bg-orange-500" style={{ width: `${(agingTotals.b16 / agingTotals.total) * 100}%` }} />
          <div className="bg-rose-500" style={{ width: `${(agingTotals.b30 / agingTotals.total) * 100}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div className="text-ink-3">0–7d: <span className="font-mono font-semibold text-ink">{formatINR(agingTotals.b0)}</span></div>
          <div className="text-ink-3">8–15d: <span className="font-mono font-semibold text-ink">{formatINR(agingTotals.b8)}</span></div>
          <div className="text-ink-3">16–30d: <span className="font-mono font-semibold text-ink">{formatINR(agingTotals.b16)}</span></div>
          <div className="text-ink-3">30+d: <span className="font-mono font-semibold text-madder">{formatINR(agingTotals.b30)}</span></div>
        </div>
      </div>

      {/* Action Queues */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/finance/handovers" className="rounded-[3px] border border-rule bg-sheet p-4 hover:border-rule-strong">
          <div className="text-xs text-ink-3">Pending Cash Handovers</div>
          <div className="mt-1 text-2xl font-bold text-haldi">{pendingHandovers}</div>
        </Link>
        <Link href="/finance/cheques" className="rounded-[3px] border border-rule bg-sheet p-4 hover:border-rule-strong">
          <div className="text-xs text-ink-3">Cheques to Deposit</div>
          <div className="mt-1 text-2xl font-bold text-action">{chequesToDeposit}</div>
        </Link>
        <Link href="/finance/ptp" className="rounded-[3px] border border-rule bg-sheet p-4 hover:border-rule-strong">
          <div className="text-xs text-ink-3">PTPs Due / Overdue</div>
          <div className="mt-1 text-2xl font-bold text-madder">{ptpsDueToday}</div>
        </Link>
        <Link href="/finance/cod" className="rounded-[3px] border border-rule bg-sheet p-4 hover:border-rule-strong">
          <div className="text-xs text-ink-3">COD Pending Settlement</div>
          <div className="mt-1 text-2xl font-bold text-leaf">{codToSettle}</div>
        </Link>
      </div>
    </div>
  );
}
