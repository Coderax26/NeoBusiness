'use client';

import React, { useState } from 'react';
import { formatINR, transitionOpeningBalanceBatch } from '@neo/shared';
import { INITIAL_OPENING_BATCH, type OpeningBalanceBatch } from '../../../../src/lib/finance-data';

export default function OpeningBalancesWizardPage() {
  const [batch, setBatch] = useState<OpeningBalanceBatch>(INITIAL_OPENING_BATCH);
  const [toast, setToast] = useState<string | null>(null);

  function runAction(action: 'SIGN_OFF' | 'IMPORT' | 'REVERSE') {
    const nextStatus = transitionOpeningBalanceBatch(batch.status, action, batch.cutoffDate);
    setBatch((prev) => ({ ...prev, status: nextStatus }));
    setToast(`Opening balance batch ${batch.batchNo} transitioned to ${nextStatus}.`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Opening Balances Wizard (OD-023)</h1>
          <p className="text-sm text-slate-500">
            CSV import lifecycle: DRAFT → Owner SIGNED_OFF (with cut-off date) → IMPORTED → REVERSED.
          </p>
        </div>
        <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-800">
          Status: {batch.status}
        </span>
      </div>

      {toast && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm font-medium text-purple-900">
          {toast}
        </div>
      )}

      {/* Lifecycle Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-mono font-bold text-slate-900">{batch.batchNo}</span>
          <label className="text-xs font-semibold text-slate-600">
            Cut-off Date:{' '}
            <input
              type="date"
              value={batch.cutoffDate}
              onChange={(e) => setBatch((prev) => ({ ...prev, cutoffDate: e.target.value }))}
              disabled={batch.status !== 'DRAFT'}
              className="rounded border border-slate-200 px-2 py-1"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {batch.status === 'DRAFT' && (
            <button
              type="button"
              onClick={() => runAction('SIGN_OFF')}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
            >
              Owner Sign-off
            </button>
          )}
          {batch.status === 'SIGNED_OFF' && (
            <button
              type="button"
              onClick={() => runAction('IMPORT')}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Import Atomic CSV
            </button>
          )}
          {batch.status === 'IMPORTED' && (
            <button
              type="button"
              onClick={() => runAction('REVERSE')}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
            >
              Reverse Batch
            </button>
          )}
        </div>
      </div>

      {/* Preview Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Party Type</th>
              <th className="px-4 py-3">Party Name</th>
              <th className="px-4 py-3 text-right">Opening Balance</th>
              <th className="px-4 py-3">Validation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batch.rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-xs font-semibold text-slate-600">{r.partyType}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{r.partyName}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold">{formatINR(r.openingBalance)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
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

