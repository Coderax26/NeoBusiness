'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { KpiCard, Badge, Button, Card, Dialog } from '@neo/ui';
import {
  formatINR,
  computeAtp,
  classifyExpiryBucket,
  canViewMarginAndCost,
  type SessionUser,
} from '@neo/shared';
import {
  type StockRow,
  type LedgerEntry,
} from '../../../../src/lib/inventory-data';

type StockViewMode = 'BY_ITEM' | 'BY_SITE' | 'BY_BATCH';

export default function StockOverviewPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [viewMode, setViewMode] = useState<StockViewMode>('BY_ITEM');
  const [search, setSearch] = useState('');
  const [drillItemId, setDrillItemId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.user) setUser(d.user);
      })
      .catch(() => {});

    Promise.all([
      fetch('/api/proxy/inventory/stock/current').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/inventory/ledger').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([stkRes, ledRes]) => {
        if (!active) return;
        const sRows = Array.isArray(stkRes) ? stkRes : Array.isArray(stkRes?.data) ? stkRes.data : [];
        const lRows = Array.isArray(ledRes) ? ledRes : Array.isArray(ledRes?.data) ? ledRes.data : [];
        setRows(
          sRows.map((r: any) => {
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
              category: (r.category ?? r.itemCategory ?? 'RAW_MATERIAL') as any,
              siteId: String(r.siteId ?? r.site_id ?? ''),
              siteName: String(r.siteName ?? r.site_name ?? ''),
              locationCode: String(r.locationCode ?? r.locationName ?? r.location_name ?? ''),
              batchNo: String(r.batchNo ?? r.batchNumber ?? r.batch_number ?? ''),
              onHand: Number(r.onHand ?? r.qtyOnHand ?? r.qty_on_hand ?? 0),
              reserved: Number(r.reserved ?? r.qtyCommitted ?? r.qty_committed ?? 0),
              minStock: Number(r.minStock ?? r.min_stock_qty ?? 0),
              uom: String(r.uom ?? 'kg'),
              altUomLabel: String(r.altUomLabel ?? ''),
              unitCost: Number(r.unitCost ?? r.unitCostInr ?? r.landedCostPerUnit ?? r.cost_per_unit ?? 0),
              daysToExpiry: r.daysToExpiry !== undefined ? Number(r.daysToExpiry) : computedDays,
              expiryDate,
            };
          }),
        );
        setLedgerEntries(lRows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const showValuation = !user || canViewMarginAndCost(user.role);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.itemName.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.siteName.toLowerCase().includes(q) ||
        r.batchNo.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const itemGrouped = useMemo(() => {
    const map = new Map<
      string,
      {
        itemId: string;
        sku: string;
        itemName: string;
        uom: string;
        onHand: number;
        reserved: number;
        minStock: number;
        nearestExpiryDays: number;
        totalValue: number;
        sitesCount: number;
      }
    >();
    for (const r of filteredRows) {
      const existing = map.get(r.itemId);
      if (existing) {
        existing.onHand += r.onHand;
        existing.reserved += r.reserved;
        existing.nearestExpiryDays = Math.min(existing.nearestExpiryDays, r.daysToExpiry);
        existing.totalValue += r.onHand * r.unitCost;
        existing.sitesCount += 1;
      } else {
        map.set(r.itemId, {
          itemId: r.itemId,
          sku: r.sku,
          itemName: r.itemName,
          uom: r.uom,
          onHand: r.onHand,
          reserved: r.reserved,
          minStock: r.minStock,
          nearestExpiryDays: r.daysToExpiry,
          totalValue: r.onHand * r.unitCost,
          sitesCount: 1,
        });
      }
    }
    return Array.from(map.values());
  }, [filteredRows]);

  const totalStockValue = rows.reduce((s, r) => s + r.onHand * r.unitCost, 0);
  const lowStockCount = rows.filter((r) => r.onHand < r.minStock).length;
  const expiring7Count = rows.filter((r) => r.daysToExpiry <= 7).length;

  const drillBatches = useMemo(() => {
    if (!drillItemId) return [];
    return rows
      .filter((r) => r.itemId === drillItemId)
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry);
  }, [rows, drillItemId]);

  const drillMovements = useMemo(() => {
    if (!drillItemId) return [];
    return ledgerEntries.filter((l) => l.itemId === drillItemId);
  }, [drillItemId, ledgerEntries]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Stock Overview</h1>
          <p className="text-sm text-ink-3">
            Live warehouse stock with dual UoM, ATP (On Hand − Reserved), FEFO expiry heat, and batch drill-down.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            Print Stock Sheet
          </Button>
          <Link href="/inventory/transfers">
            <Button variant="secondary">Transfer Stock</Button>
          </Link>
          <Link href="/inventory/adjustments">
            <Button variant="primary">+ Request Adjustment</Button>
          </Link>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {showValuation && (
          <KpiCard
            title="Total Stock Value"
            value={formatINR(totalStockValue)}
            subtitle="Owner-only valuation"
            trend={{ value: `Across ${new Set(rows.map((r) => r.siteName).filter(Boolean)).size} sites`, direction: 'up' }}
          />
        )}
        <KpiCard
          title="Items Low on Stock"
          value={String(lowStockCount)}
          subtitle="Below safety min stock"
          trend={{ value: 'Reorder needed', direction: 'down' }}
        />
        <KpiCard
          title="Expiring in ≤ 7 Days"
          value={String(expiring7Count)}
          subtitle="Includes expired quarantine"
          trend={{ value: 'FEFO priority', direction: 'down' }}
        />
        <KpiCard
          title="Drift / Negative Alerts"
          value={String(rows.filter((r) => Number(r.onHand ?? 0) < 0).length)}
          subtitle="Cycle count variance"
          trend={{ value: 'View alerts', direction: 'down' }}
        />
      </div>

      {/* View Switcher + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-sheet border border-rule rounded-[3px] p-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { key: 'BY_ITEM', label: 'By Item (All Sites)' },
              { key: 'BY_SITE', label: 'By Site / Location' },
              { key: 'BY_BATCH', label: 'By Batch (FEFO)' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setViewMode(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                viewMode === tab.key
                  ? 'bg-haldi text-white'
                  : 'bg-sunken text-ink-3 hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search item, SKU, site, or batch..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-paper border border-rule-strong rounded-lg px-3 py-1.5 text-xs text-ink w-full sm:w-64"
        />
      </div>

      {/* Stock Table */}
      <div className="bg-sheet border border-rule rounded-[3px] overflow-hidden">
        <div className="overflow-x-auto">
          {viewMode === 'BY_ITEM' ? (
            <table className="w-full text-left text-sm">
              <thead className="bg-paper border-b border-rule text-xs uppercase text-ink-3">
                <tr>
                  <th className="p-3">Item</th>
                  <th className="p-3 text-right">On Hand</th>
                  <th className="p-3 text-right">Reserved</th>
                  <th className="p-3 text-right">Available (ATP)</th>
                  <th className="p-3">vs Min Stock</th>
                  <th className="p-3">Nearest Expiry</th>
                  <th className="p-3 text-right">Drill-Down</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {itemGrouped.map((item) => {
                  const atp = computeAtp(item.onHand, item.reserved);
                  const exp = classifyExpiryBucket(item.nearestExpiryDays);
                  const ratio = Math.min(100, Math.round((item.onHand / Math.max(1, item.minStock)) * 100));
                  const isLow = item.onHand < item.minStock;
                  return (
                    <tr key={item.itemId} className="hover:bg-sunken">
                      <td className="p-3">
                        <div className="text-ink font-medium">{item.itemName}</div>
                        <div className="text-[11px] font-mono text-ink-3">
                          {item.sku} · {item.sitesCount} location(s)
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono text-ink">
                        {item.onHand} {item.uom}
                      </td>
                      <td className="p-3 text-right font-mono text-haldi">
                        {item.reserved} {item.uom}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-leaf">
                        {atp} {item.uom}
                      </td>
                      <td className="p-3 w-40">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-sunken rounded-full overflow-hidden">
                            <div
                              className={`h-full ${isLow ? 'bg-rose-500' : 'bg-emerald-500'}`}
                              style={{ width: `${ratio}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono text-ink-3">
                            {isLow ? 'Low' : 'OK'}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant={exp.color === 'rose' ? 'danger' : exp.color === 'amber' ? 'warning' : 'success'}>
                          {exp.label} ({item.nearestExpiryDays}d)
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setDrillItemId(item.itemId)}
                          className="text-xs text-haldi hover:text-haldi font-medium"
                        >
                          Batches &amp; Ledger →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-paper border-b border-rule text-xs uppercase text-ink-3">
                <tr>
                  <th className="p-3">Item</th>
                  <th className="p-3">Site / Location</th>
                  {viewMode === 'BY_BATCH' && <th className="p-3">Batch</th>}
                  <th className="p-3 text-right">On Hand (Dual UoM)</th>
                  <th className="p-3 text-right">Reserved</th>
                  <th className="p-3 text-right">ATP</th>
                  <th className="p-3">Expiry</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {filteredRows.map((r) => {
                  const atp = computeAtp(r.onHand, r.reserved);
                  const exp = classifyExpiryBucket(r.daysToExpiry);
                  return (
                    <tr key={r.id} className="hover:bg-sunken">
                      <td className="p-3">
                        <div className="text-ink font-medium">{r.itemName}</div>
                        <div className="text-[11px] font-mono text-ink-3">{r.sku}</div>
                      </td>
                      <td className="p-3 text-xs text-ink-2">
                        <div>{r.siteName}</div>
                        <div className="font-mono text-ink-3">{r.locationCode}</div>
                      </td>
                      {viewMode === 'BY_BATCH' && (
                        <td className="p-3 font-mono text-xs text-haldi">{r.batchNo}</td>
                      )}
                      <td className="p-3 text-right">
                        <div className="font-mono text-ink">
                          {r.onHand} {r.uom}
                        </div>
                        <div className="text-[11px] text-ink-3">{r.altUomLabel}</div>
                      </td>
                      <td className="p-3 text-right font-mono text-haldi">
                        {r.reserved} {r.uom}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-leaf">
                        {atp} {r.uom}
                      </td>
                      <td className="p-3">
                        <Badge variant={exp.color === 'rose' ? 'danger' : exp.color === 'amber' ? 'warning' : 'success'}>
                          {r.expiryDate} ({exp.label})
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setDrillItemId(r.itemId)}
                          className="text-xs text-haldi hover:text-haldi font-medium"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Drill-down Dialog: FEFO Batches + Recent Movements */}
      <Dialog
        open={!!drillItemId}
        onClose={() => setDrillItemId(null)}
        title={`FEFO Batches & Movements — ${drillBatches[0]?.itemName ?? ''}`}
      >
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-semibold uppercase text-ink-3 mb-2">
              Batches (Ordered by Earliest Expiry / FEFO)
            </h4>
            <div className="space-y-2">
              {drillBatches.map((b) => (
                <div
                  key={b.id}
                  className="p-2.5 rounded-lg bg-paper border border-rule flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-mono text-haldi font-bold mr-2">{b.batchNo}</span>
                    <span className="text-ink-2">{b.siteName} ({b.locationCode})</span>
                  </div>
                  <div className="font-mono text-right">
                    <span className="text-leaf font-bold">
                      ATP {computeAtp(b.onHand, b.reserved)} {b.uom}
                    </span>
                    <span className="text-ink-3 ml-2">Exp {b.expiryDate}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase text-ink-3 mb-2">
              Recent Ledger Movements
            </h4>
            {drillMovements.length === 0 ? (
              <p className="text-xs text-ink-3">No recent ledger entries for this item.</p>
            ) : (
              <div className="space-y-1.5">
                {drillMovements.map((m) => (
                  <div
                    key={m.id}
                    className="p-2 rounded bg-paper border border-rule flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono text-action mr-2">{m.type}</span>
                      <span className="text-ink-2">{m.refNo}</span>
                    </div>
                    <span
                      className={`font-mono font-bold ${
                        m.qtyDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta} {m.uom}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
}

