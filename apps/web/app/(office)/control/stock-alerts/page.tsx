'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Badge, Card, Button } from '@neo/ui';
import { INITIAL_STOCK_ALERTS } from '../../../src/lib/inventory-data';

export default function StockAlertsControlPage() {
  const [filterType, setFilterType] = useState<string>('ALL');

  const counts = {
    LOW_STOCK: INITIAL_STOCK_ALERTS.filter((a) => a.type === 'LOW_STOCK').length,
    EXPIRING: INITIAL_STOCK_ALERTS.filter((a) => a.type === 'EXPIRING').length,
    NEGATIVE: INITIAL_STOCK_ALERTS.filter((a) => a.type === 'NEGATIVE').length,
    DRIFT: INITIAL_STOCK_ALERTS.filter((a) => a.type === 'DRIFT').length,
  };

  const visible = INITIAL_STOCK_ALERTS.filter((a) =>
    filterType === 'ALL' ? true : a.type === filterType,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Stock Alerts Control Center</h1>
          <p className="text-sm text-zinc-400">
            Low stock, expiring batches, negative balances, and cycle-count drift alerts.
          </p>
        </div>
        <Link href="/inventory/stock">
          <Button variant="secondary">Open Stock Overview →</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(
          [
            { key: 'LOW_STOCK', label: 'Low Stock', count: counts.LOW_STOCK },
            { key: 'EXPIRING', label: 'Expiring / Expired', count: counts.EXPIRING },
            { key: 'NEGATIVE', label: 'Negative Stock', count: counts.NEGATIVE },
            { key: 'DRIFT', label: 'Count Drift', count: counts.DRIFT },
          ] as const
        ).map((c) => (
          <button
            key={c.key}
            onClick={() => setFilterType(filterType === c.key ? 'ALL' : c.key)}
            className={`text-left p-4 rounded-xl border transition-colors ${
              filterType === c.key
                ? 'bg-amber-500/15 border-amber-500'
                : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className="text-xs text-zinc-400">{c.label}</div>
            <div className="text-2xl font-bold text-white font-mono mt-1">{c.count}</div>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.map((alert) => (
          <Card
            key={alert.id}
            className="p-4 bg-zinc-900 border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div>
              <div className="flex items-center gap-2">
                <Badge variant={alert.severity === 'HIGH' ? 'danger' : 'warning'}>
                  {alert.type.replace('_', ' ')}
                </Badge>
                <span className="text-xs text-zinc-400">{alert.siteName}</span>
              </div>
              <div className="text-base font-semibold text-white mt-1">{alert.itemName}</div>
              <div className="text-xs text-zinc-400">{alert.detail}</div>
            </div>
            <Link
              href={
                alert.type === 'EXPIRING'
                  ? '/inventory/expiry'
                  : alert.type === 'LOW_STOCK'
                    ? '/procurement/requisitions'
                    : '/inventory/stock-counts'
              }
            >
              <Button variant="secondary">Resolve →</Button>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}

