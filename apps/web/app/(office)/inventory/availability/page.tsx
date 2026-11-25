'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Card, Badge } from '@neo/ui';
import { computeAtp } from '@neo/shared';

type AtpRow = {
  itemId: string;
  sku: string;
  itemName: string;
  uom: string;
  onHand: number;
  reserved: number;
  incomingPoQty: number;
  plannedProductionQty: number;
};

export default function CheckAvailabilityPage() {
  const [projections, setProjections] = useState<AtpRow[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [targetDate, setTargetDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/inventory/stock/current')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        const mapped: AtpRow[] = rows.map((r: any) => ({
          itemId: String(r.itemId || r.item_id || r.id),
          sku: String(r.sku || r.skuCode || r.sku_code || ''),
          itemName: String(r.itemName || r.item_name || 'Item'),
          uom: String(r.uom || 'kg'),
          onHand: Number(r.onHand ?? r.qtyOnHand ?? r.qty_on_hand ?? 0),
          reserved: Number(r.reserved ?? r.qtyCommitted ?? r.qty_committed ?? r.qty_reserved ?? 0),
          incomingPoQty: Number(r.incomingPoQty ?? 0),
          plannedProductionQty: Number(r.plannedProductionQty ?? 0),
        }));
        setProjections(mapped);
        if (mapped.length > 0) setSelectedItemId(mapped[0].itemId);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const proj = useMemo(
    () =>
      projections.find((p) => p.itemId === selectedItemId) ||
      projections[0] || {
        itemId: '',
        sku: '—',
        itemName: 'No items loaded',
        uom: 'kg',
        onHand: 0,
        reserved: 0,
        incomingPoQty: 0,
        plannedProductionQty: 0,
      },
    [projections, selectedItemId],
  );

  const currentAtp = computeAtp(proj.onHand, proj.reserved);
  const projectedAtp = currentAtp + proj.incomingPoQty + proj.plannedProductionQty;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
          <Link href="/inventory/stock" className="hover:text-ink">Inventory</Link>
          <span>/</span>
          <span className="text-haldi">Check Availability (ATP)</span>
        </div>
        <h1 className="text-2xl font-bold text-ink">Available-to-Promise (ATP) Checker</h1>
        <p className="text-sm text-ink-3">
          Pick an item, site, and delivery date to see ATP (On Hand − Reserved) plus incoming POs &amp; planned production.
        </p>
      </div>

      <Card className="p-5 bg-sheet border-rule grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-ink-3 mb-1">Item</label>
          <select
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
            className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
          >
            {projections.map((p) => (
              <option key={p.itemId} value={p.itemId}>
                {p.itemName} ({p.sku})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-3 mb-1">Site</label>
          <input
            type="text"
            readOnly
            value={(proj as any).siteName ?? 'Main Site'}
            className="w-full bg-paper border border-rule rounded-lg p-2.5 text-sm text-ink-2"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-3 mb-1">Promise Date</label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="p-4 bg-sheet border-rule">
          <div className="text-xs text-ink-3">On Hand</div>
          <div className="text-2xl font-bold text-ink font-mono mt-1">
            {proj.onHand} {proj.uom}
          </div>
        </Card>
        <Card className="p-4 bg-sheet border-rule">
          <div className="text-xs text-ink-3">Reserved (Sales Orders)</div>
          <div className="text-2xl font-bold text-haldi font-mono mt-1">
            −{proj.reserved} {proj.uom}
          </div>
        </Card>
        <Card className="p-4 bg-leaf-soft border-leaf/30">
          <div className="text-xs text-leaf font-semibold">Current ATP</div>
          <div className="text-2xl font-bold text-leaf font-mono mt-1">
            {currentAtp} {proj.uom}
          </div>
        </Card>
        <Card className="p-4 bg-sheet border-rule">
          <div className="text-xs text-ink-3">Incoming POs</div>
          <div className="text-2xl font-bold text-action font-mono mt-1">
            +{proj.incomingPoQty} {proj.uom}
          </div>
          <div className="text-[11px] text-ink-3 mt-1">{(proj as any).incomingPoRef ?? ''}</div>
        </Card>
        <Card className="p-4 bg-sheet border-rule">
          <div className="text-xs text-ink-3">Planned Production</div>
          <div className="text-2xl font-bold text-action font-mono mt-1">
            +{proj.plannedProductionQty} {proj.uom}
          </div>
          <div className="text-[11px] text-ink-3 mt-1">{(proj as any).plannedProductionRef ?? ''}</div>
        </Card>
      </div>

      <Card className="p-5 bg-sheet border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-xs text-ink-3">Net Projected Available by {targetDate}</div>
          <div className="text-2xl font-bold text-ink font-mono mt-0.5">
            {projectedAtp} {proj.uom}
          </div>
        </div>
        <Badge variant="success">Ready to Promise</Badge>
      </Card>
    </div>
  );
}

