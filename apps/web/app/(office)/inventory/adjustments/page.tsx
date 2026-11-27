'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Dialog } from '@neo/ui';
import { formatINR, canViewMarginAndCost, type SessionUser } from '@neo/shared';
import {
  type AdjustmentRecord,
  type StockRow,
} from '../../../../src/lib/inventory-data';

export default function InventoryAdjustmentsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentRecord[]>([]);
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [stockRowId, setStockRowId] = useState('');
  const [qtyDelta, setQtyDelta] = useState(-10);
  const [reason, setReason] = useState<AdjustmentRecord['reason']>('DAMAGE');
  const [notes, setNotes] = useState('');
  const [photoName, setPhotoName] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const loadAdjustments = async () => {
    try {
      const [adjRes, stkRes] = await Promise.all([
        fetch('/api/proxy/inventory/adjustments').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/proxy/inventory/stock/current').then((r) => (r.ok ? r.json() : [])),
      ]);
      const aRows = Array.isArray(adjRes) ? adjRes : Array.isArray(adjRes?.data) ? adjRes.data : [];
      const sRows = Array.isArray(stkRes) ? stkRes : Array.isArray(stkRes?.data) ? stkRes.data : [];

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
      if (mappedStock.length > 0 && !stockRowId) setStockRowId(mappedStock[0].id);

      setAdjustments(
        aRows.map((a: any) => {
          const st = String(a.status || 'PENDING').toUpperCase();
          return {
            id: String(a.id),
            adjNo: String(a.adjNo || a.adjustment_no || a.id),
            itemId: String(a.itemId || a.item_id || ''),
            itemName: String(a.itemName || a.item_name || 'Item'),
            batchNo: String(a.batchNo || a.batch_id || 'FEFO'),
            siteName: String(a.siteName || a.site_name || 'Main Site'),
            qtyDelta: -Math.abs(Number(a.qtyDelta ?? a.qty ?? 0)),
            uom: String(a.uom || 'kg'),
            valueImpact: Number(a.valueImpact ?? 0),
            reason: (a.reason || a.adjustment_type || 'OTHER') as AdjustmentRecord['reason'],
            notes: String(a.notes || a.reason || ''),
            isLargeVariance: Number(a.variance_pct ?? 0) > 5,
            status: (st === 'PENDING' ? 'PENDING_APPROVAL' : st) as AdjustmentRecord['status'],
            requestedBy: String(a.requestedBy || a.requested_by || 'Ops'),
            createdAt: String(a.createdAt || a.created_at || ''),
          };
        }),
      );
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) setUser(d.user);
      })
      .catch(() => {});
    loadAdjustments();
  }, []);

  const showValuation = !user || canViewMarginAndCost(user.role);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmit = async () => {
    const row = stockRows.find((r) => r.id === stockRowId) || stockRows[0];
    if (!row) return;
    const adjQty = Math.abs(qtyDelta);
    if (!adjQty) return;
    const adjType = reason === 'SPILLAGE' ? 'SHRINKAGE' : 'WRITEOFF';
    try {
      const res = await fetch('/api/proxy/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: row.siteId,
          itemId: row.itemId,
          adjustmentType: adjType,
          qty: String(adjQty),
          remarks: `${reason}: ${notes || 'Submitted from office inventory'}${photoName ? ` (photo: ${photoName})` : ''}`,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || payload?.error?.message || `HTTP ${res.status}`);
      }
      await loadAdjustments();
      setCreateOpen(false);
      setNotes('');
      showToast(
        payload?.approvedBy
          ? `Adjustment auto-approved for ${row.itemName}.`
          : `Adjustment submitted for ${row.itemName} (awaiting approval).`,
      );
    } catch (err) {
      showToast(`Failed to submit adjustment: ${(err as Error).message}`);
    }
  };

  const handleDecision = async (id: string, action: 'approve' | 'reject') => {
    try {
      const res = await fetch(`/api/proxy/inventory/adjustments/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        ...(action === 'reject'
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason: 'Rejected from office adjustment queue' }),
            }
          : {}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadAdjustments();
      showToast(`Adjustment ${action === 'approve' ? 'approved' : 'rejected'}.`);
    } catch (err) {
      showToast(`Failed to ${action} adjustment: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/inventory/stock" className="hover:text-ink">Inventory</Link>
            <span>/</span>
            <span className="text-haldi">Stock Adjustments</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Stock Adjustments &amp; Approval Queue</h1>
          <p className="text-sm text-ink-3">
            This needs approval because it changes stock value. Large variances raise a STOCK_VARIANCE exception.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          + Request Adjustment
        </Button>
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
              <th className="p-3">Adj #</th>
              <th className="p-3">Item &amp; Batch</th>
              <th className="p-3">Reason</th>
              <th className="p-3 text-right">Qty Δ</th>
              {showValuation && <th className="p-3 text-right">Value Impact</th>}
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Approval</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {adjustments.map((a) => (
              <tr key={a.id} className="hover:bg-sunken">
                <td className="p-3 font-mono text-xs text-haldi font-semibold">
                  {a.adjNo}
                  {a.isLargeVariance && (
                    <div className="mt-1">
                      <Badge variant="warning">STOCK_VARIANCE</Badge>
                    </div>
                  )}
                </td>
                <td className="p-3">
                  <div className="text-ink font-medium">{a.itemName}</div>
                  <div className="text-[11px] text-ink-3 font-mono">
                    {a.batchNo} · {a.siteName}
                  </div>
                </td>
                <td className="p-3 text-xs text-ink-2">
                  <div className="font-medium">{a.reason}</div>
                  <div className="text-ink-3">{a.notes}</div>
                </td>
                <td className="p-3 text-right font-mono font-bold text-madder">
                  {a.qtyDelta > 0 ? `+${a.qtyDelta}` : a.qtyDelta} {a.uom}
                </td>
                {showValuation && (
                  <td className="p-3 text-right font-mono text-ink">
                    {formatINR(a.valueImpact)}
                  </td>
                )}
                <td className="p-3">
                  <StatusPill
                    status={a.status}
                    tone={
                      a.status === 'APPROVED'
                        ? 'emerald'
                        : a.status === 'REJECTED'
                          ? 'rose'
                          : 'amber'
                    }
                  />
                </td>
                <td className="p-3 text-right space-x-2">
                  {a.status === 'PENDING_APPROVAL' && (
                    <>
                      <button
                        onClick={() => handleDecision(a.id, 'approve')}
                        className="text-xs text-leaf hover:text-leaf font-medium"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleDecision(a.id, 'reject')}
                        className="text-xs text-madder hover:text-madder font-medium"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Request Stock Adjustment">
        <div className="space-y-4">
          <div className="p-2.5 rounded-lg bg-haldi-soft border border-haldi/30 text-haldi text-xs">
            This needs approval because it changes stock value.
          </div>
          <div>
            <label className="block text-xs text-ink-3 mb-1">Item &amp; Batch</label>
            <select
              value={stockRowId}
              onChange={(e) => setStockRowId(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            >
              {stockRows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.itemName} — {r.batchNo} ({r.siteName})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-3 mb-1">Qty Adjustment (±)</label>
              <input
                type="number"
                value={qtyDelta}
                onChange={(e) => setQtyDelta(Number(e.target.value))}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Reason</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as any)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              >
                <option value="DAMAGE">Damage</option>
                <option value="EXPIRY">Expiry</option>
                <option value="COUNT_DIFFERENCE">Count difference</option>
                <option value="SPILLAGE">Spillage</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-3 mb-1">Photo Evidence (G-FILE-1)</label>
            <input
              type="file"
              onChange={(e) => setPhotoName(e.target.files?.[0]?.name || '')}
              className="w-full text-xs text-ink-3"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-3 mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmit}>Submit for Approval</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

