'use client';

import React, { useMemo, useState } from 'react';
import { formatINR } from '@neo/shared';
import { INITIAL_INVOICES, type InvoiceRecord } from '../../../../src/lib/finance-data';

const STATUS_COLORS: Record<InvoiceRecord['status'], string> = {
  NOT_PAID: 'bg-amber-100 text-amber-800',
  PART_PAID: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  OVERDUE: 'bg-rose-100 text-rose-700',
  CANCELLED: 'bg-slate-200 text-slate-600',
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(INITIAL_INVOICES);
  const [statusFilter, setStatusFilter] = useState<'ALL' | InvoiceRecord['status']>('ALL');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(
    () => invoices.filter((i) => (statusFilter === 'ALL' ? true : i.status === statusFilter)),
    [invoices, statusFilter],
  );

  function generateManualInvoice() {
    const nextNo = `INV-2026-0${105 + invoices.length}`;
    const created: InvoiceRecord = {
      id: `inv-${Date.now()}`,
      invoiceNo: nextNo,
      invoiceDate: '2026-11-13',
      dueDate: '2026-11-28',
      daysOverdue: 0,
      customerId: 'cust-1',
      customerName: 'Sahyadri Dairy',
      status: 'NOT_PAID',
      totalAmount: 30000,
      paidAmount: 0,
      balanceAmount: 30000,
      irnStatus: 'DISABLED_MVP',
      lines: [
        { sku: 'CF-50', itemName: 'Dairy Gold Pellet 50kg', hsn: '2309', taxCategory: 'EXEMPT', qty: 20, rate: 1500, taxAmount: 0, lineTotal: 30000 },
      ],
    };
    setInvoices((prev) => [created, ...prev]);
    setToast(`Generated Tax Invoice ${nextNo}`);
  }

  function requestCancel(invoiceId: string) {
    if (!cancelReason.trim()) return;
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
          <h1 className="text-2xl font-bold text-slate-900">Tax Invoices</h1>
          <p className="text-sm text-slate-500">
            GST &amp; Exempt mixed-line invoices, HSN summary, PDF sharing, and void requests (e-Invoice IRN disabled for MVP).
          </p>
        </div>
        <button
          type="button"
          onClick={generateManualInvoice}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          + Generate Invoice
        </button>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
          {toast}
        </div>
      )}

      {/* Status Filter */}
      <div className="flex flex-wrap gap-2">
        {(['ALL', 'NOT_PAID', 'PART_PAID', 'PAID', 'OVERDUE', 'CANCELLED'] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              statusFilter === st
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {st.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-mono font-semibold text-slate-900">{inv.invoiceNo}</div>
                  <div className="text-xs text-slate-500">{inv.invoiceDate}</div>
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">{inv.customerName}</td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {inv.dueDate}
                  {inv.daysOverdue > 0 && (
                    <span className="ml-2 font-semibold text-rose-600">({inv.daysOverdue}d overdue)</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[inv.status]}`}>
                    {inv.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                  {formatINR(inv.totalAmount)}
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-rose-700">
                  {formatINR(inv.balanceAmount)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setSelectedInvoice(inv)}
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    View GST Detail
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  GST Tax Invoice — {selectedInvoice.invoiceNo}
                </h2>
                <p className="text-xs text-slate-500">
                  {selectedInvoice.customerName} · Date {selectedInvoice.invoiceDate} · Due {selectedInvoice.dueDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {/* Disabled e-Invoice IRN Banner (OD-004) */}
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
              <div>
                IRN: <input disabled value="Disabled for MVP (OD-004)" className="ml-1 bg-transparent font-mono" />
              </div>
              <div>
                Ack No: <input disabled value="—" className="ml-1 bg-transparent font-mono" />
              </div>
            </div>

            {/* Lines */}
            <table className="mt-4 w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2">Item / HSN</th>
                  <th className="px-3 py-2">Tax Cat</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">GST</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedInvoice.lines.map((l, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-900">{l.itemName}</div>
                      <div className="text-slate-500">HSN {l.hsn}</div>
                    </td>
                    <td className="px-3 py-2">{l.taxCategory}</td>
                    <td className="px-3 py-2 text-right">{l.qty}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatINR(l.taxAmount)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{formatINR(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Actions: Print/PDF + Cancel */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setToast(`Downloaded PDF for ${selectedInvoice.invoiceNo}`)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => setToast(`Shared ${selectedInvoice.invoiceNo} via WhatsApp`)}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                >
                  Share WhatsApp
                </button>
              </div>
              {selectedInvoice.status !== 'CANCELLED' && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Void reason..."
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => requestCancel(selectedInvoice.id)}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                  >
                    Cancel Invoice
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

