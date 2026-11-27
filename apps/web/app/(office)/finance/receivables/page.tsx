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
  const [ptpTarget, setPtpTarget] = useState<CustomerArSummary | null>(null);
  const [ptpDate, setPtpDate] = useState(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
  const [ptpNote, setPtpNote] = useState('');
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);

  const loadReceivables = React.useCallback(async () => {
    const storedSite =
      typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') : null;
    const siteQuery =
      storedSite && storedSite !== 'all' ? `?siteId=${encodeURIComponent(storedSite)}` : '';
    try {
      const [arRes, invRes] = await Promise.all([
        fetch(`/api/proxy/analytics/ar/aging${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/proxy/invoices${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
      ]);
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
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadReceivables();
  }, [loadReceivables]);

  const collectors = useMemo(
    () => ['ALL', ...Array.from(new Set(customers.map((c) => c.collectorName)))],
    [customers],
  );

  const filtered = useMemo(
    () => customers.filter((c) => (collectorFilter === 'ALL' ? true : c.collectorName === collectorFilter)),
    [customers, collectorFilter],
  );

  async function toggleCreditHold(customerId: string) {
    const target = customers.find((c) => c.customerId === customerId);
    if (!target) return;
    setToast(null);
    try {
      const res = await fetch(`/api/proxy/customers/${encodeURIComponent(customerId)}/credit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creditLimit: target.creditLimit || 100000,
          creditDays: 15,
          creditHold: !target.creditHold,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || `HTTP ${res.status}`);
      }
      await loadReceivables();
      setToast({
        text: `${target.customerName} ${!target.creditHold ? 'placed on Credit Hold' : 'released from Credit Hold'}.`,
      });
    } catch (err) {
      setToast({ text: `Credit Hold update failed: ${(err as Error).message}`, isError: true });
    }
  }

  async function submitPtp(e: React.FormEvent) {
    e.preventDefault();
    if (!ptpTarget) return;
    setToast(null);
    try {
      const res = await fetch('/api/proxy/ptp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: ptpTarget.customerId,
          promisedDate: ptpDate,
          reasonCode: 'FOLLOWUP',
          note: ptpNote.trim() || `AR follow-up for ${formatINR(ptpTarget.totalOutstanding)}`,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || `HTTP ${res.status}`);
      }
      setToast({ text: `Promise to Pay logged for ${ptpTarget.customerName} (due ${ptpDate}).` });
      setPtpTarget(null);
      setPtpNote('');
    } catch (err) {
      setToast({ text: `Failed to log Promise to Pay: ${(err as Error).message}`, isError: true });
    }
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
          <h1 className="text-2xl font-bold text-ink">Money to Collect — Accounts Receivable</h1>
          <p className="text-sm text-ink-3">
            Aging buckets, collector worklists, customer ledger drill-down, reminders, and credit hold controls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-ink-3">Collector Worklist:</label>
          <select
            value={collectorFilter}
            onChange={(e) => setCollectorFilter(e.target.value)}
            className="rounded-lg border border-rule bg-sheet px-3 py-1.5 text-sm text-ink"
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
        <div
          className={`rounded-[3px] border px-4 py-2.5 text-sm font-medium ${
            toast.isError
              ? 'border-madder/30 bg-madder-soft text-madder'
              : 'border-leaf/30 bg-leaf-soft text-leaf'
          }`}
        >
          {toast.text}
        </div>
      )}

      <div className="overflow-hidden rounded-[3px] border border-rule bg-sheet">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-ink-3">
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
          <tbody className="divide-y divide-rule">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-ink-3">
                  No receivables records found.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.customerId} className="hover:bg-sunken">
                  <td className="px-4 py-3">
                    <Link href={`/sales/customers/${c.customerId}`} className="font-semibold text-ink hover:text-leaf">
                      {c.customerName}
                    </Link>
                    {c.creditHold && (
                      <span className="ml-2 rounded bg-madder-soft px-1.5 py-0.5 text-[10px] font-bold text-madder">
                        HOLD
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-3">{c.collectorName}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-2">{formatINR(c.bucket0to7)}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-2">{formatINR(c.bucket8to15)}</td>
                  <td className="px-4 py-3 text-right font-mono text-haldi">{formatINR(c.bucket16to30)}</td>
                  <td className="px-4 py-3 text-right font-mono text-madder">{formatINR(c.bucket30Plus)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-ink">{formatINR(c.totalOutstanding)}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => setLedgerCustomer(c)}
                      className="rounded border border-rule-strong bg-paper px-2.5 py-1 text-xs font-semibold text-ink hover:bg-sunken"
                    >
                      Ledger
                    </button>
                    <button
                      type="button"
                      onClick={() => setPtpTarget(c)}
                      className="rounded border border-rule-strong bg-paper px-2.5 py-1 text-xs font-semibold text-action hover:bg-sunken"
                    >
                      + PTP
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleCreditHold(c.customerId)}
                      className={`rounded px-2.5 py-1 text-xs font-semibold ${
                        c.creditHold
                          ? 'border border-leaf/30 bg-leaf-soft text-leaf'
                          : 'border border-madder/30 bg-madder-soft text-madder'
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
        <div className="rounded-[3px] border border-rule bg-sheet p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Open Invoices — {ledgerCustomer.customerName}</h2>
            <button type="button" onClick={() => setLedgerCustomer(null)} className="text-xs text-ink-3 hover:text-ink">
              Close
            </button>
          </div>
          {customerOpenInvoices.length === 0 ? (
            <p className="text-xs text-ink-3">No open invoices for this customer.</p>
          ) : (
            <div className="space-y-2">
              {customerOpenInvoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-lg border border-rule bg-paper px-4 py-2 text-xs">
                  <span className="font-mono text-ink">{inv.invoiceNo}</span>
                  <span className="text-ink-3">{inv.invoiceDate}</span>
                  <span className="font-mono font-semibold text-ink">{formatINR(inv.balanceAmount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {ptpTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={submitPtp} className="w-full max-w-md rounded-[4px] border border-rule bg-sheet p-5 space-y-4 text-xs shadow-xl">
            <h3 className="text-base font-bold text-ink">
              Log Promise to Pay — {ptpTarget.customerName}
            </h3>
            <div>
              <label className="block font-semibold text-ink-3 mb-1">Promised Date</label>
              <input
                type="date"
                value={ptpDate}
                onChange={(e) => setPtpDate(e.target.value)}
                className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-ink-3 mb-1">Note</label>
              <input
                type="text"
                value={ptpNote}
                onChange={(e) => setPtpNote(e.target.value)}
                placeholder="Customer promised payment details..."
                className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPtpTarget(null)}
                className="rounded border border-rule bg-paper px-3 py-1.5 font-semibold text-ink-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-action px-4 py-1.5 font-semibold text-white"
              >
                Save Promise
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
