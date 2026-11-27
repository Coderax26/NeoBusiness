'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { type ErpExtensionItem } from '../../../src/lib/extensions-data';

export default function ErpExtensionsPage() {
  const [extensions, setExtensions] = useState<ErpExtensionItem[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'H' | 'M' | 'L'>('ALL');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [latestBatch, setLatestBatch] = useState<{ batchNo: string; itemName: string; siteName: string } | null>(null);

  useEffect(() => {
    fetch('/api/proxy/admin/feature-flags')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.flags) ? res.flags : Array.isArray(res?.data) ? res.data : [];
        setExtensions(
          list.map((f: any) => ({
            id: f.key,
            domain: 'Configuration',
            priority: 'H' as const,
            title: f.key,
            description: f.description ?? 'Feature flag',
            enabledFlag: Boolean(f.enabled),
          })),
        );
      })
      .catch(() => setExtensions([]));

    fetch('/api/proxy/inventory/stock/current?limit=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        if (list[0]) {
          setLatestBatch({
            batchNo: list[0].batch_number ?? '-',
            itemName: list[0].item_name ?? 'Item',
            siteName: list[0].site_name ?? 'Site',
          });
          setBarcodeInput(list[0].batch_number ?? '');
        }
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(
    () => extensions.filter((e) => (priorityFilter === 'ALL' ? true : e.priority === priorityFilter)),
    [extensions, priorityFilter],
  );

  async function toggleFlag(id: string) {
    const target = extensions.find((e) => e.id === id);
    const nextEnabled = !(target?.enabledFlag ?? false);
    setExtensions((prev) =>
      prev.map((e) => (e.id === id ? { ...e, enabledFlag: nextEnabled } : e)),
    );
    await fetch(`/api/proxy/admin/feature-flags/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: nextEnabled }),
    }).catch(() => {});
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Advanced ERP Extensions (Phase F13 / R4+)</h1>
          <p className="text-sm text-ink-3">
            Feature-flagged R4+ modules for CRM, Supply Chain, Quality Traceability, Bank Reconciliation, HR &amp; AI.
          </p>
        </div>
        <div className="flex gap-1.5">
          {(['ALL', 'H', 'M', 'L'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriorityFilter(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                priorityFilter === p ? 'bg-zinc-100 text-zinc-950' : 'border border-rule-strong bg-sheet text-ink-2'
              }`}
            >
              {p === 'ALL' ? 'All Priorities' : `Priority ${p}`}
            </button>
          ))}
        </div>
      </div>

      {/* Barcode & Batch Traceability Preview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-[3px] border border-rule bg-sheet p-5 space-y-3">
          <h2 className="text-base font-bold text-ink">Barcode / QR Input Abstraction</h2>
          <p className="text-xs text-ink-3">Supports keyboard-wedge hardware scanners and mobile camera input.</p>
          <input
            type="text"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            placeholder="Scan barcode or batch number..."
            className="w-full rounded-lg border border-rule-strong bg-paper px-3 py-2 font-mono text-sm text-ink"
          />
          <div className="rounded-lg border border-leaf/30 bg-leaf-soft p-3 text-xs font-mono text-leaf">
            Decoded Token: {barcodeInput || 'Waiting for scan'} · Ready for Floor Mode &amp; Blind Count
          </div>
        </div>

        <div className="rounded-[3px] border border-rule bg-sheet p-5 space-y-2">
          <h2 className="text-base font-bold text-ink">Batch Traceability Preview (Recall Readiness)</h2>
          {latestBatch ? (
            <>
              <div className="text-xs text-ink-2">Latest Batch: <strong className="font-mono text-haldi">{latestBatch.batchNo}</strong></div>
              <div className="text-xs text-ink-2">Item: <strong>{latestBatch.itemName}</strong></div>
              <div className="text-xs text-ink-2">Site: <strong>{latestBatch.siteName}</strong></div>
            </>
          ) : (
            <div className="text-xs text-ink-3">No active inventory batches found.</div>
          )}
        </div>
      </div>

      {/* Extensions Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {filtered.length === 0 && (
          <div className="rounded-[3px] border border-rule bg-sheet p-6 text-sm text-ink-3">
            No feature flags configured.
          </div>
        )}
        {filtered.map((ext) => (
          <div key={ext.id} className="flex items-start justify-between gap-4 rounded-[3px] border border-rule bg-sheet p-5">
            <div>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded bg-sunken px-2 py-0.5 font-semibold text-ink-2">{ext.domain}</span>
                <span className="rounded bg-haldi-soft px-2 py-0.5 font-bold text-haldi">Priority {ext.priority}</span>
              </div>
              <h3 className="mt-2 text-base font-bold text-ink">{ext.title}</h3>
              <p className="mt-1 text-xs text-ink-3">{ext.description}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleFlag(ext.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                ext.enabledFlag ? 'bg-leaf text-white' : 'bg-sunken text-ink-2'
              }`}
            >
              {ext.enabledFlag ? 'Flag ON' : 'Flag OFF'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

