'use client';

import React, { useState } from 'react';
import { formatINR, processChequeTransition, type ChequeStatus } from '@neo/shared';
import { INITIAL_CHEQUES, type ChequeRecord } from '../../../../src/lib/finance-data';

const STATUS_STYLE: Record<ChequeStatus, string> = {
  RECEIVED: 'bg-slate-100 text-slate-700',
  DEPOSITED: 'bg-blue-100 text-blue-700',
  CLEARED: 'bg-emerald-100 text-emerald-700',
  BOUNCED: 'bg-rose-100 text-rose-700',
  RETURNED: 'bg-amber-100 text-amber-800',
};

export default function ChequesBoardPage() {
  const [cheques, setCheques] = useState<ChequeRecord[]>(INITIAL_CHEQUES);
  const [toast, setToast] = useState<string | null>(null);

  function handleAction(chq: ChequeRecord, action: 'DEPOSIT' | 'CLEAR' | 'BOUNCE' | 'RETURN') {
    const res = processChequeTransition(chq.status, action, chq.amount);
    setCheques((prev) => prev.map((c) => (c.id === chq.id ? { ...c, status: res.nextStatus } : c)));
    if (res.reversesAllocation) {
      setToast(
        `Cheque ${chq.chequeNo} BOUNCED. Allocation reversed and ${formatINR(res.customerBalanceDelta)} added back to ${chq.customerName} balance.`,
      );
    } else {
      setToast(`Cheque ${chq.chequeNo} moved to ${res.nextStatus}.`);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Cheques &amp; PDC Lifecycle Board</h1>
        <p className="text-sm text-slate-500">
          Track cheques from Received → Deposited → Cleared / Bounced → Returned. Bounces reverse allocation and alert AR.
        </p>
      </div>

      {toast && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-900">
          {toast}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Cheque #</th>
              <th className="px-4 py-3">Customer / Bank</th>
              <th className="px-4 py-3">PDC Date</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Lifecycle Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cheques.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-mono font-bold text-slate-900">{c.chequeNo}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-800">{c.customerName}</div>
                  <div className="text-xs text-slate-500">{c.bankName}</div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{c.pdcDate}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                  {formatINR(c.amount)}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[c.status]}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1.5">
                    {c.status === 'RECEIVED' && (
                      <button
                        type="button"
                        onClick={() => handleAction(c, 'DEPOSIT')}
                        className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"
                      >
                        Deposit
                      </button>
                    )}
                    {c.status === 'DEPOSITED' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAction(c, 'CLEAR')}
                          className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAction(c, 'BOUNCE')}
                          className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
                        >
                          Bounce
                        </button>
                      </>
                    )}
                    {c.status === 'BOUNCED' && (
                      <button
                        type="button"
                        onClick={() => handleAction(c, 'RETURN')}
                        className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
                      >
                        Mark Returned
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

