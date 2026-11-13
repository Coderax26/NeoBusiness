'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatINR } from '@neo/shared';
import { INITIAL_AR_AGING, INITIAL_INVOICES, type CustomerArSummary } from '../../../../src/lib/finance-data';

export default function ReceivablesPage() {
  const [customers, setCustomers] = useState<CustomerArSummary[]>(INITIAL_AR_AGING);
  const [collectorFilter, setCollectorFilter] = useState<string>('ALL');
  const [ledgerCustomer, setLedgerCustomer] = useState<CustomerArSummary | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const collectors = useMemo(
    () => ['ALL', ...Array.from(new Set(customers.map((c) => c.collectorName)))],
    [customers],
  );

  const filtered = useMemo(
    () => customers.filter((c) => (collectorFilter === 'ALL' ? true : c.collectorName === collectorFilter)),
    [customers, collectorFilter],
  );

  function toggleCreditHold(customerId: string) {
    setCustomers((prev) =>
      prev.map((c) => (c.customerId === customerId ? { ...c, creditHold: !c.creditHold } : c)),
    );
    setToast('Updated customer credit hold status.');
  }

  const customerOpenInvoices = useMemo(
    () =>
      ledgerCustomer
        ? INITIAL_INVOICES.filter((i) => i.customerId === ledgerCustomer.customerId)
        : [],
    [ledgerCustomer],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Money to Collect — Accounts Receivable</h1>
          <p className="text-sm text-slate-500">
            Aging buckets, collector worklists, customer ledger drill-down, reminders, and credit hold controls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">Collector Worklist:</label>
          <select
            value={collectorFilter}
            onChange={(e) => setCollectorFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
          >
            {collectors.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
        </div>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
          {toast}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Customer / Collector</th>
              <th className="px-4 py-3 text-right">0–7d</th>
              <th className="px-4 py-3 text-right">8–15d</th>
              <th className="px-4 py-3 text-right">16–30d</th>
              <th className="px-4 py-3 text-right">30+d</th>
              <th className="px-4 py-3 text-right">Total AR</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((c) => (
              <tr key={c.customerId} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                    <span>{c.customerName}</span>
                    {c.creditHold && (
                      <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                        CREDIT HOLD
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    Collector: {c.collectorName} · Limit {formatINR(c.creditLimit)}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatINR(c.bucket0to7)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatINR(c.bucket8to15)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs text-orange-700">{formatINR(c.bucket16to30)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-rose-700">
                  {formatINR(c.bucket30Plus)}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                  {formatINR(c.totalOutstanding)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex flex-wrap justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLedgerCustomer(c)}
                      className="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Ledger
                    </button>
                    <Link
                      href="/finance/collections"
                      className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                    >
                      Pay
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleCreditHold(c.customerId)}
                      className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
                    >
                      {c.creditHold ? 'Release' : 'Hold'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Customer Statement Drill-down */}
      {ledgerCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Customer Statement — {ledgerCustomer.customerName}</h2>
                <p className="text-xs text-slate-500">Outstanding: {formatINR(ledgerCustomer.totalOutstanding)}</p>
              </div>
              <button
                type="button"
                onClick={() => setLedgerCustomer(null)}
                className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {customerOpenInvoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <div className="font-mono font-semibold text-slate-900">{inv.invoiceNo}</div>
                    <div className="text-xs text-slate-500">Date {inv.invoiceDate} · Due {inv.dueDate}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-slate-900">{formatINR(inv.balanceAmount)}</div>
                    <div className="text-[11px] text-slate-500">of {formatINR(inv.totalAmount)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

