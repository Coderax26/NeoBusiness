'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Card, Dialog } from '@neo/ui';
import { evaluateWoYieldStatus, type BomRecord } from '@neo/shared';
import {
  type WorkOrderRecord,
} from '../../../../src/lib/production-data';

export default function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrderRecord[]>([]);
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [viewMode, setViewMode] = useState<'LIST' | 'KANBAN'>('LIST');
  const [selectedWo, setSelectedWo] = useState<WorkOrderRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newBomId, setNewBomId] = useState('');
  const [newQty, setNewQty] = useState(500);
  const [newRequiredBy, setNewRequiredBy] = useState(new Date().toISOString().slice(0, 10) + ' 14:00');
  const [cancelTarget, setCancelTarget] = useState<WorkOrderRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [activeSiteId, setActiveSiteId] = useState<string>('');

  useEffect(() => {
    let active = true;
    const storedSite =
      typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') ?? '' : '';
    const effectiveSite = storedSite && storedSite !== 'all' ? storedSite : '';
    setActiveSiteId(effectiveSite);
    const siteQuery = effectiveSite ? `?siteId=${encodeURIComponent(effectiveSite)}` : '';

    if (!effectiveSite) {
      fetch('/api/auth/me')
        .then((r) => (r.ok ? r.json() : null))
        .then((me) => {
          const fallbackSite = me?.user?.activeSiteId || me?.user?.sites?.[0]?.id || '';
          if (active && fallbackSite) setActiveSiteId(String(fallbackSite));
        })
        .catch(() => { });
    }

    Promise.all([
      fetch(`/api/proxy/production/work-orders${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/production/boms${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([woRes, bomRes]) => {
        if (!active) return;
        const wos = Array.isArray(woRes) ? woRes : Array.isArray(woRes?.data) ? woRes.data : [];
        const bRows = Array.isArray(bomRes) ? bomRes : Array.isArray(bomRes?.data) ? bomRes.data : [];
        setWorkOrders(
          wos.map((w: any) => ({
            ...w,
            id: String(w.id),
            woNumber: String(w.woNumber ?? w.woNo ?? w.wo_no ?? ''),
            finishedItemId: String(w.finishedItemId ?? ''),
            finishedItemName: String(w.finishedItemName ?? 'Item'),
            bomId: String(w.bomId ?? w.bomHeaderId ?? ''),
            bomCode: String(w.bomCode ?? w.bomNo ?? ''),
            siteName: String(w.siteName ?? 'Plant'),
            plannedQty: Number(w.plannedQty ?? 0),
            issuedRmQty: Number(w.issuedRmQty ?? 0),
            actualOutputQty: Number(
              w.actualOutputQty ??
              (Array.isArray(w.outputs)
                ? w.outputs.reduce(
                  (s: number, o: any) => s + Number(o.qtyProduced ?? o.qty_produced ?? 0),
                  0,
                )
                : 0),
            ),
            scrapQty: Number(w.scrapQty ?? 0),
            uom: String(w.uom ?? 'kg'),
            status: (w.status ?? 'PLANNED') as WorkOrderRecord['status'],
            requiredBy: String(w.requiredBy ?? w.createdAt ?? ''),
          })),
        );
        const normalizedBoms: BomRecord[] = bRows.map((b: any) => ({
          ...b,
          id: String(b.id),
          code: String(b.code ?? b.bomNo ?? 'BOM'),
          finishedItemId: String(b.finishedItemId ?? b.itemId ?? ''),
          finishedItemName: String(b.finishedItemName ?? b.itemName ?? 'Item'),
          outputUom: String(b.outputUom ?? b.uom ?? 'kg'),
          ingredients: Array.isArray(b.ingredients) ? b.ingredients : Array.isArray(b.lines) ? b.lines : [],
        }));
        setBoms(normalizedBoms);
        if (normalizedBoms.length > 0) setNewBomId(normalizedBoms[0].id);
      })
      .catch(() => { });
    return () => {
      active = false;
    };
  }, []);

  const handleCreateWo = async () => {
    const bom: any = boms.find((b) => b.id === newBomId) || boms[0];
    if (!bom) return;
    if (!activeSiteId) {
      setToast('Active site is required to create a Work Order.');
      return;
    }
    const woNo = `WO-${new Date().toISOString().slice(2, 7).replace('-', '')}-${Math.floor(1000 + Math.random() * 8999)}`;
    const uom = String(bom.outputUom || bom.uom || 'KG');
    try {
      const res = await fetch('/api/bff/production/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          woNo,
          siteId: activeSiteId,
          bomHeaderId: bom.id,
          plannedQty: String(newQty),
          uom,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      const saved = await res.json().catch(() => null);
      const d = saved?.data ?? saved;
      const created: WorkOrderRecord = {
        id: String(d?.id ?? `wo-${Date.now()}`),
        woNumber: String(d?.woNo ?? woNo),
        finishedItemId: String(d?.finishedItemId ?? bom.finishedItemId ?? ''),
        finishedItemName: String(d?.finishedItemName ?? bom.finishedItemName ?? 'Item'),
        bomId: String(d?.bomHeaderId ?? bom.id),
        bomCode: String(d?.bomNo ?? bom.code ?? ''),
        siteName: 'Plant',
        plannedQty: Number(d?.plannedQty ?? newQty),
        issuedRmQty: 0,
        actualOutputQty: 0,
        scrapQty: 0,
        uom: String(d?.uom ?? uom),
        status: (d?.status ?? 'PLANNED') as WorkOrderRecord['status'],
        requiredBy: newRequiredBy,
      };
      setWorkOrders((prev) => [created, ...prev]);
      setCreateOpen(false);
      setToast(`Created Work Order ${created.woNumber}.`);
    } catch (err) {
      setToast(`Failed to create Work Order: ${(err as Error).message}`);
    }
  };

  const handleCancelWo = async () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    try {
      const res = await fetch(`/api/bff/production/work-orders/${encodeURIComponent(cancelTarget.id)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      setWorkOrders((prev) =>
        prev.map((w) =>
          w.id === cancelTarget.id ? { ...w, status: 'CANCELLED', cancelReason } : w,
        ),
      );
      setCancelTarget(null);
      setCancelReason('');
      setToast(`Cancelled Work Order ${cancelTarget.woNumber}.`);
    } catch (err) {
      setToast(`Failed to cancel Work Order: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/production" className="hover:text-ink">Production</Link>
            <span>/</span>
            <span className="text-orange-400">Work Orders</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Production Work Orders</h1>
          <p className="text-sm text-ink-3">
            Track planned, running, and completed batches with BR-06 yield gauges.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setViewMode(viewMode === 'LIST' ? 'KANBAN' : 'LIST')}
          >
            {viewMode === 'LIST' ? 'Kanban View' : 'List View'}
          </Button>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            + Create Work Order
          </Button>
        </div>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-leaf-soft border border-leaf/30 text-leaf text-sm">
          {toast}
        </div>
      )}

      {viewMode === 'KANBAN' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['PLANNED', 'IN_PROGRESS', 'COMPLETED'] as const).map((status) => (
            <div key={status} className="bg-sheet border border-rule rounded-[3px] p-4 space-y-3">
              <div className="text-xs font-bold uppercase text-ink-3">
                {status.replace('_', ' ')} ({workOrders.filter((w) => w.status === status).length})
              </div>
              {workOrders
                .filter((w) => w.status === status)
                .map((wo) => (
                  <Card
                    key={wo.id}
                    className="p-3.5 bg-paper border-rule cursor-pointer hover:border-orange-500/60"
                    onClick={() => setSelectedWo(wo)}
                  >
                    <div className="flex justify-between text-xs">
                      <span className="font-mono text-orange-400 font-bold">{wo.woNumber}</span>
                      <span className="text-ink-3">{wo.requiredBy}</span>
                    </div>
                    <div className="text-sm font-semibold text-ink mt-1">
                      {wo.finishedItemName}
                    </div>
                    <div className="text-xs text-ink-3 mt-1">
                      Plan: {wo.plannedQty} {wo.uom} {wo.linkedSalesOrderNo ? `· ${wo.linkedSalesOrderNo}` : ''}
                    </div>
                  </Card>
                ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-sheet border border-rule rounded-[3px] overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper border-b border-rule text-xs uppercase text-ink-3">
              <tr>
                <th className="p-3">WO #</th>
                <th className="p-3">Finished Item &amp; BOM</th>
                <th className="p-3">Linked SO</th>
                <th className="p-3 text-right">Planned / Output</th>
                <th className="p-3">Yield Gauge</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {workOrders.map((wo) => {
                const y =
                  wo.issuedRmQty > 0
                    ? evaluateWoYieldStatus(wo.issuedRmQty, wo.actualOutputQty, wo.scrapQty)
                    : null;
                return (
                  <tr key={wo.id} className="hover:bg-sunken">
                    <td className="p-3 font-mono text-xs text-orange-400 font-semibold">
                      {wo.woNumber}
                    </td>
                    <td className="p-3">
                      <div className="text-ink font-medium">{wo.finishedItemName}</div>
                      <div className="text-[11px] font-mono text-ink-3">{wo.bomCode}</div>
                    </td>
                    <td className="p-3 text-xs font-mono text-ink-2">
                      {wo.linkedSalesOrderNo || 'Stock'}
                    </td>
                    <td className="p-3 text-right font-mono text-ink">
                      {wo.actualOutputQty} / {wo.plannedQty} {wo.uom}
                    </td>
                    <td className="p-3">
                      {y ? (
                        <Badge variant={y.exceedsTolerance ? 'warning' : 'success'}>
                          {y.yieldPct}% · {y.label}
                        </Badge>
                      ) : (
                        <span className="text-xs text-ink-3">Not started</span>
                      )}
                    </td>
                    <td className="p-3">
                      <StatusPill
                        status={wo.status}
                        tone={
                          wo.status === 'COMPLETED'
                            ? 'emerald'
                            : wo.status === 'CANCELLED'
                              ? 'rose'
                              : 'amber'
                        }
                      />
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => setSelectedWo(wo)}
                        className="text-xs text-orange-400 hover:text-orange-300 font-medium"
                      >
                        Detail
                      </button>
                      {wo.status === 'PLANNED' && (
                        <button
                          onClick={() => setCancelTarget(wo)}
                          className="text-xs text-madder hover:text-madder font-medium"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog
        open={!!selectedWo}
        onClose={() => setSelectedWo(null)}
        title={`Work Order Detail — ${selectedWo?.woNumber ?? ''}`}
      >
        {selectedWo && (
          <div className="space-y-4 text-sm">
            <div className="p-3 rounded-lg bg-paper border border-rule space-y-1">
              <div className="text-ink font-semibold">{selectedWo.finishedItemName}</div>
              <div className="text-xs text-ink-3">
                BOM: {selectedWo.bomCode} · Site: {selectedWo.siteName} · Due: {selectedWo.requiredBy}
              </div>
            </div>
            {selectedWo.issuedRmQty > 0 && (
              <div className="p-3 rounded-lg bg-paper border border-rule">
                <div className="text-xs text-ink-3 mb-1">Yield Gauge (BR-06 ±3% Green Band)</div>
                {(() => {
                  const y = evaluateWoYieldStatus(
                    selectedWo.issuedRmQty,
                    selectedWo.actualOutputQty,
                    selectedWo.scrapQty,
                  );
                  return (
                    <div>
                      <div className="flex justify-between font-mono text-ink font-bold">
                        <span>{y.yieldPct}% ({y.label})</span>
                        <span>Issued {selectedWo.issuedRmQty} kg → Got {selectedWo.actualOutputQty} kg</span>
                      </div>
                      {y.warningBanner && (
                        <div className="mt-2 p-2 rounded bg-haldi-soft border border-haldi/30 text-haldi text-xs">
                          {y.warningBanner}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* Create WO Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create Work Order">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-ink-3 mb-1">Active BOM Recipe</label>
            <select
              value={newBomId}
              onChange={(e) => setNewBomId(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            >
              {boms.filter((b: any) => b.status === 'ACTIVE').map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.finishedItemName || b.outputItemName || b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-3 mb-1">Planned Qty (kg)</label>
              <input
                type="number"
                value={newQty}
                onChange={(e) => setNewQty(Number(e.target.value))}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Required By</label>
              <input
                type="text"
                value={newRequiredBy}
                onChange={(e) => setNewRequiredBy(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreateWo}>Create Work Order</Button>
          </div>
        </div>
      </Dialog>

      {/* Cancel WO Dialog */}
      <Dialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title={`Cancel ${cancelTarget?.woNumber ?? ''}`}
      >
        <div className="space-y-4">
          <textarea
            rows={3}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason required..."
            className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>Back</Button>
            <Button variant="primary" disabled={!cancelReason.trim()} onClick={handleCancelWo}>
              Confirm Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

