'use client';

import React, { useEffect, useState } from 'react';
import { classifyExpiryBucket } from '@neo/shared';

interface StockBatchRow {
  id: string;
  itemId: string;
  itemName: string;
  sku: string;
  batchNo: string;
  siteId: string;
  siteName: string;
  locationCode: string;
  uom: string;
  altUomLabel: string;
  onHand: number;
  committed: number;
  available: number;
  expiryDate: string;
  daysToExpiry: number;
}

export default function FloorCheckStockPage() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<StockBatchRow[]>([]);

  useEffect(() => {
    fetch('/api/proxy/inventory/stock/current')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setRows(
          list.map((b: any) => ({
            id: String(b.id ?? b.batchId ?? ''),
            itemId: b.item_id ?? b.itemId ?? '',
            itemName: b.item_name ?? b.itemName ?? 'Item',
            sku: b.sku_code ?? b.skuCode ?? b.sku ?? '',
            batchNo: b.batch_number ?? b.batchNumber ?? b.batchNo ?? '',
            siteId: b.site_id ?? b.siteId ?? '',
            siteName: b.site_name ?? b.siteName ?? 'Site',
            locationCode: b.location_name ?? b.locationName ?? b.locationCode ?? 'WH',
            uom: b.uom ?? 'KG',
            altUomLabel: b.altUomLabel ?? '',
            onHand: Number(b.qtyOnHand ?? b.qty_on_hand ?? b.onHand ?? 0),
            committed: Number(b.qtyCommitted ?? b.qty_committed ?? b.committed ?? 0),
            available: Number(b.qtyAvailable ?? b.qty_available ?? b.available ?? 0),
            daysToExpiry:
              b.daysToExpiry ??
              (b.expiryDate || b.expiry_date
                ? Math.ceil(
                    (new Date(b.expiryDate ?? b.expiry_date).getTime() - Date.now()) /
                      86_400_000,
                  )
                : 30),
            expiryDate: b.expiry_date ?? b.expiryDate ?? '',
            landedCostPerUnit: Number(b.landed_cost_per_unit ?? 0),
            status: b.status ?? 'AVAILABLE',
          })),
        );
      })
      .catch(() => setRows([]));
  }, []);

  const filtered = rows.filter((r) => {
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

