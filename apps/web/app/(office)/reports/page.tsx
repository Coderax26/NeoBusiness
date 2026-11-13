'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { toCsvExport } from '@neo/shared';
import {
  INITIAL_REPORTS,
  PRINTABLE_DOCUMENTS,
  type ReportDefinition,
} from '../../../src/lib/reports-data';

export default function ReportsLibraryPage() {
  const [reports, setReports] = useState<ReportDefinition[]>(INITIAL_REPORTS);
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState<string>('ALL');
  const [activeReport, setActiveReport] = useState<ReportDefinition | null>(null);
  const [printDoc, setPrintDoc] = useState<(typeof PRINTABLE_DOCUMENTS)[number] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const areas = useMemo(
    () => ['ALL', ...Array.from(new Set(reports.map((r) => r.area)))],
    [reports],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      const areaOk = areaFilter === 'ALL' || r.area === areaFilter;
      const qOk = !q || r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
      return areaOk && qOk;
    });
  }, [reports, search, areaFilter]);

  function toggleFav(id: string) {
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, favourite: !r.favourite } : r)));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Report Library &amp; Business Documents</h1>
          <p className="text-sm text-slate-500">
            Browse reports like a menu, star favourites, export PDF/Excel/CSV, and print A4 business documents.
          </p>
        </div>
        <Link
          href="/reports/scheduled"
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Scheduled Reports →
        </Link>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
          {toast}
        </div>
      )}

      {/* Search & Area Filter */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reports (e.g. aging, margin, GSTR-1, yield)..."
          className="w-full sm:w-80 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {areas.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAreaFilter(a)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                areaFilter === a ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((r) => (
          <div key={r.id} className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="rounded bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">{r.area}</span>
                <button
                  type="button"
                  onClick={() => toggleFav(r.id)}
                  className="text-base"
                  title="Toggle Favourite"
                >
                  {r.favourite ? '⭐' : '☆'}
                </button>
              </div>
              <h2 className="mt-2 text-base font-bold text-slate-900">{r.title}</h2>
              <p className="mt-1 text-xs text-slate-500">{r.description}</p>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-[11px] text-slate-400">Last run: {r.lastRun}</span>
              <button
                type="button"
                onClick={() => setActiveReport(r)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Run Report
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Printable Business Documents */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-base font-bold text-slate-900">Business Documents &amp; A4 Printing</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PRINTABLE_DOCUMENTS.map((doc) => (
            <div key={doc.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs space-y-1.5">
              <div className="font-bold text-slate-900">{doc.title}</div>
              <div className="font-mono text-slate-600">{doc.docNo}</div>
              <div className="text-slate-500">{doc.party} · {doc.amount}</div>
              <button
                type="button"
                onClick={() => setPrintDoc(doc)}
                className="w-full rounded bg-slate-900 py-1 text-white font-semibold"
              >
                Preview / Print ({doc.mode})
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Report Viewer Modal */}
      {activeReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{activeReport.title}</h3>
                <p className="text-xs text-slate-500">{activeReport.description}</p>
              </div>
              <button type="button" onClick={() => setActiveReport(null)} className="px-2 py-1 text-sm text-slate-500">✕</button>
            </div>

            {activeReport.totalLabel && (
              <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">
                {activeReport.totalLabel}: {activeReport.totalValue}
              </div>
            )}

            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {activeReport.columns.map((c) => (
                    <th key={c} className="px-3 py-2">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeReport.rows.map((row, idx) => (
                  <tr key={idx}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 font-mono">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => setToast(`Opened A4 Print Preview for ${activeReport.title}`)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold"
              >
                Print / PDF
              </button>
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(toCsvExport(activeReport.columns, activeReport.rows))}`}
                download={`${activeReport.id}.csv`}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Export CSV / Excel
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Document Print Preview Modal */}
      {printDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-bold uppercase text-slate-400">NeoAgro Dairy &amp; Feeds Pvt. Ltd.</div>
                <h3 className="text-lg font-bold text-slate-900">{printDoc.title} — {printDoc.docNo}</h3>
              </div>
              <button type="button" onClick={() => setPrintDoc(null)} className="px-2 py-1 text-sm text-slate-500">✕</button>
            </div>
            <div className="rounded-lg bg-slate-50 p-4 text-sm space-y-1">
              <div>Party: <strong>{printDoc.party}</strong></div>
              <div>Total Amount: <strong className="font-mono">{printDoc.amount}</strong></div>
              <div className="text-xs text-slate-500">Template Mode: {printDoc.mode} (A4 print CSS ready)</div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setToast(`Shared ${printDoc.docNo} via WhatsApp`);
                  setPrintDoc(null);
                }}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
              >
                Share WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setPrintDoc(null)}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

