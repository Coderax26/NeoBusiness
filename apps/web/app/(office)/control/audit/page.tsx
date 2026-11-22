'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { searchAuditTrail, toCsvExport, type AuditLogEntry } from '@neo/shared';

export default function ControlAuditTrailPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');

  useEffect(() => {
    fetch('/api/proxy/audit-logs')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setLogs(
          list.map((a: any) => ({
            id: a.id,
            timestampIst: a.created_at ? new Date(a.created_at).toLocaleString('en-IN') : '-',
            actorName: a.user_name ?? a.actorName ?? 'System',
            actorRole: a.actor_role ?? a.actorRole ?? 'USER',
            module: a.entity_type ?? a.module ?? 'System',
            entityType: a.entity_type ?? a.module ?? 'System',
            action: a.action ?? 'UPDATE',
            entityNo: a.entity_id ?? a.entityNo ?? '-',
            summary: a.summary ?? `${a.action ?? 'ACTION'} ${a.entity_type ?? ''}`,
            ipAddress: a.ip_address ?? a.ipAddress ?? '-',
            beforeJson: a.old_value_json ?? a.beforeJson,
            afterJson: a.new_value_json ?? a.afterJson,
          })),
        );
      })
      .catch(() => setLogs([]));
  }, []);

  const filtered = useMemo(
    () => searchAuditTrail(logs, { query, module: moduleFilter, action: actionFilter }),
    [logs, query, moduleFilter, actionFilter],
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
          <h1 className="text-2xl font-bold text-zinc-100">Immutable Audit Trail</h1>
          <p className="text-sm text-zinc-400">
            Searchable record of every create, update, approval, and reversal with before → after diffs.
          </p>
        </div>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvData)}`}
          download="audit-trail.csv"
          className="rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-700"
        >
          Export for Auditors (CSV)
        </a>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by doc #, user, or summary..."
          className="w-full sm:w-80 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        >
          <option value="ALL">All Modules</option>
          <option value="Sales">Sales</option>
          <option value="Control">Control</option>
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        >
          <option value="ALL">All Actions</option>
          <option value="UPDATE">UPDATE</option>
          <option value="APPROVE">APPROVE</option>
        </select>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
            No audit log entries match the current filter.
          </div>
        )}
        {filtered.map((entry) => (
          <div key={entry.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
              <span>
                <strong className="text-zinc-200">{entry.timestampIst}</strong> · {entry.module} ·{' '}
                <span className="font-mono font-bold text-purple-300">{entry.entityNo}</span>
              </span>
              <span className="font-mono">IP {entry.ipAddress}</span>
            </div>
            <div className="text-sm font-semibold text-zinc-100">{entry.summary}</div>
            {(entry.beforeJson || entry.afterJson) && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs font-mono">
                <div className="rounded bg-rose-950/30 border border-rose-500/30 p-2 text-rose-300">
                  Before: {JSON.stringify(entry.beforeJson ?? {})}
                </div>
                <div className="rounded bg-emerald-950/30 border border-emerald-500/30 p-2 text-emerald-300">
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

