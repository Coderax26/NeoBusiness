'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { formatINR } from '@neo/shared';
import { type CreditNoteRecord } from '../../../../src/lib/finance-data';

export default function CreditNotesPage() {
  const [notes, setNotes] = useState<CreditNoteRecord[]>([]);
  const [orders, setOrders] = useState<Array<{ id: string; orderNo: string; customerName: string }>>([]);
  const [items, setItems] = useState<Array<{ id: string; name: string }>>([]);
  const [orderId, setOrderId] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [reasonType, setReasonType] = useState<'RETURN' | 'DAMAGE' | 'REBATE' | 'WRITEOFF'>('REBATE');
  const [reasonNotes, setReasonNotes] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCreditNotes = useCallback(async () => {
    const res = await fetch('/api/proxy/credit-notes').then((r) => (r.ok ? r.json() : []));
    const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    setNotes(
      rows.map((r: any) => ({
        id: String(r.id),
        cnNo: String(r.creditNoteNumber || r.credit_note_number || r.cn_no || r.cnNo || r.id),
        invoiceNo: String(r.invoiceNumber || r.invoice_no || r.order_no || r.invoiceNo || '—'),
        customerName: String(r.customerName || r.customer_name || 'Customer'),
        reason: String(r.reason || r.reason_type || ''),
        amount: Number(r.amount ?? r.total_amount ?? r.totalAmount ?? 0),
        status: (r.status || 'PENDING_APPROVAL') as CreditNoteRecord['status'],
        createdAt: String(r.createdAt || r.created_at || '').slice(0, 16),
      })),
    );
  }, []);

  useEffect(() => {
    loadCreditNotes().catch(() => {});
    Promise.all([
      fetch('/api/proxy/orders').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/items').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([ordRes, itmRes]) => {
        const oRows = Array.isArray(ordRes) ? ordRes : Array.isArray(ordRes?.data) ? ordRes.data : [];
        const iRows = Array.isArray(itmRes) ? itmRes : Array.isArray(itmRes?.data) ? itmRes.data : [];
        const mappedOrders = oRows.map((o: any) => ({
          id: String(o.id),
          orderNo: String(o.order_no ?? o.orderNo ?? o.id),
          customerName: String(o.customer_name ?? o.customerName ?? 'Customer'),
        }));
        const mappedItems = iRows.map((i: any) => ({
          id: String(i.id),
          name: String(i.name ?? i.sku_code ?? 'Item'),
        }));
        setOrders(mappedOrders);
        setItems(mappedItems);
        if (mappedOrders.length > 0) setOrderId(mappedOrders[0].id);
        if (mappedItems.length > 0) setItemId(mappedItems[0].id);
      })
      .catch(() => {});
  }, [loadCreditNotes]);

  async function createCreditNote(e: React.FormEvent) {
    e.preventDefault();
    const qtyNum = Number(qty) || 0;
    const priceNum = Number(unitPrice) || 0;
    if (!orderId || !itemId || qtyNum <= 0 || priceNum <= 0) {
      setToast('Select Order, Item, and enter positive Qty and Unit Price.');
      return;
    }
    try {
      setBusy(true);
      const res = await fetch('/api/proxy/credit-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          reason: reasonType,
          notes: reasonNotes.trim() || undefined,
          lines: [
            {
              itemId,
              qty: qtyNum.toFixed(3),
              unitPrice: priceNum.toFixed(2),
              reason: reasonNotes.trim() || reasonType,
            },
          ],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadCreditNotes();
      setUnitPrice('');
      setReasonNotes('');
      setToast('Credit note submitted for Owner approval.');
    } catch (err) {
      setToast(`Failed to create credit note: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleAction(id: string, action: 'approve' | 'reject') {
    try {
      setBusy(true);
      const res = await fetch(`/api/proxy/credit-notes/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'reject' ? JSON.stringify({ reason: 'Rejected by Finance/Owner' }) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadCreditNotes();
      setToast(
        action === 'approve'
          ? 'Credit note approved and credited to customer ledger.'
          : 'Credit note rejected.',
      );
    } catch (err) {
      setToast(`Failed to ${action} credit note: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Credit Notes</h1>
        <p className="text-sm text-ink-3">
          Request credit notes against orders; Owner approval credits the customer ledger directly.
        </p>
      </div>

      {toast && (
        <div className="rounded-[3px] border border-leaf/30 bg-leaf-soft px-4 py-2.5 text-sm font-medium text-leaf">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={createCreditNote} className="rounded-[3px] border border-rule bg-sheet p-5 space-y-3">
          <h2 className="text-base font-bold text-ink">Request Credit Note</h2>
          <select
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink"
          >
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.orderNo} — {o.customerName}
              </option>
            ))}
          </select>
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink"
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <select
            value={reasonType}
            onChange={(e) => setReasonType(e.target.value as any)}
            className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink"
          >
            <option value="REBATE">REBATE (Price Diff)</option>
            <option value="DAMAGE">DAMAGE</option>
            <option value="RETURN">RETURN</option>
            <option value="WRITEOFF">WRITEOFF</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Qty"
              className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm font-mono text-ink"
              required
            />
            <input
              type="number"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="Unit Price (₹)"
              className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm font-mono text-ink"
              required
            />
          </div>
          <input
            type="text"
            value={reasonNotes}
            onChange={(e) => setReasonNotes(e.target.value)}
            placeholder="Reason notes"
            className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-3"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-[3px] bg-leaf py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Submit for Owner Approval
          </button>
        </form>

        <div className="overflow-hidden rounded-[3px] border border-rule bg-sheet lg:col-span-2">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-ink-3">
              <tr>
                <th className="px-4 py-3">CN # / Ref</th>
                <th className="px-4 py-3">Customer &amp; Reason</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {notes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-ink-3">
                    No credit notes found.
                  </td>
                </tr>
              ) : (
                notes.map((n) => (
                  <tr key={n.id} className="hover:bg-sunken">
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-ink">{n.cnNo}</div>
                      <div className="font-mono text-xs text-ink-3">{n.invoiceNo}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink">{n.customerName}</div>
                      <div className="text-xs text-ink-3">{n.reason}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-ink">{formatINR(n.amount)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          (n.status as string) === 'APPROVED' || (n.status as string) === 'APPLIED'
                            ? 'bg-leaf-soft text-leaf'
                            : (n.status as string) === 'REJECTED'
                              ? 'bg-madder-soft text-madder'
                              : 'bg-haldi-soft text-haldi'
                        }`}
                      >
                        {n.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1.5">
                      {(n.status === 'PENDING_APPROVAL' || (n.status as string) === 'DRAFT') && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleAction(n.id, 'approve')}
                            className="rounded border border-action/30 bg-action-soft px-2.5 py-1 text-xs font-semibold text-action"
                          >
                            Approve &amp; Post
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleAction(n.id, 'reject')}
                            className="rounded border border-madder/30 bg-madder-soft px-2.5 py-1 text-xs font-semibold text-madder"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
