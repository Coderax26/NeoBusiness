'use client';

import React, { useState, useEffect } from 'react';

interface ScheduledReport {
  id: string;
  reportTitle: string;
  frequency: string;
  recipients: string;
  active: boolean;
}

export default function ScheduledReportsPage() {
  const [schedules, setSchedules] = useState<ScheduledReport[]>([]);
  const [reportTitle, setReportTitle] = useState('Customer-wise Sales & Margin');
  const [frequency, setFrequency] = useState('Weekly Monday 8:30 AM');
  const [recipients, setRecipients] = useState('Owner (Email + WhatsApp)');

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/reports/schedules')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setSchedules(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function addSchedule(e: React.FormEvent) {
    e.preventDefault();
    await fetch('/api/proxy/reports/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportTitle, frequency, recipients }),
    }).catch(() => {});
    setSchedules((prev) => [
      { id: `sch-${Date.now()}`, reportTitle, frequency, recipients, active: true },
      ...prev,
    ]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Scheduled Reports</h1>
        <p className="text-sm text-zinc-400">
          Automatically deliver PDF/Excel reports via WhatsApp or Email on a daily or weekly schedule.
        </p>
      </div>

      <form onSubmit={addSchedule} className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <input
          value={reportTitle}
          onChange={(e) => setReportTitle(e.target.value)}
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
        <input
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
        <input
          value={recipients}
          onChange={(e) => setRecipients(e.target.value)}
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
        <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          + Add Schedule
        </button>
      </form>

      <div className="space-y-3">
        {schedules.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center text-sm text-zinc-500">
            No scheduled reports configured.
          </div>
        ) : (
          schedules.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm">
              <div>
                <div className="font-bold text-zinc-100">{s.reportTitle}</div>
                <div className="text-xs text-zinc-400">{s.frequency} · {s.recipients}</div>
              </div>
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                {s.active ? 'Active' : 'Paused'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
