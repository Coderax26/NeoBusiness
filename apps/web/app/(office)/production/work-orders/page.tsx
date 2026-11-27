'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Card, Dialog } from '@neo/ui';
import { evaluateWoYieldStatus, type BomRecord } from '@neo/shared';
import { type WorkOrderRecord } from '../../../../src/lib/production-data';

interface WorkOrderMaterialLine {
  id: string;
  itemId: string;
  itemName: string;
  plannedQty: string;
  actualQty: string;
  uom: string;
  batchId?: string | null;
}

interface WorkOrderOutputLine {
  id: string;
  itemId: string;
  itemName: string;
  actualQty: string;
  uom: string;
  batchNumber?: string | null;
}

interface WorkOrderViewRecord extends WorkOrderRecord {
  materials: WorkOrderMaterialLine[];
  outputs: WorkOrderOutputLine[];
}

function normalizeWorkOrder(w: any): WorkOrderViewRecord {
  const materials: WorkOrderMaterialLine[] = Array.isArray(w.materials)
    ? w.materials.map((m: any) => ({
        id: String(m.id ?? ''),
        itemId: String(m.itemId ?? m.item_id ?? ''),
        itemName: String(m.itemName ?? m.item_name ?? 'RM Item'),
        plannedQty: String(m.plannedQty ?? m.planned_qty ?? '0'),
        actualQty: String(m.actualQty ?? m.actual_qty ?? '0'),
        uom: String(m.uom ?? 'KG'),
        batchId: m.batchId ?? m.batch_id ?? null,
      }))
    : [];

  const outputs: WorkOrderOutputLine[] = Array.isArray(w.outputs)
    ? w.outputs.map((o: any) => ({
        id: String(o.id ?? ''),
        itemId: String(o.itemId ?? o.item_id ?? ''),
        itemName: String(o.itemName ?? o.item_name ?? 'FG Item'),
        actualQty: String(o.actualQty ?? o.actual_qty ?? o.qtyProduced ?? '0'),
        uom: String(o.uom ?? 'KG'),
        batchNumber: o.batchNumber ?? o.batch_number ?? null,
      }))
    : [];

  const issuedFromMaterials = materials.reduce((s, m) => s + Number(m.actualQty || 0), 0);
  const outputFromOutputs = outputs.reduce((s, o) => s + Number(o.actualQty || 0), 0);

  return {
    id: String(w.id),
    woNumber: String(w.woNumber ?? w.woNo ?? w.wo_no ?? ''),
    finishedItemId: String(w.finishedItemId ?? ''),
    finishedItemName: String(w.finishedItemName ?? 'Item'),
    bomId: String(w.bomId ?? w.bomHeaderId ?? ''),
    bomCode: String(w.bomCode ?? w.bomNo ?? ''),
    siteName: String(w.siteName ?? w.siteId ?? 'Plant'),
    plannedQty: Number(w.plannedQty ?? 0),
    issuedRmQty: Number(w.issuedRmQty ?? issuedFromMaterials),
    actualOutputQty: Number(w.actualOutputQty ?? outputFromOutputs),
    scrapQty: Number(w.scrapQty ?? 0),
    uom: String(w.uom ?? 'KG'),
    status: (w.status ?? 'PLANNED') as WorkOrderRecord['status'],
    requiredBy: String(w.requiredBy ?? (w.createdAt ? String(w.createdAt).slice(0, 10) : '')),
    materials,
    outputs,
  };
}

export default function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrderViewRecord[]>([]);
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [viewMode, setViewMode] = useState<'LIST' | 'KANBAN'>('LIST');
  const [selectedWo, setSelectedWo] = useState<WorkOrderViewRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newBomId, setNewBomId] = useState('');
  const [newQty, setNewQty] = useState(500);
  const [newRequiredBy, setNewRequiredBy] = useState(new Date().toISOString().slice(0, 10) + ' 14:00');
  const [cancelTarget, setCancelTarget] = useState<WorkOrderViewRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [activeSiteId, setActiveSiteId] = useState<string>('');
  const [consumeQtys, setConsumeQtys] = useState<Record<string, string>>({});
  const [outputQtyInput, setOutputQtyInput] = useState('');
  const [outputBatchLot, setOutputBatchLot] = useState('');
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async (siteIdFilter: string) => {
    const siteQuery = siteIdFilter ? `?siteId=${encodeURIComponent(siteIdFilter)}` : '';
    const [woRes, bomRes] = await Promise.all([
      fetch(`/api/proxy/production/work-orders${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/production/boms${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
    ]);
    const wos = Array.isArray(woRes) ? woRes : Array.isArray(woRes?.data) ? woRes.data : [];
    const bRows = Array.isArray(bomRes) ? bomRes : Array.isArray(bomRes?.data) ? bomRes.data : [];
    const normalizedWos = wos.map(normalizeWorkOrder);
    setWorkOrders(normalizedWos);
    setSelectedWo((prev) =>
      prev ? normalizedWos.find((w: WorkOrderViewRecord) => w.id === prev.id) ?? null : null,
    );
    const normalizedBoms: BomRecord[] = bRows.map((b: any) => ({
      ...b,
      id: String(b.id),
      code: String(b.code ?? b.bomNo ?? 'BOM'),
      finishedItemId: String(b.finishedItemId ?? b.itemId ?? ''),
      finishedItemName: String(b.finishedItemName ?? b.itemName ?? 'Item'),
      outputUom: String(b.outputUom ?? b.uom ?? 'KG'),
      ingredients: Array.isArray(b.ingredients) ? b.ingredients : Array.isArray(b.lines) ? b.lines : [],
    }));
    setBoms(normalizedBoms);
    if (normalizedBoms.length > 0 && !newBomId) {
      const firstActive = normalizedBoms.find((b) => b.status === 'ACTIVE') ?? normalizedBoms[0];
      setNewBomId(firstActive.id);
    }
  }, [newBomId]);

  useEffect(() => {
    const storedSite =
      typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') ?? '' : '';
    const effectiveSite = storedSite && storedSite !== 'all' ? storedSite : '';
    setActiveSiteId(effectiveSite);

    if (!effectiveSite) {
      fetch('/api/auth/me')
        .then((r) => (r.ok ? r.json() : null))
        .then((me) => {
          const fallbackSite = me?.user?.activeSiteId || me?.user?.sites?.[0]?.id || '';
          if (fallbackSite) setActiveSiteId(String(fallbackSite));
        })
        .catch(() => {});
    }

    loadData(effectiveSite).catch(() => {});
  }, [loadData]);

  const openWoDetail = (wo: WorkOrderViewRecord) => {
    setSelectedWo(wo);
    const initialConsume: Record<string, string> = {};
    for (const m of wo.materials) {
      initialConsume[m.itemId] = String(Number(m.plannedQty) || '');
    }
    setConsumeQtys(initialConsume);
    setOutputQtyInput(String(wo.plannedQty));
    setOutputBatchLot(`FG-${wo.woNumber}`);
  };

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
      setBusy(true);
      const res = await fetch('/api/proxy/production/work-orders', {
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
      await loadData(activeSiteId);
      setCreateOpen(false);
      setToast(`Created Work Order ${woNo}.`);
    } catch (err) {
      setToast(`Failed to create Work Order: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleStartWo = async (wo: WorkOrderViewRecord) => {
    try {
      setBusy(true);
      const res = await fetch(`/api/proxy/production/work-orders/${encodeURIComponent(wo.id)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: activeSiteId || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadData(activeSiteId);
      setToast(`Started Work Order ${wo.woNumber}.`);
    } catch (err) {
      setToast(`Failed to start Work Order: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRecordConsumption = async (wo: WorkOrderViewRecord) => {
    const lines = wo.materials
      .filter((m) => Number(consumeQtys[m.itemId] || 0) > 0)
      .map((m) => ({
        itemId: m.itemId,
        actualQty: String(consumeQtys[m.itemId]),
        uom: m.uom,
      }));
    if (lines.length === 0) {
      setToast('Enter positive RM consumption quantity for at least one material.');
      return;
    }
    try {
      setBusy(true);
      const res = await fetch(
        `/api/proxy/production/work-orders/${encodeURIComponent(wo.id)}/consumption`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadData(activeSiteId);
      setToast(`Recorded RM consumption for ${wo.woNumber}.`);
    } catch (err) {
      setToast(`Failed to record consumption: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRecordOutput = async (wo: WorkOrderViewRecord) => {
    const qtyVal = Number(outputQtyInput || 0);
    if (qtyVal <= 0) {
      setToast('Output quantity must be positive.');
      return;
    }
    try {
      setBusy(true);
      const res = await fetch(
        `/api/proxy/production/work-orders/${encodeURIComponent(wo.id)}/output`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lines: [
              {
                itemId: wo.finishedItemId,
                actualQty: String(qtyVal),
                uom: wo.uom,
                batchNumber: outputBatchLot || undefined,
              },
            ],
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadData(activeSiteId);
      setToast(`Recorded ${qtyVal} ${wo.uom} FG output on ${wo.woNumber}.`);
    } catch (err) {
      setToast(`Failed to record output: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteWo = async (wo: WorkOrderViewRecord) => {
    try {
      setBusy(true);
      const res = await fetch(
        `/api/proxy/production/work-orders/${encodeURIComponent(wo.id)}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: activeSiteId || undefined }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json().catch(() => null);
      const result = data?.data ?? data;
      await loadData(activeSiteId);
      setToast(
        result?.yieldExceptionId
          ? `Completed ${wo.woNumber} — YIELD_VARIANCE exception raised (variance ${result.yieldVariancePct}% > ±${result.tolerancePct ?? 3}%).`
          : `Completed ${wo.woNumber} within OD-012 ±3% mass-balance tolerance.`,
      );
    } catch (err) {
      setToast(`Failed to complete Work Order: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCancelWo = async () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    try {
      setBusy(true);
      const res = await fetch(
        `/api/proxy/production/work-orders/${encodeURIComponent(cancelTarget.id)}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: cancelReason }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadData(activeSiteId);
      setCancelTarget(null);
      setCancelReason('');
      setToast(`Cancelled Work Order ${cancelTarget.woNumber}.`);
    } catch (err) {
      setToast(`Failed to cancel Work Order: ${(err as Error).message}`);
    } finally {
      setBusy(false);
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
            Track planned, running, and completed batches with BR-06 OD-012 yield gauges.
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
                    onClick={() => openWoDetail(wo)}
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
                        <span className="text-xs text-ink-3">
                          {wo.status === 'PLANNED' ? 'Not started' : 'No RM consumed'}
                        </span>
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
                      {wo.status === 'PLANNED' && (
                        <button
                          onClick={() => handleStartWo(wo)}
                          disabled={busy}
                          className="text-xs text-action hover:text-action font-medium"
                        >
                          Start
                        </button>
                      )}
                      <button
                        onClick={() => openWoDetail(wo)}
                        className="text-xs text-orange-400 hover:text-orange-300 font-medium"
                      >
                        Detail
                      </button>
                      {(wo.status === 'PLANNED' || wo.status === 'IN_PROGRESS') && (
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

      {/* Detail & Execution Modal */}
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
                BOM: {selectedWo.bomCode} · Status: {selectedWo.status} · Planned: {selectedWo.plannedQty} {selectedWo.uom}
              </div>
            </div>

            {selectedWo.status === 'PLANNED' && (
              <div className="flex justify-end">
                <Button variant="primary" disabled={busy} onClick={() => handleStartWo(selectedWo)}>
                  ▶ Start Batch (Reserve RM)
                </Button>
              </div>
            )}

            {selectedWo.status === 'IN_PROGRESS' && (
              <>
                <div className="p-3 rounded-lg bg-paper border border-rule space-y-2">
                  <div className="text-xs font-semibold uppercase text-ink-3">
                    Raw Material Consumption (M3 InventoryPort)
                  </div>
                  {selectedWo.materials.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="text-ink font-medium truncate">{m.itemName}</div>
                        <div className="text-ink-3 font-mono">
                          Plan: {m.plannedQty} · Issued: {m.actualQty} {m.uom}
                        </div>
                      </div>
                      <input
                        type="number"
                        value={consumeQtys[m.itemId] ?? ''}
                        onChange={(e) =>
                          setConsumeQtys((prev) => ({ ...prev, [m.itemId]: e.target.value }))
                        }
                        className="w-24 bg-sheet border border-rule-strong rounded px-2 py-1 text-xs font-mono text-ink"
                      />
                    </div>
                  ))}
                  <div className="flex justify-end pt-1">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => handleRecordConsumption(selectedWo)}
                    >
                      Record Consumption
                    </Button>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-paper border border-rule space-y-2">
                  <div className="text-xs font-semibold uppercase text-ink-3">
                    Finished Goods Output (M3 FG Batch Receipt)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder={`Qty (${selectedWo.uom})`}
                      value={outputQtyInput}
                      onChange={(e) => setOutputQtyInput(e.target.value)}
                      className="bg-sheet border border-rule-strong rounded px-2 py-1.5 text-xs font-mono text-ink"
                    />
                    <input
                      type="text"
                      placeholder="Batch Lot #"
                      value={outputBatchLot}
                      onChange={(e) => setOutputBatchLot(e.target.value)}
                      className="bg-sheet border border-rule-strong rounded px-2 py-1.5 text-xs font-mono text-ink"
                    />
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => handleRecordOutput(selectedWo)}
                    >
                      Record Output
                    </Button>
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() => handleCompleteWo(selectedWo)}
                    >
                      ✓ Complete Batch (BR-06)
                    </Button>
                  </div>
                </div>
              </>
            )}

            {selectedWo.issuedRmQty > 0 && (
              <div className="p-3 rounded-lg bg-paper border border-rule">
                <div className="text-xs text-ink-3 mb-1">Yield Gauge (BR-06 ±3% Mass Balance)</div>
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
                        <span>Issued {selectedWo.issuedRmQty} → Out {selectedWo.actualOutputQty}</span>
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
            <Button variant="primary" disabled={busy} onClick={handleCreateWo}>Create Work Order</Button>
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
            <Button variant="primary" disabled={!cancelReason.trim() || busy} onClick={handleCancelWo}>
              Confirm Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
