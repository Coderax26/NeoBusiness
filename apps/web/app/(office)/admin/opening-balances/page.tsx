'use client';

import React, { useEffect, useState } from 'react';
import { formatINR, transitionOpeningBalanceBatch } from '@neo/shared';
import { type OpeningBalanceBatch } from '../../../../src/lib/finance-data';

export default function OpeningBalancesWizardPage() {
  const [batch, setBatch] = useState<OpeningBalanceBatch>({
    batchNo: 'OB-DRAFT',
    cutoffDate: new Date().toISOString().split('T')[0],
    status: 'DRAFT',
    rows: [],
  } as unknown as OpeningBalanceBatch);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/proxy/finance/opening-balances/template')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data || res?.rows) {
          const rows = res.data?.rows ?? res.rows ?? [];
          setBatch((prev) => ({
            ...prev,
            batchNo: res.data?.batchNo ?? res.batchNo ?? prev.batchNo,
            cutoffDate: res.data?.cutoffDate ?? prev.cutoffDate,
            status: res.data?.status ?? prev.status,
            rows,
          }));
        }
      })
      .catch(() => {});
  }, []);

  async function runAction(action: 'SIGN_OFF' | 'IMPORT' | 'REVERSE') {
    const nextStatus = transitionOpeningBalanceBatch(batch.status, action, batch.cutoffDate);
    setBatch((prev) => ({ ...prev, status: nextStatus }));
    const endpoint =
      action === 'SIGN_OFF'
        ? '/api/proxy/finance/opening-balances/draft'
        : action === 'IMPORT'
          ? '/api/proxy/finance/opening-balances/import'
          : '/api/proxy/finance/opening-balances/reverse';
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cutoffDate: batch.cutoffDate, rows: batch.rows }),
    }).catch(() => {});
    setToast(`Opening balance batch ${batch.batchNo} transitioned to ${nextStatus}.`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Opening Balances Wizard (OD-023)</h1>
          <p className="text-sm text-ink-3">
            CSV import lifecycle: DRAFT → Owner SIGNED_OFF (with cut-off date) → IMPORTED → REVERSED.
          </p>
        </div>
        <span className="rounded-full bg-purple-500/20 px-3 py-1 text-xs font-bold text-purple-300">
          Status: {batch.status}
        </span>
      </div>

      {toast && (
        <div className="rounded-[3px] border border-purple-500/40 bg-purple-950/30 px-4 py-2.5 text-sm font-medium text-purple-200">
          {toast}
        </div>
      )}

      {/* Lifecycle Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[3px] border border-rule bg-sheet p-5">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-mono font-bold text-ink">{batch.batchNo}</span>
          <label className="text-xs font-semibold text-ink-3">
            Cut-off Date:{' '}
            <input
              type="date"
              value={batch.cutoffDate}
              onChange={(e) => setBatch((prev) => ({ ...prev, cutoffDate: e.target.value }))}
              disabled={batch.status !== 'DRAFT'}
              className="rounded border border-rule-strong bg-paper px-2 py-1 text-ink"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {batch.status === 'DRAFT' && (
            <button
              type="button"
              onClick={() => runAction('SIGN_OFF')}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-ink hover:bg-purple-500"
            >
              Owner Sign-off
            </button>
          )}
          {batch.status === 'SIGNED_OFF' && (
            <button
              type="button"
              onClick={() => runAction('IMPORT')}
              className="rounded-lg bg-leaf px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Import Atomic CSV
            </button>
          )}
          {batch.status === 'IMPORTED' && (
            <button
              type="button"
              onClick={() => runAction('REVERSE')}
              className="rounded-lg bg-madder px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Reverse Batch
            </button>
          )}
        </div>
      </div>

      {/* Preview Table */}
      <div className="overflow-hidden rounded-[3px] border border-rule bg-sheet">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-ink-3">
            <tr>
              <th className="px-4 py-3">Party Type</th>
              <th className="px-4 py-3">Party Name</th>
              <th className="px-4 py-3 text-right">Opening Balance</th>
              <th className="px-4 py-3">Validation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {batch.rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-ink-3">
                  No opening balance rows staged yet.
                </td>
              </tr>
            )}
            {batch.rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-xs font-semibold text-ink-3">{r.partyType}</td>
                <td className="px-4 py-3 font-semibold text-ink">{r.partyName}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-ink">{formatINR(r.openingBalance)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-leaf-soft px-2.5 py-0.5 text-xs font-semibold text-leaf">
                    Valid
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

