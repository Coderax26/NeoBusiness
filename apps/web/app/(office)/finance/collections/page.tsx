'use client';

import React, { useMemo, useState } from 'react';
import { allocateReceiptFifo, formatINR, subMoney } from '@neo/shared';
import {
  INITIAL_INVOICES,
  INITIAL_RECEIPTS,
  type InvoiceRecord,
  type ReceiptRecord,
} from '../../../../src/lib/finance-data';

export default function CollectionsPage() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(INITIAL_INVOICES);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>(INITIAL_RECEIPTS);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('cust-1');
  const [mode, setMode] = useState<ReceiptRecord['mode']>('CASH');
  const [amountInput, setAmountInput] = useState<string>('65000');
  const [reverseReason, setReverseReason] = useState<string>('');
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const customers = useMemo(
    () => [
      { id: 'cust-1', name: 'Sahyadri Dairy' },
      { id: 'cust-2', name: 'Gokul Milk Union' },
      { id: 'cust-3', name: 'Nandini Agro Feeds' },
    ],
    [],
  );

  const openCustomerInvoices = useMemo(
    () =>
      invoices
        .filter((inv) => inv.customerId === selectedCustomerId && inv.balanceAmount > 0 && inv.status !== 'CANCELLED')
        .sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime()),
    [invoices, selectedCustomerId],
  );

  const parsedAmount = Number(amountInput) || 0;

  const fifoPreview = useMemo(
    () =>
      allocateReceiptFifo(
        parsedAmount,
        openCustomerInvoices.map((inv) => ({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNo,
          invoiceDate: inv.invoiceDate,
          outstandingAmount: inv.balanceAmount,
        })),
      ),
    [parsedAmount, openCustomerInvoices],
  );

  function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (parsedAmount <= 0) return;

    const customerName = customers.find((c) => c.id === selectedCustomerId)?.name ?? 'Customer';
    const nextNo = `RCP-2026-0${412 + receipts.length}`;

    const newReceipt: ReceiptRecord = {
      id: `rcp-${Date.now()}`,
      receiptNo: nextNo,
      date: '2026-11-13',
      customerId: selectedCustomerId,
      customerName,
      mode,
      amount: parsedAmount,
      collectedBy: mode === 'UPI' ? 'Direct UPI' : 'Office Cashier',
      allocations: fifoPreview.allocations.map((a) => ({
        invoiceId: a.invoiceId,
        invoiceNo: a.invoiceNumber,
        allocatedAmount: a.allocatedAmount,
      })),
      reversed: false,
    };

    setReceipts((prev) => [newReceipt, ...prev]);
    setInvoices((prev) =>
      prev.map((inv) => {
        const alloc = fifoPreview.allocations.find((a) => a.invoiceId === inv.id);
        if (!alloc) return inv;
        const nextBal = alloc.remainingInvoiceBalance;
        const nextPaid = Number(subMoney(inv.totalAmount, nextBal));
        return {
          ...inv,
          paidAmount: nextPaid,
          balanceAmount: nextBal,
          status: nextBal === 0 ? 'PAID' : 'PART_PAID',
        };
      }),
    );
    setToast(`Recorded ${nextNo} (${formatINR(parsedAmount)}) with FIFO allocation.`);
  }

  function confirmReversal(receiptId: string) {
    if (!reverseReason.trim()) return;
    setReceipts((prev) =>
      prev.map((r) => (r.id === receiptId ? { ...r, reversed: true, reversalReason: reverseReason } : r)),
    );
    setReversingId(null);
    setReverseReason('');
    setToast('Receipt reversed (append-only audit record preserved).');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Payments Received &amp; FIFO Allocation</h1>
        <p className="text-sm text-slate-500">
          Record cash, cheque, UPI, or bank receipts with oldest-first FIFO allocation (OD-017) and append-only reversals.
        </p>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Record Payment Form */}
        <form onSubmit={recordPayment} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900">Record Payment</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-600">Customer</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600">Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ReceiptRecord['mode'])}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="CASH">Cash</option>
                <option value="CHEQUE">Cheque</option>
                <option value="UPI">UPI (Direct)</option>
                <option value="BANK">NEFT / RTGS</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600">Amount (₹)</label>
              <input
                type="number"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
              />
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700">
            Formatted: <span className="font-bold text-slate-900">{formatINR(parsedAmount)}</span>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600">FIFO Allocation Preview (Oldest First)</div>
            {fifoPreview.allocations.length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">No open invoices for this customer.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-xs">
                {fifoPreview.allocations.map((a) => (
                  <li key={a.invoiceId} className="flex justify-between rounded bg-emerald-50 px-2.5 py-1.5">
                    <span className="font-mono font-semibold text-emerald-900">{a.invoiceNumber}</span>
                    <span className="font-mono text-emerald-800">{formatINR(a.allocatedAmount)}</span>
                  </li>
                ))}
                {fifoPreview.unallocatedAdvance > 0 && (
                  <li className="flex justify-between rounded bg-amber-50 px-2.5 py-1.5 text-amber-800">
                    <span>Advance Credit</span>
                    <span className="font-mono">{formatINR(fifoPreview.unallocatedAdvance)}</span>
                  </li>
                )}
              </ul>
            )}
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Post Receipt &amp; Allocate
          </button>
        </form>

        {/* Receipts Register */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-2">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-800">
            Receipts Register
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Receipt</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receipts.map((rcp) => (
                <tr key={rcp.id} className={rcp.reversed ? 'bg-rose-50/40 opacity-75' : 'hover:bg-slate-50'}>
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold text-slate-900">{rcp.receiptNo}</div>
                    <div className="text-xs text-slate-500">{rcp.date} · {rcp.collectedBy}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{rcp.customerName}</div>
                    <div className="text-xs text-slate-500">
                      {rcp.allocations.map((a) => `${a.invoiceNo} (${formatINR(a.allocatedAmount)})`).join(', ')}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{rcp.mode}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700">
                    {formatINR(rcp.amount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {rcp.reversed ? (
                      <span className="text-xs font-semibold text-rose-700">Reversed</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setReversingId(rcp.id)}
                        className="rounded border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        Reverse
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {reversingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Reverse Receipt (Append-Only)</h3>
            <p className="mt-1 text-xs text-slate-500">Posted money rows cannot be edited or deleted. Enter reversal reason:</p>
            <input
              type="text"
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="e.g. Wrong customer selected"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReversingId(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmReversal(reversingId)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Confirm Reversal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

