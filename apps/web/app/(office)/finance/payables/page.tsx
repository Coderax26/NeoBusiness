'use client';

import React, { useState, useEffect } from 'react';
import { formatINR, subMoney } from '@neo/shared';
import { type SupplierPayableRecord } from '../../../../src/lib/finance-data';

export default function SupplierPayablesPage() {
  const [bills, setBills] = useState<SupplierPayableRecord[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/procurement/supplier-bills')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setBills(
          rows.map((b: any) => ({
            id: String(b.id),
            billNo: String(b.billNo || b.bill_no || b.billNumber || b.id),
            supplierName: String(b.supplierName || b.supplier_name || 'Supplier'),
            dueDate: String(b.dueDate || b.due_date || b.bill_date || '').slice(0, 10),
            totalAmount: Number(b.totalAmount ?? b.total_amount ?? 0),
            paidAmount: Number(b.paidAmount ?? b.paid_amount ?? 0),
            status: (b.status || 'APPROVED') as SupplierPayableRecord['status'],
          })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function recordFullPayment(bill: SupplierPayableRecord) {
    const amount = Number(subMoney(bill.totalAmount, bill.paidAmount));
    try {
      const res = await fetch(`/api/proxy/procurement/supplier-bills/${encodeURIComponent(bill.id)}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paidAmount: amount,
          paymentRef: `BANK-${Date.now()}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      setBills((prev) =>
        prev.map((b) =>
          b.id === bill.id ? { ...b, paidAmount: b.totalAmount, status: 'PAID' } : b,
        ),
      );
      setToast(`Recorded supplier payment for ${bill.billNo} (${bill.supplierName}).`);
    } catch (err) {
      setToast(`Failed to record payment: ${(err as Error).message}`);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Supplier Bills &amp; Payables (AP)</h1>
        <p className="text-sm text-zinc-400">
          Approved supplier bills from Procurement (F5), outstanding balance, and payment recording.
        </p>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-300">
          {toast}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950/60 text-xs uppercase text-zinc-400">
            <tr>
              <th className="px-4 py-3">Bill # / Supplier</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {bills.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500">
                  No supplier payables found.
                </td>
              </tr>
            ) : (
              bills.map((b) => {
                const balance = Number(subMoney(b.totalAmount, b.paidAmount));
                return (
                  <tr key={b.id} className="hover:bg-zinc-800/40">
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold text-zinc-100">{b.billNo}</div>
                      <div className="text-xs text-zinc-400">{b.supplierName}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">{b.dueDate}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-200">{formatINR(b.totalAmount)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-rose-400">
                      {formatINR(balance)}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-zinc-300">{b.status}</td>
                    <td className="px-4 py-3 text-right">
                      {b.status !== 'PAID' && (
                        <button
                          type="button"
                          onClick={() => recordFullPayment(b)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Record Payment
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
