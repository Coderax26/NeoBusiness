'use client';

import React from 'react';
import Link from 'next/link';
import { COLLECTORS_MONITOR, FLEET_DRIVERS, FLEET_VEHICLES } from '../../../src/lib/logistics-data';

function getExpiryBadge(dateStr: string) {
  if (dateStr <= '2026-11-30') {
    return 'bg-rose-100 text-rose-700';
  }
  if (dateStr <= '2026-12-31') {
    return 'bg-amber-100 text-amber-800';
  }
  return 'bg-emerald-100 text-emerald-700';
}

export default function FleetMonitoringPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fleet Utilisation, Reminders & Field Monitoring</h1>
          <p className="text-sm text-slate-500">
            Vehicle trips/km utilisation, insurance/fitness/PUC expiry alerts, plus read-only driver & collector monitoring.
          </p>
        </div>
        <Link
          href="/logistics/vehicles"
          className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Manage Vehicles Master →
        </Link>
      </div>

      {/* Vehicle Utilisation & Document Expiry */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-800">
          Vehicle Utilisation & Document Expiry Reminders
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50/50 text-xs uppercase text-slate-500">
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
          <tbody className="divide-y divide-slate-100">
            {FLEET_VEHICLES.map((v) => (
              <tr key={v.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900">{v.regNo}</div>
                  <div className="text-xs text-slate-500">{v.model}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {v.capacityKg} kg · {v.capacityCrates} crates
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">{v.tripsThisMonth}</td>
                <td className="px-4 py-3 font-mono text-slate-700">{v.kmThisMonth.toLocaleString('en-IN')} km</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getExpiryBadge(v.insuranceExpiry)}`}>
                    {v.insuranceExpiry}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getExpiryBadge(v.fitnessExpiry)}`}>
                    {v.fitnessExpiry}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getExpiryBadge(v.pucExpiry)}`}>
                    {v.pucExpiry}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Read-only Driver & Collector Monitoring */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold text-slate-900">Driver Monitoring (Read-only Web View)</h2>
          <p className="text-xs text-slate-500">Live status of drivers executing routes on Driver PWA.</p>
          <div className="mt-4 space-y-3">
            {FLEET_DRIVERS.map((drv) => (
              <div key={drv.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <div className="font-semibold text-slate-900">{drv.name}</div>
                  <div className="text-xs text-slate-500">{drv.phone}</div>
                </div>
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                  {drv.activeTripNo ? `On ${drv.activeTripNo}` : 'Available'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold text-slate-900">Collector Monitoring (Read-only Web View)</h2>
          <p className="text-xs text-slate-500">Today&apos;s collection visits, wallet balance & handover status.</p>
          <div className="mt-4 space-y-3">
            {COLLECTORS_MONITOR.map((col) => (
              <div key={col.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <div className="font-semibold text-slate-900">{col.name}</div>
                  <div className="text-xs text-slate-500">
                    {col.pendingVisits} pending visits · Cash ₹{col.walletCashInr.toLocaleString('en-IN')} · Cheque ₹
                    {col.walletChequeInr.toLocaleString('en-IN')}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    col.handoverStatus === 'SETTLED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {col.handoverStatus}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

