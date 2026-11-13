'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, StatusPill } from '@neo/ui';
import { generateRmRequisitionsFromPlan } from '@neo/shared';
import {
  INITIAL_RM_REQUISITIONS,
  INITIAL_WORK_ORDERS,
  INITIAL_BOMS,
  type RmRequisitionRecord,
} from '../../../src/lib/production-data';
import { INITIAL_STOCK_ROWS } from '../../../src/lib/inventory-data';

export default function ProductionRequisitionsPage() {
  const [reqs, setReqs] = useState<RmRequisitionRecord[]>(INITIAL_RM_REQUISITIONS);
  const [toast, setToast] = useState<string | null>(null);

  const handleGenerateFromPlan = () => {
    const stockByItemId: Record<string, number> = {};
    for (const s of INITIAL_STOCK_ROWS) {
      stockByItemId[s.itemId] = (stockByItemId[s.itemId] ?? 0) + s.onHand;
    }

    const needs = generateRmRequisitionsFromPlan(
      INITIAL_WORK_ORDERS,
      INITIAL_BOMS,
      stockByItemId,
    );

    fetch('/api/bff/production/requisitions/generate', { method: 'POST' }).catch(() => {});

    const generated: RmRequisitionRecord[] = needs.map((n, idx) => ({
      id: `rmr-gen-${Date.now()}-${idx}`,
      reqNo: `RMREQ-2026-${Math.floor(20 + Math.random() * 70)}`,
      itemId: n.itemId,
      itemSku: n.itemSku,
      itemName: n.itemName,
      qty: n.shortfallQty,
      uom: n.uom,
      neededBy: '2026-11-15',
      sourceWoNo: 'Planned WOs',
      status: 'OPEN',
    }));

    setReqs((prev) => [...generated, ...prev]);
    setToast(
      `Generated ${generated.length} RM requisition(s) from planned Work Orders & BOMs minus available stock.`,
    );
  };

  const updateStatus = (id: string, status: RmRequisitionRecord['status'], endpoint: string) => {
    fetch(`/api/bff/production/requisitions/${id}/${endpoint}`, { method: 'POST' }).catch(() => {});
    setReqs((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    setToast(`Updated requisition to ${status}.`);
  };

  const deleteDraft = (id: string) => {
    fetch(`/api/bff/production/requisitions/${id}`, { method: 'DELETE' }).catch(() => {});
    setReqs((prev) => prev.filter((r) => r.id !== id));
    setToast('Deleted draft requisition.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
            <Link href="/production" className="hover:text-white">Production</Link>
            <span>/</span>
            <span className="text-orange-400">Material Requests (RM)</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Raw Material Requisitions</h1>
          <p className="text-sm text-zinc-400">
            Auto-calculate RM shortfalls from planned Work Orders &amp; BOMs, approve, and convert to PO.
          </p>
        </div>
        <Button variant="primary" onClick={handleGenerateFromPlan}>
          ⚡ Generate from Production Plan
        </Button>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm">
          {toast}
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950/80 border-b border-zinc-800 text-xs uppercase text-zinc-400">
            <tr>
              <th className="p-3">Req #</th>
              <th className="p-3">Raw Material</th>
              <th className="p-3">Source WO</th>
              <th className="p-3 text-right">Qty Needed</th>
              <th className="p-3">Needed By</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {reqs.map((r) => (
              <tr key={r.id} className="hover:bg-zinc-800/40">
                <td className="p-3 font-mono text-xs text-orange-400 font-semibold">{r.reqNo}</td>
                <td className="p-3">
                  <div className="text-white font-medium">{r.itemName}</div>
                  <div className="text-[11px] font-mono text-zinc-500">{r.itemSku}</div>
                </td>
                <td className="p-3 text-xs font-mono text-zinc-300">{r.sourceWoNo || 'Manual'}</td>
                <td className="p-3 text-right font-mono font-bold text-white">
                  {r.qty} {r.uom}
                </td>
                <td className="p-3 text-xs font-mono text-zinc-300">{r.neededBy}</td>
                <td className="p-3">
                  <StatusPill
                    status={r.status}
                    tone={
                      r.status === 'PO_CREATED' || r.status === 'APPROVED'
                        ? 'emerald'
                        : r.status === 'CANCELLED'
                          ? 'rose'
                          : 'amber'
                    }
                  />
                </td>
                <td className="p-3 text-right space-x-2">
                  {r.status === 'OPEN' && (
                    <button
                      onClick={() => updateStatus(r.id, 'APPROVED', 'approve')}
                      className="text-xs text-sky-400 hover:text-sky-300 font-medium"
                    >
                      Approve
                    </button>
                  )}
                  {r.status === 'APPROVED' && (
                    <button
                      onClick={() => updateStatus(r.id, 'PO_CREATED', 'convert-to-po')}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      Convert to PO
                    </button>
                  )}
                  {r.status === 'DRAFT' && (
                    <button
                      onClick={() => deleteDraft(r.id)}
                      className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

