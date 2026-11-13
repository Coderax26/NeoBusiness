'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Badge, Button, Card } from '@neo/ui';
import { classifyExpiryBucket } from '@neo/shared';
import { INITIAL_STOCK_ROWS } from '../../../src/lib/inventory-data';

export default function ExpiryWatchlistPage() {
  const [daysThreshold, setDaysThreshold] = useState(30);
  const [actionedIds, setActionedIds] = useState<Record<string, string>>({});

  const filteredBatches = useMemo(() => {
    return INITIAL_STOCK_ROWS.filter((r) => r.daysToExpiry <= daysThreshold).sort(
      (a, b) => a.daysToExpiry - b.daysToExpiry,
    );
  }, [daysThreshold]);

  const counts = useMemo(() => {
    const expired = filteredBatches.filter((b) => b.daysToExpiry <= 0).length;
    const le3 = filteredBatches.filter((b) => b.daysToExpiry > 0 && b.daysToExpiry <= 3).length;
    const le7 = filteredBatches.filter((b) => b.daysToExpiry > 3 && b.daysToExpiry <= 7).length;
    const le30 = filteredBatches.filter((b) => b.daysToExpiry > 7 && b.daysToExpiry <= 30).length;
    return { expired, le3, le7, le30 };
  }, [filteredBatches]);

  const handleAction = (id: string, action: string) => {
    setActionedIds((prev) => ({ ...prev, [id]: action }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
            <Link href="/inventory/stock" className="hover:text-white">Inventory</Link>
            <span>/</span>
            <span className="text-amber-400">Batches &amp; Expiry Watchlist</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Expiry Watchlist &amp; FEFO Actions</h1>
          <p className="text-sm text-zinc-400">
            Grouped by urgency with suggested actions: Sell first, Discount, or Write off.
          </p>
        </div>
      </div>

      {/* Threshold Slider */}
      <Card className="p-4 bg-zinc-900 border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-zinc-300 font-medium">Expiry Horizon Threshold</span>
            <span className="font-mono text-amber-400 font-bold" data-testid="threshold-value">
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
        <Card className="p-4 bg-rose-950/30 border-rose-500/40">
          <div className="text-xs text-rose-300">Expired</div>
          <div className="text-2xl font-bold text-rose-400 font-mono mt-1">{counts.expired}</div>
        </Card>
        <Card className="p-4 bg-rose-950/20 border-rose-500/30">
          <div className="text-xs text-rose-200">≤ 3 Days (Urgent)</div>
          <div className="text-2xl font-bold text-rose-300 font-mono mt-1">{counts.le3}</div>
        </Card>
        <Card className="p-4 bg-amber-950/20 border-amber-500/30">
          <div className="text-xs text-amber-200">≤ 7 Days (Warning)</div>
          <div className="text-2xl font-bold text-amber-300 font-mono mt-1">{counts.le7}</div>
        </Card>
        <Card className="p-4 bg-emerald-950/20 border-emerald-500/30">
          <div className="text-xs text-emerald-200">≤ 30 Days</div>
          <div className="text-2xl font-bold text-emerald-300 font-mono mt-1">{counts.le30}</div>
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
              className="p-4 bg-zinc-900 border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-amber-400 font-bold">{batch.batchNo}</span>
                  <Badge variant={cls.color === 'rose' ? 'danger' : cls.color === 'amber' ? 'warning' : 'success'}>
                    {cls.label} ({batch.daysToExpiry}d)
                  </Badge>
                </div>
                <div className="text-base font-semibold text-white mt-1">{batch.itemName}</div>
                <div className="text-xs text-zinc-400">
                  {batch.siteName} ({batch.locationCode}) · {batch.onHand} {batch.uom} · Exp {batch.expiryDate}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {doneAction ? (
                  <Badge variant="info">Action queued: {doneAction}</Badge>
                ) : (
                  <>
                    <Button variant="secondary" onClick={() => handleAction(batch.id, 'Sell first')}>
                      Sell First
                    </Button>
                    <Button variant="secondary" onClick={() => handleAction(batch.id, 'Discount')}>
                      Discount
                    </Button>
                    <Button variant="primary" onClick={() => handleAction(batch.id, 'Write off')}>
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

