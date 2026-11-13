'use client';

import React from 'react';

export default function AdminSystemHealthPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">System Health &amp; Data Management</h1>
        <p className="text-sm text-slate-500">
          API health, background job queues, database backups, and master data export.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">API Health (/health)</div>
          <div className="mt-1 text-lg font-bold text-emerald-700">● Healthy (99.98%)</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Outbox &amp; Notification Relay</div>
          <div className="mt-1 text-lg font-bold text-slate-900">Queue Depth: 0</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Last Nightly Backup</div>
          <div className="mt-1 text-lg font-bold text-slate-900">Today 03:00 IST</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">App Version</div>
          <div className="mt-1 font-mono text-lg font-bold text-purple-700">v0.7.0 (R3)</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm font-bold text-slate-900">Data Retention &amp; Master Backup</div>
          <div className="text-xs text-slate-500">Audit logs retained for 8 years (GST statutory requirement).</div>
        </div>
        <a
          href="data:text/csv;charset=utf-8,Master,Count%0ACustomers,42%0ASuppliers,18%0AItems,64"
          download="neobus-masters-backup.csv"
          className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700"
        >
          Export All Masters (CSV)
        </a>
      </div>
    </div>
  );
}

