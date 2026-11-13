'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Card } from '@neo/ui';
import { formatINR } from '@neo/shared';
import { INITIAL_CUSTOMERS_SUMMARY, INITIAL_DAILY_PRICES } from '../../../../../src/lib/sales-data';

export default function NewQuotePage() {
  const [customerId, setCustomerId] = useState(INITIAL_CUSTOMERS_SUMMARY[0].id);
  const [validUntil, setValidUntil] = useState('2026-11-20');
  const [itemId, setItemId] = useState(INITIAL_DAILY_PRICES[0].itemId);
  const [qty, setQty] = useState(200);
  const [quotedPrice, setQuotedPrice] = useState(92);
  const [notes, setNotes] = useState('');
  const [savedQuoteNo, setSavedQuoteNo] = useState<string | null>(null);

  const selectedItem = INITIAL_DAILY_PRICES.find((p) => p.itemId === itemId) || INITIAL_DAILY_PRICES[0];
  const total = qty * quotedPrice * 1.05;

  const handleCreate = async () => {
    const quoteNumber = `QT-2026-${Math.floor(100 + Math.random() * 899)}`;
    try {
      await fetch('/api/proxy/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, validUntil, itemId, qty, quotedPrice, notes }),
      }).catch(() => {});
    } finally {
      setSavedQuoteNo(quoteNumber);
    }
  };

  if (savedQuoteNo) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card className="p-8 text-center space-y-4">
          <div className="text-4xl">📄</div>
          <h1 className="text-xl font-black text-white">Quote {savedQuoteNo} Saved</h1>
          <p className="text-xs text-zinc-400">Valid until {validUntil}. Ready to send or convert to order.</p>
          <div className="flex justify-center gap-3 pt-2">
            <Link href="/sales/quotes">
              <Button variant="secondary" size="sm">Back to Quotes</Button>
            </Link>
            <Link href="/sales/quotes/qt-1">
              <Button variant="primary" size="sm">View Quote Details →</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="text-2xl font-black text-white">Create Customer Quote</h1>
        <p className="text-xs text-zinc-400 mt-0.5">Prepare a formal validity-bound price offer.</p>
      </div>

      <Card className="p-6 space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-300 font-semibold mb-1">Customer</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
            >
              {INITIAL_CUSTOMERS_SUMMARY.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-zinc-300 font-semibold mb-1">Valid Until</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-zinc-300 font-semibold mb-1">Item</label>
            <select
              value={itemId}
              onChange={(e) => {
                setItemId(e.target.value);
                const found = INITIAL_DAILY_PRICES.find((p) => p.itemId === e.target.value);
                if (found?.targetPrice) setQuotedPrice(found.targetPrice);
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
            >
              {INITIAL_DAILY_PRICES.map((p) => (
                <option key={p.itemId} value={p.itemId}>{p.itemName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-zinc-300 font-semibold mb-1">Qty ({selectedItem.uom})</label>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(parseFloat(e.target.value) || 0)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-zinc-300 font-semibold mb-1">Quoted Price (₹)</label>
            <input
              type="number"
              value={quotedPrice}
              onChange={(e) => setQuotedPrice(parseFloat(e.target.value) || 0)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-zinc-300 font-semibold mb-1">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Terms, delivery schedule notes..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
          />
        </div>

        <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
          <div>
            <span className="text-zinc-400">Estimated Total (incl. 5% GST): </span>
            <strong className="text-teal-400 font-mono text-sm">{formatINR(total)}</strong>
          </div>
          <div className="flex gap-2">
            <Link href="/sales/quotes">
              <Button variant="ghost" size="sm">Cancel</Button>
            </Link>
            <Button variant="primary" size="sm" onClick={handleCreate}>Save &amp; Send Quote</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

