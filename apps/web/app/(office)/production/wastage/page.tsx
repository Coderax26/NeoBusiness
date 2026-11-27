'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, Dialog } from '@neo/ui';

interface WastageRow {
  id: string;
  workOrderId: string;
  itemId: string;
  itemName: string;
  itemSkuCode: string;
  qty: number;
  uom: string;
  reasonType: 'NORMAL' | 'ABNORMAL' | 'EXPIRY' | 'DAMAGE';
  status: 'RECORDED' | 'APPROVED' | 'WRITTEN_OFF';
  createdAt: string;
}

export default function ProductionWastagePage() {
  const [logs, setLogs] = useState<WastageRow[]>([]);
  const [workOrders, setWorkOrders] = useState<Array<{ id: string; woNo: string; finishedItemId: string; finishedItemName: string; uom: string }>>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [selectedWoId, setSelectedWoId] = useState('');
  const [qtyInput, setQtyInput] = useState('5');
  const [reasonType, setReasonType] = useState<'NORMAL' | 'ABNORMAL' | 'EXPIRY' | 'DAMAGE'>('DAMAGE');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadWastage = useCallback(async () => {
    const storedSite =
      typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') ?? '' : '';
    const effectiveSite = storedSite && storedSite !== 'all' ? storedSite : '';
    const siteQuery = effectiveSite ? `?siteId=${encodeURIComponent(effectiveSite)}` : '';

    const [wstRes, woRes] = await Promise.all([
      fetch(`/api/proxy/production/wastage${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/production/work-orders${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
    ]);

    const wstRows = Array.isArray(wstRes) ? wstRes : Array.isArray(wstRes?.data) ? wstRes.data : [];
    setLogs(
      wstRows.map((w: any) => ({
        id: String(w.id),
        workOrderId: String(w.workOrderId ?? w.work_order_id ?? ''),
        itemId: String(w.itemId ?? w.item_id ?? ''),
        itemName: String(w.itemName ?? w.item_name ?? 'Production Item'),
        itemSkuCode: String(w.itemSkuCode ?? w.item_sku_code ?? ''),
        qty: Number(w.qty ?? 0),
        uom: String(w.uom ?? 'KG'),
        reasonType: (w.reasonType ?? w.reason_type ?? 'NORMAL') as WastageRow['reasonType'],
        status: (w.status ?? 'RECORDED') as WastageRow['status'],
        createdAt: String(w.createdAt ?? w.created_at ?? '').slice(0, 16).replace('T', ' '),
      })),
    );

    const woRows = Array.isArray(woRes) ? woRes : Array.isArray(woRes?.data) ? woRes.data : [];
    const mappedWos = woRows.map((w: any) => ({
      id: String(w.id),
      woNo: String(w.woNo ?? w.woNumber ?? w.wo_no ?? ''),
      finishedItemId: String(w.finishedItemId ?? ''),
      finishedItemName: String(w.finishedItemName ?? 'Item'),
      uom: String(w.uom ?? 'KG'),
    }));
    setWorkOrders(mappedWos);
    if (mappedWos.length > 0 && !selectedWoId) {
      setSelectedWoId(mappedWos[0].id);
    }
  }, [selectedWoId]);

  useEffect(() => {
    loadWastage().catch(() => {});
  }, [loadWastage]);

  const handleLogWastage = async () => {
    const wo = workOrders.find((w) => w.id === selectedWoId);
    if (!wo || Number(qtyInput || 0) <= 0) return;
    try {
      setBusy(true);
      const res = await fetch('/api/proxy/production/wastage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workOrderId: wo.id,
          itemId: wo.finishedItemId,
          qty: String(qtyInput),
          uom: wo.uom || 'KG',
          reasonType,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || `HTTP ${res.status}`);
      }
      await loadWastage();
      setLogOpen(false);
      setToast(`Recorded ${qtyInput} ${wo.uom} wastage (${reasonType}) on ${wo.woNo}.`);
    } catch (err) {
      setToast(`Failed to record wastage: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: 'APPROVED' | 'WRITTEN_OFF') => {
    try {
      setBusy(true);
      const res = await fetch(`/api/proxy/production/wastage/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || `HTTP ${res.status}`);
      }
      await loadWastage();
      setToast(`Wastage updated to ${status}.`);
    } catch (err) {
      setToast(`Failed to update wastage: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const woNoById = new Map(workOrders.map((w) => [w.id, w.woNo]));
  const byReason = (['NORMAL', 'ABNORMAL', 'DAMAGE', 'EXPIRY'] as const).map((reason) => ({
    reason,
    qty: logs.filter((l) => l.reasonType === reason).reduce((s, l) => s + l.qty, 0),
  }));
  const maxQty = Math.max(1, ...byReason.map((r) => r.qty));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/production" className="hover:text-ink">Production</Link>
            <span>/</span>
            <span className="text-orange-400">Wastage Log</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Production Wastage &amp; Write-Offs</h1>
          <p className="text-sm text-ink-3">
            Track wastage by reason and item; wastage feeds into OD-012 work-order mass-balance checks.
          </p>
        </div>
        <Button variant="primary" onClick={() => setLogOpen(true)}>
          + Log Wastage
        </Button>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-leaf-soft border border-leaf/30 text-leaf text-sm">
          {toast}
        </div>
      )}

      <Card className="p-5 bg-sheet border-rule">
        <h2 className="text-sm font-semibold text-ink mb-4">Wastage Breakdown by Reason (kg)</h2>
        <div className="space-y-3">
          {byReason.map((r) => (
            <div key={r.reason} className="flex items-center gap-3 text-xs">
              <div className="w-32 text-ink-2 font-medium">{r.reason}</div>
              <div className="flex-1 h-3 bg-sunken rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500"
                  style={{ width: `${(r.qty / maxQty) * 100}%` }}
                />
              </div>
              <div className="w-16 text-right font-mono text-ink font-bold">{r.qty} kg</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="bg-sheet border border-rule rounded-[3px] overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper border-b border-rule text-xs uppercase text-ink-3">
            <tr>
              <th className="p-3">Work Order &amp; Item</th>
              <th className="p-3">Reason Type</th>
              <th className="p-3 text-right">Qty</th>
              <th className="p-3">Status</th>
              <th className="p-3">Logged At</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {logs.map((w) => (
              <tr key={w.id} className="hover:bg-sunken">
                <td className="p-3">
                  <div className="text-ink font-medium">{w.itemName}</div>
                  <div className="text-[11px] font-mono text-ink-3">
                    {woNoById.get(w.workOrderId) ?? w.workOrderId.slice(0, 8)}
                  </div>
                </td>
                <td className="p-3 text-xs text-ink-2">{w.reasonType}</td>
                <td className="p-3 text-right font-mono font-bold text-madder">
                  {w.qty} {w.uom}
                </td>
                <td className="p-3">
                  <Badge variant={w.status === 'WRITTEN_OFF' ? 'warning' : 'success'}>
                    {w.status}
                  </Badge>
                </td>
                <td className="p-3 text-xs font-mono text-ink-3">{w.createdAt}</td>
                <td className="p-3 text-right space-x-2">
                  {w.status === 'RECORDED' && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => handleUpdateStatus(w.id, 'APPROVED')}
                        className="text-xs text-action hover:text-action font-medium"
                      >
                        Approve
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handleUpdateStatus(w.id, 'WRITTEN_OFF')}
                        className="text-xs text-madder hover:text-madder font-medium"
                      >
                        Write Off
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={logOpen} onClose={() => setLogOpen(false)} title="Record Production Wastage">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-ink-3 mb-1">Work Order</label>
            <select
              value={selectedWoId}
              onChange={(e) => setSelectedWoId(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            >
              {workOrders.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.woNo} — {w.finishedItemName}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-3 mb-1">Reason</label>
              <select
                value={reasonType}
                onChange={(e) => setReasonType(e.target.value as WastageRow['reasonType'])}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              >
                <option value="NORMAL">NORMAL</option>
                <option value="ABNORMAL">ABNORMAL</option>
                <option value="DAMAGE">DAMAGE</option>
                <option value="EXPIRY">EXPIRY</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Qty</label>
              <input
                type="number"
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLogOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={handleLogWastage}>Save Wastage</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
