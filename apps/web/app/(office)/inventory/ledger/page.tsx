'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@neo/ui';
import { type LedgerEntry } from '../../../../src/lib/inventory-data';

export default function StockLedgerExplorerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/inventory/ledger')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        // Compute chronological running balance per item from oldest to newest, then preserve newest-first order
        const parsedRows = rows.map((row: any) => {
          const txn = String(row.txnType || row.txn_type || row.type || 'ADJUSTMENT').toUpperCase();
          const mappedType: LedgerEntry['type'] =
            txn === 'RECEIPT'
              ? 'GRN'
              : txn === 'SALE_DISPATCH'
                ? 'SALE'
                : txn === 'TRANSFER_IN' || txn === 'TRANSFER_OUT'
                  ? 'TRANSFER'
                  : txn === 'PROD_OUTPUT'
                    ? 'PRODUCTION_IN'
                    : txn === 'PROD_CONSUME'
                      ? 'PRODUCTION_OUT'
                      : txn === 'REVERSAL'
                        ? 'REVERSAL'
                        : 'ADJUSTMENT';
          const rawQty = Number(row.qtyDelta ?? row.qty ?? 0);
          const isOutflow = [
            'SALE_DISPATCH',
            'TRANSFER_OUT',
            'ADJUSTMENT',
            'WRITEOFF',
            'EXPIRY_REMOVAL',
            'SHRINKAGE',
            'PROD_CONSUME',
            'COUNT_DEFICIT',
          ].includes(txn);
          const isNonStockHold = txn === 'RESERVATION' || txn === 'RELEASE';
          const qtyDelta =
            row.qtyDelta !== undefined
              ? rawQty
              : isNonStockHold
                ? 0
                : isOutflow
                  ? -Math.abs(rawQty)
                  : Math.abs(rawQty);
          return {
            id: String(row.id),
            timestamp: String(row.timestamp || row.postedAt || row.posted_at || '').slice(0, 19).replace('T', ' '),
            itemId: String(row.itemId || row.item_id || ''),
            itemName: String(row.itemName || row.item_name || 'Item'),
            batchNo: String(row.batchNo || row.batchNumber || row.batch_id || ''),
            siteName: String(row.siteName || row.site_name || 'Main Site'),
            type: mappedType,
            qtyDelta,
            runningBalance: Number(row.runningBalance ?? 0),
            uom: String(row.uom || 'KG'),
            refNo: String(row.refNo || row.referenceNo || row.reference_no || ''),
            reversesId: row.reversesId || row.reversesTxnId || row.reverses_txn_id || undefined,
          };
        });
        const balByItem = new Map<string, number>();
        for (let idx = parsedRows.length - 1; idx >= 0; idx--) {
          const item = parsedRows[idx];
          const next = (balByItem.get(item.itemId) ?? 0) + item.qtyDelta;
          balByItem.set(item.itemId, next);
          item.runningBalance = Number(next.toFixed(3));
        }
        setEntries(parsedRows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (typeFilter !== 'ALL' && e.type !== typeFilter) return false;
      if (
        q &&
        !(e.itemName || '').toLowerCase().includes(q) &&
        !(e.refNo || '').toLowerCase().includes(q) &&
        !(e.batchNo || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [entries, typeFilter, search]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
          <Link href="/inventory/stock" className="hover:text-ink">Inventory</Link>
          <span>/</span>
          <span className="text-haldi">Stock Movements Ledger</span>
        </div>
        <h1 className="text-2xl font-bold text-ink">Stock Movements Ledger (Append-Only)</h1>
        <p className="text-sm text-ink-3">
          Immutable audit trail of all stock movements with running balance and reversal links.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 bg-sheet border border-rule rounded-[3px] p-3">
        <div className="flex flex-wrap gap-1.5">
          {['ALL', 'GRN', 'SALE', 'TRANSFER', 'ADJUSTMENT', 'REVERSAL'].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                typeFilter === t
                  ? 'bg-haldi text-white'
                  : 'bg-sunken text-ink-3 hover:text-ink'
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
          className="bg-paper border border-rule-strong rounded-lg px-3 py-1.5 text-xs text-ink w-64"
        />
      </div>

      <div className="bg-sheet border border-rule rounded-[3px] overflow-hidden">
        <table className="w-full text-left text-sm" data-testid="append-only-ledger">
          <thead className="bg-paper border-b border-rule text-xs uppercase text-ink-3">
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
          <tbody className="divide-y divide-rule">
            {filtered.map((row) => (
              <tr key={row.id} className="hover:bg-sunken">
                <td className="p-3 font-mono text-xs text-ink-3">{row.timestamp}</td>
                <td className="p-3">
                  <div className="text-ink font-medium">{row.itemName}</div>
                  <div className="text-[11px] font-mono text-ink-3">{row.batchNo}</div>
                </td>
                <td className="p-3 text-xs text-ink-2">{row.siteName}</td>
                <td className="p-3">
                  <Badge variant={row.type === 'REVERSAL' ? 'warning' : 'info'}>{row.type}</Badge>
                  <div className="text-[11px] font-mono text-ink-3 mt-1">{row.refNo}</div>
                </td>
                <td
                  className={`p-3 text-right font-mono font-bold ${
                    row.qtyDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {row.qtyDelta > 0 ? `+${row.qtyDelta}` : row.qtyDelta} {row.uom}
                </td>
                <td className="p-3 text-right font-mono font-semibold text-ink">
                  {row.runningBalance} {row.uom}
                </td>
                <td className="p-3 text-xs">
                  {row.reversedById && (
                    <span className="text-haldi font-mono">
                      Reversed by {row.reversedById}
                    </span>
                  )}
                  {row.reversesId && (
                    <span className="text-action font-mono">
                      Reverses {row.reversesId}
                    </span>
                  )}
                  {!row.reversedById && !row.reversesId && (
                    <span className="text-ink-3">Immutable</span>
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

