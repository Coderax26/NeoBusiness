'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Button, Badge, Card } from '@neo/ui';
import {
  formatINR,
  evaluateTripBuilderReadiness,
  requiresEwayBill,
} from '@neo/shared';
import {
  type ReadyOrderItem,
} from '../../../../../src/lib/logistics-data';

interface DraftStop extends ReadyOrderItem {
  ewayBillRef: string;
  challanGenerated: boolean;
}

export default function PlanNewTripPage() {
  const [siteId, setSiteId] = useState('');
  const [readyPool, setReadyPool] = useState<ReadyOrderItem[]>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: string; regNo: string; model: string; capacityKg: number; capacityCrates: number }>>([]);
  const [drivers, setDrivers] = useState<Array<{ id: string; name: string; phone: string }>>([]);
  const [stockBatches, setStockBatches] = useState<any[]>([]);
  const [areaFilter, setAreaFilter] = useState('ALL');
  const [windowFilter, setWindowFilter] = useState('ALL');
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [stops, setStops] = useState<DraftStop[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [loadingConfirmed, setLoadingConfirmed] = useState(false);
  const [savedTrip, setSavedTrip] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/proxy/orders?status=READY').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/orders?status=CONFIRMED').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/vehicles').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/drivers').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/inventory/stock/current').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([meRes, readyRes, confRes, vehRes, drvRes, stkRes]) => {
        if (!active) return;
        const storedSite =
          typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') : null;
        const resolvedSite =
          (storedSite && storedSite !== 'all' ? storedSite : null) ||
          meRes?.user?.activeSiteId ||
          meRes?.user?.sites?.[0]?.id ||
          '';
        if (resolvedSite) setSiteId(String(resolvedSite));

        const rRows = Array.isArray(readyRes) ? readyRes : Array.isArray(readyRes?.data) ? readyRes.data : [];
        const cRows = Array.isArray(confRes) ? confRes : Array.isArray(confRes?.data) ? confRes.data : [];
        const combined = [...rRows, ...cRows];
        const mappedOrders: ReadyOrderItem[] = combined.map((o: any, idx: number) => ({
          id: String(o.id),
          orderNo: String(o.order_no || o.orderNumber || o.id),
          customerId: String(o.customer_id || o.customerId || ''),
          customerName: String(o.customer_name || o.customerName || 'Customer'),
          siteId: String(o.fulfillment_site_id || resolvedSite || ''),
          area: String(o.area || o.city || o.site_name || 'Main Route'),
          deliveryWindow: (o.delivery_time_window || o.deliveryWindow || '10-12') as ReadyOrderItem['deliveryWindow'],
          weightKg: Number(
            o.total_weight_kg ??
              o.weightKg ??
              (Array.isArray(o.lines)
                ? o.lines.reduce((s: number, l: any) => s + Number(l.ordered_qty || l.qty || 0), 0) || 50
                : 50),
          ),
          crates: Number(o.total_crates ?? o.crates ?? 2),
          valueInr: Number(o.total_amount ?? o.valueInr ?? 0),
          status: 'READY',
          rawStatus: String(o.order_status || 'READY'),
          creditHold: o.credit_flag === 'HOLD' || Boolean(o.credit_hold),
          gpsX: 95 + (idx % 4) * 60,
          gpsY: 55 + Math.floor(idx / 4) * 65,
          lines: Array.isArray(o.lines)
            ? o.lines.map((l: any) => ({
                itemId: String(l.item_id || l.itemId || ''),
                qty: Number(l.ordered_qty ?? l.qty ?? 1),
              }))
            : [],
        }));
        setReadyPool(mappedOrders);

        const vRows = Array.isArray(vehRes) ? vehRes : Array.isArray(vehRes?.data) ? vehRes.data : [];
        const mappedVehicles = vRows.map((v: any) => ({
          id: String(v.id),
          regNo: String(v.registration_no || v.regNo || v.id),
          model: String(v.vehicle_type || v.model || 'Truck'),
          capacityKg: Number(v.capacity_kg ?? v.capacityKg ?? 1000),
          capacityCrates: Number(v.capacity_crates ?? v.capacityCrates ?? 50),
        }));
        setVehicles(mappedVehicles);
        if (mappedVehicles.length > 0) setVehicleId(mappedVehicles[0].id);

        const dRows = Array.isArray(drvRes) ? drvRes : Array.isArray(drvRes?.data) ? drvRes.data : [];
        const mappedDrivers = dRows.map((d: any) => ({
          id: String(d.id),
          name: String(d.fullName || d.full_name || d.name || 'Driver'),
          phone: String(d.phone || ''),
        }));
        setDrivers(mappedDrivers);
        if (mappedDrivers.length > 0) setDriverId(mappedDrivers[0].id);

        const sRows = Array.isArray(stkRes) ? stkRes : Array.isArray(stkRes?.data) ? stkRes.data : [];
        setStockBatches(sRows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const selectedVehicle =
    vehicles.find((v) => v.id === vehicleId) || vehicles[0] || { id: '', regNo: '—', model: '', capacityKg: 1000, capacityCrates: 50 };

  const availableOrders = useMemo(() => {
    const inTrip = new Set(stops.map((s) => s.id));
    return readyPool.filter((o) => {
      if (inTrip.has(o.id)) return false;
      if (areaFilter !== 'ALL' && o.area !== areaFilter) return false;
      if (windowFilter !== 'ALL' && o.deliveryWindow !== windowFilter) return false;
      return true;
    });
  }, [readyPool, stops, areaFilter, windowFilter]);

  const readiness = useMemo(
    () =>
      evaluateTripBuilderReadiness({
        capacityKg: selectedVehicle.capacityKg,
        loadingConfirmed,
        stops: stops.map((s) => ({
          orderNo: s.orderNo,
          valueInr: s.valueInr,
          weightKg: s.weightKg,
          status: s.status,
          creditHold: s.creditHold,
          ewayBillRef: s.ewayBillRef,
        })),
      }),
    [selectedVehicle.capacityKg, loadingConfirmed, stops],
  );

  const addOrderToTrip = (order: ReadyOrderItem) => {
    setStops((prev) => [
      ...prev,
      { ...order, ewayBillRef: '', challanGenerated: false },
    ]);
  };

  const handleAddSelected = () => {
    const toAdd = availableOrders.filter((o) => checkedIds.includes(o.id));
    setStops((prev) => [
      ...prev,
      ...toAdd.map((o) => ({ ...o, ewayBillRef: '', challanGenerated: false })),
    ]);
    setCheckedIds([]);
  };

  const moveStop = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= stops.length) return;
    const copy = [...stops];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    setStops(copy);
  };

  const handleGenerateChallans = async () => {
    if (savedTrip?.id && Array.isArray(savedTrip.stops)) {
      setBusy(true);
      try {
        for (const st of savedTrip.stops) {
          await fetch(
            `/api/proxy/trips/${encodeURIComponent(savedTrip.id)}/stops/${encodeURIComponent(st.id)}/challan`,
            { method: 'POST' },
          );
        }
        setStops((prev) => prev.map((s) => ({ ...s, challanGenerated: true })));
        setToast(`Generated ${savedTrip.stops.length} delivery challan(s) on trip ${savedTrip.trip_no || ''}.`);
      } catch (err) {
        setToast(`Failed to generate challans: ${(err as Error).message}`);
      } finally {
        setBusy(false);
      }
      return;
    }
    setStops((prev) => prev.map((s) => ({ ...s, challanGenerated: true })));
    setToast(`Prepared ${stops.length} delivery challan(s). Save trip to issue PDFs.`);
  };

  const handleSaveTrip = async () => {
    const resolvedSiteId = siteId || stops[0]?.siteId || '';
    if (!resolvedSiteId || !vehicleId || !driverId || stops.length === 0) {
      setToast('Site, vehicle, driver, and at least one stop are required to save a trip.');
      return null;
    }
    setBusy(true);
    try {
      const payload = {
        siteId: resolvedSiteId,
        tripDate: new Date().toISOString().split('T')[0],
        vehicleId,
        driverId,
        stops: stops.map((s, idx) => ({
          customerId: s.customerId || '',
          salesOrderId: s.id,
          sequenceNo: idx + 1,
          isCod: Boolean(s.creditHold),
          codAmount: s.creditHold ? s.valueInr : 0,
          lines: (s.lines || []).map((l) => ({
            itemId: l.itemId,
            loadedQty: Number(l.qty || 1),
          })),
        })),
      };
      const res = await fetch('/api/proxy/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || `HTTP ${res.status}`);
      }
      const created = data?.data ?? data;
      setSavedTrip(created);
      setToast(`Trip ${created?.trip_no || ''} saved in LOADING state!`);
      return created;
    } catch (err) {
      setToast(`Failed to save trip: ${(err as Error).message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleDispatch = async () => {
    if (!readiness.canDispatch) return;
    setBusy(true);
    try {
      const trip = savedTrip || (await handleSaveTrip());
      if (!trip?.id || !Array.isArray(trip.stops)) return;

      await fetch(`/api/proxy/trips/${encodeURIComponent(trip.id)}/confirm-loading`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verifiedCratesCount: stops.reduce((s, st) => s + st.crates, 0) }),
      });

      const dispatchLines: Array<{ stopId: string; itemId: string; batchId: string; qty: number }> = [];
      for (const st of trip.stops) {
        for (const line of st.lines || []) {
          const matchingBatch = stockBatches.find(
            (b: any) => String(b.itemId || b.item_id) === String(line.item_id) && Number(b.qtyAvailable ?? b.qty_available ?? 0) > 0,
          );
          if (!matchingBatch) {
            throw new Error(`No available inventory batch found for item ${line.item_id}. Receive GRN stock before dispatching.`);
          }
          dispatchLines.push({
            stopId: String(st.id),
            itemId: String(line.item_id),
            batchId: String(matchingBatch.batchId || matchingBatch.id),
            qty: Number(line.loaded_qty || 1),
          });
        }
      }

      const res = await fetch(`/api/proxy/trips/${encodeURIComponent(trip.id)}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: dispatchLines }),
      });
      const dPayload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(dPayload?.message || dPayload?.error?.message || `HTTP ${res.status}`);
      }
      setToast(`Dispatched trip ${trip.trip_no || ''} with ${selectedVehicle.regNo} (${stops.length} stops)!`);
    } catch (err) {
      setToast(`Dispatch blocked: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const capPct = Math.min(
    100,
    Math.round((readiness.totalWeightKg / Math.max(1, readiness.capacityKg)) * 100),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/logistics/dispatch" className="hover:text-ink">Logistics</Link>
            <span>/</span>
            <span className="text-action">Plan Trip</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Visual Trip Builder</h1>
          <p className="text-sm text-ink-3">
            Select or drag READY orders into a vehicle, check capacity &amp; credit holds, generate challans + e-way refs, and dispatch.
          </p>
        </div>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-leaf-soft border border-leaf/30 text-leaf text-sm">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Ready Orders Pool */}
        <Card className="lg:col-span-4 p-4 bg-sheet border-rule space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Ready Orders ({availableOrders.length})</h2>
            <Button
              variant="secondary"
              disabled={checkedIds.length === 0}
              onClick={handleAddSelected}
            >
              Add Selected →
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="bg-paper border border-rule-strong rounded-lg px-2 py-1.5 text-xs text-ink"
            >
              <option value="ALL">All Areas</option>
              <option value="Baramati East">Baramati East</option>
              <option value="Indapur Road">Indapur Road</option>
              <option value="Phaltan">Phaltan</option>
              <option value="Daund">Daund</option>
            </select>
            <select
              value={windowFilter}
              onChange={(e) => setWindowFilter(e.target.value)}
              className="bg-paper border border-rule-strong rounded-lg px-2 py-1.5 text-xs text-ink"
            >
              <option value="ALL">All Windows</option>
              <option value="10-12">10–12</option>
              <option value="13-16">13–16</option>
            </select>
          </div>

          <div className="space-y-2">
            {availableOrders.map((order) => (
              <div
                key={order.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', order.id)}
                className="p-3 rounded-lg bg-paper border border-rule text-xs flex items-start gap-2.5"
              >
                <input
                  type="checkbox"
                  checked={checkedIds.includes(order.id)}
                  onChange={() =>
                    setCheckedIds((prev) =>
                      prev.includes(order.id)
                        ? prev.filter((x) => x !== order.id)
                        : [...prev, order.id],
                    )
                  }
                  className="mt-1 accent-blue-500"
                />
                <div className="flex-1">
                  <div className="flex justify-between font-mono">
                    <span className="text-action font-bold">{order.orderNo}</span>
                    <span className="text-ink-2">{order.weightKg} kg</span>
                  </div>
                  <div className="text-ink font-medium mt-0.5">{order.customerName}</div>
                  <div className="text-ink-3">
                    {order.area} · {order.deliveryWindow} · {formatINR(order.valueInr)}
                  </div>
                  {order.creditHold && (
                    <div className="mt-1 text-madder font-semibold">⚠ Credit Hold</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Center: Trip Canvas */}
        <Card
          className="lg:col-span-5 p-4 bg-sheet border-rule space-y-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData('text/plain');
            const found = availableOrders.find((o) => o.id === id);
            if (found) addOrderToTrip(found);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-ink-3 mb-1">Vehicle</label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2 text-xs text-ink"
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.regNo} ({v.capacityKg} kg)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-ink-3 mb-1">Driver</label>
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2 text-xs text-ink"
              >
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Capacity Meter */}
          <div className="p-3 rounded-lg bg-paper border border-rule space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-ink-2 font-medium">Truck Capacity Meter</span>
              <span className="font-mono font-bold text-ink">
                {readiness.totalWeightKg} / {readiness.capacityKg} kg
              </span>
            </div>
            <div className="w-full h-2.5 bg-sunken rounded-full overflow-hidden">
              <div
                className={`h-full ${
                  readiness.isOverCapacity
                    ? 'bg-rose-500'
                    : capPct > 85
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${capPct}%` }}
              />
            </div>
            {readiness.isOverCapacity && (
              <div className="text-xs text-madder font-semibold">
                ⚠ This trip is {readiness.overCapacityKg} kg over the truck&apos;s limit.
              </div>
            )}
          </div>

          {/* Stops List */}
          <div className="space-y-2">
            {stops.map((stop, idx) => {
              const needsEway = requiresEwayBill(stop.valueInr);
              return (
                <div
                  key={stop.id}
                  className="p-3 rounded-lg bg-paper border border-rule text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-action font-bold mr-2">
                        #{idx + 1} {stop.orderNo}
                      </span>
                      <span className="text-ink font-semibold">{stop.customerName}</span>
                      {stop.creditHold && (
                        <Badge variant="danger" className="ml-2">Credit Hold</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => moveStop(idx, -1)} className="px-1.5 py-0.5 bg-sunken rounded">↑</button>
                      <button onClick={() => moveStop(idx, 1)} className="px-1.5 py-0.5 bg-sunken rounded">↓</button>
                      <button
                        onClick={() => setStops((prev) => prev.filter((s) => s.id !== stop.id))}
                        className="px-1.5 py-0.5 text-madder"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between text-ink-3 font-mono">
                    <span>{stop.weightKg} kg · {stop.area}</span>
                    <span>{formatINR(stop.valueInr)}</span>
                  </div>
                  {needsEway && (
                    <div className="pt-1">
                      <input
                        type="text"
                        placeholder="E-Way Bill Ref required (value ≥ ₹50,000)"
                        value={stop.ewayBillRef}
                        onChange={(e) =>
                          setStops((prev) =>
                            prev.map((s) =>
                              s.id === stop.id ? { ...s, ewayBillRef: e.target.value } : s,
                            ),
                          )
                        }
                        className="w-full bg-sheet border border-haldi/30 rounded px-2 py-1 text-xs text-ink"
                      />
                    </div>
                  )}
                  {stop.challanGenerated && (
                    <div className="text-leaf font-mono">✓ Challan DC-2026-80{idx + 1} ready</div>
                  )}
                </div>
              );
            })}
          </div>

          <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
            <input
              type="checkbox"
              checked={loadingConfirmed}
              onChange={(e) => setLoadingConfirmed(e.target.checked)}
              className="accent-emerald-500"
            />
            <span>Floor loading confirmed (unlocks Dispatch)</span>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={!readiness.canSaveTrip} onClick={handleSaveTrip}>
              Save Trip
            </Button>
            <Button variant="secondary" disabled={stops.length === 0} onClick={handleGenerateChallans}>
              Generate Challans
            </Button>
            <Button variant="primary" disabled={!readiness.canDispatch} onClick={handleDispatch}>
              Dispatch ▶
            </Button>
          </div>
        </Card>

        {/* Right: Route Preview */}
        <Card className="lg:col-span-3 p-4 bg-sheet border-rule space-y-3">
          <h3 className="text-sm font-semibold text-ink">Route Sequence Preview</h3>
          <svg viewBox="0 0 340 190" className="w-full h-48 bg-paper rounded-[3px] border border-rule">
            <circle cx="35" cy="95" r="7" fill="#3b82f6" />
            {stops.map((s, idx) => (
              <g key={s.id}>
                <circle cx={s.gpsX} cy={s.gpsY} r="9" fill="#10b981" />
                <text x={s.gpsX} y={s.gpsY + 3} textAnchor="middle" fill="#09090b" fontSize="9" fontWeight="bold">
                  {idx + 1}
                </text>
              </g>
            ))}
          </svg>
          {readiness.blockers.length > 0 && (
            <div className="p-3 rounded-lg bg-haldi-soft border border-haldi/30 text-xs text-haldi space-y-1">
              <div className="font-bold">Dispatch Gate Blockers:</div>
              {readiness.blockers.map((b) => (
                <div key={b}>• {b}</div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

