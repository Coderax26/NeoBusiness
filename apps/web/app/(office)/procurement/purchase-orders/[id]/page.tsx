'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Card } from '@neo/ui';
import { formatINR } from '@neo/shared';
import { type PurchaseOrderRecord, type GrnRecord, type SupplierBillRecord } from '../../../../../src/lib/procurement-data';

const LIFECYCLE_STEPS = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'WAITING_APPROVAL', label: 'Price Check / Approval' },
  { key: 'SENT_TO_SUPPLIER', label: 'Issued to Supplier' },
  { key: 'PARTLY_RECEIVED', label: 'GRN Receiving' },
  { key: 'CLOSED', label: 'Closed' },
];

export default function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [po, setPo] = useState<PurchaseOrderRecord | null>(null);
  const [linkedGrns, setLinkedGrns] = useState<GrnRecord[]>([]);
  const [linkedBills, setLinkedBills] = useState<SupplierBillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/proxy/procurement/purchase-orders/${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/proxy/procurement/grns').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/procurement/supplier-bills').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([poData, grnData, billData]) => {
        if (!active) return;
        const p = poData?.data || poData;
        if (p && p.id) {
          setPo({
            id: String(p.id),
            poNumber: String(p.poNumber || p.po_number || p.po_no || p.id),
            supplierId: String(p.supplierId || p.supplier_id || ''),
            supplierName: String(p.supplierName || p.supplier_name || 'Supplier'),
            receivingSiteId: String(p.receivingSiteId || p.receiving_site_id || ''),
            receivingSiteName: String(p.receivingSiteName || p.siteName || p.site_name || 'Main Site'),
            supplierPhone: String(p.supplierPhone || p.supplier_phone || ''),
            quantitiesConfirmed: Boolean(p.quantitiesConfirmed ?? true),
            createdAt: String(p.createdAt || p.created_at || '').slice(0, 10),
            status: (p.status || 'DRAFT') as PurchaseOrderRecord['status'],
            expectedDelivery: String(p.expectedDelivery || p.expected_delivery_date || '').slice(0, 10),
            paymentTermsDays: Number(p.paymentTermsDays ?? p.payment_terms_days ?? 15),
            priceSpikeException: Boolean(p.priceSpikeException ?? p.price_spike_exception),
            issuedAt: p.issuedAt || p.issued_at || undefined,
            lines: Array.isArray(p.lines)
              ? p.lines.map((l: any, idx: number) => ({
                  lineId: String(l.lineId || l.id || `l-${idx}`),
                  itemId: String(l.itemId || l.item_id || ''),
                  itemSku: String(l.itemSku || l.sku_code || ''),
                  itemName: String(l.itemName || l.item_name || 'Item'),
                  uom: String(l.uom || 'kg'),
                  orderedQty: Number(l.orderedQty ?? l.ordered_qty ?? 0),
                  receivedQty: Number(l.receivedQty ?? l.received_qty ?? 0),
                  unitRate: Number(l.unitRate ?? l.unit_rate ?? l.unitPrice ?? 0),
                }))
              : [],
          });
        }
        const grnsArr = Array.isArray(grnData) ? grnData : Array.isArray(grnData?.data) ? grnData.data : [];
        setLinkedGrns(grnsArr.filter((g: any) => String(g.poId || g.po_id) === id));
        const billsArr = Array.isArray(billData) ? billData : Array.isArray(billData?.data) ? billData.data : [];
        setLinkedBills(billsArr.filter((b: any) => String(b.poId || b.po_id) === id));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return <div className="p-6 text-sm text-ink-3">Loading purchase order...</div>;
  }

  if (!po) {
    return (
      <div className="p-6 space-y-3">
        <Link href="/procurement/purchase-orders" className="text-xs text-ink-3 hover:text-ink inline-block">
          ← Back to Purchase Orders
        </Link>
        <div className="p-6 rounded-[4px] bg-sheet border border-rule text-sm text-ink-3">
          Purchase order not found.
        </div>
      </div>
    );
  }

  const totalValue = po.lines.reduce((s, l) => s + l.orderedQty * l.unitRate, 0);

  const currentStepIdx = Math.max(
    0,
    LIFECYCLE_STEPS.findIndex((s) => s.key === po.status),
  );

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleIssue = () => {
    if (po.priceSpikeException) return;
    setPo((prev) => (prev ? { ...prev, status: 'SENT_TO_SUPPLIER', issuedAt: 'Just now' } : prev));
    showToast(`Issued ${po.poNumber} to ${po.supplierName}.`);
  };

  const handleDownloadPdf = () => {
    window.open(`/api/bff/procurement/purchase-orders/${po.id}/pdf`, '_blank');
    showToast(`Opening PO PDF for ${po.poNumber} (G-DOC-4).`);
  };

  const handleShareWhatsapp = () => {
    const msg = encodeURIComponent(
      `Purchase Order ${po.poNumber} for ${po.supplierName} — Total ${formatINR(totalValue)}, Expected ${po.expectedDelivery}.`,
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/procurement" className="hover:text-ink">Procurement</Link>
            <span>/</span>
            <Link href="/procurement/purchase-orders" className="hover:text-ink">Purchase Orders</Link>
            <span>/</span>
            <span className="text-action font-mono">{po.poNumber}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink font-mono">{po.poNumber}</h1>
            <StatusPill
              status={po.status}
              tone={po.priceSpikeException ? 'amber' : 'emerald'}
            />
          </div>
          <p className="text-sm text-ink-3 mt-1">
            Supplier: <strong className="text-ink">{po.supplierName}</strong> · Receiving Site:{' '}
            {po.receivingSiteName} · Expected {po.expectedDelivery}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={handleDownloadPdf}>
            Download PDF
          </Button>
          <Button variant="secondary" onClick={handleShareWhatsapp}>
            Share via WhatsApp
          </Button>
          <Button
            variant="primary"
            disabled={po.priceSpikeException || po.status === 'SENT_TO_SUPPLIER' || po.status === 'CLOSED'}
            onClick={handleIssue}
          >
            Issue PO
          </Button>
        </div>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-leaf-soft border border-leaf/30 text-leaf text-sm">
          {toast}
        </div>
      )}

      {/* SUPPLIER_PRICE_SPIKE read-only banner (Acceptance Criterion #2) */}
      {po.priceSpikeException && (
        <div
          role="alert"
          data-testid="price-spike-banner"
          className="p-4 rounded-[3px] bg-haldi-soft border border-haldi/30 text-haldi flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div>
            <div className="text-sm font-bold flex items-center gap-2">
              <span>⚠ Waiting for Owner — Price Spike Exception (BR-03)</span>
            </div>
            <p className="text-xs text-haldi mt-1">
              {po.priceSpikeSummary || 'Unit rate exceeds historical supplier baseline.'} Issuing this PO is disabled until the Owner approves the spike exception.
            </p>
          </div>
          <Badge variant="warning">SUPPLIER_PRICE_SPIKE</Badge>
        </div>
      )}

      {/* Lifecycle Stepper */}
      <Card className="p-5 bg-sheet border-rule">
        <div className="text-xs uppercase tracking-wider text-ink-3 mb-3 font-semibold">
          PO Lifecycle Progress
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {LIFECYCLE_STEPS.map((step, idx) => (
            <div
              key={step.key}
              className={`p-3 rounded-lg border text-xs font-medium ${
                idx < currentStepIdx
                  ? 'bg-leaf-soft border-leaf/30 text-leaf'
                  : idx === currentStepIdx
                    ? 'bg-indigo-600/20 border-indigo-500 text-white'
                    : 'bg-paper border-rule text-ink-3'
              }`}
            >
              <div className="font-mono text-[10px] opacity-75">STEP 0{idx + 1}</div>
              <div className="mt-0.5">{step.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* PO Lines */}
      <div className="bg-sheet border border-rule rounded-[3px] overflow-hidden">
        <div className="p-4 border-b border-rule flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Order Lines (Ordered / Received / Short)</h2>
          <span className="font-mono text-sm font-bold text-leaf">
            Total: {formatINR(totalValue)}
          </span>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-ink-3 border-b border-rule">
            <tr>
              <th className="p-3">Item</th>
              <th className="p-3 text-right">Ordered</th>
              <th className="p-3 text-right">Received</th>
              <th className="p-3 text-right">Short</th>
              <th className="p-3 text-right">Unit Rate</th>
              <th className="p-3 text-right">Variance</th>
              <th className="p-3 text-right">Line Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {po.lines.map((l) => (
              <tr key={l.lineId}>
                <td className="p-3">
                  <div className="text-ink font-medium">{l.itemName}</div>
                  <div className="text-xs font-mono text-ink-3">{l.itemSku}</div>
                </td>
                <td className="p-3 text-right font-mono text-ink">
                  {l.orderedQty} {l.uom}
                </td>
                <td className="p-3 text-right font-mono text-leaf">
                  {l.receivedQty} {l.uom}
                </td>
                <td className="p-3 text-right font-mono text-madder">
                  {l.shortQty} {l.uom}
                </td>
                <td className="p-3 text-right font-mono text-ink">₹{l.unitRate}</td>
                <td className="p-3 text-right">
                  {l.spikeFlag ? (
                    <Badge variant="warning">+{l.variancePct}%</Badge>
                  ) : (
                    <span className="text-xs text-ink-3 font-mono">{l.variancePct}%</span>
                  )}
                </td>
                <td className="p-3 text-right font-mono font-semibold text-ink">
                  {formatINR(l.orderedQty * l.unitRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Linked GRNs, Bills, Back-to-Back SO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 bg-sheet border-rule">
          <h3 className="text-sm font-semibold text-ink mb-2">Linked GRNs</h3>
          {linkedGrns.length === 0 ? (
            <p className="text-xs text-ink-3">No goods received yet.</p>
          ) : (
            linkedGrns.map((g) => (
              <div key={g.id} className="p-2.5 rounded bg-paper border border-rule text-xs mb-2">
                <div className="font-mono text-action font-semibold">{g.grnNumber}</div>
                <div className="text-ink-3 mt-0.5">{g.receivedDate} · {g.receivedBy}</div>
              </div>
            ))
          )}
        </Card>

        <Card className="p-4 bg-sheet border-rule">
          <h3 className="text-sm font-semibold text-ink mb-2">Linked Supplier Bills</h3>
          {linkedBills.length === 0 ? (
            <p className="text-xs text-ink-3">No supplier bills posted yet.</p>
          ) : (
            linkedBills.map((b) => (
              <div key={b.id} className="p-2.5 rounded bg-paper border border-rule text-xs mb-2">
                <div className="font-mono text-action font-semibold">{b.billNumber}</div>
                <div className="text-ink-2 mt-0.5">{formatINR(b.totalAmount)} · {b.status}</div>
              </div>
            ))
          )}
        </Card>

        <Card className="p-4 bg-sheet border-rule">
          <h3 className="text-sm font-semibold text-ink mb-2">Back-to-Back Sales Order</h3>
          {po.linkedSalesOrderNo ? (
            <div className="p-2.5 rounded bg-paper border border-rule text-xs">
              <div className="font-mono text-action font-semibold">{po.linkedSalesOrderNo}</div>
              <div className="text-ink-3 mt-1">Reserved for direct fulfillment upon GRN.</div>
            </div>
          ) : (
            <p className="text-xs text-ink-3">Stock replenishment PO (not tied to a single SO).</p>
          )}
        </Card>
      </div>
    </div>
  );
}

