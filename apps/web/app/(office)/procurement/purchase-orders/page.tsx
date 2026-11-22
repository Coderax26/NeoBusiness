'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Dialog } from '@neo/ui';
import {
  formatINR,
  evaluateSupplierPriceSpike,
  formatPriceSpikePlainWarning,
} from '@neo/shared';
import {
  PROCUREMENT_ITEMS,
  PROCUREMENT_SUPPLIERS,
  type PurchaseOrderRecord,
  type PurchaseOrderStatus,
} from '../../../../src/lib/procurement-data';

const STATUS_TABS: Array<{ key: PurchaseOrderStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'WAITING_APPROVAL', label: 'Waiting approval' },
  { key: 'SENT_TO_SUPPLIER', label: 'Sent to supplier' },
  { key: 'PARTLY_RECEIVED', label: 'Partly received' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState<PurchaseOrderRecord[]>([]);
  const [statusTab, setStatusTab] = useState<PurchaseOrderStatus | 'ALL'>('ALL');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [siteFilter, setSiteFilter] = useState('ALL');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/procurement/purchase-orders')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setPos(
          rows.map((p: any) => ({
            id: String(p.id),
            poNumber: String(p.poNumber || p.po_number || p.po_no || p.id),
            supplierId: String(p.supplierId || p.supplier_id || ''),
            supplierName: String(p.supplierName || p.supplier_name || 'Supplier'),
            siteName: String(p.siteName || p.site_name || 'Main Site'),
            status: (p.status || 'DRAFT') as PurchaseOrderStatus,
            expectedDelivery: String(p.expectedDelivery || p.expected_delivery_date || '').slice(0, 10),
            paymentTermsDays: Number(p.paymentTermsDays ?? p.payment_terms_days ?? 15),
            priceSpikeException: Boolean(p.priceSpikeException ?? p.price_spike_exception),
            issuedAt: p.issuedAt || p.issued_at || undefined,
            lines: Array.isArray(p.lines) ? p.lines : [],
          })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // 4-step PO Builder Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [wizSupplierId, setWizSupplierId] = useState(PROCUREMENT_SUPPLIERS[0].id);
  const [wizItemId, setWizItemId] = useState(PROCUREMENT_ITEMS[1].id);
  const [wizQty, setWizQty] = useState(500);
  const [wizRate, setWizRate] = useState(54);
  const [wizSite, setWizSite] = useState('Pune Central Depot');
  const [wizDeliveryDate, setWizDeliveryDate] = useState('2026-11-17');
  const [wizTerms, setWizTerms] = useState(15);

  // Confirm Quantities modal
  const [confirmTarget, setConfirmTarget] = useState<PurchaseOrderRecord | null>(null);
  const [confirmQtyValue, setConfirmQtyValue] = useState(0);

  // Cancel PO modal
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrderRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const selectedWizSupplier =
    PROCUREMENT_SUPPLIERS.find((s) => s.id === wizSupplierId) || PROCUREMENT_SUPPLIERS[0];
  const selectedWizItem =
    PROCUREMENT_ITEMS.find((i) => i.id === wizItemId) || PROCUREMENT_ITEMS[0];

  const spikeEval = useMemo(
    () =>
      evaluateSupplierPriceSpike(
        wizRate,
        selectedWizItem.lastRate,
        selectedWizItem.lastRate,
        5,
      ),
    [wizRate, selectedWizItem],
  );

  const plainSpikeSentence = useMemo(
    () =>
      formatPriceSpikePlainWarning(
        wizRate,
        selectedWizItem.lastRate,
        selectedWizItem.uom,
      ),
    [wizRate, selectedWizItem],
  );

  const filteredPos = useMemo(() => {
    return pos.filter((p) => {
      if (statusTab !== 'ALL' && p.status !== statusTab) return false;
      if (supplierFilter !== 'ALL' && p.supplierId !== supplierFilter) return false;
      if (siteFilter !== 'ALL' && p.receivingSiteName !== siteFilter) return false;
      return true;
    });
  }, [pos, statusTab, supplierFilter, siteFilter]);

  const handleCreatePo = () => {
    const newPo: PurchaseOrderRecord = {
      id: `po-${Date.now()}`,
      poNumber: `PO-2026-${Math.floor(115 + Math.random() * 80)}`,
      supplierId: selectedWizSupplier.id,
      supplierName: selectedWizSupplier.name,
      supplierPhone: selectedWizSupplier.phone,
      receivingSiteId: wizSite === 'Baramati Plant' ? 'site-2' : 'site-1',
      receivingSiteName: wizSite,
      status: spikeEval.requiresOwnerApproval ? 'WAITING_APPROVAL' : 'DRAFT',
      expectedDelivery: wizDeliveryDate,
      paymentTermsDays: wizTerms,
      priceSpikeException: spikeEval.requiresOwnerApproval,
      priceSpikeSummary: plainSpikeSentence ?? undefined,
      quantitiesConfirmed: false,
      createdAt: 'Just now',
      lines: [
        {
          lineId: `pol-${Date.now()}`,
          itemId: selectedWizItem.id,
          itemSku: selectedWizItem.sku,
          itemName: selectedWizItem.name,
          uom: selectedWizItem.uom,
          orderedQty: wizQty,
          confirmedQty: wizQty,
          receivedQty: 0,
          shortQty: 0,
          unitRate: wizRate,
          lastRate: selectedWizItem.lastRate,
          variancePct: spikeEval.variancePct,
          spikeFlag: spikeEval.requiresOwnerApproval,
        },
      ],
    };

    fetch('/api/bff/procurement/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPo),
    }).catch(() => {});

    setPos((prev) => [newPo, ...prev]);
    setWizardOpen(false);
    setWizardStep(1);
    showToast(
      newPo.priceSpikeException
        ? `Created ${newPo.poNumber} — flagged for Owner approval due to price spike.`
        : `Created draft ${newPo.poNumber}.`,
    );
  };

  const handleConfirmQuantities = () => {
    if (!confirmTarget) return;
    fetch(`/api/bff/procurement/purchase-orders/${confirmTarget.id}/confirm-quantities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmedQty: confirmQtyValue }),
    }).catch(() => {});

    setPos((prev) =>
      prev.map((p) =>
        p.id === confirmTarget.id
          ? {
              ...p,
              quantitiesConfirmed: true,
              lines: p.lines.map((l, i) =>
                i === 0 ? { ...l, confirmedQty: confirmQtyValue } : l,
              ),
            }
          : p,
      ),
    );
    showToast(`Supplier quantities confirmed for ${confirmTarget.poNumber}`);
    setConfirmTarget(null);
  };

  const handleIssuePo = (po: PurchaseOrderRecord) => {
    if (po.priceSpikeException) return;
    fetch(`/api/bff/procurement/purchase-orders/${po.id}/issue`, {
      method: 'POST',
    }).catch(() => {});

    setPos((prev) =>
      prev.map((p) =>
        p.id === po.id
          ? { ...p, status: 'SENT_TO_SUPPLIER', issuedAt: 'Just now' }
          : p,
      ),
    );
    showToast(`Issued ${po.poNumber} to ${po.supplierName}. Ready to share PDF.`);
  };

  const handleCancelPo = () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    fetch(`/api/bff/procurement/purchase-orders/${cancelTarget.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: cancelReason }),
    }).catch(() => {});

    setPos((prev) =>
      prev.map((p) =>
        p.id === cancelTarget.id
          ? { ...p, status: 'CANCELLED', cancelReason }
          : p,
      ),
    );
    showToast(`Cancelled ${cancelTarget.poNumber}`);
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
            <span className="text-indigo-400">Purchase Orders</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Purchase Orders</h1>
          <p className="text-sm text-zinc-400">
            Build POs with automatic rate variance checks, confirm supplier quantities, and issue PDFs.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => {
            setWizardStep(1);
            setWizardOpen(true);
          }}
        >
          + New Purchase Order
        </Button>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm">
          {toast}
        </div>
      )}

      {/* Status Tabs & Filters */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab) => {
            const count =
              tab.key === 'ALL'
                ? pos.length
                : pos.filter((p) => p.status === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setStatusTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusTab === tab.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
          >
            <option value="ALL">All Suppliers</option>
            {PROCUREMENT_SUPPLIERS.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
          >
            <option value="ALL">All Receiving Sites</option>
            <option value="Pune Central Depot">Pune Central Depot</option>
            <option value="Baramati Plant">Baramati Plant</option>
          </select>
        </div>
      </div>

      {/* PO Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950/80 border-b border-zinc-800 text-xs uppercase text-zinc-400">
              <tr>
                <th className="p-3">PO #</th>
                <th className="p-3">Supplier</th>
                <th className="p-3">Site &amp; Expected</th>
                <th className="p-3">Value</th>
                <th className="p-3">Guard Rails</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {filteredPos.map((po) => {
                const total = po.lines.reduce(
                  (sum, l) => sum + l.orderedQty * l.unitRate,
                  0,
                );
                return (
                  <tr key={po.id} className="hover:bg-zinc-800/40">
                    <td className="p-3">
                      <Link
                        href={`/procurement/purchase-orders/${po.id}`}
                        className="font-mono text-xs text-indigo-400 font-semibold hover:underline"
                      >
                        {po.poNumber}
                      </Link>
                      {po.linkedSalesOrderNo && (
                        <div className="text-[11px] text-teal-400">
                          Back-to-back: {po.linkedSalesOrderNo}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="text-zinc-100 font-medium">{po.supplierName}</div>
                      <div className="text-[11px] text-zinc-500">
                        {po.lines.length} line(s) · {po.paymentTermsDays}d terms
                      </div>
                    </td>
                    <td className="p-3 text-xs text-zinc-300">
                      <div>{po.receivingSiteName}</div>
                      <div className="text-zinc-500 font-mono">ETA {po.expectedDelivery}</div>
                    </td>
                    <td className="p-3 font-mono font-semibold text-white">
                      {formatINR(total)}
                    </td>
                    <td className="p-3">
                      {po.priceSpikeException ? (
                        <Badge variant="warning">Waiting for Owner (Price Spike)</Badge>
                      ) : po.quantitiesConfirmed ? (
                        <Badge variant="success">Qty Confirmed</Badge>
                      ) : (
                        <Badge variant="default">Confirm Qty Pending</Badge>
                      )}
                    </td>
                    <td className="p-3">
                      <StatusPill
                        status={po.status}
                        tone={
                          po.status === 'SENT_TO_SUPPLIER' || po.status === 'CLOSED'
                            ? 'emerald'
                            : po.status === 'WAITING_APPROVAL' || po.status === 'PARTLY_RECEIVED'
                              ? 'amber'
                              : po.status === 'CANCELLED'
                                ? 'rose'
                                : 'slate'
                        }
                      />
                    </td>
                    <td className="p-3 text-right space-x-2">
                      {(po.status === 'DRAFT' || po.status === 'WAITING_APPROVAL') && (
                        <>
                          {!po.quantitiesConfirmed && (
                            <button
                              onClick={() => {
                                setConfirmTarget(po);
                                setConfirmQtyValue(po.lines[0]?.orderedQty ?? 0);
                              }}
                              className="text-xs text-sky-400 hover:text-sky-300 font-medium"
                            >
                              Confirm Qty
                            </button>
                          )}
                          <button
                            disabled={po.priceSpikeException}
                            title={
                              po.priceSpikeException
                                ? 'Disabled until Owner approves SUPPLIER_PRICE_SPIKE'
                                : 'Issue PO to supplier'
                            }
                            onClick={() => handleIssuePo(po)}
                            className={`text-xs font-medium ${
                              po.priceSpikeException
                                ? 'text-zinc-600 cursor-not-allowed'
                                : 'text-emerald-400 hover:text-emerald-300'
                            }`}
                          >
                            Issue PO
                          </button>
                          <button
                            onClick={() => setCancelTarget(po)}
                            className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      <Link
                        href={`/procurement/purchase-orders/${po.id}`}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4-Step PO Builder Wizard */}
      <Dialog
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title={`Build Purchase Order — Step ${wizardStep} of 4`}
      >
        <div className="space-y-4">
          {/* Stepper header */}
          <div className="grid grid-cols-4 gap-1 text-[11px] font-medium">
            {['1. Supplier', '2. Items & Rate', '3. Delivery', '4. Review'].map(
              (label, i) => (
                <div
                  key={label}
                  className={`p-1.5 rounded text-center ${
                    wizardStep === i + 1
                      ? 'bg-indigo-600 text-white'
                      : wizardStep > i + 1
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-zinc-950 text-zinc-500'
                  }`}
                >
                  {label}
                </div>
              ),
            )}
          </div>

          {wizardStep === 1 && (
            <div className="space-y-3">
              <label className="block text-xs text-zinc-400">Select Supplier</label>
              <select
                value={wizSupplierId}
                onChange={(e) => {
                  setWizSupplierId(e.target.value);
                  const sup = PROCUREMENT_SUPPLIERS.find((s) => s.id === e.target.value);
                  if (sup) setWizTerms(sup.termsDays);
                }}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
              >
                {PROCUREMENT_SUPPLIERS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs">
                <div>
                  <span className="text-zinc-500">Reliability</span>
                  <div className="text-white font-bold">{selectedWizSupplier.reliability} / 5.0</div>
                </div>
                <div>
                  <span className="text-zinc-500">Fill Rate</span>
                  <div className="text-emerald-400 font-bold">{selectedWizSupplier.fillRate}%</div>
                </div>
                <div>
                  <span className="text-zinc-500">Lead Time</span>
                  <div className="text-white font-bold">{selectedWizSupplier.leadTimeDays} days</div>
                </div>
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Item</label>
                <select
                  value={wizItemId}
                  onChange={(e) => {
                    setWizItemId(e.target.value);
                    const found = PROCUREMENT_ITEMS.find((i) => i.id === e.target.value);
                    if (found) setWizRate(found.lastRate);
                  }}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
                >
                  {PROCUREMENT_ITEMS.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} (Last rate: ₹{i.lastRate}/{i.uom})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Quantity ({selectedWizItem.uom})
                  </label>
                  <input
                    type="number"
                    value={wizQty}
                    onChange={(e) => setWizQty(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Unit Rate (₹/{selectedWizItem.uom})
                  </label>
                  <input
                    type="number"
                    value={wizRate}
                    onChange={(e) => setWizRate(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
                  />
                </div>
              </div>

              {/* BR-03 Live Price Spike Feedback */}
              <div
                className={`p-3 rounded-lg border text-xs ${
                  spikeEval.requiresOwnerApproval
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                }`}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span>
                    Variance vs last rate: {spikeEval.variancePct > 0 ? `+${spikeEval.variancePct}%` : `${spikeEval.variancePct}%`}
                  </span>
                  {spikeEval.requiresOwnerApproval && (
                    <Badge variant="warning">Owner approval needed</Badge>
                  )}
                </div>
                {plainSpikeSentence && (
                  <div className="mt-1 font-medium">{plainSpikeSentence}</div>
                )}
              </div>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Receiving Site</label>
                <select
                  value={wizSite}
                  onChange={(e) => setWizSite(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
                >
                  <option value="Pune Central Depot">Pune Central Depot</option>
                  <option value="Baramati Plant">Baramati Plant</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Expected Delivery</label>
                  <input
                    type="date"
                    value={wizDeliveryDate}
                    onChange={(e) => setWizDeliveryDate(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Payment Terms (days)</label>
                  <input
                    type="number"
                    value={wizTerms}
                    onChange={(e) => setWizTerms(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {wizardStep === 4 && (
            <div className="space-y-3 text-sm">
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Supplier</span>
                  <span className="text-white font-medium">{selectedWizSupplier.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Item</span>
                  <span className="text-white">
                    {selectedWizItem.name} × {wizQty} {selectedWizItem.uom}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Rate</span>
                  <span className="text-white font-mono">₹{wizRate}/{selectedWizItem.uom}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Receiving Site &amp; ETA</span>
                  <span className="text-white">{wizSite} ({wizDeliveryDate})</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-zinc-800 font-bold">
                  <span className="text-zinc-300">Total Order Value</span>
                  <span className="text-emerald-400 font-mono">{formatINR(wizQty * wizRate)}</span>
                </div>
              </div>
              {spikeEval.requiresOwnerApproval && (
                <div className="p-3 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs">
                  <strong>SUPPLIER_PRICE_SPIKE:</strong> {plainSpikeSentence}. PO will be saved in{' '}
                  <strong>Waiting for Owner</strong> status with Issue disabled.
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button
              variant="secondary"
              onClick={() =>
                wizardStep > 1 ? setWizardStep((s) => (s - 1) as any) : setWizardOpen(false)
              }
            >
              {wizardStep > 1 ? '← Back' : 'Cancel'}
            </Button>
            {wizardStep < 4 ? (
              <Button
                variant="primary"
                onClick={() => setWizardStep((s) => (s + 1) as any)}
              >
                Next →
              </Button>
            ) : (
              <Button variant="primary" onClick={handleCreatePo}>
                Create Purchase Order
              </Button>
            )}
          </div>
        </div>
      </Dialog>

      {/* Confirm Quantities Dialog */}
      <Dialog
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        title={`Confirm Supplier Quantities — ${confirmTarget?.poNumber ?? ''}`}
      >
        <div className="space-y-4">
          <p className="text-xs text-zinc-400">
            Enter the supplier-confirmed quantity for {confirmTarget?.lines[0]?.itemName} before issuing the PO.
          </p>
          <input
            type="number"
            value={confirmQtyValue}
            onChange={(e) => setConfirmQtyValue(Number(e.target.value))}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmQuantities}>
              Confirm Quantities
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Cancel PO Dialog */}
      <Dialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title={`Cancel ${cancelTarget?.poNumber ?? ''}`}
      >
        <div className="space-y-4">
          <textarea
            rows={3}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Cancellation reason required..."
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>
              Back
            </Button>
            <Button
              variant="primary"
              disabled={!cancelReason.trim()}
              onClick={handleCancelPo}
            >
              Confirm Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

