'use client';

import React, { useEffect, useState } from 'react';
import { type FloorLoadingTrip } from '../../../../src/lib/inventory-data';
import { useFloorOutbox } from '../../../../src/lib/floor-outbox';

export default function FloorVehicleLoadingPage() {
  const { enqueueOrSend } = useFloorOutbox();
  const [trips, setTrips] = useState<FloorLoadingTrip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string>('');
  const [banner, setBanner] = useState<{ text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/trips?status=LOADING')
      .then((r) => (r.ok ? r.json() : null))
      .then(async (res) => {
        if (!active) return;
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const hydrated = await Promise.all(
          list.slice(0, 10).map(async (t: any) => {
            let detail = t;
            try {
              const dr = await fetch(`/api/proxy/trips/${encodeURIComponent(String(t.id))}`);
              if (dr.ok) {
                const dj = await dr.json();
                detail = dj?.data ?? dj ?? t;
              }
            } catch {
              /* fallback to summary row */
            }
            const rawStops = Array.isArray(detail.stops) ? detail.stops : [];
            return {
              tripId: String(detail.id),
              tripNo: String(detail.trip_no ?? detail.tripNo ?? String(detail.id).slice(0, 8)),
              vehicleNo: String(
                detail.registration_no ??
                  detail.external_vehicle_no ??
                  detail.vehicle_reg_no ??
                  detail.vehicleNo ??
                  'Vehicle',
              ),
              driverName: String(
                detail.driver_name ??
                  detail.external_driver_name ??
                  detail.transporter_name ??
                  detail.driverName ??
                  'Driver',
              ),
              status: (detail.status === 'READY_TO_DISPATCH' ? 'READY_TO_DISPATCH' : 'LOADING') as FloorLoadingTrip['status'],
              stops: rawStops.map((s: any) => {
                const lines = Array.isArray(s.lines) ? s.lines : [];
                const totalQty =
                  lines.reduce((acc: number, l: any) => acc + Number(l.loaded_qty ?? 0), 0) ||
                  Number(s.required_qty ?? 1);
                const firstItem = lines[0]?.item_name ?? s.order_no ?? 'Order Items';
                return {
                  stopId: String(s.id),
                  customerName: String(s.customer_name ?? s.customerName ?? 'Customer'),
                  itemName:
                    lines.length > 1
                      ? `${firstItem} (+${lines.length - 1} more)`
                      : String(firstItem),
                  requiredQty: totalQty,
                  loadedQty: 0,
                  uom: String(lines[0]?.uom ?? 'CRATE'),
                  suggestedBatch: String(lines[0]?.batch_number ?? s.batch_number ?? 'FEFO'),
                  checked: false,
                };
              }),
            };
          }),
        );
        if (!active) return;
        setTrips(hydrated);
        if (hydrated.length > 0) setSelectedTripId(hydrated[0].tripId);
      })
      .catch(() => {
        if (active) setTrips([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const trip = trips.find((t) => t.tripId === selectedTripId) || trips[0];

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
    const verifiedCratesCount = Math.max(
      1,
      Math.round(
        trip.stops.reduce((sum, s) => sum + Number(s.loadedQty || s.requiredQty || 1), 0),
      ),
    );
    const res = await enqueueOrSend({
      type: 'LOADING_CONFIRM',
      endpoint: `/api/bff/trips/${encodeURIComponent(trip.tripId)}/confirm-loading`,
      payload: {
        verifiedCratesCount,
      },
    });
    if (!res.ok && !res.queued) {
      setBanner({ text: `Could not confirm loading: ${res.message}`, isError: true });
      return;
    }
    setTrips((prev) =>
      prev.map((t) =>
        t.tripId === trip.tripId ? { ...t, status: 'READY_TO_DISPATCH' } : t,
      ),
    );
    setBanner({ text: `Loading confirmed for ${trip.tripNo}! ${res.message}`, isError: false });
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
        <div className="flex items-center gap-3">
          {trips.length > 1 && (
            <select
              value={trip.tripId}
              onChange={(e) => setSelectedTripId(e.target.value)}
              className="min-h-[44px] bg-zinc-950 border border-zinc-700 rounded-xl px-3 text-sm text-white"
            >
              {trips.map((t) => (
                <option key={t.tripId} value={t.tripId}>
                  {t.tripNo} ({t.vehicleNo})
                </option>
              ))}
            </select>
          )}
          <span className="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 font-bold text-sm">
            {trip.status}
          </span>
        </div>
      </div>

      {banner && (
        <div
          className={`p-4 rounded-xl border font-semibold ${
            banner.isError
              ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
              : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
          }`}
        >
          {banner.text}
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

