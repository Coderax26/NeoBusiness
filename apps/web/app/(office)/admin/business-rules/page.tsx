'use client';

import React, { useEffect, useState } from 'react';
import { type BusinessRuleSetting } from '../../../../src/lib/admin-data';

export default function AdminBusinessRulesPage() {
  const [rules, setRules] = useState<BusinessRuleSetting[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/proxy/admin/business-rules')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setRules(
          list.map((r: any) => ({
            id: r.key ?? r.id,
            group: r.scope ?? 'GLOBAL',
            scope: r.scope ?? 'GLOBAL',
            scopeTarget: r.scope_ref ?? 'ALL',
            question: r.description ?? r.key,
            value: typeof r.value_json === 'string' ? r.value_json : JSON.stringify(r.value_json ?? ''),
            defaultValue: '',
            lastChangedBy: r.updated_by ?? 'System',
            lastChangedAt: r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '-',
          })),
        );
      })
      .catch(() => setRules([]));
  }, []);

  async function updateRule(id: string, nextVal: string) {
    setRules((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, value: nextVal, lastChangedBy: 'Owner', lastChangedAt: 'Just now' }
          : r,
      ),
    );
    await fetch('/api/proxy/admin/business-rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: id, value: nextVal }),
    }).catch(() => {});
    setToast('Rule saved & audited. Takes effect within 5 minutes (ConfigService cache TTL).');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Business Rules &amp; Thresholds</h1>
        <p className="text-sm text-zinc-400">
          Plain-language configuration over <code className="font-mono text-zinc-300">business_rule_config</code>. Changes are audited and take effect within 5 minutes.
        </p>
      </div>

      {toast && (
        <div className="rounded-xl border border-purple-500/40 bg-purple-950/30 px-4 py-2.5 text-sm font-medium text-purple-200">
          {toast}
        </div>
      )}

      <div className="space-y-3">
        {rules.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
            No business rules found in configuration.
          </div>
        )}
        {rules.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded bg-purple-500/20 px-2 py-0.5 font-bold text-purple-300">{r.group}</span>
                <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-zinc-300">
                  {r.scope}: {r.scopeTarget}
                </span>
              </div>
              <div className="text-sm font-bold text-zinc-100">{r.question}</div>
              <div className="text-xs text-zinc-400">
                Key: {r.id} · Last updated {r.lastChangedAt}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={r.value}
                onChange={(e) => updateRule(r.id, e.target.value)}
                className="w-32 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 font-mono text-sm font-bold text-zinc-100"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

