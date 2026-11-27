'use client';

import React, { useEffect, useState } from 'react';
import { formatINR } from '@neo/shared';
import { SettingsPageHeader } from '../../../../src/components/settings/SettingsPageHeader';
import { APPROVAL_EVENT_COPY, getRoleLabel } from '../../../../src/lib/settings-copy';

interface EditableApprovalPolicy {
  id: string;
  exceptionType: string;
  canDelegate: boolean;
  delegateUserName: string;
  delegateCapInr: number;
  escalationWaitMinutes: number;
  secondEscalationUserName: string;
  dirty?: boolean;
}

export default function AdminApprovalRulesPage() {
  const [policies, setPolicies] = useState<EditableApprovalPolicy[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; tone: 'success' | 'error' } | null>(
    null,
  );

  useEffect(() => {
    fetch('/api/proxy/admin/approval-policies')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setPolicies(
          list.map((p: any) => ({
            id: String(p.id ?? p.exception_type),
            exceptionType: String(p.exception_type ?? p.exceptionType ?? 'POLICY'),
            canDelegate: Boolean(p.can_delegate ?? p.canDelegate ?? false),
            delegateUserName: String(
              p.delegate_user_name || getRoleLabel('OPS_COORD'),
            ),
            delegateCapInr: Number(
              p.delegate_value_cap_inr ?? p.delegate_cap_inr ?? p.delegateCapInr ?? 0,
            ),
            escalationWaitMinutes: Number(
              p.escalation_wait_minutes ?? p.escalationWaitMinutes ?? 60,
            ),
            secondEscalationUserName: String(
              p.second_escalation_user_name || 'Business Owner',
            ),
          })),
        );
      })
      .catch(() => setPolicies([]));
  }, []);

  async function savePolicy(policy: EditableApprovalPolicy) {
    setSavingId(policy.id);
    setStatusMsg(null);
    try {
      const res = await fetch(
        `/api/proxy/admin/approval-policies/${encodeURIComponent(policy.exceptionType)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canDelegate: policy.canDelegate,
            delegateValueCapInr: Math.max(0, Number(policy.delegateCapInr) || 0),
            escalationWaitMinutes: Math.max(5, Number(policy.escalationWaitMinutes) || 30),
          }),
        },
      );
      if (!res.ok) {
        setStatusMsg({ text: 'Could not save approval rule. Please try again.', tone: 'error' });
        return;
      }
      setPolicies((prev) =>
        prev.map((p) => (p.id === policy.id ? { ...p, dirty: false } : p)),
      );
      const copy = APPROVAL_EVENT_COPY[policy.exceptionType];
      setStatusMsg({
        text: `Saved approval rule for "${copy?.title || policy.exceptionType}".`,
        tone: 'success',
      });
    } catch {
      setStatusMsg({ text: 'Network error while saving approval rule.', tone: 'error' });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Approval & Escalation Rules"
        subtitle="Decide when your manager can approve special requests up to a rupee limit, and when requests escalate to the Business Owner."
        whatIsThis="Whenever an unusual event happens (like selling below today’s floor price or a cash mismatch), NeoBus holds the action and asks for sign-off. You can allow an assistant/delegate to approve smaller amounts, while larger amounts or unanswered requests always come to the Owner. Silent auto-approval is always turned off for your safety."
      />

      {statusMsg && (
        <div
          className={`rounded-[3px] border px-4 py-2.5 text-sm font-medium ${
            statusMsg.tone === 'error'
              ? 'border-madder/30 bg-madder-soft text-madder'
              : 'border-leaf/30 bg-leaf-soft text-leaf'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      <div className="space-y-4">
        {policies.length === 0 ? (
          <div className="rounded-[4px] border border-rule bg-sheet p-6 text-sm text-ink-3">
            No approval rules loaded yet.
          </div>
        ) : (
          policies.map((p) => {
            const copy = APPROVAL_EVENT_COPY[p.exceptionType] ?? {
              title: p.exceptionType.replace(/_/g, ' '),
              when: 'Triggers when a special exception occurs during daily operations.',
              example: '',
            };
            return (
              <div
                key={p.id}
                className="rounded-[4px] border border-rule bg-sheet p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-ink">{copy.title}</h2>
                    <p className="text-xs text-ink-2 mt-0.5">{copy.when}</p>
                    {copy.example && <p className="text-xs text-ink-3 mt-0.5">{copy.example}</p>}
                  </div>
                  <span className="rounded-full bg-leaf-soft px-2.5 py-0.5 text-xs font-semibold text-leaf shrink-0">
                    Human Approval Required
                  </span>
                </div>

                {/* Plain summary flow */}
                <div className="rounded-[3px] bg-paper border border-rule px-4 py-2.5 text-xs text-ink-2">
                  <strong>How it works: </strong>
                  {p.canDelegate ? (
                    <>
                      Up to <strong>{formatINR(p.delegateCapInr)}</strong> can be approved by{' '}
                      <strong>{p.delegateUserName}</strong>; anything higher or unanswered after{' '}
                      <strong>{p.escalationWaitMinutes} minutes</strong> goes to{' '}
                      <strong>{p.secondEscalationUserName}</strong>.
                    </>
                  ) : (
                    <>
                      Always goes straight to <strong>{p.secondEscalationUserName}</strong> (Owner
                      only). Escalation reminder after{' '}
                      <strong>{p.escalationWaitMinutes} minutes</strong>.
                    </>
                  )}
                </div>

                {/* Editable controls */}
                <div className="flex flex-wrap items-end gap-4 text-xs">
                  <label className="flex items-center gap-2 pb-1.5 text-ink">
                    <input
                      type="checkbox"
                      checked={p.canDelegate}
                      onChange={(e) =>
                        setPolicies((prev) =>
                          prev.map((item) =>
                            item.id === p.id
                              ? { ...item, canDelegate: e.target.checked, dirty: true }
                              : item,
                          ),
                        )
                      }
                    />
                    <span>Allow assistant/delegate approval up to a limit</span>
                  </label>

                  {p.canDelegate && (
                    <div>
                      <label className="block font-semibold text-ink-2 mb-1">
                        Assistant Approval Limit (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={p.delegateCapInr}
                        onChange={(e) =>
                          setPolicies((prev) =>
                            prev.map((item) =>
                              item.id === p.id
                                ? {
                                    ...item,
                                    delegateCapInr: Number(e.target.value),
                                    dirty: true,
                                  }
                                : item,
                            ),
                          )
                        }
                        className="w-32 rounded-[3px] border border-rule-strong bg-paper px-2.5 py-1.5 font-mono text-sm text-ink"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block font-semibold text-ink-2 mb-1">
                      Escalate to Owner After (Minutes)
                    </label>
                    <input
                      type="number"
                      min={5}
                      step={5}
                      value={p.escalationWaitMinutes}
                      onChange={(e) =>
                        setPolicies((prev) =>
                          prev.map((item) =>
                            item.id === p.id
                              ? {
                                  ...item,
                                  escalationWaitMinutes: Number(e.target.value),
                                  dirty: true,
                                }
                              : item,
                          ),
                        )
                      }
                      className="w-28 rounded-[3px] border border-rule-strong bg-paper px-2.5 py-1.5 font-mono text-sm text-ink"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={savingId === p.id || !p.dirty}
                    onClick={() => void savePolicy(p)}
                    className="rounded-[3px] bg-action px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-action-hover disabled:opacity-45 ml-auto"
                  >
                    {savingId === p.id ? 'Saving...' : 'Save Rule'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
