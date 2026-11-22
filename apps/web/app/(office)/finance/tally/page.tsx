'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { generateTallyXmlBatch, type TallyVoucherInput } from '@neo/shared';

const ALL_TYPES: Array<TallyVoucherInput['voucherType']> = ['Sales', 'Receipt', 'Credit Note', 'Payment'];

export default function TallyExportPage() {
  const [fromDate, setFromDate] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedTypes, setSelectedTypes] = useState<Array<TallyVoucherInput['voucherType']>>(['Sales', 'Receipt', 'Credit Note']);
  const [vouchers, setVouchers] = useState<TallyVoucherInput[]>([]);
  const [batches, setBatches] = useState<Array<{ id: string; range: string; count: number; xml: string }>>([]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      fetch('/api/proxy/tally/batches').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/invoices').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/collections/receipts').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([batchRes, invRes, rcpRes]) => {
        if (!active) return;
        if (batchRes.status === 'fulfilled') {
          const bRows = Array.isArray(batchRes.value) ? batchRes.value : Array.isArray(batchRes.value?.data) ? batchRes.value.data : [];
          setBatches(
            bRows.map((b: any) => ({
              id: String(b.id || b.batch_no || 'TLY'),
              range: `${String(b.from_date || '').slice(0, 10)} → ${String(b.to_date || '').slice(0, 10)}`,
              count: Number(b.voucher_count ?? 0),
              xml: String(b.xml_payload || ''),
            })),
          );
        }
        const built: TallyVoucherInput[] = [];
        if (invRes.status === 'fulfilled') {
          const iRows = Array.isArray(invRes.value) ? invRes.value : Array.isArray(invRes.value?.data) ? invRes.value.data : [];
          for (const inv of iRows) {
            built.push({
              voucherNo: String(inv.invoiceNo || inv.invoice_no || inv.id),
              voucherType: 'Sales',
              date: String(inv.invoiceDate || inv.invoice_date || '').slice(0, 10),
              partyName: String(inv.customerName || inv.customer_name || 'Customer'),
              amount: Number(inv.totalAmount ?? inv.total_amount ?? 0),
              narration: `Sales ${inv.invoiceNo || inv.invoice_no || inv.id}`,
            });
          }
        }
        if (rcpRes.status === 'fulfilled') {
          const rRows = Array.isArray(rcpRes.value) ? rcpRes.value : Array.isArray(rcpRes.value?.data) ? rcpRes.value.data : [];
          for (const rcp of rRows) {
            built.push({
              voucherNo: String(rcp.receiptNo || rcp.receipt_no || rcp.id),
              voucherType: 'Receipt',
              date: String(rcp.date || rcp.payment_date || '').slice(0, 10),
              partyName: String(rcp.customerName || rcp.customer_name || 'Customer'),
              amount: Number(rcp.amount ?? 0),
              narration: `Receipt ${rcp.receiptNo || rcp.receipt_no || rcp.id}`,
            });
          }
        }
        setVouchers(built);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const preview = useMemo(
    () =>
      generateTallyXmlBatch({
        fromDate,
        toDate,
        voucherTypes: selectedTypes,
        vouchers,
      }),
    [fromDate, toDate, selectedTypes, vouchers],
  );

  function toggleType(t: TallyVoucherInput['voucherType']) {
    setSelectedTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function createExportBatch() {
    await fetch('/api/proxy/tally/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromDate, toDate, voucherTypes: selectedTypes }),
    }).catch(() => {});
    const batch = {
      id: `TLY-2026-0${batches.length + 1}`,
      range: `${fromDate} → ${toDate}`,
      count: preview.includedCount,
      xml: preview.xml,
    };
    setBatches((prev) => [batch, ...prev]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Tally Prime XML Export (OD-018)</h1>
        <p className="text-sm text-zinc-400">
          Select date range and voucher types to generate Tally-compatible XML batches for your accountant.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  selectedTypes.includes(t)
                    ? 'bg-emerald-600 text-white'
                    : 'border border-zinc-800 bg-zinc-950 text-zinc-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={createExportBatch}
            className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Generate XML Batch ({preview.includedCount})
          </button>
        </div>

        <pre className="max-h-64 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-emerald-400">
          {preview.xml}
        </pre>
      </div>

      {batches.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-2">
          <h2 className="text-sm font-bold text-zinc-100">Generated Export Batches</h2>
          {batches.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs">
              <span className="font-mono font-bold text-zinc-100">{b.id}</span>
              <span className="text-zinc-400">{b.range}</span>
              <span className="font-mono text-emerald-400">{b.count} vouchers</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
