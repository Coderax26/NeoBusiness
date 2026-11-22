'use client';

import React, { useState, useEffect } from 'react';
import { formatINR, processChequeTransition, type ChequeStatus } from '@neo/shared';
import { type ChequeRecord } from '../../../../src/lib/finance-data';

const STATUS_STYLE: Record<ChequeStatus, string> = {
  RECEIVED: 'bg-zinc-800 text-zinc-300',
  DEPOSITED: 'bg-blue-500/15 text-blue-400',
  CLEARED: 'bg-emerald-500/15 text-emerald-400',
  BOUNCED: 'bg-rose-500/15 text-rose-400',
  RETURNED: 'bg-amber-500/15 text-amber-400',
};

export default function ChequesBoardPage() {
  const [cheques, setCheques] = useState<ChequeRecord[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/cheques')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setCheques(
          rows.map((c: any) => ({
            id: String(c.id),
            chequeNo: String(c.chequeNo ?? c.cheque_no ?? ''),
            customerName: String(c.customerName ?? c.customer_name ?? c.receipt_no ?? c.customer_id ?? 'Customer'),
            bankName: String(c.bankName ?? c.bank_name ?? c.bank ?? ''),
            pdcDate: String(c.pdcDate ?? c.cheque_date ?? '').slice(0, 10),
            amount: Number(c.amount ?? c.amountInr ?? 0),
            status: (c.status ?? 'RECEIVED') as ChequeStatus,
          })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function handleAction(chq: ChequeRecord, action: 'DEPOSIT' | 'CLEAR' | 'BOUNCE' | 'RETURN') {
    const res = processChequeTransition(chq.status, action, chq.amount);
    const endpoint = action.toLowerCase();
    const payload =
      action === 'DEPOSIT'
        ? { depositSlipNo: `DEP-${Date.now()}` }
        : action === 'BOUNCE'
          ? { bounceReason: 'Bounced at bank' }
          : action === 'RETURN'
            ? { reason: 'Returned to customer' }
            : {};

    try {
      const apiRes = await fetch(`/api/proxy/cheques/${encodeURIComponent(chq.id)}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!apiRes.ok) {
        const err = await apiRes.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${apiRes.status}`);
      }
      setCheques((prev) => prev.map((c) => (c.id === chq.id ? { ...c, status: res.nextStatus } : c)));
      if (res.reversesAllocation) {
        setToast(
          `Cheque ${chq.chequeNo} BOUNCED. Allocation reversed and ${formatINR(res.customerBalanceDelta)} added back to ${chq.customerName} balance.`,
        );
      } else {
        setToast(`Cheque ${chq.chequeNo} moved to ${res.nextStatus}.`);
      }
    } catch (err) {
      setToast(`Cheque action failed: ${(err as Error).message}`);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Cheques &amp; PDC Lifecycle Board</h1>
        <p className="text-sm text-zinc-400">
          Track cheques from Received → Deposited → Cleared / Bounced → Returned. Bounces reverse allocation and alert AR.
        </p>
      </div>

      {toast && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm font-medium text-blue-300">
          {toast}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950/60 text-xs uppercase text-zinc-400">
            <tr>
              <th className="px-4 py-3">Cheque #</th>
              <th className="px-4 py-3">Customer / Bank</th>
              <th className="px-4 py-3">PDC Date</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Lifecycle Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {cheques.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500">
                  No cheques recorded.
                </td>
              </tr>
            ) : (
              cheques.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-800/40">
                  <td className="px-4 py-3 font-mono font-bold text-zinc-100">{c.chequeNo}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-zinc-200">{c.customerName}</div>
                    <div className="text-xs text-zinc-400">{c.bankName}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{c.pdcDate}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-zinc-100">
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
                          className="rounded border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-400 hover:bg-blue-500/20"
                        >
                          Deposit
                        </button>
                      )}
                      {c.status === 'DEPOSITED' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleAction(c, 'CLEAR')}
                            className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAction(c, 'BOUNCE')}
                            className="rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/20"
                          >
                            Bounce
                          </button>
                        </>
                      )}
                      {c.status === 'BOUNCED' && (
                        <button
                          type="button"
                          onClick={() => handleAction(c, 'RETURN')}
                          className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400 hover:bg-amber-500/20"
                        >
                          Return to Customer
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
