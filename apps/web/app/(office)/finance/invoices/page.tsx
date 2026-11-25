'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { formatINR } from '@neo/shared';
import { type InvoiceRecord } from '../../../../src/lib/finance-data';

const STATUS_COLORS: Record<InvoiceRecord['status'], string> = {
  NOT_PAID: 'bg-haldi-soft text-haldi',
  PART_PAID: 'bg-blue-500/15 text-blue-400',
  PAID: 'bg-leaf-soft text-leaf',
  OVERDUE: 'bg-madder-soft text-madder',
  CANCELLED: 'bg-sunken text-ink-3',
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | InvoiceRecord['status']>('ALL');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/invoices')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setInvoices(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(
    () => invoices.filter((i) => (statusFilter === 'ALL' ? true : i.status === statusFilter)),
    [invoices, statusFilter],
  );

  async function requestCancel(invoiceId: string) {
    if (!cancelReason.trim()) return;
    await fetch(`/api/proxy/invoices/${encodeURIComponent(invoiceId)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: cancelReason }),
    }).catch(() => {});
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId ? { ...inv, status: 'CANCELLED', balanceAmount: 0 } : inv,
      ),
    );
    setSelectedInvoice(null);
    setCancelReason('');
    setToast('Invoice cancelled & submitted to audit log.');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Tax Invoices</h1>
          <p className="text-sm text-ink-3">
            GST &amp; Exempt mixed-line invoices, HSN summary, PDF sharing, and void requests (e-Invoice IRN disabled for MVP).
          </p>
        </div>
      </div>

      {toast && (
        <div className="rounded-[3px] border border-leaf/30 bg-leaf-soft px-4 py-2.5 text-sm font-medium text-leaf">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(['ALL', 'NOT_PAID', 'PART_PAID', 'PAID', 'OVERDUE', 'CANCELLED'] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold${
              statusFilter === st
                ? 'bg-leaf text-white'
                : 'border border-rule bg-sheet text-ink-2 hover:bg-sunken'
            }`}
          >
            {st.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-[3px] border border-rule bg-sheet">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-ink-3">
            <tr>
              <th className="px-4 py-3">Invoice #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Date / Due</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-ink-3">
                  No invoices found.
                </td>
              </tr>
            ) : (
              filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-sunken">
                  <td className="px-4 py-3 font-mono font-bold text-ink">{inv.invoiceNo}</td>
                  <td className="px-4 py-3 text-ink">{inv.customerName}</td>
                  <td className="px-4 py-3 text-xs text-ink-3">
                    {inv.invoiceDate} · Due {inv.dueDate}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-ink">{formatINR(inv.totalAmount)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-haldi">
                    {formatINR(inv.balanceAmount)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold${STATUS_COLORS[inv.status]}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <a
                      href={`/api/proxy/invoices/${encodeURIComponent(inv.id)}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-action hover:underline"
                    >
                      PDF
                    </a>
                    {inv.status !== 'CANCELLED' && (
                      <button
                        type="button"
                        onClick={() => setSelectedInvoice(inv)}
                        className="text-xs font-semibold text-madder hover:underline"
                      >
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-[4px] border border-rule bg-sheet p-6 space-y-4">
            <h2 className="text-lg font-bold text-ink">Void {selectedInvoice.invoiceNo}</h2>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation"
              className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="rounded-lg border border-rule-strong bg-paper px-4 py-2 text-sm font-semibold text-ink-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => requestCancel(selectedInvoice.id)}
                className="rounded-lg bg-madder px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
