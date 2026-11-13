'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { evaluateEodChecklist, formatINR } from '@neo/shared';

export default function EodClosingPage() {
  const [selectedDate, setSelectedDate] = useState('2026-11-13');
  const [started, setStarted] = useState(true);
  const [openTripsCount, setOpenTripsCount] = useState(0);
  const [nonZeroFieldWalletsCount, setNonZeroFieldWalletsCount] = useState(1);
  const [uninvoicedDeliveriesCount, setUninvoicedDeliveriesCount] = useState(0);
  const [pendingHandoversCount, setPendingHandoversCount] = useState(1);
  const [undepositedChequesCount, setUndepositedChequesCount] = useState(0);
  const [depositSlipPrepared, setDepositSlipPrepared] = useState(true);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [signedOff, setSignedOff] = useState(false);

  const checklist = useMemo(
    () =>
      evaluateEodChecklist({
        openTripsCount,
        nonZeroFieldWalletsCount,
        uninvoicedDeliveriesCount,
        pendingHandoversCount,
        undepositedChequesCount,
        depositSlipPrepared,
      }),
    [
      openTripsCount,
      nonZeroFieldWalletsCount,
      uninvoicedDeliveriesCount,
      pendingHandoversCount,
      undepositedChequesCount,
      depositSlipPrepared,
    ],
  );

  function resolveAllBlockers() {
    setOpenTripsCount(0);
    setNonZeroFieldWalletsCount(0);
    setUninvoicedDeliveriesCount(0);
    setPendingHandoversCount(0);
    setUndepositedChequesCount(0);
    setDepositSlipPrepared(true);
  }

  function handleOwnerSignOff(e: React.FormEvent) {
    e.preventDefault();
    if (!checklist.canSignOff || !ownerPassword.trim()) return;
    setSignedOff(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Guided End-of-Day (EOD) Close</h1>
          <p className="text-sm text-slate-500">
            All 6 checklist preconditions must be green before Owner sign-off becomes available.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          {!started && (
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Start EOD
            </button>
          )}
          <button
            type="button"
            onClick={resolveAllBlockers}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Simulate All Cleared
          </button>
        </div>
      </div>

      {signedOff && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          ✓ EOD for {selectedDate} signed off by Owner. Day closed in 14 mins.
        </div>
      )}

      {/* Checklist */}
      <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {checklist.rows.map((row) => (
          <div key={row.key} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                  row.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}
              >
                {row.passed ? '✓' : '✕'}
              </span>
              <div>
                <div className="font-semibold text-slate-900">{row.label}</div>
                <div className={`text-xs ${row.passed ? 'text-emerald-700' : 'text-rose-700'}`}>{row.detail}</div>
              </div>
            </div>
            {!row.passed && (
              <Link
                href={row.fixHref}
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                Go to Fix Screen →
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Bank Deposit Slip Preview */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">Bank Deposit Slip Preview</h2>
          <span className="font-mono text-sm font-bold text-emerald-700">Net Cash to Bank: {formatINR(28500)}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Denomination summary prepared for SBI Baramati Current Account · Slip #DEP-{selectedDate.replace(/-/g, '')}.
        </p>
      </div>

      {/* Owner Sign-off: visible ONLY when all green */}
      {checklist.canSignOff && !signedOff && (
        <form onSubmit={handleOwnerSignOff} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 space-y-3">
          <div className="text-sm font-bold text-emerald-900">All EOD Checks Green — Owner Sign-off Ready</div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="password"
              value={ownerPassword}
              onChange={(e) => setOwnerPassword(e.target.value)}
              placeholder="Enter Owner step-up password"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              required
            />
            <button
              type="submit"
              className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Owner Sign-off &amp; Close Day
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

