'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Badge, Button, Card } from '@neo/ui';
import { classifyExpiryBucket } from '@neo/shared';
import { type StockRow } from '../../../../src/lib/inventory-data';

export default function ExpiryWatchlistPage() {
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [daysThreshold, setDaysThreshold] = useState(30);
  const [actionedIds, setActionedIds] = useState<Record<string, { label: string; isError?: boolean }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadBatches = () => {
    return fetch('/api/proxy/inventory/stock/current')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setStockRows(
          rows.map((r: any) => {
            const expiryDate = String(r.expiryDate ?? r.expiry_date ?? '').slice(0, 10);
            const computedDays = expiryDate
              ? Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86_400_000)
              : 999;
            return {
              ...r,
              id: String(r.id ?? r.batchId ?? r.itemId ?? ''),
              itemId: String(r.itemId ?? r.item_id ?? ''),
              sku: String(r.sku ?? r.skuCode ?? r.sku_code ?? ''),
              itemName: String(r.itemName ?? r.item_name ?? r.name ?? ''),
              category: (r.category ?? 'RAW_MATERIAL') as any,
              siteId: String(r.siteId ?? r.site_id ?? ''),
              siteName: String(r.siteName ?? r.site_name ?? ''),
              locationCode: String(r.locationCode ?? r.locationName ?? r.location_name ?? ''),
              batchNo: String(r.batchNo ?? r.batchNumber ?? r.batch_number ?? ''),
              onHand: Number(r.onHand ?? r.qtyOnHand ?? r.qty_on_hand ?? 0),
              reserved: Number(r.reserved ?? r.qtyCommitted ?? r.qty_committed ?? 0),
              minStock: Number(r.minStock ?? 0),
              uom: String(r.uom ?? 'kg'),
              altUomLabel: String(r.altUomLabel ?? ''),
              unitCost: Number(r.unitCost ?? r.unitCostInr ?? 0),
              daysToExpiry: r.daysToExpiry !== undefined ? Number(r.daysToExpiry) : computedDays,
              expiryDate,
            };
          }),
        );
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadBatches();
  }, []);

  const filteredBatches = useMemo(() => {
    return stockRows.filter((r) => r.daysToExpiry <= daysThreshold).sort(
      (a, b) => a.daysToExpiry - b.daysToExpiry,
    );
  }, [stockRows, daysThreshold]);

  const counts = useMemo(() => {
    const expired = filteredBatches.filter((b) => b.daysToExpiry <= 0).length;
    const le3 = filteredBatches.filter((b) => b.daysToExpiry > 0 && b.daysToExpiry <= 3).length;
    const le7 = filteredBatches.filter((b) => b.daysToExpiry > 3 && b.daysToExpiry <= 7).length;
    const le30 = filteredBatches.filter((b) => b.daysToExpiry > 7 && b.daysToExpiry <= 30).length;
    return { expired, le3, le7, le30 };
  }, [filteredBatches]);

  const handleAdjustmentAction = async (
    batch: StockRow,
    adjustmentType: 'EXPIRY_REMOVAL' | 'SHRINKAGE',
    label: string,
  ) => {
    const qtyToAdjust = Math.max(0, batch.onHand - batch.reserved);
    if (qtyToAdjust <= 0 || !batch.siteId || !batch.itemId) {
      setActionedIds((prev) => ({
        ...prev,
        [batch.id]: { label: 'No unreserved stock left to adjust', isError: true },
      }));
      return;
    }
    try {
      setBusyId(batch.id);
      const res = await fetch('/api/proxy/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: batch.siteId,
          itemId: batch.itemId,
          batchId: batch.id,
          adjustmentType,
          qty: String(qtyToAdjust),
          remarks: `${label} for batch ${batch.batchNo}`,
        }),
      });
      const err = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadBatches();
      setActionedIds((prev) => ({
        ...prev,
        [batch.id]: { label: `${label} submitted (${qtyToAdjust} ${batch.uom})` },
      }));
    } catch (err) {
      setActionedIds((prev) => ({
        ...prev,
        [batch.id]: { label: `Error: ${(err as Error).message}`, isError: true },
      }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/inventory/stock" className="hover:text-ink">Inventory</Link>
            <span>/</span>
            <span className="text-haldi">Batches &amp; Expiry Watchlist</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Expiry Watchlist &amp; FEFO Actions</h1>
          <p className="text-sm text-ink-3">
            Grouped by urgency with suggested actions: Sell first, Discount, or Write off.
          </p>
        </div>
      </div>

      {/* Threshold Slider */}
      <Card className="p-4 bg-sheet border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-ink-2 font-medium">Expiry Horizon Threshold</span>
            <span className="font-mono text-haldi font-bold" data-testid="threshold-value">
              ≤ {daysThreshold} days ({filteredBatches.length} batches)
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={60}
            value={daysThreshold}
            onChange={(e) => setDaysThreshold(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
        </div>
      </Card>

      {/* Summary Buckets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 bg-madder-soft border-madder/30">
          <div className="text-xs text-madder">Expired</div>
          <div className="text-2xl font-bold text-madder font-mono mt-1">{counts.expired}</div>
        </Card>
        <Card className="p-4 bg-madder-soft border-madder/30">
          <div className="text-xs text-madder">≤ 3 Days (Urgent)</div>
          <div className="text-2xl font-bold text-madder font-mono mt-1">{counts.le3}</div>
        </Card>
        <Card className="p-4 bg-haldi-soft border-haldi/30">
          <div className="text-xs text-haldi">≤ 7 Days (Warning)</div>
          <div className="text-2xl font-bold text-haldi font-mono mt-1">{counts.le7}</div>
        </Card>
        <Card className="p-4 bg-leaf-soft border-leaf/30">
          <div className="text-xs text-leaf">≤ 30 Days</div>
          <div className="text-2xl font-bold text-leaf font-mono mt-1">{counts.le30}</div>
        </Card>
      </div>

      {/* Watchlist Cards */}
      <div className="space-y-3">
        {filteredBatches.map((batch) => {
          const cls = classifyExpiryBucket(batch.daysToExpiry);
          const doneAction = actionedIds[batch.id];
          return (
            <Card
              key={batch.id}
              className="p-4 bg-sheet border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-haldi font-bold">{batch.batchNo}</span>
                  <Badge variant={cls.color === 'rose' ? 'danger' : cls.color === 'amber' ? 'warning' : 'success'}>
                    {cls.label} ({batch.daysToExpiry}d)
                  </Badge>
                </div>
                <div className="text-base font-semibold text-ink mt-1">{batch.itemName}</div>
                <div className="text-xs text-ink-3">
                  {batch.siteName} ({batch.locationCode}) · {batch.onHand} {batch.uom} · Exp {batch.expiryDate}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {doneAction ? (
                  <Badge variant={doneAction.isError ? 'danger' : 'info'}>
                    {doneAction.label}
                  </Badge>
                ) : (
                  <>
                    <Link href={`/sales/prices?itemId=${encodeURIComponent(batch.itemId)}`}>
                      <Button variant="secondary">Clearance Price</Button>
                    </Link>
                    <Button
                      variant="secondary"
                      disabled={busyId === batch.id}
                      onClick={() => handleAdjustmentAction(batch, 'SHRINKAGE', 'Shrinkage / Quarantine')}
                    >
                      Shrinkage
                    </Button>
                    <Button
                      variant="primary"
                      disabled={busyId === batch.id}
                      onClick={() => handleAdjustmentAction(batch, 'EXPIRY_REMOVAL', 'Expiry Write-off')}
                    >
                      Write Off
                    </Button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

