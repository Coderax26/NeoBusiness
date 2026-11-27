'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { searchAuditTrail, toCsvExport, type AuditLogEntry } from '@neo/shared';
import { SettingsPageHeader } from '../../../../src/components/settings/SettingsPageHeader';
import {
  AUDIT_ACTION_LABELS,
  formatAuditChanges,
  getRoleLabel,
} from '../../../../src/lib/settings-copy';

const MODULE_LABELS: Record<string, string> = {
  SALES_ORDER: 'Sales Orders',
  Sales: 'Sales Orders',
  CUSTOMER: 'Customers',
  PURCHASE_ORDER: 'Purchasing',
  INVOICE: 'Invoices',
  USER: 'Staff Accounts',
  SITE: 'Sites',
  BUSINESS_RULE: 'Business Rules',
  APPROVAL_POLICY: 'Approval Rules',
  Control: 'Approvals & Control',
  EXCEPTION: 'Approvals',
};

export default function ControlAuditTrailPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  useEffect(() => {
    fetch('/api/proxy/audit-logs')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setLogs(
          list.map((a: any) => {
            const rawTime = a.created_at ?? a.timestamp;
            const rawEntity = a.entity_type ?? a.entity_name ?? a.module ?? 'System';
            const rawAction = String(a.action ?? 'UPDATE').toUpperCase();
            return {
              id: String(a.id),
              timestampIst: rawTime
                ? new Date(rawTime).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '-',
              actorName: String(a.user_name ?? a.actorName ?? 'System'),
              actorRole: String(a.actor_role ?? a.actorRole ?? 'OWNER'),
              module: String(rawEntity),
              entityType: String(rawEntity),
              action: rawAction,
              entityNo: String(a.entity_id ?? a.entityNo ?? '-'),
              summary:
                a.summary ??
                `${a.user_name ?? 'A user'} ${(AUDIT_ACTION_LABELS[rawAction] || rawAction).toLowerCase()} ${(MODULE_LABELS[rawEntity] || rawEntity).toLowerCase()}`,
              ipAddress: String(a.ip_address ?? a.ipAddress ?? '-'),
              beforeJson: a.old_value_json ?? a.beforeJson,
              afterJson: a.new_value_json ?? a.afterJson,
            };
          }),
        );
      })
      .catch(() => setLogs([]));
  }, []);

  const moduleOptions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.module).filter(Boolean))),
    [logs],
  );
  const actionOptions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.action).filter(Boolean))),
    [logs],
  );

  const filtered = useMemo(
    () => searchAuditTrail(logs, { query, module: moduleFilter, action: actionFilter }),
    [logs, query, moduleFilter, actionFilter],
  );

  const csvData = useMemo(
    () =>
      toCsvExport(
        ['Date & Time', 'Changed By', 'Area', 'Action', 'Record', 'Summary'],
        filtered.map((a) => [
          a.timestampIst,
          a.actorName,
          MODULE_LABELS[a.module] || a.module,
          AUDIT_ACTION_LABELS[a.action] || a.action,
          a.entityNo,
          a.summary,
        ]),
      ),
    [filtered],
  );

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Activity & Change History"
        subtitle="See a permanent record of who created, changed, approved, or cancelled records across your business."
        whatIsThis="For business safety and GST audit compliance, NeoBus keeps an uneditable history of important changes — such as credit limit edits, price approvals, and user permissions. Nobody can edit or delete entries from this log."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTechnicalDetails((v) => !v)}
              className="rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-xs font-semibold text-ink-2 hover:text-ink"
            >
              {showTechnicalDetails ? 'Hide Technical IDs' : 'Show Technical IDs'}
            </button>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvData)}`}
              download="activity-history.csv"
              className="rounded-[3px] bg-sunken border border-rule-strong px-4 py-2 text-xs font-semibold text-ink hover:bg-paper"
            >
              Download for Accountant (CSV)
            </a>
          </div>
        }
      />

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by person, customer, order #, or description..."
          className="w-full sm:w-80 rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
        />
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
        >
          <option value="ALL">All Business Areas</option>
          {moduleOptions.map((m) => (
            <option key={m} value={m}>
              {MODULE_LABELS[m] || m.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
        >
          <option value="ALL">All Actions</option>
          {actionOptions.map((act) => (
            <option key={act} value={act}>
              {AUDIT_ACTION_LABELS[act] || act}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-[4px] border border-rule bg-sheet p-6 text-sm text-ink-3">
            No activity records match your current search or filter.
          </div>
        )}
        {filtered.map((entry) => {
          const changes = formatAuditChanges(entry.beforeJson, entry.afterJson);
          return (
            <div key={entry.id} className="rounded-[4px] border border-rule bg-sheet p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{entry.timestampIst}</span>
                  <span>·</span>
                  <span className="rounded bg-action-soft px-2 py-0.5 font-semibold text-action">
                    {AUDIT_ACTION_LABELS[entry.action] || entry.action}
                  </span>
                  <span>{MODULE_LABELS[entry.module] || entry.module.replace(/_/g, ' ')}</span>
                </div>
                <span>
                  By <strong className="text-ink">{entry.actorName}</strong> (
                  {getRoleLabel(entry.actorRole)})
                </span>
              </div>

              <div className="text-sm font-semibold text-ink">{entry.summary}</div>

              {changes.length > 0 && (
                <div className="rounded-[3px] border border-rule bg-paper px-3.5 py-2.5 space-y-1 text-xs">
                  {changes.map((c) => (
                    <div key={c.field} className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink-2">{c.field}:</span>
                      <span className="line-through text-madder">{c.before}</span>
                      <span className="text-ink-3">→</span>
                      <span className="font-semibold text-leaf">{c.after}</span>
                    </div>
                  ))}
                </div>
              )}

              {showTechnicalDetails && (
                <div className="text-[11px] font-mono text-ink-3 pt-1">
                  Record ID: {entry.entityNo} · Device IP: {entry.ipAddress}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
