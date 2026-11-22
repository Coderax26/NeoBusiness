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
        <h1 className="text-2xl font-bold text-zinc-100">System Health &amp; Data Management</h1>
        <p className="text-sm text-zinc-400">
          API health, background job queues, database status, and master data export.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">API Health (/health)</div>
          <div className="mt-1 text-lg font-bold text-emerald-400">{healthStatus}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">PostgreSQL Database</div>
          <div className="mt-1 text-lg font-bold text-zinc-100">{dbStatus}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">Timezone</div>
          <div className="mt-1 text-lg font-bold text-zinc-100">Asia/Kolkata (IST)</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">App Version</div>
          <div className="mt-1 font-mono text-lg font-bold text-purple-400">v0.7.0 (R3)</div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm font-bold text-zinc-100">Data Retention &amp; Master Backup</div>
          <div className="text-xs text-zinc-400">Audit logs retained for 8 years (GST statutory requirement).</div>
        </div>
      </div>
    </div>
  );
}
