'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { SettingsPageHeader } from '../../../../src/components/settings/SettingsPageHeader';

interface SystemHealthMetrics {
  dbConnected: boolean;
  outboxQueueDepth: number;
  failedNotificationsCount: number;
  lastCheckedAt: string;
}

export default function AdminSystemHealthPage() {
  const [appStatus, setAppStatus] = useState<'Checking...' | 'Running Smoothly' | 'Needs Attention'>(
    'Checking...',
  );
  const [dbStatus, setDbStatus] = useState<'Checking...' | 'Connected' | 'Disconnected'>(
    'Checking...',
  );
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
        setAppStatus('Needs Attention');
        setDbStatus('Disconnected');
      } else {
        const sysData = sysRes?.data ?? sysRes;
        const ok = Boolean(basicRes?.status === 'ok' || basicRes?.ok || sysData?.dbConnected);
        setAppStatus(ok ? 'Running Smoothly' : 'Needs Attention');
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
          setDbStatus('Connected');
        }
      }
    } catch {
      setAppStatus('Needs Attention');
      setDbStatus('Disconnected');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="System Health & Backups"
        subtitle="Check if NeoBus services, company data storage, and customer message delivery are working normally."
        whatIsThis="Use this screen for quick peace of mind or if support asks you to check system status. If all four cards look healthy, your business data and alerts are working properly."
        actions={
          <button
            type="button"
            onClick={loadHealth}
            disabled={loading}
            className="rounded-[3px] border border-rule-strong bg-sheet px-3.5 py-2 text-xs font-semibold text-ink hover:bg-paper disabled:opacity-60"
          >
            {loading ? 'Checking…' : '↻ Check Again'}
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[4px] border border-rule bg-sheet p-4 space-y-1">
          <div className="text-xs font-semibold text-ink-3">Application Service</div>
          <div
            className={`text-lg font-bold ${
              appStatus === 'Running Smoothly' ? 'text-leaf' : 'text-madder'
            }`}
          >
            {appStatus}
          </div>
          <p className="text-xs text-ink-3">
            Shows whether the main business server is responding to staff devices.
          </p>
        </div>

        <div className="rounded-[4px] border border-rule bg-sheet p-4 space-y-1">
          <div className="text-xs font-semibold text-ink-3">Company Data Storage</div>
          <div
            className={`text-lg font-bold ${
              dbStatus === 'Connected' ? 'text-leaf' : 'text-madder'
            }`}
          >
            {dbStatus}
          </div>
          <p className="text-xs text-ink-3">
            Confirms your orders, invoices, and stock records are being saved safely.
          </p>
        </div>

        <div className="rounded-[4px] border border-rule bg-sheet p-4 space-y-1">
          <div className="text-xs font-semibold text-ink-3">Pending Background Updates</div>
          <div className="font-mono text-lg font-bold text-ink">
            {metrics ? metrics.outboxQueueDepth : '—'}
          </div>
          <p className="text-xs text-ink-3">
            Updates waiting to sync (normally 0 or a small number during busy hours).
          </p>
        </div>

        <div className="rounded-[4px] border border-rule bg-sheet p-4 space-y-1">
          <div className="text-xs font-semibold text-ink-3">Unsent Customer Alerts</div>
          <div
            className={`font-mono text-lg font-bold ${
              metrics && metrics.failedNotificationsCount > 0 ? 'text-madder' : 'text-leaf'
            }`}
          >
            {metrics ? metrics.failedNotificationsCount : '—'}
          </div>
          <p className="text-xs text-ink-3">
            {metrics && metrics.failedNotificationsCount > 0
              ? 'Some WhatsApp/SMS messages failed to send — check customer phone numbers.'
              : 'All WhatsApp and SMS notifications delivered normally.'}
          </p>
        </div>
      </div>

      <div className="rounded-[4px] border border-rule bg-sheet p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm font-bold text-ink">Record Retention &amp; GST Safety</div>
          <div className="text-xs text-ink-2">
            All invoices, receipts, and activity history are preserved for 8 years to meet GST audit requirements.
          </div>
        </div>
        <div className="text-xs text-ink-3">
          {metrics ? `Last checked: ${metrics.lastCheckedAt}` : 'India Standard Time (IST)'}
        </div>
      </div>
    </div>
  );
}
