'use client';

import React, { useState } from 'react';
import { NumericKeypad } from '@neo/ui';
import { evaluateWoYieldStatus, maskWorkOrderForProdMgr } from '@neo/shared';
import { INITIAL_WORK_ORDERS, type WorkOrderRecord } from '../../../../src/lib/production-data';
import { useFloorOutbox } from '../../../../src/lib/floor-outbox';

export default function FloorProductionKanbanPage() {
  const { enqueueOrSend } = useFloorOutbox();
  const [workOrders, setWorkOrders] = useState<WorkOrderRecord[]>(() =>
    INITIAL_WORK_ORDERS.map((w) => maskWorkOrderForProdMgr(w as any) as WorkOrderRecord),
  );
  const [banner, setBanner] = useState<string | null>(null);

  // Active modals
  const [outputTarget, setOutputTarget] = useState<WorkOrderRecord | null>(null);
  const [outputQty, setOutputQty] = useState('0');
  const [packagingLot, setPackagingLot] = useState('LOT-1113-NEW');

  const [wastageTarget, setWastageTarget] = useState<WorkOrderRecord | null>(null);
  const [wastageQty, setWastageQty] = useState(5);
  const [wastageReason, setWastageReason] = useState('SPILLED');

  const [completeTarget, setCompleteTarget] = useState<WorkOrderRecord | null>(null);

  const handleStartWo = async (wo: WorkOrderRecord) => {
    const res = await enqueueOrSend({
      type: 'WO_START',
      endpoint: `/api/bff/production/work-orders/${wo.id}/start`,
      payload: { woId: wo.id, issuedRmQty: wo.plannedQty },
    });
    setWorkOrders((prev) =>
      prev.map((w) =>
        w.id === wo.id
          ? {
              ...w,
              status: 'IN_PROGRESS',
              issuedRmQty: w.plannedQty,
              startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }
          : w,
      ),
    );
    setBanner(`Started ${wo.woNumber} & issued RM. ${res.message}`);
  };

  const handleRecordOutput = async () => {
    if (!outputTarget) return;
    const qty = Number(outputQty) || 0;
    const res = await enqueueOrSend({
      type: 'WO_OUTPUT',
      endpoint: `/api/bff/production/work-orders/${outputTarget.id}/output`,
      payload: { woId: outputTarget.id, outputQty: qty, packagingLot },
    });
    setWorkOrders((prev) =>
      prev.map((w) =>
        w.id === outputTarget.id
          ? { ...w, actualOutputQty: w.actualOutputQty + qty, packagingLot }
          : w,
      ),
    );
    setBanner(`Recorded ${qty} ${outputTarget.uom} output on ${outputTarget.woNumber}. ${res.message}`);
    setOutputTarget(null);
  };

  const handleRecordWastage = async () => {
    if (!wastageTarget) return;
    const res = await enqueueOrSend({
      type: 'WO_WASTAGE',
      endpoint: '/api/bff/production/wastage',
      payload: { woId: wastageTarget.id, qty: wastageQty, reason: wastageReason },
    });
    setWorkOrders((prev) =>
      prev.map((w) =>
        w.id === wastageTarget.id ? { ...w, scrapQty: w.scrapQty + wastageQty } : w,
      ),
    );
    setBanner(`Logged ${wastageQty} ${wastageTarget.uom} wastage (${wastageReason}). ${res.message}`);
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
      endpoint: `/api/bff/production/work-orders/${completeTarget.id}/complete`,
      payload: {
        woId: completeTarget.id,
        actualOutputQty: completeTarget.actualOutputQty,
        yieldVarianceException: evalRes.raisesYieldVarianceException,
      },
    });

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
    setBanner(
      evalRes.warningBanner
        ? `Completed ${completeTarget.woNumber}! ${evalRes.warningBanner}`
        : `Completed ${completeTarget.woNumber} (${evalRes.yieldPct}% yield). ${res.message}`,
    );
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
            Start batches, record output &amp; wastage, and complete with BR-06 yield check.
          </p>
        </div>
      </div>

      {banner && (
        <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 font-semibold text-base">
          {banner}
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
                  {wo.actualOutputQty} / {wo.plannedQty} {wo.uom} ({pct}%)
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOutputTarget(wo);
                      setOutputQty('100');
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

