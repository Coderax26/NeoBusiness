'use client';

import React, { useState } from 'react';
import { formatINR, subMoney } from '@neo/shared';
import { INITIAL_SUPPLIER_PAYABLES, type SupplierPayableRecord } from '../../../../src/lib/finance-data';

export default function SupplierPayablesPage() {
  const [bills, setBills] = useState<SupplierPayableRecord[]>(INITIAL_SUPPLIER_PAYABLES);
  const [toast, setToast] = useState<string | null>(null);

  function recordFullPayment(bill: SupplierPayableRecord) {
    setBills((prev) =>
      prev.map((b) =>
        b.id === bill.id ? { ...b, paidAmount: b.totalAmount, status: 'PAID' } : b,
      ),
    );
    setToast(`Recorded supplier payment for ${bill.billNo} (${bill.supplierName}).`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Supplier Bills &amp; Payables (AP)</h1>
        <p className="text-sm text-slate-500">
          Approved supplier bills from Procurement (F5), outstanding balance, and payment recording.
        </p>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
          {toast}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Bill # / Supplier</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bills.map((b) => {
              const balance = Number(subMoney(b.totalAmount, b.paidAmount));
              return (
                <tr key={b.id}>
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold text-slate-900">{b.billNo}</div>
                    <div className="text-xs text-slate-500">{b.supplierName}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{b.dueDate}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatINR(b.totalAmount)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-rose-700">
                    {formatINR(balance)}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold">{b.status}</td>
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
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

