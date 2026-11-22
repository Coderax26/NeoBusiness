'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { formatINR } from '@neo/shared';
import { type CustomerArSummary, type InvoiceRecord } from '../../../../src/lib/finance-data';

export default function ReceivablesPage() {
  const [customers, setCustomers] = useState<CustomerArSummary[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [collectorFilter, setCollectorFilter] = useState<string>('ALL');
  const [ledgerCustomer, setLedgerCustomer] = useState<CustomerArSummary | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const storedSite =
      typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') : null;
    const siteQuery =
      storedSite && storedSite !== 'all' ? `?siteId=${encodeURIComponent(storedSite)}` : '';
    Promise.all([
      fetch(`/api/proxy/analytics/ar/aging${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/invoices${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([arRes, invRes]) => {
        if (!active) return;
        const arRows = Array.isArray(arRes) ? arRes : Array.isArray(arRes?.data) ? arRes.data : [];
        const invRows = Array.isArray(invRes) ? invRes : Array.isArray(invRes?.data) ? invRes.data : [];
        setCustomers(
          arRows.map((c: any) => ({
            customerId: String(c.customerId || c.customer_id || c.id),
            customerName: String(c.customerName || c.businessName || c.business_name || 'Customer'),
            collectorName: String(c.collectorName || c.collector_name || 'Unassigned'),
            totalOutstanding: Number(c.totalOutstanding ?? c.total_outstanding ?? 0),
            bucket0to7: Number(c.bucket0to7 ?? c.aging_0_7 ?? 0),
            bucket8to15: Number(c.bucket8to15 ?? c.aging_8_15 ?? 0),
            bucket16to30: Number(c.bucket16to30 ?? c.aging_16_30 ?? 0),
            bucket30Plus: Number(c.bucket30Plus ?? c.aging_30_plus ?? 0),
            creditHold: Boolean(c.creditHold ?? c.credit_hold),
            creditLimit: Number(c.creditLimit ?? c.credit_limit ?? 0),
          })),
        );
        setInvoices(invRows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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
        ? invoices.filter((i) => i.customerId === ledgerCustomer.customerId)
        : [],
    [ledgerCustomer, invoices],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Money to Collect — Accounts Receivable</h1>
          <p className="text-sm text-zinc-400">
            Aging buckets, collector worklists, customer ledger drill-down, reminders, and credit hold controls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-zinc-400">Collector Worklist:</label>
          <select
            value={collectorFilter}
            onChange={(e) => setCollectorFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100"
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
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-300">
          {toast}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950/60 text-xs uppercase text-zinc-400">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Collector</th>
              <th className="px-4 py-3 text-right">0–7d</th>
              <th className="px-4 py-3 text-right">8–15d</th>
              <th className="px-4 py-3 text-right">16–30d</th>
              <th className="px-4 py-3 text-right">30+d</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-zinc-500">
                  No receivables records found.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.customerId} className="hover:bg-zinc-800/40">
                  <td className="px-4 py-3">
                    <Link href={`/sales/customers/${c.customerId}`} className="font-semibold text-zinc-100 hover:text-emerald-400">
                      {c.customerName}
                    </Link>
                    {c.creditHold && (
                      <span className="ml-2 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-400">
                        HOLD
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{c.collectorName}</td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatINR(c.bucket0to7)}</td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatINR(c.bucket8to15)}</td>
                  <td className="px-4 py-3 text-right font-mono text-amber-400">{formatINR(c.bucket16to30)}</td>
                  <td className="px-4 py-3 text-right font-mono text-rose-400">{formatINR(c.bucket30Plus)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-zinc-100">{formatINR(c.totalOutstanding)}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => setLedgerCustomer(c)}
                      className="rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
                    >
                      Ledger
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleCreditHold(c.customerId)}
                      className={`rounded px-2.5 py-1 text-xs font-semibold ${
                        c.creditHold
                          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'border border-rose-500/30 bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {c.creditHold ? 'Release Hold' : 'Credit Hold'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {ledgerCustomer && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-100">Open Invoices — {ledgerCustomer.customerName}</h2>
            <button type="button" onClick={() => setLedgerCustomer(null)} className="text-xs text-zinc-400 hover:text-white">
              Close
            </button>
          </div>
          {customerOpenInvoices.length === 0 ? (
            <p className="text-xs text-zinc-500">No open invoices for this customer.</p>
          ) : (
            <div className="space-y-2">
              {customerOpenInvoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs">
                  <span className="font-mono text-zinc-200">{inv.invoiceNo}</span>
                  <span className="text-zinc-400">{inv.invoiceDate}</span>
                  <span className="font-mono font-semibold text-zinc-100">{formatINR(inv.balanceAmount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
