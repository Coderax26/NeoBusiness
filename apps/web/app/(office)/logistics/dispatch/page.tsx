'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { KpiCard, Badge, StatusPill, Button, Card } from '@neo/ui';
import { formatINR, calculateTripProgress, reconcileTripCod } from '@neo/shared';
import {
  type TripRecord,
} from '../../../../src/lib/logistics-data';

export default function LiveDispatchBoardPage() {
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [issuesCount, setIssuesCount] = useState(0);
  const [readyOrdersCount, setReadyOrdersCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [lastRefreshed, setLastRefreshed] = useState('Just now');
  const [deliveryIssues, setDeliveryIssues] = useState<any[]>([]);

  const normalizeTrip = (t: any): TripRecord => ({
    ...t,
    id: String(t.id),
    tripNo: String(t.tripNo ?? t.trip_no ?? ''),
    tripDate: String(t.tripDate ?? t.trip_date ?? '').slice(0, 10),
    vehicleRegNo: String(t.vehicleRegNo ?? t.registration_no ?? ''),
    driverName: String(t.driverName ?? t.driver_name ?? ''),
    lastUpdated: String(t.lastUpdated ?? t.updated_at ?? t.created_at ?? '').slice(0, 16),
    status: (t.status ?? 'LOADING') as TripRecord['status'],
    stops: Array.isArray(t.stops)
      ? t.stops.map((s: any) => {
          const rawSt = String(s.deliveryStatus ?? s.delivery_status ?? s.status ?? 'PENDING');
          return {
            ...s,
            id: String(s.id),
            deliveryStatus:
              rawSt === 'DELIVERED_FULL' || rawSt === 'DELIVERED'
                ? 'DELIVERED'
                : rawSt === 'DELIVERED_PARTIAL' || rawSt === 'PARTIAL'
                  ? 'PARTIAL'
                  : rawSt === 'FAILED'
                    ? 'FAILED'
                    : 'PENDING',
            expectedCodInr: Number(s.expectedCodInr ?? s.cod_amount ?? s.cash_to_collect ?? 0),
            collectedCodInr: Number(s.collectedCodInr ?? s.cod_collected_amount ?? s.actual_cash_collected ?? 0),
            valueInr: Number(s.valueInr ?? s.order_value ?? s.total_amount ?? 0),
          };
        })
      : [],
  });

  const refreshBoard = () => {
    Promise.allSettled([
      fetch('/api/bff/trips').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/proxy/issues').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/proxy/orders?status=READY').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([tripsRes, issuesRes, ordersRes]) => {
        if (tripsRes.status === 'fulfilled' && tripsRes.value) {
          const rows = Array.isArray(tripsRes.value) ? tripsRes.value : Array.isArray(tripsRes.value?.data) ? tripsRes.value.data : [];
          setTrips(rows.map(normalizeTrip));
        }
        if (issuesRes.status === 'fulfilled' && issuesRes.value) {
          const iss = Array.isArray(issuesRes.value) ? issuesRes.value : Array.isArray(issuesRes.value?.data) ? issuesRes.value.data : [];
          setDeliveryIssues(
            iss.map((i: any) => ({
              ...i,
              id: String(i.id),
              issueNo: i.issueNo ?? `ISS-${String(i.id).slice(0, 6).toUpperCase()}`,
              type: i.type ?? i.category ?? 'ISSUE',
              tripNo: i.tripNo ?? i.trip_no ?? '',
              customerName: i.customerName ?? i.site_name ?? 'Route Stop',
              description: i.description ?? `${i.category ?? 'Issue'} (Value at risk: ₹${Number(i.value_at_risk ?? 0)})`,
            })),
          );
          setIssuesCount(iss.filter((i: any) => i.status === 'OPEN').length);
        }
        if (ordersRes.status === 'fulfilled' && ordersRes.value) {
          const ords = Array.isArray(ordersRes.value) ? ordersRes.value : Array.isArray(ordersRes.value?.data) ? ordersRes.value.data : [];
          setReadyOrdersCount(ords.length);
        }
      })
      .catch(() => {});
    setLastRefreshed(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setSecondsLeft(30);
  };

  useEffect(() => {
    refreshBoard();
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          refreshBoard();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const allStops = trips.flatMap((t) => t.stops);
  const deliveredStops = allStops.filter((s) => s.deliveryStatus === 'DELIVERED').length;
  const failedStops = allStops.filter((s) => s.deliveryStatus === 'FAILED').length;
  const loadingCount = trips.filter((t) => t.status === 'LOADING').length;
  const onRoadCount = trips.filter((t) => t.status === 'IN_TRANSIT').length;
  const codToSettle = trips.reduce(
    (sum, t) => sum + reconcileTripCod(t.stops).collectedCod,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            <h1 className="text-2xl font-bold text-ink">Live Dispatch Board</h1>
          </div>
          <p className="text-sm text-ink-3 mt-1">
            Real-time trip lanes, delivery stop progress, map pins, and COD/issue alerts (30s auto-refresh).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono text-ink-3 bg-sheet border border-rule px-3 py-2 rounded-lg">
            Auto-refresh in {secondsLeft}s · Updated {lastRefreshed}
          </span>
          <Button variant="secondary" onClick={refreshBoard}>
            ↻ Refresh
          </Button>
          <Link href="/logistics/trips/new">
            <Button variant="primary">+ Plan New Trip</Button>
          </Link>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiCard title="Ready Orders" value={String(readyOrdersCount)} subtitle="Pool to assign" />
        <KpiCard title="Trips Loading" value={String(loadingCount)} subtitle="At depot dock" />
        <KpiCard title="On Road" value={String(onRoadCount)} subtitle="In transit now" />
        <KpiCard title="Delivered Stops" value={`${deliveredStops} / ${allStops.length}`} subtitle="Today's stops" />
        <KpiCard title="Failed Stops" value={String(failedStops)} subtitle="Needs action" />
        <KpiCard title="COD Collected" value={formatINR(codToSettle)} subtitle="To settle" />
      </div>

      {/* Trip Lanes + Map */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">
            Active &amp; Loading Trip Lanes
          </h2>
          {trips.map((trip) => {
            const prog = calculateTripProgress(trip.stops);
            return (
              <Card key={trip.id} className="p-4 bg-sheet border-rule space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link
                      href={`/logistics/trips/${trip.id}`}
                      className="font-mono text-sm text-action font-bold hover:underline"
                    >
                      {trip.tripNo}
                    </Link>
                    <span className="text-xs text-ink-3 ml-2">
                      {trip.vehicleRegNo} · Driver: {trip.driverName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-ink-3">
                      Updated {trip.lastUpdated}
                    </span>
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
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-ink-2 mb-1">
                    <span>{prog.label}</span>
                    <span className="font-mono">{prog.pct}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-sunken rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{ width: `${prog.pct}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Link href={`/logistics/trips/${trip.id}`}>
                    <Button variant="secondary">Inspect Trip</Button>
                  </Link>
                  <Link href={`/logistics/trips/${trip.id}/close`}>
                    <Button variant="secondary">Close Checklist (BR-08)</Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Live Map & Alerts */}
        <div className="space-y-4">
          <Card className="p-4 bg-sheet border-rule space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Live Route &amp; Stop Map</h3>
              <Badge variant="info">GPS Pins</Badge>
            </div>
            <svg viewBox="0 0 360 190" className="w-full h-48 bg-paper rounded-[3px] border border-rule">
              {/* Depot */}
              <circle cx="40" cy="95" r="8" fill="#3b82f6" />
              <text x="40" y="116" textAnchor="middle" fill="#93c5fd" fontSize="9">Depot</text>

              {(trips[0]?.stops ?? []).map((s) => (
                <g key={s.stopId}>
                  <line x1="40" y1="95" x2={s.gpsX} y2={s.gpsY} stroke="#1e3a8a" strokeDasharray="3 3" />
                  <circle
                    cx={s.gpsX}
                    cy={s.gpsY}
                    r="9"
                    fill={
                      s.deliveryStatus === 'DELIVERED'
                        ? '#10b981'
                        : s.deliveryStatus === 'PARTIAL'
                          ? '#f59e0b'
                          : '#38bdf8'
                    }
                  />
                  <text x={s.gpsX} y={s.gpsY + 3} textAnchor="middle" fill="#09090b" fontSize="9" fontWeight="bold">
                    {s.seq}
                  </text>
                </g>
              ))}
            </svg>
          </Card>

          <Card className="p-4 bg-sheet border-rule space-y-2">
            <h3 className="text-sm font-semibold text-ink">Delivery Alerts &amp; Disputes</h3>
            {deliveryIssues.map((iss) => (
              <Link
                key={iss.id}
                href="/logistics/issues"
                className="block p-3 rounded-lg bg-madder-soft border border-madder/30 text-xs hover:opacity-90/15"
              >
                <div className="flex justify-between font-bold text-madder">
                  <span>{iss.issueNo} ({iss.type})</span>
                  <span>{iss.tripNo}</span>
                </div>
                <div className="text-ink mt-1">{iss.customerName}</div>
                <div className="text-ink-3 mt-0.5">{iss.description}</div>
              </Link>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

