'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, StatusPill } from '@neo/ui';
import { formatINR, reconcileTripCod } from '@neo/shared';
import { type TripRecord } from '../../../../src/lib/logistics-data';

export default function TripsListPage() {
  const [trips, setTrips] = useState<TripRecord[]>([]);

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/trips')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setTrips(
          rows.map((t: any) => ({
            ...t,
            id: String(t.id),
            tripNo: String(t.tripNo ?? t.trip_no ?? ''),
            tripDate: String(t.tripDate ?? t.trip_date ?? '').slice(0, 10),
            vehicleRegNo: String(t.vehicleRegNo ?? t.registration_no ?? ''),
            driverName: String(t.driverName ?? t.driver_name ?? ''),
            status: (t.status ?? 'LOADING') as TripRecord['status'],
            stops: Array.isArray(t.stops)
              ? t.stops.map((s: any) => ({
                  ...s,
                  id: String(s.id),
                  deliveryStatus: s.deliveryStatus ?? s.delivery_status ?? s.status ?? 'PENDING',
                  expectedCodInr: Number(s.expectedCodInr ?? s.cash_to_collect ?? 0),
                  collectedCodInr: Number(s.collectedCodInr ?? s.actual_cash_collected ?? 0),
                  valueInr: Number(s.valueInr ?? s.order_value ?? s.total_amount ?? 0),
                }))
              : [],
          })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/logistics/dispatch" className="hover:text-ink">Logistics</Link>
            <span>/</span>
            <span className="text-action">Trips</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Delivery Trips</h1>
          <p className="text-sm text-ink-3">
            All planned, in-transit, completed, and closed delivery trips with COD summary.
          </p>
        </div>
        <Link href="/logistics/trips/new">
          <Button variant="primary">+ Plan New Trip</Button>
        </Link>
      </div>

      <div className="bg-sheet border border-rule rounded-[3px] overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper border-b border-rule text-xs uppercase text-ink-3">
            <tr>
              <th className="p-3">Trip # &amp; Date</th>
              <th className="p-3">Vehicle &amp; Driver</th>
              <th className="p-3 text-right">Stops</th>
              <th className="p-3 text-right">Order Value</th>
              <th className="p-3 text-right">COD Collected</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {trips.map((trip) => {
              const totalValue = trip.stops.reduce((s, st) => s + st.valueInr, 0);
              const cod = reconcileTripCod(trip.stops);
              return (
                <tr key={trip.id} className="hover:bg-sunken">
                  <td className="p-3">
                    <Link
                      href={`/logistics/trips/${trip.id}`}
                      className="font-mono text-xs text-action font-bold hover:underline"
                    >
                      {trip.tripNo}
                    </Link>
                    <div className="text-[11px] text-ink-3 font-mono">{trip.tripDate}</div>
                  </td>
                  <td className="p-3">
                    <div className="text-ink font-medium">{trip.vehicleRegNo}</div>
                    <div className="text-xs text-ink-3">{trip.driverName}</div>
                  </td>
                  <td className="p-3 text-right font-mono text-ink">{trip.stops.length}</td>
                  <td className="p-3 text-right font-mono text-ink">{formatINR(totalValue)}</td>
                  <td className="p-3 text-right font-mono text-leaf">
                    {formatINR(cod.collectedCod)}
                  </td>
                  <td className="p-3">
                    <StatusPill
                      status={trip.status}
                      tone={
                        trip.status === 'COMPLETED' || trip.status === 'CLOSED'
                          ? 'emerald'
                          : trip.status === 'IN_TRANSIT'
                            ? 'sky'
                            : 'amber'
                      }
                    />
                  </td>
                  <td className="p-3 text-right space-x-2">
                    <Link
                      href={`/logistics/trips/${trip.id}`}
                      className="text-xs text-action hover:text-action font-medium"
                    >
                      Detail
                    </Link>
                    <Link
                      href={`/logistics/trips/${trip.id}/close`}
                      className="text-xs text-leaf hover:text-leaf font-medium"
                    >
                      Close (BR-08)
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

