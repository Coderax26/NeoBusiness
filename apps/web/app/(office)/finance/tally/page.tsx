'use client';

import React, { useMemo, useState } from 'react';
import { generateTallyXmlBatch, type TallyVoucherInput } from '@neo/shared';
import { INITIAL_TALLY_VOUCHERS } from '../../../../src/lib/finance-data';

const ALL_TYPES: Array<TallyVoucherInput['voucherType']> = ['Sales', 'Receipt', 'Credit Note', 'Payment'];

export default function TallyExportPage() {
  const [fromDate, setFromDate] = useState('2026-11-01');
  const [toDate, setToDate] = useState('2026-11-13');
  const [selectedTypes, setSelectedTypes] = useState<Array<TallyVoucherInput['voucherType']>>(['Sales', 'Receipt', 'Credit Note']);
  const [batches, setBatches] = useState<Array<{ id: string; range: string; count: number; xml: string }>>([]);

  const preview = useMemo(
    () =>
      generateTallyXmlBatch({
        fromDate,
        toDate,
        voucherTypes: selectedTypes,
        vouchers: INITIAL_TALLY_VOUCHERS,
      }),
    [fromDate, toDate, selectedTypes],
  );

  function toggleType(t: TallyVoucherInput['voucherType']) {
    setSelectedTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function createExportBatch() {
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
        <h1 className="text-2xl font-bold text-slate-900">Tally Prime XML Export (OD-018)</h1>
        <p className="text-sm text-slate-500">
          Select date range and voucher types to generate Tally-compatible XML batches for your accountant.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {ALL_TYPES.map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(t)}
                  onChange={() => toggleType(t)}
                />
                {t}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={createExportBatch}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Export XML Batch ({preview.includedCount} vouchers)
          </button>
        </div>

        <pre className="max-h-56 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-emerald-300">
          {preview.xml}
        </pre>
      </div>

      {batches.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
          <h2 className="text-sm font-bold text-slate-900">Exported Batches</h2>
          {batches.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5 text-sm">
              <div>
                <span className="font-mono font-bold text-slate-900">{b.id}</span> · {b.range} ({b.count} vouchers)
              </div>
              <a
                href={`data:text/xml;charset=utf-8,${encodeURIComponent(b.xml)}`}
                download={`${b.id}.xml`}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
              >
                Download XML
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

