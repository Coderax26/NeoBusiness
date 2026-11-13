'use client';

import React, { useState } from 'react';
import { INITIAL_STOCK_ROWS } from '../../../../src/lib/inventory-data';
import { useFloorOutbox } from '../../../../src/lib/floor-outbox';

const REASONS = [
  { key: 'DAMAGE', label: 'Damaged' },
  { key: 'EXPIRY', label: 'Expired' },
  { key: 'SPILLAGE', label: 'Spillage' },
  { key: 'COUNT_DIFFERENCE', label: 'Count Diff' },
] as const;

export default function FloorAdjustmentsPage() {
  const { enqueueOrSend } = useFloorOutbox();
  const [rowId, setRowId] = useState(INITIAL_STOCK_ROWS[0].id);
  const [qty, setQty] = useState(5);
  const [reason, setReason] = useState<string>('DAMAGE');
  const [photoName, setPhotoName] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  const selected = INITIAL_STOCK_ROWS.find((r) => r.id === rowId) || INITIAL_STOCK_ROWS[0];

  const handleSubmit = async () => {
    const res = await enqueueOrSend({
      type: 'ADJUSTMENT_REQUEST',
      endpoint: '/api/bff/inventory/adjustments',
      payload: {
        itemId: selected.itemId,
        batchNo: selected.batchNo,
        qtyDelta: -Math.abs(qty),
        reason,
        photoName,
      },
    });
    setBanner(`Adjustment request for ${selected.itemName} submitted! ${res.message}`);
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
        <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold">
          {banner}
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
            {INITIAL_STOCK_ROWS.map((r) => (
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
              3. Quantity ({selected.uom})
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

