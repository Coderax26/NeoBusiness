'use client';

import React, { useMemo, useState } from 'react';
import { canAccessAnalytics, formatINR, toCsvExport, type UserRole } from '@neo/shared';
import {
  ANALYTICS_CUSTOMERS,
  ANALYTICS_FACTORY,
  ANALYTICS_SUPPLIERS,
  SALES_TREND_30D,
} from '../../../../src/lib/control-tower-data';

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
  const [rolePreview, setRolePreview] = useState<UserRole>('OWNER');
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('CUSTOMERS');
  const [datePreset, setDatePreset] = useState<'7D' | '30D' | '90D'>('30D');
  const [siteFilter, setSiteFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'TABLE' | 'CHART'>('TABLE');

  const allowed = canAccessAnalytics(rolePreview);

  const csvPayload = useMemo(() => {
    if (activeTab === 'SUPPLIERS') {
      return toCsvExport(
        ['Supplier', 'Fill Rate %', 'Price Variance %', 'POs', 'GRNs'],
        ANALYTICS_SUPPLIERS.map((s) => [s.supplier, s.fillRatePct, s.priceVarPct, s.pos, s.grns]),
      );
    }
    if (activeTab === 'FACTORY') {
      return toCsvExport(
        ['Week', 'Planned kg', 'Output kg', 'Yield %', 'Wastage %'],
        ANALYTICS_FACTORY.map((f) => [f.week, f.plannedKg, f.outputKg, f.yieldPct, f.wastagePct]),
      );
    }
    return toCsvExport(
      ['Customer', 'Revenue INR', 'Gross Profit INR', 'Margin %', 'Orders'],
      ANALYTICS_CUSTOMERS.map((c) => [c.customer, c.revenue, c.grossProfit, c.marginPct, c.orders]),
    );
  }, [activeTab]);

  if (!allowed) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center space-y-3">
        <h1 className="text-xl font-bold text-rose-900">Access Restricted (403 — Masked Role)</h1>
        <p className="text-sm text-rose-800">
          Role <span className="font-mono font-bold">{rolePreview}</span> cannot view commercial margin or customer profitability analytics.
        </p>
        <button
          type="button"
          onClick={() => setRolePreview('OWNER')}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
        >
          Switch Back to OWNER View
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Executive Analytics</h1>
          <p className="text-sm text-slate-500">
            Plain-English drill-down reports across commercial, factory, procurement, and delivery performance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as '7D' | '30D' | '90D')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold"
          >
            <option value="7D">Last 7 Days</option>
            <option value="30D">Last 30 Days</option>
            <option value="90D">Last 90 Days</option>
          </select>
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold"
          >
            <option value="ALL">All Sites</option>
            <option value="site-baramati">Baramati Plant</option>
            <option value="site-pune">Pune Hub</option>
          </select>
          <button
            type="button"
            onClick={() => setViewMode((m) => (m === 'TABLE' ? 'CHART' : 'TABLE'))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            {viewMode === 'TABLE' ? '📊 Chart View' : '📋 Table View'}
          </button>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvPayload)}`}
            download={`analytics-${activeTab.toLowerCase()}.csv`}
            className="rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
          >
            Export CSV
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
              activeTab === t.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main Panel */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        {activeTab === 'CUSTOMERS' && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">Which customers generate the most profit ({datePreset})</h2>
            {viewMode === 'CHART' ? (
              <div className="space-y-3">
                {ANALYTICS_CUSTOMERS.map((c) => (
                  <div key={c.customer} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>{c.customer}</span>
                      <span className="font-mono">{formatINR(c.grossProfit)} ({c.marginPct}%)</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-600"
                        style={{ width: `${Math.round((c.grossProfit / 160000) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5 text-right">Revenue</th>
                    <th className="px-4 py-2.5 text-right">Gross Profit</th>
                    <th className="px-4 py-2.5 text-right">Margin %</th>
                    <th className="px-4 py-2.5 text-right">Orders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ANALYTICS_CUSTOMERS.map((c) => (
                    <tr key={c.customer}>
                      <td className="px-4 py-2.5 font-semibold">{c.customer}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatINR(c.revenue)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-emerald-700">{formatINR(c.grossProfit)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{c.marginPct}%</td>
                      <td className="px-4 py-2.5 text-right font-mono">{c.orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'SUPPLIERS' && (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5 text-right">Fill Rate</th>
                <th className="px-4 py-2.5 text-right">Price Variance</th>
                <th className="px-4 py-2.5 text-right">POs / GRNs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ANALYTICS_SUPPLIERS.map((s) => (
                <tr key={s.supplier}>
                  <td className="px-4 py-2.5 font-semibold">{s.supplier}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-700">{s.fillRatePct}%</td>
                  <td className="px-4 py-2.5 text-right font-mono">{s.priceVarPct}%</td>
                  <td className="px-4 py-2.5 text-right font-mono">{s.pos} / {s.grns}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'FACTORY' && (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Week</th>
                <th className="px-4 py-2.5 text-right">Planned (kg)</th>
                <th className="px-4 py-2.5 text-right">Output (kg)</th>
                <th className="px-4 py-2.5 text-right">Yield %</th>
                <th className="px-4 py-2.5 text-right">Wastage %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ANALYTICS_FACTORY.map((f) => (
                <tr key={f.week}>
                  <td className="px-4 py-2.5 font-semibold">{f.week}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{f.plannedKg.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{f.outputKg.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-700">{f.yieldPct}%</td>
                  <td className="px-4 py-2.5 text-right font-mono text-amber-700">{f.wastagePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {['RECEIVABLES', 'SALES', 'INVENTORY', 'DELIVERY', 'PURCHASES'].includes(activeTab) && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-900">
              {activeTab.charAt(0) + activeTab.slice(1).toLowerCase()} Summary ({datePreset} · {siteFilter})
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {SALES_TREND_30D.slice(-4).map((d) => (
                <div key={d.day} className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">{d.day}</div>
                  <div className="mt-1 font-mono text-base font-bold text-slate-900">{formatINR(d.salesInr)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

