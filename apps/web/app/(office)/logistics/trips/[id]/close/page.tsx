'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { evaluateTripCloseChecklist } from '@neo/shared';

export default function CloseTripChecklistPage() {
  const params = useParams<{ id: string }>();
  const tripId = params?.id ?? '';

  const [tripNo, setTripNo] = useState(tripId);
  const [pendingStopsCount, setPendingStopsCount] = useState<number>(0);
  const [unloggedReturnsCount, setUnloggedReturnsCount] = useState<number>(0);
  const [uncollectedCodOrdersCount, setUncollectedCodOrdersCount] = useState<number>(0);
  const [codHandedOver, setCodHandedOver] = useState<boolean>(true);
  const [expensesEntered, setExpensesEntered] = useState<boolean>(true);
  const [openIssuesCount, setOpenIssuesCount] = useState<number>(0);
  const [tripClosed, setTripClosed] = useState<boolean>(false);

  useEffect(() => {
    if (!tripId) return;
    let active = true;
    fetch(`/api/proxy/trips/${encodeURIComponent(tripId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (!active || !res) return;
        const t = res.data || res;
        setTripNo(String(t.tripNo || t.trip_no || tripId));
        const stops = Array.isArray(t.stops) ? t.stops : [];
        setPendingStopsCount(stops.filter((s: any) => s.deliveryStatus === 'PENDING').length);
        setUnloggedReturnsCount(Number(t.unloggedReturnsCount ?? 0));
        setUncollectedCodOrdersCount(stops.filter((s: any) => (s.expectedCodInr ?? 0) > (s.collectedCodInr ?? 0)).length);
        setCodHandedOver(Boolean(t.codHandedOver ?? true));
        setExpensesEntered(Boolean(t.expensesEntered ?? true));
        setOpenIssuesCount(Number(t.openIssuesCount ?? 0));
        setTripClosed(t.status === 'CLOSED');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [tripId]);

  const checklist = useMemo(
    () =>
      evaluateTripCloseChecklist({
        tripId,
        pendingStopsCount,
        unloggedReturnsCount,
        uncollectedCodOrdersCount,
        codHandedOver,
        expensesEntered,
        openIssuesCount,
      }),
    [
      tripId,
      pendingStopsCount,
      unloggedReturnsCount,
      uncollectedCodOrdersCount,
      codHandedOver,
      expensesEntered,
      openIssuesCount,
    ],
  );

  async function handleCloseTrip() {
    if (!checklist.canClose || tripClosed) return;
    await fetch(`/api/proxy/trips/${encodeURIComponent(tripId)}/close`, { method: 'POST' }).catch(() => {});
    setTripClosed(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Link href="/logistics/trips" className="hover:text-blue-400">
              Trips
            </Link>
            <span>/</span>
            <Link href={`/logistics/trips/${tripId}`} className="font-mono hover:text-blue-400">
              {tripNo}
            </Link>
            <span>/</span>
            <span className="font-semibold text-zinc-200">Close Checklist (BR-08)</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-zinc-100">Close Trip Checklist — {tripNo}</h1>
          <p className="text-sm text-zinc-400">
            All 6 BR-08 preconditions must be green before the trip can be closed. Red rows link directly to the fixing screen.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/logistics/trips/${tripId}`}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            ← Back to Trip
          </Link>
        </div>
      </div>

      {tripClosed && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-300">
          ✓ Trip {tripNo} is CLOSED. All BR-08 checks passed and ledger entries are locked.
        </div>
      )}

      {/* Checklist Rows */}
      <div className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        {checklist.rows.map((item) => (
          <div key={item.key} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                  item.passed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                }`}
              >
                {item.passed ? '✓' : '✕'}
              </span>
              <div>
                <div className="font-semibold text-zinc-100">{item.label}</div>
                <div className={`text-xs ${item.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {item.passed ? 'Passed — ready for trip closure' : item.detail}
                </div>
              </div>
            </div>

            {!item.passed && (
              <Link
                href={item.fixHref}
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20"
              >
                Go to Fix Screen →
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Footer Gate */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div>
          <div className="text-sm font-bold text-zinc-100">
            {checklist.canClose
              ? 'All BR-08 Checks Green'
              : `${checklist.rows.filter((r) => !r.passed).length} Blocker(s) Remaining`}
          </div>
          <div className="text-xs text-zinc-400">
            {checklist.canClose
              ? 'Trip is eligible for final closure.'
              : 'Close Trip button stays disabled while any BR-08 blocker is red.'}
          </div>
        </div>
        <button
          type="button"
          disabled={!checklist.canClose || tripClosed}
          onClick={handleCloseTrip}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
            checklist.canClose && !tripClosed
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
          }`}
        >
          {tripClosed ? 'Trip Closed' : 'Close Trip'}
        </button>
      </div>
    </div>
  );
}
