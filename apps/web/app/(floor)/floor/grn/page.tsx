'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { maskGrnForBlindView } from '@neo/shared';
import { NumericKeypad } from '@neo/ui';
import { INITIAL_FLOOR_EXPECTED_POS } from '../../../../src/lib/inventory-data';
import { useFloorOutbox } from '../../../../src/lib/floor-outbox';

export default function FloorBlindGrnPage() {
  const { enqueueOrSend } = useFloorOutbox();
  const [selectedPoId, setSelectedPoId] = useState<string>(INITIAL_FLOOR_EXPECTED_POS[0].poId);
  const selectedPo =
    INITIAL_FLOOR_EXPECTED_POS.find((p) => p.poId === selectedPoId) ||
    INITIAL_FLOOR_EXPECTED_POS[0];

  // BR-05: Strip orderedQty and unitPrice immediately before rendering
  const blindLines = useMemo(
    () =>
      maskGrnForBlindView(
        selectedPo.lines.map((l) => ({
          lineId: l.lineId,
          itemId: l.itemId,
          itemSku: l.itemSku,
          itemName: l.itemName,
          uom: l.uom,
          orderedQty: l.orderedQty,
          unitPrice: l.unitPrice,
          receivedQty: 0,
        })),
      ),
    [selectedPo],
  );

  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [batches, setBatches] = useState<Record<string, string>>({});
  const [expiries, setExpiries] = useState<Record<string, string>>({
    'fpol-1': '2027-02-11',
    'fpol-2': '2027-11-13',
  });
  const [damaged, setDamaged] = useState<Record<string, boolean>>({});
  const [photoName, setPhotoName] = useState('');
  const [notes, setNotes] = useState('');
  const [keypadLineId, setKeypadLineId] = useState<string | null>(null);
  const [keypadValue, setKeypadValue] = useState('0');
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const handleSaveReceipt = async () => {
    const payload = {
      poId: selectedPo.poId,
      poNumber: selectedPo.poNumber,
      notes,
      photoName,
      lines: blindLines.map((l) => ({
        lineId: l.lineId,
        itemId: l.itemId,
        receivedQty: qtys[l.lineId] ?? 0,
        batchNo: batches[l.lineId] || `B-${Date.now().toString().slice(-4)}`,
        expiryDate: expiries[l.lineId] || '2027-02-11',
        damaged: !!damaged[l.lineId],
      })),
    };

    const res = await enqueueOrSend({
      type: 'GRN_CAPTURE',
      endpoint: '/api/bff/procurement/grns',
      payload,
    });
    setSavedBanner(res.message);
  };

  if (savedBanner) {
    return (
      <div className="bg-zinc-900 border border-emerald-500/40 rounded-2xl p-8 text-center space-y-5">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-400 text-4xl font-black flex items-center justify-center mx-auto">
          ✓
        </div>
        <h2 className="text-2xl font-bold text-white">Receipt Saved</h2>
        <p className="text-base text-emerald-300">{savedBanner}</p>
        <div className="flex flex-wrap justify-center gap-4 pt-2">
          <button
            onClick={() => {
              setSavedBanner(null);
              setQtys({});
            }}
            className="min-h-[56px] px-8 rounded-xl bg-amber-500 text-zinc-950 font-bold text-lg"
          >
            Next Delivery
          </button>
          <Link
            href="/floor"
            className="min-h-[56px] px-8 rounded-xl bg-zinc-800 text-white font-bold text-lg flex items-center"
          >
            Floor Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="floor-blind-grn">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Receive Goods (Blind GRN)</h1>
          <p className="text-base text-zinc-400">
            Supplier: <strong className="text-white">{selectedPo.supplierName}</strong> · PO:{' '}
            <strong className="text-amber-400 font-mono">{selectedPo.poNumber}</strong> · Vehicle:{' '}
            {selectedPo.vehicleNo}
          </p>
        </div>
        <select
          value={selectedPoId}
          onChange={(e) => setSelectedPoId(e.target.value)}
          className="min-h-[56px] bg-zinc-950 border border-zinc-700 rounded-xl px-4 text-base text-white"
        >
          {INITIAL_FLOOR_EXPECTED_POS.map((po) => (
            <option key={po.poId} value={po.poId}>
              {po.poNumber} — {po.supplierName}
            </option>
          ))}
        </select>
      </div>

      {/* Item Lines — strictly NO ordered qty or unit price */}
      <div className="space-y-4">
        {blindLines.map((line) => (
          <div
            key={line.lineId}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xl font-bold text-white">{line.itemName}</div>
                <div className="text-sm font-mono text-zinc-400">{line.itemSku}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setKeypadLineId(line.lineId);
                  setKeypadValue(String(qtys[line.lineId] ?? 0));
                }}
                className="min-h-[56px] min-w-[160px] px-5 rounded-xl bg-zinc-950 border-2 border-amber-500/60 text-white font-mono text-2xl font-bold"
              >
                {qtys[line.lineId] ?? 0} {line.uom}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Batch No."
                value={batches[line.lineId] || ''}
                onChange={(e) =>
                  setBatches((prev) => ({ ...prev, [line.lineId]: e.target.value }))
                }
                className="min-h-[56px] bg-zinc-950 border border-zinc-700 rounded-xl px-4 text-base text-white"
              />
              <input
                type="date"
                value={expiries[line.lineId] || ''}
                onChange={(e) =>
                  setExpiries((prev) => ({ ...prev, [line.lineId]: e.target.value }))
                }
                className="min-h-[56px] bg-zinc-950 border border-zinc-700 rounded-xl px-4 text-base text-white"
              />
              <button
                type="button"
                onClick={() =>
                  setDamaged((prev) => ({ ...prev, [line.lineId]: !prev[line.lineId] }))
                }
                className={`min-h-[56px] rounded-xl border font-bold text-base ${
                  damaged[line.lineId]
                    ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                    : 'bg-zinc-950 border-zinc-700 text-zinc-300'
                }`}
              >
                {damaged[line.lineId] ? '⚠ Damage Flagged' : 'Mark Damaged'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Photo & Notes + Save Receipt */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3 items-center">
          <label className="min-h-[56px] px-5 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-semibold flex items-center cursor-pointer">
            📷 {photoName || 'Photo of Delivery Note'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPhotoName(e.target.files?.[0]?.name || '')}
            />
          </label>
          <input
            type="text"
            placeholder="Notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[56px] bg-zinc-950 border border-zinc-700 rounded-xl px-4 text-base text-white"
          />
        </div>

        <button
          type="button"
          onClick={handleSaveReceipt}
          className="min-h-[56px] px-8 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-lg"
        >
          ✓ SAVE RECEIPT
        </button>
      </div>

      {keypadLineId && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div className="text-lg font-bold text-white">Enter Received Quantity</div>
            <NumericKeypad
              value={keypadValue}
              onChange={setKeypadValue}
              onSubmit={() => {
                setQtys((prev) => ({
                  ...prev,
                  [keypadLineId]: Number(keypadValue) || 0,
                }));
                setKeypadLineId(null);
              }}
              submitLabel="Set Qty"
            />
          </div>
        </div>
      )}
    </div>
  );
}

