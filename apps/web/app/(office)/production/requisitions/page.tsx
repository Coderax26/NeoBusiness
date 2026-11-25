'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, StatusPill } from '@neo/ui';
import { generateRmRequisitionsFromPlan, type BomRecord } from '@neo/shared';
import {
  type RmRequisitionRecord,
  type WorkOrderRecord,
} from '../../../../src/lib/production-data';
import { type StockRow } from '../../../../src/lib/inventory-data';

export default function ProductionRequisitionsPage() {
  const [reqs, setReqs] = useState<RmRequisitionRecord[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderRecord[]>([]);
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/proxy/production/requisitions').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/production/work-orders').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/production/boms').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/inventory/stock/current').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([reqRes, woRes, bomRes, stkRes]) => {
        if (!active) return;
        setReqs(Array.isArray(reqRes) ? reqRes : Array.isArray(reqRes?.data) ? reqRes.data : []);
        setWorkOrders(Array.isArray(woRes) ? woRes : Array.isArray(woRes?.data) ? woRes.data : []);
        setBoms(Array.isArray(bomRes) ? bomRes : Array.isArray(bomRes?.data) ? bomRes.data : []);
        setStockRows(Array.isArray(stkRes) ? stkRes : Array.isArray(stkRes?.data) ? stkRes.data : []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleGenerateFromPlan = () => {
    const stockByItemId: Record<string, number> = {};
    for (const s of stockRows) {
      stockByItemId[s.itemId] = (stockByItemId[s.itemId] ?? 0) + s.onHand;
    }

    const needs = generateRmRequisitionsFromPlan(
      workOrders,
      boms,
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
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/production" className="hover:text-ink">Production</Link>
            <span>/</span>
            <span className="text-orange-400">Material Requests (RM)</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Raw Material Requisitions</h1>
          <p className="text-sm text-ink-3">
            Auto-calculate RM shortfalls from planned Work Orders &amp; BOMs, approve, and convert to PO.
          </p>
        </div>
        <Button variant="primary" onClick={handleGenerateFromPlan}>
          ⚡ Generate from Production Plan
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
              <th className="p-3">Req #</th>
              <th className="p-3">Raw Material</th>
              <th className="p-3">Source WO</th>
              <th className="p-3 text-right">Qty Needed</th>
              <th className="p-3">Needed By</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {reqs.map((r) => (
              <tr key={r.id} className="hover:bg-sunken">
                <td className="p-3 font-mono text-xs text-orange-400 font-semibold">{r.reqNo}</td>
                <td className="p-3">
                  <div className="text-ink font-medium">{r.itemName}</div>
                  <div className="text-[11px] font-mono text-ink-3">{r.itemSku}</div>
                </td>
                <td className="p-3 text-xs font-mono text-ink-2">{r.sourceWoNo || 'Manual'}</td>
                <td className="p-3 text-right font-mono font-bold text-ink">
                  {r.qty} {r.uom}
                </td>
                <td className="p-3 text-xs font-mono text-ink-2">{r.neededBy}</td>
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
                      className="text-xs text-action hover:text-action font-medium"
                    >
                      Approve
                    </button>
                  )}
                  {r.status === 'APPROVED' && (
                    <button
                      onClick={() => updateStatus(r.id, 'PO_CREATED', 'convert-to-po')}
                      className="text-xs text-leaf hover:text-leaf font-medium"
                    >
                      Convert to PO
                    </button>
                  )}
                  {r.status === 'DRAFT' && (
                    <button
                      onClick={() => deleteDraft(r.id)}
                      className="text-xs text-madder hover:text-madder font-medium"
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

