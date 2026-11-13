'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Badge } from '@neo/ui';
import { INITIAL_LEDGER_ENTRIES, type LedgerEntry } from '../../../src/lib/inventory-data';

export default function StockLedgerExplorerPage() {
  const [entries] = useState<LedgerEntry[]>(INITIAL_LEDGER_ENTRIES);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (typeFilter !== 'ALL' && e.type !== typeFilter) return false;
      if (
        search.trim() &&
        !e.itemName.toLowerCase().includes(search.toLowerCase()) &&
        !e.refNo.toLowerCase().includes(search.toLowerCase()) &&
        !e.batchNo.toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [entries, typeFilter, search]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
          <Link href="/inventory/stock" className="hover:text-white">Inventory</Link>
          <span>/</span>
          <span className="text-amber-400">Stock Movements Ledger</span>
        </div>
        <h1 className="text-2xl font-bold text-white">Stock Movements Ledger (Append-Only)</h1>
        <p className="text-sm text-zinc-400">
          Immutable audit trail of all stock movements with running balance and reversal links.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
        <div className="flex flex-wrap gap-1.5">
          {['ALL', 'GRN', 'SALE', 'TRANSFER', 'ADJUSTMENT', 'REVERSAL'].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                typeFilter === t
                  ? 'bg-amber-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Filter item, batch, or ref..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white w-64"
        />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm" data-testid="append-only-ledger">
          <thead className="bg-zinc-950/80 border-b border-zinc-800 text-xs uppercase text-zinc-400">
            <tr>
              <th className="p-3">Timestamp</th>
              <th className="p-3">Item &amp; Batch</th>
              <th className="p-3">Site</th>
              <th className="p-3">Type &amp; Ref</th>
              <th className="p-3 text-right">Qty Δ</th>
              <th className="p-3 text-right">Running Balance</th>
              <th className="p-3">Audit Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {filtered.map((row) => (
              <tr key={row.id} className="hover:bg-zinc-800/40">
                <td className="p-3 font-mono text-xs text-zinc-400">{row.timestamp}</td>
                <td className="p-3">
                  <div className="text-white font-medium">{row.itemName}</div>
                  <div className="text-[11px] font-mono text-zinc-500">{row.batchNo}</div>
                </td>
                <td className="p-3 text-xs text-zinc-300">{row.siteName}</td>
                <td className="p-3">
                  <Badge variant={row.type === 'REVERSAL' ? 'warning' : 'info'}>{row.type}</Badge>
                  <div className="text-[11px] font-mono text-zinc-400 mt-1">{row.refNo}</div>
                </td>
                <td
                  className={`p-3 text-right font-mono font-bold ${
                    row.qtyDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {row.qtyDelta > 0 ? `+${row.qtyDelta}` : row.qtyDelta} {row.uom}
                </td>
                <td className="p-3 text-right font-mono font-semibold text-white">
                  {row.runningBalance} {row.uom}
                </td>
                <td className="p-3 text-xs">
                  {row.reversedById && (
                    <span className="text-amber-400 font-mono">
                      Reversed by {row.reversedById}
                    </span>
                  )}
                  {row.reversesId && (
                    <span className="text-sky-400 font-mono">
                      Reverses {row.reversesId}
                    </span>
                  )}
                  {!row.reversedById && !row.reversesId && (
                    <span className="text-zinc-600">Immutable</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

