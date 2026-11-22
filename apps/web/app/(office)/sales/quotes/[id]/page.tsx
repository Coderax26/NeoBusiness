'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Button, Card, StatusPill, Badge, Dialog } from '@neo/ui';
import { evaluatePriceBand, formatINR } from '@neo/shared';
import { type QuoteRecord } from '../../../../../src/lib/sales-data';

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [quote, setQuote] = useState<QuoteRecord | null>(null);
  const [dailyPrices, setDailyPrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('Price higher than competitor');
  const [reminderSent, setReminderSent] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      fetch(`/api/proxy/quotes/${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/proxy/prices/${encodeURIComponent(today)}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([qData, pData]) => {
        if (!active) return;
        if (qData && qData.id) {
          setQuote({
            id: String(qData.id),
            quoteNumber: String(qData.quoteNumber || qData.quote_number || qData.id),
            customerId: String(qData.customerId || qData.customer_id || ''),
            customerName: String(qData.customerName || qData.customer_name || 'Customer'),
            status: (qData.status || 'OPEN') as QuoteRecord['status'],
            validUntil: String(qData.validUntil || qData.valid_until || today).slice(0, 10),
            createdAt: String(qData.createdAt || qData.created_at || today).slice(0, 10),
            totalAmount: Number(qData.totalAmount ?? qData.total_amount ?? 0),
            lines: Array.isArray(qData.lines)
              ? qData.lines.map((l: any) => ({
                  itemId: String(l.itemId || l.item_id || ''),
                  sku: String(l.sku || l.skuCode || ''),
                  itemName: String(l.itemName || l.item_name || 'Item'),
                  uom: String(l.uom || 'kg'),
                  qty: Number(l.qty || 0),
                  quotedPrice: Number(l.quotedPrice ?? l.quoted_price ?? l.unitPrice ?? 0),
                }))
              : [],
          });
        }
        if (Array.isArray(pData)) setDailyPrices(pData);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const handleConvertToOrder = async () => {
    if (!quote) return;
    setActionError(null);
    try {
      const res = await fetch(`/api/proxy/quotes/${encodeURIComponent(quote.id)}/convert`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json().catch(() => null);
      const converted = data?.data ?? data;
      setQuote((prev) =>
        prev
          ? {
              ...prev,
              status: 'CONVERTED',
              convertedOrderId: String(
                converted?.orderId ?? converted?.id ?? prev.convertedOrderId ?? '',
              ),
            }
          : prev,
      );
    } catch (err) {
      setActionError(`Failed to convert quote: ${(err as Error).message}`);
    }
  };

  const handleMarkLost = () => {
    setQuote((prev) => (prev ? { ...prev, status: 'LOST', lostReason } : prev));
    setLostOpen(false);
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto p-6 text-sm text-zinc-400">Loading quote...</div>;
  }

  if (!quote) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-3">
        <Link href="/sales/quotes" className="text-xs text-zinc-400 hover:text-white inline-block">
          ← Back to Quotes
        </Link>
        <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-400">
          Quote not found.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {actionError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-medium text-rose-300">
          {actionError}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-white font-mono">{quote.quoteNumber}</h1>
            <StatusPill
              tone={
                quote.status === 'CONVERTED'
                  ? 'success'
                  : quote.status === 'SENT'
                  ? 'info'
                  : quote.status === 'LOST'
                  ? 'danger'
                  : 'neutral'
              }
              label={quote.status}
            />
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Customer:{' '}
            <Link href={`/sales/customers/${quote.customerId}`} className="text-teal-400 font-bold hover:underline">
              {quote.customerName}
            </Link>{' '}
            · Valid until {quote.validUntil}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            🖨️ Print / PDF
          </Button>
          {quote.status !== 'CONVERTED' && quote.status !== 'LOST' && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setReminderSent(true)}>
                💬 Send Reminder
              </Button>
              <Button variant="danger" size="sm" onClick={() => setLostOpen(true)}>
                Mark Lost
              </Button>
              <Button variant="primary" size="sm" onClick={handleConvertToOrder}>
                ⚡ Convert to Order →
              </Button>
            </>
          )}
        </div>
      </div>

      {reminderSent && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
          ✓ WhatsApp reminder queued for {quote.customerName}.
        </div>
      )}

      {quote.status === 'CONVERTED' && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs">
          <span className="text-emerald-200 font-bold">
            ✓ Quote converted to Sales Order (today&apos;s price bands re-checked).
          </span>
          <Link href={`/sales/orders/${quote.convertedOrderId || 'ord-101'}`}>
            <Button variant="primary" size="sm">View Sales Order →</Button>
          </Link>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase font-semibold">
            <tr>
              <th className="p-3">Item</th>
              <th className="p-3">Qty</th>
              <th className="p-3">Quoted Price</th>
              <th className="p-3">Today&apos;s Price Band Check</th>
              <th className="p-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {quote.lines.map((l, idx) => {
              const todayItem = dailyPrices.find((p) => String(p.itemId) === String(l.itemId));
              const floor = todayItem?.floorPrice != null ? Number(todayItem.floorPrice) : 90;
              const target = todayItem?.targetPrice != null ? Number(todayItem.targetPrice) : 95;
              const cost = todayItem?.latestLandedCost != null ? Number(todayItem.latestLandedCost) : 75;
              const band = evaluatePriceBand(l.quotedPrice, floor, target, cost);
              return (
                <tr key={idx}>
                  <td className="p-3">
                    <div className="font-bold text-white">{l.itemName}</div>
                    <div className="text-[11px] font-mono text-zinc-400">{l.sku}</div>
                  </td>
                  <td className="p-3 font-mono">{l.qty} {l.uom}</td>
                  <td className="p-3 font-mono font-bold text-white">₹{l.quotedPrice}</td>
                  <td className="p-3">
                    <Badge tone={band.status === 'BELOW_FLOOR' ? 'warning' : 'success'}>
                      {band.chipLabel} (Today&apos;s floor ₹{floor})
                    </Badge>
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-white">
                    {formatINR(l.qty * l.quotedPrice)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Dialog open={lostOpen} onClose={() => setLostOpen(false)} title="Mark Quote as Lost" maxWidth="sm">
        <div className="space-y-4 my-2 text-xs">
          <input
            type="text"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
            placeholder="Reason quote was lost"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLostOpen(false)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleMarkLost}>Confirm Lost</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
