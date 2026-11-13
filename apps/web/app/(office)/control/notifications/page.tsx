'use client';

import React, { useMemo, useState } from 'react';
import { INITIAL_NOTIFICATIONS, type NotificationLogRecord } from '../../../../src/lib/control-tower-data';

export default function NotificationsLogPage() {
  const [logs, setLogs] = useState<NotificationLogRecord[]>(INITIAL_NOTIFICATIONS);
  const [statusFilter, setStatusFilter] = useState<'ALL' | NotificationLogRecord['status']>('ALL');

  const filtered = useMemo(
    () => logs.filter((l) => (statusFilter === 'ALL' ? true : l.status === statusFilter)),
    [logs, statusFilter],
  );

  function retryMessage(id: string) {
    setLogs((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status: 'RETRIED', errorDetail: 'Retry queued successfully' } : l)),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications Outbox Log</h1>
          <p className="text-sm text-slate-500">
            Delivery audit for WhatsApp, SMS, Push, and In-app alerts with one-click retry on failed dispatches.
          </p>
        </div>
        <div className="flex gap-2">
          {(['ALL', 'SENT', 'FAILED', 'RETRIED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                statusFilter === st ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Recipient &amp; Template</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((n) => (
              <tr key={n.id}>
                <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{n.channel}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900">{n.recipient}</div>
                  <div className="text-xs text-slate-500">{n.template}</div>
                  {n.errorDetail && <div className="text-xs text-rose-600">{n.errorDetail}</div>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{n.timestamp}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      n.status === 'SENT'
                        ? 'bg-emerald-100 text-emerald-700'
                        : n.status === 'FAILED'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-blue-100 text-blue-700'
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
                      className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
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

