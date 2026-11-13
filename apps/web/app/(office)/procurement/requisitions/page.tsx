'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Dialog, Card } from '@neo/ui';
import { formatINR, groupRequisitionsBySupplier } from '@neo/shared';
import {
  INITIAL_REQUISITIONS,
  PROCUREMENT_ITEMS,
  PROCUREMENT_SUPPLIERS,
  type RequisitionRecord,
  type RequisitionSource,
  type RequisitionStatus,
} from '../../../src/lib/procurement-data';

const SOURCE_LABELS: Record<RequisitionSource, string> = {
  SALES_ORDER_BACK_TO_BACK: 'Sales Order (Back-to-Back)',
  PRODUCTION_RM: 'Production RM Request',
  MIN_STOCK: 'Min-Stock Trigger',
  MANUAL: 'Manual Request',
};

export default function RequisitionsPage() {
  const [requisitions, setRequisitions] = useState<RequisitionRecord[]>(INITIAL_REQUISITIONS);
  const [viewMode, setViewMode] = useState<'LIST' | 'GROUPED'>('LIST');
  const [statusFilter, setStatusFilter] = useState<RequisitionStatus | 'ALL'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<RequisitionSource | 'ALL'>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>(['req-1', 'req-2']);
  const [toast, setToast] = useState<string | null>(null);

  // Create Manual Requisition modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newItemId, setNewItemId] = useState(PROCUREMENT_ITEMS[0].id);
  const [newQty, setNewQty] = useState(500);
  const [newNeededBy, setNewNeededBy] = useState('2026-11-18');
  const [newReason, setNewReason] = useState('');
  const [newSupplierId, setNewSupplierId] = useState(PROCUREMENT_SUPPLIERS[0].id);

  // Convert-to-PO wizard modal
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertStep, setConvertStep] = useState<1 | 2>(1);
  const [createdPos, setCreatedPos] = useState<Array<{ poNumber: string; supplierName: string; total: number }>>([]);

  // Cancel modal
  const [cancelTarget, setCancelTarget] = useState<RequisitionRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const filteredReqs = useMemo(() => {
    return requisitions.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (sourceFilter !== 'ALL' && r.source !== sourceFilter) return false;
      return true;
    });
  }, [requisitions, statusFilter, sourceFilter]);

  const openSelectedReqs = useMemo(
    () =>
      requisitions.filter(
        (r) => r.status === 'OPEN' && selectedIds.includes(r.id),
      ),
    [requisitions, selectedIds],
  );

  const groupedBySupplier = useMemo(() => {
    const openReqs = requisitions.filter((r) => r.status === 'OPEN');
    return groupRequisitionsBySupplier(
      openReqs.map((r) => ({
        id: r.id,
        requisitionNo: r.requisitionNo,
        supplierId: r.preferredSupplierId,
        supplierName: r.preferredSupplierName,
        itemId: r.itemId,
        itemSku: r.itemSku,
        itemName: r.itemName,
        qty: r.qty,
        uom: r.uom,
        latestRate: r.latestRate,
        neededBy: r.neededBy,
      })),
    );
  }, [requisitions]);

  const selectedGroupsForPo = useMemo(() => {
    return groupRequisitionsBySupplier(
      openSelectedReqs.map((r) => ({
        id: r.id,
        requisitionNo: r.requisitionNo,
        supplierId: r.preferredSupplierId,
        supplierName: r.preferredSupplierName,
        itemId: r.itemId,
        itemSku: r.itemSku,
        itemName: r.itemName,
        qty: r.qty,
        uom: r.uom,
        latestRate: r.latestRate,
        neededBy: r.neededBy,
      })),
    );
  }, [openSelectedReqs]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleCreateManual = async () => {
    const item = PROCUREMENT_ITEMS.find((i) => i.id === newItemId) || PROCUREMENT_ITEMS[0];
    const supplier = PROCUREMENT_SUPPLIERS.find((s) => s.id === newSupplierId) || PROCUREMENT_SUPPLIERS[0];
    const created: RequisitionRecord = {
      id: `req-${Date.now()}`,
      requisitionNo: `REQ-2026-0${Math.floor(50 + Math.random() * 49)}`,
      source: 'MANUAL',
      itemId: item.id,
      itemSku: item.sku,
      itemName: item.name,
      qty: newQty,
      uom: item.uom,
      neededBy: newNeededBy,
      reason: newReason || 'Manual coordinator indent',
      status: 'OPEN',
      preferredSupplierId: supplier.id,
      preferredSupplierName: supplier.name,
      latestRate: item.lastRate,
      siteId: 'site-1',
      siteName: 'Pune Central Depot',
      createdAt: 'Just now',
    };

    fetch('/api/bff/procurement/requisitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(created),
    }).catch(() => {});

    setRequisitions((prev) => [created, ...prev]);
    setCreateOpen(false);
    setNewReason('');
    showToast(`Created manual requisition ${created.requisitionNo}`);
  };

  const handleConfirmConvertToPo = async () => {
    if (selectedGroupsForPo.length === 0) return;

    fetch('/api/bff/procurement/requisitions/convert-to-po', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requisitionIds: openSelectedReqs.map((r) => r.id),
      }),
    }).catch(() => {});

    const generated = selectedGroupsForPo.map((grp, idx) => ({
      poNumber: `PO-2026-${110 + idx}`,
      supplierName: grp.supplierName,
      total: grp.estimatedTotal,
    }));

    const convertedIds = new Set(openSelectedReqs.map((r) => r.id));
    setRequisitions((prev) =>
      prev.map((r) => (convertedIds.has(r.id) ? { ...r, status: 'PO_CREATED' } : r)),
    );
    setSelectedIds([]);
    setCreatedPos(generated);
    setConvertStep(2);
    showToast(`Converted into ${generated.length} PO(s) — one per supplier.`);
  };

  const handleCancelRequisition = async () => {
    if (!cancelTarget || !cancelReason.trim()) return;

    fetch(`/api/bff/procurement/requisitions/${cancelTarget.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: cancelReason }),
    }).catch(() => {});

    setRequisitions((prev) =>
      prev.map((r) =>
        r.id === cancelTarget.id ? { ...r, status: 'CANCELLED', cancelReason } : r,
      ),
    );
    showToast(`Cancelled ${cancelTarget.requisitionNo}`);
    setCancelTarget(null);
    setCancelReason('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
            <Link href="/procurement" className="hover:text-white">Procurement</Link>
            <span>/</span>
            <span className="text-indigo-400">Requisitions</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Purchase Requisitions</h1>
          <p className="text-sm text-zinc-400">
            Review demand from Sales Orders, Production, Min-Stock &amp; Manual requests; group by supplier to convert into POs.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={viewMode === 'GROUPED' ? 'primary' : 'secondary'}
            onClick={() => setViewMode(viewMode === 'LIST' ? 'GROUPED' : 'LIST')}
          >
            {viewMode === 'LIST' ? 'Group by Supplier' : 'All Requisitions List'}
          </Button>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            + Manual Requisition
          </Button>
        </div>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm">
          {toast}
        </div>
      )}

      {/* Filter bar + Convert CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
        <div className="flex flex-wrap gap-2">
          {(['ALL', 'OPEN', 'PO_CREATED', 'CANCELLED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === st
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {st === 'ALL' ? 'All Statuses' : st.replace('_', ' ')}
            </button>
          ))}

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as any)}
            className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
          >
            <option value="ALL">All Sources</option>
            <option value="SALES_ORDER_BACK_TO_BACK">Sales Order Back-to-Back</option>
            <option value="PRODUCTION_RM">Production RM</option>
            <option value="MIN_STOCK">Min-Stock</option>
            <option value="MANUAL">Manual</option>
          </select>
        </div>

        <Button
          variant="primary"
          disabled={openSelectedReqs.length === 0}
          onClick={() => {
            setCreatedPos([]);
            setConvertStep(1);
            setConvertOpen(true);
          }}
        >
          Convert Selected ({openSelectedReqs.length}) to PO
        </Button>
      </div>

      {viewMode === 'GROUPED' ? (
        <div className="space-y-4">
          {groupedBySupplier.length === 0 ? (
            <Card className="p-8 text-center text-zinc-400 bg-zinc-900 border-zinc-800">
              No open requisitions left to group.
            </Card>
          ) : (
            groupedBySupplier.map((group) => {
              const allChecked = group.requisitionIds.every((id) =>
                selectedIds.includes(id),
              );
              return (
                <Card key={group.supplierId} className="p-5 bg-zinc-900 border-zinc-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={() => {
                          if (allChecked) {
                            setSelectedIds((prev) =>
                              prev.filter((id) => !group.requisitionIds.includes(id)),
                            );
                          } else {
                            setSelectedIds((prev) =>
                              Array.from(new Set([...prev, ...group.requisitionIds])),
                            );
                          }
                        }}
                        className="h-4 w-4 accent-indigo-500"
                      />
                      <div>
                        <h3 className="text-base font-semibold text-white">
                          {group.supplierName}
                        </h3>
                        <p className="text-xs text-zinc-400">
                          {group.lines.length} open requisition(s) → will consolidate into 1 PO
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-zinc-400">Estimated PO Value</div>
                      <div className="text-lg font-bold text-emerald-400 font-mono">
                        {formatINR(group.estimatedTotal)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 divide-y divide-zinc-800/60">
                    {group.lines.map((line) => (
                      <div
                        key={line.id}
                        className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <div>
                          <span className="font-mono text-xs text-indigo-400 mr-2">
                            {line.requisitionNo}
                          </span>
                          <span className="text-zinc-200 font-medium">{line.itemName}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-mono text-zinc-300">
                          <span>
                            {line.qty} {line.uom}
                          </span>
                          <span>@ ₹{line.latestRate}/{line.uom}</span>
                          <span className="text-zinc-400">Need by {line.neededBy}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-950/80 border-b border-zinc-800 text-xs uppercase text-zinc-400">
                <tr>
                  <th className="p-3 w-10">Sel</th>
                  <th className="p-3">Req #</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Item</th>
                  <th className="p-3">Qty</th>
                  <th className="p-3">Preferred Supplier</th>
                  <th className="p-3">Needed By</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {filteredReqs.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-800/40">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        disabled={r.status !== 'OPEN'}
                        checked={selectedIds.includes(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="h-4 w-4 accent-indigo-500"
                      />
                    </td>
                    <td className="p-3 font-mono text-xs text-indigo-400 font-semibold">
                      {r.requisitionNo}
                    </td>
                    <td className="p-3">
                      <div className="text-xs font-medium text-zinc-200">
                        {SOURCE_LABELS[r.source]}
                      </div>
                      {r.sourceRefLabel && (
                        <div className="text-[11px] text-zinc-500">{r.sourceRefLabel}</div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="text-zinc-100 font-medium">{r.itemName}</div>
                      <div className="text-[11px] text-zinc-500">{r.reason}</div>
                    </td>
                    <td className="p-3 font-mono text-zinc-200">
                      {r.qty} {r.uom}
                    </td>
                    <td className="p-3 text-zinc-300 text-xs">
                      <div>{r.preferredSupplierName}</div>
                      <div className="text-zinc-500 font-mono">Last: ₹{r.latestRate}/{r.uom}</div>
                    </td>
                    <td className="p-3 text-xs text-zinc-300 font-mono">{r.neededBy}</td>
                    <td className="p-3">
                      <StatusPill
                        status={r.status}
                        tone={
                          r.status === 'OPEN'
                            ? 'amber'
                            : r.status === 'PO_CREATED'
                              ? 'emerald'
                              : 'slate'
                        }
                      />
                    </td>
                    <td className="p-3 text-right">
                      {r.status === 'OPEN' && (
                        <button
                          onClick={() => setCancelTarget(r)}
                          className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Manual Requisition Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Manual Requisition"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Item</label>
            <select
              value={newItemId}
              onChange={(e) => setNewItemId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
            >
              {PROCUREMENT_ITEMS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.sku})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Quantity</label>
              <input
                type="number"
                value={newQty}
                onChange={(e) => setNewQty(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Needed By</label>
              <input
                type="date"
                value={newNeededBy}
                onChange={(e) => setNewNeededBy(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Preferred Supplier</label>
            <select
              value={newSupplierId}
              onChange={(e) => setNewSupplierId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
            >
              {PROCUREMENT_SUPPLIERS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (Fill {s.fillRate}%)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Reason</label>
            <input
              type="text"
              placeholder="e.g., Extra weekend production buffer"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateManual}>
              Save Requisition
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Convert to PO Wizard Dialog */}
      <Dialog
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        title="Convert Requisitions to Purchase Orders"
      >
        {convertStep === 1 ? (
          <div className="space-y-4">
            <p className="text-xs text-zinc-400">
              Selected requisitions are grouped by supplier. Confirming will generate{' '}
              <strong className="text-white">{selectedGroupsForPo.length} PO(s)</strong> (one per supplier).
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {selectedGroupsForPo.map((grp) => (
                <div
                  key={grp.supplierId}
                  className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {grp.supplierName}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {grp.lines.map((l) => `${l.itemName} (${l.qty} ${l.uom})`).join(' + ')}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-emerald-400 font-mono">
                    {formatINR(grp.estimatedTotal)}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setConvertOpen(false)}>
                Close
              </Button>
              <Button variant="primary" onClick={handleConfirmConvertToPo}>
                Create {selectedGroupsForPo.length} PO(s)
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
              Successfully created {createdPos.length} Purchase Order(s):
            </div>
            {createdPos.map((po) => (
              <div
                key={po.poNumber}
                className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between"
              >
                <div>
                  <span className="font-mono text-indigo-400 font-semibold">
                    {po.poNumber}
                  </span>
                  <span className="text-sm text-zinc-200 ml-2">{po.supplierName}</span>
                </div>
                <span className="font-mono text-sm text-white">{formatINR(po.total)}</span>
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConvertOpen(false)}>
                Done
              </Button>
              <Link href="/procurement/purchase-orders">
                <Button variant="primary">Open Purchase Orders →</Button>
              </Link>
            </div>
          </div>
        )}
      </Dialog>

      {/* Cancel Requisition Dialog */}
      <Dialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title={`Cancel ${cancelTarget?.requisitionNo ?? ''}`}
      >
        <div className="space-y-4">
          <p className="text-xs text-zinc-400">
            Please provide a reason for cancelling this requisition.
          </p>
          <textarea
            rows={3}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason required..."
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>
              Back
            </Button>
            <Button
              variant="primary"
              disabled={!cancelReason.trim()}
              onClick={handleCancelRequisition}
            >
              Confirm Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

