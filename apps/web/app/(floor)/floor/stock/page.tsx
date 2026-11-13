'use client';

import React, { useState } from 'react';
import { classifyExpiryBucket } from '@neo/shared';
import { INITIAL_STOCK_ROWS } from '../../../../src/lib/inventory-data';

export default function FloorCheckStockPage() {
  const [query, setQuery] = useState('');

  const filtered = INITIAL_STOCK_ROWS.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      r.itemName.toLowerCase().includes(q) ||
      r.sku.toLowerCase().includes(q) ||
      r.batchNo.toLowerCase().includes(q) ||
      r.locationCode.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <h1 className="text-2xl font-bold text-white">Check Stock (Quantities Only)</h1>
        <input
          type="text"
          placeholder="Search or scan item, SKU, batch, or bin..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full min-h-[56px] bg-zinc-950 border border-zinc-700 rounded-xl px-4 text-lg text-white"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((row) => {
          const exp = classifyExpiryBucket(row.daysToExpiry);
          const colorCls =
            exp.color === 'rose'
              ? 'border-rose-500/50 bg-rose-950/20 text-rose-300'
              : exp.color === 'amber'
                ? 'border-amber-500/50 bg-amber-950/20 text-amber-300'
                : 'border-emerald-500/40 bg-emerald-950/15 text-emerald-300';
          return (
            <div
              key={row.id}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4"
            >
              <div>
                <div className="text-xl font-bold text-white">{row.itemName}</div>
                <div className="text-sm text-zinc-400">
                  {row.siteName} · Bin <strong className="text-white">{row.locationCode}</strong> · Batch{' '}
                  <span className="font-mono text-amber-400">{row.batchNo}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-mono text-2xl font-black text-white">
                    {row.onHand} {row.uom}
                  </div>
                  <div className="text-xs text-zinc-400">{row.altUomLabel}</div>
                </div>
                <span className={`px-3 py-2 rounded-xl border text-sm font-bold ${colorCls}`}>
                  {exp.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

