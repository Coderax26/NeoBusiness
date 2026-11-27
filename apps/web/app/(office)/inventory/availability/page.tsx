'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Card, Badge } from '@neo/ui';
import { computeAtp } from '@neo/shared';

type CatalogItem = {
  itemId: string;
  sku: string;
  itemName: string;
  uom: string;
};

export default function CheckAvailabilityPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [targetDate, setTargetDate] = useState(new Date().toISOString().slice(0, 10));
  const [projData, setProjData] = useState({
    onHand: 0,
    reserved: 0,
    incomingPoQty: 0,
    plannedProductionQty: 0,
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/proxy/items').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/sites').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([itmRes, siteRes, meRes]) => {
        if (!active) return;
        const iRows = Array.isArray(itmRes) ? itmRes : Array.isArray(itmRes?.data) ? itmRes.data : [];
        const sRows = Array.isArray(siteRes) ? siteRes : Array.isArray(siteRes?.data) ? siteRes.data : [];

        const mappedItems: CatalogItem[] = iRows.map((i: any) => ({
          itemId: String(i.id),
          sku: String(i.sku_code ?? i.skuCode ?? ''),
          itemName: String(i.name ?? 'Item'),
          uom: String(i.primary_uom ?? i.primaryUom ?? 'KG'),
        }));
        setItems(mappedItems);
        if (mappedItems.length > 0) setSelectedItemId(mappedItems[0].itemId);

        const mappedSites = sRows.map((s: any) => ({ id: String(s.id), name: String(s.name ?? 'Site') }));
        setSites(mappedSites);
        const preferred = meRes?.user?.activeSiteId || mappedSites[0]?.id || '';
        if (preferred) setSelectedSiteId(String(preferred));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedItemId) return;
    let active = true;
    const params = new URLSearchParams({ itemId: selectedItemId });
    if (selectedSiteId) params.set('siteId', selectedSiteId);
    fetch(`/api/proxy/inventory/stock/projection?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((proj) => {
        if (!active || !proj) return;
        const d = proj?.data ?? proj;
        setProjData({
          onHand: Number(d.onHandQty ?? 0),
          reserved: Number(d.reservedQty ?? 0),
          incomingPoQty: Number(d.incomingPoQty ?? 0),
          plannedProductionQty: Number(d.plannedWoQty ?? 0),
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedItemId, selectedSiteId]);

  const currentItem = useMemo(
    () =>
      items.find((i) => i.itemId === selectedItemId) || {
        itemId: '',
        sku: '—',
        itemName: 'No items loaded',
        uom: 'KG',
      },
    [items, selectedItemId],
  );

  const currentAtp = computeAtp(projData.onHand, projData.reserved);
  const projectedAtp = currentAtp + projData.incomingPoQty + projData.plannedProductionQty;

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
          Pick any item and site to see live On Hand − Reserved (ATP) plus incoming POs &amp; planned production.
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
            {items.map((p) => (
              <option key={p.itemId} value={p.itemId}>
                {p.itemName} ({p.sku})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-3 mb-1">Site</label>
          <select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
          >
            <option value="">All Sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
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
            {projData.onHand} {currentItem.uom}
          </div>
        </Card>
        <Card className="p-4 bg-sheet border-rule">
          <div className="text-xs text-ink-3">Reserved (Sales Orders)</div>
          <div className="text-2xl font-bold text-haldi font-mono mt-1">
            −{projData.reserved} {currentItem.uom}
          </div>
        </Card>
        <Card className="p-4 bg-leaf-soft border-leaf/30">
          <div className="text-xs text-leaf font-semibold">Current ATP</div>
          <div className="text-2xl font-bold text-leaf font-mono mt-1">
            {currentAtp} {currentItem.uom}
          </div>
        </Card>
        <Card className="p-4 bg-sheet border-rule">
          <div className="text-xs text-ink-3">Incoming POs</div>
          <div className="text-2xl font-bold text-action font-mono mt-1">
            +{projData.incomingPoQty} {currentItem.uom}
          </div>
        </Card>
        <Card className="p-4 bg-sheet border-rule">
          <div className="text-xs text-ink-3">Planned Production</div>
          <div className="text-2xl font-bold text-action font-mono mt-1">
            +{projData.plannedProductionQty} {currentItem.uom}
          </div>
        </Card>
      </div>

      <Card className="p-5 bg-sheet border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-xs text-ink-3">Net Projected Available by {targetDate}</div>
          <div className="text-2xl font-bold text-ink font-mono mt-0.5">
            {projectedAtp} {currentItem.uom}
          </div>
        </div>
        <Badge variant={projectedAtp > 0 ? 'success' : 'warning'}>
          {projectedAtp > 0 ? 'Ready to Promise' : 'Zero Stock / Need Supply'}
        </Badge>
      </Card>
    </div>
  );
}
