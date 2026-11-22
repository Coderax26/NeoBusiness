'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

function getExpiryBadge(dateStr: string) {
  if (!dateStr) return 'bg-zinc-800 text-zinc-400';
  const daysLeft = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
  if (daysLeft <= 15) return 'bg-rose-500/15 text-rose-400';
  if (daysLeft <= 45) return 'bg-amber-500/15 text-amber-400';
  return 'bg-emerald-500/15 text-emerald-400';
}

export default function FleetMonitoringPage() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [collectors, setCollectors] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      fetch('/api/proxy/vehicles/monitoring').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/proxy/vehicles').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/proxy/drivers').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([monRes, vehRes, drvRes]) => {
        if (!active) return;
        const unwrap = (v: any) => (Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : null);
        const mon = monRes.status === 'fulfilled' ? monRes.value : null;
        if (mon && Array.isArray(mon.vehicles)) {
          setVehicles(mon.vehicles);
          setDrivers(Array.isArray(mon.drivers) ? mon.drivers : []);
          setCollectors(Array.isArray(mon.collectors) ? mon.collectors : []);
          return;
        }
        const monList = unwrap(mon);
        if (monList) {
          setVehicles(monList);
        } else if (vehRes.status === 'fulfilled') {
          const vList = unwrap(vehRes.value);
          if (vList) setVehicles(vList);
        }
        if (drvRes.status === 'fulfilled') {
          const dList = unwrap(drvRes.value);
          if (dList) setDrivers(dList);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Fleet Utilisation, Reminders &amp; Field Monitoring</h1>
          <p className="text-sm text-zinc-400">
            Vehicle trips/km utilisation, insurance/fitness/PUC expiry alerts, plus read-only driver &amp; collector monitoring.
          </p>
        </div>
        <Link
          href="/logistics/vehicles"
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
        >
          Manage Vehicles Master →
        </Link>
      </div>

      {/* Vehicle Utilisation & Document Expiry */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 bg-zinc-950/60 px-5 py-3 text-sm font-bold text-zinc-100">
          Vehicle Utilisation &amp; Document Expiry Reminders
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950/40 text-xs uppercase text-zinc-400">
            <tr>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Capacity</th>
              <th className="px-4 py-3">Trips / Month</th>
              <th className="px-4 py-3">KM / Month</th>
              <th className="px-4 py-3">Insurance</th>
              <th className="px-4 py-3">Fitness</th>
              <th className="px-4 py-3">PUC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {vehicles.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-zinc-500">
                  No vehicle monitoring records available.
                </td>
              </tr>
            ) : (
              vehicles.map((v) => (
                <tr key={v.id} className="hover:bg-zinc-800/40">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-zinc-100">{v.regNo || v.registration_no || v.reg_no}</div>
                    <div className="text-xs text-zinc-400">{v.model || v.vehicle_type || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {v.capacityKg ?? v.capacity_kg ?? 0} kg · {v.capacityCrates ?? v.capacity_crates ?? 0} crates
                  </td>
                  <td className="px-4 py-3 font-semibold text-zinc-100">{v.tripsThisMonth ?? 0}</td>
                  <td className="px-4 py-3 font-mono text-zinc-300">{Number(v.kmThisMonth ?? 0).toLocaleString('en-IN')} km</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getExpiryBadge(v.insuranceExpiry || v.insurance_expiry || '')}`}>
                      {v.insuranceExpiry || v.insurance_expiry || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getExpiryBadge(v.fitnessExpiry || v.fitness_expiry || '')}`}>
                      {v.fitnessExpiry || v.fitness_expiry || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getExpiryBadge(v.pucExpiry || v.puc_expiry || '')}`}>
                      {v.pucExpiry || v.puc_expiry || '—'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Read-only Driver & Collector Monitoring */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-base font-bold text-zinc-100">Driver Monitoring (Read-only Web View)</h2>
          <p className="text-xs text-zinc-400">Live status of drivers executing routes on Driver PWA.</p>
          <div className="mt-4 space-y-3">
            {drivers.length === 0 ? (
              <div className="text-xs text-zinc-500">No drivers found.</div>
            ) : (
              drivers.map((drv) => (
                <div key={drv.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
                  <div>
                    <div className="font-semibold text-zinc-100">{drv.name || drv.full_name}</div>
                    <div className="text-xs text-zinc-400">{drv.phone || ''}</div>
                  </div>
                  <span className="rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-400">
                    {drv.activeTripNo ? `On ${drv.activeTripNo}` : 'Available'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-base font-bold text-zinc-100">Collector Monitoring (Read-only Web View)</h2>
          <p className="text-xs text-zinc-400">Today&apos;s collection visits, wallet balance &amp; handover status.</p>
          <div className="mt-4 space-y-3">
            {collectors.length === 0 ? (
              <div className="text-xs text-zinc-500">No collector monitoring records available.</div>
            ) : (
              collectors.map((col) => (
                <div key={col.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
                  <div>
                    <div className="font-semibold text-zinc-100">{col.name}</div>
                    <div className="text-xs text-zinc-400">
                      {col.pendingVisits ?? 0} pending visits · Cash ₹{Number(col.walletCashInr ?? 0).toLocaleString('en-IN')} · Cheque ₹
                      {Number(col.walletChequeInr ?? 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      col.handoverStatus === 'SETTLED' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                    }`}
                  >
                    {col.handoverStatus || 'PENDING'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
