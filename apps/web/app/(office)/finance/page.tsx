'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { formatINR } from '@neo/shared';
import {
  INITIAL_AR_AGING,
  INITIAL_CHEQUES,
  INITIAL_COD_STOPS,
  INITIAL_HANDOVERS,
  INITIAL_INVOICES,
  INITIAL_PTPS,
  INITIAL_RECEIPTS,
} from '../../../src/lib/finance-data';

export default function FinanceHomePage() {
  const invoicedToday = useMemo(
    () => INITIAL_INVOICES.filter((i) => i.invoiceDate === '2026-11-13').reduce((s, i) => s + i.totalAmount, 0),
    [],
  );
  const collectedToday = useMemo(
    () => INITIAL_RECEIPTS.filter((r) => r.date === '2026-11-13' && !r.reversed).reduce((s, r) => s + r.amount, 0),
    [],
  );
  const totalToCollect = useMemo(
    () => INITIAL_AR_AGING.reduce((s, c) => s + c.totalOutstanding, 0),
    [],
  );
  const overdue30Plus = useMemo(
    () => INITIAL_AR_AGING.reduce((s, c) => s + c.bucket30Plus, 0),
    [],
  );
  const cashWithFieldStaff = useMemo(
    () => INITIAL_HANDOVERS.filter((h) => h.status === 'PENDING').reduce((s, h) => s + h.expectedCash, 0),
    [],
  );

  const agingTotals = useMemo(() => {
    const b0 = INITIAL_AR_AGING.reduce((s, c) => s + c.bucket0to7, 0);
    const b8 = INITIAL_AR_AGING.reduce((s, c) => s + c.bucket8to15, 0);
    const b16 = INITIAL_AR_AGING.reduce((s, c) => s + c.bucket16to30, 0);
    const b30 = INITIAL_AR_AGING.reduce((s, c) => s + c.bucket30Plus, 0);
    const total = b0 + b8 + b16 + b30 || 1;
    return { b0, b8, b16, b30, total };
  }, []);

  const pendingHandovers = INITIAL_HANDOVERS.filter((h) => h.status === 'PENDING').length;
  const chequesToDeposit = INITIAL_CHEQUES.filter((c) => c.status === 'RECEIVED').length;
  const ptpsDueToday = INITIAL_PTPS.filter((p) => p.bucket === 'TODAY' || p.bucket === 'OVERDUE').length;
  const codToSettle = INITIAL_COD_STOPS.filter((s) => s.status === 'PENDING').length;

  const openingCash = 18500;
  const cashCollections = 30000;
  const bankDeposits = 20000;
  const closingCash = openingCash + cashCollections - bankDeposits;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Money &amp; Finance Control</h1>
          <p className="text-sm text-slate-500">
            Live receivables, cash custody (BR-07), cheques, COD settlement, and guided End-of-Day close.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/finance/collections"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            + Record Payment
          </Link>
          <Link
            href="/finance/eod"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            End-of-Day Close →
          </Link>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Invoiced Today</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900">{formatINR(invoicedToday)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Collected Today</div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-700">{formatINR(collectedToday)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Total to Collect (AR)</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900">{formatINR(totalToCollect)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Overdue &gt; 30 Days</div>
          <div className="mt-1 font-mono text-xl font-bold text-rose-700">{formatINR(overdue30Plus)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Cash With Field Staff</div>
          <div className="mt-1 font-mono text-xl font-bold text-amber-700">{formatINR(cashWithFieldStaff)}</div>
        </div>
      </div>

      {/* AR Aging Stacked Bar & Cash Position */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">AR Aging Breakdown</h2>
            <Link href="/finance/receivables" className="text-xs font-semibold text-emerald-700 hover:underline">
              Open Receivables →
            </Link>
          </div>
          <div className="mt-4 flex h-5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="bg-emerald-500"
              style={{ width: `${(agingTotals.b0 / agingTotals.total) * 100}%` }}
              title={`0-7 days: ${formatINR(agingTotals.b0)}`}
            />
            <div
              className="bg-amber-400"
              style={{ width: `${(agingTotals.b8 / agingTotals.total) * 100}%` }}
              title={`8-15 days: ${formatINR(agingTotals.b8)}`}
            />
            <div
              className="bg-orange-500"
              style={{ width: `${(agingTotals.b16 / agingTotals.total) * 100}%` }}
              title={`16-30 days: ${formatINR(agingTotals.b16)}`}
            />
            <div
              className="bg-rose-600"
              style={{ width: `${(agingTotals.b30 / agingTotals.total) * 100}%` }}
              title={`30+ days: ${formatINR(agingTotals.b30)}`}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-emerald-50 p-2.5">
              <div className="text-emerald-700">0–7 Days</div>
              <div className="font-mono font-bold text-slate-900">{formatINR(agingTotals.b0)}</div>
            </div>
            <div className="rounded-lg bg-amber-50 p-2.5">
              <div className="text-amber-700">8–15 Days</div>
              <div className="font-mono font-bold text-slate-900">{formatINR(agingTotals.b8)}</div>
            </div>
            <div className="rounded-lg bg-orange-50 p-2.5">
              <div className="text-orange-700">16–30 Days</div>
              <div className="font-mono font-bold text-slate-900">{formatINR(agingTotals.b16)}</div>
            </div>
            <div className="rounded-lg bg-rose-50 p-2.5">
              <div className="text-rose-700">30+ Days</div>
              <div className="font-mono font-bold text-slate-900">{formatINR(agingTotals.b30)}</div>
            </div>
          </div>
        </div>

        {/* Cashbook Position */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold text-slate-900">Office Cash Position</h2>
          <p className="text-xs text-slate-500">Opening + Collections − Bank Deposits</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Opening Balance</dt>
              <dd className="font-mono font-semibold text-slate-800">{formatINR(openingCash)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">+ Cash Collections</dt>
              <dd className="font-mono font-semibold text-emerald-700">{formatINR(cashCollections)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">− Bank Deposits</dt>
              <dd className="font-mono font-semibold text-rose-700">{formatINR(bankDeposits)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
              <dt className="text-slate-900">Closing Cash</dt>
              <dd className="font-mono text-slate-900">{formatINR(closingCash)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Today's Action Tasks */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/finance/handovers" className="rounded-xl border border-slate-200 bg-white p-4 hover:border-emerald-400">
          <div className="text-xs font-medium text-slate-500">Handovers to Verify</div>
          <div className="mt-1 text-2xl font-bold text-amber-700">{pendingHandovers}</div>
          <div className="mt-1 text-xs font-semibold text-emerald-700">Open Handover Desk →</div>
        </Link>
        <Link href="/finance/cheques" className="rounded-xl border border-slate-200 bg-white p-4 hover:border-emerald-400">
          <div className="text-xs font-medium text-slate-500">Cheques to Deposit</div>
          <div className="mt-1 text-2xl font-bold text-blue-700">{chequesToDeposit}</div>
          <div className="mt-1 text-xs font-semibold text-emerald-700">Open Cheques Board →</div>
        </Link>
        <Link href="/finance/ptp" className="rounded-xl border border-slate-200 bg-white p-4 hover:border-emerald-400">
          <div className="text-xs font-medium text-slate-500">PTPs Due / Overdue</div>
          <div className="mt-1 text-2xl font-bold text-rose-700">{ptpsDueToday}</div>
          <div className="mt-1 text-xs font-semibold text-emerald-700">Review Promises →</div>
        </Link>
        <Link href="/finance/cod" className="rounded-xl border border-slate-200 bg-white p-4 hover:border-emerald-400">
          <div className="text-xs font-medium text-slate-500">COD Stops to Settle</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{codToSettle}</div>
          <div className="mt-1 text-xs font-semibold text-emerald-700">Settle Trip COD →</div>
        </Link>
      </div>
    </div>
  );
}

