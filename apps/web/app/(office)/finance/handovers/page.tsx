'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { evaluateHandoverVariance, formatINR } from '@neo/shared';
import { type HandoverRecord } from '../../../../src/lib/finance-data';

const STATUS_BADGE: Record<HandoverRecord['status'], string> = {
  PENDING: 'bg-amber-500/15 text-amber-400',
  VERIFIED: 'bg-emerald-500/15 text-emerald-400',
  DISPUTED: 'bg-rose-500/15 text-rose-400',
  RESOLVED: 'bg-blue-500/15 text-blue-400',
};

export default function CashHandoversPage() {
  const [handovers, setHandovers] = useState<HandoverRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [countedInput, setCountedInput] = useState<string>('');
  const [n500, setN500] = useState<number>(0);
  const [n200, setN200] = useState<number>(0);
  const [n100, setN100] = useState<number>(0);
  const [showDenom, setShowDenom] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/handovers')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res)
          ? res
          : Array.isArray(res?.data)
            ? res.data
            : Array.isArray(res?.items)
              ? res.items
              : [];
        const normalized: HandoverRecord[] = rows.map((h: any) => ({
          id: String(h.id),
          staffName: String(h.staffName ?? h.handedByName ?? h.handed_by_user_id ?? 'Staff'),
          date: String(h.date ?? h.handoverDate ?? h.created_at ?? '').slice(0, 10),
          expectedCash: Number(h.expectedCash ?? h.expected_cash ?? h.expected_amount ?? 0),
          countedCash:
            h.countedCash !== undefined && h.countedCash !== null
              ? Number(h.countedCash)
              : h.counted_amount !== undefined && h.counted_amount !== null
                ? Number(h.counted_amount)
                : null,
          variance: Number(h.variance ?? 0),
          status: (h.status ?? 'PENDING') as HandoverRecord['status'],
          cheques: Array.isArray(h.cheques) ? h.cheques : [],
        }));
        setHandovers(normalized);
        if (normalized.length > 0) setSelectedId(normalized[0].id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const selected = useMemo(
    () => handovers.find((h) => h.id === selectedId) ?? handovers[0] ?? null,
    [handovers, selectedId],
  );

  const parsedCounted = countedInput.trim() === '' ? null : Number(countedInput);
  const evaluation = useMemo(
    () => evaluateHandoverVariance(selected?.expectedCash ?? 0, parsedCounted),
    [selected?.expectedCash, parsedCounted],
  );

  function applyDenominationTotal() {
    const sum = n500 * 500 + n200 * 200 + n100 * 100;
    setCountedInput(String(sum));
  }

  function toggleCheque(chequeId: string) {
    if (!selected) return;
    setHandovers((prev) =>
      prev.map((h) =>
        h.id === selected.id
          ? {
              ...h,
              cheques: h.cheques.map((c) => (c.id === chequeId ? { ...c, checked: !c.checked } : c)),
            }
          : h,
      ),
    );
  }

  async function verifyHandover() {
    if (!selected || !evaluation.canVerify || evaluation.countedCash === null) return;
    const nextStatus: HandoverRecord['status'] = evaluation.isDisputed ? 'DISPUTED' : 'VERIFIED';
    try {
      const res = await fetch(`/api/proxy/handovers/${encodeURIComponent(selected.id)}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countedAmount: String(evaluation.countedCash) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      setHandovers((prev) =>
        prev.map((h) =>
          h.id === selected.id
            ? {
                ...h,
                countedCash: evaluation.countedCash,
                variance: evaluation.cashVariance,
                status: nextStatus,
              }
            : h,
        ),
      );
      setToast(
        evaluation.isDisputed
          ? `Handover marked DISPUTED (${formatINR(evaluation.cashVariance)}) — CASH_HANDOVER_VARIANCE sent to Owner approvals.`
          : `Handover for ${selected.staffName} VERIFIED with zero variance.`,
      );
    } catch (err) {
      setToast(`Failed to verify handover: ${(err as Error).message}`);
    }
  }

  function resolveDispute(id: string) {
    setHandovers((prev) => prev.map((h) => (h.id === id ? { ...h, status: 'RESOLVED' } : h)));
    setToast('Owner resolved disputed handover.');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Cash Handover Desk (BR-07)</h1>
        <p className="text-sm text-zinc-400">
          Verify field staff cash &amp; cheques (OD-015: UPI settles direct). Non-zero variance raises an Owner dispute.
        </p>
      </div>

      {toast && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-300">
          {toast}
        </div>
      )}

      {handovers.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-500">
          No pending cash handovers.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-3">
            {handovers.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setSelectedId(h.id)}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  selected?.id === h.id
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-100">{h.staffName}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[h.status]}`}>
                    {h.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  Expected Cash: <span className="font-mono text-zinc-200">{formatINR(h.expectedCash)}</span>
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-5 lg:col-span-2">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-zinc-100">{selected.staffName}</h2>
                  <p className="text-xs text-zinc-400">Date: {(selected as any).date || (selected as any).handoverDate || ''}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-zinc-400">Expected Cash</div>
                  <div className="font-mono text-xl font-bold text-zinc-100">{formatINR(selected.expectedCash)}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-400">Counted Cash (₹)</label>
                  <button
                    type="button"
                    onClick={() => setShowDenom((v) => !v)}
                    className="text-xs font-semibold text-emerald-400 hover:underline"
                  >
                    {showDenom ? 'Hide Denominations' : 'Use Note Counter'}
                  </button>
                </div>
                <input
                  type="number"
                  value={countedInput}
                  onChange={(e) => setCountedInput(e.target.value)}
                  placeholder="Enter physically counted cash"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-mono text-zinc-100"
                />
                {showDenom && (
                  <div className="grid grid-cols-4 gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs">
                    <input type="number" value={n500} onChange={(e) => setN500(Number(e.target.value))} placeholder="₹500" className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-100" />
                    <input type="number" value={n200} onChange={(e) => setN200(Number(e.target.value))} placeholder="₹200" className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-100" />
                    <input type="number" value={n100} onChange={(e) => setN100(Number(e.target.value))} placeholder="₹100" className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-100" />
                    <button type="button" onClick={applyDenominationTotal} className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white">
                      Apply
                    </button>
                  </div>
                )}
              </div>

              {selected.cheques?.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-400">Cheques Collected</div>
                  {selected.cheques.map((c) => (
                    <label key={c.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs">
                      <span className="flex items-center gap-2 text-zinc-200">
                        <input type="checkbox" checked={c.checked} onChange={() => toggleCheque(c.id)} />
                        <span className="font-mono">{c.chequeNo}</span>
                      </span>
                      <span className="font-mono text-zinc-100">{formatINR(c.amount)}</span>
                    </label>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
                <div className="text-xs text-zinc-400">
                  Variance:{' '}
                  <span className={`font-mono font-bold ${evaluation.isDisputed ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {formatINR(evaluation.cashVariance)}
                  </span>
                </div>
                <div className="flex gap-2">
                  {selected.status === 'DISPUTED' && (
                    <button
                      type="button"
                      onClick={() => resolveDispute(selected.id)}
                      className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-semibold text-blue-400"
                    >
                      Owner Resolve
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!evaluation.canVerify}
                    onClick={verifyHandover}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                  >
                    Verify Handover
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
