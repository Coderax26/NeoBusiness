'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { toCsvExport } from '@neo/shared';
import { type ReportDefinition } from '../../../src/lib/reports-data';

export default function ReportsLibraryPage() {
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [printableDocs, setPrintableDocs] = useState<Array<{ id: string; title: string; docNo: string; party: string; amount: string; mode: string; href: string }>>([]);
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState<string>('ALL');
  const [activeReport, setActiveReport] = useState<ReportDefinition | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const storedSite =
      typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') : null;
    const siteQuery =
      storedSite && storedSite !== 'all' ? `?siteId=${encodeURIComponent(storedSite)}` : '';
    Promise.allSettled([
      fetch(`/api/proxy/analytics/ar/aging${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/reports/management/pnl-snapshot${siteQuery}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/proxy/invoices${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([arRes, pnlRes, invRes]) => {
        if (!active) return;
        const builtReports: ReportDefinition[] = [];
        if (arRes.status === 'fulfilled') {
          const arRows = Array.isArray(arRes.value) ? arRes.value : Array.isArray(arRes.value?.data) ? arRes.value.data : [];
          builtReports.push({
            id: 'rep-ar-aging',
            title: 'AR Aging Summary',
            area: 'Receivables',
            description: 'Customer receivables grouped into 0-7, 8-15, 16-30, and 30+ day aging buckets.',
            favourite: true,
            lastRun: new Date().toISOString().slice(0, 10),
            columns: ['Customer', '0-7d', '8-15d', '16-30d', '30+d', 'Total'],
            rows: arRows.map((c: any) => [
              String(c.customerName || c.businessName || c.business_name || 'Customer'),
              String(c.bucket0to7 ?? c.aging_0_7 ?? 0),
              String(c.bucket8to15 ?? c.aging_8_15 ?? 0),
              String(c.bucket16to30 ?? c.aging_16_30 ?? 0),
              String(c.bucket30Plus ?? c.aging_30_plus ?? 0),
              String(c.totalOutstanding ?? c.total_outstanding ?? 0),
            ]),
          });
        }
        if (pnlRes.status === 'fulfilled' && pnlRes.value) {
          const p = pnlRes.value?.data || pnlRes.value;
          const salesVal = Number(p.salesInr ?? p.revenue ?? p.totalRevenue ?? 0);
          const cogsVal = Number(p.cogsInr ?? p.cogs ?? p.totalCost ?? 0);
          const grossProfitVal = p.grossProfit ?? Number((salesVal - cogsVal).toFixed(2));
          builtReports.push({
            id: 'rep-pnl',
            title: 'Profit & Loss Summary',
            area: 'Management',
            description: 'Live revenue, COGS, gross margin, and operating expense summary.',
            favourite: false,
            lastRun: new Date().toISOString().slice(0, 10),
            columns: ['Metric', 'Amount (INR)'],
            rows: [
              ['Revenue', String(p.salesInr ?? p.revenue ?? p.totalRevenue ?? 0)],
              ['COGS', String(p.cogsInr ?? p.cogs ?? p.totalCost ?? 0)],
              ['Gross Profit', String(grossProfitVal)],
              ['Expenses', String(p.expensesInr ?? p.expenses ?? p.totalExpenses ?? 0)],
              ['Net Profit', String(p.netProfitInr ?? p.netProfit ?? 0)],
            ],
          });
        }
        setReports(builtReports);

        if (invRes.status === 'fulfilled') {
          const iRows = Array.isArray(invRes.value) ? invRes.value : Array.isArray(invRes.value?.data) ? invRes.value.data : [];
          setPrintableDocs(
            iRows.slice(0, 5).map((inv: any) => ({
              id: String(inv.id),
              title: 'Tax Invoice',
              docNo: String(inv.invoiceNo || inv.invoice_no || inv.id),
              party: String(inv.customerName || inv.customer_name || 'Customer'),
              amount: `₹${Number(inv.totalAmount ?? inv.total_amount ?? 0).toLocaleString('en-IN')}`,
              mode: 'A4 PDF',
              href: `/api/proxy/invoices/${encodeURIComponent(String(inv.id))}/pdf`,
            })),
          );
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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

  function handleExportCsv(rep: ReportDefinition) {
    const csv = toCsvExport(rep.columns, rep.rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rep.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast(`Exported ${rep.title} to CSV.`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Report Library &amp; Business Documents</h1>
          <p className="text-sm text-zinc-400">
            Browse live reports, star favourites, export CSV, and print A4 business documents.
          </p>
        </div>
        <Link
          href="/reports/scheduled"
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
        >
          Scheduled Reports →
        </Link>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-300">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reports (e.g. aging, margin, P&L)..."
          className="w-full sm:w-80 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
        />
        <div className="flex flex-wrap gap-1.5">
          {areas.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAreaFilter(a)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                areaFilter === a
                  ? 'bg-emerald-600 text-white'
                  : 'border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 ? (
          <div className="col-span-full rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-500">
            No matching reports found.
          </div>
        ) : (
          filtered.map((r) => (
            <div key={r.id} className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-400">{r.area}</span>
                  <button
                    type="button"
                    onClick={() => toggleFav(r.id)}
                    className="text-base text-amber-400"
                    title="Toggle Favourite"
                  >
                    {r.favourite ? '⭐' : '☆'}
                  </button>
                </div>
                <h2 className="mt-2 text-base font-bold text-zinc-100">{r.title}</h2>
                <p className="mt-1 text-xs text-zinc-400">{r.description}</p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-3">
                <span className="text-[11px] text-zinc-500">Last run: {r.lastRun}</span>
                <button
                  type="button"
                  onClick={() => setActiveReport(r)}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Run Report
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
        <h2 className="text-base font-bold text-zinc-100">Business Documents &amp; A4 Printing</h2>
        {printableDocs.length === 0 ? (
          <p className="text-xs text-zinc-500">No printable invoices available yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {printableDocs.map((doc) => (
              <div key={doc.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs space-y-1.5">
                <div className="font-bold text-zinc-100">{doc.title}</div>
                <div className="font-mono text-zinc-300">{doc.docNo}</div>
                <div className="text-zinc-400">{doc.party} · {doc.amount}</div>
                <a
                  href={doc.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full rounded bg-zinc-800 py-1 text-center text-zinc-100 font-semibold hover:bg-zinc-700"
                >
                  Open PDF ({doc.mode})
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-zinc-100">{activeReport.title}</h3>
                <p className="text-xs text-zinc-400">{activeReport.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExportCsv(activeReport)}
                  className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
                >
                  Export CSV
                </button>
                <button type="button" onClick={() => setActiveReport(null)} className="px-2 py-1 text-sm text-zinc-400 hover:text-white">
                  ✕
                </button>
              </div>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950 text-zinc-400">
                <tr>
                  {activeReport.columns.map((c) => (
                    <th key={c} className="px-3 py-2">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 text-zinc-200">
                {activeReport.rows.map((row, idx) => (
                  <tr key={idx}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 font-mono">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
