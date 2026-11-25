'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { type NotificationLogRecord } from '../../../../src/lib/control-tower-data';

export default function NotificationsLogPage() {
  const [logs, setLogs] = useState<NotificationLogRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | NotificationLogRecord['status']>('ALL');

  useEffect(() => {
    fetch('/api/proxy/notifications/logs')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setLogs(
          list.map((n: any) => ({
            id: n.id,
            channel: n.channel ?? 'IN_APP',
            recipient: n.recipient ?? n.recipient_phone ?? '-',
            template: n.template_key ?? n.template ?? '-',
            timestamp: n.created_at ? new Date(n.created_at).toLocaleString('en-IN') : '-',
            status: (n.status ?? 'SENT') as NotificationLogRecord['status'],
            errorDetail: n.error ?? n.errorDetail,
          })),
        );
      })
      .catch(() => setLogs([]));
  }, []);

  const filtered = useMemo(
    () => logs.filter((l) => (statusFilter === 'ALL' ? true : l.status === statusFilter)),
    [logs, statusFilter],
  );

  async function retryMessage(id: string) {
    setLogs((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status: 'RETRIED', errorDetail: 'Retry queued successfully' } : l)),
    );
    await fetch(`/api/proxy/notifications/logs/${id}/retry`, { method: 'POST' }).catch(() => {});
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Notifications Outbox Log</h1>
          <p className="text-sm text-ink-3">
            Delivery audit for WhatsApp, SMS, Push, and In-app alerts with one-click retry on failed dispatches.
          </p>
        </div>
        <div className="flex gap-2">
          {(['ALL', 'SENT', 'FAILED', 'RETRIED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold${
                statusFilter === st ? 'bg-zinc-100 text-zinc-950' : 'border border-rule-strong bg-sheet text-ink-2'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[3px] border border-rule bg-sheet">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-ink-3">
            <tr>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Recipient &amp; Template</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-ink-3">
                  No notification logs found.
                </td>
              </tr>
            )}
            {filtered.map((n) => (
              <tr key={n.id}>
                <td className="px-4 py-3 font-mono text-xs font-bold text-ink-2">{n.channel}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-ink">{n.recipient}</div>
                  <div className="text-xs text-ink-3">{n.template}</div>
                  {n.errorDetail && <div className="text-xs text-madder">{n.errorDetail}</div>}
                </td>
                <td className="px-4 py-3 text-xs text-ink-3">{n.timestamp}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold${
                      n.status === 'SENT'
                        ? 'bg-leaf-soft text-leaf'
                        : n.status === 'FAILED'
                          ? 'bg-madder-soft text-madder'
                          : 'bg-blue-500/20 text-blue-300'
                    }`}
                  >
                    {n.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {n.status === 'FAILED' && (
                    <button
                      type="button"
                      onClick={() => retryMessage(n.id)}
                      className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-950"
                    >
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

