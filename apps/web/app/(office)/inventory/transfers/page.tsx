'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, StatusPill, Dialog } from '@neo/ui';
import {
  type TransferRecord,
  type StockRow,
} from '../../../../src/lib/inventory-data';

export default function InventoryTransfersPage() {
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [toSite, setToSite] = useState('Baramati Plant');
  const [qty, setQty] = useState(200);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/proxy/inventory/transfers').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/inventory/stock/current').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([trfRes, stkRes]) => {
        if (!active) return;
        const tRows = Array.isArray(trfRes) ? trfRes : Array.isArray(trfRes?.data) ? trfRes.data : [];
        const sRows = Array.isArray(stkRes) ? stkRes : Array.isArray(stkRes?.data) ? stkRes.data : [];
        setTransfers(tRows);
        setStockRows(sRows);
        if (sRows.length > 0) setSelectedBatchId(String(sRows[0].id));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const filtered = transfers.filter((t) =>
    statusFilter === 'ALL' ? true : t.status === statusFilter,
  );

  const handleCreate = () => {
    const src = stockRows.find((r) => r.id === selectedBatchId) || stockRows[0];
    if (!src) return;
    const created: TransferRecord = {
      id: `trf-${Date.now()}`,
      transferNo: `TRF-2026-0${Math.floor(20 + Math.random() * 79)}`,
      fromSite: src.siteName,
      fromLocation: src.locationCode,
      toSite,
      toLocation: 'RCV-01',
      itemId: src.itemId,
      itemName: src.itemName,
      batchNo: src.batchNo,
      qty,
      uom: src.uom,
      status: 'DRAFT',
      createdAt: 'Just now',
    };
    fetch('/api/bff/inventory/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(created),
    }).catch(() => {});
    setTransfers((prev) => [created, ...prev]);
    setCreateOpen(false);
    showToast(`Created transfer ${created.transferNo} (FEFO batch ${created.batchNo}).`);
  };

  const transition = (id: string, nextStatus: TransferRecord['status'], endpoint: string) => {
    fetch(`/api/bff/inventory/transfers/${id}/${endpoint}`, { method: 'POST' }).catch(() => {});
    setTransfers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: nextStatus } : t)),
    );
    showToast(`Transfer updated to ${nextStatus}.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
            <Link href="/inventory/stock" className="hover:text-white">Inventory</Link>
            <span>/</span>
            <span className="text-amber-400">Inter-Site Transfers</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Inter-Site Stock Transfers</h1>
          <p className="text-sm text-zinc-400">
            Draft → Dispatched → Received → Completed lifecycle with FEFO batch selection.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          + New Transfer
        </Button>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl p-2">
        {['ALL', 'DRAFT', 'DISPATCHED', 'RECEIVED', 'COMPLETED', 'CANCELLED'].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              statusFilter === st
                ? 'bg-amber-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950/80 border-b border-zinc-800 text-xs uppercase text-zinc-400">
            <tr>
              <th className="p-3">Transfer #</th>
              <th className="p-3">Route</th>
              <th className="p-3">Item &amp; FEFO Batch</th>
              <th className="p-3 text-right">Qty</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {filtered.map((t) => (
              <tr key={t.id} className="hover:bg-zinc-800/40">
                <td className="p-3 font-mono text-xs text-amber-400 font-semibold">
                  {t.transferNo}
                </td>
                <td className="p-3 text-xs text-zinc-200">
                  {t.fromSite} ({t.fromLocation}) → {t.toSite} ({t.toLocation})
                </td>
                <td className="p-3">
                  <div className="text-white font-medium">{t.itemName}</div>
                  <div className="text-[11px] font-mono text-zinc-500">Batch {t.batchNo}</div>
                </td>
                <td className="p-3 text-right font-mono text-white">
                  {t.qty} {t.uom}
                </td>
                <td className="p-3">
                  <StatusPill
                    status={t.status}
                    tone={
                      t.status === 'COMPLETED' || t.status === 'RECEIVED'
                        ? 'emerald'
                        : t.status === 'CANCELLED'
                          ? 'rose'
                          : 'amber'
                    }
                  />
                </td>
                <td className="p-3 text-right space-x-2">
                  {t.status === 'DRAFT' && (
                    <>
                      <button
                        onClick={() => transition(t.id, 'DISPATCHED', 'dispatch')}
                        className="text-xs text-sky-400 hover:text-sky-300 font-medium"
                      >
                        Dispatch
                      </button>
                      <button
                        onClick={() => transition(t.id, 'CANCELLED', 'cancel')}
                        className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {t.status === 'DISPATCHED' && (
                    <button
                      onClick={() => transition(t.id, 'RECEIVED', 'receive')}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      Receive
                    </button>
                  )}
                  {t.status === 'RECEIVED' && (
                    <button
                      onClick={() => transition(t.id, 'COMPLETED', 'complete')}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      Complete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create Stock Transfer (FEFO)">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Source Item &amp; Batch (FEFO)</label>
            <select
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
            >
              {stockRows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.itemName} — {r.batchNo} ({r.siteName}, Exp {r.expiryDate})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Destination Site</label>
              <select
                value={toSite}
                onChange={(e) => setToSite(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
              >
                <option value="Baramati Plant">Baramati Plant</option>
                <option value="Pune Central Depot">Pune Central Depot</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Quantity</label>
              <input
                type="number"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate}>Create Draft Transfer</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

