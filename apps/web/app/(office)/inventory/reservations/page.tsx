'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, StatusPill, Dialog } from '@neo/ui';
import { type ReservationRecord } from '../../../../src/lib/inventory-data';

export default function InventoryReservationsPage() {
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [releaseTarget, setReleaseTarget] = useState<ReservationRecord | null>(null);
  const [releaseReason, setReleaseReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const loadReservations = async () => {
    try {
      const r = await fetch('/api/proxy/inventory/reservations');
      if (!r.ok) return;
      const res = await r.json();
      const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      setReservations(
        rows.map((row: any) => ({
          id: String(row.id),
          orderNo: String(row.orderNo || row.order_no || row.order_id || row.id),
          customerName: String(row.customerName || row.order_type || 'SALES_ORDER'),
          itemId: String(row.itemId || row.item_id || ''),
          itemName: String(row.itemName || row.item_name || 'Item'),
          batchNo: String(row.batchNo || row.batch_number || row.batch_id || ''),
          siteName: String(row.siteName || row.site_name || 'Main Site'),
          qty: Number(row.qty ?? 0),
          uom: String(row.uom || 'kg'),
          expiresAt: String(row.expires_at || ''),
          status: (row.status || 'ACTIVE') as ReservationRecord['status'],
        })),
      );
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadReservations();
  }, []);

  const handleRelease = async () => {
    if (!releaseTarget || !releaseReason.trim()) return;
    try {
      const res = await fetch(`/api/proxy/inventory/reservations/${encodeURIComponent(releaseTarget.id)}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: `release-${releaseTarget.id}-${Date.now()}`,
          reason: releaseReason,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadReservations();
      setToast(`Released ${releaseTarget.qty} ${releaseTarget.uom} reserved for ${releaseTarget.orderNo}.`);
      setReleaseTarget(null);
      setReleaseReason('');
    } catch (err) {
      setToast(`Failed to release reservation: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
          <Link href="/inventory/stock" className="hover:text-ink">Inventory</Link>
          <span>/</span>
          <span className="text-haldi">Stock Reservations</span>
        </div>
        <h1 className="text-2xl font-bold text-ink">Stock Reservations</h1>
        <p className="text-sm text-ink-3">
          View which Sales Orders hold which batches and release reservations with an audit reason.
        </p>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-leaf-soft border border-leaf/30 text-leaf text-sm">
          {toast}
        </div>
      )}

      <div className="bg-sheet border border-rule rounded-[3px] overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper border-b border-rule text-xs uppercase text-ink-3">
            <tr>
              <th className="p-3">Sales Order</th>
              <th className="p-3">Item &amp; Batch</th>
              <th className="p-3">Site</th>
              <th className="p-3 text-right">Reserved Qty</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {reservations.map((r) => (
              <tr key={r.id} className="hover:bg-sunken">
                <td className="p-3">
                  <div className="font-mono text-xs text-action font-semibold">{r.orderNo}</div>
                  <div className="text-xs text-ink-3">{r.customerName}</div>
                </td>
                <td className="p-3">
                  <div className="text-ink font-medium">{r.itemName}</div>
                  <div className="text-[11px] font-mono text-ink-3">Batch {r.batchNo}</div>
                </td>
                <td className="p-3 text-xs text-ink-2">{r.siteName}</td>
                <td className="p-3 text-right font-mono font-bold text-haldi">
                  {r.qty} {r.uom}
                </td>
                <td className="p-3">
                  <StatusPill status={r.status} tone={r.status === 'ACTIVE' ? 'amber' : 'slate'} />
                </td>
                <td className="p-3 text-right">
                  {r.status === 'ACTIVE' && (
                    <button
                      onClick={() => setReleaseTarget(r)}
                      className="text-xs text-madder hover:text-madder font-medium"
                    >
                      Release
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={!!releaseTarget}
        onClose={() => setReleaseTarget(null)}
        title={`Release Reservation — ${releaseTarget?.orderNo ?? ''}`}
      >
        <div className="space-y-4">
          <textarea
            rows={3}
            value={releaseReason}
            onChange={(e) => setReleaseReason(e.target.value)}
            placeholder="Reason required to release reserved stock..."
            className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReleaseTarget(null)}>Cancel</Button>
            <Button variant="primary" disabled={!releaseReason.trim()} onClick={handleRelease}>
              Confirm Release
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

