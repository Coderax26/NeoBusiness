'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Card, Dialog } from '@neo/ui';
import {
  ORDER_LIFECYCLE_STEPS,
  CANCEL_REASONS,
  evaluatePriceBand,
  formatINR,
} from '@neo/shared';
import { type SalesOrderRecord } from '../../../../../src/lib/sales-data';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<SalesOrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'lines' | 'timeline' | 'docs' | 'approvals' | 'audit'>('lines');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<string>(CANCEL_REASONS[0]);

  const mapOrderDetail = (r: any): SalesOrderRecord => {
    const rawLines = Array.isArray(r.lines) ? r.lines : [];
    const subtotal = Number(r.total_amount ?? r.subtotal ?? 0);
    const gstTotal = Number(r.gst_total ?? r.tax_total ?? Number((subtotal * 0.05).toFixed(2)));
    const grandTotal = Number(r.grand_total ?? r.grandTotal ?? subtotal + gstTotal);
    return {
      id: String(r.id),
      orderNumber: String(r.order_no || r.orderNumber || r.id),
      customerId: String(r.customer_id || r.customerId || ''),
      customerName: String(r.customer_name || r.customerName || 'Customer'),
      siteName: String(r.site_name || r.siteName || 'Main Site'),
      deliveryDate: String(r.delivery_date || r.deliveryDate || new Date().toISOString()).split('T')[0],
      deliveryWindow: (r.delivery_time_window || r.deliveryWindow || '10-12') as SalesOrderRecord['deliveryWindow'],
      status: (r.order_status || r.status || 'DRAFT') as SalesOrderRecord['status'],
      createdAt: String(r.created_at || r.createdAt || new Date().toISOString()),
      createdBy: String(r.created_by_name || r.createdBy || 'Coordinator'),
      subtotal,
      gstTotal,
      grandTotal,
      marginPct: r.margin_pct != null ? Number(r.margin_pct) : 15,
      counterOfferPrice: r.counter_offer_price != null ? Number(r.counter_offer_price) : undefined,
      counterOfferNote: r.counter_offer_note || undefined,
      cancelReason: r.cancel_reason || undefined,
      lines: rawLines.map((l: any, idx: number) => ({
        id: String(l.id || `${r.id}-line-${idx}`),
        itemId: String(l.item_id || l.itemId || ''),
        sku: String(l.sku_code || l.sku || ''),
        itemName: String(l.item_name || l.itemName || 'Item'),
        category: (l.item_category || l.category || 'PROCESSED_FG') as any,
        qty: Number(l.qty || l.ordered_qty || 0),
        uom: String(l.uom || 'kg'),
        unitPrice: Number(l.unit_price ?? l.quoted_unit_price ?? l.unitPrice ?? 0),
        gstPct: Number(l.gst_pct ?? l.gstPct ?? 5),
        floorPrice: Number(l.floor_price ?? l.floor_price_snapshot ?? l.floorPrice ?? 0),
        targetPrice: Number(l.target_price ?? l.target_price_snapshot ?? l.targetPrice ?? 0),
        atpStock: Number(l.atp_stock ?? l.atpStock ?? 0),
        reservedQty: Number(l.reserved_qty ?? l.reservedQty ?? 0),
        lineTotal: Number(
          l.line_total ??
            l.lineTotal ??
            Number(l.qty || l.ordered_qty || 0) * Number(l.unit_price ?? l.quoted_unit_price ?? l.unitPrice ?? 0),
        ),
      })),
      timeline: Array.isArray(r.timeline)
        ? r.timeline
        : [
            {
              step: String(r.order_status || r.status || 'Created'),
              timestamp: new Date(r.created_at || Date.now()).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              user: String(r.created_by_name || 'Coordinator'),
            },
          ],
    };
  };

  useEffect(() => {
    let active = true;
    fetch(`/api/proxy/orders/${encodeURIComponent(id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((r) => {
        if (!active || !r || !r.id) return;
        setOrder(mapOrderDetail(r));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  // Poll every 30s for live approval/counter updates (§4.2, OD-021)
  useEffect(() => {
    if (!order || order.status !== 'PENDING_APPROVAL') return;
    let active = true;
    const timer = setInterval(() => {
      fetch(`/api/proxy/orders/${encodeURIComponent(order.id)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((r) => {
          if (active && r && r.id) setOrder(mapOrderDetail(r));
        })
        .catch(() => {});
    }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [order?.id, order?.status]);

  const handleAcceptCounter = async () => {
    if (!order) return;
    const suggested = order.counterOfferPrice || 89.5;
    try {
      const res = await fetch(`/api/proxy/orders/${encodeURIComponent(order.id)}/accept-counter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: 'Counter-offer accepted by customer' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              status: 'CONFIRMED',
              lines: prev.lines.map((l, i) => (i === 0 ? { ...l, unitPrice: suggested } : l)),
              timeline: [
                ...prev.timeline,
                {
                  step: 'Confirmed',
                  timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                  user: 'Coordinator',
                  note: `Accepted Owner counter offer ₹${suggested}`,
                },
              ],
            }
          : prev,
      );
    } catch (err) {
      alert(`Failed to accept counter-offer: ${(err as Error).message}`);
    }
  };

  const handleSimulateCounterOffer = () => {
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            status: 'COUNTER_OFFERED',
            counterOfferPrice: 89.5,
            counterOfferNote: 'Owner suggests ₹89.50 (meets split margin target)',
          }
        : prev,
    );
  };

  const handleOwnerApprove = () => {
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            status: 'CONFIRMED',
            timeline: [
              ...prev.timeline,
              {
                step: 'Approved & Confirmed',
                timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                user: 'Owner',
              },
            ],
          }
        : prev,
    );
  };

  const handleConfirmCancel = () => {
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            status: 'CANCELLED',
            cancelReason,
            timeline: [
              ...prev.timeline,
              {
                step: 'Cancelled',
                timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                user: 'Coordinator',
                note: cancelReason,
              },
            ],
          }
        : prev,
    );
    setCancelOpen(false);
  };

  // Determine active step index on the 9-step lifecycle stepper
  const statusToStepIndex: Record<string, number> = {
    DRAFT: 0,
    PENDING_APPROVAL: 0,
    COUNTER_OFFERED: 0,
    CONFIRMED: 2,
    IN_PRODUCTION_SOURCING: 3,
    READY: 4,
    DISPATCHED: 5,
    DELIVERED: 6,
    INVOICED: 7,
    PAID: 8,
  };
  if (loading) {
    return <div className="max-w-6xl mx-auto p-6 text-sm text-zinc-400">Loading order...</div>;
  }

  if (!order) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-3">
        <Link href="/sales/orders" className="text-xs text-zinc-400 hover:text-white inline-block">
          ← Back to Orders
        </Link>
        <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-400">
          Order not found.
        </div>
      </div>
    );
  }

  const currentStepIdx = statusToStepIndex[order.status] ?? 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-white font-mono">{order.orderNumber}</h1>
            <StatusPill
              tone={
                order.status === 'DELIVERED' || order.status === 'CONFIRMED' || order.status === 'READY'
                  ? 'success'
                  : order.status === 'PENDING_APPROVAL' || order.status === 'COUNTER_OFFERED'
                  ? 'warning'
                  : order.status === 'CANCELLED'
                  ? 'danger'
                  : 'neutral'
              }
              label={order.status.replace('_', ' ')}
            />
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Customer:{' '}
            <Link href={`/sales/customers/${order.customerId}`} className="text-teal-400 font-bold hover:underline">
              {order.customerName}
            </Link>{' '}
            · Site: {order.siteName} · Delivery: {order.deliveryDate} (Slot {order.deliveryWindow})
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="text-right mr-2">
            <span className="text-[11px] text-zinc-400 block">Order Total</span>
            <span className="text-lg font-mono font-black text-teal-400">{formatINR(order.grandTotal)}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            🖨️ Print
          </Button>
          {order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && (
            <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
              Cancel Order
            </Button>
          )}
        </div>
      </div>

      {/* Live Approval / Counter-offer Banner (§4.2, AC-3) */}
      {order.status === 'PENDING_APPROVAL' && (
        <div className="p-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-amber-200">⏳ Waiting for Owner Approval</h2>
            <p className="text-xs text-amber-300/80 mt-0.5">
              {order.approvalReason || 'Order requires Owner exception approval.'} (Live polling every 30s)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleSimulateCounterOffer}>
              Simulate Counter Offer (₹89.50)
            </Button>
            <Button variant="primary" size="sm" onClick={handleOwnerApprove}>
              ✓ Owner Approve
            </Button>
          </div>
        </div>
      )}

      {order.status === 'COUNTER_OFFERED' && (
        <div className="p-4 rounded-2xl border border-indigo-500/40 bg-indigo-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-indigo-200">
              💬 Owner suggests ₹{order.counterOfferPrice?.toFixed(2) || '89.50'}
            </h2>
            <p className="text-xs text-indigo-300/80 mt-0.5">
              {order.counterOfferNote || 'Accept the Owner counter offer to confirm this order immediately.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleAcceptCounter}>
              Accept counter ✓
            </Button>
          </div>
        </div>
      )}

      {/* 9-Step Lifecycle Stepper (§6) */}
      <Card className="p-4 overflow-x-auto">
        <div className="flex items-center justify-between min-w-[700px] gap-2">
          {ORDER_LIFECYCLE_STEPS.map((step, idx) => {
            const done = idx <= currentStepIdx && order.status !== 'CANCELLED';
            const isCurrent = idx === currentStepIdx && order.status !== 'CANCELLED';
            return (
              <div key={step} className="flex-1 flex flex-col items-center text-center relative">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${
                    done
                      ? isCurrent
                        ? 'bg-teal-500 text-white border-teal-400 ring-2 ring-teal-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                  }`}
                >
                  {done && !isCurrent ? '✓' : idx + 1}
                </div>
                <span className={`text-[11px] mt-1.5 font-semibold ${done ? 'text-white' : 'text-zinc-500'}`}>
                  {step}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Tabs (§6) */}
      <div className="flex border-b border-zinc-800 text-xs font-semibold gap-6 overflow-x-auto">
        {[
          { key: 'lines', label: `Lines (${order.lines.length})` },
          { key: 'timeline', label: `Timeline (${order.timeline.length})` },
          { key: 'docs', label: 'Linked Documents' },
          { key: 'approvals', label: 'Approvals' },
          { key: 'audit', label: 'Audit' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`pb-2.5 border-b-2 transition-colors ${
              activeTab === t.key ? 'border-teal-500 text-teal-400' : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'lines' && (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase font-semibold">
              <tr>
                <th className="p-3">Item</th>
                <th className="p-3">Qty</th>
                <th className="p-3">Unit Price</th>
                <th className="p-3">Price Band</th>
                <th className="p-3">Stock Reservation</th>
                <th className="p-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {order.lines.map((l) => {
                const band = evaluatePriceBand(l.unitPrice, l.floorPrice, l.targetPrice, l.floorPrice * 0.85);
                return (
                  <tr key={l.id}>
                    <td className="p-3">
                      <div className="font-bold text-white">{l.itemName}</div>
                      <div className="text-[11px] font-mono text-zinc-400">{l.sku}</div>
                    </td>
                    <td className="p-3 font-mono">{l.qty} {l.uom}</td>
                    <td className="p-3 font-mono font-bold text-white">₹{l.unitPrice}</td>
                    <td className="p-3">
                      <Badge tone={band.status === 'BELOW_FLOOR' ? 'warning' : 'success'}>{band.chipLabel}</Badge>
                    </td>
                    <td className="p-3 text-zinc-300">
                      {l.reservedQty > 0 ? `${l.reservedQty} ${l.uom} reserved` : 'Pending confirmation'}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-white">
                      {formatINR(l.qty * l.unitPrice)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {activeTab === 'timeline' && (
        <Card className="p-5 space-y-3">
          {order.timeline.map((ev, i) => (
            <div key={i} className="flex items-start gap-3 text-xs border-l-2 border-teal-500/40 pl-3 py-1">
              <div className="flex-1">
                <span className="font-bold text-white">{ev.step}</span>
                {ev.note && <span className="text-zinc-400 ml-2">— {ev.note}</span>}
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  {ev.timestamp} · by {ev.user}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}

      {activeTab === 'docs' && (
        <Card className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
            <span className="text-zinc-500 block">Dispatch Trip / Challan</span>
            <span className="font-mono font-bold text-teal-400">{order.linkedTripNo || 'Not assigned yet'}</span>
          </div>
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
            <span className="text-zinc-500 block">Tax Invoice</span>
            <span className="font-mono font-bold text-white">{order.linkedInvoiceNo || 'Pending delivery'}</span>
          </div>
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
            <span className="text-zinc-500 block">Linked Quote</span>
            <span className="font-mono font-bold text-zinc-300">{order.linkedQuoteId || 'Direct order'}</span>
          </div>
        </Card>
      )}

      {activeTab === 'approvals' && (
        <Card className="p-5 text-xs text-zinc-300">
          {order.approvalReason ? (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <strong>Exception Reason:</strong> {order.approvalReason}
            </div>
          ) : (
            <span className="text-zinc-500">No approval exceptions on this order.</span>
          )}
        </Card>
      )}

      {activeTab === 'audit' && (
        <Card className="p-5 text-xs text-zinc-400 space-y-1">
          <div>Created by: <strong className="text-white">{order.createdBy}</strong> at {order.createdAt}</div>
          <div>Current status: <strong className="text-white">{order.status}</strong></div>
        </Card>
      )}

      {/* Cancel Modal */}
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel Sales Order" maxWidth="sm">
        <div className="space-y-4 my-2 text-xs">
          <select
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
          >
            {CANCEL_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCancelOpen(false)}>Back</Button>
            <Button variant="danger" size="sm" onClick={handleConfirmCancel}>Confirm Cancel</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
