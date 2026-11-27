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

function normalizePoStatus(raw: unknown): PurchaseOrderStatus {
  const s = String(raw || 'DRAFT').toUpperCase();
  if (s === 'PENDING_APPROVAL') return 'WAITING_APPROVAL';
  if (s === 'ISSUED') return 'SENT_TO_SUPPLIER';
  if (s === 'PARTIALLY_RECEIVED') return 'PARTLY_RECEIVED';
  return s as PurchaseOrderStatus;
}

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState<PurchaseOrderRecord[]>([]);
  const [liveSuppliers, setLiveSuppliers] = useState<Array<{ id: string; code: string; name: string; termsDays: number; reliability: number; fillRate: number; leadTimeDays: number }>>(PROCUREMENT_SUPPLIERS);
  const [liveItems, setLiveItems] = useState<Array<{ id: string; sku: string; name: string; uom: string; lastRate: number }>>(PROCUREMENT_ITEMS);
  const [liveSites, setLiveSites] = useState<Array<{ id: string; name: string }>>([]);
  const [statusTab, setStatusTab] = useState<PurchaseOrderStatus | 'ALL'>('ALL');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [siteFilter, setSiteFilter] = useState('ALL');
  const [toast, setToast] = useState<string | null>(null);

  const loadPos = async () => {
    try {
      const r = await fetch('/api/proxy/procurement/purchase-orders');
      if (!r.ok) return;
      const res = await r.json();
      const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      setPos(
        rows.map((p: any) => {
          const normalized = normalizePoStatus(p.poStatus ?? p.po_status ?? p.status);
          return {
            id: String(p.id),
            poNumber: String(p.poNo || p.poNumber || p.po_number || p.po_no || p.id),
            supplierId: String(p.supplierId || p.supplier_id || ''),
            supplierName: String(p.supplierName || p.supplier_name || 'Supplier'),
            supplierPhone: String(p.supplierPhone || p.supplier_phone || ''),
            receivingSiteId: String(p.receivingSiteId || p.receiving_site_id || ''),
            receivingSiteName: String(p.receivingSiteName || p.siteName || p.site_name || 'Main Site'),
            status: normalized,
            expectedDelivery: String(p.expectedDelivery || p.expected_delivery || p.expected_delivery_date || '').slice(0, 10),
            paymentTermsDays: Number(p.paymentTermsDays ?? p.payment_terms_days ?? 15),
            priceSpikeException: Boolean(p.priceSpikeException ?? p.price_spike_exception ?? normalized === 'WAITING_APPROVAL'),
            quantitiesConfirmed: Boolean(p.quantitiesConfirmed ?? normalized !== 'DRAFT'),
            createdAt: String(p.createdAt || p.created_at || '').slice(0, 10),
            issuedAt: p.issuedAt || p.issued_at || undefined,
            totalAmountFallback: Number(p.totalAmount ?? p.total_amount ?? 0),
            lines: Array.isArray(p.lines) ? p.lines : [],
          } as any;
        }),
      );
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadPos();
    Promise.allSettled([
      fetch('/api/proxy/procurement/suppliers').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/items').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/sites').then((r) => (r.ok ? r.json() : [])),
    ]).then(([supRes, itmRes, siteRes]) => {
      if (supRes.status === 'fulfilled') {
        const rows = Array.isArray(supRes.value) ? supRes.value : Array.isArray(supRes.value?.data) ? supRes.value.data : [];
        if (rows.length > 0) {
          const mapped = rows.map((s: any) => ({
            id: String(s.id),
            code: String(s.supplier_code || s.code || ''),
            name: String(s.company_name || s.name || 'Supplier'),
            termsDays: Number(s.payment_terms_days ?? 15),
            reliability: Number(((Number(s.reliability_score_pct ?? 90) / 20)).toFixed(1)),
            fillRate: Number(s.reliability_score_pct ?? 95),
            leadTimeDays: Number(s.lead_time_days_avg ?? 3),
          }));
          setLiveSuppliers(mapped);
          setWizSupplierId(mapped[0].id);
        }
      }
      if (itmRes.status === 'fulfilled') {
        const rows = Array.isArray(itmRes.value) ? itmRes.value : Array.isArray(itmRes.value?.data) ? itmRes.value.data : [];
        if (rows.length > 0) {
          const mapped = rows.map((i: any) => ({
            id: String(i.id),
            sku: String(i.sku_code || i.sku || ''),
            name: String(i.name || 'Item'),
            uom: String(i.primary_uom || i.uom || 'kg'),
            lastRate: Number(i.last_purchase_price ?? i.standard_cost ?? 50),
          }));
          setLiveItems(mapped);
          setWizItemId(mapped[0].id);
          setWizRate(mapped[0].lastRate || 50);
        }
      }
      if (siteRes.status === 'fulfilled') {
        const rows = Array.isArray(siteRes.value) ? siteRes.value : Array.isArray(siteRes.value?.data) ? siteRes.value.data : [];
        if (rows.length > 0) {
          const mapped = rows.map((s: any) => ({ id: String(s.id), name: String(s.name) }));
          setLiveSites(mapped);
          setWizSite(mapped[0].id);
        }
      }
    });
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
    liveSuppliers.find((s) => s.id === wizSupplierId) || liveSuppliers[0];
  const selectedWizItem =
    liveItems.find((i) => i.id === wizItemId) || liveItems[0];

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

  const handleCreatePo = async () => {
    const resolvedSiteId =
      liveSites.find((s) => s.id === wizSite || s.name === wizSite)?.id ||
      liveSites[0]?.id ||
      wizSite;
    try {
      const res = await fetch('/api/proxy/procurement/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: selectedWizSupplier.id,
          receivingSiteId: resolvedSiteId,
          expectedDelivery: wizDeliveryDate,
          lines: [
            {
              itemId: selectedWizItem.id,
              orderedQty: String(wizQty),
              unitPrice: String(wizRate),
            },
          ],
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || payload?.error?.message || `HTTP ${res.status}`);
      }
      await loadPos();
      setWizardOpen(false);
      setWizardStep(1);
      showToast(`Created Purchase Order ${payload?.poNo ?? ''}.`);
    } catch (err) {
      showToast(`Failed to create PO: ${(err as Error).message}`);
    }
  };

  const handleConfirmQuantities = async () => {
    if (!confirmTarget) return;
    try {
      let lineId = confirmTarget.lines[0]?.lineId || (confirmTarget.lines[0] as any)?.id;
      let rate = confirmTarget.lines[0]?.unitRate || (confirmTarget.lines[0] as any)?.unitPrice || 0;
      if (!lineId) {
        const lr = await fetch(`/api/proxy/procurement/purchase-orders/${encodeURIComponent(confirmTarget.id)}/lines`);
        if (lr.ok) {
          const lrows = await lr.json();
          if (Array.isArray(lrows) && lrows[0]) {
            lineId = lrows[0].id;
            rate = Number(lrows[0].unitPrice ?? lrows[0].unit_price ?? 0);
          }
        }
      }
      const res = await fetch(`/api/proxy/procurement/purchase-orders/${encodeURIComponent(confirmTarget.id)}/confirm-quantities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmations: [
            {
              lineId,
              confirmedQty: String(confirmQtyValue),
              unitPrice: String(rate),
            },
          ],
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || payload?.error?.message || `HTTP ${res.status}`);
      }
      await loadPos();
      showToast(`Supplier quantities confirmed for ${confirmTarget.poNumber}`);
      setConfirmTarget(null);
    } catch (err) {
      showToast(`Failed to confirm quantities: ${(err as Error).message}`);
    }
  };

  const handleIssuePo = async (po: PurchaseOrderRecord) => {
    if (po.priceSpikeException) return;
    try {
      const res = await fetch(`/api/proxy/procurement/purchase-orders/${encodeURIComponent(po.id)}/issue`, {
        method: 'POST',
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || payload?.error?.message || `HTTP ${res.status}`);
      }
      await loadPos();
      showToast(`Issued ${po.poNumber} to ${po.supplierName}. Ready to share PDF.`);
    } catch (err) {
      showToast(`Failed to issue PO: ${(err as Error).message}`);
    }
  };

  const handleCancelPo = async () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    try {
      const res = await fetch(`/api/proxy/procurement/purchase-orders/${encodeURIComponent(cancelTarget.id)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadPos();
      showToast(`Cancelled ${cancelTarget.poNumber}`);
      setCancelTarget(null);
      setCancelReason('');
    } catch (err) {
      showToast(`Failed to cancel PO: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/procurement" className="hover:text-ink">Procurement</Link>
            <span>/</span>
            <span className="text-action">Purchase Orders</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Purchase Orders</h1>
          <p className="text-sm text-ink-3">
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
        <div className="p-3 rounded-lg bg-leaf-soft border border-leaf/30 text-leaf text-sm">
          {toast}
        </div>
      )}

      {/* Status Tabs & Filters */}
      <div className="bg-sheet border border-rule rounded-[3px] p-3 space-y-3">
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
                    : 'bg-sunken text-ink-3 hover:text-ink'
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
            className="bg-paper border border-rule-strong rounded-lg px-3 py-1.5 text-xs text-ink"
          >
            <option value="ALL">All Suppliers</option>
            {PROCUREMENT_SUPPLIERS.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="bg-paper border border-rule-strong rounded-lg px-3 py-1.5 text-xs text-ink"
          >
            <option value="ALL">All Receiving Sites</option>
            <option value="Pune Central Depot">Pune Central Depot</option>
            <option value="Baramati Plant">Baramati Plant</option>
          </select>
        </div>
      </div>

      {/* PO Table */}
      <div className="bg-sheet border border-rule rounded-[3px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper border-b border-rule text-xs uppercase text-ink-3">
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
            <tbody className="divide-y divide-rule">
              {filteredPos.map((po) => {
                const total =
                  po.lines.length > 0
                    ? po.lines.reduce((sum, l) => sum + l.orderedQty * l.unitRate, 0)
                    : Number((po as any).totalAmountFallback ?? 0);
                return (
                  <tr key={po.id} className="hover:bg-sunken">
                    <td className="p-3">
                      <Link
                        href={`/procurement/purchase-orders/${po.id}`}
                        className="font-mono text-xs text-action font-semibold hover:underline"
                      >
                        {po.poNumber}
                      </Link>
                      {po.linkedSalesOrderNo && (
                        <div className="text-[11px] text-action">
                          Back-to-back: {po.linkedSalesOrderNo}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="text-ink font-medium">{po.supplierName}</div>
                      <div className="text-[11px] text-ink-3">
                        {po.lines.length} line(s) · {po.paymentTermsDays}d terms
                      </div>
                    </td>
                    <td className="p-3 text-xs text-ink-2">
                      <div>{po.receivingSiteName}</div>
                      <div className="text-ink-3 font-mono">ETA {po.expectedDelivery}</div>
                    </td>
                    <td className="p-3 font-mono font-semibold text-ink">
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
                              className="text-xs text-action hover:text-action font-medium"
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
                                ? 'text-ink-3 cursor-not-allowed'
                                : 'text-emerald-400 hover:text-emerald-300'
                            }`}
                          >
                            Issue PO
                          </button>
                          <button
                            onClick={() => setCancelTarget(po)}
                            className="text-xs text-madder hover:text-madder font-medium"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      <Link
                        href={`/procurement/purchase-orders/${po.id}`}
                        className="text-xs text-action hover:text-action font-medium"
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
                        ? 'bg-leaf-soft text-leaf'
                        : 'bg-paper text-ink-3'
                  }`}
                >
                  {label}
                </div>
              ),
            )}
          </div>

          {wizardStep === 1 && (
            <div className="space-y-3">
              <label className="block text-xs text-ink-3">Select Supplier</label>
              <select
                value={wizSupplierId}
                onChange={(e) => {
                  setWizSupplierId(e.target.value);
                  const sup = PROCUREMENT_SUPPLIERS.find((s) => s.id === e.target.value);
                  if (sup) setWizTerms(sup.termsDays);
                }}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              >
                {liveSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-paper border border-rule text-xs">
                <div>
                  <span className="text-ink-3">Reliability</span>
                  <div className="text-ink font-bold">{selectedWizSupplier.reliability} / 5.0</div>
                </div>
                <div>
                  <span className="text-ink-3">Fill Rate</span>
                  <div className="text-leaf font-bold">{selectedWizSupplier.fillRate}%</div>
                </div>
                <div>
                  <span className="text-ink-3">Lead Time</span>
                  <div className="text-ink font-bold">{selectedWizSupplier.leadTimeDays} days</div>
                </div>
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-ink-3 mb-1">Item</label>
                <select
                  value={wizItemId}
                  onChange={(e) => {
                    setWizItemId(e.target.value);
                    const found = PROCUREMENT_ITEMS.find((i) => i.id === e.target.value);
                    if (found) setWizRate(found.lastRate);
                  }}
                  className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
                >
                  {liveItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} (Last rate: ₹{i.lastRate}/{i.uom})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-ink-3 mb-1">
                    Quantity ({selectedWizItem.uom})
                  </label>
                  <input
                    type="number"
                    value={wizQty}
                    onChange={(e) => setWizQty(Number(e.target.value))}
                    className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-3 mb-1">
                    Unit Rate (₹/{selectedWizItem.uom})
                  </label>
                  <input
                    type="number"
                    value={wizRate}
                    onChange={(e) => setWizRate(Number(e.target.value))}
                    className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
                  />
                </div>
              </div>

              {/* BR-03 Live Price Spike Feedback */}
              <div
                className={`p-3 rounded-lg border text-xs ${
                  spikeEval.requiresOwnerApproval
                    ? 'bg-haldi-soft border-haldi/30 text-haldi'
                    : 'bg-leaf-soft border-leaf/30 text-leaf'
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
                <label className="block text-xs text-ink-3 mb-1">Receiving Site</label>
                <select
                  value={wizSite}
                  onChange={(e) => setWizSite(e.target.value)}
                  className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
                >
                  {(liveSites.length > 0
                    ? liveSites
                    : [
                        { id: 'Pune Central Depot', name: 'Pune Central Depot' },
                        { id: 'Baramati Plant', name: 'Baramati Plant' },
                      ]
                  ).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-ink-3 mb-1">Expected Delivery</label>
                  <input
                    type="date"
                    value={wizDeliveryDate}
                    onChange={(e) => setWizDeliveryDate(e.target.value)}
                    className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-3 mb-1">Payment Terms (days)</label>
                  <input
                    type="number"
                    value={wizTerms}
                    onChange={(e) => setWizTerms(Number(e.target.value))}
                    className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
                  />
                </div>
              </div>
            </div>
          )}

          {wizardStep === 4 && (
            <div className="space-y-3 text-sm">
              <div className="p-3 rounded-lg bg-paper border border-rule space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-ink-3">Supplier</span>
                  <span className="text-ink font-medium">{selectedWizSupplier.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Item</span>
                  <span className="text-ink">
                    {selectedWizItem.name} × {wizQty} {selectedWizItem.uom}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Rate</span>
                  <span className="text-ink font-mono">₹{wizRate}/{selectedWizItem.uom}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Receiving Site &amp; ETA</span>
                  <span className="text-ink">{wizSite} ({wizDeliveryDate})</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-rule font-bold">
                  <span className="text-ink-2">Total Order Value</span>
                  <span className="text-leaf font-mono">{formatINR(wizQty * wizRate)}</span>
                </div>
              </div>
              {spikeEval.requiresOwnerApproval && (
                <div className="p-3 rounded-lg bg-haldi-soft border border-haldi/30 text-haldi text-xs">
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
          <p className="text-xs text-ink-3">
            Enter the supplier-confirmed quantity for {confirmTarget?.lines[0]?.itemName} before issuing the PO.
          </p>
          <input
            type="number"
            value={confirmQtyValue}
            onChange={(e) => setConfirmQtyValue(Number(e.target.value))}
            className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
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
            className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
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

