'use client';

import React, { useState } from 'react';
import { INITIAL_SCHEDULED_REPORTS } from '../../../../src/lib/reports-data';

export default function ScheduledReportsPage() {
  const [schedules, setSchedules] = useState(INITIAL_SCHEDULED_REPORTS);
  const [reportTitle, setReportTitle] = useState('Customer-wise Sales & Margin');
  const [frequency, setFrequency] = useState('Weekly Monday 8:30 AM');
  const [recipients, setRecipients] = useState('Owner (Email + WhatsApp)');

  function addSchedule(e: React.FormEvent) {
    e.preventDefault();
    setSchedules((prev) => [
      { id: `sch-${Date.now()}`, reportTitle, frequency, recipients, active: true },
      ...prev,
    ]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Scheduled Reports</h1>
        <p className="text-sm text-slate-500">
          Automatically deliver PDF/Excel reports via WhatsApp or Email on a daily or weekly schedule.
        </p>
      </div>

      <form onSubmit={addSchedule} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <input value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <input value={frequency} onChange={(e) => setFrequency(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <input value={recipients} onChange={(e) => setRecipients(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
          + Add Schedule
        </button>
      </form>

      <div className="space-y-3">
        {schedules.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div>
              <div className="font-bold text-slate-900">{s.reportTitle}</div>
              <div className="text-xs text-slate-500">{s.frequency} · {s.recipients}</div>
            </div>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              {s.active ? 'Active' : 'Paused'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

