'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { calculateTripProgress, reconcileTripCod, requiresEwayBill } from '@neo/shared';
import {
  type TripRecord,
  type TripStopDetail,
  type TripExpenseRecord,
  type DeliveryIssueRecord,
} from '../../../../../src/lib/logistics-data';

type DetailTab = 'STOPS' | 'DOCUMENTS' | 'COD' | 'EXPENSES' | 'ISSUES' | 'TIMELINE';

const STATUS_BADGES: Record<TripRecord['status'], string> = {
  DRAFT: 'bg-sunken text-ink-2',
  LOADING: 'bg-haldi-soft text-haldi',
  IN_TRANSIT: 'bg-blue-500/15 text-blue-400',
  COMPLETED: 'bg-leaf-soft text-leaf',
  CLOSED: 'bg-leaf text-white',
};

const STOP_STATUS_STYLES: Record<TripStopDetail['deliveryStatus'], string> = {
  PENDING: 'bg-sunken text-ink-2',
  DELIVERED: 'bg-leaf-soft text-leaf',
  PARTIAL: 'bg-haldi-soft text-haldi',
  FAILED: 'bg-madder-soft text-madder',
};

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const tripId = params?.id ?? '';

  const [trip, setTrip] = useState<TripRecord | null>(null);
  const [tripExpenses, setTripExpenses] = useState<TripExpenseRecord[]>([]);
  const [tripIssues, setTripIssues] = useState<DeliveryIssueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>('STOPS');
  const [selectedStopEpod, setSelectedStopEpod] = useState<TripStopDetail | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId) return;
    let active = true;
    Promise.all([
      fetch(`/api/proxy/trips/${encodeURIComponent(tripId)}`).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/proxy/trip-expenses').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/issues').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([tData, expData, issData]) => {
        if (!active) return;
        const t = tData?.data || tData;
        if (t && t.id) setTrip(t);
        const eRows = Array.isArray(expData) ? expData : Array.isArray(expData?.data) ? expData.data : [];
        setTripExpenses(eRows.filter((e: any) => String(e.tripId || e.trip_id) === tripId));
        const iRows = Array.isArray(issData) ? issData : Array.isArray(issData?.data) ? issData.data : [];
        setTripIssues(iRows.filter((i: any) => String(i.tripId || i.trip_id) === tripId));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tripId]);

  const progress = useMemo(() => calculateTripProgress(trip?.stops ?? []), [trip?.stops]);
  const codSummary = useMemo(() => reconcileTripCod(trip?.stops ?? []), [trip?.stops]);

  if (loading) {
    return <div className="p-6 text-sm text-ink-3">Loading trip details...</div>;
  }

  if (!trip) {
    return (
      <div className="p-6 space-y-3">
        <Link href="/logistics/trips" className="text-xs text-ink-3 hover:text-ink inline-block">
          ← Back to Trips
        </Link>
        <div className="rounded-[3px] border border-rule bg-sheet p-6 text-sm text-ink-3">
          Trip not found.
        </div>
      </div>
    );
  }

  function updateStopStatus(stopId: string, nextStatus: TripStopDetail['deliveryStatus']) {
    setTrip((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lastUpdated: 'Just now',
        stops: prev.stops.map((s) =>
          s.stopId === stopId
            ? {
                ...s,
                deliveryStatus: nextStatus,
                collectedCodInr:
                  nextStatus === 'DELIVERED' ? s.expectedCodInr : nextStatus === 'FAILED' ? 0 : s.collectedCodInr,
                epodSignedBy: nextStatus === 'DELIVERED' ? s.epodSignedBy ?? 'Receiver Verified' : s.epodSignedBy,
              }
            : s,
        ),
      };
    });
    setStatusMessage(`Updated stop status to ${nextStatus}.`);
  }

  function toggleCodHandover() {
    if (!trip) return;
    setTrip((prev) => (prev ? { ...prev, codHandedOver: !prev.codHandedOver } : prev));
    setStatusMessage(!trip.codHandedOver ? 'Marked COD handed over for F9 settlement.' : 'Reverted COD handover flag.');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Link href="/logistics/trips" className="hover:text-blue-600">
              Trips
            </Link>
            <span>/</span>
            <span className="font-mono text-slate-700">{trip.tripNo}</span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{trip.tripNo}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGES[trip.status]}`}>
              {trip.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Vehicle <span className="font-semibold text-slate-700">{trip.vehicleRegNo}</span> · Driver{' '}
            <span className="font-semibold text-slate-700">{trip.driverName}</span> · Date {trip.tripDate}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/logistics/dispatch"
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Live Board
          </Link>
          <Link
            href={`/logistics/trips/${trip.id}/close`}
            className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Close Trip Checklist →
          </Link>
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-[3px] border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-800">
          {statusMessage}
        </div>
      )}

      {/* Progress & COD Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-[3px] border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Stop Progress</div>
          <div className="mt-1 text-xl font-bold text-slate-900">
            {progress.completedStops} / {progress.totalStops} ({progress.pct}%)
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-action transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
        <div className="rounded-[3px] border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Expected COD</div>
          <div className="mt-1 text-xl font-bold text-slate-900">₹{codSummary.expectedCod.toLocaleString('en-IN')}</div>
        </div>
        <div className="rounded-[3px] border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Collected COD</div>
          <div className="mt-1 text-xl font-bold text-emerald-700">₹{codSummary.collectedCod.toLocaleString('en-IN')}</div>
          <div className="mt-1 text-xs text-slate-500">
            Variance: ₹{codSummary.variance.toLocaleString('en-IN')}
          </div>
        </div>
        <div className="rounded-[3px] border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">F9 Settlement Link</div>
          <div className="mt-1 text-sm font-semibold text-slate-800">
            {trip.codHandedOver ? 'Handed Over to Accounts' : 'Pending Handover'}
          </div>
          <button
            type="button"
            onClick={toggleCodHandover}
            className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
          >
            {trip.codHandedOver ? 'Mark Pending' : 'Confirm COD Handover'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {(
          [
            ['STOPS', `Stops & ePOD (${trip.stops.length})`],
            ['DOCUMENTS', 'Documents (Challans & E-Way)'],
            ['COD', 'Cash (COD Reconciliation)'],
            ['EXPENSES', `Expenses (${tripExpenses.length})`],
            ['ISSUES', `Issues (${tripIssues.length})`],
            ['TIMELINE', 'Timeline'],
          ] as Array<[DetailTab, string]>
        ).map(([tabKey, label]) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => setActiveTab(tabKey)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
              activeTab === tabKey ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'STOPS' && (
        <div className="overflow-hidden rounded-[3px] border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Order & Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">COD (Collected / Expected)</th>
                <th className="px-4 py-3">ePOD</th>
                <th className="px-4 py-3 text-right">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trip.stops.map((stop) => (
                <tr key={stop.stopId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-700">{stop.seq}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">
                      {stop.orderNo} · {stop.customerName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {stop.area} · {stop.weightKg} kg · ₹{stop.valueInr.toLocaleString('en-IN')}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STOP_STATUS_STYLES[stop.deliveryStatus]}`}
                    >
                      {stop.deliveryStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">
                    ₹{stop.collectedCodInr.toLocaleString('en-IN')} / ₹{stop.expectedCodInr.toLocaleString('en-IN')}
 </td>
 <td className="px-4 py-3">
 {stop.epodSignedBy || stop.epodPhotoName ? (
 <button
 type="button"
 onClick={() => setSelectedStopEpod(stop)}
 className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
 >
 View ePOD
 </button>
 ) : (
 <span className="text-xs text-slate-400">Pending</span>
 )}
 </td>
 <td className="px-4 py-3 text-right">
 <div className="inline-flex gap-1">
 <button
 type="button"
 onClick={() => updateStopStatus(stop.stopId,'DELIVERED')}
 className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
 >
 Deliver
 </button>
 <button
 type="button"
 onClick={() => updateStopStatus(stop.stopId,'PARTIAL')}
 className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
 >
 Partial
 </button>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}

 {activeTab ==='DOCUMENTS' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {trip.stops.map((stop) => {
            const needEway = requiresEwayBill(stop.valueInr);
            return (
              <div key={stop.stopId} className="rounded-[3px] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-900">
                    Stop #{stop.seq} — {stop.orderNo}
                  </div>
                  <span className="font-mono text-xs text-blue-700">{stop.challanNo ?? 'Pending Challan'}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {stop.customerName} · Value ₹{stop.valueInr.toLocaleString('en-IN')}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <span>E-Way Bill ({needEway ? 'Required ≥ ₹50,000' : 'Optional'})</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {stop.ewayBillRef ?? (needEway ? 'Missing!' : 'N/A')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'COD' && (
        <div className="rounded-[3px] border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Trip COD Reconciliation (Linked to Finance F9)</h2>
              <p className="text-xs text-slate-500">
                Collected cash/cheque per stop compared against expected COD before handover to Cashier.
              </p>
            </div>
            <Link
              href="/finance/cod"
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              Open COD Settlement (F9) →
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Expected</div>
              <div className="text-lg font-bold text-slate-900">₹{codSummary.expectedCod.toLocaleString('en-IN')}</div>
 </div>
 <div className="rounded-lg bg-emerald-50 p-3">
 <div className="text-xs text-emerald-700">Collected</div>
 <div className="text-lg font-bold text-emerald-800">₹{codSummary.collectedCod.toLocaleString('en-IN')}</div>
 </div>
 <div className="rounded-lg bg-amber-50 p-3">
 <div className="text-xs text-amber-800">Variance</div>
 <div className="text-lg font-bold text-amber-900">₹{codSummary.variance.toLocaleString('en-IN')}</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'EXPENSES' && (
        <div className="rounded-[3px] border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Trip Expenses</h2>
            <Link
              href="/logistics/expenses"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Manage All Expenses →
            </Link>
          </div>
          {tripExpenses.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No expenses logged for this trip yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {tripExpenses.map((exp) => (
                <li key={exp.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{exp.category}</span>{' '}
                    <span className="font-medium text-slate-800">{exp.notes}</span>
                  </div>
                  <span className="font-mono font-semibold text-slate-900">₹{exp.amount.toLocaleString('en-IN')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'ISSUES'&& (
 <div className="rounded-[3px] border border-slate-200 bg-white p-5">
 <div className="flex items-center justify-between">
 <h2 className="text-base font-bold text-slate-900">Delivery Issues</h2>
 <Link
 href="/logistics/issues"
 className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
 >
 Open Issues Desk →
 </Link>
 </div>
 {tripIssues.length === 0 ? (
 <p className="mt-3 text-sm text-slate-500">No delivery issues reported for this trip.</p>
 ) : (
 <ul className="mt-3 space-y-2">
 {tripIssues.map((iss) => (
 <li key={iss.id} className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
 <div className="flex items-center justify-between">
 <span className="font-semibold text-rose-900">
 {iss.issueNo} · {iss.type} ({iss.stopOrderNo})
 </span>
 <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-rose-700">{iss.status}</span>
 </div>
 <p className="mt-1 text-xs text-rose-800">{iss.description}</p>
 </li>
 ))}
 </ul>
 )}
 </div>
 )}

 {activeTab ==='TIMELINE' && (
        <div className="rounded-[3px] border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold text-slate-900">Trip Event Timeline</h2>
          <ol className="mt-4 space-y-3 border-l-2 border-blue-200 pl-4 text-sm">
            <li>
              <div className="font-semibold text-slate-900">Trip Created & Stops Assigned</div>
              <div className="text-xs text-slate-500">{trip.tripDate} 07:30 · {trip.stops.length} stops loaded</div>
            </li>
            <li>
              <div className="font-semibold text-slate-900">Loading Confirmed & Challans Generated</div>
              <div className="text-xs text-slate-500">{trip.tripDate} 08:45 · Gate pass issued</div>
            </li>
            <li>
              <div className="font-semibold text-slate-900">Last Live Ping ({trip.status})</div>
              <div className="text-xs text-slate-500">Updated {trip.lastUpdated} · Driver {trip.driverName}</div>
            </li>
          </ol>
        </div>
      )}

      {/* ePOD Modal */}
      {selectedStopEpod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-[4px] bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">ePOD Proof — {selectedStopEpod.orderNo}</h3>
              <button
                type="button"
                onClick={() => setSelectedStopEpod(null)}
                className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Customer</div>
                <div className="font-semibold text-slate-900">{selectedStopEpod.customerName}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Receiver Signature</div>
                <div className="font-serif text-lg italic text-blue-800">
                  {selectedStopEpod.epodSignedBy ?? 'Signed digitally'}
                </div>
              </div>
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-600">
                📷 Photo Evidence: <span className="font-mono font-semibold">{selectedStopEpod.epodPhotoName ?? 'epod-capture.jpg'}</span>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedStopEpod(null)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
