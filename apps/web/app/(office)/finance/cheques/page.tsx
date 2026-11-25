'use client';

import React, { useState, useEffect } from 'react';
import { formatINR, processChequeTransition, type ChequeStatus } from '@neo/shared';
import { type ChequeRecord } from '../../../../src/lib/finance-data';

const STATUS_STYLE: Record<ChequeStatus, string> = {
  RECEIVED: 'bg-sunken text-ink-2',
  DEPOSITED: 'bg-blue-500/15 text-blue-400',
  CLEARED: 'bg-leaf-soft text-leaf',
  BOUNCED: 'bg-madder-soft text-madder',
  RETURNED: 'bg-haldi-soft text-haldi',
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
        <h1 className="text-2xl font-bold text-ink">Cheques &amp; PDC Lifecycle Board</h1>
        <p className="text-sm text-ink-3">
          Track cheques from Received → Deposited → Cleared / Bounced → Returned. Bounces reverse allocation and alert AR.
        </p>
      </div>

      {toast && (
        <div className="rounded-[3px] border border-action/30 bg-action-soft px-4 py-2.5 text-sm font-medium text-action">
          {toast}
        </div>
      )}

      <div className="overflow-hidden rounded-[3px] border border-rule bg-sheet">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-ink-3">
            <tr>
              <th className="px-4 py-3">Cheque #</th>
              <th className="px-4 py-3">Customer / Bank</th>
              <th className="px-4 py-3">PDC Date</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Lifecycle Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {cheques.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-ink-3">
                  No cheques recorded.
                </td>
              </tr>
            ) : (
              cheques.map((c) => (
                <tr key={c.id} className="hover:bg-sunken">
                  <td className="px-4 py-3 font-mono font-bold text-ink">{c.chequeNo}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{c.customerName}</div>
                    <div className="text-xs text-ink-3">{c.bankName}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-3">{c.pdcDate}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                    {formatINR(c.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold${STATUS_STYLE[c.status]}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1.5">
                      {c.status === 'RECEIVED' && (
                        <button
                          type="button"
                          onClick={() => handleAction(c, 'DEPOSIT')}
                          className="rounded border border-action/30 bg-action-soft px-2.5 py-1 text-xs font-semibold text-action hover:bg-action-hover/20"
                        >
                          Deposit
                        </button>
                      )}
                      {c.status === 'DEPOSITED' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleAction(c, 'CLEAR')}
                            className="rounded border border-leaf/30 bg-leaf-soft px-2.5 py-1 text-xs font-semibold text-leaf hover:opacity-90/20"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAction(c, 'BOUNCE')}
                            className="rounded border border-madder/30 bg-madder-soft px-2.5 py-1 text-xs font-semibold text-madder hover:opacity-90/20"
                          >
                            Bounce
                          </button>
                        </>
                      )}
                      {c.status === 'BOUNCED' && (
                        <button
                          type="button"
                          onClick={() => handleAction(c, 'RETURN')}
                          className="rounded border border-haldi/30 bg-haldi-soft px-2.5 py-1 text-xs font-semibold text-haldi hover:opacity-90/20"
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
