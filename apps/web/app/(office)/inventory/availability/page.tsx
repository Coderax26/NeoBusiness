'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, Badge } from '@neo/ui';
import { computeAtp } from '@neo/shared';
import { INITIAL_ATP_PROJECTIONS } from '../../../src/lib/inventory-data';

export default function CheckAvailabilityPage() {
  const [selectedItemId, setSelectedItemId] = useState(INITIAL_ATP_PROJECTIONS[0].itemId);
  const [targetDate, setTargetDate] = useState('2026-11-16');

  const proj = useMemo(
    () =>
      INITIAL_ATP_PROJECTIONS.find((p) => p.itemId === selectedItemId) ||
      INITIAL_ATP_PROJECTIONS[0],
    [selectedItemId],
  );

  const currentAtp = computeAtp(proj.onHand, proj.reserved);
  const projectedAtp = currentAtp + proj.incomingPoQty + proj.plannedProductionQty;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
          <Link href="/inventory/stock" className="hover:text-white">Inventory</Link>
          <span>/</span>
          <span className="text-amber-400">Check Availability (ATP)</span>
        </div>
        <h1 className="text-2xl font-bold text-white">Available-to-Promise (ATP) Checker</h1>
        <p className="text-sm text-zinc-400">
          Pick an item, site, and delivery date to see ATP (On Hand − Reserved) plus incoming POs &amp; planned production.
        </p>
      </div>

      <Card className="p-5 bg-zinc-900 border-zinc-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Item</label>
          <select
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
          >
            {INITIAL_ATP_PROJECTIONS.map((p) => (
              <option key={p.itemId} value={p.itemId}>
                {p.itemName} ({p.sku})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Site</label>
          <input
            type="text"
            readOnly
            value={proj.siteName}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-300"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Promise Date</label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="p-4 bg-zinc-900 border-zinc-800">
          <div className="text-xs text-zinc-400">On Hand</div>
          <div className="text-2xl font-bold text-white font-mono mt-1">
            {proj.onHand} {proj.uom}
          </div>
        </Card>
        <Card className="p-4 bg-zinc-900 border-zinc-800">
          <div className="text-xs text-zinc-400">Reserved (Sales Orders)</div>
          <div className="text-2xl font-bold text-amber-400 font-mono mt-1">
            −{proj.reserved} {proj.uom}
          </div>
        </Card>
        <Card className="p-4 bg-emerald-950/30 border-emerald-500/40">
          <div className="text-xs text-emerald-300 font-semibold">Current ATP</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
            {currentAtp} {proj.uom}
          </div>
        </Card>
        <Card className="p-4 bg-zinc-900 border-zinc-800">
          <div className="text-xs text-zinc-400">Incoming POs</div>
          <div className="text-2xl font-bold text-indigo-400 font-mono mt-1">
            +{proj.incomingPoQty} {proj.uom}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">{proj.incomingPoRef}</div>
        </Card>
        <Card className="p-4 bg-zinc-900 border-zinc-800">
          <div className="text-xs text-zinc-400">Planned Production</div>
          <div className="text-2xl font-bold text-sky-400 font-mono mt-1">
            +{proj.plannedProductionQty} {proj.uom}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">{proj.plannedProductionRef}</div>
        </Card>
      </div>

      <Card className="p-5 bg-zinc-900 border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-xs text-zinc-400">Net Projected Available by {targetDate}</div>
          <div className="text-2xl font-bold text-white font-mono mt-0.5">
            {projectedAtp} {proj.uom}
          </div>
        </div>
        <Badge variant="success">Ready to Promise</Badge>
      </Card>
    </div>
  );
}

