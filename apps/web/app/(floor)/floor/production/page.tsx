'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { NumericKeypad } from '@neo/ui';
import { evaluateWoYieldStatus, maskWorkOrderForProdMgr } from '@neo/shared';
import { type WorkOrderRecord } from '../../../../src/lib/production-data';
import { useFloorOutbox } from '../../../../src/lib/floor-outbox';

interface FloorWoMaterial {
  id: string;
  itemId: string;
  itemName: string;
  plannedQty: string;
  actualQty: string;
  uom: string;
}

interface FloorWorkOrder extends WorkOrderRecord {
  materials?: FloorWoMaterial[];
}

function mapFloorReasonToDto(reason: string): 'NORMAL' | 'ABNORMAL' | 'EXPIRY' | 'DAMAGE' {
  if (reason === 'BURNT') return 'ABNORMAL';
  if (reason === 'SPILLED' || reason === 'QUALITY_REJECT') return 'DAMAGE';
  return 'NORMAL';
}

export default function FloorProductionKanbanPage() {
  const { enqueueOrSend } = useFloorOutbox();
  const [workOrders, setWorkOrders] = useState<FloorWorkOrder[]>([]);
  const [banner, setBanner] = useState<{ text: string; isError?: boolean } | null>(null);

  const loadWorkOrders = useCallback(async () => {
    const r = await fetch('/api/proxy/production/work-orders');
    const res = r.ok ? await r.json() : [];
    const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
    setWorkOrders(
      list.map((w: any) => {
        const mats: FloorWoMaterial[] = Array.isArray(w.materials)
          ? w.materials.map((m: any) => ({
              id: String(m.id ?? ''),
              itemId: String(m.itemId ?? m.item_id ?? ''),
              itemName: String(m.itemName ?? m.item_name ?? 'RM Item'),
              plannedQty: String(m.plannedQty ?? m.planned_qty ?? '0'),
              actualQty: String(m.actualQty ?? m.actual_qty ?? '0'),
              uom: String(m.uom ?? 'KG'),
            }))
          : [];
        const issuedFromMats = mats.reduce((s, m) => s + Number(m.actualQty || 0), 0);
        const outputFromArr = Array.isArray(w.outputs)
          ? w.outputs.reduce(
              (s: number, o: any) => s + Number(o.actualQty ?? o.actual_qty ?? o.qtyProduced ?? 0),
              0,
            )
          : 0;
        return maskWorkOrderForProdMgr({
          id: String(w.id),
          woNumber: String(w.woNo ?? w.wo_no ?? w.woNumber ?? String(w.id).slice(0, 8)),
          finishedItemId: String(w.finishedItemId ?? w.bomItemId ?? ''),
          finishedItemName: String(w.finishedItemName ?? w.fg_item_name ?? w.itemName ?? 'Production Item'),
          uom: String(w.uom ?? 'KG'),
          plannedQty: Number(w.plannedQty ?? w.planned_qty ?? 0),
          issuedRmQty: Number(w.issuedRmQty ?? issuedFromMats),
          actualOutputQty: Number(w.actualOutputQty ?? outputFromArr),
          scrapQty: Number(w.scrapQty ?? 0),
          status: w.status ?? 'PLANNED',
          requiredBy: String(w.requiredBy ?? (w.createdAt ? String(w.createdAt).slice(0, 10) : '')),
          startedAt: w.startedAt ?? w.started_at ?? '',
          packagingLot: w.packagingLot ?? w.packaging_lot ?? '',
          materials: mats,
        } as any) as FloorWorkOrder;
      }),
    );
  }, []);

  useEffect(() => {
    loadWorkOrders().catch(() => setWorkOrders([]));
  }, [loadWorkOrders]);

  // Active modals
  const [consumeTarget, setConsumeTarget] = useState<FloorWorkOrder | null>(null);
  const [consumeQtys, setConsumeQtys] = useState<Record<string, string>>({});

  const [outputTarget, setOutputTarget] = useState<FloorWorkOrder | null>(null);
  const [outputQty, setOutputQty] = useState('0');
  const [packagingLot, setPackagingLot] = useState('LOT-FG-NEW');

  const [wastageTarget, setWastageTarget] = useState<FloorWorkOrder | null>(null);
  const [wastageQty, setWastageQty] = useState(5);
  const [wastageReason, setWastageReason] = useState('SPILLED');

  const [completeTarget, setCompleteTarget] = useState<FloorWorkOrder | null>(null);

  const handleStartWo = async (wo: FloorWorkOrder) => {
    const res = await enqueueOrSend({
      type: 'WO_START',
      endpoint: `/api/proxy/production/work-orders/${wo.id}/start`,
      payload: {},
    });
    if (!res.ok && !res.queued) {
      setBanner({ text: `Could not start ${wo.woNumber}: ${res.message}`, isError: true });
      return;
    }
    if (res.ok && !res.queued) {
      await loadWorkOrders().catch(() => {});
    } else {
      setWorkOrders((prev) =>
        prev.map((w) =>
          w.id === wo.id
            ? {
                ...w,
                status: 'IN_PROGRESS',
                startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              }
            : w,
        ),
      );
    }
    setBanner({ text: `Started ${wo.woNumber}. ${res.message}` });
  };

  const handleRecordConsumption = async () => {
    if (!consumeTarget) return;
    const lines = (consumeTarget.materials ?? [])
      .filter((m) => Number(consumeQtys[m.itemId] || 0) > 0)
      .map((m) => ({
        itemId: m.itemId,
        actualQty: String(consumeQtys[m.itemId]),
        uom: m.uom,
      }));
    if (lines.length === 0) return;

    const r = await fetch(`/api/proxy/production/work-orders/${consumeTarget.id}/consumption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
    });
    if (r.ok) {
      await loadWorkOrders().catch(() => {});
      setBanner({ text: `Issued RM batch materials for ${consumeTarget.woNumber}.` });
    } else {
      const err = await r.json().catch(() => null);
      setBanner({ text: `Failed to issue RM: ${err?.message || `HTTP ${r.status}`}`, isError: true });
    }
    setConsumeTarget(null);
  };

  const handleRecordOutput = async () => {
    if (!outputTarget) return;
    const qty = Number(outputQty) || 0;
    const res = await enqueueOrSend({
      type: 'WO_OUTPUT',
      endpoint: `/api/proxy/production/work-orders/${outputTarget.id}/output`,
      payload: {
        lines: [
          {
            itemId: outputTarget.finishedItemId,
            actualQty: String(qty),
            uom: outputTarget.uom,
            batchNumber: packagingLot || undefined,
          },
        ],
      },
    });
    if (!res.ok && !res.queued) {
      setBanner({ text: `Output failed: ${res.message}`, isError: true });
      setOutputTarget(null);
      return;
    }
    if (res.ok && !res.queued) {
      await loadWorkOrders().catch(() => {});
    } else {
      setWorkOrders((prev) =>
        prev.map((w) =>
          w.id === outputTarget.id
            ? { ...w, actualOutputQty: w.actualOutputQty + qty, packagingLot }
            : w,
        ),
      );
    }
    setBanner({ text: `Recorded ${qty} ${outputTarget.uom} output on ${outputTarget.woNumber}. ${res.message}` });
    setOutputTarget(null);
  };

  const handleRecordWastage = async () => {
    if (!wastageTarget) return;
    const res = await enqueueOrSend({
      type: 'WO_WASTAGE',
      endpoint: '/api/proxy/production/wastage',
      payload: {
        workOrderId: wastageTarget.id,
        itemId: wastageTarget.finishedItemId,
        qty: String(wastageQty),
        uom: wastageTarget.uom,
        reasonType: mapFloorReasonToDto(wastageReason),
      },
    });
    if (!res.ok && !res.queued) {
      setBanner({ text: `Wastage failed: ${res.message}`, isError: true });
      setWastageTarget(null);
      return;
    }
    setWorkOrders((prev) =>
      prev.map((w) =>
        w.id === wastageTarget.id ? { ...w, scrapQty: w.scrapQty + wastageQty } : w,
      ),
    );
    setBanner({ text: `Logged ${wastageQty} ${wastageTarget.uom} wastage (${wastageReason}). ${res.message}` });
    setWastageTarget(null);
  };

  const handleCompleteWo = async () => {
    if (!completeTarget) return;
    const issued = completeTarget.issuedRmQty || completeTarget.plannedQty;
    const evalRes = evaluateWoYieldStatus(
      issued,
      completeTarget.actualOutputQty,
      completeTarget.scrapQty,
    );

    const res = await enqueueOrSend({
      type: 'WO_COMPLETE',
      endpoint: `/api/proxy/production/work-orders/${completeTarget.id}/complete`,
      payload: {},
    });

    if (!res.ok && !res.queued) {
      setBanner({ text: `Could not complete ${completeTarget.woNumber}: ${res.message}`, isError: true });
      setCompleteTarget(null);
      return;
    }

    if (res.ok && !res.queued) {
      await loadWorkOrders().catch(() => {});
    } else {
      setWorkOrders((prev) =>
        prev.map((w) =>
          w.id === completeTarget.id
            ? {
                ...w,
                status: 'COMPLETED',
                yieldVarianceException: evalRes.raisesYieldVarianceException,
              }
            : w,
        ),
      );
    }
    setBanner({
      text: evalRes.warningBanner
        ? `Completed ${completeTarget.woNumber}! ${evalRes.warningBanner}`
        : `Completed ${completeTarget.woNumber} (${evalRes.yieldPct}% yield). ${res.message}`,
    });
    setCompleteTarget(null);
  };

  const queued = workOrders.filter((w) => w.status === 'PLANNED');
  const inProgress = workOrders.filter((w) => w.status === 'IN_PROGRESS');
  const done = workOrders.filter((w) => w.status === 'COMPLETED');

  return (
    <div className="space-y-6" data-testid="floor-production-kanban">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Today&apos;s Production Kanban</h1>
          <p className="text-base text-zinc-400">
            Start batches, issue RM, record output &amp; wastage, and complete with BR-06 yield check.
          </p>
        </div>
      </div>

      {banner && (
        <div
          className={`p-4 rounded-xl border font-semibold text-base ${
            banner.isError
              ? 'bg-rose-500/20 border-rose-500/40 text-rose-200'
              : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* QUEUED */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <div className="text-sm font-black uppercase text-zinc-400">
            QUEUED ({queued.length})
          </div>
          {queued.map((wo) => (
            <div key={wo.id} className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="font-mono text-orange-400 font-bold">{wo.woNumber}</span>
                <span className="text-amber-400">⏰ {wo.requiredBy}</span>
              </div>
              <div className="text-xl font-bold text-white">{wo.finishedItemName}</div>
              <div className="text-sm text-zinc-400">
                Target: {wo.plannedQty} {wo.uom} {wo.customerName ? `· For ${wo.customerName}` : ''}
              </div>
              <button
                type="button"
                onClick={() => handleStartWo(wo)}
                className="w-full min-h-[56px] rounded-xl bg-orange-500 hover:bg-orange-400 text-zinc-950 font-black text-lg"
              >
                ▶ START BATCH
              </button>
            </div>
          ))}
        </div>

        {/* IN PROGRESS */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <div className="text-sm font-black uppercase text-orange-400">
            IN PROGRESS ({inProgress.length})
          </div>
          {inProgress.map((wo) => {
            const pct = Math.min(100, Math.round((wo.actualOutputQty / Math.max(1, wo.plannedQty)) * 100));
            return (
              <div key={wo.id} className="p-4 rounded-xl bg-zinc-950 border border-orange-500/40 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="font-mono text-orange-400 font-bold">{wo.woNumber}</span>
                  <span className="text-zinc-400">Started {wo.startedAt || 'Now'}</span>
                </div>
                <div className="text-xl font-bold text-white">{wo.finishedItemName}</div>
                <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-sm font-mono text-zinc-300">
                  {wo.actualOutputQty} / {wo.plannedQty} {wo.uom} ({pct}%) · RM Issued: {wo.issuedRmQty}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {(wo.materials?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const init: Record<string, string> = {};
                        for (const m of wo.materials ?? []) {
                          init[m.itemId] = String(Number(m.plannedQty) || '');
                        }
                        setConsumeQtys(init);
                        setConsumeTarget(wo);
                      }}
                      className="w-full min-h-[52px] rounded-xl bg-amber-500 text-zinc-950 font-black text-base"
                    >
                      ISSUE / CONSUME RM
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setOutputTarget(wo);
                      setOutputQty(String(wo.plannedQty));
                      setPackagingLot(`FG-${wo.woNumber}`);
                    }}
                    className="w-full min-h-[56px] rounded-xl bg-sky-500 text-zinc-950 font-black text-base"
                  >
                    RECORD OUTPUT
                  </button>
                  <button
                    type="button"
                    onClick={() => setWastageTarget(wo)}
                    className="w-full min-h-[56px] rounded-xl bg-zinc-800 border border-zinc-700 text-rose-300 font-bold text-base"
                  >
                    LOG WASTAGE
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompleteTarget(wo)}
                    className="w-full min-h-[56px] rounded-xl bg-emerald-500 text-zinc-950 font-black text-base"
                  >
                    ✓ COMPLETE BATCH
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* DONE */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <div className="text-sm font-black uppercase text-emerald-400">
            DONE ({done.length})
          </div>
          {done.map((wo) => {
            const y = evaluateWoYieldStatus(wo.issuedRmQty || wo.plannedQty, wo.actualOutputQty, wo.scrapQty);
            return (
              <div key={wo.id} className="p-4 rounded-xl bg-zinc-950 border border-emerald-500/30 space-y-2">
                <div className="font-mono text-sm text-emerald-400 font-bold">{wo.woNumber}</div>
                <div className="text-lg font-bold text-white">{wo.finishedItemName}</div>
                <div className="text-sm font-mono text-zinc-300">
                  Output: {wo.actualOutputQty} {wo.uom} · Yield {y.yieldPct}% ({y.label})
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Consume RM Modal */}
      {consumeTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-white">Issue RM — {consumeTarget.woNumber}</h3>
            <div className="space-y-2">
              {(consumeTarget.materials ?? []).map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-sm text-white">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{m.itemName}</div>
                    <div className="text-xs text-zinc-400">Plan {m.plannedQty} {m.uom}</div>
                  </div>
                  <input
                    type="number"
                    value={consumeQtys[m.itemId] ?? ''}
                    onChange={(e) =>
                      setConsumeQtys((prev) => ({ ...prev, [m.itemId]: e.target.value }))
                    }
                    className="w-28 min-h-[44px] bg-zinc-950 border border-zinc-700 rounded-xl px-3 text-white font-mono"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConsumeTarget(null)}
                className="flex-1 min-h-[52px] rounded-xl bg-zinc-800 text-white font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordConsumption}
                className="flex-1 min-h-[52px] rounded-xl bg-amber-500 text-zinc-950 font-black"
              >
                Confirm Issue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Output Keypad Modal */}
      {outputTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-bold text-white">Record Good Output ({outputTarget.uom})</h3>
            <input
              type="text"
              value={packagingLot}
              onChange={(e) => setPackagingLot(e.target.value)}
              placeholder="Packaging Lot"
              className="w-full min-h-[48px] bg-zinc-950 border border-zinc-700 rounded-xl px-3 text-base text-white"
            />
            <NumericKeypad
              value={outputQty}
              onChange={setOutputQty}
              onSubmit={handleRecordOutput}
              submitLabel="Save Output"
            />
            <button
              type="button"
              onClick={() => setOutputTarget(null)}
              className="w-full min-h-[48px] rounded-xl bg-zinc-800 text-zinc-300 font-bold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Wastage Modal */}
      {wastageTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-white">Report Production Wastage</h3>
            <div className="grid grid-cols-2 gap-2">
              {['BURNT', 'SPILLED', 'QUALITY_REJECT', 'OTHER'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setWastageReason(r)}
                  className={`min-h-[56px] rounded-xl border font-bold text-sm ${
                    wastageReason === r
                      ? 'bg-rose-500 text-white border-rose-400'
                      : 'bg-zinc-950 text-zinc-300 border-zinc-700'
                  }`}
                >
                  {r.replace('_', ' ')}
                </button>
              ))}
            </div>
            <input
              type="number"
              value={wastageQty}
              onChange={(e) => setWastageQty(Number(e.target.value))}
              className="w-full min-h-[56px] bg-zinc-950 border border-zinc-700 rounded-xl px-4 text-xl font-mono text-white"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setWastageTarget(null)}
                className="flex-1 min-h-[56px] rounded-xl bg-zinc-800 text-white font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordWastage}
                className="flex-1 min-h-[56px] rounded-xl bg-rose-500 text-white font-black"
              >
                Log Wastage
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Batch Yield Preview Modal */}
      {completeTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-xl font-bold text-white">Complete {completeTarget.woNumber}</h3>
            {(() => {
              const y = evaluateWoYieldStatus(
                completeTarget.issuedRmQty || completeTarget.plannedQty,
                completeTarget.actualOutputQty,
                completeTarget.scrapQty,
              );
              return (
                <div
                  className={`p-4 rounded-xl border text-sm ${
                    y.exceedsTolerance
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                      : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  }`}
                >
                  <div className="font-bold text-base">Yield: {y.yieldPct}% ({y.label})</div>
                  {y.warningBanner && <div className="mt-1">{y.warningBanner}</div>}
                </div>
              );
            })()}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCompleteTarget(null)}
                className="flex-1 min-h-[56px] rounded-xl bg-zinc-800 text-white font-bold"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCompleteWo}
                className="flex-1 min-h-[56px] rounded-xl bg-emerald-500 text-zinc-950 font-black"
              >
                Confirm Complete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
