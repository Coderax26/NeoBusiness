'use client';

import React, { useEffect, useState } from 'react';

export default function AdminTemplatesAndSeriesPage() {
  const [templates, setTemplates] = useState<Array<{ id: string; code: string; channel: string; providerId: string; preview: string }>>([]);
  const [series, setSeries] = useState<Array<{ docType: string; prefix: string; nextNumber: number; sample: string }>>([]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      fetch('/api/proxy/admin/notification-templates').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/admin/doc-sequences').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([tplRes, seqRes]) => {
        if (!active) return;
        if (tplRes.status === 'fulfilled') {
          const rows = Array.isArray(tplRes.value) ? tplRes.value : Array.isArray(tplRes.value?.data) ? tplRes.value.data : [];
          setTemplates(rows);
        }
        if (seqRes.status === 'fulfilled') {
          const rows = Array.isArray(seqRes.value) ? seqRes.value : Array.isArray(seqRes.value?.data) ? seqRes.value.data : [];
          setSeries(rows);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Message Templates &amp; Number Series</h1>
        <p className="text-sm text-ink-3">
          WhatsApp/SMS notification templates (OD-022 BSP) and read-only document number sequences (<code className="font-mono">doc_sequences</code>).
        </p>
      </div>

      <div className="rounded-[3px] border border-rule bg-sheet p-5 space-y-3">
        <h2 className="text-base font-bold text-ink">Notification Templates</h2>
        {templates.length === 0 ? (
          <p className="text-xs text-ink-3">No notification templates configured.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="rounded-lg border border-rule bg-paper p-3 text-sm">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-purple-400">{t.code} ({t.channel})</span>
                  <span className="font-mono text-ink-3">Provider ID: {t.providerId}</span>
                </div>
                <p className="mt-1 text-ink-2">{t.preview}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-[3px] border border-rule bg-sheet">
        <div className="border-b border-rule bg-paper px-5 py-3 text-sm font-bold text-ink">
          Document Number Series (Read-only in MVP)
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-ink-3">
            <tr>
              <th className="px-4 py-3">Document Type</th>
              <th className="px-4 py-3">Prefix</th>
              <th className="px-4 py-3">Next #</th>
              <th className="px-4 py-3">Next Sample</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {series.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-ink-3">
                  No document sequences loaded.
                </td>
              </tr>
            ) : (
              series.map((n) => (
                <tr key={n.docType}>
                  <td className="px-4 py-3 font-semibold text-ink">{n.docType}</td>
                  <td className="px-4 py-3 font-mono text-ink-3">{n.prefix}</td>
                  <td className="px-4 py-3 font-mono text-ink">{n.nextNumber}</td>
                  <td className="px-4 py-3 font-mono font-bold text-purple-400">{n.sample}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
