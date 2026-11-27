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

  const [runningKey, setRunningKey] = useState<string | null>(null);

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
      fetch('/api/proxy/reports/catalog').then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/proxy/reports/sales-register${siteQuery}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/proxy/reports/purchase-register${siteQuery}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/proxy/reports/gst/summary${siteQuery}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([arRes, pnlRes, invRes, catRes, salesRegRes, purchRegRes, gstRes]) => {
        if (!active) return;
        const builtReports: Array<ReportDefinition & { catalogKey?: string }> = [];
        if (arRes.status === 'fulfilled') {
          const arRows = Array.isArray(arRes.value)
            ? arRes.value
            : Array.isArray(arRes.value?.customers)
              ? arRes.value.customers
              : Array.isArray(arRes.value?.data)
                ? arRes.value.data
                : [];
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
              String(c.bucket0to7 ?? c.aging_0_7 ?? c.bucket_0_7 ?? 0),
              String(c.bucket8to15 ?? c.aging_8_15 ?? c.bucket_8_15 ?? 0),
              String(c.bucket16to30 ?? c.aging_16_30 ?? c.bucket_16_30 ?? 0),
              String(c.bucket30Plus ?? c.aging_30_plus ?? c.bucket_30_plus ?? 0),
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
              ['Revenue', String(salesVal)],
              ['COGS', String(cogsVal)],
              ['Gross Profit', String(grossProfitVal)],
              ['Expenses', String(p.expensesInr ?? p.expenses ?? p.totalExpenses ?? 0)],
              ['Net Profit', String(p.netProfitInr ?? p.netProfit ?? 0)],
            ],
          });
        }
        if (salesRegRes.status === 'fulfilled' && salesRegRes.value) {
          const sr = Array.isArray(salesRegRes.value)
            ? salesRegRes.value
            : Array.isArray(salesRegRes.value?.rows)
              ? salesRegRes.value.rows
              : Array.isArray(salesRegRes.value?.data)
                ? salesRegRes.value.data
                : [];
          builtReports.push({
            id: 'rep-sales-reg',
            title: 'Sales & Tax Register',
            area: 'Sales',
            description: 'Invoice-by-invoice taxable value, CGST/SGST/IGST, and grand total register.',
            favourite: true,
            lastRun: new Date().toISOString().slice(0, 10),
            columns: ['Invoice #', 'Date', 'Customer', 'Taxable', 'Tax', 'Total'],
            rows: sr.map((x: any) => [
              String(x.invoice_no ?? x.invoiceNo ?? '-'),
              String(x.invoice_date ?? x.invoiceDate ?? '').slice(0, 10),
              String(x.customer_name ?? x.customerName ?? '-'),
              String(x.subtotal ?? x.taxable_value ?? 0),
              String(x.tax_total ?? x.taxAmount ?? 0),
              String(x.total_amount ?? x.totalAmount ?? 0),
            ]),
          });
        }
        if (purchRegRes.status === 'fulfilled' && purchRegRes.value) {
          const pr = Array.isArray(purchRegRes.value)
            ? purchRegRes.value
            : Array.isArray(purchRegRes.value?.rows)
              ? purchRegRes.value.rows
              : Array.isArray(purchRegRes.value?.data)
                ? purchRegRes.value.data
                : [];
          builtReports.push({
            id: 'rep-purch-reg',
            title: 'Purchase Register',
            area: 'Purchases',
            description: 'Supplier bill register for ITC reconciliation.',
            favourite: false,
            lastRun: new Date().toISOString().slice(0, 10),
            columns: ['Bill #', 'Date', 'Supplier', 'Taxable', 'Tax', 'Total'],
            rows: pr.map((x: any) => [
              String(x.bill_no ?? x.billNo ?? '-'),
              String(x.bill_date ?? x.billDate ?? '').slice(0, 10),
              String(x.supplier_name ?? x.supplierName ?? '-'),
              String(x.subtotal ?? x.taxable_value ?? 0),
              String(x.tax_amount ?? x.taxAmount ?? 0),
              String(x.total_amount ?? x.totalAmount ?? 0),
            ]),
          });
        }
        if (gstRes.status === 'fulfilled' && gstRes.value) {
          const g = gstRes.value?.data || gstRes.value;
          builtReports.push({
            id: 'rep-gst-summary',
            title: 'GST Summary (GSTR-1 / 3B)',
            area: 'Tax (GST)',
            description: 'Outward taxable supplies, output tax, and input tax credit summary.',
            favourite: false,
            lastRun: new Date().toISOString().slice(0, 10),
            columns: ['Component', 'Value (INR)'],
            rows: Object.entries(g)
              .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
              .map(([k, v]) => [k, String(v)]),
          });
        }
        if (catRes.status === 'fulfilled' && catRes.value) {
          const catList = Array.isArray(catRes.value?.reports) ? catRes.value.reports : [];
          const areaMap: Record<string, ReportDefinition['area']> = {
            Commercial: 'Sales',
            Finance: 'Cash',
            Inventory: 'Inventory',
            Production: 'Production',
            Logistics: 'Logistics',
          };
          for (const cr of catList) {
            builtReports.push({
              id: `rep-cat-${cr.key}`,
              catalogKey: String(cr.key),
              title: String(cr.name),
              area: areaMap[String(cr.category || '')] || 'Management',
              description: `Parameterized live report (${Array.isArray(cr.params) ? cr.params.join(', ') : 'site'})`,
              favourite: false,
              lastRun: 'On demand',
              columns: ['Click Run Report to execute'],
              rows: [],
            });
          }
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

  async function handleRunReport(rep: ReportDefinition & { catalogKey?: string }) {
    if (!rep.catalogKey) {
      setActiveReport(rep);
      return;
    }
    setRunningKey(rep.catalogKey);
    try {
      const storedSite =
        typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') : null;
      const res = await fetch(`/api/proxy/reports/${encodeURIComponent(rep.catalogKey)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          storedSite && storedSite !== 'all' ? { siteId: storedSite } : {},
        ),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setToast(`Could not run report: ${data?.message || `HTTP ${res.status}`}`);
        return;
      }
      const rawRows = Array.isArray(data?.rows) ? data.rows : [];
      const cols = rawRows.length > 0 ? Object.keys(rawRows[0]) : ['Result'];
      const rows =
        rawRows.length > 0
          ? rawRows.map((r: any) => cols.map((c) => String(r[c] ?? '')))
          : [['No rows returned for selected filters']];
      const updated: ReportDefinition = {
        ...rep,
        lastRun: new Date().toISOString().slice(0, 10),
        columns: cols,
        rows,
      };
      setReports((prev) => prev.map((x) => (x.id === rep.id ? updated : x)));
      setActiveReport(updated);
    } catch {
      setToast('Failed to run catalog report.');
    } finally {
      setRunningKey(null);
    }
  }

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
          <h1 className="text-2xl font-bold text-ink">Report Library &amp; Business Documents</h1>
          <p className="text-sm text-ink-3">
            Browse live reports, star favourites, export CSV, and print A4 business documents.
          </p>
        </div>
        <Link
          href="/reports/scheduled"
          className="rounded-lg border border-rule bg-sheet px-4 py-2 text-sm font-semibold text-ink hover:bg-sunken"
        >
          Scheduled Reports →
        </Link>
      </div>

      {toast && (
        <div className="rounded-[3px] border border-leaf/30 bg-leaf-soft px-4 py-2.5 text-sm font-medium text-leaf">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reports (e.g. aging, margin, P&L)..."
          className="w-full sm:w-80 rounded-lg border border-rule bg-sheet px-3 py-2 text-sm text-ink placeholder:text-ink-3"
        />
        <div className="flex flex-wrap gap-1.5">
          {areas.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAreaFilter(a)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                areaFilter === a
                  ? 'bg-leaf text-white'
                  : 'border border-rule bg-sheet text-ink-2 hover:bg-sunken'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 ? (
          <div className="col-span-full rounded-[3px] border border-rule bg-sheet p-8 text-center text-sm text-ink-3">
            No matching reports found.
          </div>
        ) : (
          filtered.map((r) => (
            <div key={r.id} className="flex flex-col justify-between rounded-[3px] border border-rule bg-sheet p-5">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="rounded bg-leaf-soft px-2 py-0.5 font-bold text-leaf">{r.area}</span>
                  <button
                    type="button"
                    onClick={() => toggleFav(r.id)}
                    className="text-base text-haldi"
                    title="Toggle Favourite"
                  >
                    {r.favourite ? '⭐' : '☆'}
                  </button>
                </div>
                <h2 className="mt-2 text-base font-bold text-ink">{r.title}</h2>
                <p className="mt-1 text-xs text-ink-3">{r.description}</p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-rule pt-3">
                <span className="text-[11px] text-ink-3">Last run: {r.lastRun}</span>
                <button
                  type="button"
                  disabled={runningKey === (r as any).catalogKey}
                  onClick={() => void handleRunReport(r as any)}
                  className="rounded-lg bg-leaf px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {runningKey === (r as any).catalogKey ? 'Running...' : 'Run Report'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="rounded-[3px] border border-rule bg-sheet p-5 space-y-3">
        <h2 className="text-base font-bold text-ink">Business Documents &amp; A4 Printing</h2>
        {printableDocs.length === 0 ? (
          <p className="text-xs text-ink-3">No printable invoices available yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {printableDocs.map((doc) => (
              <div key={doc.id} className="rounded-lg border border-rule bg-paper p-3 text-xs space-y-1.5">
                <div className="font-bold text-ink">{doc.title}</div>
                <div className="font-mono text-ink-2">{doc.docNo}</div>
                <div className="text-ink-3">{doc.party} · {doc.amount}</div>
                <a
                  href={doc.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full rounded bg-sunken py-1 text-center text-ink font-semibold hover:bg-sunken"
                >
                  Open PDF ({doc.mode})
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[4px] border border-rule bg-sheet p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-ink">{activeReport.title}</h3>
                <p className="text-xs text-ink-3">{activeReport.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExportCsv(activeReport)}
                  className="rounded-lg bg-leaf px-3 py-1 text-xs font-semibold text-white"
                >
                  Export CSV
                </button>
                <button type="button" onClick={() => setActiveReport(null)} className="px-2 py-1 text-sm text-ink-3 hover:text-ink">
                  ✕
                </button>
              </div>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-paper text-ink-3">
                <tr>
                  {activeReport.columns.map((c) => (
                    <th key={c} className="px-3 py-2">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-rule text-ink">
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
