'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, StatusPill, Dialog } from '@neo/ui';
import {
  type TransferRecord,
  type StockRow,
} from '../../../../src/lib/inventory-data';

function normalizeTransferStatus(raw: unknown): TransferRecord['status'] {
  const s = String(raw || 'DRAFT').toUpperCase();
  if (s === 'RESERVED' || s === 'REQUESTED') return 'DRAFT';
  if (s === 'IN_TRANSIT') return 'DISPATCHED';
  return s as TransferRecord['status'];
}

export default function InventoryTransfersPage() {
  const [transfers, setTransfers] = useState<Array<TransferRecord & { rawLines?: any[] }>>([]);
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [toSite, setToSite] = useState('');
  const [qty, setQty] = useState(200);
  const [toast, setToast] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [trfRes, stkRes, sitesRes] = await Promise.all([
        fetch('/api/proxy/inventory/transfers').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/proxy/inventory/stock/current').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/proxy/sites').then((r) => (r.ok ? r.json() : [])),
      ]);
      const tRows = Array.isArray(trfRes) ? trfRes : Array.isArray(trfRes?.data) ? trfRes.data : [];
      const sRows = Array.isArray(stkRes) ? stkRes : Array.isArray(stkRes?.data) ? stkRes.data : [];
      const siteRows = Array.isArray(sitesRes) ? sitesRes : Array.isArray(sitesRes?.data) ? sitesRes.data : [];

      setTransfers(
        tRows.map((t: any) => ({
          id: String(t.id),
          transferNo: String(t.transferNo || t.transfer_no || String(t.id).slice(0, 8)),
          fromSite: String(t.fromSite || t.from_site_name || t.from_site_id || 'Source'),
          fromLocation: String(t.fromLocation || 'WH'),
          toSite: String(t.toSite || t.to_site_name || t.to_site_id || 'Destination'),
          toLocation: String(t.toLocation || 'RCV-01'),
          itemId: String(t.itemId || t.lines?.[0]?.item_id || ''),
          itemName: String(t.itemName || t.item_name || t.lines?.[0]?.item_name || 'Item'),
          batchNo: String(t.batchNo || t.batch_number || 'FEFO'),
          qty: Number(t.qty ?? t.requested_qty ?? t.lines?.[0]?.requested_qty ?? 0),
          uom: String(t.uom || 'KG'),
          status: normalizeTransferStatus(t.status),
          createdAt: String(t.createdAt || t.created_at || ''),
          rawLines: Array.isArray(t.lines) ? t.lines : [],
        })),
      );

      const mappedStock = sRows.map((r: any) => ({
        id: String(r.id ?? r.batchId ?? r.itemId ?? ''),
        itemId: String(r.itemId ?? r.item_id ?? ''),
        sku: String(r.sku ?? r.skuCode ?? r.sku_code ?? ''),
        itemName: String(r.itemName ?? r.item_name ?? r.name ?? ''),
        category: (r.category ?? 'RAW_MATERIAL') as any,
        siteId: String(r.siteId ?? r.site_id ?? ''),
        siteName: String(r.siteName ?? r.site_name ?? ''),
        locationCode: String(r.locationCode ?? r.locationName ?? r.location_name ?? ''),
        batchNo: String(r.batchNo ?? r.batchNumber ?? r.batch_number ?? ''),
        onHand: Number(r.onHand ?? r.qtyOnHand ?? r.qty_on_hand ?? 0),
        reserved: Number(r.reserved ?? r.qtyCommitted ?? r.qty_committed ?? 0),
        minStock: Number(r.minStock ?? 0),
        uom: String(r.uom ?? 'kg'),
        altUomLabel: '',
        unitCost: Number(r.unitCost ?? 0),
        daysToExpiry: 30,
        expiryDate: String(r.expiryDate ?? r.expiry_date ?? '').slice(0, 10),
      }));
      setStockRows(mappedStock);
      if (mappedStock.length > 0 && !selectedBatchId) setSelectedBatchId(mappedStock[0].id);

      const mappedSites = siteRows.map((s: any) => ({ id: String(s.id), name: String(s.name) }));
      setSites(mappedSites);
      if (mappedSites.length > 0 && !toSite) setToSite(mappedSites[0].id);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const filtered = transfers.filter((t) =>
    statusFilter === 'ALL' ? true : t.status === statusFilter,
  );

  const handleCreate = async () => {
    const src = stockRows.find((r) => r.id === selectedBatchId) || stockRows[0];
    if (!src) return;
    const toSiteId = sites.find((s) => s.id === toSite || s.name === toSite)?.id || toSite;
    try {
      const res = await fetch('/api/proxy/inventory/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromSiteId: src.siteId,
          toSiteId,
          itemId: src.itemId,
          qty: String(qty),
          idempotencyKey: `trf-${Date.now()}`,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || payload?.error?.message || `HTTP ${res.status}`);
      }
      await loadData();
      setCreateOpen(false);
      showToast(`Created transfer for ${src.itemName} (${qty} ${src.uom}).`);
    } catch (err) {
      showToast(`Failed to create transfer: ${(err as Error).message}`);
    }
  };

  const transition = async (
    trf: TransferRecord & { rawLines?: any[] },
    nextStatus: TransferRecord['status'],
    endpoint: string,
  ) => {
    try {
      const body =
        endpoint === 'receive'
          ? JSON.stringify({
              lines: (trf.rawLines || []).map((l: any) => ({
                lineId: String(l.id),
                receivedQty: String(l.dispatched_qty || l.requested_qty || trf.qty),
              })),
            })
          : undefined;
      const res = await fetch(`/api/proxy/inventory/transfers/${encodeURIComponent(trf.id)}/${endpoint}`, {
        method: 'POST',
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body } : {}),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || payload?.error?.message || `HTTP ${res.status}`);
      }
      await loadData();
      showToast(`Transfer updated to ${nextStatus}.`);
    } catch (err) {
      showToast(`Failed to ${endpoint} transfer: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/inventory/stock" className="hover:text-ink">Inventory</Link>
            <span>/</span>
            <span className="text-haldi">Inter-Site Transfers</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Inter-Site Stock Transfers</h1>
          <p className="text-sm text-ink-3">
            Draft → Dispatched → Received → Completed lifecycle with FEFO batch selection.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          + New Transfer
        </Button>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-leaf-soft border border-leaf/30 text-leaf text-sm">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 bg-sheet border border-rule rounded-[3px] p-2">
        {['ALL', 'DRAFT', 'DISPATCHED', 'RECEIVED', 'COMPLETED', 'CANCELLED'].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              statusFilter === st
                ? 'bg-haldi text-white'
                : 'bg-sunken text-ink-3 hover:text-ink'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      <div className="bg-sheet border border-rule rounded-[3px] overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper border-b border-rule text-xs uppercase text-ink-3">
            <tr>
              <th className="p-3">Transfer #</th>
              <th className="p-3">Route</th>
              <th className="p-3">Item &amp; FEFO Batch</th>
              <th className="p-3 text-right">Qty</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {filtered.map((t) => (
              <tr key={t.id} className="hover:bg-sunken">
                <td className="p-3 font-mono text-xs text-haldi font-semibold">
                  {t.transferNo}
                </td>
                <td className="p-3 text-xs text-ink">
                  {t.fromSite} ({t.fromLocation}) → {t.toSite} ({t.toLocation})
                </td>
                <td className="p-3">
                  <div className="text-ink font-medium">{t.itemName}</div>
                  <div className="text-[11px] font-mono text-ink-3">Batch {t.batchNo}</div>
                </td>
                <td className="p-3 text-right font-mono text-ink">
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
                        onClick={() => transition(t, 'DISPATCHED', 'dispatch')}
                        className="text-xs text-action hover:text-action font-medium"
                      >
                        Dispatch
                      </button>
                      <button
                        onClick={() => transition(t, 'CANCELLED', 'cancel')}
                        className="text-xs text-madder hover:text-madder font-medium"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {t.status === 'DISPATCHED' && (
                    <button
                      onClick={() => transition(t, 'RECEIVED', 'receive')}
                      className="text-xs text-leaf hover:text-leaf font-medium"
                    >
                      Receive
                    </button>
                  )}
                  {t.status === 'RECEIVED' && (
                    <button
                      onClick={() => transition(t, 'COMPLETED', 'complete')}
                      className="text-xs text-leaf hover:text-leaf font-medium"
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
            <label className="block text-xs text-ink-3 mb-1">Source Item &amp; Batch (FEFO)</label>
            <select
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
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
              <label className="block text-xs text-ink-3 mb-1">Destination Site</label>
              <select
                value={toSite}
                onChange={(e) => setToSite(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Quantity</label>
              <input
                type="number"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
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

