'use client';

import React, { useState, use } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Card } from '@neo/ui';
import { formatINR } from '@neo/shared';
import {
  INITIAL_PURCHASE_ORDERS,
  INITIAL_GRNS,
  INITIAL_SUPPLIER_BILLS,
} from '../../../../src/lib/procurement-data';

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
  const initialPo =
    INITIAL_PURCHASE_ORDERS.find((p) => p.id === id) || INITIAL_PURCHASE_ORDERS[0];
  const [po, setPo] = useState(initialPo);
  const [toast, setToast] = useState<string | null>(null);

  const linkedGrns = INITIAL_GRNS.filter((g) => g.poId === po.id);
  const linkedBills = INITIAL_SUPPLIER_BILLS.filter((b) => b.poId === po.id);
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
    setPo((prev) => ({ ...prev, status: 'SENT_TO_SUPPLIER', issuedAt: 'Just now' }));
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
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
            <Link href="/procurement" className="hover:text-white">Procurement</Link>
            <span>/</span>
            <Link href="/procurement/purchase-orders" className="hover:text-white">Purchase Orders</Link>
            <span>/</span>
            <span className="text-indigo-400 font-mono">{po.poNumber}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white font-mono">{po.poNumber}</h1>
            <StatusPill
              status={po.status}
              tone={po.priceSpikeException ? 'amber' : 'emerald'}
            />
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Supplier: <strong className="text-zinc-200">{po.supplierName}</strong> · Receiving Site:{' '}
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
        <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm">
          {toast}
        </div>
      )}

      {/* SUPPLIER_PRICE_SPIKE read-only banner (Acceptance Criterion #2) */}
      {po.priceSpikeException && (
        <div
          role="alert"
          data-testid="price-spike-banner"
          className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/50 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div>
            <div className="text-sm font-bold flex items-center gap-2">
              <span>⚠ Waiting for Owner — Price Spike Exception (BR-03)</span>
            </div>
            <p className="text-xs text-amber-300/90 mt-1">
              {po.priceSpikeSummary || 'Unit rate exceeds historical supplier baseline.'} Issuing this PO is disabled until the Owner approves the spike exception.
            </p>
          </div>
          <Badge variant="warning">SUPPLIER_PRICE_SPIKE</Badge>
        </div>
      )}

      {/* Lifecycle Stepper */}
      <Card className="p-5 bg-zinc-900 border-zinc-800">
        <div className="text-xs uppercase tracking-wider text-zinc-400 mb-3 font-semibold">
          PO Lifecycle Progress
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {LIFECYCLE_STEPS.map((step, idx) => (
            <div
              key={step.key}
              className={`p-3 rounded-lg border text-xs font-medium ${
                idx < currentStepIdx
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                  : idx === currentStepIdx
                    ? 'bg-indigo-600/20 border-indigo-500 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-500'
              }`}
            >
              <div className="font-mono text-[10px] opacity-75">STEP 0{idx + 1}</div>
              <div className="mt-0.5">{step.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* PO Lines */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Order Lines (Ordered / Received / Short)</h2>
          <span className="font-mono text-sm font-bold text-emerald-400">
            Total: {formatINR(totalValue)}
          </span>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950/70 text-xs uppercase text-zinc-400 border-b border-zinc-800">
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
          <tbody className="divide-y divide-zinc-800/70">
            {po.lines.map((l) => (
              <tr key={l.lineId}>
                <td className="p-3">
                  <div className="text-white font-medium">{l.itemName}</div>
                  <div className="text-xs font-mono text-zinc-500">{l.itemSku}</div>
                </td>
                <td className="p-3 text-right font-mono text-zinc-200">
                  {l.orderedQty} {l.uom}
                </td>
                <td className="p-3 text-right font-mono text-emerald-400">
                  {l.receivedQty} {l.uom}
                </td>
                <td className="p-3 text-right font-mono text-rose-400">
                  {l.shortQty} {l.uom}
                </td>
                <td className="p-3 text-right font-mono text-zinc-200">₹{l.unitRate}</td>
                <td className="p-3 text-right">
                  {l.spikeFlag ? (
                    <Badge variant="warning">+{l.variancePct}%</Badge>
                  ) : (
                    <span className="text-xs text-zinc-400 font-mono">{l.variancePct}%</span>
                  )}
                </td>
                <td className="p-3 text-right font-mono font-semibold text-white">
                  {formatINR(l.orderedQty * l.unitRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Linked GRNs, Bills, Back-to-Back SO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 bg-zinc-900 border-zinc-800">
          <h3 className="text-sm font-semibold text-white mb-2">Linked GRNs</h3>
          {linkedGrns.length === 0 ? (
            <p className="text-xs text-zinc-500">No goods received yet.</p>
          ) : (
            linkedGrns.map((g) => (
              <div key={g.id} className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-xs mb-2">
                <div className="font-mono text-indigo-400 font-semibold">{g.grnNumber}</div>
                <div className="text-zinc-400 mt-0.5">{g.receivedDate} · {g.receivedBy}</div>
              </div>
            ))
          )}
        </Card>

        <Card className="p-4 bg-zinc-900 border-zinc-800">
          <h3 className="text-sm font-semibold text-white mb-2">Linked Supplier Bills</h3>
          {linkedBills.length === 0 ? (
            <p className="text-xs text-zinc-500">No supplier bills posted yet.</p>
          ) : (
            linkedBills.map((b) => (
              <div key={b.id} className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-xs mb-2">
                <div className="font-mono text-indigo-400 font-semibold">{b.billNumber}</div>
                <div className="text-zinc-300 mt-0.5">{formatINR(b.totalAmount)} · {b.status}</div>
              </div>
            ))
          )}
        </Card>

        <Card className="p-4 bg-zinc-900 border-zinc-800">
          <h3 className="text-sm font-semibold text-white mb-2">Back-to-Back Sales Order</h3>
          {po.linkedSalesOrderNo ? (
            <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-xs">
              <div className="font-mono text-teal-400 font-semibold">{po.linkedSalesOrderNo}</div>
              <div className="text-zinc-400 mt-1">Reserved for direct fulfillment upon GRN.</div>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Stock replenishment PO (not tied to a single SO).</p>
          )}
        </Card>
      </div>
    </div>
  );
}

