'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card } from '@neo/ui';
import { formatINR } from '@neo/shared';

interface CustomerOption {
  id: string;
  name: string;
}

interface ItemPriceOption {
  itemId: string;
  itemName: string;
  uom: string;
  targetPrice: number;
}

export default function NewQuotePage() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [items, setItems] = useState<ItemPriceOption[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [validUntil, setValidUntil] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(200);
  const [quotedPrice, setQuotedPrice] = useState(0);
  const [notes, setNotes] = useState('');
  const [siteId, setSiteId] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedQuote, setSavedQuote] = useState<{ id: string; quoteNumber: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        const stored =
          typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') : null;
        const resolved =
          (stored && stored !== 'all' ? stored : null) ||
          me?.user?.activeSiteId ||
          me?.user?.sites?.[0]?.id ||
          '';
        if (resolved) setSiteId(String(resolved));
      })
      .catch(() => {});

    fetch('/api/proxy/customers')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const mapped = list.map((c: any) => ({ id: c.id, name: c.business_name ?? c.name ?? 'Customer' }));
        setCustomers(mapped);
        if (mapped.length > 0) setCustomerId(mapped[0].id);
      })
      .catch(() => setCustomers([]));

    fetch(`/api/proxy/prices/${new Date().toISOString().split('T')[0]}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const mapped: ItemPriceOption[] = list.map((p: any) => ({
          itemId: p.item_id ?? p.itemId ?? p.id,
          itemName: p.item_name ?? p.name ?? 'Item',
          uom: p.primary_uom ?? p.uom ?? 'KG',
          targetPrice: Number(p.target_price ?? p.targetPrice ?? 0),
        }));
        setItems(mapped);
        if (mapped.length > 0) {
          setItemId(mapped[0].itemId);
          setQuotedPrice(mapped[0].targetPrice);
        }
      })
      .catch(() => setItems([]));
  }, []);

  const selectedItem = items.find((p) => p.itemId === itemId) || items[0];
  const total = qty * quotedPrice * 1.05;

  const handleCreate = async () => {
    if (!customerId || !itemId) return;
    setErrorMsg(null);
    if (!siteId) {
      setErrorMsg('Active site is required to create a quote.');
      return;
    }
    try {
      const res = await fetch('/api/proxy/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          siteId,
          validUntil,
          lines: [
            {
              itemId,
              qty: String(qty),
              requestedPrice: String(quotedPrice),
            },
          ],
          notes,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      const created = await res.json();
      const d = created?.data ?? created;
      setSavedQuote({
        id: d?.id ?? '',
        quoteNumber: d?.quote_no ?? d?.quoteNumber ?? 'QT-NEW',
      });
    } catch (err) {
      setErrorMsg(`Failed to create quote: ${(err as Error).message}`);
    }
  };

  if (savedQuote) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card className="p-8 text-center space-y-4">
          <div className="text-4xl">📄</div>
          <h1 className="text-xl font-black text-white">Quote {savedQuote.quoteNumber} Saved</h1>
          <p className="text-xs text-zinc-400">Valid until {validUntil}. Ready to send or convert to order.</p>
          <div className="flex justify-center gap-3 pt-2">
            <Link href="/sales/quotes">
              <Button variant="secondary" size="sm">Back to Quotes</Button>
            </Link>
            {savedQuote.id && (
              <Link href={`/sales/quotes/${savedQuote.id}`}>
                <Button variant="primary" size="sm">View Quote Details →</Button>
              </Link>
            )}
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
        {errorMsg && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-300 font-semibold mb-1">Customer</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
            >
              {customers.length === 0 && <option value="">No customers loaded</option>}
              {customers.map((c) => (
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
                const found = items.find((p) => p.itemId === e.target.value);
                if (found?.targetPrice) setQuotedPrice(found.targetPrice);
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
            >
              {items.length === 0 && <option value="">No priced items loaded</option>}
              {items.map((p) => (
                <option key={p.itemId} value={p.itemId}>{p.itemName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-zinc-300 font-semibold mb-1">Qty ({selectedItem?.uom ?? 'KG'})</label>
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

