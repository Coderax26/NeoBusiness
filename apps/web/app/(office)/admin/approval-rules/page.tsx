'use client';

import React, { useState } from 'react';
import { formatINR, validateApprovalRuleConfig, type ApprovalPolicyConfig } from '@neo/shared';
import { INITIAL_APPROVAL_POLICIES } from '../../../../src/lib/admin-data';

export default function AdminApprovalRulesPage() {
  const [policies, setPolicies] = useState<ApprovalPolicyConfig[]>(INITIAL_APPROVAL_POLICIES);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function toggleRequireApprover(policy: ApprovalPolicyConfig, nextRequire: boolean) {
    const candidate = { ...policy, requireApprover: nextRequire };
    const check = validateApprovalRuleConfig(candidate);
    if (!check.valid) {
      setErrorMsg(check.error ?? 'Invalid approval rule.');
      return;
    }
    setErrorMsg(null);
    setPolicies((prev) => prev.map((p) => (p.id === policy.id ? candidate : p)));
    setToast(`Updated ${policy.exceptionType} policy.`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Approval &amp; Escalation Rules (OD-019)</h1>
        <p className="text-sm text-slate-500">
          Configure delegate caps and escalation timers. Silent auto-approval without an approver is blocked.
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800">
          ✕ {errorMsg}
        </div>
      )}
      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
          {toast}
        </div>
      )}

      <div className="space-y-4">
        {policies.map((p) => (
          <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold text-slate-900">{p.exceptionType}</span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                {p.active ? 'Active' : 'Paused'}
              </span>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-2.5 text-xs text-slate-700">
              Flow: <strong>Request</strong> → Delegate <strong>{p.delegateUser}</strong> (up to{' '}
              {formatINR(p.delegateCapInr)}) → <strong>{p.primaryApproverRole}</strong> after{' '}
              <strong>{p.escalationWaitMinutes} min</strong>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Require explicit approver (no silent auto-approval):</span>
              <button
                type="button"
                onClick={() => toggleRequireApprover(p, !p.requireApprover)}
                className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
              >
                {p.requireApprover ? 'Enforced (Click to Test Guard)' : 'Off'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

