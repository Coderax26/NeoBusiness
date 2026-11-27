'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { canAccessAnalytics, formatINR, toCsvExport, type UserRole } from '@neo/shared';

type AnalyticsTab =
  | 'CUSTOMERS'
  | 'SUPPLIERS'
  | 'FACTORY'
  | 'RECEIVABLES'
  | 'SALES'
  | 'INVENTORY'
  | 'DELIVERY'
  | 'PURCHASES';

const TABS: Array<{ key: AnalyticsTab; label: string }> = [
  { key: 'CUSTOMERS', label: 'Customers' },
  { key: 'SUPPLIERS', label: 'Suppliers' },
  { key: 'FACTORY', label: 'Factory' },
  { key: 'RECEIVABLES', label: 'Receivables' },
  { key: 'SALES', label: 'Sales' },
  { key: 'INVENTORY', label: 'Inventory' },
  { key: 'DELIVERY', label: 'Delivery' },
  { key: 'PURCHASES', label: 'Purchases' },
];

export default function ControlAnalyticsPage() {
  const [role, setRole] = useState<UserRole>('OWNER');
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('CUSTOMERS');
  const [datePreset, setDatePreset] = useState<'7D' | '30D' | '90D'>('30D');
  const [siteFilter, setSiteFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'TABLE' | 'CHART'>('TABLE');
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ customer: string; revenue: number; grossProfit: number; marginPct: number; orders: number }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ supplier: string; fillRatePct: number; priceVarPct: number; pos: number; grns: number }>>([]);
  const [factoryRows, setFactoryRows] = useState<Array<{ week: string; plannedKg: number; outputKg: number; yieldPct: number; wastagePct: number }>>([]);
  const [salesTrend, setSalesTrend] = useState<Array<{ day: string; salesInr: number }>>([]);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d?.user) return;
        if (d.user.role) setRole(d.user.role);
        if (Array.isArray(d.user.sites)) {
          setSites(d.user.sites.map((s: any) => ({ id: String(s.id), name: String(s.name || s.id) })));
        }
      })
      .catch(() => {});

    const days = datePreset === '7D' ? 7 : datePreset === '90D' ? 90 : 30;
    const toDate = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const params = new URLSearchParams({ from: fromDate, to: toDate });
    if (siteFilter && siteFilter !== 'ALL') params.set('siteId', siteFilter);
    const qs = `?${params.toString()}`;

    Promise.allSettled([
      fetch(`/api/proxy/analytics/summary${qs}`).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/proxy/procurement/suppliers').then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/production/work-orders${qs}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/orders${qs}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([anRes, supRes, woRes, ordRes]) => {
        if (!active) return;
        if (anRes.status === 'fulfilled' && anRes.value) {
          const d = anRes.value.data || anRes.value;
          if (Array.isArray(d.customers)) setCustomers(d.customers);
          if (Array.isArray(d.salesTrend)) setSalesTrend(d.salesTrend);
        }
        if (supRes.status === 'fulfilled') {
          const rows = Array.isArray(supRes.value) ? supRes.value : Array.isArray(supRes.value?.data) ? supRes.value.data : [];
          setSuppliers(
            rows.map((s: any) => ({
              supplier: String(s.company_name || s.name || 'Supplier'),
              fillRatePct: Number(s.fill_rate_pct ?? 95),
              priceVarPct: Number(s.price_variance_pct ?? 0),
              pos: Number(s.total_orders ?? 0),
              grns: Number(s.total_grns ?? 0),
            })),
          );
        }
        if (woRes.status === 'fulfilled') {
          const rows = Array.isArray(woRes.value) ? woRes.value : Array.isArray(woRes.value?.data) ? woRes.value.data : [];
          setFactoryRows(
            rows.slice(0, 10).map((w: any) => {
              const plannedKg = Number(w.plannedQty ?? w.planned_qty ?? 0);
              const outputKg = Number(w.actualOutputQty ?? w.actual_output_qty ?? 0);
              const scrapKg = Number(w.scrapQty ?? w.scrap_qty ?? w.wastage_qty ?? 0);
              return {
                week: String(w.woNumber || w.wo_number || w.id),
                plannedKg,
                outputKg,
                yieldPct: plannedKg > 0 ? Number(((outputKg / plannedKg) * 100).toFixed(1)) : 100,
                wastagePct: plannedKg > 0 ? Number(((scrapKg / plannedKg) * 100).toFixed(1)) : 0,
              };
            }),
          );
        }
        if (ordRes.status === 'fulfilled') {
          const rows = Array.isArray(ordRes.value) ? ordRes.value : Array.isArray(ordRes.value?.data) ? ordRes.value.data : [];
          if (rows.length > 0) {
            const byCust = new Map<string, { revenue: number; orders: number }>();
            for (const o of rows) {
              const name = String(o.customer_name || o.customerName || 'Customer');
              const prev = byCust.get(name) || { revenue: 0, orders: 0 };
              byCust.set(name, { revenue: prev.revenue + Number(o.total_amount ?? 0), orders: prev.orders + 1 });
            }
            setCustomers((prev) =>
              prev.length > 0
                ? prev
                : Array.from(byCust.entries()).map(([customer, v]) => ({
                    customer,
                    revenue: v.revenue,
                    grossProfit: Number((v.revenue * 0.18).toFixed(2)),
                    marginPct: 18,
                    orders: v.orders,
                  })),
            );
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [datePreset, siteFilter]);

  const allowed = canAccessAnalytics(role);

  const csvPayload = useMemo(() => {
    if (activeTab === 'SUPPLIERS') {
      return toCsvExport(
        ['Supplier', 'Fill Rate %', 'Price Variance %', 'POs', 'GRNs'],
        suppliers.map((s) => [s.supplier, s.fillRatePct, s.priceVarPct, s.pos, s.grns]),
      );
    }
    if (activeTab === 'FACTORY') {
      return toCsvExport(
        ['Work Order', 'Planned kg', 'Output kg', 'Yield %', 'Wastage %'],
        factoryRows.map((f) => [f.week, f.plannedKg, f.outputKg, f.yieldPct, f.wastagePct]),
      );
    }
    return toCsvExport(
      ['Customer', 'Revenue INR', 'Gross Profit INR', 'Margin %', 'Orders'],
      customers.map((c) => [c.customer, c.revenue, c.grossProfit, c.marginPct, c.orders]),
    );
  }, [activeTab, suppliers, factoryRows, customers]);

  if (!allowed) {
    return (
      <div className="rounded-[4px] border border-madder/30 bg-madder-soft p-8 text-center space-y-3">
        <h1 className="text-xl font-bold text-madder">Access Restricted (403 — Masked Role)</h1>
        <p className="text-sm text-madder/80">
          Role <span className="font-mono font-bold">{role}</span> cannot view commercial margin or customer profitability analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Executive Analytics</h1>
          <p className="text-sm text-ink-3">
            Plain-English drill-down reports across commercial, factory, procurement, and delivery performance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as '7D' | '30D' | '90D')}
            className="rounded-lg border border-rule bg-sheet px-3 py-1.5 text-xs font-semibold text-ink"
          >
            <option value="7D">Last 7 Days</option>
            <option value="30D">Last 30 Days</option>
            <option value="90D">Last 90 Days</option>
          </select>
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="rounded-lg border border-rule bg-sheet px-3 py-1.5 text-xs font-semibold text-ink"
          >
            <option value="ALL">All Sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setViewMode((m) => (m === 'TABLE' ? 'CHART' : 'TABLE'))}
            className="rounded-lg border border-rule bg-sheet px-3 py-1.5 text-xs font-semibold text-ink hover:bg-sunken"
          >
            {viewMode === 'TABLE' ? '📊 Chart View' : '📋 Table View'}
 </button>
 <a
 href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvPayload)}`}
 download={`analytics-${activeTab.toLowerCase()}.csv`}
 className="rounded-lg bg-action px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
 >
 Export CSV
 </a>
 </div>
 </div>

 <div className="flex flex-wrap gap-2 border-b border-rule pb-2">
 {TABS.map((t) => (
 <button
 key={t.key}
 type="button"
 onClick={() => setActiveTab(t.key)}
 className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
 activeTab === t.key ?'bg-teal-600 text-white' : 'bg-sheet text-ink-3 hover:bg-sunken hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-[4px] border border-rule bg-sheet p-5">
        {activeTab === 'CUSTOMERS' && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-ink">Which customers generate the most profit ({datePreset})</h2>
            {customers.length === 0 ? (
              <div className="text-sm text-ink-3">No customer analytics data available.</div>
            ) : viewMode === 'CHART'? (
 <div className="space-y-3">
 {customers.map((c) => {
 const maxProfit = Math.max(1, ...customers.map((x) => x.grossProfit));
 return (
 <div key={c.customer} className="space-y-1">
 <div className="flex justify-between text-xs font-semibold text-ink">
 <span>{c.customer}</span>
 <span className="font-mono text-leaf">{formatINR(c.grossProfit)} ({c.marginPct}%)</span>
 </div>
 <div className="h-3 w-full rounded-full bg-sunken">
 <div
 className="h-full rounded-full bg-emerald-500"
 style={{ width: `${Math.round((c.grossProfit / maxProfit) * 100)}%` }}
 />
 </div>
 </div>
 );
 })}
 </div>
 ) : (
 <table className="w-full text-left text-sm">
 <thead className="bg-paper text-xs uppercase text-ink-3">
 <tr>
 <th className="px-4 py-2.5">Customer</th>
 <th className="px-4 py-2.5 text-right">Revenue</th>
 <th className="px-4 py-2.5 text-right">Gross Profit</th>
 <th className="px-4 py-2.5 text-right">Margin %</th>
 <th className="px-4 py-2.5 text-right">Orders</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-rule text-ink">
 {customers.map((c) => (
 <tr key={c.customer}>
 <td className="px-4 py-2.5 font-semibold">{c.customer}</td>
 <td className="px-4 py-2.5 text-right font-mono">{formatINR(c.revenue)}</td>
 <td className="px-4 py-2.5 text-right font-mono text-leaf">{formatINR(c.grossProfit)}</td>
 <td className="px-4 py-2.5 text-right font-mono">{c.marginPct}%</td>
 <td className="px-4 py-2.5 text-right font-mono">{c.orders}</td>
 </tr>
 ))}
 </tbody>
 </table>
 )}
 </div>
 )}

 {activeTab ==='SUPPLIERS' && (
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-ink-3">
              <tr>
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5 text-right">Fill Rate</th>
                <th className="px-4 py-2.5 text-right">Price Variance</th>
                <th className="px-4 py-2.5 text-right">POs / GRNs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule text-ink">
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-ink-3">No supplier analytics available.</td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr key={s.supplier}>
                    <td className="px-4 py-2.5 font-semibold">{s.supplier}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-leaf">{s.fillRatePct}%</td>
                    <td className="px-4 py-2.5 text-right font-mono">{s.priceVarPct}%</td>
                    <td className="px-4 py-2.5 text-right font-mono">{s.pos} / {s.grns}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'FACTORY' && (
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-ink-3">
              <tr>
                <th className="px-4 py-2.5">Work Order</th>
                <th className="px-4 py-2.5 text-right">Planned (kg)</th>
                <th className="px-4 py-2.5 text-right">Output (kg)</th>
                <th className="px-4 py-2.5 text-right">Yield %</th>
                <th className="px-4 py-2.5 text-right">Wastage %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule text-ink">
              {factoryRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-ink-3">No factory analytics available.</td>
                </tr>
              ) : (
                factoryRows.map((f) => (
                  <tr key={f.week}>
                    <td className="px-4 py-2.5 font-semibold">{f.week}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{f.plannedKg.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{f.outputKg.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-leaf">{f.yieldPct}%</td>
                    <td className="px-4 py-2.5 text-right font-mono text-haldi">{f.wastagePct}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {['RECEIVABLES', 'SALES', 'INVENTORY', 'DELIVERY', 'PURCHASES'].includes(activeTab) && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-ink">
              {activeTab.charAt(0) + activeTab.slice(1).toLowerCase()} Summary ({datePreset} · {siteFilter})
            </h2>
            {salesTrend.length === 0 ? (
              <div className="text-sm text-ink-3">No trend records available for this window.</div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {salesTrend.slice(-4).map((d) => (
                  <div key={d.day} className="rounded-[3px] border border-rule bg-paper p-3">
                    <div className="text-xs text-ink-3">{d.day}</div>
                    <div className="mt-1 font-mono text-base font-bold text-ink">{formatINR(d.salesInr)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
