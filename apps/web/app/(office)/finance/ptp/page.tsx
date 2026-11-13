'use client';

import React, { useMemo, useState } from 'react';
import { formatINR } from '@neo/shared';
import { INITIAL_PTPS, type PromiseToPayRecord } from '../../../../src/lib/finance-data';

const BUCKETS: Array<'ALL' | PromiseToPayRecord['bucket']> = ['ALL', 'TODAY', 'OVERDUE', 'UPCOMING', 'BROKEN', 'KEPT'];

export default function PromisesToPayPage() {
  const [ptps, setPtps] = useState<PromiseToPayRecord[]>(INITIAL_PTPS);
  const [bucketFilter, setBucketFilter] = useState<'ALL' | PromiseToPayRecord['bucket']>('ALL');
  const [customerName, setCustomerName] = useState('Sahyadri Dairy');
  const [invoiceNo, setInvoiceNo] = useState('INV-2026-0102');
  const [promisedAmount, setPromisedAmount] = useState('20000');
  const [dueDate, setDueDate] = useState('2026-11-15');

  const filtered = useMemo(
    () => ptps.filter((p) => (bucketFilter === 'ALL' ? true : p.bucket === bucketFilter)),
    [ptps, bucketFilter],
  );

  function addPtp(e: React.FormEvent) {
    e.preventDefault();
    const val = Number(promisedAmount) || 0;
    if (val <= 0) return;
    setPtps((prev) => [
      {
        id: `ptp-${Date.now()}`,
        customerName,
        invoiceNo,
        promisedAmount: val,
        dueDate,
        bucket: 'UPCOMING',
        notes: 'Scheduled by office coordinator',
      },
      ...prev,
    ]);
  }

  function markBucket(id: string, bucket: PromiseToPayRecord['bucket']) {
    setPtps((prev) => prev.map((p) => (p.id === id ? { ...p, bucket } : p)));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Promises to Pay (PTP)</h1>
        <p className="text-sm text-slate-500">
          Track customer payment commitments by due date (Today, Overdue, Upcoming, Broken, Kept).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBucketFilter(b)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              bucketFilter === b
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={addPtp} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-base font-bold text-slate-900">New Promise to Pay</h2>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
          />
          <input
            type="number"
            value={promisedAmount}
            onChange={(e) => setPromisedAmount(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button type="submit" className="w-full rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white">
            Save PTP
          </button>
        </form>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-2">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Customer / Invoice</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{p.customerName}</div>
                    <div className="font-mono text-xs text-slate-500">{p.invoiceNo}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{p.dueDate}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{formatINR(p.promisedAmount)}</td>
                  <td className="px-4 py-3 text-xs font-semibold">{p.bucket}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => markBucket(p.id, 'KEPT')}
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
                      >
                        Kept
                      </button>
                      <button
                        type="button"
                        onClick={() => markBucket(p.id, 'BROKEN')}
                        className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
                      >
                        Broken
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

