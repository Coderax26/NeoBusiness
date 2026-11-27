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

  const normalizeTrip = (t: any): TripRecord => ({
    id: String(t.id),
    tripNo: String(t.tripNo ?? t.trip_no ?? t.id),
    tripDate: String(t.tripDate ?? t.trip_date ?? '').slice(0, 10),
    vehicleId: String(t.vehicleId ?? t.vehicle_id ?? ''),
    vehicleRegNo: String(t.vehicleRegNo ?? t.registration_no ?? 'Vehicle'),
    driverId: String(t.driverId ?? t.driver_id ?? ''),
    driverName: String(t.driverName ?? t.driver_name ?? 'Driver'),
    status: (t.status ?? 'LOADING') as TripRecord['status'],
    loadingConfirmed: t.status !== 'LOADING',
    lastUpdated: String(t.lastUpdated ?? t.updated_at ?? t.created_at ?? '').slice(0, 16),
    unloggedReturnsCount: Number(t.unloggedReturnsCount ?? 0),
    codHandedOver: Boolean(t.codHandedOver ?? false),
    expensesEntered: Number(t.expenses_count ?? 0) > 0,
    openIssuesCount: Number(t.open_issues_count ?? 0),
    stops: Array.isArray(t.stops)
      ? t.stops.map((s: any, idx: number) => {
          const rawSt = String(s.deliveryStatus ?? s.delivery_status ?? s.status ?? 'PENDING');
          const deliveryStatus: TripStopDetail['deliveryStatus'] =
            rawSt === 'DELIVERED_FULL' || rawSt === 'DELIVERED'
              ? 'DELIVERED'
              : rawSt === 'DELIVERED_PARTIAL' || rawSt === 'PARTIAL'
                ? 'PARTIAL'
                : rawSt === 'FAILED'
                  ? 'FAILED'
                  : 'PENDING';
          return {
            stopId: String(s.stopId ?? s.id),
            seq: Number(s.seq ?? s.sequence_no ?? idx + 1),
            orderNo: String(s.orderNo ?? s.order_no ?? s.sales_order_id ?? 'Order'),
            customerName: String(s.customerName ?? s.customer_name ?? 'Customer'),
            area: String(s.area ?? s.site_name ?? ''),
            weightKg: Number(s.weightKg ?? s.total_weight_kg ?? 50),
            valueInr: Number(s.valueInr ?? s.order_value ?? s.total_amount ?? 0),
            deliveryStatus,
            expectedCodInr: Number(s.expectedCodInr ?? s.cod_amount ?? s.cash_to_collect ?? 0),
            collectedCodInr: Number(s.collectedCodInr ?? s.cod_collected_amount ?? s.actual_cash_collected ?? 0),
            challanNo: s.challanNo ?? s.challan_no,
            ewayBillRef: s.ewayBillRef ?? s.eway_bill_no,
            epodSignedBy: s.epodSignedBy ?? s.epod_signature_url,
            epodPhotoName: s.epodPhotoName ?? s.epod_photo_url,
            gpsX: Number(s.gpsX ?? 100),
            gpsY: Number(s.gpsY ?? 100),
            lines: Array.isArray(s.lines) ? s.lines : [],
          } as TripStopDetail & { lines?: any[] };
        })
      : [],
  });

  useEffect(() => {
    if (!tripId) return;
    let active = true;
    Promise.all([
      fetch(`/api/proxy/trips/${encodeURIComponent(tripId)}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/proxy/trip-expenses?tripId=${encodeURIComponent(tripId)}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/issues?tripId=${encodeURIComponent(tripId)}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([tData, expData, issData]) => {
        if (!active) return;
        const t = tData?.data || tData;
        if (t && t.id) setTrip(normalizeTrip(t));
        const eRows = Array.isArray(expData) ? expData : Array.isArray(expData?.data) ? expData.data : [];
        setTripExpenses(
          eRows.map((e: any) => ({
            id: String(e.id),
            tripId: String(e.trip_id ?? e.tripId ?? tripId),
            tripNo: String(e.trip_no ?? e.tripNo ?? ''),
            vehicleRegNo: String(e.registration_no ?? e.vehicleRegNo ?? ''),
            category: String(e.type ?? e.category ?? 'OTHER') as any,
            amount: Number(e.amount ?? 0),
            date: String(e.logged_at ?? e.date ?? '').slice(0, 10),
            notes: String(e.notes ?? e.type ?? ''),
          })),
        );
        const iRows = Array.isArray(issData) ? issData : Array.isArray(issData?.data) ? issData.data : [];
        setTripIssues(
          iRows.map((i: any) => ({
            id: String(i.id),
            issueNo: `ISS-${String(i.id).slice(0, 6).toUpperCase()}`,
            tripId: String(i.trip_id ?? i.tripId ?? tripId),
            tripNo: String(i.trip_no ?? i.tripNo ?? ''),
            stopOrderNo: String(i.stop_id ?? ''),
            customerName: String(i.customer_name ?? 'Stop'),
            type: (i.category ?? 'DISPUTE') as any,
            description: String(i.category ?? ''),
            status: (i.status === 'OPEN' ? 'OPEN' : 'RESOLVED') as any,
            reportedAt: String(i.created_at ?? '').slice(0, 10),
          })),
        );
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

  async function updateStopStatus(stopId: string, nextStatus: TripStopDetail['deliveryStatus']) {
    if (!trip) return;
    const stop: any = trip.stops.find((s) => s.stopId === stopId);
    if (!stop) return;
    try {
      const stopLines = Array.isArray(stop.lines) ? stop.lines : [];
      const payloadLines = stopLines.map((l: any) => {
        const loaded = Number(l.loaded_qty ?? 0);
        const delivered = nextStatus === 'PARTIAL' ? Math.max(0, loaded * 0.5) : loaded;
        const returned = Math.max(0, loaded - delivered);
        return {
          itemId: String(l.item_id),
          deliveredQty: delivered,
          returnedQty: returned,
          ...(l.batch_id ? { batchId: String(l.batch_id) } : {}),
        };
      });
      const res = await fetch(`/api/proxy/stops/${encodeURIComponent(stopId)}/deliver`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `stop-deliver-${stopId}-${Date.now()}`,
        },
        body: JSON.stringify({
          epodMethod: 'SIGNATURE',
          epodSignatureUrl: 'office-verified-signature',
          capturedAt: new Date().toISOString(),
          gpsLat: 18.15,
          gpsLng: 74.58,
          codCollectedAmount: nextStatus === 'DELIVERED' ? stop.expectedCodInr : stop.collectedCodInr,
          lines: payloadLines,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || `HTTP ${res.status}`);
      }
      if (data && data.id) {
        setTrip(normalizeTrip(data));
      }
      setStatusMessage(`Recorded stop ${nextStatus} via ePOD API.`);
    } catch (err) {
      setStatusMessage(`Failed to update stop: ${(err as Error).message}`);
    }
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
