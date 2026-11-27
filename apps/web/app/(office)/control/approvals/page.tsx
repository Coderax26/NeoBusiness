'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  formatINR,
  requiresStepUpAuth,
  resolveExceptionWithConcurrency,
  type ExceptionItem,
  type ExceptionType,
} from '@neo/shared';

function extractFacts(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== 'object') return {};
  const obj = payload as Record<string, unknown>;
  const result: Record<string, string> = {};

  if (typeof obj.summary === 'string' && obj.summary.trim()) {
    result.Summary = obj.summary.trim();
  }
  if (typeof obj.impact === 'string' && obj.impact.trim()) {
    result.Impact = obj.impact.trim();
  }
  if (Array.isArray(obj.facts)) {
    for (const item of obj.facts) {
      if (item && typeof item === 'object') {
        const entry = item as Record<string, unknown>;
        const label = String(entry.label ?? '').trim();
        const value = entry.value !== undefined && entry.value !== null ? String(entry.value) : '';
        if (label && value) {
          result[label] = value;
        }
      }
    }
    return result;
  }

  for (const [k, v] of Object.entries(obj)) {
    if (['title', 'summary', 'impact', 'actions', 'facts'].includes(k)) continue;
    if (v === null || v === undefined) continue;
    result[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return result;
}

export default function ControlApprovalsPage() {
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [tab, setTab] = useState<'PENDING' | 'HISTORY'>('PENDING');
  const [typeFilter, setTypeFilter] = useState<'ALL' | ExceptionType>('ALL');
  const [focusedIdx, setFocusedIdx] = useState<number>(0);
  const [counterDraft, setCounterDraft] = useState<Record<string, string>>({});
  const [remarksDraft, setRemarksDraft] = useState<Record<string, string>>({});
  const [stepUpTarget, setStepUpTarget] = useState<{ exc: ExceptionItem; action: 'APPROVE' | 'COUNTER' } | null>(null);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/proxy/exceptions')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setExceptions(
          list.map((e: any) => {
            const payload =
              typeof e.context_payload_json === 'string'
                ? (() => {
                    try {
                      return JSON.parse(e.context_payload_json);
                    } catch {
                      return {};
                    }
                  })()
                : (e.context_payload_json ?? e.payload_json ?? {});
            return {
              id: e.id,
              type: (e.exception_type ?? e.type ?? 'PRICE_OVERRIDE') as ExceptionType,
              status: e.status ?? 'PENDING',
              title:
                payload?.title ??
                e.title ??
                e.reason ??
                `${e.exception_type ?? 'Exception'} (${e.reference_id ?? e.entity_id ?? ''})`,
              siteId: e.site_id ?? 'all',
              siteName: e.site_name ?? 'Site',
              amountInr: Number(e.value_at_risk ?? e.amount_inr ?? e.amount ?? 0),
              waitingMinutes: Number(e.waiting_minutes ?? 0),
              escalatesInMinutes: Number(e.escalates_in_minutes ?? 30),
              delegatedTo: e.delegated_to,
              originOrderNo: e.reference_id ?? e.entity_no ?? e.originOrderNo ?? '',
              facts: extractFacts(payload),
              resolvedBy: e.resolved_by,
              resolvedAt: e.resolved_at,
              remarks: e.owner_remarks ?? e.remarks,
            };
          }),
        );
      })
      .catch(() => setExceptions([]));
  }, []);

  const visibleList = useMemo(() => {
    return exceptions.filter((e) => {
      const tabMatch = tab === 'PENDING' ? e.status === 'PENDING' : e.status !== 'PENDING';
      const typeMatch = typeFilter === 'ALL' ? true : e.type === typeFilter;
      return tabMatch && typeMatch;
    });
  }, [exceptions, tab, typeFilter]);

  async function attemptResolve(exc: ExceptionItem, action: 'APPROVE' | 'COUNTER' | 'REJECT', pwd?: string) {
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

    const counterValue =
      action === 'COUNTER' ? Number(counterDraft[exc.id]) || undefined : undefined;
    const mappedAction =
      action === 'APPROVE'
        ? 'APPROVED'
        : action === 'REJECT'
          ? 'REJECTED'
          : 'COUNTERED';
    const defaultRemarks =
      action === 'APPROVE'
        ? 'Approved via Control Tower'
        : action === 'REJECT'
          ? 'Rejected via Control Tower'
          : 'Counter-offer proposed';

    try {
      const apiRes = await fetch(`/api/proxy/exceptions/${encodeURIComponent(exc.id)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: mappedAction,
          remarks: remarksDraft[exc.id]?.trim() || defaultRemarks,
          ...(counterValue !== undefined
            ? { counter: { price: counterValue, amount: counterValue } }
            : {}),
        }),
      });
      if (!apiRes.ok) {
        const errBody = await apiRes.json().catch(() => null);
        throw new Error(
          errBody?.message || errBody?.error?.message || `HTTP ${apiRes.status}`,
        );
      }

      setExceptions(res.exceptions);
      setStepUpTarget(null);
      setStepUpPassword('');
      setToast(
        res.originOrderUnlocked
          ? `${res.friendlyMessage} Originating order ${exc.originOrderNo} unlocked!`
          : res.friendlyMessage,
      );
    } catch (err) {
      setToast(`Failed to resolve exception: ${(err as Error).message}`);
    }
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
  }, [tab, visibleList, focusedIdx, remarksDraft, counterDraft]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Approvals Centre</h1>
          <p className="text-sm text-ink-3">
            Keyboard shortcuts: <kbd className="rounded bg-sunken px-1.5 py-0.5 text-xs text-ink">J/K</kbd> navigate,{' '}
            <kbd className="rounded bg-sunken px-1.5 py-0.5 text-xs text-ink">A</kbd> approve,{' '}
            <kbd className="rounded bg-sunken px-1.5 py-0.5 text-xs text-ink">C</kbd> counter,{' '}
            <kbd className="rounded bg-sunken px-1.5 py-0.5 text-xs text-ink">R</kbd> reject. Step-up auth required ≥ ₹5,000.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('PENDING')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
              tab === 'PENDING' ? 'bg-zinc-100 text-zinc-950' : 'border border-rule-strong bg-sheet text-ink-2'
            }`}
          >
            Pending ({exceptions.filter((e) => e.status === 'PENDING').length})
          </button>
          <button
            type="button"
            onClick={() => setTab('HISTORY')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
              tab === 'HISTORY' ? 'bg-zinc-100 text-zinc-950' : 'border border-rule-strong bg-sheet text-ink-2'
            }`}
          >
            History ({exceptions.filter((e) => e.status !== 'PENDING').length})
          </button>
        </div>
      </div>

      {toast && (
        <div className="rounded-[3px] border border-leaf/30 bg-leaf-soft px-4 py-2.5 text-sm font-medium text-leaf">
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
              typeFilter === t ? 'bg-action text-white' : 'border border-rule-strong bg-sheet text-ink-2'
            }`}
          >
            {t.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {visibleList.length === 0 && (
          <div className="rounded-[4px] border border-rule bg-sheet p-8 text-center text-sm text-ink-3">
            No {tab.toLowerCase()} exceptions found.
          </div>
        )}
        {visibleList.map((exc, idx) => {
          const isFocused = tab === 'PENDING' && idx === focusedIdx;
          const stepUp = requiresStepUpAuth(exc.amountInr);
          return (
            <div
              key={exc.id}
              onClick={() => setFocusedIdx(idx)}
              className={`rounded-[4px] border bg-sheet p-5 transition ${
                isFocused ? 'border-action/30 ring-1 ring-teal-500/40' : 'border-rule'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-haldi-soft px-2 py-0.5 font-bold text-haldi">
                    {exc.type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-ink-3">{exc.siteName}</span>
                  {stepUp && (
                    <span className="rounded bg-purple-500/20 px-2 py-0.5 font-semibold text-purple-300">
                      🔒 Step-up Auth
                    </span>
                  )}
                </div>
                <div className="text-ink-3">
                  Waiting {exc.waitingMinutes} min · Escalates in {exc.escalatesInMinutes} min
                  {exc.delegatedTo && ` · Delegated to ${exc.delegatedTo}`}
                </div>
              </div>

              <h2 className="mt-2 text-base font-bold text-ink">{exc.title}</h2>

              <div className="mt-3 flex flex-wrap gap-3">
                {Object.entries(exc.facts).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-rule bg-paper px-3 py-1.5 text-xs">
                    <span className="text-ink-3">{k}: </span>
                    <span className="font-semibold text-ink">{String(v)}</span>
                  </div>
                ))}
              </div>

              {exc.status === 'PENDING' ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-4">
                  <button
                    type="button"
                    onClick={() => attemptResolve(exc, 'APPROVE')}
                    className="rounded-lg bg-leaf px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
                  >
                    ✓ Approve ({formatINR(exc.amountInr)})
                  </button>
                  {exc.type === 'PRICE_OVERRIDE' && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.5"
                        value={counterDraft[exc.id] ?? ''}
                        onChange={(e) => setCounterDraft((p) => ({ ...p, [exc.id]: e.target.value }))}
                        placeholder="Counter ₹"
                        className="w-24 rounded-lg border border-rule-strong bg-paper px-2 py-1.5 font-mono text-xs text-ink"
                      />
                      <button
                        type="button"
                        onClick={() => attemptResolve(exc, 'COUNTER')}
                        className="rounded-lg border border-haldi/30 bg-haldi-soft px-3 py-1.5 text-xs font-semibold text-haldi"
                      >
                        ↔ Counter
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => attemptResolve(exc, 'REJECT')}
                    className="rounded-lg bg-madder px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
                  >
                    ✕ Reject
                  </button>
                  <input
                    type="text"
                    value={remarksDraft[exc.id] ?? ''}
                    onChange={(e) => setRemarksDraft((p) => ({ ...p, [exc.id]: e.target.value }))}
                    placeholder="Optional remarks..."
                    className="ml-auto w-full sm:w-56 rounded-lg border border-rule-strong bg-paper px-3 py-1.5 text-xs text-ink"
                  />
                </div>
              ) : (
                <div className="mt-3 rounded-lg bg-paper border border-rule px-3 py-2 text-xs text-ink-2">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              attemptResolve(stepUpTarget.exc, stepUpTarget.action, stepUpPassword);
            }}
            className="w-full max-w-md rounded-[4px] border border-rule bg-sheet p-6 shadow-xl"
          >
            <h3 className="text-lg font-bold text-ink">Owner Step-Up Verification (OD-002)</h3>
            <p className="mt-1 text-xs text-ink-3">
              High-value exception ({formatINR(stepUpTarget.exc.amountInr)} ≥ ₹5,000) requires Owner password.
            </p>
            <input
              type="password"
              value={stepUpPassword}
              onChange={(e) => setStepUpPassword(e.target.value)}
              placeholder="Enter Owner password"
              className="mt-4 w-full rounded-lg border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
              required
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStepUpTarget(null)}
                className="rounded-lg border border-rule-strong px-4 py-2 text-sm font-semibold text-ink-2"
              >
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-leaf px-4 py-2 text-sm font-semibold text-white">
                Confirm &amp; Resolve
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

