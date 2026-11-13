'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { evaluateTripCloseChecklist } from '@neo/shared';
import { INITIAL_TRIPS } from '../../../../../src/lib/logistics-data';

export default function CloseTripChecklistPage() {
  const params = useParams<{ id: string }>();
  const tripId = params?.id ?? 'trp-501';

  const seedTrip = useMemo(
    () => INITIAL_TRIPS.find((t) => t.id === tripId) ?? INITIAL_TRIPS[0],
    [tripId],
  );

  const [pendingStopsCount, setPendingStopsCount] = useState<number>(
    seedTrip.stops.filter((s) => s.deliveryStatus === 'PENDING').length,
  );
  const [unloggedReturnsCount, setUnloggedReturnsCount] = useState<number>(seedTrip.unloggedReturnsCount);
  const [uncollectedCodOrdersCount, setUncollectedCodOrdersCount] = useState<number>(
    seedTrip.stops.filter((s) => s.expectedCodInr > s.collectedCodInr).length,
  );
  const [codHandedOver, setCodHandedOver] = useState<boolean>(seedTrip.codHandedOver);
  const [expensesEntered, setExpensesEntered] = useState<boolean>(seedTrip.expensesEntered);
  const [openIssuesCount, setOpenIssuesCount] = useState<number>(seedTrip.openIssuesCount);
  const [tripClosed, setTripClosed] = useState<boolean>(seedTrip.status === 'CLOSED');

  const checklist = useMemo(
    () =>
      evaluateTripCloseChecklist({
        tripId: seedTrip.id,
        pendingStopsCount,
        unloggedReturnsCount,
        uncollectedCodOrdersCount,
        codHandedOver,
        expensesEntered,
        openIssuesCount,
      }),
    [
      seedTrip.id,
      pendingStopsCount,
      unloggedReturnsCount,
      uncollectedCodOrdersCount,
      codHandedOver,
      expensesEntered,
      openIssuesCount,
    ],
  );

  function resolveAllForDemo() {
    setPendingStopsCount(0);
    setUnloggedReturnsCount(0);
    setUncollectedCodOrdersCount(0);
    setCodHandedOver(true);
    setExpensesEntered(true);
    setOpenIssuesCount(0);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Link href="/logistics/trips" className="hover:text-blue-600">
              Trips
            </Link>
            <span>/</span>
            <Link href={`/logistics/trips/${seedTrip.id}`} className="font-mono hover:text-blue-600">
              {seedTrip.tripNo}
            </Link>
            <span>/</span>
            <span className="font-semibold text-slate-700">Close Checklist (BR-08)</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Close Trip Checklist — {seedTrip.tripNo}</h1>
          <p className="text-sm text-slate-500">
            All 6 BR-08 preconditions must be green before the trip can be closed. Red rows link directly to the fixing screen.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={resolveAllForDemo}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Simulate All Fixed
          </button>
          <Link
            href={`/logistics/trips/${seedTrip.id}`}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            ← Back to Trip
          </Link>
        </div>
      </div>

      {tripClosed && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          ✓ Trip {seedTrip.tripNo} is CLOSED. All BR-08 checks passed and ledger entries are locked.
        </div>
      )}

      {/* Checklist Rows */}
      <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {checklist.rows.map((item) => (
          <div key={item.key} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                  item.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}
              >
                {item.passed ? '✓' : '✕'}
              </span>
              <div>
                <div className="font-semibold text-slate-900">{item.label}</div>
                <div className={`text-xs ${item.passed ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {item.passed ? 'Passed — ready for trip closure' : item.detail}
                </div>
              </div>
            </div>

            {!item.passed && (
              <Link
                href={item.fixHref}
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                Go to Fix Screen →
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Footer Gate */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <div className="text-sm font-bold text-slate-900">
            {checklist.canClose
              ? 'All BR-08 Checks Green'
              : `${checklist.rows.filter((r) => !r.passed).length} Blocker(s) Remaining`}
          </div>
          <div className="text-xs text-slate-500">
            {checklist.canClose
              ? 'Trip is eligible for final closure.'
              : 'Close Trip button stays disabled while any BR-08 blocker is red.'}
          </div>
        </div>
        <button
          type="button"
          disabled={!checklist.canClose || tripClosed}
          onClick={() => setTripClosed(true)}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
            checklist.canClose && !tripClosed
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'cursor-not-allowed bg-slate-200 text-slate-500'
          }`}
        >
          {tripClosed ? 'Trip Closed' : 'Close Trip'}
        </button>
      </div>
    </div>
  );
}
