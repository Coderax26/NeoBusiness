'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Card } from '@neo/ui';
import {
  evaluatePriceBand,
  evaluateCreditExposure,
  evaluateStockAvailability,
  evaluateOrderApprovalNeed,
  canViewMarginAndCost,
  formatINR,
  type SessionUser,
} from '@neo/shared';
import {
  type DailyPriceRow,
  type SalesOrderLine,
} from '../../../../../src/lib/sales-data';

type CustomerSummaryOption = {
  id: string;
  code: string;
  name: string;
  phone: string;
  gstin: string;
  site: string;
  defaultSiteId?: string;
  window: '10-12' | '04-08' | '13-16' | '18-21';
  creditLimit: number;
  outstanding: number;
  overdueDays: number;
  creditHold: boolean;
  lastOrderDate: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function QuickOrderEntryPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mode, setMode] = useState<'GUIDED' | 'EXPRESS'>('GUIDED');
  const [guidedStep, setGuidedStep] = useState<1 | 2 | 3>(1);

  const [customers, setCustomers] = useState<CustomerSummaryOption[]>([]);
  const [dailyPrices, setDailyPrices] = useState<DailyPriceRow[]>([]);
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [deliveryWindow, setDeliveryWindow] = useState<'10-12' | '04-08' | '13-16' | '18-21'>('10-12');
  const [siteName, setSiteName] = useState('NeoCore Factory — Mumbai');

  const [lines, setLines] = useState<SalesOrderLine[]>([]);

  const [focusedItemId, setFocusedItemId] = useState<string>('');
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedOrder, setSubmittedOrder] = useState<{
    id: string;
    orderNumber: string;
    status: string;
  } | null>(null);

  useEffect(() => {
    let active = true;

    const loadInitialData = async () => {
      let loadedSites: Array<{ id: string; name: string }> = [];
      let fallbackSiteId = '';
      try {
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const meData = await meRes.json();
          if (active && meData?.user) {
            setUser(meData.user);
            loadedSites = Array.isArray(meData.user.sites)
              ? meData.user.sites.map((s: any) => ({
                  id: String(s.id),
                  name: String(s.name || s.id),
                }))
              : [];
            if (loadedSites.length > 0) {
              setSites(loadedSites);
              fallbackSiteId = loadedSites[0].id;
              setSelectedSiteId((prev) => prev || loadedSites[0].id);
              setSiteName(loadedSites[0].name);
            } else if (meData.user.activeSiteId) {
              fallbackSiteId = String(meData.user.activeSiteId);
              setSelectedSiteId((prev) => prev || fallbackSiteId);
            }
          }
        }
      } catch {
        // ignore network error
      }

      try {
        const custRes = await fetch('/api/proxy/customers');
        if (custRes.ok) {
          const custRows = await custRes.json();
          if (active && Array.isArray(custRows) && custRows.length > 0) {
            const siteLookup = new Map(loadedSites.map((s) => [s.id, s.name]));
            const mappedCustomers: CustomerSummaryOption[] = custRows.map((c: any) => {
              const defSiteId = c.default_site_id ? String(c.default_site_id) : fallbackSiteId;
              const win = c.preferred_delivery_window;
              const normalizedWin: '10-12' | '04-08' | '13-16' | '18-21' =
                win === '04-08' || win === '10-12' || win === '13-16' || win === '18-21'
                  ? win
                  : '10-12';
              return {
                id: String(c.id),
                code: String(c.customer_code || ''),
                name: String(c.business_name || c.name || 'Customer'),
                phone: String(c.phone || ''),
                gstin: String(c.gstin || ''),
                site:
                  siteLookup.get(defSiteId) ||
                  loadedSites[0]?.name ||
                  'NeoCore Factory — Mumbai',
                defaultSiteId: defSiteId,
                window: normalizedWin,
                creditLimit: Number(c.credit_limit ?? 0),
                outstanding: Number(c.current_ar_balance ?? 0),
                overdueDays: 0,
                creditHold: Boolean(c.credit_hold),
                lastOrderDate: '',
              };
            });
            setCustomers(mappedCustomers);
            setSelectedCustomerId(mappedCustomers[0].id);
            setDeliveryWindow(mappedCustomers[0].window);
            if (mappedCustomers[0].defaultSiteId) {
              setSelectedSiteId(mappedCustomers[0].defaultSiteId);
              setSiteName(mappedCustomers[0].site);
            }
          }
        }
      } catch {
        // ignore network error
      }

      try {
        const priceRes = await fetch('/api/proxy/prices/today');
        if (priceRes.ok) {
          const priceRows = await priceRes.json();
          if (active && Array.isArray(priceRows) && priceRows.length > 0) {
            const mappedPrices: DailyPriceRow[] = priceRows.map((r: any) => {
              const isUnset = r.source === 'UNSET';
              const floor = isUnset || r.floorPrice == null ? null : Number(r.floorPrice);
              const target = isUnset || r.targetPrice == null ? null : Number(r.targetPrice);
              return {
                itemId: String(r.itemId),
                sku: String(r.skuCode || ''),
                itemName: String(r.itemName || ''),
                category:
                  r.itemCategory === 'RAW_MATERIAL' ||
                  r.itemCategory === 'PROCESSED_FG' ||
                  r.itemCategory === 'TRADED_GOOD'
                    ? r.itemCategory
                    : 'PROCESSED_FG',
                uom: String(r.primaryUom || 'KG').toLowerCase(),
                yesterdayFloor: floor ?? 0,
                yesterdayTarget: target ?? 0,
                landedCost: Number(r.latestLandedCost ?? 0),
                minMarginPct: Number(r.minMarginPctUsed ?? 0.15) * 100,
                floorPrice: floor,
                targetPrice: target,
                priceSource: String(r.source || ''),
                isPublished: Boolean(r.isPublished),
                atpStock: 500,
              };
            });
            setDailyPrices(mappedPrices);
            const firstItem = mappedPrices[0];
            setFocusedItemId(firstItem.itemId);
            const defaultTarget = firstItem.targetPrice ?? (firstItem.yesterdayTarget || 0);
            const defaultFloor = firstItem.floorPrice ?? (firstItem.yesterdayFloor || 0);
            setLines((prev) =>
              prev.length === 0
                ? [
                    {
                      id: 'line-1',
                      itemId: firstItem.itemId,
                      sku: firstItem.sku,
                      itemName: firstItem.itemName,
                      category: firstItem.category,
                      qty: 50,
                      uom: firstItem.uom,
                      unitPrice: defaultTarget,
                      floorPrice: defaultFloor,
                      targetPrice: defaultTarget,
                      atpStock: firstItem.atpStock,
                      gstPct: 5,
                      reservedQty: 0,
                    },
                  ]
                : prev.map((l, idx) =>
                    idx === 0 && !UUID_RE.test(l.itemId)
                      ? {
                          ...l,
                          itemId: firstItem.itemId,
                          sku: firstItem.sku,
                          itemName: firstItem.itemName,
                          category: firstItem.category,
                          qty: 50,
                          uom: firstItem.uom,
                          unitPrice: defaultTarget,
                          floorPrice: defaultFloor,
                          targetPrice: defaultTarget,
                          atpStock: firstItem.atpStock,
                        }
                      : l,
                  ),
            );
          }
        }
      } catch {
        // ignore network error
      }
    };

    loadInitialData();
    return () => {
      active = false;
    };
  }, []);

  const isOwner = !user || canViewMarginAndCost(user.role);
  const customer: CustomerSummaryOption = customers.find((c) => c.id === selectedCustomerId) ||
    customers[0] || {
      id: '',
      code: '',
      name: 'Select Customer',
      phone: '',
      gstin: '',
      site: siteName,
      window: deliveryWindow,
      creditLimit: 0,
      outstanding: 0,
      overdueDays: 0,
      creditHold: false,
      lastOrderDate: '',
    };

  // Duplicate order guard (§4.2)
  useEffect(() => {
    if (!UUID_RE.test(customer.id)) {
      setDuplicateWarning(null);
      return;
    }
    let active = true;
    fetch(`/api/proxy/orders?date=${encodeURIComponent(deliveryDate)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        if (!active || !Array.isArray(rows)) return;
        const match = rows.find(
          (o: any) => o.customer_id === customer.id && o.order_status !== 'CANCELLED',
        );
        if (match) {
          setDuplicateWarning(
            `Duplicate check: ${customer.name} already has order ${match.order_no} for ${deliveryDate}.`,
          );
        } else {
          setDuplicateWarning(null);
        }
      })
      .catch(() => {
        if (active) setDuplicateWarning(null);
      });
    return () => {
      active = false;
    };
  }, [customer.id, customer.name, deliveryDate]);

  // Totals calculation
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const gstTotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice * (l.gstPct / 100), 0);
  const grandTotal = subtotal + gstTotal;

  // Owner margin calculation
  const totalCost = lines.reduce((sum, l) => {
    const priceInfo = dailyPrices.find((p) => p.itemId === l.itemId);
    return sum + l.qty * (priceInfo?.landedCost || l.unitPrice * 0.85);
  }, 0);
  const marginPct = subtotal > 0 ? ((subtotal - totalCost) / subtotal) * 100 : 0;

  // Credit exposure (BR-02)
  const creditEval = evaluateCreditExposure(
    customer.creditLimit,
    customer.outstanding,
    grandTotal,
    customer.creditHold,
  );

  // Order Approval evaluation (BR-01 + BR-02)
  const approvalEval = evaluateOrderApprovalNeed(lines, creditEval);

  const handleAddLine = useCallback(() => {
    const sourceList = dailyPrices;
    if (sourceList.length === 0) return;
    const nextItem = sourceList[lines.length % sourceList.length];
    const newLine: SalesOrderLine = {
      id: `line-${Date.now()}`,
      itemId: nextItem.itemId,
      sku: nextItem.sku,
      itemName: nextItem.itemName,
      category: nextItem.category,
      qty: 50,
      uom: nextItem.uom,
      unitPrice: nextItem.targetPrice ?? (nextItem.yesterdayTarget || 0),
      floorPrice: nextItem.floorPrice ?? (nextItem.yesterdayFloor || 0),
      targetPrice: nextItem.targetPrice ?? (nextItem.yesterdayTarget || 0),
      atpStock: nextItem.atpStock,
      gstPct: 5,
      reservedQty: 0,
    };
    setLines((prev) => [...prev, newLine]);
    setFocusedItemId(nextItem.itemId);
  }, [dailyPrices, lines.length]);

  const handleUpdateLine = (id: string, patch: Partial<SalesOrderLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (patch.itemId && patch.itemId !== l.itemId) {
          const itemMeta = dailyPrices.find((p) => p.itemId === patch.itemId);
          if (itemMeta) {
            setFocusedItemId(itemMeta.itemId);
            return {
              ...l,
              itemId: itemMeta.itemId,
              sku: itemMeta.sku,
              itemName: itemMeta.itemName,
              category: itemMeta.category,
              uom: itemMeta.uom,
              unitPrice: itemMeta.targetPrice ?? (itemMeta.yesterdayTarget || 0),
              floorPrice: itemMeta.floorPrice ?? (itemMeta.yesterdayFloor || 0),
              targetPrice: itemMeta.targetPrice ?? (itemMeta.yesterdayTarget || 0),
              atpStock: itemMeta.atpStock,
            };
          }
        }
        return { ...l, ...patch };
      }),
    );
  };

  const handleRemoveLine = (id: string) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleSaveDraft = useCallback(() => {
    try {
      localStorage.setItem(
        'neobus_quick_order_draft',
        JSON.stringify({ selectedCustomerId, deliveryDate, lines }),
      );
    } catch {}
    setDraftSavedAt(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
  }, [selectedCustomerId, deliveryDate, lines]);

  const handleSubmitOrder = useCallback(async () => {
    setSubmitError(null);
    const fulfillmentSiteId =
      selectedSiteId || customer.defaultSiteId || user?.activeSiteId || sites[0]?.id || '';
    if (!UUID_RE.test(customer.id) || !UUID_RE.test(fulfillmentSiteId)) {
      setSubmitError('Live customer and site data from the backend are still loading. Please retry in a moment.');
      return;
    }
    if (lines.length === 0) {
      setSubmitError('Add at least one item line before submitting.');
      return;
    }
    if (lines.some((l) => !UUID_RE.test(l.itemId))) {
      setSubmitError('Live item prices from the backend are still loading. Please select a valid item.');
      return;
    }
    const unsetLine = lines.find((l) => {
      const meta = dailyPrices.find((p) => p.itemId === l.itemId);
      return meta?.priceSource === 'UNSET';
    });
    if (unsetLine) {
      setSubmitError(
        `Price band is not set for ${unsetLine.itemName || 'selected item'}. Please set and publish its price in Sales → Today's Prices before creating an order.`,
      );
      return;
    }
    if (lines.some((l) => !(Number(l.qty) > 0) || !(Number(l.unitPrice) > 0))) {
      setSubmitError('Each order line must have quantity and unit price greater than 0.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/proxy/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          fulfillmentSiteId,
          deliveryDate,
          deliveryTimeWindow: deliveryWindow,
          autoSubmit: true,
          lines: lines.map((l) => ({
            itemId: l.itemId,
            qty: Number(l.qty),
            requestedPrice: Number(l.unitPrice),
          })),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 502 || res.status === 503) {
          setSubmitError(
            `Server is temporarily unavailable (HTTP ${res.status}). It may be restarting or redeploying — please retry in a few seconds.`,
          );
          return;
        }
        const msg =
          payload?.error?.message ||
          (Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message) ||
          `Order submission failed (${res.status})`;
        setSubmitError(String(msg));
        return;
      }

      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('neobus_quick_order_draft');
        } catch {
          // ignore storage errors
        }
      }

      setSubmittedOrder({
        id: String(payload.orderId || payload.id),
        orderNumber: String(payload.orderNo || payload.orderNumber || ''),
        status: String(
          payload.status ||
            (approvalEval.primaryAction === 'SEND_FOR_APPROVAL' ? 'PENDING_APPROVAL' : 'CONFIRMED'),
        ),
      });
    } catch {
      setSubmitError('Unable to reach backend API to submit order.');
    } finally {
      setSubmitting(false);
    }
  }, [
    approvalEval.primaryAction,
    customer.defaultSiteId,
    customer.id,
    deliveryDate,
    deliveryWindow,
    lines,
    selectedSiteId,
    sites,
    user?.activeSiteId,
  ]);

  // Keyboard shortcuts (§4.2: Ctrl+Enter submit, Ctrl+S draft)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handleSubmitOrder();
      } else if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSaveDraft();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSubmitOrder, handleSaveDraft]);

  const focusedItemMeta =
    dailyPrices.find((p) => p.itemId === focusedItemId) || dailyPrices[0] || null;
  const hasUnsetPriceLine = lines.some(
    (l) => dailyPrices.find((p) => p.itemId === l.itemId)?.priceSource === 'UNSET',
  );

  // After submit success screen (§4.2)
  if (submittedOrder) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Card className="p-8 text-center space-y-5">
          <div className="text-5xl">
            {submittedOrder.status === 'PENDING_APPROVAL' ? '⏳' : '✅'}
          </div>
          <div>
            <span className="font-mono text-sm font-bold text-action">
              {submittedOrder.orderNumber}
            </span>
            <h1 className="text-2xl font-semibold text-ink mt-1">
              {submittedOrder.status === 'PENDING_APPROVAL'
                ? 'Waiting for Owner Approval'
                : 'Order Confirmed!'}
            </h1>
            <p className="text-xs text-ink-3 mt-1">
              {submittedOrder.status === 'PENDING_APPROVAL'
                ? 'Your order has been routed to the Owner Approvals Inbox. Status updates automatically every 30s.'
                : 'Stock reserved and order queued for dispatch planning.'}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              🖨️ Print order
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSubmittedOrder(null);
                setGuidedStep(1);
              }}
            >
              + New order
            </Button>
            <Link href="/sales/orders">
              <Button variant="secondary" size="sm">
                📋 All Orders
              </Button>
            </Link>
            <Link href={`/sales/orders/${submittedOrder.id}`}>
              <Button variant="primary" size="sm">
                Go to order →
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rule pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-ink">New Order</h1>
            {draftSavedAt && (
              <span className="text-[11px] text-leaf font-semibold bg-leaf-soft px-2 py-0.5 rounded-full border border-leaf/30">
                Draft saved ✓ ({draftSavedAt})
              </span>
            )}
          </div>
          <p className="text-xs text-ink-3 mt-0.5">
            Fast 60-second order entry with live price-band, credit limit, and stock checks.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-sheet p-1 rounded-[3px] border border-rule text-xs">
            <button
              onClick={() => setMode('GUIDED')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                mode === 'GUIDED' ? 'bg-action text-white' : 'text-ink-3 hover:text-ink'
              }`}
            >
              🧭 Guided (3-step)
            </button>
            <button
              onClick={() => setMode('EXPRESS')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                mode === 'EXPRESS' ? 'bg-action text-white' : 'text-ink-3 hover:text-ink'
              }`}
            >
              ⚡ Express (Keyboard)
            </button>
          </div>
        </div>
      </div>

      {/* Guided Stepper Header */}
      {mode === 'GUIDED' && (
        <div className="flex items-center gap-4 bg-sheet border border-rule rounded-[4px] p-3 text-xs">
          {[
            { num: 1 as const, label: '① Customer & Delivery' },
            { num: 2 as const, label: '② Items & Pricing' },
            { num: 3 as const, label: '③ Review & Confirm' },
          ].map((s) => (
            <button
              key={s.num}
              onClick={() => setGuidedStep(s.num)}
              className={`flex-1 py-2 px-3 rounded-[3px] font-bold transition-all text-center ${
                guidedStep === s.num
                  ? 'bg-action/20 text-action border border-action/30'
                  : guidedStep > s.num
                  ? 'bg-leaf-soft text-leaf'
                  : 'text-ink-3'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Duplicate Guard Warning */}
      {duplicateWarning && (
        <div className="p-3 rounded-[3px] bg-haldi-soft border border-haldi/30 text-xs text-haldi flex items-center justify-between">
          <span>⚠️ {duplicateWarning}</span>
        </div>
      )}

      {/* Step 1: Customer & Credit Meter */}
      {(mode === 'EXPRESS' || guidedStep === 1 || guidedStep === 3) && (
        <div className="bg-sheet border border-rule rounded-[4px] p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-ink-3 font-semibold mb-1">Customer *</label>
              <select
                value={selectedCustomerId}
                onChange={(e) => {
                  const next = customers.find((c) => c.id === e.target.value);
                  setSelectedCustomerId(e.target.value);
                  if (next) {
                    if (next.defaultSiteId) {
                      setSelectedSiteId(next.defaultSiteId);
                    }
                    setSiteName(next.site);
                    setDeliveryWindow(next.window);
                  }
                }}
                className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-ink font-semibold focus:outline-none focus:border-action/30"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-ink-3 font-semibold mb-1">Dispatch Site</label>
              <select
                value={selectedSiteId}
                onChange={(e) => {
                  const found = sites.find((s) => s.id === e.target.value);
                  setSelectedSiteId(e.target.value);
                  if (found) setSiteName(found.name);
                }}
                className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-ink focus:outline-none focus:border-action/30"
              >
                {sites.length > 0 ? (
                  sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                ) : (
                  <option value="">{siteName}</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-ink-3 font-semibold mb-1">Delivery Date</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-ink focus:outline-none focus:border-action/30"
              />
            </div>

            <div>
              <label className="block text-ink-3 font-semibold mb-1">Delivery Window</label>
              <select
                value={deliveryWindow}
                onChange={(e) => setDeliveryWindow(e.target.value as any)}
                className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-ink focus:outline-none focus:border-action/30"
              >
                <option value="04-08">04:00 AM – 08:00 AM</option>
                <option value="10-12">10:00 AM – 12:00 PM</option>
                <option value="13-16">01:00 PM – 04:00 PM</option>
                <option value="18-21">06:00 PM – 09:00 PM</option>
              </select>
            </div>
          </div>

          {/* Credit Meter (BR-02) */}
          <div className="pt-2 border-t border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 flex-1">
              <span className="text-ink-3 font-semibold">Credit:</span>
              <span className="font-mono font-bold text-ink">
                {formatINR(creditEval.projectedOutstanding)} of {formatINR(customer.creditLimit)}
              </span>
              <div className="flex-1 max-w-xs h-2 bg-sunken rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    creditEval.status === 'BREACH' || creditEval.status === 'HOLD'
                      ? 'bg-rose-500'
                      : creditEval.status === 'NEAR_LIMIT'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, creditEval.utilizationPct)}%` }}
                />
              </div>
              <span className="text-ink-3">
                Overdue: {customer.overdueDays > 0 ? `${customer.overdueDays}d` : 'none'}
              </span>
            </div>

            <StatusPill
              tone={
                creditEval.status === 'BREACH' || creditEval.status === 'HOLD'
                  ? 'danger'
                  : creditEval.status === 'NEAR_LIMIT'
                  ? 'warning'
                  : 'success'
              }
              label={
                creditEval.status === 'HOLD'
                  ? 'Credit Hold'
                  : creditEval.status === 'BREACH'
                  ? 'Over Credit Limit'
                  : creditEval.status === 'NEAR_LIMIT'
                  ? 'Near Limit'
                  : 'OK'
              }
            />
          </div>

          {mode === 'GUIDED' && guidedStep === 1 && (
            <div className="flex justify-end pt-2">
              <Button variant="primary" size="sm" onClick={() => setGuidedStep(2)}>
                Next: Add Items →
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Items Grid + Right Panel Price Memory */}
      {(mode === 'EXPRESS' || guidedStep === 2 || guidedStep === 3) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Line Items Table (Left 9 cols) */}
          <div className="lg:col-span-9 bg-sheet border border-rule rounded-[4px] p-4 space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-rule text-ink-3 uppercase font-semibold">
                  <tr>
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 px-2">Item</th>
                    <th className="py-2 px-2 w-20">Qty</th>
                    <th className="py-2 px-2 w-16">Unit</th>
                    <th className="py-2 px-2 w-24">Price (₹)</th>
                    <th className="py-2 px-2">Band (BR-01)</th>
                    <th className="py-2 px-2">Stock (BR-04)</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                    <th className="py-2 pl-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {lines.map((line, idx) => {
                    const band = evaluatePriceBand(line.unitPrice, line.floorPrice, line.targetPrice, line.floorPrice * 0.85);
                    const stock = evaluateStockAvailability(line.atpStock, line.qty, line.category);
                    const lineAmount = line.qty * line.unitPrice;

                    return (
                      <tr key={line.id} onFocus={() => setFocusedItemId(line.itemId)}>
                        <td className="py-2.5 pr-2 font-mono text-ink-3">{idx + 1}</td>
                        <td className="py-2.5 px-2">
                          <select
                            value={line.itemId}
                            onChange={(e) => handleUpdateLine(line.id, { itemId: e.target.value })}
                            className="w-full bg-paper border border-rule rounded-lg px-2 py-1.5 text-ink font-medium focus:outline-none focus:border-action/30"
                          >
                            {dailyPrices.map((p) => (
                              <option key={p.itemId} value={p.itemId}>
                                {p.itemName}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            min={1}
                            value={line.qty}
                            onChange={(e) =>
                              handleUpdateLine(line.id, { qty: parseFloat(e.target.value) || 0 })
                            }
                            className="w-20 bg-paper border border-rule rounded-lg px-2 py-1.5 font-mono text-ink focus:outline-none focus:border-action/30"
                          />
                        </td>
                        <td className="py-2.5 px-2 text-ink-3">{line.uom}</td>
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            step="0.5"
                            value={line.unitPrice}
                            onChange={(e) =>
                              handleUpdateLine(line.id, {
                                unitPrice: parseFloat(e.target.value) || 0,
                              })
                            }
                            className={`w-24 bg-paper border rounded-lg px-2 py-1.5 font-mono text-ink focus:outline-none ${
                              band.status === 'BELOW_FLOOR'
                                ? 'border-amber-500'
                                : 'border-rule focus:border-action/30'
                            }`}
                          />
                        </td>
                        <td className="py-2.5 px-2" title={band.chipLabel}>
                          <Badge tone={band.status === 'BELOW_FLOOR' ? 'warning' : 'success'}>
                            {band.status === 'BELOW_FLOOR' ? `▼ ${band.chipLabel}` : `● ${band.chipLabel}`}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`text-[11px] font-medium ${
                              stock.status === 'AVAILABLE' ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {stock.status === 'AVAILABLE' ? `${line.atpStock} avail` : stock.suggestion}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-ink">
                          {formatINR(lineAmount)}
                        </td>
                        <td className="py-2.5 pl-2">
                          {lines.length > 1 && (
                            <button
                              onClick={() => handleRemoveLine(line.id)}
                              className="text-ink-3 hover:text-madder"
                              title="Remove line"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={handleAddLine}>
                + Add item (Enter)
              </Button>
              <span className="text-[11px] text-ink-3">
                Shortcuts: Ctrl+Enter Submit · Ctrl+S Save Draft
              </span>
            </div>

            {hasUnsetPriceLine && (
              <div className="p-3 rounded-[3px] bg-haldi-soft border border-haldi/30 text-xs text-haldi flex items-center justify-between gap-2 flex-wrap">
                <span>
                  ⚠ One or more selected items do not have a published price band yet. Set floor &amp; target prices before creating orders.
                </span>
                <Link href="/sales/prices" className="font-semibold underline hover:opacity-80">
                  Set Today&apos;s Prices →
                </Link>
              </div>
            )}

            {mode === 'GUIDED' && guidedStep === 2 && (
              <div className="flex justify-between pt-3 border-t border-rule">
                <Button variant="ghost" size="sm" onClick={() => setGuidedStep(1)}>
                  ← Back to Customer
                </Button>
                <Button variant="primary" size="sm" onClick={() => setGuidedStep(3)}>
                  Review &amp; Confirm →
                </Button>
              </div>
            )}
          </div>

          {/* Right Panel: Price Memory (§4.2) */}
          <div className="lg:col-span-3 bg-sheet border border-rule rounded-[4px] p-4 space-y-4">
            <div>
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                Last Prices ({customer.code})
              </h3>
              <p className="text-[11px] text-ink-3 mt-0.5 truncate">
                {focusedItemMeta ? focusedItemMeta.itemName : 'Select an item to view price guidance.'}
              </p>
            </div>

            {focusedItemMeta ? (
              <>
                <div className="space-y-2">
                  {(focusedItemMeta.lastPricesForCustomer || []).map((lp, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs p-2 rounded-[3px] bg-paper border border-rule"
                    >
                      <span className="text-ink-3">{lp.date}</span>
                      <span className="font-mono font-bold text-ink">₹{lp.price}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-rule text-xs space-y-1">
                  <div className="text-ink-3">Today&apos;s Suggested Target:</div>
                  <div className="text-lg font-mono font-semibold text-action">
                    {focusedItemMeta.priceSource === 'UNSET'
                      ? 'Not set'
                      : `₹${focusedItemMeta.targetPrice ?? focusedItemMeta.yesterdayTarget} / ${focusedItemMeta.uom}`}
                  </div>
                  {isOwner && (
                    <div className="text-[11px] text-ink-3">
                      Today&apos;s Floor:{' '}
                      {focusedItemMeta.priceSource === 'UNSET'
                        ? 'Not set'
                        : `₹${focusedItemMeta.floorPrice ?? focusedItemMeta.yesterdayFloor}`}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-ink-3">Select an item to view price guidance.</p>
            )}
          </div>
        </div>
      )}

      {/* Footer Summary & Dynamic Primary Action */}
      {(mode === 'EXPRESS' || guidedStep === 3) && (
        <div className="bg-sheet border border-rule rounded-[4px] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <span className="text-xs text-ink-3 block">Subtotal</span>
                <span className="font-mono font-bold text-ink">{formatINR(subtotal)}</span>
              </div>
              <div>
                <span className="text-xs text-ink-3 block">GST</span>
                <span className="font-mono font-bold text-ink">{formatINR(gstTotal)}</span>
              </div>
              <div>
                <span className="text-xs text-ink-3 block">Grand Total</span>
                <span className="font-mono font-semibold text-action text-lg">
                  {formatINR(grandTotal)}
                </span>
              </div>
              {isOwner && (
                <div>
                  <span className="text-xs text-ink-3 block">Margin (Owner Only)</span>
                  <span
                    className={`font-mono font-bold ${
                      marginPct >= 12 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {marginPct.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <Button variant="ghost" size="sm" onClick={handleSaveDraft}>
                Save draft
              </Button>
              <Link href="/sales/quotes/new">
                <Button variant="secondary" size="sm">
                  Save as Quote
                </Button>
              </Link>
              <Button
                variant={approvalEval.primaryAction === 'CONFIRM' ? 'primary' : 'secondary'}
                size="md"
                disabled={submitting}
                className={
                  approvalEval.primaryAction === 'SEND_FOR_APPROVAL'
                    ? 'bg-haldi hover:opacity-90 text-white border-haldi/30'
                    : ''
                }
                onClick={handleSubmitOrder}
              >
                {submitting ? 'Submitting...' : approvalEval.buttonLabel}
              </Button>
            </div>
          </div>

          {submitError && (
            <div className="p-3 rounded-[3px] bg-madder-soft border border-madder/30 text-xs text-madder">
              ❌ {submitError}
            </div>
          )}

          {approvalEval.reasons.length > 0 && (
            <div className="p-3 rounded-[3px] bg-haldi-soft border border-haldi/30 text-xs text-haldi space-y-1">
              {approvalEval.reasons.map((r, i) => (
                <div key={i}>⚠ {r}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
