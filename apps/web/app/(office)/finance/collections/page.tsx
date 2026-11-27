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
  const [chequeNo, setChequeNo] = useState<string>('');
  const [chequeBank, setChequeBank] = useState<string>('');
  const [chequeDate, setChequeDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reverseReason, setReverseReason] = useState<string>('');
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/proxy/invoices').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/collections').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/customers').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([invRes, rcpRes, custRes]) => {
        if (!active) return;
        const iRows = Array.isArray(invRes) ? invRes : Array.isArray(invRes?.data) ? invRes.data : [];
        const rRows = Array.isArray(rcpRes) ? rcpRes : Array.isArray(rcpRes?.data) ? rcpRes.data : [];
        const cRows = Array.isArray(custRes) ? custRes : Array.isArray(custRes?.data) ? custRes.data : [];
        const mappedCusts = cRows.map((c: any) => ({
          id: String(c.id),
          name: String(c.business_name || c.name || 'Customer'),
        }));
        const custMap = new Map<string, string>(mappedCusts.map((c: { id: string; name: string }) => [c.id, c.name]));

        setInvoices(
          iRows.map((inv: any) => {
            const rawSt = String(inv.status || 'UNPAID');
            const st: InvoiceRecord['status'] =
              rawSt === 'UNPAID'
                ? 'NOT_PAID'
                : rawSt === 'PARTIAL'
                  ? 'PART_PAID'
                  : (rawSt as InvoiceRecord['status']);
            return {
              id: String(inv.id),
              invoiceNo: String(inv.invoice_no || inv.invoiceNo || inv.id),
              invoiceDate: String(inv.invoice_date || inv.invoiceDate || '').slice(0, 10),
              dueDate: String(inv.due_date || inv.dueDate || '').slice(0, 10),
              daysOverdue: 0,
              customerId: String(inv.customer_id || inv.customerId || ''),
              customerName: String(inv.customer_name || inv.customerName || custMap.get(String(inv.customer_id)) || 'Customer'),
              status: st,
              totalAmount: Number(inv.total_amount ?? inv.totalAmount ?? 0),
              paidAmount: Number(inv.paid_amount ?? inv.paidAmount ?? 0),
              balanceAmount: Number(inv.balance_due ?? inv.balanceAmount ?? 0),
              irnStatus: 'DISABLED_MVP',
              lines: [],
            };
          }),
        );

        setReceipts(
          rRows.map((r: any) => ({
            id: String(r.id),
            receiptNo: String(r.receipt_no || r.receiptNo || r.id),
            date: String(r.collected_at || r.created_at || r.date || '').slice(0, 10),
            customerId: String(r.customer_id || r.customerId || ''),
            customerName: String(r.customer_name || r.customerName || custMap.get(String(r.customer_id)) || 'Customer'),
            mode: (r.payment_mode === 'BANK_TRANSFER' ? 'BANK' : r.payment_mode || r.mode || 'CASH') as ReceiptRecord['mode'],
            amount: Number(r.amount ?? 0),
            collectedBy: String(r.collector_name || r.collectedBy || 'Accounts'),
            allocations: Array.isArray(r.allocations) ? r.allocations : [],
            reversed: Boolean(r.reversed ?? false),
          })),
        );

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
    const paymentModeMap: Record<ReceiptRecord['mode'], 'CASH' | 'CHEQUE' | 'UPI' | 'BANK_TRANSFER'> = {
      CASH: 'CASH',
      CHEQUE: 'CHEQUE',
      UPI: 'UPI',
      BANK: 'BANK_TRANSFER',
    };

    if (mode === 'CHEQUE' && (!chequeNo.trim() || !chequeBank.trim())) {
      setToast('Cheque Number and Bank Name are required for CHEQUE collections.');
      return;
    }

    try {
      const res = await fetch('/api/proxy/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          paymentMode: paymentModeMap[mode],
          amount: parsedAmount.toFixed(2),
          idempotencyKey: `col-${selectedCustomerId}-${Date.now()}`,
          ...(mode === 'CHEQUE'
            ? {
                chequeDetails: {
                  chequeNo: chequeNo.trim(),
                  bank: chequeBank.trim(),
                  chequeDate,
                },
              }
            : {}),
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || payload?.error?.message || `HTTP ${res.status}`);
      }
      const created = payload?.data ?? payload;
      const nextNo = String(created?.receiptNo || created?.receipt_no || `RCP-${Date.now()}`);

      const newReceipt: ReceiptRecord = {
        id: String(created?.receiptId || created?.id || `rcp-${Date.now()}`),
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
      setChequeNo('');
      setChequeBank('');
      setToast(`Recorded ${nextNo} (${formatINR(parsedAmount)} via ${mode}) with FIFO invoice allocation.`);
    } catch (err) {
      setToast(`Failed to record receipt: ${(err as Error).message}`);
    }
  }

  async function confirmReverse(receiptId: string) {
    if (!reverseReason.trim()) return;
    setToast(null);
    try {
      const res = await fetch(`/api/proxy/collections/${encodeURIComponent(receiptId)}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reverseReason.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || `HTTP ${res.status}`);
      }
      setReceipts((prev) => prev.map((r) => (r.id === receiptId ? { ...r, reversed: true } : r)));
      setReversingId(null);
      setReverseReason('');
      setToast('Receipt reversed on customer ledger with contra entry.');
    } catch (err) {
      setToast(`Failed to reverse receipt: ${(err as Error).message}`);
    }
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

          {mode === 'CHEQUE' && (
            <div className="space-y-2 rounded-lg border border-rule bg-paper p-3">
              <input
                type="text"
                value={chequeNo}
                onChange={(e) => setChequeNo(e.target.value)}
                placeholder="Cheque Number"
                className="w-full rounded border border-rule bg-sheet px-2.5 py-1.5 text-xs font-mono text-ink"
                required
              />
              <input
                type="text"
                value={chequeBank}
                onChange={(e) => setChequeBank(e.target.value)}
                placeholder="Bank Name"
                className="w-full rounded border border-rule bg-sheet px-2.5 py-1.5 text-xs text-ink"
                required
              />
              <input
                type="date"
                value={chequeDate}
                onChange={(e) => setChequeDate(e.target.value)}
                className="w-full rounded border border-rule bg-sheet px-2.5 py-1.5 text-xs text-ink"
                required
              />
            </div>
          )}

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
                        <div className="inline-flex items-center gap-2">
                          <a
                            href={`/api/proxy/collections/${encodeURIComponent(r.id)}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-semibold text-action hover:underline"
                          >
                            PDF ↗
                          </a>
                          <button
                            type="button"
                            onClick={() => setReversingId(r.id)}
                            className="text-xs font-semibold text-madder hover:underline"
                          >
                            Reverse
                          </button>
                        </div>
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
