'use client';

import React, { useMemo, useState } from 'react';
import { searchAuditTrail, toCsvExport } from '@neo/shared';
import { INITIAL_AUDIT_LOGS } from '../../../../src/lib/admin-data';

export default function ControlAuditTrailPage() {
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');

  const filtered = useMemo(
    () => searchAuditTrail(INITIAL_AUDIT_LOGS, { query, module: moduleFilter, action: actionFilter }),
    [query, moduleFilter, actionFilter],
  );

  const csvData = useMemo(
    () =>
      toCsvExport(
        ['Timestamp', 'Actor', 'Module', 'Action', 'Entity', 'Summary', 'IP'],
        filtered.map((a) => [a.timestampIst, a.actorName, a.module, a.action, a.entityNo, a.summary, a.ipAddress]),
      ),
    [filtered],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Immutable Audit Trail</h1>
          <p className="text-sm text-slate-500">
            Searchable record of every create, update, approval, and reversal with before → after diffs.
          </p>
        </div>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvData)}`}
          download="audit-trail.csv"
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
        >
          Export for Auditors (CSV)
        </a>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by doc # (e.g. SO-2611-0042), user, or summary..."
          className="w-full sm:w-80 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="ALL">All Modules</option>
          <option value="Sales">Sales</option>
          <option value="Control">Control</option>
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="ALL">All Actions</option>
          <option value="UPDATE">UPDATE</option>
          <option value="APPROVE">APPROVE</option>
        </select>
      </div>

      <div className="space-y-3">
        {filtered.map((entry) => (
          <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                <strong className="text-slate-800">{entry.timestampIst}</strong> · {entry.module} ·{' '}
                <span className="font-mono font-bold text-purple-700">{entry.entityNo}</span>
              </span>
              <span className="font-mono">IP {entry.ipAddress}</span>
            </div>
            <div className="text-sm font-semibold text-slate-900">{entry.summary}</div>
            {(entry.beforeJson || entry.afterJson) && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs font-mono">
                <div className="rounded bg-rose-50 p-2 text-rose-800">
                  Before: {JSON.stringify(entry.beforeJson ?? {})}
                </div>
                <div className="rounded bg-emerald-50 p-2 text-emerald-800">
                  After: {JSON.stringify(entry.afterJson ?? {})}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

