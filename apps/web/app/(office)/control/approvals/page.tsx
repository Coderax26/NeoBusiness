'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  formatINR,
  requiresStepUpAuth,
  resolveExceptionWithConcurrency,
  type ExceptionItem,
  type ExceptionType,
} from '@neo/shared';
import { INITIAL_EXCEPTIONS } from '../../../../src/lib/control-tower-data';

export default function ControlApprovalsPage() {
  const [exceptions, setExceptions] = useState<ExceptionItem[]>(INITIAL_EXCEPTIONS);
  const [tab, setTab] = useState<'PENDING' | 'HISTORY'>('PENDING');
  const [typeFilter, setTypeFilter] = useState<'ALL' | ExceptionType>('ALL');
  const [focusedIdx, setFocusedIdx] = useState<number>(0);
  const [counterDraft, setCounterDraft] = useState<Record<string, string>>({ 'exc-1': '89.50' });
  const [remarksDraft, setRemarksDraft] = useState<Record<string, string>>({});
  const [stepUpTarget, setStepUpTarget] = useState<{ exc: ExceptionItem; action: 'APPROVE' | 'COUNTER' } | null>(null);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const visibleList = useMemo(() => {
    return exceptions.filter((e) => {
      const tabMatch = tab === 'PENDING' ? e.status === 'PENDING' : e.status !== 'PENDING';
      const typeMatch = typeFilter === 'ALL' ? true : e.type === typeFilter;
      return tabMatch && typeMatch;
    });
  }, [exceptions, tab, typeFilter]);

  function attemptResolve(exc: ExceptionItem, action: 'APPROVE' | 'COUNTER' | 'REJECT', pwd?: string) {
    const res = resolveExceptionWithConcurrency({
      exceptions,
      exceptionId: exc.id,
      action,
      actorName: 'Owner',
      remarks: remarksDraft[exc.id],
      counterValueInr: action === 'COUNTER' ? Number(counterDraft[exc.id]) || undefined : undefined,
      stepUpPassword: pwd,
    });

    if (res.alreadyResolved) {
      setToast(res.friendlyMessage);
      return;
    }
    if (res.stepUpRequired) {
      setStepUpTarget({ exc, action: action === 'COUNTER' ? 'COUNTER' : 'APPROVE' });
      return;
    }

    setExceptions(res.exceptions);
    setStepUpTarget(null);
    setStepUpPassword('');
    setToast(
      res.originOrderUnlocked
        ? `${res.friendlyMessage} Originating order ${exc.originOrderNo} unlocked!`
        : res.friendlyMessage,
    );
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (tab !== 'PENDING' || visibleList.length === 0) return;
      const active = visibleList[focusedIdx] ?? visibleList[0];
      const key = e.key.toLowerCase();
      if (key === 'j') setFocusedIdx((i) => Math.min(visibleList.length - 1, i + 1));
      if (key === 'k') setFocusedIdx((i) => Math.max(0, i - 1));
      if (key === 'a' && active) attemptResolve(active, 'APPROVE');
      if (key === 'r' && active) attemptResolve(active, 'REJECT');
      if (key === 'c' && active && active.type === 'PRICE_OVERRIDE') attemptResolve(active, 'COUNTER');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Approvals Centre</h1>
          <p className="text-sm text-slate-500">
            Keyboard shortcuts: <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">J/K</kbd> navigate,{' '}
            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">A</kbd> approve,{' '}
            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">C</kbd> counter,{' '}
            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">R</kbd> reject. Step-up auth required ≥ ₹5,000.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('PENDING')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
              tab === 'PENDING' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
            }`}
          >
            Pending ({exceptions.filter((e) => e.status === 'PENDING').length})
          </button>
          <button
            type="button"
            onClick={() => setTab('HISTORY')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
              tab === 'HISTORY' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
            }`}
          >
            History ({exceptions.filter((e) => e.status !== 'PENDING').length})
          </button>
        </div>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
          {toast}
        </div>
      )}

      {/* Type filter */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            'ALL',
            'PRICE_OVERRIDE',
            'CREDIT_BREACH',
            'CASH_HANDOVER_VARIANCE',
            'SUPPLIER_PRICE_SPIKE',
            'YIELD_VARIANCE',
          ] as const
        ).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTypeFilter(t);
              setFocusedIdx(0);
            }}
            className={`rounded-lg px-3 py-1 text-xs font-semibold ${
              typeFilter === t ? 'bg-teal-600 text-white' : 'border border-slate-200 bg-white text-slate-700'
            }`}
          >
            {t.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {visibleList.map((exc, idx) => {
          const isFocused = tab === 'PENDING' && idx === focusedIdx;
          const stepUp = requiresStepUpAuth(exc.amountInr);
          return (
            <div
              key={exc.id}
              onClick={() => setFocusedIdx(idx)}
              className={`rounded-2xl border bg-white p-5 transition ${
                isFocused ? 'border-teal-600 ring-2 ring-teal-100' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-amber-100 px-2 py-0.5 font-bold text-amber-900">
                    {exc.type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-slate-500">{exc.siteName}</span>
                  {stepUp && (
                    <span className="rounded bg-purple-100 px-2 py-0.5 font-semibold text-purple-800">
                      🔒 Step-up Auth
                    </span>
                  )}
                </div>
                <div className="text-slate-500">
                  Waiting {exc.waitingMinutes} min · Escalates in {exc.escalatesInMinutes} min
                  {exc.delegatedTo && ` · Delegated to ${exc.delegatedTo}`}
                </div>
              </div>

              <h2 className="mt-2 text-base font-bold text-slate-900">{exc.title}</h2>

              <div className="mt-3 flex flex-wrap gap-3">
                {Object.entries(exc.facts).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                    <span className="text-slate-500">{k}: </span>
                    <span className="font-semibold text-slate-900">{v}</span>
                  </div>
                ))}
              </div>

              {exc.status === 'PENDING' ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => attemptResolve(exc, 'APPROVE')}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    ✓ Approve ({formatINR(exc.amountInr)})
                  </button>
                  {exc.type === 'PRICE_OVERRIDE' && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.5"
                        value={counterDraft[exc.id] ?? '89.50'}
                        onChange={(e) => setCounterDraft((p) => ({ ...p, [exc.id]: e.target.value }))}
                        className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => attemptResolve(exc, 'COUNTER')}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900"
                      >
                        ↔ Counter
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => attemptResolve(exc, 'REJECT')}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                  >
                    ✕ Reject
                  </button>
                  <input
                    type="text"
                    value={remarksDraft[exc.id] ?? ''}
                    onChange={(e) => setRemarksDraft((p) => ({ ...p, [exc.id]: e.target.value }))}
                    placeholder="Optional remarks..."
                    className="ml-auto w-full sm:w-56 rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                  />
                </div>
              ) : (
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  Resolved as <strong>{exc.status}</strong> by {exc.resolvedBy} at {exc.resolvedAt}
                  {exc.remarks && ` — "${exc.remarks}"`}
                  {exc.originOrderUnlocked && ` · Order ${exc.originOrderNo} unlocked`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Step-up Auth Modal */}
      {stepUpTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              attemptResolve(stepUpTarget.exc, stepUpTarget.action, stepUpPassword);
            }}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 className="text-lg font-bold text-slate-900">Owner Step-Up Verification (OD-002)</h3>
            <p className="mt-1 text-xs text-slate-500">
              High-value exception ({formatINR(stepUpTarget.exc.amountInr)} ≥ ₹5,000) requires Owner password.
            </p>
            <input
              type="password"
              value={stepUpPassword}
              onChange={(e) => setStepUpPassword(e.target.value)}
              placeholder="Enter Owner password"
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              required
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStepUpTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                Confirm &amp; Resolve
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

