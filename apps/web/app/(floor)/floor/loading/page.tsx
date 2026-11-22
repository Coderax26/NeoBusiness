'use client';

import React, { useEffect, useState } from 'react';
import { type FloorLoadingTrip } from '../../../../src/lib/inventory-data';
import { useFloorOutbox } from '../../../../src/lib/floor-outbox';

export default function FloorVehicleLoadingPage() {
  const { enqueueOrSend } = useFloorOutbox();
  const [trips, setTrips] = useState<FloorLoadingTrip[]>([]);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/proxy/trips')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setTrips(
          list.map((t: any) => ({
            tripId: t.id,
            tripNo: t.trip_no ?? t.tripNo ?? t.id.slice(0, 8),
            vehicleNo: t.vehicle_reg_no ?? t.vehicleNo ?? 'Vehicle',
            driverName: t.driver_name ?? t.driverName ?? 'Driver',
            status: t.status ?? 'LOADING',
            stops: Array.isArray(t.stops)
              ? t.stops.map((s: any) => ({
                  stopId: s.id,
                  customerName: s.customer_name ?? s.customerName ?? 'Customer',
                  itemName: s.item_name ?? 'Order Items',
                  requiredQty: Number(s.required_qty ?? 1),
                  loadedQty: 0,
                  uom: 'CRATE',
                  suggestedBatch: s.batch_number ?? 'FEFO',
                  checked: false,
                }))
              : [],
          })),
        );
      })
      .catch(() => setTrips([]));
  }, []);

  const trip = trips[0];

  if (!trip) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-zinc-400">
        No trips queued for loading.
      </div>
    );
  }

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

