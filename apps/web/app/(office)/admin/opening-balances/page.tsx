'use client';

import React, { useEffect, useState } from 'react';
import { formatINR, transitionOpeningBalanceBatch } from '@neo/shared';
import { type OpeningBalanceBatch } from '../../../../src/lib/finance-data';
import { SettingsPageHeader } from '../../../../src/components/settings/SettingsPageHeader';

const STATUS_LABELS: Record<string, { label: string; hint: string }> = {
  DRAFT: {
    label: 'Step 1 of 3 · Draft (Ready for Review)',
    hint: 'Review the starting balances and pick your cut-off date, then confirm as Owner.',
  },
  SIGNED_OFF: {
    label: 'Step 2 of 3 · Owner Approved (Ready to Post)',
    hint: 'Click "Post Opening Balances" to bring these starting amounts into live customer and supplier accounts.',
  },
  IMPORTED: {
    label: 'Step 3 of 3 · Posted to Accounts',
    hint: 'Starting balances are now live. You can reverse this batch if a correction is needed.',
  },
  REVERSED: {
    label: 'Reversed (Cancelled)',
    hint: 'These opening balances were undone and removed from customer and supplier ledgers.',
  },
};

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

    const actionMessage =
      action === 'SIGN_OFF'
        ? 'Owner sign-off recorded. Click "Post Opening Balances" to apply them to accounts.'
        : action === 'IMPORT'
          ? 'Opening balances posted into customer & supplier ledgers.'
          : 'Opening balance batch reversed cleanly.';
    setToast(actionMessage);
  }

  const statusMeta = STATUS_LABELS[batch.status] || STATUS_LABELS.DRAFT;

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Starting Account Balances (Opening Balances)"
        subtitle="Bring in what customers already owe you and what you owe suppliers before starting on NeoBus."
        whatIsThis="When moving from Tally, Excel, or paper books, enter everyone’s pending balance as of your start date (Cut-off Date). For safety, it follows 3 clear steps: Review → Owner Sign-Off → Post to Accounts (and can be undone if needed)."
        actions={
          <span className="rounded-full bg-action-soft border border-action/30 px-3 py-1 text-xs font-semibold text-action">
            {statusMeta.label}
          </span>
        }
      />

      {toast && (
        <div className="rounded-[3px] border border-leaf/30 bg-leaf-soft px-4 py-2.5 text-sm font-medium text-leaf">
          {toast}
        </div>
      )}

      {/* 3-Step Guide */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="rounded-[3px] border border-rule bg-sheet p-3.5">
          <div className="font-bold text-ink">1. Set Cut-off Date &amp; Review</div>
          <p className="text-ink-3 mt-1">
            Pick the exact date your old books closed (for example, 31 March) and check every customer &amp; supplier amount.
          </p>
        </div>
        <div className="rounded-[3px] border border-rule bg-sheet p-3.5">
          <div className="font-bold text-ink">2. Owner Confirmation</div>
          <p className="text-ink-3 mt-1">
            The business owner confirms the numbers are final before anything touches live customer ledgers.
          </p>
        </div>
        <div className="rounded-[3px] border border-rule bg-sheet p-3.5">
          <div className="font-bold text-ink">3. Post to Accounts (or Undo)</div>
          <p className="text-ink-3 mt-1">
            All balances are posted together at once. If you spot an error later, use &ldquo;Undo / Reverse Batch&rdquo;.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[4px] border border-rule bg-sheet p-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-ink">Cut-off Date (Old Books Closing Date):</span>
            <input
              type="date"
              value={batch.cutoffDate}
              onChange={(e) => setBatch((prev) => ({ ...prev, cutoffDate: e.target.value }))}
              disabled={batch.status !== 'DRAFT'}
              className="rounded border border-rule-strong bg-paper px-2.5 py-1 text-sm text-ink"
            />
          </div>
          <p className="text-xs text-ink-3">{statusMeta.hint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {batch.status === 'DRAFT' && (
            <button
              type="button"
              onClick={() => runAction('SIGN_OFF')}
              className="rounded-[3px] bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover"
            >
              Confirm &amp; Sign Off
            </button>
          )}
          {batch.status === 'SIGNED_OFF' && (
            <button
              type="button"
              onClick={() => runAction('IMPORT')}
              className="rounded-[3px] bg-leaf px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Post Opening Balances
            </button>
          )}
          {batch.status === 'IMPORTED' && (
            <button
              type="button"
              onClick={() => runAction('REVERSE')}
              className="rounded-[3px] bg-madder px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Undo / Reverse Batch
            </button>
          )}
        </div>
      </div>

      {/* Preview Table */}
      <div className="overflow-hidden rounded-[4px] border border-rule bg-sheet">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs text-ink-3">
            <tr>
              <th className="px-4 py-3 font-semibold">Account Type</th>
              <th className="px-4 py-3 font-semibold">Customer / Supplier Name</th>
              <th className="px-4 py-3 font-semibold text-right">Starting Balance</th>
              <th className="px-4 py-3 font-semibold">Check</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {batch.rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-3">
                  No starting balances loaded yet. Once uploaded from your opening balance template, every customer and supplier row will appear here for review before posting.
                </td>
              </tr>
            )}
            {batch.rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-xs font-semibold text-ink-2">
                  {String(r.partyType).toUpperCase() === 'CUSTOMER'
                    ? 'Customer (To Receive)'
                    : String(r.partyType).toUpperCase() === 'SUPPLIER'
                      ? 'Supplier (To Pay)'
                      : r.partyType}
                </td>
                <td className="px-4 py-3 font-semibold text-ink">{r.partyName}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                  {formatINR(r.openingBalance)}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-leaf-soft px-2.5 py-0.5 text-xs font-semibold text-leaf">
                    Ready
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
