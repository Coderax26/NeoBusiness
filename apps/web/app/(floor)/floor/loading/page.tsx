'use client';

import React, { useState } from 'react';
import { INITIAL_FLOOR_TRIPS, type FloorLoadingTrip } from '../../../../src/lib/inventory-data';
import { useFloorOutbox } from '../../../../src/lib/floor-outbox';

export default function FloorVehicleLoadingPage() {
  const { enqueueOrSend } = useFloorOutbox();
  const [trips, setTrips] = useState<FloorLoadingTrip[]>(INITIAL_FLOOR_TRIPS);
  const [banner, setBanner] = useState<string | null>(null);

  const trip = trips[0];

  const toggleStop = (stopId: string) => {
    setTrips((prev) =>
      prev.map((t) =>
        t.tripId === trip.tripId
          ? {
              ...t,
              stops: t.stops.map((s) =>
                s.stopId === stopId
                  ? {
                      ...s,
                      checked: !s.checked,
                      loadedQty: !s.checked ? s.requiredQty : 0,
                    }
                  : s,
              ),
            }
          : t,
      ),
    );
  };

  const handleCompleteLoading = async () => {
    const res = await enqueueOrSend({
      type: 'LOADING_CONFIRM',
      endpoint: `/api/bff/trips/${trip.tripId}/confirm-loading`,
      payload: {
        tripId: trip.tripId,
        stops: trip.stops,
      },
    });
    setTrips((prev) =>
      prev.map((t) =>
        t.tripId === trip.tripId ? { ...t, status: 'READY_TO_DISPATCH' } : t,
      ),
    );
    setBanner(`Loading complete for ${trip.tripNo}! ${res.message}`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Load Vehicle Checklist</h1>
          <p className="text-base text-zinc-400">
            Trip <strong className="text-amber-400 font-mono">{trip.tripNo}</strong> · Vehicle{' '}
            {trip.vehicleNo} · Driver: {trip.driverName}
          </p>
        </div>
        <span className="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 font-bold text-sm">
          {trip.status}
        </span>
      </div>

      {banner && (
        <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold">
          {banner}
        </div>
      )}

      <div className="space-y-4">
        {trip.stops.map((stop) => (
          <button
            key={stop.stopId}
            type="button"
            onClick={() => toggleStop(stop.stopId)}
            className={`w-full text-left min-h-[72px] p-5 rounded-2xl border flex items-center justify-between gap-4 transition-colors ${
              stop.checked
                ? 'bg-emerald-950/30 border-emerald-500/60'
                : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div>
              <div className="text-xl font-bold text-white">{stop.itemName}</div>
              <div className="text-sm text-zinc-400">
                Customer: {stop.customerName} · Batch:{' '}
                <span className="text-amber-400 font-mono">{stop.suggestedBatch}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="font-mono text-2xl font-bold text-white">
                {stop.requiredQty} {stop.uom}
              </div>
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black ${
                  stop.checked
                    ? 'bg-emerald-500 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                ✓
              </div>
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={trip.stops.some((s) => !s.checked)}
        onClick={handleCompleteLoading}
        className="w-full min-h-[60px] rounded-2xl bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-black text-xl"
      >
        ✓ LOADING COMPLETE (ENABLE DISPATCH)
      </button>
    </div>
  );
}

