'use client';

import React, { useMemo, useState } from 'react';
import { BATCH_TRACE_SAMPLE, INITIAL_EXTENSIONS, type ErpExtensionItem } from '../../../src/lib/extensions-data';

export default function ErpExtensionsPage() {
  const [extensions, setExtensions] = useState<ErpExtensionItem[]>(INITIAL_EXTENSIONS);
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'H' | 'M' | 'L'>('ALL');
  const [barcodeInput, setBarcodeInput] = useState('BATCH-WO-2026-301');

  const filtered = useMemo(
    () => extensions.filter((e) => (priorityFilter === 'ALL' ? true : e.priority === priorityFilter)),
    [extensions, priorityFilter],
  );

  function toggleFlag(id: string) {
    setExtensions((prev) =>
      prev.map((e) => (e.id === id ? { ...e, enabledFlag: !e.enabledFlag } : e)),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Advanced ERP Extensions (Phase F13 / R4+)</h1>
          <p className="text-sm text-slate-500">
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
                priorityFilter === p ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              {p === 'ALL' ? 'All Priorities' : `Priority ${p}`}
            </button>
          ))}
        </div>
      </div>

      {/* Barcode & Batch Traceability Preview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-base font-bold text-slate-900">Barcode / QR Input Abstraction</h2>
          <p className="text-xs text-slate-500">Supports keyboard-wedge hardware scanners and mobile camera input.</p>
          <input
            type="text"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          />
          <div className="rounded-lg bg-emerald-50 p-3 text-xs font-mono text-emerald-900">
            Decoded Token: {barcodeInput} · Ready for Floor Mode &amp; Blind Count
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
          <h2 className="text-base font-bold text-slate-900">Batch Traceability Preview (Recall Readiness)</h2>
          <div className="text-xs text-slate-600">RM Lot: <strong>{BATCH_TRACE_SAMPLE.rmLot}</strong></div>
          <div className="text-xs text-slate-600">Production: <strong>{BATCH_TRACE_SAMPLE.productionBatch}</strong></div>
          <div className="text-xs text-slate-600">
            Deliveries: {BATCH_TRACE_SAMPLE.deliveries.join(' · ')}
          </div>
        </div>
      </div>

      {/* Extensions Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {filtered.map((ext) => (
          <div key={ext.id} className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{ext.domain}</span>
                <span className="rounded bg-amber-100 px-2 py-0.5 font-bold text-amber-800">Priority {ext.priority}</span>
              </div>
              <h3 className="mt-2 text-base font-bold text-slate-900">{ext.title}</h3>
              <p className="mt-1 text-xs text-slate-500">{ext.description}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleFlag(ext.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                ext.enabledFlag ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
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

