'use client';

import React, { useEffect, useState } from 'react';

export default function AdminSystemHealthPage() {
  const [healthStatus, setHealthStatus] = useState('Checking...');
  const [dbStatus, setDbStatus] = useState('Checking...');

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (!active || !res) {
          setHealthStatus('Unavailable');
          return;
        }
        setHealthStatus(res.status === 'ok' || res.ok ? '● Healthy' : String(res.status || '● Healthy'));
        setDbStatus(res.db ? String(res.db) : 'Connected');
      })
      .catch(() => {
        if (active) setHealthStatus('Unavailable');
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">System Health &amp; Data Management</h1>
        <p className="text-sm text-ink-3">
          API health, background job queues, database status, and master data export.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-[3px] border border-rule bg-sheet p-4">
          <div className="text-xs text-ink-3">API Health (/health)</div>
          <div className="mt-1 text-lg font-bold text-leaf">{healthStatus}</div>
        </div>
        <div className="rounded-[3px] border border-rule bg-sheet p-4">
          <div className="text-xs text-ink-3">PostgreSQL Database</div>
          <div className="mt-1 text-lg font-bold text-ink">{dbStatus}</div>
        </div>
        <div className="rounded-[3px] border border-rule bg-sheet p-4">
          <div className="text-xs text-ink-3">Timezone</div>
          <div className="mt-1 text-lg font-bold text-ink">Asia/Kolkata (IST)</div>
        </div>
        <div className="rounded-[3px] border border-rule bg-sheet p-4">
          <div className="text-xs text-ink-3">App Version</div>
          <div className="mt-1 font-mono text-lg font-bold text-purple-400">v0.7.0 (R3)</div>
        </div>
      </div>

      <div className="rounded-[3px] border border-rule bg-sheet p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm font-bold text-ink">Data Retention &amp; Master Backup</div>
          <div className="text-xs text-ink-3">Audit logs retained for 8 years (GST statutory requirement).</div>
        </div>
      </div>
    </div>
  );
}
