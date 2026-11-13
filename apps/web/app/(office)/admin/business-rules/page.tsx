'use client';

import React, { useState } from 'react';
import { INITIAL_BUSINESS_RULES, type BusinessRuleSetting } from '../../../../src/lib/admin-data';

export default function AdminBusinessRulesPage() {
  const [rules, setRules] = useState<BusinessRuleSetting[]>(INITIAL_BUSINESS_RULES);
  const [toast, setToast] = useState<string | null>(null);

  function updateRule(id: string, nextVal: string) {
    setRules((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, value: nextVal, lastChangedBy: 'Owner (Anil Deshmukh)', lastChangedAt: 'Just now' }
          : r,
      ),
    );
    setToast('Rule saved & audited. Takes effect within 5 minutes (ConfigService cache TTL).');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Business Rules &amp; Thresholds</h1>
        <p className="text-sm text-slate-500">
          Plain-language configuration over <code className="font-mono">business_rule_config</code>. Changes are audited and take effect within 5 minutes.
        </p>
      </div>

      {toast && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm font-medium text-purple-900">
          {toast}
        </div>
      )}

      <div className="space-y-3">
        {rules.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded bg-purple-100 px-2 py-0.5 font-bold text-purple-800">{r.group}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-slate-600">
                  {r.scope}: {r.scopeTarget}
                </span>
              </div>
              <div className="text-sm font-bold text-slate-900">{r.question}</div>
              <div className="text-xs text-slate-500">
                Default: {r.defaultValue} · Last changed by {r.lastChangedBy} ({r.lastChangedAt})
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={r.value}
                onChange={(e) => updateRule(r.id, e.target.value)}
                className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm font-bold text-slate-900"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

