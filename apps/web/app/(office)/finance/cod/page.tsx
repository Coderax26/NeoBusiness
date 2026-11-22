'use client';

import React, { useState, useEffect } from 'react';
import { formatINR } from '@neo/shared';
import { type CodPendingStopRecord } from '../../../../src/lib/finance-data';

export default function CodSettlementPage() {
  const [stops, setStops] = useState<CodPendingStopRecord[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/cod-settlements/pending')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setStops(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function settleStop(stopId: string) {
    await fetch(`/api/proxy/cod-settlements/${encodeURIComponent(stopId)}/settle`, {
      method: 'POST',
    }).catch(() => {});
    setStops((prev) => prev.map((s) => (s.stopId === stopId ? { ...s, status: 'SETTLED' } : s)));
    setToast('COD stop settled and reconciled with trip ledger.');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">COD Settlement</h1>
        <p className="text-sm text-zinc-400">
          Confirm cash-on-delivery stops collected per trip/driver (linked with Phase F8 trips).
        </p>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-300">
          {toast}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950/60 text-xs uppercase text-zinc-400">
            <tr>
              <th className="px-4 py-3">Trip / Driver</th>
              <th className="px-4 py-3">Order / Customer</th>
              <th className="px-4 py-3 text-right">Expected COD</th>
              <th className="px-4 py-3 text-right">Collected COD</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {stops.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500">
                  No pending COD settlements.
                </td>
              </tr>
            ) : (
              stops.map((s) => (
                <tr key={s.stopId} className="hover:bg-zinc-800/40">
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold text-zinc-100">{s.tripNo}</div>
                    <div className="text-xs text-zinc-400">{s.driverName}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-zinc-200">{s.customerName}</div>
                    <div className="font-mono text-xs text-zinc-400">{s.orderNo}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-200">{formatINR(s.expectedCod)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-400">
                    {formatINR(s.collectedCod)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        s.status === 'SETTLED' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
