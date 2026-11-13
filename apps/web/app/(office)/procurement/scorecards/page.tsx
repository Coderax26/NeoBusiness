'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card } from '@neo/ui';
import { formatINR } from '@neo/shared';
import {
  INITIAL_SUPPLIER_SCORECARDS,
  INITIAL_MISSING_RATES,
  INITIAL_PRICE_TRENDS,
  type SupplierScorecardRow,
} from '../../../src/lib/procurement-data';

export default function SupplierScorecardsPage() {
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierScorecardRow>(
    INITIAL_SUPPLIER_SCORECARDS[0],
  );
  const [selectedTrendItemId, setSelectedTrendItemId] = useState(
    INITIAL_PRICE_TRENDS[0].itemId,
  );
  const [missingRates, setMissingRates] = useState(INITIAL_MISSING_RATES);

  const trendSeries =
    INITIAL_PRICE_TRENDS.find((t) => t.itemId === selectedTrendItemId) ||
    INITIAL_PRICE_TRENDS[0];

  const allValues = trendSeries.points.flatMap((pt) => Object.values(pt.rates));
  const minVal = Math.min(...allValues) - 2;
  const maxVal = Math.max(...allValues) + 2;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
            <Link href="/procurement" className="hover:text-white">Procurement</Link>
            <span>/</span>
            <span className="text-indigo-400">Scorecards &amp; Rate Monitoring</span>
          </div>
          <h1 className="text-2xl font-bold text-white">
            Supplier Scorecards &amp; Rate Monitoring
          </h1>
          <p className="text-sm text-zinc-400">
            Track fill rate, on-time delivery, price variance %, missing-rate alerts, and multi-supplier price trends.
          </p>
        </div>

        <Link href="/procurement/suppliers">
          <Button variant="secondary">Manage Suppliers &amp; Rates →</Button>
        </Link>
      </div>

      {/* Supplier Ranking Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Supplier Performance Ranking</h2>
          <span className="text-xs text-zinc-400">Click any supplier to drill down</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950/80 border-b border-zinc-800 text-xs uppercase text-zinc-400">
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
            <tbody className="divide-y divide-zinc-800/70">
              {INITIAL_SUPPLIER_SCORECARDS.map((row, idx) => (
                <tr
                  key={row.supplierId}
                  onClick={() => setSelectedSupplier(row)}
                  className={`hover:bg-zinc-800/40 cursor-pointer ${
                    selectedSupplier.supplierId === row.supplierId ? 'bg-indigo-500/10' : ''
                  }`}
                >
                  <td className="p-3 font-mono text-xs text-zinc-400">#{idx + 1}</td>
                  <td className="p-3">
                    <div className="text-white font-medium">{row.name}</div>
                    <div className="text-[11px] font-mono text-zinc-500">{row.code}</div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${row.fillRatePct}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-emerald-400">
                        {row.fillRatePct}%
                      </span>
                    </div>
                  </td>
                  <td className="p-3 font-mono text-xs text-zinc-200">{row.onTimePct}%</td>
                  <td className="p-3 text-right font-mono text-xs">
                    <span
                      className={
                        row.avgPriceVariancePct > 3 ? 'text-amber-400' : 'text-emerald-400'
                      }
                    >
                      +{row.avgPriceVariancePct}%
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono text-xs text-zinc-300">
                    {row.poCount} / {row.grnCount}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-indigo-400">
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
        <Card className="p-5 bg-zinc-900 border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">
              Supplier Drill-Down: {selectedSupplier.name}
            </h3>
            <Badge variant="info">{selectedSupplier.code}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-400">Monthly Spend</span>
              <div className="text-lg font-bold text-white font-mono mt-1">
                {formatINR(selectedSupplier.monthlySpend)}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-400">Reliability Score</span>
              <div className="text-lg font-bold text-indigo-400 font-mono mt-1">
                {selectedSupplier.reliabilityScore} / 5.0
              </div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-400">Fill Rate</span>
              <div className="text-lg font-bold text-emerald-400 font-mono mt-1">
                {selectedSupplier.fillRatePct}%
              </div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-400">Avg Price Variance</span>
              <div className="text-lg font-bold text-amber-400 font-mono mt-1">
                +{selectedSupplier.avgPriceVariancePct}%
              </div>
            </div>
          </div>
        </Card>

        {/* Missing Rates Alert List */}
        <Card className="p-5 bg-zinc-900 border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Missing Rates Alerts</h3>
            <Badge variant="warning">{missingRates.length} items</Badge>
          </div>
          <div className="space-y-2">
            {missingRates.length === 0 ? (
              <p className="text-xs text-emerald-400">All active items have current supplier quotes.</p>
            ) : (
              missingRates.map((mr) => (
                <div
                  key={mr.itemId}
                  className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="text-white font-medium">{mr.itemName}</div>
                    <div className="text-zinc-500">
                      {mr.itemSku} · Last quote {mr.daysSinceLastQuote} days ago (₹{mr.lastKnownRate}/{mr.uom})
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
      <Card className="p-5 bg-zinc-900 border-zinc-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Price Trend Across Suppliers
            </h3>
            <p className="text-xs text-zinc-400">
              Compare historical quoted rates per item to spot spikes before raising a PO.
            </p>
          </div>
          <select
            value={selectedTrendItemId}
            onChange={(e) => setSelectedTrendItemId(e.target.value)}
            className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white"
          >
            {INITIAL_PRICE_TRENDS.map((t) => (
              <option key={t.itemId} value={t.itemId}>
                {t.itemName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-4 mb-3 text-xs">
          {trendSeries.suppliers.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 text-zinc-300">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span>{s.name}</span>
            </div>
          ))}
        </div>

        <div className="w-full overflow-x-auto">
          <svg viewBox="0 0 600 180" className="w-full h-48 bg-zinc-950 rounded-xl border border-zinc-800 p-2">
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

