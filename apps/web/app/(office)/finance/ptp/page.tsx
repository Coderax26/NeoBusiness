'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { formatINR } from '@neo/shared';
import { type PromiseToPayRecord } from '../../../../src/lib/finance-data';

const BUCKETS: Array<'ALL' | PromiseToPayRecord['bucket']> = ['ALL', 'TODAY', 'OVERDUE', 'UPCOMING', 'BROKEN', 'KEPT'];

export default function PromisesToPayPage() {
  const [ptps, setPtps] = useState<PromiseToPayRecord[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [invoices, setInvoices] = useState<Array<{ id: string; invoiceNo: string; customerId: string }>>([]);
  const [bucketFilter, setBucketFilter] = useState<'ALL' | PromiseToPayRecord['bucket']>('ALL');
  const [customerId, setCustomerId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [reasonCode, setReasonCode] = useState('OWNER_ABSENT');
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadPtps = useCallback(async () => {
    const res = await fetch('/api/proxy/ptp').then((r) => (r.ok ? r.json() : []));
    const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    const today = new Date().toISOString().slice(0, 10);
    setPtps(
      rows.map((p: any) => {
        const dDate = String(p.dueDate || p.promised_date || '').slice(0, 10);
        const st = String(p.status || '').toUpperCase();
        const derivedBucket: PromiseToPayRecord['bucket'] =
          st === 'KEPT' || st === 'BROKEN'
            ? (st as PromiseToPayRecord['bucket'])
            : dDate < today
              ? 'OVERDUE'
              : dDate === today
                ? 'TODAY'
                : 'UPCOMING';
        return {
          id: String(p.id),
          customerName: String(p.customerName || p.customer_name || p.business_name || 'Customer'),
          invoiceNo: String(p.invoiceNo || p.invoice_no || '—'),
          promisedAmount: Number(p.promisedAmount ?? p.promised_amount ?? p.balance_due ?? 0),
          dueDate: dDate,
          bucket: (p.bucket || derivedBucket) as PromiseToPayRecord['bucket'],
          notes: String(p.notes || p.note || p.reason_code || ''),
        };
      }),
    );
  }, []);

  useEffect(() => {
    loadPtps().catch(() => {});
    Promise.all([
      fetch('/api/proxy/customers').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/invoices').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([custRes, invRes]) => {
        const cRows = Array.isArray(custRes) ? custRes : Array.isArray(custRes?.data) ? custRes.data : [];
        const iRows = Array.isArray(invRes) ? invRes : Array.isArray(invRes?.data) ? invRes.data : [];
        const mappedCusts = cRows.map((c: any) => ({
          id: String(c.id),
          name: String(c.business_name ?? c.name ?? 'Customer'),
        }));
        setCustomers(mappedCusts);
        if (mappedCusts.length > 0) setCustomerId(mappedCusts[0].id);
        setInvoices(
          iRows.map((inv: any) => ({
            id: String(inv.id),
            invoiceNo: String(inv.invoice_no ?? inv.invoiceNo ?? inv.id),
            customerId: String(inv.customer_id ?? inv.customerId ?? ''),
          })),
        );
      })
      .catch(() => {});
  }, [loadPtps]);

  const filtered = useMemo(
    () => ptps.filter((p) => (bucketFilter === 'ALL' ? true : p.bucket === bucketFilter)),
    [ptps, bucketFilter],
  );

  async function addPtp(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId || !dueDate) return;
    try {
      setBusy(true);
      const res = await fetch('/api/proxy/ptp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          invoiceId: invoiceId || undefined,
          promisedDate: dueDate,
          reasonCode,
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadPtps();
      setNote('');
      setToast('Scheduled Promise to Pay follow-up.');
    } catch (err) {
      setToast(`Failed to schedule PTP: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function markBucket(id: string, status: 'KEPT' | 'BROKEN') {
    try {
      setBusy(true);
      const res = await fetch(`/api/proxy/ptp/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadPtps();
      setToast(`Marked PTP as ${status}.`);
    } catch (err) {
      setToast(`Failed to update PTP: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const customerInvoices = invoices.filter((i) => !customerId || i.customerId === customerId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Promises to Pay (PTP)</h1>
        <p className="text-sm text-ink-3">
          Track customer payment commitments by due date (Today, Overdue, Upcoming, Broken, Kept).
        </p>
      </div>

      {toast && (
        <div className="rounded-[3px] border border-leaf/30 bg-leaf-soft px-4 py-2.5 text-sm font-medium text-leaf">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBucketFilter(b)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              bucketFilter === b
                ? 'bg-leaf text-white'
                : 'border border-rule bg-sheet text-ink-2 hover:bg-sunken'
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={addPtp} className="rounded-[3px] border border-rule bg-sheet p-5 space-y-3">
          <h2 className="text-base font-bold text-ink">Schedule New PTP</h2>
          <select
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setInvoiceId('');
            }}
            className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm font-mono text-ink"
          >
            <option value="">All Open Invoices (Optional)</option>
            {customerInvoices.map((inv) => (
              <option key={inv.id} value={inv.id}>{inv.invoiceNo}</option>
            ))}
          </select>
          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink"
          >
            <option value="OWNER_ABSENT">OWNER_ABSENT</option>
            <option value="SHORT_FUNDS">SHORT_FUNDS</option>
            <option value="BILL_DISPUTE">BILL_DISPUTE</option>
            <option value="CHEQUE_PENDING">CHEQUE_PENDING</option>
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink"
            required
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Collector remarks"
            className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-3"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-[3px] bg-leaf py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Save Promise
          </button>
        </form>

        <div className="overflow-hidden rounded-[3px] border border-rule bg-sheet lg:col-span-2">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-ink-3">
              <tr>
                <th className="px-4 py-3">Customer / Invoice</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3 text-right">Promised</th>
                <th className="px-4 py-3">Bucket</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-ink-3">
                    No promises to pay in this bucket.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-sunken">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink">{p.customerName}</div>
                      <div className="font-mono text-xs text-ink-3">{p.invoiceNo}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-3">{p.dueDate}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-ink">{formatINR(p.promisedAmount)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          p.bucket === 'KEPT'
                            ? 'bg-leaf-soft text-leaf'
                            : p.bucket === 'BROKEN' || p.bucket === 'OVERDUE'
                              ? 'bg-madder-soft text-madder'
                              : 'bg-haldi-soft text-haldi'
                        }`}
                      >
                        {p.bucket}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1.5">
                      {p.bucket !== 'KEPT' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => markBucket(p.id, 'KEPT')}
                          className="rounded border border-leaf/30 bg-leaf-soft px-2 py-1 text-xs font-semibold text-leaf"
                        >
                          Kept
                        </button>
                      )}
                      {p.bucket !== 'BROKEN' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => markBucket(p.id, 'BROKEN')}
                          className="rounded border border-madder/30 bg-madder-soft px-2 py-1 text-xs font-semibold text-madder"
                        >
                          Broken
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
