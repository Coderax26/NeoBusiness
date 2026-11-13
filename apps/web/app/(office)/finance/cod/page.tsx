'use client';

import React, { useState } from 'react';
import { formatINR } from '@neo/shared';
import { INITIAL_COD_STOPS, type CodPendingStopRecord } from '../../../../src/lib/finance-data';

export default function CodSettlementPage() {
  const [stops, setStops] = useState<CodPendingStopRecord[]>(INITIAL_COD_STOPS);
  const [toast, setToast] = useState<string | null>(null);

  function settleStop(stopId: string) {
    setStops((prev) => prev.map((s) => (s.stopId === stopId ? { ...s, status: 'SETTLED' } : s)));
    setToast('COD stop settled and reconciled with trip ledger.');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">COD Settlement</h1>
        <p className="text-sm text-slate-500">
          Confirm cash-on-delivery stops collected per trip/driver (linked with Phase F8 trips).
        </p>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
          {toast}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Trip / Driver</th>
              <th className="px-4 py-3">Order / Customer</th>
              <th className="px-4 py-3 text-right">Expected COD</th>
              <th className="px-4 py-3 text-right">Collected COD</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stops.map((s) => (
              <tr key={s.stopId}>
                <td className="px-4 py-3">
                  <div className="font-mono font-semibold text-slate-900">{s.tripNo}</div>
                  <div className="text-xs text-slate-500">{s.driverName}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-800">{s.customerName}</div>
                  <div className="font-mono text-xs text-slate-500">{s.orderNo}</div>
                </td>
                <td className="px-4 py-3 text-right font-mono">{formatINR(s.expectedCod)}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700">
                  {formatINR(s.collectedCod)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      s.status === 'SETTLED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {s.status === 'PENDING' && (
                    <button
                      type="button"
                      onClick={() => settleStop(s.stopId)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Settle COD
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

