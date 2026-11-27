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
        <h1 className="text-2xl font-bold text-ink">COD Settlement</h1>
        <p className="text-sm text-ink-3">
          Confirm cash-on-delivery stops collected per trip/driver (linked with Phase F8 trips).
        </p>
      </div>

      {toast && (
        <div className="rounded-[3px] border border-leaf/30 bg-leaf-soft px-4 py-2.5 text-sm font-medium text-leaf">
          {toast}
        </div>
      )}

      <div className="overflow-hidden rounded-[3px] border border-rule bg-sheet">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-ink-3">
            <tr>
              <th className="px-4 py-3">Trip / Driver</th>
              <th className="px-4 py-3">Order / Customer</th>
              <th className="px-4 py-3 text-right">Expected COD</th>
              <th className="px-4 py-3 text-right">Collected COD</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {stops.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-ink-3">
                  No pending COD settlements.
                </td>
              </tr>
            ) : (
              stops.map((s) => (
                <tr key={s.stopId} className="hover:bg-sunken">
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold text-ink">{s.tripNo}</div>
                    <div className="text-xs text-ink-3">{s.driverName}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{s.customerName}</div>
                    <div className="font-mono text-xs text-ink-3">{s.orderNo}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-ink">{formatINR(s.expectedCod)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-leaf">
                    {formatINR(s.collectedCod)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        s.status === 'SETTLED' ? 'bg-leaf-soft text-leaf' : 'bg-haldi-soft text-haldi'
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
                        className="rounded-lg bg-leaf px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
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
