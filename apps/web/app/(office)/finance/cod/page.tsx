'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { formatINR } from '@neo/shared';
import { type CodPendingStopRecord } from '../../../../src/lib/finance-data';

export default function CodSettlementPage() {
  const [stops, setStops] = useState<CodPendingStopRecord[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [busyStopId, setBusyStopId] = useState<string | null>(null);

  const loadPendingStops = useCallback(async () => {
    const storedSite =
      typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') ?? '' : '';
    const siteQuery =
      storedSite && storedSite !== 'all' ? `?siteId=${encodeURIComponent(storedSite)}` : '';
    const res = await fetch(`/api/proxy/cod-settlements/pending${siteQuery}`).then((r) =>
      r.ok ? r.json() : [],
    );
    const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    setStops(
      rows.map((s: any) => ({
        stopId: String(s.stopId ?? s.id ?? ''),
        tripNo: String(s.tripNo ?? s.tripNumber ?? s.tripId ?? '—'),
        driverName: String(s.driverName ?? 'Driver'),
        orderNo: String(s.orderNo ?? s.salesOrderId ?? '—'),
        customerName: String(s.customerName ?? 'Customer'),
        expectedCod: Number(s.expectedCod ?? s.codAmount ?? 0),
        collectedCod: Number(s.collectedCod ?? s.codCollectedAmount ?? 0),
        status: (s.status ?? 'PENDING') as CodPendingStopRecord['status'],
      })),
    );
  }, []);

  useEffect(() => {
    loadPendingStops().catch(() => {});
  }, [loadPendingStops]);

  async function settleStop(stopId: string) {
    try {
      setBusyStopId(stopId);
      const res = await fetch(`/api/proxy/cod-settlements/${encodeURIComponent(stopId)}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadPendingStops();
      setToast('COD stop settled into driver custody wallet and customer ledger.');
    } catch (err) {
      setToast(`Failed to settle COD: ${(err as Error).message}`);
    } finally {
      setBusyStopId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">COD Settlement</h1>
        <p className="text-sm text-ink-3">
          Confirm cash-on-delivery stops collected per trip/driver (linked with Phase F8 trips &amp; EOD driver custody).
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
                        disabled={busyStopId === s.stopId}
                        onClick={() => settleStop(s.stopId)}
                        className="rounded-lg bg-leaf px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busyStopId === s.stopId ? 'Settling...' : 'Settle COD'}
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
