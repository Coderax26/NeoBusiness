'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Card, Button } from '@neo/ui';
import { type StockAlertItem } from '../../../../src/lib/inventory-data';

export default function StockAlertsControlPage() {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [alerts, setAlerts] = useState<StockAlertItem[]>([]);

  useEffect(() => {
    fetch('/api/proxy/stock-alerts')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setAlerts(
          list.map((a: any, idx: number) => ({
            id: a.id ?? `sa-${idx}`,
            type: a.alertType ?? a.type ?? 'LOW_STOCK',
            severity: a.severity ?? 'HIGH',
            itemName: a.itemName ?? a.item_name ?? 'Item',
            siteName: a.siteName ?? a.site_name ?? 'Site',
            detail: a.detail ?? a.message ?? '',
          })),
        );
      })
      .catch(() => setAlerts([]));
  }, []);

  const counts = {
    LOW_STOCK: alerts.filter((a) => a.type === 'LOW_STOCK').length,
    EXPIRING: alerts.filter((a) => a.type === 'EXPIRING').length,
    NEGATIVE: alerts.filter((a) => a.type === 'NEGATIVE').length,
    DRIFT: alerts.filter((a) => a.type === 'DRIFT').length,
  };

  const visible = alerts.filter((a) =>
    filterType === 'ALL' ? true : a.type === filterType,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Stock Alerts Control Center</h1>
          <p className="text-sm text-ink-3">
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
            className={`text-left p-4 rounded-[3px] border transition-colors ${
              filterType === c.key
                ? 'bg-haldi-soft border-haldi/30'
                : 'bg-sheet border-rule hover:border-rule-strong'
            }`}
          >
            <div className="text-xs text-ink-3">{c.label}</div>
            <div className="text-2xl font-bold text-ink font-mono mt-1">{c.count}</div>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.map((alert) => (
          <Card
            key={alert.id}
            className="p-4 bg-sheet border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div>
              <div className="flex items-center gap-2">
                <Badge variant={alert.severity === 'HIGH' ? 'danger' : 'warning'}>
                  {alert.type.replace('_', ' ')}
                </Badge>
                <span className="text-xs text-ink-3">{alert.siteName}</span>
              </div>
              <div className="text-base font-semibold text-ink mt-1">{alert.itemName}</div>
              <div className="text-xs text-ink-3">{alert.detail}</div>
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

