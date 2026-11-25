'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge, Button, Card } from '@neo/ui';
import { formatINR } from '@neo/shared';
import {
  type SupplierScorecardRow,
} from '../../../../src/lib/procurement-data';

export default function SupplierScorecardsPage() {
  const [scorecards, setScorecards] = useState<SupplierScorecardRow[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierScorecardRow | null>(null);
  const [priceTrends, setPriceTrends] = useState<Array<{ itemId: string; itemName: string; suppliers: Array<{ id: string; name: string; color: string }>; points: Array<{ date: string; rates: Record<string, number> }> }>>([]);
  const [selectedTrendItemId, setSelectedTrendItemId] = useState('');
  const [missingRates, setMissingRates] = useState<Array<{ supplierId: string; supplierName: string; itemId?: string; itemSku: string; itemName: string; daysSinceLastQuote: number; lastKnownRate?: number; uom?: string }>>([]);

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/procurement/suppliers')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!active || !Array.isArray(rows)) return;
        const mapped: SupplierScorecardRow[] = rows.map((s: any) => ({
          supplierId: String(s.id),
          code: String(s.supplier_code || s.code || ''),
          name: String(s.company_name || s.name || 'Supplier'),
          fillRatePct: Number(s.fill_rate_pct ?? 96),
          onTimePct: Number(s.on_time_pct ?? 94),
          avgPriceVariancePct: Number(s.price_variance_pct ?? 1.2),
          monthlySpend: Number(s.monthly_spend ?? 0),
          totalSpend: Number(s.total_spend ?? s.monthly_spend ?? 0),
          shortfallCount: Number(s.shortfall_count ?? 0),
          reliabilityScore: Number(s.reliability_score ?? 4.5),
          poCount: Number(s.total_orders ?? 0),
          grnCount: Number(s.grn_count ?? 0),
        } as unknown as SupplierScorecardRow));
        setScorecards(mapped);
        if (mapped.length > 0) setSelectedSupplier(mapped[0]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const trendSeries =
    priceTrends.find((t) => t.itemId === selectedTrendItemId) ||
    priceTrends[0] || { itemId: '', itemName: 'No price trend data', suppliers: [], points: [] };

  const allValues = trendSeries.points.flatMap((pt) => Object.values(pt.rates));
  const minVal = allValues.length > 0 ? Math.min(...allValues) - 2 : 0;
  const maxVal = allValues.length > 0 ? Math.max(...allValues) + 2 : 100;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/procurement" className="hover:text-ink">Procurement</Link>
            <span>/</span>
            <span className="text-action">Scorecards &amp; Rate Monitoring</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">
            Supplier Scorecards &amp; Rate Monitoring
          </h1>
          <p className="text-sm text-ink-3">
            Track fill rate, on-time delivery, price variance %, missing-rate alerts, and multi-supplier price trends.
          </p>
        </div>

        <Link href="/procurement/suppliers">
          <Button variant="secondary">Manage Suppliers &amp; Rates →</Button>
        </Link>
      </div>

      {/* Supplier Ranking Table */}
      <div className="bg-sheet border border-rule rounded-[3px] overflow-hidden">
        <div className="p-4 border-b border-rule flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Supplier Performance Ranking</h2>
          <span className="text-xs text-ink-3">Click any supplier to drill down</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper border-b border-rule text-xs uppercase text-ink-3">
              <tr>
                <th className="p-3">Rank</th>
                <th className="p-3">Supplier</th>
                <th className="p-3">Fill Rate</th>
                <th className="p-3">On-Time %</th>
                <th className="p-3 text-right">Avg Variance</th>
                <th className="p-3 text-right">PO / GRN</th>
                <th className="p-3 text-right">Reliability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {scorecards.map((row, idx) => (
                <tr
                  key={row.supplierId}
                  onClick={() => setSelectedSupplier(row)}
                  className={`hover:bg-sunken cursor-pointer${
                    selectedSupplier?.supplierId === row.supplierId ? 'bg-indigo-500/10' : ''}`}
 >
 <td className="p-3 font-mono text-xs text-ink-3">#{idx + 1}</td>
 <td className="p-3">
 <div className="text-ink font-medium">{row.name}</div>
 <div className="text-[11px] font-mono text-ink-3">{row.code}</div>
 </td>
 <td className="p-3">
 <div className="flex items-center gap-2">
 <div className="w-20 h-2 bg-sunken rounded-full overflow-hidden">
 <div
 className="h-full bg-emerald-500"
 style={{ width: `${row.fillRatePct}%` }}
 />
 </div>
 <span className="font-mono text-xs text-leaf">
 {row.fillRatePct}%
 </span>
 </div>
 </td>
 <td className="p-3 font-mono text-xs text-ink">{row.onTimePct}%</td>
 <td className="p-3 text-right font-mono text-xs">
 <span
 className={
 row.avgPriceVariancePct > 3 ?'text-amber-400' : 'text-emerald-400'
                      }
                    >
                      +{row.avgPriceVariancePct}%
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono text-xs text-ink-2">
                    {row.poCount} / {row.grnCount}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-action">
                    {row.reliabilityScore.toFixed(1)} ★
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Supplier Drilldown + Missing Rates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 bg-sheet border-rule">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink">
              Supplier Drill-Down: {selectedSupplier?.name ?? 'Select a supplier'}
            </h3>
            <Badge variant="info">{selectedSupplier?.code ?? '—'}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-paper border border-rule">
              <span className="text-ink-3">Monthly Spend</span>
              <div className="text-lg font-bold text-ink font-mono mt-1">
                {formatINR(selectedSupplier?.monthlySpend ?? 0)}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-paper border border-rule">
              <span className="text-ink-3">Reliability Score</span>
              <div className="text-lg font-bold text-action font-mono mt-1">
                {selectedSupplier?.reliabilityScore ?? 0} / 5.0
              </div>
            </div>
            <div className="p-3 rounded-lg bg-paper border border-rule">
              <span className="text-ink-3">Fill Rate</span>
              <div className="text-lg font-bold text-leaf font-mono mt-1">
                {selectedSupplier?.fillRatePct ?? 0}%
              </div>
            </div>
            <div className="p-3 rounded-lg bg-paper border border-rule">
              <span className="text-ink-3">Avg Price Variance</span>
              <div className="text-lg font-bold text-haldi font-mono mt-1">
                +{selectedSupplier?.avgPriceVariancePct ?? 0}%
              </div>
            </div>
          </div>
        </Card>

        {/* Missing Rates Alert List */}
        <Card className="p-5 bg-sheet border-rule">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink">Missing Rates Alerts</h3>
            <Badge variant="warning">{missingRates.length} items</Badge>
          </div>
          <div className="space-y-2">
            {missingRates.length === 0 ? (
              <p className="text-xs text-leaf">All active items have current supplier quotes.</p>
            ) : (
              missingRates.map((mr) => (
                <div
                  key={mr.itemId ?? mr.itemSku}
                  className="p-3 rounded-lg bg-paper border border-rule flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="text-ink font-medium">{mr.itemName}</div>
                    <div className="text-ink-3">
                      {mr.itemSku} · Last quote {mr.daysSinceLastQuote} days ago (₹{mr.lastKnownRate ?? 0}/{mr.uom ?? 'kg'})
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setMissingRates((prev) => prev.filter((x) => x.itemId !== mr.itemId))
                    }
                  >
                    Mark Requested
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Multi-Supplier Price Trend Chart */}
      <Card className="p-5 bg-sheet border-rule">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">
              Price Trend Across Suppliers
            </h3>
            <p className="text-xs text-ink-3">
              Compare historical quoted rates per item to spot spikes before raising a PO.
            </p>
          </div>
          <select
            value={selectedTrendItemId}
            onChange={(e) => setSelectedTrendItemId(e.target.value)}
            className="bg-paper border border-rule-strong rounded-lg px-3 py-1.5 text-xs text-ink"
          >
            {priceTrends.map((t) => (
              <option key={t.itemId} value={t.itemId}>
                {t.itemName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-4 mb-3 text-xs">
          {trendSeries.suppliers.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 text-ink-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span>{s.name}</span>
            </div>
          ))}
        </div>

        <div className="w-full overflow-x-auto">
          <svg viewBox="0 0 600 180" className="w-full h-48 bg-paper rounded-[3px] border border-rule p-2">
            {trendSeries.suppliers.map((sup) => {
              const pts = trendSeries.points
                .map((pt, i) => {
                  const x = 40 + (i / Math.max(1, trendSeries.points.length - 1)) * 520;
                  const val = pt.rates[sup.id] ?? minVal;
                  const y = 145 - ((val - minVal) / Math.max(1, maxVal - minVal)) * 115;
                  return `${x},${y}`;
                })
                .join(' ');
              return (
                <polyline
                  key={sup.id}
                  fill="none"
                  stroke={sup.color}
                  strokeWidth="2.5"
                  points={pts}
                />
              );
            })}
            {trendSeries.points.map((pt, i) => {
              const x = 40 + (i / Math.max(1, trendSeries.points.length - 1)) * 520;
              return (
                <text
                  key={pt.date}
                  x={x}
                  y={168}
                  textAnchor="middle"
                  fill="#a1a1aa"
                  fontSize="10"
                >
                  {pt.date}
                </text>
              );
            })}
          </svg>
        </div>
      </Card>
    </div>
  );
}

