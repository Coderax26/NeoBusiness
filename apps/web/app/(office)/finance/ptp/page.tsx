'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { formatINR } from '@neo/shared';
import { type PromiseToPayRecord } from '../../../../src/lib/finance-data';

const BUCKETS: Array<'ALL' | PromiseToPayRecord['bucket']> = ['ALL', 'TODAY', 'OVERDUE', 'UPCOMING', 'BROKEN', 'KEPT'];

export default function PromisesToPayPage() {
  const [ptps, setPtps] = useState<PromiseToPayRecord[]>([]);
  const [bucketFilter, setBucketFilter] = useState<'ALL' | PromiseToPayRecord['bucket']>('ALL');
  const [customerName, setCustomerName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [promisedAmount, setPromisedAmount] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/ptp')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setPtps(
          rows.map((p: any) => ({
            id: String(p.id),
            customerName: String(p.customerName || p.customer_name || 'Customer'),
            invoiceNo: String(p.invoiceNo || p.invoice_no || '—'),
            promisedAmount: Number(p.promisedAmount ?? p.promised_amount ?? p.amount ?? 0),
            dueDate: String(p.dueDate || p.promised_date || '').slice(0, 10),
            bucket: (p.bucket || 'UPCOMING') as PromiseToPayRecord['bucket'],
            notes: String(p.notes || p.remarks || ''),
          })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(
    () => ptps.filter((p) => (bucketFilter === 'ALL' ? true : p.bucket === bucketFilter)),
    [ptps, bucketFilter],
  );

  async function addPtp(e: React.FormEvent) {
    e.preventDefault();
    const val = Number(promisedAmount) || 0;
    if (val <= 0 || !customerName.trim()) return;
    await fetch('/api/proxy/ptp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName, invoiceNo, promisedAmount: val, dueDate }),
    }).catch(() => {});
    setPtps((prev) => [
      {
        id: `ptp-${Date.now()}`,
        customerName,
        invoiceNo: invoiceNo || '—',
        promisedAmount: val,
        dueDate,
        bucket: 'UPCOMING',
        notes: 'Scheduled by office coordinator',
      },
      ...prev,
    ]);
    setCustomerName('');
    setInvoiceNo('');
    setPromisedAmount('');
  }

  function markBucket(id: string, bucket: PromiseToPayRecord['bucket']) {
    setPtps((prev) => prev.map((p) => (p.id === id ? { ...p, bucket } : p)));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Promises to Pay (PTP)</h1>
        <p className="text-sm text-ink-3">
          Track customer payment commitments by due date (Today, Overdue, Upcoming, Broken, Kept).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBucketFilter(b)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold${
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
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Customer Name"
            className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-3"
            required
          />
          <input
            type="text"
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            placeholder="Invoice # (optional)"
            className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm font-mono text-ink placeholder:text-ink-3"
          />
          <input
            type="number"
            value={promisedAmount}
            onChange={(e) => setPromisedAmount(e.target.value)}
            placeholder="Promised Amount (₹)"
            className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm font-mono text-ink placeholder:text-ink-3"
            required
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink"
            required
          />
          <button type="submit" className="w-full rounded-[3px] bg-leaf py-2 text-sm font-semibold text-white hover:bg-emerald-700">
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
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold${
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
                          onClick={() => markBucket(p.id, 'KEPT')}
                          className="rounded border border-leaf/30 bg-leaf-soft px-2 py-1 text-xs font-semibold text-leaf"
                        >
                          Kept
                        </button>
                      )}
                      {p.bucket !== 'BROKEN' && (
                        <button
                          type="button"
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
