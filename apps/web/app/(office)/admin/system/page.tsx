'use client';

import React, { useCallback, useEffect, useState } from 'react';

interface SystemHealthMetrics {
  dbConnected: boolean;
  outboxQueueDepth: number;
  failedNotificationsCount: number;
  lastCheckedAt: string;
}

export default function AdminSystemHealthPage() {
  const [healthStatus, setHealthStatus] = useState('Checking...');
  const [dbStatus, setDbStatus] = useState('Checking...');
  const [metrics, setMetrics] = useState<SystemHealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      const [basicRes, sysRes] = await Promise.all([
        fetch('/api/proxy/health').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/proxy/admin/system-health').then((r) => (r.ok ? r.json() : null)),
      ]);

      if (!basicRes && !sysRes) {
        setHealthStatus('Unavailable');
        setDbStatus('Unavailable');
      } else {
        setHealthStatus(
          basicRes?.status === 'ok' || basicRes?.ok || sysRes?.dbConnected
            ? '● Healthy'
            : String(basicRes?.status || 'Unavailable'),
        );
        const sysData = sysRes?.data ?? sysRes;
        if (sysData && typeof sysData === 'object') {
          setMetrics({
            dbConnected: Boolean(sysData.dbConnected),
            outboxQueueDepth: Number(sysData.outboxQueueDepth ?? 0),
            failedNotificationsCount: Number(sysData.failedNotificationsCount ?? 0),
            lastCheckedAt: sysData.lastCheckedAt
              ? new Date(sysData.lastCheckedAt).toLocaleString('en-IN')
              : new Date().toLocaleString('en-IN'),
          });
          setDbStatus(sysData.dbConnected ? 'Connected' : 'Disconnected');
        } else {
          setDbStatus(basicRes?.db ? String(basicRes.db) : 'Connected');
        }
      }
    } catch {
      setHealthStatus('Unavailable');
      setDbStatus('Unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">System Health &amp; Data Management</h1>
          <p className="text-sm text-ink-3">
            API health, outbox queue depth, failed notification dispatches, and database status.
          </p>
        </div>
        <button
          type="button"
          onClick={loadHealth}
          disabled={loading}
          className="rounded-lg border border-rule-strong bg-sheet px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-sunken disabled:opacity-60"
        >
          {loading ? 'Checking…' : '↻ Refresh Status'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[3px] border border-rule bg-sheet p-4">
          <div className="text-xs text-ink-3">API Health (/health)</div>
          <div className="mt-1 text-lg font-bold text-leaf">{healthStatus}</div>
        </div>
        <div className="rounded-[3px] border border-rule bg-sheet p-4">
          <div className="text-xs text-ink-3">PostgreSQL Database</div>
          <div className="mt-1 text-lg font-bold text-ink">{dbStatus}</div>
        </div>
        <div className="rounded-[3px] border border-rule bg-sheet p-4">
          <div className="text-xs text-ink-3">Outbox Queue Depth</div>
          <div className="mt-1 font-mono text-lg font-bold text-ink">
            {metrics ? metrics.outboxQueueDepth : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-ink-3">Pending domain events (processed_at IS NULL)</div>
        </div>
        <div className="rounded-[3px] border border-rule bg-sheet p-4">
          <div className="text-xs text-ink-3">Failed Notifications</div>
          <div
            className={`mt-1 font-mono text-lg font-bold ${
              metrics && metrics.failedNotificationsCount > 0 ? 'text-madder' : 'text-leaf'
            }`}
          >
            {metrics ? metrics.failedNotificationsCount : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-ink-3">
            {metrics ? `Checked ${metrics.lastCheckedAt}` : 'Asia/Kolkata (IST)'}
          </div>
        </div>
      </div>

      <div className="rounded-[3px] border border-rule bg-sheet p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm font-bold text-ink">Data Retention &amp; Master Backup</div>
          <div className="text-xs text-ink-3">Audit logs retained for 8 years (GST statutory requirement).</div>
        </div>
        <div className="font-mono text-xs text-ink-3">Timezone: Asia/Kolkata (IST) · v0.7.0 (R3)</div>
      </div>
    </div>
  );
}
