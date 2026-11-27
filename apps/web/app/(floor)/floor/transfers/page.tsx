'use client';

import React, { useEffect, useState } from 'react';
import { type TransferRecord } from '../../../../src/lib/inventory-data';
import { useFloorOutbox } from '../../../../src/lib/floor-outbox';

export default function FloorTransfersPage() {
  const { enqueueOrSend } = useFloorOutbox();
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [banner, setBanner] = useState<{ text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/proxy/inventory/transfers')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setTransfers(
          list.map((t: any) => {
            const st = String(t.status ?? 'DRAFT').toUpperCase();
            return {
              id: String(t.id),
              transferNo: t.transfer_no ?? t.transferNo ?? String(t.id).slice(0, 8),
              itemName: t.item_name ?? t.itemName ?? 'Stock Transfer',
              fromSite: t.from_site_name ?? t.fromSite ?? 'Source',
              toSite: t.to_site_name ?? t.toSite ?? 'Destination',
              batchNo: t.batch_number ?? t.batchNo ?? '-',
              qty: Number(t.qty ?? t.requested_qty ?? 0),
              uom: t.uom ?? 'KG',
              status: st === 'RESERVED' ? 'DRAFT' : st === 'IN_TRANSIT' ? 'DISPATCHED' : st,
              createdAt: t.created_at ?? '',
              rawLines: Array.isArray(t.lines) ? t.lines : [],
            };
          }),
        );
      })
      .catch(() => setTransfers([]));
  }, []);

  const handleAction = async (trf: TransferRecord & { rawLines?: any[] }, action: 'dispatch' | 'receive') => {
    const payload =
      action === 'receive'
        ? {
            lines: (trf.rawLines || []).map((l: any) => ({
              lineId: String(l.id),
              receivedQty: String(l.dispatched_qty || l.requested_qty || trf.qty),
            })),
          }
        : {};
    const res = await enqueueOrSend({
      type: 'TRANSFER_RECEIVE',
      endpoint: `/api/proxy/inventory/transfers/${trf.id}/${action}`,
      payload,
    });
    if (!res.ok && !res.queued) {
      setBanner({ text: `${trf.transferNo} ${action} failed: ${res.message}`, isError: true });
      return;
    }
    setTransfers((prev) =>
      prev.map((t) =>
        t.id === trf.id
          ? { ...t, status: action === 'dispatch' ? 'DISPATCHED' : 'RECEIVED' }
          : t,
      ),
    );
    setBanner({ text: `${trf.transferNo} ${action}ed. ${res.message}`, isError: false });
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

