'use client';

import React, { useState } from 'react';
import { formatINR } from '@neo/shared';
import { INITIAL_CREDIT_NOTES, type CreditNoteRecord } from '../../../../src/lib/finance-data';

export default function CreditNotesPage() {
  const [notes, setNotes] = useState<CreditNoteRecord[]>(INITIAL_CREDIT_NOTES);
  const [invoiceNo, setInvoiceNo] = useState('INV-2026-0101');
  const [customerName, setCustomerName] = useState('Sahyadri Dairy');
  const [amount, setAmount] = useState('1500');
  const [reason, setReason] = useState('');

  function createCreditNote(e: React.FormEvent) {
    e.preventDefault();
    const val = Number(amount) || 0;
    if (val <= 0 || !reason.trim()) return;
    setNotes((prev) => [
      {
        id: `cn-${Date.now()}`,
        cnNo: `CN-2026-0${10 + prev.length}`,
        invoiceNo,
        customerName,
        reason,
        amount: val,
        status: 'PENDING_APPROVAL',
        createdAt: '2026-11-13 17:10',
      },
      ...prev,
    ]);
    setReason('');
  }

  function updateStatus(id: string, status: CreditNoteRecord['status']) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, status } : n)));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Credit Notes</h1>
        <p className="text-sm text-slate-500">
          Request credit notes against invoices; Owner approval applies credit directly to the customer ledger.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={createCreditNote} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-base font-bold text-slate-900">Request Credit Note</h2>
          <input
            type="text"
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            placeholder="Invoice #"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
          />
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Customer"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount (₹)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (e.g. Rate diff / Damage)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            required
          />
          <button type="submit" className="w-full rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white">
            Submit for Owner Approval
          </button>
        </form>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-2">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">CN # / Invoice</th>
                <th className="px-4 py-3">Customer &amp; Reason</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {notes.map((cn) => (
                <tr key={cn.id}>
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold text-slate-900">{cn.cnNo}</div>
                    <div className="font-mono text-xs text-slate-500">{cn.invoiceNo}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-800">{cn.customerName}</div>
                    <div className="text-xs text-slate-500">{cn.reason}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{formatINR(cn.amount)}</td>
                  <td className="px-4 py-3 text-xs font-semibold">{cn.status}</td>
                  <td className="px-4 py-3 text-right">
                    {cn.status === 'PENDING_APPROVAL' && (
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => updateStatus(cn.id, 'APPROVED')}
                          className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStatus(cn.id, 'REJECTED')}
                          className="rounded bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white"
                        >
                          Reject
                        </button>
                      </div>
                    )}
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

