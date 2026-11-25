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

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.user) setUser(d.user);
      })
      .catch(() => {});

    Promise.all([
      fetch('/api/proxy/inventory/adjustments').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/inventory/stock/current').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([adjRes, stkRes]) => {
        if (!active) return;
        const aRows = Array.isArray(adjRes) ? adjRes : Array.isArray(adjRes?.data) ? adjRes.data : [];
        const sRows = Array.isArray(stkRes) ? stkRes : Array.isArray(stkRes?.data) ? stkRes.data : [];
        setAdjustments(aRows);
        setStockRows(sRows);
        if (sRows.length > 0) setStockRowId(String(sRows[0].id));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const showValuation = !user || canViewMarginAndCost(user.role);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmit = () => {
    const row = stockRows.find((r) => r.id === stockRowId) || stockRows[0];
    if (!row) return;
    const valueImpact = Number((qtyDelta * row.unitCost).toFixed(2));
    const isLarge = Math.abs(valueImpact) >= 5000;
    const created: AdjustmentRecord = {
      id: `adj-${Date.now()}`,
      adjNo: `ADJ-2026-0${Math.floor(40 + Math.random() * 59)}`,
      itemId: row.itemId,
      itemName: row.itemName,
      batchNo: row.batchNo,
      siteName: row.siteName,
      qtyDelta,
      uom: row.uom,
      valueImpact,
      reason,
      notes: notes || 'Submitted from office inventory',
      photoName: photoName || undefined,
      isLargeVariance: isLarge,
      status: 'PENDING_APPROVAL',
      requestedBy: user?.name || 'Ops Coordinator',
      createdAt: 'Just now',
    };
    fetch('/api/bff/inventory/adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(created),
    }).catch(() => {});

    setAdjustments((prev) => [created, ...prev]);
    setCreateOpen(false);
    setNotes('');
    showToast(
      isLarge
        ? `Submitted ${created.adjNo} — STOCK_VARIANCE exception raised for Owner approval.`
        : `Submitted ${created.adjNo} for approval.`,
    );
  };

  const handleDecision = (id: string, action: 'approve' | 'reject') => {
    fetch(`/api/bff/inventory/adjustments/${id}/${action}`, { method: 'POST' }).catch(() => {});
    setAdjustments((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, status: action === 'approve' ? 'APPROVED' : 'REJECTED' }
          : a,
      ),
    );
    showToast(`Adjustment ${action === 'approve' ? 'approved' : 'rejected'}.`);
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

