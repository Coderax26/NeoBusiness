'use client';

import React, { useEffect, useState } from 'react';
import { type TransferRecord } from '../../../../src/lib/inventory-data';
import { useFloorOutbox } from '../../../../src/lib/floor-outbox';

export default function FloorTransfersPage() {
  const { enqueueOrSend } = useFloorOutbox();
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/proxy/inventory/transfers')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setTransfers(
          list.map((t: any) => ({
            id: t.id,
            transferNo: t.transfer_no ?? t.transferNo ?? t.id.slice(0, 8),
            itemName: t.item_name ?? t.itemName ?? 'Stock Transfer',
            fromSite: t.from_site_name ?? t.fromSite ?? 'Source',
            toSite: t.to_site_name ?? t.toSite ?? 'Destination',
            batchNo: t.batch_number ?? t.batchNo ?? '-',
            qty: Number(t.qty ?? 0),
            uom: t.uom ?? 'KG',
            status: t.status ?? 'DRAFT',
            createdAt: t.created_at ?? '',
          })),
        );
      })
      .catch(() => setTransfers([]));
  }, []);

  const handleAction = async (trf: TransferRecord, action: 'dispatch' | 'receive') => {
    const res = await enqueueOrSend({
      type: 'TRANSFER_RECEIVE',
      endpoint: `/api/bff/inventory/transfers/${trf.id}/${action}`,
      payload: { transferId: trf.id, qty: trf.qty },
    });
    setTransfers((prev) =>
      prev.map((t) =>
        t.id === trf.id
          ? { ...t, status: action === 'dispatch' ? 'DISPATCHED' : 'RECEIVED' }
          : t,
      ),
    );
    setBanner(`${trf.transferNo} ${action}ed. ${res.message}`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h1 className="text-2xl font-bold text-white">Transfers Send / Receive</h1>
        <p className="text-base text-zinc-400">
          Tap a transfer to dispatch outgoing stock or confirm incoming stock (works offline).
        </p>
      </div>

      {banner && (
        <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold">
          {banner}
        </div>
      )}

      <div className="space-y-4">
        {transfers.map((trf) => (
          <div
            key={trf.id}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div>
              <div className="text-sm font-mono text-amber-400 font-bold">
                {trf.transferNo} · {trf.status}
              </div>
              <div className="text-xl font-bold text-white mt-1">{trf.itemName}</div>
              <div className="text-sm text-zinc-400">
                {trf.fromSite} → {trf.toSite} · Batch {trf.batchNo} · {trf.qty} {trf.uom}
              </div>
            </div>

            {trf.status === 'DRAFT' && (
              <button
                onClick={() => handleAction(trf, 'dispatch')}
                className="min-h-[56px] px-6 rounded-xl bg-sky-500 text-zinc-950 font-bold text-lg"
              >
                Dispatch Out
              </button>
            )}
            {trf.status === 'DISPATCHED' && (
              <button
                onClick={() => handleAction(trf, 'receive')}
                className="min-h-[56px] px-6 rounded-xl bg-emerald-500 text-zinc-950 font-bold text-lg"
              >
                Confirm Receive
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

