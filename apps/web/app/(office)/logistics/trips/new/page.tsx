'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button, Badge, Card } from '@neo/ui';
import {
  formatINR,
  evaluateTripBuilderReadiness,
  requiresEwayBill,
} from '@neo/shared';
import {
  READY_ORDERS_POOL,
  FLEET_VEHICLES,
  FLEET_DRIVERS,
  type ReadyOrderItem,
} from '../../../../src/lib/logistics-data';

interface DraftStop extends ReadyOrderItem {
  ewayBillRef: string;
  challanGenerated: boolean;
}

export default function PlanNewTripPage() {
  const [areaFilter, setAreaFilter] = useState('ALL');
  const [windowFilter, setWindowFilter] = useState('ALL');
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [stops, setStops] = useState<DraftStop[]>([
    { ...READY_ORDERS_POOL[0], ewayBillRef: '', challanGenerated: false },
    { ...READY_ORDERS_POOL[1], ewayBillRef: '', challanGenerated: false },
  ]);
  const [vehicleId, setVehicleId] = useState(FLEET_VEHICLES[0].id);
  const [driverId, setDriverId] = useState(FLEET_DRIVERS[0].id);
  const [loadingConfirmed, setLoadingConfirmed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const selectedVehicle =
    FLEET_VEHICLES.find((v) => v.id === vehicleId) || FLEET_VEHICLES[0];

  const availableOrders = useMemo(() => {
    const inTrip = new Set(stops.map((s) => s.id));
    return READY_ORDERS_POOL.filter((o) => {
      if (inTrip.has(o.id)) return false;
      if (areaFilter !== 'ALL' && o.area !== areaFilter) return false;
      if (windowFilter !== 'ALL' && o.deliveryWindow !== windowFilter) return false;
      return true;
    });
  }, [stops, areaFilter, windowFilter]);

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

  const handleGenerateChallans = () => {
    setStops((prev) => prev.map((s) => ({ ...s, challanGenerated: true })));
    setToast(`Generated ${stops.length} delivery challan(s).`);
  };

  const handleSaveTrip = () => {
    fetch('/api/bff/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleId, driverId, stops }),
    }).catch(() => {});
    setToast('Trip saved! Confirm loading on floor or below to enable Dispatch.');
  };

  const handleDispatch = () => {
    if (!readiness.canDispatch) return;
    setToast(`Dispatched trip with ${selectedVehicle.regNo} (${stops.length} stops).`);
  };

  const capPct = Math.min(
    100,
    Math.round((readiness.totalWeightKg / Math.max(1, readiness.capacityKg)) * 100),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
            <Link href="/logistics/dispatch" className="hover:text-white">Logistics</Link>
            <span>/</span>
            <span className="text-blue-400">Plan Trip</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Visual Trip Builder</h1>
          <p className="text-sm text-zinc-400">
            Select or drag READY orders into a vehicle, check capacity &amp; credit holds, generate challans + e-way refs, and dispatch.
          </p>
        </div>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Ready Orders Pool */}
        <Card className="lg:col-span-4 p-4 bg-zinc-900 border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Ready Orders ({availableOrders.length})</h2>
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
              className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
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
              className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
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
                className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs flex items-start gap-2.5"
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
                    <span className="text-blue-400 font-bold">{order.orderNo}</span>
                    <span className="text-zinc-300">{order.weightKg} kg</span>
                  </div>
                  <div className="text-white font-medium mt-0.5">{order.customerName}</div>
                  <div className="text-zinc-500">
                    {order.area} · {order.deliveryWindow} · {formatINR(order.valueInr)}
                  </div>
                  {order.creditHold && (
                    <div className="mt-1 text-rose-400 font-semibold">⚠ Credit Hold</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Center: Trip Canvas */}
        <Card
          className="lg:col-span-5 p-4 bg-zinc-900 border-zinc-800 space-y-4"
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
              <label className="block text-[11px] text-zinc-400 mb-1">Vehicle</label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
              >
                {FLEET_VEHICLES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.regNo} ({v.capacityKg} kg)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Driver</label>
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
              >
                {FLEET_DRIVERS.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Capacity Meter */}
          <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-300 font-medium">Truck Capacity Meter</span>
              <span className="font-mono font-bold text-white">
                {readiness.totalWeightKg} / {readiness.capacityKg} kg
              </span>
            </div>
            <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
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
              <div className="text-xs text-rose-400 font-semibold">
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
                  className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-blue-400 font-bold mr-2">
                        #{idx + 1} {stop.orderNo}
                      </span>
                      <span className="text-white font-semibold">{stop.customerName}</span>
                      {stop.creditHold && (
                        <Badge variant="danger" className="ml-2">Credit Hold</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => moveStop(idx, -1)} className="px-1.5 py-0.5 bg-zinc-800 rounded">↑</button>
                      <button onClick={() => moveStop(idx, 1)} className="px-1.5 py-0.5 bg-zinc-800 rounded">↓</button>
                      <button
                        onClick={() => setStops((prev) => prev.filter((s) => s.id !== stop.id))}
                        className="px-1.5 py-0.5 text-rose-400"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between text-zinc-400 font-mono">
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
                        className="w-full bg-zinc-900 border border-amber-500/40 rounded px-2 py-1 text-xs text-white"
                      />
                    </div>
                  )}
                  {stop.challanGenerated && (
                    <div className="text-emerald-400 font-mono">✓ Challan DC-2026-80{idx + 1} ready</div>
                  )}
                </div>
              );
            })}
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
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
        <Card className="lg:col-span-3 p-4 bg-zinc-900 border-zinc-800 space-y-3">
          <h3 className="text-sm font-semibold text-white">Route Sequence Preview</h3>
          <svg viewBox="0 0 340 190" className="w-full h-48 bg-zinc-950 rounded-xl border border-zinc-800">
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
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-1">
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

