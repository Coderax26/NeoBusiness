'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Card, Dialog } from '@neo/ui';
import { evaluateWoYieldStatus } from '@neo/shared';
import {
  INITIAL_WORK_ORDERS,
  INITIAL_BOMS,
  type WorkOrderRecord,
} from '../../../src/lib/production-data';

export default function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrderRecord[]>(INITIAL_WORK_ORDERS);
  const [viewMode, setViewMode] = useState<'LIST' | 'KANBAN'>('LIST');
  const [selectedWo, setSelectedWo] = useState<WorkOrderRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newBomId, setNewBomId] = useState(INITIAL_BOMS[0].id);
  const [newQty, setNewQty] = useState(500);
  const [newRequiredBy, setNewRequiredBy] = useState('2026-11-16 14:00');
  const [cancelTarget, setCancelTarget] = useState<WorkOrderRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const handleCreateWo = () => {
    const bom = INITIAL_BOMS.find((b) => b.id === newBomId) || INITIAL_BOMS[0];
    const created: WorkOrderRecord = {
      id: `wo-${Date.now()}`,
      woNumber: `WO-2026-0${Math.floor(92 + Math.random() * 90)}`,
      finishedItemId: bom.finishedItemId,
      finishedItemName: bom.finishedItemName,
      bomId: bom.id,
      bomCode: bom.code,
      siteName: 'Baramati Plant',
      plannedQty: newQty,
      issuedRmQty: 0,
      actualOutputQty: 0,
      scrapQty: 0,
      uom: bom.outputUom,
      status: 'PLANNED',
      requiredBy: newRequiredBy,
    };
    fetch('/api/bff/production/work-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(created),
    }).catch(() => {});
    setWorkOrders((prev) => [created, ...prev]);
    setCreateOpen(false);
    setToast(`Created Work Order ${created.woNumber}.`);
  };

  const handleCancelWo = () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    fetch(`/api/bff/production/work-orders/${cancelTarget.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: cancelReason }),
    }).catch(() => {});
    setWorkOrders((prev) =>
      prev.map((w) =>
        w.id === cancelTarget.id ? { ...w, status: 'CANCELLED', cancelReason } : w,
      ),
    );
    setCancelTarget(null);
    setCancelReason('');
    setToast(`Cancelled ${cancelTarget.woNumber}.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
            <Link href="/production" className="hover:text-white">Production</Link>
            <span>/</span>
            <span className="text-orange-400">Work Orders</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Production Work Orders</h1>
          <p className="text-sm text-zinc-400">
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
        <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm">
          {toast}
        </div>
      )}

      {viewMode === 'KANBAN' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['PLANNED', 'IN_PROGRESS', 'COMPLETED'] as const).map((status) => (
            <div key={status} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold uppercase text-zinc-400">
                {status.replace('_', ' ')} ({workOrders.filter((w) => w.status === status).length})
              </div>
              {workOrders
                .filter((w) => w.status === status)
                .map((wo) => (
                  <Card
                    key={wo.id}
                    className="p-3.5 bg-zinc-950 border-zinc-800 cursor-pointer hover:border-orange-500/60"
                    onClick={() => setSelectedWo(wo)}
                  >
                    <div className="flex justify-between text-xs">
                      <span className="font-mono text-orange-400 font-bold">{wo.woNumber}</span>
                      <span className="text-zinc-500">{wo.requiredBy}</span>
                    </div>
                    <div className="text-sm font-semibold text-white mt-1">
                      {wo.finishedItemName}
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      Plan: {wo.plannedQty} {wo.uom} {wo.linkedSalesOrderNo ? `· ${wo.linkedSalesOrderNo}` : ''}
                    </div>
                  </Card>
                ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950/80 border-b border-zinc-800 text-xs uppercase text-zinc-400">
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
            <tbody className="divide-y divide-zinc-800/70">
              {workOrders.map((wo) => {
                const y =
                  wo.issuedRmQty > 0
                    ? evaluateWoYieldStatus(wo.issuedRmQty, wo.actualOutputQty, wo.scrapQty)
                    : null;
                return (
                  <tr key={wo.id} className="hover:bg-zinc-800/40">
                    <td className="p-3 font-mono text-xs text-orange-400 font-semibold">
                      {wo.woNumber}
                    </td>
                    <td className="p-3">
                      <div className="text-white font-medium">{wo.finishedItemName}</div>
                      <div className="text-[11px] font-mono text-zinc-500">{wo.bomCode}</div>
                    </td>
                    <td className="p-3 text-xs font-mono text-zinc-300">
                      {wo.linkedSalesOrderNo || 'Stock'}
                    </td>
                    <td className="p-3 text-right font-mono text-white">
                      {wo.actualOutputQty} / {wo.plannedQty} {wo.uom}
                    </td>
                    <td className="p-3">
                      {y ? (
                        <Badge variant={y.exceedsTolerance ? 'warning' : 'success'}>
                          {y.yieldPct}% · {y.label}
                        </Badge>
                      ) : (
                        <span className="text-xs text-zinc-500">Not started</span>
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
                          className="text-xs text-rose-400 hover:text-rose-300 font-medium"
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
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1">
              <div className="text-white font-semibold">{selectedWo.finishedItemName}</div>
              <div className="text-xs text-zinc-400">
                BOM: {selectedWo.bomCode} · Site: {selectedWo.siteName} · Due: {selectedWo.requiredBy}
              </div>
            </div>
            {selectedWo.issuedRmQty > 0 && (
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <div className="text-xs text-zinc-400 mb-1">Yield Gauge (BR-06 ±3% Green Band)</div>
                {(() => {
                  const y = evaluateWoYieldStatus(
                    selectedWo.issuedRmQty,
                    selectedWo.actualOutputQty,
                    selectedWo.scrapQty,
                  );
                  return (
                    <div>
                      <div className="flex justify-between font-mono text-white font-bold">
                        <span>{y.yieldPct}% ({y.label})</span>
                        <span>Issued {selectedWo.issuedRmQty} kg → Got {selectedWo.actualOutputQty} kg</span>
                      </div>
                      {y.warningBanner && (
                        <div className="mt-2 p-2 rounded bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs">
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
            <label className="block text-xs text-zinc-400 mb-1">Active BOM Recipe</label>
            <select
              value={newBomId}
              onChange={(e) => setNewBomId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
            >
              {INITIAL_BOMS.filter((b) => b.status === 'ACTIVE').map((b) => (
                <option key={b.id} value={b.id}>
                  {b.finishedItemName} ({b.code})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Planned Qty (kg)</label>
              <input
                type="number"
                value={newQty}
                onChange={(e) => setNewQty(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Required By</label>
              <input
                type="text"
                value={newRequiredBy}
                onChange={(e) => setNewRequiredBy(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
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
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
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

