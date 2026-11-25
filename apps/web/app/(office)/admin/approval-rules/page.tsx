'use client';

import React, { useEffect, useState } from 'react';
import { formatINR, validateApprovalRuleConfig, type ApprovalPolicyConfig } from '@neo/shared';

export default function AdminApprovalRulesPage() {
  const [policies, setPolicies] = useState<ApprovalPolicyConfig[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/proxy/admin/approval-policies')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setPolicies(
          list.map((p: any) => ({
            id: p.id ?? p.exception_type,
            exceptionType: p.exception_type ?? p.exceptionType ?? 'POLICY',
            requireApprover: p.require_approver ?? p.requireApprover ?? true,
            delegateUser: p.delegate_role ?? p.delegateUser ?? 'OPS_COORD',
            delegateCapInr: Number(p.delegate_cap_inr ?? p.delegateCapInr ?? 0),
            primaryApproverRole: p.primary_approver_role ?? p.primaryApproverRole ?? 'OWNER',
            escalationWaitMinutes: Number(p.escalation_wait_minutes ?? p.escalationWaitMinutes ?? 30),
            active: p.is_active ?? p.active ?? true,
          })),
        );
      })
      .catch(() => setPolicies([]));
  }, []);

  async function toggleRequireApprover(policy: ApprovalPolicyConfig, nextRequire: boolean) {
    const candidate = { ...policy, requireApprover: nextRequire };
    const check = validateApprovalRuleConfig(candidate);
    if (!check.valid) {
      setErrorMsg(check.error ?? 'Invalid approval rule.');
      return;
    }
    setErrorMsg(null);
    setPolicies((prev) => prev.map((p) => (p.id === policy.id ? candidate : p)));
    await fetch('/api/proxy/admin/approval-policies', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidate),
    }).catch(() => {});
    setToast(`Updated ${policy.exceptionType} policy.`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Approval &amp; Escalation Rules (OD-019)</h1>
        <p className="text-sm text-ink-3">
          Configure delegate caps and escalation timers. Silent auto-approval without an approver is blocked.
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-[3px] border border-madder/30 bg-madder-soft px-4 py-2.5 text-sm font-semibold text-madder">
          ✕ {errorMsg}
        </div>
      )}
      {toast && (
        <div className="rounded-[3px] border border-leaf/30 bg-leaf-soft px-4 py-2.5 text-sm font-medium text-leaf">
          {toast}
        </div>
      )}

      <div className="space-y-4">
        {policies.length === 0 && (
          <div className="rounded-[3px] border border-rule bg-sheet p-6 text-sm text-ink-3">
            No approval policies configured.
          </div>
        )}
        {policies.map((p) => (
          <div key={p.id} className="rounded-[3px] border border-rule bg-sheet p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold text-ink">{p.exceptionType}</span>
              <span className="rounded-full bg-leaf-soft px-2.5 py-0.5 text-xs font-semibold text-leaf">
                {p.active ? 'Active' : 'Paused'}
              </span>
            </div>
            <div className="rounded-lg bg-paper border border-rule px-4 py-2.5 text-xs text-ink-2">
              Flow: <strong>Request</strong> → Delegate <strong>{p.delegateUser}</strong> (up to{' '}
              {formatINR(p.delegateCapInr)}) → <strong>{p.primaryApproverRole}</strong> after{' '}
              <strong>{p.escalationWaitMinutes} min</strong>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-3">Require explicit approver (no silent auto-approval):</span>
              <button
                type="button"
                onClick={() => toggleRequireApprover(p, !p.requireApprover)}
                className="rounded-lg border border-rule-strong bg-paper px-3 py-1 font-semibold text-ink hover:bg-sunken"
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

