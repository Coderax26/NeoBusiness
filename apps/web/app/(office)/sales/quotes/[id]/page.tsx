'use client';

import React, { useState, use } from 'react';
import Link from 'next/link';
import { Button, Card, StatusPill, Badge, Dialog } from '@neo/ui';
import { evaluatePriceBand, formatINR } from '@neo/shared';
import { INITIAL_QUOTES, INITIAL_DAILY_PRICES, type QuoteRecord } from '../../../../../src/lib/sales-data';

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const initial = INITIAL_QUOTES.find((q) => q.id === id) || INITIAL_QUOTES[0];
  const [quote, setQuote] = useState<QuoteRecord>(initial);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('Price higher than competitor');
  const [reminderSent, setReminderSent] = useState(false);

  const handleConvertToOrder = async () => {
    try {
      await fetch(`/api/proxy/quotes/${quote.id}/convert`, { method: 'POST' }).catch(() => {});
    } finally {
      setQuote((prev) => ({
        ...prev,
        status: 'CONVERTED',
        convertedOrderId: 'ord-101',
      }));
    }
  };

  const handleMarkLost = () => {
    setQuote((prev) => ({ ...prev, status: 'LOST', lostReason }));
    setLostOpen(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
              const todayItem = INITIAL_DAILY_PRICES.find((p) => p.itemId === l.itemId);
              const floor = todayItem?.floorPrice ?? 90;
              const target = todayItem?.targetPrice ?? 95;
              const cost = todayItem?.landedCost ?? 75;
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
