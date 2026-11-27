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
  const [receivablesRows, setReceivablesRows] = useState<Array<{ customer: string; b0: number; b8: number; b16: number; b30: number; total: number }>>([]);
  const [salesTrend, setSalesTrend] = useState<Array<{ day: string; salesInr: number; ordersCount?: number }>>([]);
  const [inventoryRows, setInventoryRows] = useState<Array<{ itemName: string; onHandKg: number; valueInr: number; expiringSoonKg: number }>>([]);
  const [fleetRows, setFleetRows] = useState<Array<{ vehicle: string; trips: number; deliveredStops: number; onTimePct: number; expensesInr: number }>>([]);
  const [summaryMetrics, setSummaryMetrics] = useState<Record<string, any> | null>(null);

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
      fetch(`/api/proxy/analytics/customers/profitability${qs}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/proxy/analytics/suppliers/scorecard${qs}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/proxy/analytics/factory/yield-trend${qs}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/proxy/analytics/ar/aging${qs}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/proxy/analytics/sales/trends${qs}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/proxy/analytics/inventory/health${qs}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/proxy/analytics/fleet/performance${qs}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([sumRes, custRes, supRes, facRes, arRes, salesRes, invRes, fltRes]) => {
        if (!active) return;
        const unwrap = (v: any, key?: string) => {
          if (!v) return [];
          if (Array.isArray(v)) return v;
          if (key && Array.isArray(v[key])) return v[key];
          if (Array.isArray(v.data)) return v.data;
          if (Array.isArray(v.rows)) return v.rows;
          return [];
        };

        if (sumRes.status === 'fulfilled' && sumRes.value) {
          setSummaryMetrics(sumRes.value?.data || sumRes.value);
        }

        if (custRes.status === 'fulfilled') {
          const rows = unwrap(custRes.value, 'customers');
          setCustomers(
            rows.map((c: any) => ({
              customer: String(c.customerName || c.business_name || c.customer || 'Customer'),
              revenue: Number(c.revenueInr ?? c.revenue ?? c.total_sales ?? 0),
              grossProfit: Number(c.grossProfitInr ?? c.grossProfit ?? c.gross_profit ?? 0),
              marginPct: Number(c.marginPct ?? c.margin_pct ?? 0),
              orders: Number(c.ordersCount ?? c.orders ?? c.order_count ?? 0),
            })),
          );
        }

        if (supRes.status === 'fulfilled') {
          const rows = unwrap(supRes.value, 'suppliers');
          setSuppliers(
            rows.map((s: any) => ({
              supplier: String(s.company_name || s.supplierName || s.name || 'Supplier'),
              fillRatePct: Number(s.fill_rate_pct ?? s.fillRatePct ?? 0),
              priceVarPct: Number(s.price_variance_pct ?? s.priceVarPct ?? 0),
              pos: Number(s.po_count ?? s.total_orders ?? s.pos ?? 0),
              grns: Number(s.grn_count ?? s.total_grns ?? s.grns ?? 0),
            })),
          );
        }

        if (facRes.status === 'fulfilled') {
          const rows = unwrap(facRes.value, 'trend');
          setFactoryRows(
            rows.map((w: any) => ({
              week: String(w.woNo || w.week || w.period || w.date || '-'),
              plannedKg: Number(w.plannedKg ?? w.planned_qty ?? 0),
              outputKg: Number(w.outputKg ?? w.actual_output_qty ?? 0),
              yieldPct: Number(w.yieldPct ?? w.yield_pct ?? 0),
              wastagePct: Number(w.wastagePct ?? w.wastage_pct ?? 0),
            })),
          );
        }

        if (arRes.status === 'fulfilled') {
          const rows = unwrap(arRes.value, 'customers');
          setReceivablesRows(
            rows.map((a: any) => ({
              customer: String(a.customerName || a.business_name || 'Customer'),
              b0: Number(a.bucket0to7 ?? a.aging_0_7 ?? a.bucket_0_7 ?? 0),
              b8: Number(a.bucket8to15 ?? a.aging_8_15 ?? a.bucket_8_15 ?? 0),
              b16: Number(a.bucket16to30 ?? a.aging_16_30 ?? a.bucket_16_30 ?? 0),
              b30: Number(a.bucket30Plus ?? a.aging_30_plus ?? a.bucket_30_plus ?? 0),
              total: Number(a.totalOutstanding ?? a.total_outstanding ?? 0),
            })),
          );
        }

        if (salesRes.status === 'fulfilled') {
          const rows = unwrap(salesRes.value, 'trend');
          setSalesTrend(
            rows.map((s: any) => ({
              day: String(s.day || s.date || s.period || ''),
              salesInr: Number(s.salesInr ?? s.revenue ?? s.total_sales ?? 0),
              ordersCount: Number(s.ordersCount ?? s.order_count ?? 0),
            })),
          );
        }

        if (invRes.status === 'fulfilled') {
          const rows = unwrap(invRes.value, 'items');
          setInventoryRows(
            rows.map((i: any) => ({
              itemName: String(i.itemName || i.item_name || i.name || 'Item'),
              onHandKg: Number(i.qtyOnHand ?? i.qty_on_hand ?? i.onHandKg ?? 0),
              valueInr: Number(i.stockValueInr ?? i.stock_value ?? i.valueInr ?? 0),
              expiringSoonKg: Number(i.expiringSoonKg ?? i.expiring_soon_qty ?? 0),
            })),
          );
        }

        if (fltRes.status === 'fulfilled') {
          const rows = unwrap(fltRes.value, 'vehicles');
          setFleetRows(
            rows.map((f: any) => ({
              vehicle: String(f.registrationNo || f.registration_no || f.vehicle || f.tripNo || 'Trip'),
              trips: Number(f.tripsCount ?? f.trips ?? 1),
              deliveredStops: Number(f.deliveredStops ?? f.delivered_stops ?? 0),
              onTimePct: Number(f.onTimePct ?? f.on_time_pct ?? 100),
              expensesInr: Number(f.expensesInr ?? f.expenses ?? 0),
            })),
          );
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
    if (activeTab === 'RECEIVABLES') {
      return toCsvExport(
        ['Customer', '0-7d', '8-15d', '16-30d', '30+d', 'Total AR'],
        receivablesRows.map((r) => [r.customer, r.b0, r.b8, r.b16, r.b30, r.total]),
      );
    }
    if (activeTab === 'INVENTORY') {
      return toCsvExport(
        ['Item', 'On Hand Qty', 'Valuation INR', 'Expiring Soon'],
        inventoryRows.map((i) => [i.itemName, i.onHandKg, i.valueInr, i.expiringSoonKg]),
      );
    }
    if (activeTab === 'DELIVERY') {
      return toCsvExport(
        ['Vehicle', 'Trips', 'Delivered Stops', 'On-Time %', 'Expenses INR'],
        fleetRows.map((f) => [f.vehicle, f.trips, f.deliveredStops, f.onTimePct, f.expensesInr]),
      );
    }
    return toCsvExport(
      ['Customer', 'Revenue INR', 'Gross Profit INR', 'Margin %', 'Orders'],
      customers.map((c) => [c.customer, c.revenue, c.grossProfit, c.marginPct, c.orders]),
    );
  }, [activeTab, suppliers, factoryRows, customers, receivablesRows, inventoryRows, fleetRows]);

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

        {activeTab === 'RECEIVABLES' && (
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-ink-3">
              <tr>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5 text-right">0–7d</th>
                <th className="px-4 py-2.5 text-right">8–15d</th>
                <th className="px-4 py-2.5 text-right">16–30d</th>
                <th className="px-4 py-2.5 text-right">30+d</th>
                <th className="px-4 py-2.5 text-right">Total AR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule text-ink">
              {receivablesRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-ink-3">No open receivables records.</td>
                </tr>
              ) : (
                receivablesRows.map((r, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 font-semibold">{r.customer}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatINR(r.b0)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatINR(r.b8)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-haldi">{formatINR(r.b16)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-madder">{formatINR(r.b30)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold">{formatINR(r.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'INVENTORY' && (
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-ink-3">
              <tr>
                <th className="px-4 py-2.5">Item</th>
                <th className="px-4 py-2.5 text-right">On Hand Qty</th>
                <th className="px-4 py-2.5 text-right">Valuation</th>
                <th className="px-4 py-2.5 text-right">Expiring Soon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule text-ink">
              {inventoryRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-ink-3">No active inventory valuation rows.</td>
                </tr>
              ) : (
                inventoryRows.map((inv, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 font-semibold">{inv.itemName}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{inv.onHandKg.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatINR(inv.valueInr)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-haldi">{inv.expiringSoonKg}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'DELIVERY' && (
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-ink-3">
              <tr>
                <th className="px-4 py-2.5">Vehicle / Route</th>
                <th className="px-4 py-2.5 text-right">Trips</th>
                <th className="px-4 py-2.5 text-right">Delivered Stops</th>
                <th className="px-4 py-2.5 text-right">On-Time %</th>
                <th className="px-4 py-2.5 text-right">Expenses</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule text-ink">
              {fleetRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-ink-3">No fleet delivery performance data in this period.</td>
                </tr>
              ) : (
                fleetRows.map((f, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 font-semibold">{f.vehicle}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{f.trips}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{f.deliveredStops}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-leaf">{f.onTimePct}%</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatINR(f.expensesInr)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {(activeTab === 'SALES' || activeTab === 'PURCHASES') && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-ink">
              {activeTab === 'SALES' ? 'Sales Trend' : 'Executive Purchase & Period Summary'} ({datePreset} · {siteFilter})
            </h2>
            {summaryMetrics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {Object.entries(summaryMetrics)
                  .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
                  .slice(0, 8)
                  .map(([k, v]) => (
                    <div key={k} className="rounded-[3px] border border-rule bg-paper p-3">
                      <div className="text-ink-3 capitalize">{k.replace(/([A-Z])/g, ' $1')}</div>
                      <div className="mt-1 font-mono text-sm font-bold text-ink">{String(v)}</div>
                    </div>
                  ))}
              </div>
            )}
            {salesTrend.length === 0 ? (
              <div className="text-sm text-ink-3">No trend records available for this window.</div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {salesTrend.slice(-8).map((d) => (
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
