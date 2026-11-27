'use client';

import React, { useEffect, useState } from 'react';
import { useFloorOutbox } from '../../../../src/lib/floor-outbox';

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

const REASONS = [
  { key: 'DAMAGE', label: 'Damaged' },
  { key: 'EXPIRY', label: 'Expired' },
  { key: 'SPILLAGE', label: 'Spillage' },
  { key: 'COUNT_DIFFERENCE', label: 'Count Diff' },
] as const;

export default function FloorAdjustmentsPage() {
  const { enqueueOrSend } = useFloorOutbox();
  const [rows, setRows] = useState<StockBatchRow[]>([]);
  const [rowId, setRowId] = useState('');
  const [qty, setQty] = useState(5);
  const [reason, setReason] = useState<string>('DAMAGE');
  const [photoName, setPhotoName] = useState('');
  const [banner, setBanner] = useState<{ text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/proxy/inventory/stock/current')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const mapped: StockBatchRow[] = list.map((b: any) => ({
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
        }));
        setRows(mapped);
        if (mapped.length > 0) setRowId(mapped[0].id);
      })
      .catch(() => setRows([]));
  }, []);

  const selected = rows.find((r) => r.id === rowId) || rows[0];

  const handleSubmit = async () => {
    if (!selected) return;
    const res = await enqueueOrSend({
      type: 'ADJUSTMENT_REQUEST',
      endpoint: '/api/proxy/inventory/adjustments',
      payload: {
        siteId: selected.siteId,
        itemId: selected.itemId,
        ...(selected.id ? { batchId: selected.id } : {}),
        adjustmentType:
          reason === 'SPILLAGE'
            ? 'SHRINKAGE'
            : reason === 'EXPIRY'
              ? 'EXPIRY_REMOVAL'
              : 'WRITEOFF',
        qty: String(Math.abs(qty)),
        remarks: `Floor report (${reason}) batch ${selected.batchNo}${photoName ? ` photo:${photoName}` : ''}`,
      },
    });
    if (!res.ok && !res.queued) {
      setBanner({ text: `Adjustment rejected: ${res.message}`, isError: true });
      return;
    }
    setBanner({
      text: `Adjustment request for ${selected.itemName} submitted! ${res.message}`,
      isError: false,
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h1 className="text-2xl font-bold text-white">Report Damage / Stock Adjustment</h1>
        <p className="text-base text-zinc-400">
          This needs approval because it changes stock value.
        </p>
      </div>

      {banner && (
        <div
          className={`p-4 rounded-xl border font-semibold ${
            banner.isError
              ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
              : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5">
        <div>
          <label className="block text-sm text-zinc-400 mb-2">1. Pick Item &amp; Batch</label>
          <select
            value={rowId}
            onChange={(e) => setRowId(e.target.value)}
            className="w-full min-h-[56px] bg-zinc-950 border border-zinc-700 rounded-xl px-4 text-lg text-white"
          >
            {rows.length === 0 && <option value="">No active stock batches found</option>}
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.itemName} — {r.batchNo} ({r.siteName})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-2">2. Reason</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {REASONS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setReason(r.key)}
                className={`min-h-[56px] rounded-xl border font-bold text-base ${
                  reason === r.key
                    ? 'bg-amber-500 text-zinc-950 border-amber-400'
                    : 'bg-zinc-950 text-zinc-300 border-zinc-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">
              3. Quantity ({selected?.uom ?? 'KG'})
            </label>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="w-full min-h-[56px] bg-zinc-950 border border-zinc-700 rounded-xl px-4 text-xl font-mono text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-2">4. Photo</label>
            <label className="w-full min-h-[56px] px-4 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-semibold flex items-center cursor-pointer">
              📷 {photoName || 'Attach Photo'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setPhotoName(e.target.files?.[0]?.name || '')}
              />
            </label>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          className="w-full min-h-[60px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xl"
        >
          SUBMIT FOR APPROVAL
        </button>
      </div>
    </div>
  );
}

