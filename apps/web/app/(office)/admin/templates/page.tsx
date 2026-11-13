'use client';

import React from 'react';
import { MESSAGE_TEMPLATES, NUMBER_SERIES } from '../../../../src/lib/admin-data';

export default function AdminTemplatesAndSeriesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Message Templates &amp; Number Series</h1>
        <p className="text-sm text-slate-500">
          WhatsApp/SMS notification templates (OD-022 BSP) and read-only document number sequences (<code className="font-mono">doc_sequences</code>).
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-base font-bold text-slate-900">Notification Templates</h2>
        <div className="space-y-2">
          {MESSAGE_TEMPLATES.map((t) => (
            <div key={t.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-bold text-purple-800">{t.code} ({t.channel})</span>
                <span className="font-mono text-slate-500">Provider ID: {t.providerId}</span>
              </div>
              <p className="mt-1 text-slate-700">{t.preview}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-800">
          Document Number Series (Read-only in MVP)
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50/50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Document Type</th>
              <th className="px-4 py-3">Prefix</th>
              <th className="px-4 py-3">Next #</th>
              <th className="px-4 py-3">Next Sample</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {NUMBER_SERIES.map((n) => (
              <tr key={n.docType}>
                <td className="px-4 py-3 font-semibold text-slate-900">{n.docType}</td>
                <td className="px-4 py-3 font-mono text-slate-600">{n.prefix}</td>
                <td className="px-4 py-3 font-mono text-slate-800">{n.nextNumber}</td>
                <td className="px-4 py-3 font-mono font-bold text-purple-700">{n.sample}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

