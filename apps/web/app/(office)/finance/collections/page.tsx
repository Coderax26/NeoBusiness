'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { allocateReceiptFifo, formatINR, subMoney } from '@neo/shared';
import { type InvoiceRecord, type ReceiptRecord } from '../../../../src/lib/finance-data';

export default function CollectionsPage() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [mode, setMode] = useState<ReceiptRecord['mode']>('CASH');
  const [amountInput, setAmountInput] = useState<string>('');
  const [reverseReason, setReverseReason] = useState<string>('');
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/proxy/invoices').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/collections/receipts').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/customers').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([invRes, rcpRes, custRes]) => {
        if (!active) return;
        const iRows = Array.isArray(invRes) ? invRes : Array.isArray(invRes?.data) ? invRes.data : [];
        const rRows = Array.isArray(rcpRes) ? rcpRes : Array.isArray(rcpRes?.data) ? rcpRes.data : [];
        const cRows = Array.isArray(custRes) ? custRes : Array.isArray(custRes?.data) ? custRes.data : [];
        setInvoices(iRows);
        setReceipts(rRows);
        const mappedCusts = cRows.map((c: any) => ({
          id: String(c.id),
          name: String(c.business_name || c.name || 'Customer'),
        }));
        setCustomers(mappedCusts);
        if (mappedCusts.length > 0) setSelectedCustomerId(mappedCusts[0].id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (parsedAmount <= 0 || !selectedCustomerId) return;

    const customerName = customers.find((c) => c.id === selectedCustomerId)?.name ?? 'Customer';
    const nextNo = `RCP-2026-0${412 + receipts.length}`;

    await fetch('/api/proxy/collections/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: selectedCustomerId,
        mode,
        amount: parsedAmount,
      }),
    }).catch(() => {});

    const newReceipt: ReceiptRecord = {
      id: `rcp-${Date.now()}`,
      receiptNo: nextNo,
      date: new Date().toISOString().slice(0, 10),
      customerId: selectedCustomerId,
      customerName,
      mode,
      amount: parsedAmount,
      allocations: fifoPreview.allocations.map((a) => ({
        invoiceId: a.invoiceId,
        invoiceNo: a.invoiceNumber,
        allocatedAmount: a.allocatedAmount,
      })),
      collectedBy: 'Accounts',
      reversed: false,
    };

    setReceipts((prev) => [newReceipt, ...prev]);
    setInvoices((prev) =>
      prev.map((inv) => {
        const hit = fifoPreview.allocations.find((a) => a.invoiceId === inv.id);
        if (!hit) return inv;
        const nextPaid = inv.paidAmount + hit.allocatedAmount;
        const nextBal = Number(subMoney(inv.totalAmount, nextPaid));
        return {
          ...inv,
          paidAmount: nextPaid,
          balanceAmount: nextBal,
          status: nextBal <= 0 ? 'PAID' : 'PART_PAID',
        };
      }),
    );
    setAmountInput('');
    setToast(`Recorded ${nextNo} (${formatINR(parsedAmount)} via ${mode}) with FIFO invoice allocation.`);
  }

  function confirmReverse(receiptId: string) {
    if (!reverseReason.trim()) return;
    setReceipts((prev) => prev.map((r) => (r.id === receiptId ? { ...r, reversed: true } : r)));
    setReversingId(null);
    setReverseReason('');
    setToast('Receipt reversed with audit reason.');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Collections &amp; FIFO Receipt Allocation</h1>
        <p className="text-sm text-ink-3">
          Record Cash, UPI, Bank, or Cheque receipts — auto-allocated oldest-invoice-first (FIFO).
        </p>
      </div>

      {toast && (
        <div className="rounded-[3px] border border-leaf/30 bg-leaf-soft px-4 py-2.5 text-sm font-medium text-leaf">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={recordPayment} className="rounded-[3px] border border-rule bg-sheet p-5 space-y-4">
          <h2 className="text-base font-bold text-ink">Record Customer Receipt</h2>
          <div>
            <label className="block text-xs font-semibold text-ink-3 mb-1">Customer</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-3 mb-1">Payment Mode</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['CASH', 'UPI', 'BANK', 'CHEQUE'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-lg py-1.5 text-xs font-semibold ${
                    mode === m
                      ? 'bg-leaf text-white'
                      : 'border border-rule bg-paper text-ink-2'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-3 mb-1">Amount (₹)</label>
            <input
              type="number"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm font-mono text-ink"
              required
            />
          </div>

          {fifoPreview.allocations.length > 0 && (
            <div className="rounded-lg border border-rule bg-paper p-3 space-y-1.5 text-xs">
              <div className="font-semibold text-ink-2">FIFO Allocation Preview:</div>
              {fifoPreview.allocations.map((a) => (
                <div key={a.invoiceId} className="flex justify-between text-ink-3">
                  <span className="font-mono">{a.invoiceNumber}</span>
                  <span className="font-mono text-leaf">{formatINR(a.allocatedAmount)}</span>
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-[3px] bg-leaf py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Save Receipt &amp; Allocate
          </button>
        </form>

        <div className="overflow-hidden rounded-[3px] border border-rule bg-sheet lg:col-span-2">
          <div className="border-b border-rule bg-paper px-5 py-3 text-sm font-bold text-ink">
            Recent Receipts
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-ink-3">
              <tr>
                <th className="px-4 py-3">Receipt #</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-ink-3">
                    No receipts recorded.
                  </td>
                </tr>
              ) : (
                receipts.map((r) => (
                  <tr key={r.id} className="hover:bg-sunken">
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-ink">{r.receiptNo}</div>
                      <div className="text-xs text-ink-3">{r.date}</div>
                    </td>
                    <td className="px-4 py-3 text-ink">{r.customerName}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-sunken px-2 py-0.5 text-xs font-semibold text-ink-2">
                        {r.mode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-leaf">
                      {formatINR(r.amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.reversed ? (
                        <span className="text-xs font-semibold text-madder">REVERSED</span>
                      ) : reversingId === r.id ? (
                        <div className="inline-flex gap-1">
                          <input
                            type="text"
                            value={reverseReason}
                            onChange={(e) => setReverseReason(e.target.value)}
                            placeholder="Reason"
                            className="w-28 rounded border border-rule-strong bg-paper px-2 py-1 text-xs text-ink"
                          />
                          <button
                            type="button"
                            onClick={() => confirmReverse(r.id)}
                            className="rounded bg-madder px-2 py-1 text-xs text-white"
                          >
                            Confirm
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setReversingId(r.id)}
                          className="text-xs font-semibold text-madder hover:underline"
                        >
                          Reverse
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
