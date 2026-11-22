'use client';

import React, { useState, useEffect } from 'react';
import { formatINR } from '@neo/shared';
import { type CreditNoteRecord } from '../../../../src/lib/finance-data';

export default function CreditNotesPage() {
  const [notes, setNotes] = useState<CreditNoteRecord[]>([]);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/credit-notes')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setNotes(
          rows.map((r: any) => ({
            id: String(r.id),
            cnNo: String(r.creditNoteNumber || r.credit_note_number || r.cnNo || r.id),
            invoiceNo: String(r.invoiceNumber || r.invoice_no || r.invoiceNo || '—'),
            customerName: String(r.customerName || r.customer_name || 'Customer'),
            reason: String(r.reason || ''),
            amount: Number(r.amount ?? r.totalAmount ?? 0),
            status: (r.status || 'PENDING_APPROVAL') as CreditNoteRecord['status'],
            createdAt: String(r.createdAt || r.created_at || '').slice(0, 16),
          })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function createCreditNote(e: React.FormEvent) {
    e.preventDefault();
    const val = Number(amount) || 0;
    if (val <= 0 || !reason.trim()) return;
    await fetch('/api/proxy/credit-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceNo, customerName, amount: val, reason }),
    }).catch(() => {});
    setNotes((prev) => [
      {
        id: `cn-${Date.now()}`,
        cnNo: `CN-2026-0${10 + prev.length}`,
        invoiceNo,
        customerName,
        reason,
        amount: val,
        status: 'PENDING_APPROVAL',
        createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      },
      ...prev,
    ]);
    setReason('');
    setAmount('');
  }

  async function updateStatus(id: string, status: CreditNoteRecord['status'] | 'APPLIED') {
    if (status === 'APPLIED') {
      await fetch(`/api/proxy/credit-notes/${encodeURIComponent(id)}/apply`, { method: 'POST' }).catch(() => {});
    }
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, status: status as CreditNoteRecord['status'] } : n)));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Credit Notes</h1>
        <p className="text-sm text-zinc-400">
          Request credit notes against invoices; Owner approval applies credit directly to the customer ledger.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={createCreditNote} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <h2 className="text-base font-bold text-zinc-100">Request Credit Note</h2>
          <input
            type="text"
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            placeholder="Invoice #"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-mono text-zinc-100 placeholder:text-zinc-500"
          />
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Customer"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
          />
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount (₹)"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-mono text-zinc-100 placeholder:text-zinc-500"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (e.g. Rate diff / Damage)"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
            required
          />
          <button type="submit" className="w-full rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            Submit for Owner Approval
          </button>
        </form>

        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 lg:col-span-2">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950/60 text-xs uppercase text-zinc-400">
              <tr>
                <th className="px-4 py-3">CN # / Invoice</th>
                <th className="px-4 py-3">Customer &amp; Reason</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {notes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-zinc-500">
                    No credit notes found.
                  </td>
                </tr>
              ) : (
                notes.map((n) => (
                  <tr key={n.id} className="hover:bg-zinc-800/40">
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-zinc-100">{n.cnNo}</div>
                      <div className="font-mono text-xs text-zinc-400">{n.invoiceNo}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-zinc-200">{n.customerName}</div>
                      <div className="text-xs text-zinc-400">{n.reason}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-zinc-100">{formatINR(n.amount)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          (n.status as string) === 'APPLIED'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : n.status === 'APPROVED'
                              ? 'bg-blue-500/15 text-blue-400'
                              : 'bg-amber-500/15 text-amber-400'
                        }`}
                      >
                        {n.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1.5">
                      {n.status === 'PENDING_APPROVAL' && (
                        <button
                          type="button"
                          onClick={() => updateStatus(n.id, 'APPROVED')}
                          className="rounded border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-400"
                        >
                          Approve
                        </button>
                      )}
                      {n.status === 'APPROVED' && (
                        <button
                          type="button"
                          onClick={() => updateStatus(n.id, 'APPLIED')}
                          className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400"
                        >
                          Apply to Ledger
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
