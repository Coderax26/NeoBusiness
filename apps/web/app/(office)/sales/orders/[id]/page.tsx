'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Printer, Copy } from 'lucide-react';
import { Button, Badge, StatusPill, Dialog } from '@neo/ui';
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
  const [siteId, setSiteId] = useState<string>('');
  const [fulfillmentSites, setFulfillmentSites] = useState<Array<{ id: string; name: string }>>([]);
  const [savingSite, setSavingSite] = useState(false);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [invoiceStatus, setInvoiceStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'lines' | 'timeline' | 'docs' | 'approvals' | 'audit'>('lines');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<string>(CANCEL_REASONS[0]);

  const mapOrderDetail = (r: any): SalesOrderRecord => {
    const rawLines = Array.isArray(r.lines) ? r.lines : [];
    const subtotal = Number(r.total_amount ?? r.subtotal ?? 0);
    const gstTotal = Number(r.gst_total ?? r.tax_total ?? Number((subtotal * 0.05).toFixed(2)));
    const grandTotal = Number(r.grand_total ?? r.grandTotal ?? subtotal + gstTotal);
    const exList = Array.isArray(r.exceptions) ? r.exceptions : [];
    const mappedTimeline = Array.isArray(r.timeline)
      ? r.timeline
      : Array.isArray(r.statusLog) && r.statusLog.length > 0
        ? r.statusLog.map((row: any) => ({
            step: String(row.to_status || 'Updated'),
            timestamp: new Date(row.at || Date.now()).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            user: String(row.actor_name || r.created_by_name || 'System'),
            note: row.reason || undefined,
          }))
        : [
            {
              step: String(r.order_status || r.status || 'Created'),
              timestamp: new Date(r.created_at || Date.now()).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              user: String(r.created_by_name || 'Coordinator'),
            },
          ];

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
      approvalReason:
        exList.find((e: any) => e.status === 'PENDING')?.context_payload_json?.summary ||
        r.approval_reason ||
        undefined,
      counterOfferPrice: r.counter_offer_price != null ? Number(r.counter_offer_price) : undefined,
      counterOfferNote: r.counter_offer_note || undefined,
      cancelReason: r.cancel_reason || undefined,
      linkedInvoiceNo: r.linkedInvoiceNo || r.invoice?.invoice_no || undefined,
      linkedTripNo: r.linkedTripNo || r.trip?.trip_no || undefined,
      linkedQuoteId: r.source_quote_id || r.linkedQuoteId || undefined,
      lines: rawLines.map((l: any, idx: number) => ({
        id: String(l.id || `${r.id}-line-${idx}`),
        itemId: String(l.item_id || l.itemId || ''),
        sku: String(l.sku_code || l.sku || ''),
        itemName: String(l.item_name || l.itemName || 'Item'),
        category: (l.item_category || l.category || 'PROCESSED_FG') as any,
        qty: Number(l.qty || l.ordered_qty || 0),
        uom: String(l.uom || l.primary_uom || 'kg'),
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
      timeline: mappedTimeline,
    };
  };

  const refreshOrder = async (silent = false) => {
    try {
      const res = await fetch(`/api/proxy/orders/${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const r = await res.json();
      if (r && r.id) {
        setOrder(mapOrderDetail(r));
        setSiteId(String(r.fulfillment_site_id || ''));
        setExceptions(Array.isArray(r.exceptions) ? r.exceptions : []);
        setInvoiceStatus(r.invoiceStatus || r.invoice?.status || null);
      }
    } catch {
      // ignore network failure
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    refreshOrder();
    fetch('/api/proxy/sites?fulfillmentOnly=true')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (Array.isArray(rows)) {
          setFulfillmentSites(rows.map((s: any) => ({ id: String(s.id), name: String(s.name) })));
        }
      })
      .catch(() => {});
  }, [id]);

  const handleSaveFulfillmentSite = async (nextSiteId: string) => {
    if (!order || !nextSiteId || nextSiteId === siteId) return;
    setActionMsg(null);
    setSavingSite(true);
    try {
      const res = await fetch(`/api/proxy/orders/${encodeURIComponent(order.id)}/fulfillment-site`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fulfillmentSiteId: nextSiteId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || payload?.error?.message || `HTTP ${res.status}`);
      }
      await refreshOrder(true);
      setActionMsg({
        text: `Fulfillment site changed to ${payload?.siteName || 'selected site'}.`,
        tone: 'success',
      });
    } catch (err) {
      setActionMsg({ text: (err as Error).message, tone: 'error' });
    } finally {
      setSavingSite(false);
    }
  };

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
        body: JSON.stringify({
          remarks: 'Counter-offer accepted by customer',
          counterPrice: suggested,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await refreshOrder(true);
      setActionMsg({
        text: `Accepted Owner counter-offer (₹${suggested}) and confirmed order.`,
        tone: 'success',
      });
    } catch (err) {
      alert(`Failed to accept counter-offer: ${(err as Error).message}`);
    }
  };

  const handleTransition = async (endpoint: string, successLabel: string, body: Record<string, unknown> = {}) => {
    if (!order) return;
    setActionMsg(null);
    setBusyAction(endpoint);
    try {
      const res = await fetch(`/api/proxy/orders/${encodeURIComponent(order.id)}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const errOrData = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(errOrData?.message || errOrData?.error?.message || `HTTP ${res.status}`);
      }
      await refreshOrder(true);
      setActionMsg({ text: successLabel, tone: 'success' });
    } catch (err) {
      setActionMsg({ text: (err as Error).message, tone: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!order) return;
    setActionMsg(null);
    setBusyAction('invoice');
    try {
      const res = await fetch('/api/proxy/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          ...(siteId ? { siteId } : {}),
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || payload?.error?.message || `HTTP ${res.status}`);
      }
      const invNo = payload?.data?.invoiceNo || payload?.invoiceNo || 'Invoice';
      await refreshOrder(true);
      setActionMsg({ text: `${invNo} generated successfully.`, tone: 'success' });
    } catch (err) {
      setActionMsg({ text: `Failed to generate invoice: ${(err as Error).message}`, tone: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleExceptionAction = async (
    action: 'APPROVED' | 'COUNTERED',
    counterPrice?: number,
  ) => {
    if (!order) return;
    const pendingEx = exceptions.find((ex: any) => ex.status === 'PENDING');
    if (!pendingEx) {
      setActionMsg({ text: 'No pending approval exception found for this order.', tone: 'error' });
      return;
    }
    setActionMsg(null);
    setBusyAction(action);
    try {
      const res = await fetch(`/api/proxy/exceptions/${encodeURIComponent(pendingEx.id)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          remarks:
            action === 'APPROVED'
              ? 'Approved from Order Detail'
              : `Counter-offer ₹${counterPrice}`,
          ...(counterPrice ? { counter: { orderId: order.id, counterPrice: String(counterPrice) } } : {}),
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || payload?.error?.message || `HTTP ${res.status}`);
      }
      await refreshOrder(true);
      setActionMsg({
        text: action === 'APPROVED' ? 'Exception approved & order confirmed.' : 'Counter-offer recorded.',
        tone: 'success',
      });
    } catch (err) {
      setActionMsg({ text: (err as Error).message, tone: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!order) return;
    setActionMsg(null);
    setBusyAction('cancel');
    try {
      const res = await fetch(`/api/proxy/orders/${encodeURIComponent(order.id)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || payload?.error?.message || `HTTP ${res.status}`);
      }
      setCancelOpen(false);
      await refreshOrder(true);
      setActionMsg({ text: 'Order cancelled and reservations released.', tone: 'success' });
    } catch (err) {
      setActionMsg({ text: `Failed to cancel order: ${(err as Error).message}`, tone: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  const statusToStepIndex: Record<string, number> = {
    DRAFT: 0,
    PENDING_APPROVAL: 0,
    COUNTER_OFFERED: 0,
    CONFIRMED: 2,
    IN_PRODUCTION_SOURCING: 3,
    READY: 4,
    DISPATCHED: 5,
    DELIVERED: 6,
    DELIVERED_FULL: 6,
    DELIVERED_PARTIAL: 6,
    INVOICED: 7,
    PAID: 8,
    CLOSED: 8,
  };

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6 text-[14px] text-ink-3">Loading order...</div>;
  }

  if (!order) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-3">
        <Link href="/sales/orders" className="text-[13.5px] text-action hover:underline inline-block">
          ← Back to Orders
        </Link>
        <div className="p-6 rounded-[4px] bg-sheet border border-rule text-[14px] text-ink-3">
          Order not found.
        </div>
      </div>
    );
  }

  const baseStepIdx = statusToStepIndex[order.status] ?? 0;
  const currentStepIdx =
    invoiceStatus === 'PAID'
      ? 8
      : order.linkedInvoiceNo && baseStepIdx < 7
        ? 7
        : baseStepIdx;
  const isTerminal = ['CANCELLED', 'REJECTED', 'CLOSED'].includes(order.status);

  return (
    <div className="space-y-5 max-w-[1220px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 no-print">
        <div>
          <div className="text-[13px] text-ink-3 mb-1">
            <Link href="/sales/orders" className="text-action hover:underline">
              Orders
            </Link>{' '}
            /{' '}
            <Link href={`/sales/customers/${order.customerId}`} className="hover:underline text-ink-2">
              {order.customerName}
            </Link>
          </div>
          <div className="flex flex-wrap items-baseline gap-4">
            <h1 className="font-serif text-[32px] font-medium text-ink leading-none">
              {order.orderNumber}
            </h1>
            <StatusPill
              entity="ORDER"
              status={order.status}
            />
            <span className="text-[13.5px] text-ink-3">
              {formatINR(order.grandTotal)} · deliver {order.deliveryDate} ({order.deliveryWindow})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {order.status === 'DRAFT' && (
            <Button
              variant="primary"
              size="sm"
              disabled={busyAction !== null}
              onClick={() => handleTransition('confirm', 'Order confirmed.')}
            >
              Confirm Order
            </Button>
          )}
          {(order.status === 'CONFIRMED' || order.status === 'IN_PRODUCTION_SOURCING') && (
            <>
              <Button
                variant="primary"
                size="sm"
                disabled={busyAction !== null}
                onClick={() => handleTransition('mark-ready', 'Order marked READY for dispatch.')}
              >
                Mark Ready for Dispatch →
              </Button>
              <Link href={`/logistics/trips/new?orderId=${encodeURIComponent(order.id)}`}>
                <Button variant="secondary" size="sm">
                  Dispatch (Own Fleet / 3PL)
                </Button>
              </Link>
            </>
          )}
          {order.status === 'READY' && (
            <>
              <Link href={`/logistics/trips/new?orderId=${encodeURIComponent(order.id)}`}>
                <Button variant="primary" size="sm">
                  Dispatch (Own Fleet / 3PL) →
                </Button>
              </Link>
              <Button
                variant="secondary"
                size="sm"
                disabled={busyAction !== null}
                onClick={() => handleTransition('mark-dispatched', 'Order marked DISPATCHED.')}
              >
                Mark Dispatched
              </Button>
            </>
          )}
          {order.status === 'DISPATCHED' && (
            <Button
              variant="primary"
              size="sm"
              disabled={busyAction !== null}
              onClick={() => handleTransition('mark-delivered', 'Order marked DELIVERED.')}
            >
              Mark Delivered →
            </Button>
          )}
          {!order.linkedInvoiceNo &&
            ['CONFIRMED', 'READY', 'DISPATCHED', 'DELIVERED', 'DELIVERED_FULL', 'DELIVERED_PARTIAL'].includes(
              order.status,
            ) && (
              <Button
                variant="secondary"
                size="sm"
                disabled={busyAction !== null}
                onClick={handleGenerateInvoice}
              >
                Generate Invoice
              </Button>
            )}
          {order.linkedInvoiceNo && invoiceStatus !== 'PAID' && (
            <Link href="/finance/collections">
              <Button variant="primary" size="sm">
                Record Payment ({order.linkedInvoiceNo}) →
              </Button>
            </Link>
          )}
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />
            Print
          </Button>
          <Link href="/sales/orders/new">
            <Button variant="secondary" size="sm">
              <Copy className="w-4 h-4" />
              Repeat order
            </Button>
          </Link>
          {!isTerminal && (
            <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
              Cancel Order
            </Button>
          )}
        </div>
      </div>

      {actionMsg && (
        <div
          className={`p-3 rounded-[3px] border text-[13px] font-medium no-print ${
            actionMsg.tone === 'success'
              ? 'bg-leaf-soft border-leaf/30 text-leaf'
              : 'bg-madder-soft border-madder/30 text-madder'
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {/* Live Approval / Counter-offer Banner (§4.2, AC-3) */}
      {order.status === 'PENDING_APPROVAL' && !order.counterOfferPrice && (
        <div className="p-4 rounded-[3px] border-l-4 border-haldi bg-haldi-soft flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 no-print">
          <div>
            <h2 className="text-[14.5px] font-semibold text-haldi">Waiting for Owner Approval</h2>
            <p className="text-[13px] text-ink-2 mt-0.5">
              {order.approvalReason || 'Order requires Owner exception approval.'} (Checks every 30s)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busyAction !== null}
              onClick={() => handleExceptionAction('COUNTERED', 89.5)}
            >
              Counter Offer (₹89.50)
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busyAction !== null}
              onClick={() => handleExceptionAction('APPROVED')}
            >
              Owner Approve
            </Button>
          </div>
        </div>
      )}

      {(order.status === 'COUNTER_OFFERED' ||
        (order.status === 'PENDING_APPROVAL' && order.counterOfferPrice != null)) && (
        <div className="p-4 rounded-[3px] border-l-4 border-action bg-action-soft flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 no-print">
          <div>
            <h2 className="text-[14.5px] font-semibold text-action">
              Owner suggests ₹{order.counterOfferPrice?.toFixed(2) || '89.50'}
            </h2>
            <p className="text-[13px] text-ink-2 mt-0.5">
              {order.counterOfferNote || 'Accept the Owner counter offer to confirm this order immediately.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleAcceptCounter}>
              Accept counter ✓
            </Button>
          </div>
        </div>
      )}

      {/* Document Tabs */}
      <div className="flex border-b border-rule text-[14px] gap-7 overflow-x-auto no-print">
        {[
          { key: 'lines', label: `Order (${order.lines.length})` },
          { key: 'timeline', label: `Timeline (${order.timeline.length})` },
          { key: 'docs', label: 'Linked Documents' },
          { key: 'approvals', label: 'Approvals' },
          { key: 'audit', label: 'Audit' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`pb-2.5 border-b-2 -mb-px transition-colors whitespace-nowrap ${
              activeTab === t.key ? 'border-ink text-ink font-semibold' : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main Two-Column Document View */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0 border border-rule rounded-[4px] overflow-hidden">
        {/* Left: Paper Well + Printable Sheet */}
        <div className="bg-paper p-4 sm:p-7 border-b lg:border-b-0 lg:border-r border-rule">
          {activeTab === 'lines' && (
            <div className="bahi-print-sheet bahi-sheet-shadow bg-[#FFFEFA] text-[#1E1C19] p-6 sm:p-9 relative">
              {/* Rubber Stamp */}
              <div className="bahi-stamp hidden sm:block absolute top-24 right-10 px-3 py-1 text-[13px] font-semibold">
                {order.status.replace(/_/g, ' ')}
                <span className="block font-mono text-[10px] font-medium tracking-normal text-center">
                  {order.deliveryDate}
                </span>
              </div>

              {/* Double-Ruled Letterhead */}
              <div className="flex flex-wrap justify-between gap-4 pb-4 border-b-[3px] border-double border-[#1E1C19]">
                <div>
                  <div className="font-serif text-[20px] font-semibold text-[#1E1C19]">
                    {order.siteName || 'Baramati Agro Foods Pvt. Ltd.'}
                  </div>
                  <div className="text-[12px] text-[#55504A] mt-1 leading-relaxed">
                    NeoBus Office &amp; Dispatch Document
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-serif text-[18px] font-medium text-[#1E1C19]">Sales order</div>
                  <div className="font-mono text-[13px] text-[#1E1C19]">{order.orderNumber}</div>
                  <div className="text-[12px] text-[#55504A]">{order.createdAt.split('T')[0]}</div>
                </div>
              </div>

              {/* Parties */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-4 text-[13px] text-[#55504A]">
                <div>
                  <div className="text-[12px] text-[#77716A] mb-0.5">Bill to</div>
                  <div className="font-semibold text-[14px] text-[#1E1C19]">{order.customerName}</div>
                  <div>Site: {order.siteName}</div>
                </div>
                <div>
                  <div className="text-[12px] text-[#77716A] mb-0.5">Deliver</div>
                  <div className="font-semibold text-[14px] text-[#1E1C19]">
                    {order.deliveryDate} · Slot {order.deliveryWindow}
                  </div>
                  <div>Entered by {order.createdBy}</div>
                </div>
              </div>

              {/* Lines Table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px] tabular-nums">
                  <thead>
                    <tr className="border-y border-[#1E1C19] text-[#77716A]">
                      <th className="py-2 px-1.5 text-left font-medium w-8">#</th>
                      <th className="py-2 px-1.5 text-left font-medium">Item</th>
                      <th className="py-2 px-1.5 text-left font-medium">Band</th>
                      <th className="py-2 px-1.5 text-right font-medium">Qty</th>
                      <th className="py-2 px-1.5 text-right font-medium">Rate</th>
                      <th className="py-2 px-1.5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lines.map((l, idx) => {
                      const band = evaluatePriceBand(l.unitPrice, l.floorPrice, l.targetPrice, l.floorPrice * 0.85);
                      return (
                        <tr key={l.id} className="border-b border-[#E2DACA]">
                          <td className="py-2.5 px-1.5 text-[#77716A]">{idx + 1}</td>
                          <td className="py-2.5 px-1.5">
                            <div className="font-medium text-[#1E1C19]">{l.itemName}</div>
                            <div className="text-[12px] text-[#77716A]">
                              {l.sku ? `${l.sku} · ` : ''}
                              {l.reservedQty > 0 ? `${l.reservedQty} ${l.uom} reserved` : 'Pending reservation'}
                            </div>
                          </td>
                          <td className="py-2.5 px-1.5">
                            <Badge tone={band.status === 'BELOW_FLOOR' ? 'warning' : 'success'}>
                              {band.chipLabel}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-1.5 text-right font-mono">{l.qty} {l.uom}</td>
                          <td className="py-2.5 px-1.5 text-right font-mono">{l.unitPrice.toFixed(2)}</td>
                          <td className="py-2.5 px-1.5 text-right font-mono font-medium">
                            {formatINR(l.qty * l.unitPrice, { showSymbol: false })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Double-Underlined Totals */}
              <div className="w-72 ml-auto mt-4 text-[13px] tabular-nums">
                <div className="flex justify-between py-1 px-1.5">
                  <span className="text-[#55504A]">Subtotal</span>
                  <span className="font-mono">{formatINR(order.subtotal, { showSymbol: false })}</span>
                </div>
                <div className="flex justify-between py-1 px-1.5">
                  <span className="text-[#55504A]">GST</span>
                  <span className="font-mono">{formatINR(order.gstTotal, { showSymbol: false })}</span>
                </div>
                <div className="flex justify-between py-2 px-1.5 mt-1 border-t border-[#1E1C19] border-b-[3px] border-double font-serif text-[17px] font-semibold text-[#1E1C19]">
                  <span>Total</span>
                  <span>{formatINR(order.grandTotal)}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="bg-sheet border border-rule rounded-[4px] p-5 space-y-3">
              {order.timeline.map((ev, i) => (
                <div key={i} className="flex items-start gap-3 text-[13.5px] border-l-2 border-action/40 pl-3 py-1">
                  <div className="flex-1">
                    <span className="font-semibold text-ink">{ev.step}</span>
                    {ev.note && <span className="text-ink-2 ml-2">— {ev.note}</span>}
                    <div className="text-[12.5px] text-ink-3 mt-0.5">
                      {ev.timestamp} · by {ev.user}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'docs' && (
            <div className="bg-sheet border border-rule rounded-[4px] p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-[13.5px]">
              <div className="p-3 bg-paper border border-rule rounded-[3px]">
                <span className="text-ink-3 block text-[12.5px]">Dispatch Trip / Challan</span>
                <span className="font-mono font-semibold text-action">{order.linkedTripNo || 'Not assigned yet'}</span>
              </div>
              <div className="p-3 bg-paper border border-rule rounded-[3px]">
                <span className="text-ink-3 block text-[12.5px]">Tax Invoice</span>
                <span className="font-mono font-semibold text-ink">{order.linkedInvoiceNo || 'Pending delivery'}</span>
              </div>
              <div className="p-3 bg-paper border border-rule rounded-[3px]">
                <span className="text-ink-3 block text-[12.5px]">Linked Quote</span>
                <span className="font-mono font-semibold text-ink-2">{order.linkedQuoteId || 'Direct order'}</span>
              </div>
            </div>
          )}

          {activeTab === 'approvals' && (
            <div className="bg-sheet border border-rule rounded-[4px] p-5 text-[14px] text-ink-2">
              {order.approvalReason ? (
                <div className="p-3.5 bg-haldi-soft border-l-4 border-haldi rounded-[3px]">
                  <strong className="text-haldi">Exception Reason:</strong> {order.approvalReason}
                </div>
              ) : (
                <span className="text-ink-3">No approval exceptions on this order.</span>
              )}
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="bg-sheet border border-rule rounded-[4px] p-5 text-[13.5px] text-ink-2 space-y-1.5">
              <div>Created by: <strong className="text-ink">{order.createdBy}</strong> at {order.createdAt}</div>
              <div>Current status: <strong className="text-ink">{order.status}</strong></div>
            </div>
          )}
        </div>

        {/* Right: Progress & Facts Panel */}
        <aside className="bg-sheet p-6 space-y-6 no-print">
          <div>
            <h3 className="text-[14px] font-semibold text-ink pb-2 bahi-section-rule mb-3">
              Progress
            </h3>
            <ul className="space-y-3 relative">
              {ORDER_LIFECYCLE_STEPS.map((step, idx) => {
                const done = idx <= currentStepIdx && order.status !== 'CANCELLED';
                const isCurrent = idx === currentStepIdx && order.status !== 'CANCELLED';
                return (
                  <li key={step} className="flex items-start gap-3 text-[13.5px]">
                    <span
                      className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${
                        isCurrent
                          ? 'bg-sheet border-2 border-action'
                          : done
                          ? 'bg-leaf'
                          : 'bg-sheet border border-rule-strong'
                      }`}
                    />
                    <span className={isCurrent ? 'font-semibold text-action' : done ? 'text-ink' : 'text-ink-3'}>
                      {step}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="pt-2">
            <h3 className="text-[14px] font-semibold text-ink pb-2 bahi-section-rule mb-2.5">
              Fulfillment Site
            </h3>
            {['DRAFT', 'PENDING_APPROVAL', 'CONFIRMED', 'IN_PRODUCTION_SOURCING', 'READY'].includes(
              order.status,
            ) && fulfillmentSites.length > 0 ? (
              <div className="space-y-1.5">
                <select
                  value={siteId}
                  disabled={savingSite}
                  onChange={(e) => void handleSaveFulfillmentSite(e.target.value)}
                  className="w-full rounded-[3px] border border-rule-strong bg-paper px-2.5 py-1.5 text-[13px] text-ink"
                >
                  {fulfillmentSites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11.5px] text-ink-3">
                  {savingSite ? 'Updating fulfillment site...' : 'Choose which site packs & ships this order.'}
                </p>
              </div>
            ) : (
              <div className="text-[13.5px] font-medium text-ink">{order.siteName}</div>
            )}
          </div>

          <div className="pt-2">
            <h3 className="text-[14px] font-semibold text-ink pb-2 bahi-section-rule mb-2.5">
              Margin
            </h3>
            <div className="font-serif text-[28px] font-medium text-ink">
              {(order.marginPct ?? 15).toFixed(1)}%{' '}
              <span className="font-sans text-[13px] text-leaf font-normal">
                {(order.marginPct ?? 15) >= 15 ? 'above 15% target' : 'below 15% target'}
              </span>
            </div>
          </div>
        </aside>
      </div>

      {/* Cancel Modal */}
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel Sales Order" maxWidth="sm">
        <div className="space-y-4 my-2 text-[13.5px]">
          <select
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="w-full bg-paper border border-rule-strong rounded-[3px] px-3 py-2 text-ink"
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
