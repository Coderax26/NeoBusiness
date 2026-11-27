'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  const [catalogItems, setCatalogItems] = useState<Array<{ id: string; name: string; sku: string; uom: string }>>([]);
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [direction, setDirection] = useState<'ADD' | 'DEDUCT'>('ADD');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [qtyAbs, setQtyAbs] = useState('10');
  const [reason, setReason] = useState<AdjustmentRecord['reason']>('COUNT_DIFFERENCE');
  const [notes, setNotes] = useState('');
  const [fileKey, setFileKey] = useState('');
  const [toast, setToast] = useState<{ msg: string; isError?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const showToast = (msg: string, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 5000);
  };

  const loadAdjustments = useCallback(async () => {
    try {
      const [adjRes, stkRes, itmRes, siteRes] = await Promise.all([
        fetch('/api/proxy/inventory/adjustments').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/proxy/inventory/stock/current').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/proxy/items').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/proxy/sites').then((r) => (r.ok ? r.json() : [])),
      ]);
      const aRows = Array.isArray(adjRes) ? adjRes : Array.isArray(adjRes?.data) ? adjRes.data : [];
      const sRows = Array.isArray(stkRes) ? stkRes : Array.isArray(stkRes?.data) ? stkRes.data : [];
      const iRows = Array.isArray(itmRes) ? itmRes : Array.isArray(itmRes?.data) ? itmRes.data : [];
      const stRows = Array.isArray(siteRes) ? siteRes : Array.isArray(siteRes?.data) ? siteRes.data : [];

      const mappedStock: StockRow[] = sRows.map((r: any) => ({
        id: String(r.id ?? r.batchId ?? ''),
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
        uom: String(r.uom ?? 'KG'),
        altUomLabel: '',
        unitCost: Number(r.unitCost ?? 0),
        daysToExpiry: 30,
        expiryDate: String(r.expiryDate ?? r.expiry_date ?? '').slice(0, 10),
      }));
      setStockRows(mappedStock);

      const mappedItems = iRows.map((i: any) => ({
        id: String(i.id),
        name: String(i.name ?? 'Item'),
        sku: String(i.sku_code ?? i.skuCode ?? ''),
        uom: String(i.primary_uom ?? i.primaryUom ?? 'KG'),
      }));
      setCatalogItems(mappedItems);
      if (mappedItems.length > 0) setSelectedItemId((p) => p || mappedItems[0].id);

      const mappedSites = stRows.map((s: any) => ({ id: String(s.id), name: String(s.name ?? 'Site') }));
      setSites(mappedSites);
      if (mappedSites.length > 0) setSelectedSiteId((p) => p || mappedSites[0].id);

      setAdjustments(
        aRows.map((a: any) => {
          const st = String(a.status || 'PENDING').toUpperCase();
          const adjType = String(a.adjustment_type || 'OTHER').toUpperCase();
          const isPositive = ['COUNT_SURPLUS', 'FOUND', 'OPENING_STOCK'].includes(adjType);
          const absQ = Math.abs(Number(a.qtyDelta ?? a.qty ?? 0));
          const uCost = Number(a.unit_cost ?? a.unitCost ?? 0);
          return {
            id: String(a.id),
            adjNo: String(a.adjNo || a.adjustment_no || a.id),
            itemId: String(a.itemId || a.item_id || ''),
            itemName: String(a.itemName || a.item_name || 'Item'),
            batchNo: String(a.batchNo || a.batch_no || 'FEFO'),
            siteName: String(a.siteName || a.site_name || 'Main Site'),
            qtyDelta: isPositive ? absQ : -absQ,
            uom: String(a.uom || 'KG'),
            valueImpact: Number(a.valueImpact ?? (absQ * uCost)),
            reason: adjType as AdjustmentRecord['reason'],
            notes: String(a.notes || a.reason || ''),
            isLargeVariance: Number(a.variance_pct ?? 0) > 5,
            status: (st === 'PENDING' ? 'PENDING_APPROVAL' : st) as AdjustmentRecord['status'],
            requestedBy: String(a.requested_by_name || a.requestedBy || a.requested_by || 'Ops'),
            createdAt: String(a.createdAt || a.created_at || ''),
          };
        }),
      );
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) {
          setUser(d.user);
          const fallbackSite = d.user.activeSiteId || d.user.sites?.[0]?.id;
          if (fallbackSite) setSelectedSiteId((p) => p || String(fallbackSite));
        }
      })
      .catch(() => {});
    loadAdjustments();
  }, [loadAdjustments]);

  const showValuation = !user || canViewMarginAndCost(user.role);
  const matchingBatches = stockRows.filter(
    (b) => b.siteId === selectedSiteId && b.itemId === selectedItemId,
  );

  const handlePhotoUpload = async (file: File | null) => {
    if (!file) { setFileKey(''); return; }
    try {
      const presign = await fetch('/api/proxy/files/presign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type || 'application/octet-stream' }),
      }).then((r) => (r.ok ? r.json() : null));
      if (presign?.fileKey) {
        setFileKey(`${file.name} (${presign.fileKey})`);
      } else {
        setFileKey(file.name);
      }
    } catch {
      setFileKey(file.name);
    }
  };

  const handleSubmit = async () => {
    if (!selectedSiteId || !selectedItemId) {
      showToast('Select both Site and Item.', true);
      return;
    }
    const numQty = Math.abs(Number(qtyAbs));
    if (!numQty || numQty <= 0) {
      showToast('Enter a positive adjustment quantity.', true);
      return;
    }
    const adjType =
      direction === 'ADD'
        ? reason === 'COUNT_DIFFERENCE'
          ? 'COUNT_SURPLUS'
          : 'FOUND'
        : reason === 'SPILLAGE'
          ? 'SHRINKAGE'
          : reason === 'EXPIRY'
            ? 'EXPIRY_REMOVAL'
            : 'WRITEOFF';
    const item = catalogItems.find((i) => i.id === selectedItemId);
    try {
      setBusy(true);
      const res = await fetch('/api/proxy/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedSiteId,
          itemId: selectedItemId,
          batchId: selectedBatchId || undefined,
          adjustmentType: adjType,
          qty: String(numQty),
          remarks: `${reason}: ${notes || 'Submitted from office inventory'}${fileKey ? ` (evidence: ${fileKey})` : ''}`,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || payload?.success === false) {
        throw new Error(
          payload?.message ||
            payload?.error?.message ||
            'Adjustment rejected (check available stock or permissions).',
        );
      }
      await loadAdjustments();
      setCreateOpen(false);
      setNotes('');
      setFileKey('');
      setSelectedBatchId('');
      showToast(
        payload?.approvedBy
          ? `${direction === 'ADD' ? 'Added' : 'Deducted'} ${numQty} ${item?.uom || 'KG'} for ${item?.name || 'item'} (approved).`
          : `Adjustment submitted for ${item?.name || 'item'} (awaiting owner approval).`,
      );
    } catch (err) {
      showToast(`Failed to submit adjustment: ${(err as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  };

  const handleDecision = async (id: string, action: 'approve' | 'reject') => {
    try {
      setBusy(true);
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
      showToast(`Failed to ${action} adjustment: ${(err as Error).message}`, true);
    } finally {
      setBusy(false);
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
            Add missing stock (+ Found / Surplus) or deduct damaged/expired stock (- Write-off / Shrinkage). Works even from zero stock.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/inventory/stock">
            <Button variant="secondary">Opening Stock</Button>
          </Link>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            + Request Adjustment
          </Button>
        </div>
      </div>

      {toast && (
        <div
          className={`p-3 rounded-lg border text-sm ${
            toast.isError
              ? 'bg-madder-soft border-madder/30 text-madder'
              : 'bg-leaf-soft border-leaf/30 text-leaf'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="bg-sheet border border-rule rounded-[3px] overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper border-b border-rule text-xs uppercase text-ink-3">
            <tr>
              <th className="p-3">Adj #</th>
              <th className="p-3">Item &amp; Batch</th>
              <th className="p-3">Reason &amp; Requested By</th>
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
                  <div className="text-[11px] text-ink-3 mt-0.5">By: {a.requestedBy}</div>
                </td>
                <td className={`p-3 text-right font-mono font-bold ${a.qtyDelta >= 0 ? 'text-leaf' : 'text-madder'}`}>
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
                        disabled={busy}
                        onClick={() => handleDecision(a.id, 'approve')}
                        className="text-xs text-leaf hover:text-leaf font-medium"
                      >
                        Approve
                      </button>
                      <button
                        disabled={busy}
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
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection('ADD')}
              className={`p-2.5 rounded-lg border text-xs font-semibold ${
                direction === 'ADD'
                  ? 'bg-leaf-soft border-leaf text-leaf'
                  : 'bg-paper border-rule text-ink-2'
              }`}
            >
              + Add Stock (Surplus / Found)
            </button>
            <button
              type="button"
              onClick={() => setDirection('DEDUCT')}
              className={`p-2.5 rounded-lg border text-xs font-semibold ${
                direction === 'DEDUCT'
                  ? 'bg-madder-soft border-madder text-madder'
                  : 'bg-paper border-rule text-ink-2'
              }`}
            >
              − Deduct Stock (Write-off / Shrinkage)
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-3 mb-1">Site</label>
              <select
                value={selectedSiteId}
                onChange={(e) => { setSelectedSiteId(e.target.value); setSelectedBatchId(''); }}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Item</label>
              <select
                value={selectedItemId}
                onChange={(e) => { setSelectedItemId(e.target.value); setSelectedBatchId(''); }}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              >
                {catalogItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.sku} · {i.uom})
                  </option>
                ))}
              </select>
            </div>
          </div>
          {matchingBatches.length > 0 && (
            <div>
              <label className="block text-xs text-ink-3 mb-1">Specific Batch (Optional)</label>
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              >
                <option value="">Auto (FEFO / Create new batch)</option>
                {matchingBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batchNo} — On hand: {b.onHand} {b.uom} (Exp: {b.expiryDate || 'N/A'})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-3 mb-1">
                {direction === 'ADD' ? 'Quantity to Add (+)' : 'Quantity to Deduct (−)'}
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={qtyAbs}
                onChange={(e) => setQtyAbs(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm font-mono text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Reason</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as any)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              >
                <option value="COUNT_DIFFERENCE">Count difference</option>
                <option value="DAMAGE">Damage</option>
                <option value="EXPIRY">Expiry</option>
                <option value="SPILLAGE">Spillage</option>
                <option value="OTHER">Found / Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-3 mb-1">Photo Evidence</label>
            <input
              type="file"
              onChange={(e) => handlePhotoUpload(e.target.files?.[0] || null)}
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
            <Button variant="primary" disabled={busy} onClick={handleSubmit}>
              {direction === 'ADD' ? 'Add Stock' : 'Submit for Approval'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
