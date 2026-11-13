'use client';

import React, { useMemo, useState } from 'react';
import { evaluateHandoverVariance, formatINR } from '@neo/shared';
import { INITIAL_HANDOVERS, type HandoverRecord } from '../../../../src/lib/finance-data';

const STATUS_BADGE: Record<HandoverRecord['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  VERIFIED: 'bg-emerald-100 text-emerald-700',
  DISPUTED: 'bg-rose-100 text-rose-700',
  RESOLVED: 'bg-blue-100 text-blue-700',
};

export default function CashHandoversPage() {
  const [handovers, setHandovers] = useState<HandoverRecord[]>(INITIAL_HANDOVERS);
  const [selectedId, setSelectedId] = useState<string>(INITIAL_HANDOVERS[0].id);
  const [countedInput, setCountedInput] = useState<string>('');
  const [n500, setN500] = useState<number>(0);
  const [n200, setN200] = useState<number>(0);
  const [n100, setN100] = useState<number>(0);
  const [showDenom, setShowDenom] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);

  const selected = useMemo(
    () => handovers.find((h) => h.id === selectedId) ?? handovers[0],
    [handovers, selectedId],
  );

  const parsedCounted = countedInput.trim() === '' ? null : Number(countedInput);
  const evaluation = useMemo(
    () => evaluateHandoverVariance(selected.expectedCash, parsedCounted),
    [selected.expectedCash, parsedCounted],
  );

  function applyDenominationTotal() {
    const sum = n500 * 500 + n200 * 200 + n100 * 100;
    setCountedInput(String(sum));
  }

  function toggleCheque(chequeId: string) {
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

  function verifyHandover() {
    if (!evaluation.canVerify || evaluation.countedCash === null) return;
    const nextStatus: HandoverRecord['status'] = evaluation.isDisputed ? 'DISPUTED' : 'VERIFIED';
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
  }

  function resolveDispute(id: string) {
    setHandovers((prev) => prev.map((h) => (h.id === id ? { ...h, status: 'RESOLVED' } : h)));
    setToast('Owner resolved disputed handover.');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Cash Handover Desk (BR-07)</h1>
        <p className="text-sm text-slate-500">
          Verify field staff cash &amp; cheques (OD-015: UPI settles direct). Non-zero variance raises an Owner dispute.
        </p>
      </div>

      {toast && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900">
          {toast}
        </div>
      )}

      {/* Active Handover Verification Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500">Select Staff Handover</label>
            <select
              value={selected.id}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setCountedInput('');
              }}
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
            >
              {handovers.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.staffName} ({h.staffRole}) — {h.status}
                </option>
              ))}
            </select>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE[selected.status]}`}>
            {selected.status}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs text-slate-500">Expected Cash in Wallet</div>
            <div className="mt-1 font-mono text-2xl font-bold text-slate-900">{formatINR(selected.expectedCash)}</div>
            <div className="mt-2 text-xs text-slate-600">
              Expected Cheques: {selected.cheques.length} (
              {formatINR(selected.cheques.reduce((s, c) => s + c.amount, 0))})
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600">Counted Cash (₹)</label>
              <button
                type="button"
                onClick={() => setShowDenom((v) => !v)}
                className="text-xs font-semibold text-emerald-700 hover:underline"
              >
                {showDenom ? 'Hide Denomination Helper' : 'Denomination Helper ▸'}
              </button>
            </div>
            <input
              type="number"
              value={countedInput}
              onChange={(e) => setCountedInput(e.target.value)}
              placeholder="Enter counted cash"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-lg font-bold"
            />
            {evaluation.canVerify && (
              <div
                className={`text-sm font-semibold ${
                  evaluation.isDisputed ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                Variance: {formatINR(evaluation.cashVariance)}
                {evaluation.isDisputed && ' ⚠ Will mark Disputed & notify Owner'}
              </div>
            )}
          </div>
        </div>

        {showDenom && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="text-xs font-bold text-slate-700">Denomination Counter</div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
              <label>
                ₹500 ×{' '}
                <input
                  type="number"
                  min={0}
                  value={n500}
                  onChange={(e) => setN500(Number(e.target.value) || 0)}
                  className="w-16 rounded border border-slate-300 bg-white px-2 py-1 font-mono"
                />
              </label>
              <label>
                ₹200 ×{' '}
                <input
                  type="number"
                  min={0}
                  value={n200}
                  onChange={(e) => setN200(Number(e.target.value) || 0)}
                  className="w-16 rounded border border-slate-300 bg-white px-2 py-1 font-mono"
                />
              </label>
              <label>
                ₹100 ×{' '}
                <input
                  type="number"
                  min={0}
                  value={n100}
                  onChange={(e) => setN100(Number(e.target.value) || 0)}
                  className="w-16 rounded border border-slate-300 bg-white px-2 py-1 font-mono"
                />
              </label>
              <button
                type="button"
                onClick={applyDenominationTotal}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white"
              >
                Apply Total ({formatINR(n500 * 500 + n200 * 200 + n100 * 100)})
              </button>
            </div>
          </div>
        )}

        {selected.cheques.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-600">Cheques Received</div>
            <div className="mt-2 flex flex-wrap gap-3">
              {selected.cheques.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
                >
                  <input type="checkbox" checked={c.checked} onChange={() => toggleCheque(c.id)} />
                  <span className="font-mono font-semibold">{c.chequeNo}</span>
                  <span>{formatINR(c.amount)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            disabled={!evaluation.canVerify}
            onClick={verifyHandover}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
              evaluation.canVerify
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'cursor-not-allowed bg-slate-200 text-slate-500'
            }`}
          >
            Verify Cash Handover
          </button>
        </div>
      </div>

      {/* History List */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-800">
          Handover History
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50/50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3 text-right">Expected</th>
              <th className="px-4 py-3 text-right">Counted</th>
              <th className="px-4 py-3 text-right">Variance</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {handovers.map((h) => (
              <tr key={h.id}>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {h.staffName} <span className="text-xs font-normal text-slate-500">({h.staffRole})</span>
                </td>
                <td className="px-4 py-3 text-right font-mono">{formatINR(h.expectedCash)}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {h.countedCash === null ? '—' : formatINR(h.countedCash)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-rose-700">{formatINR(h.variance)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[h.status]}`}>
                    {h.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {h.status === 'DISPUTED' && (
                    <button
                      type="button"
                      onClick={() => resolveDispute(h.id)}
                      className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                    >
                      Owner Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

