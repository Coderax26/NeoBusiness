'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  const [openingOpen, setOpeningOpen] = useState(false);
  const [catalogItems, setCatalogItems] = useState<Array<{ id: string; name: string; skuCode: string; uom: string }>>([]);
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [opSiteId, setOpSiteId] = useState('');
  const [opItemId, setOpItemId] = useState('');
  const [opQty, setOpQty] = useState('100');
  const [opUnitCost, setOpUnitCost] = useState('0');
  const [opBatchNo, setOpBatchNo] = useState('');
  const [opExpiry, setOpExpiry] = useState('');
  const [opNotes, setOpNotes] = useState('Opening stock balance');
  const [opBusy, setOpBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; isError?: boolean } | null>(null);

  const loadStockAndLedger = useCallback(async () => {
    const [stkRes, ledRes] = await Promise.all([
      fetch('/api/proxy/inventory/stock/current').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/inventory/ledger').then((r) => (r.ok ? r.json() : [])),
    ]);
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
    setLedgerEntries(
      lRows.map((l: any) => {
        const txn = String(l.txnType ?? l.txn_type ?? l.type ?? 'ADJUSTMENT').toUpperCase();
        const rawQty = Number(l.qtyDelta ?? l.qty ?? 0);
        const isOutflow = ['SALE_DISPATCH', 'TRANSFER_OUT', 'ADJUSTMENT', 'WRITEOFF', 'EXPIRY_REMOVAL', 'SHRINKAGE', 'PROD_CONSUME', 'COUNT_DEFICIT'].includes(txn);
        return {
          id: String(l.id),
          timestamp: String(l.postedAt ?? l.posted_at ?? l.timestamp ?? '').slice(0, 19).replace('T', ' '),
          itemId: String(l.itemId ?? l.item_id ?? ''),
          itemName: String(l.itemName ?? l.item_name ?? ''),
          batchNo: String(l.batchNumber ?? l.batchNo ?? ''),
          siteName: String(l.siteName ?? ''),
          type: txn as any,
          qtyDelta: l.qtyDelta !== undefined ? rawQty : (isOutflow ? -Math.abs(rawQty) : Math.abs(rawQty)),
          runningBalance: 0,
          uom: String(l.uom ?? 'KG'),
          refNo: String(l.referenceNo ?? l.reference_no ?? l.refNo ?? '—'),
        };
      }),
    );
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d?.user) return;
        setUser(d.user);
        const fallbackSite = d.user.activeSiteId || d.user.sites?.[0]?.id;
        if (fallbackSite) setOpSiteId((prev) => prev || String(fallbackSite));
      })
      .catch(() => {});

    fetch('/api/proxy/items')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        const mapped = list.map((i: any) => ({
          id: String(i.id),
          name: String(i.name ?? 'Item'),
          skuCode: String(i.sku_code ?? i.skuCode ?? ''),
          uom: String(i.primary_uom ?? i.primaryUom ?? 'KG'),
        }));
        setCatalogItems(mapped);
        if (mapped.length > 0) setOpItemId((prev) => prev || mapped[0].id);
      })
      .catch(() => {});

    fetch('/api/proxy/sites')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        const mapped = list.map((s: any) => ({ id: String(s.id), name: String(s.name ?? 'Site') }));
        setSites(mapped);
        if (mapped.length > 0) setOpSiteId((prev) => prev || mapped[0].id);
      })
      .catch(() => {});

    loadStockAndLedger().catch(() => {});
    return () => {
      active = false;
    };
  }, [loadStockAndLedger]);

  const handlePostOpeningStock = async () => {
    if (!opSiteId || !opItemId || Number(opQty) <= 0) {
      setToast({ msg: 'Select site, item, and enter a positive opening quantity.', isError: true });
      return;
    }
    const item = catalogItems.find((i) => i.id === opItemId);
    try {
      setOpBusy(true);
      const res = await fetch('/api/proxy/inventory/opening-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: opSiteId,
          notes: opNotes || 'Opening stock entry',
          lines: [
            {
              itemId: opItemId,
              qty: String(Number(opQty)),
              unitCost: opUnitCost ? String(Number(opUnitCost)) : undefined,
              batchNumber: opBatchNo.trim() || undefined,
              expiryDate: opExpiry || undefined,
              uom: item?.uom || 'KG',
            },
          ],
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || payload?.error?.message || `HTTP ${res.status}`);
      }
      await loadStockAndLedger();
      setOpeningOpen(false);
      setOpBatchNo('');
      setToast({ msg: `Added ${opQty} ${item?.uom || 'KG'} opening stock for ${item?.name || 'item'}.` });
    } catch (err) {
      setToast({ msg: `Failed to add opening stock: ${(err as Error).message}`, isError: true });
    } finally {
      setOpBusy(false);
    }
  };

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

  const siteGrouped = useMemo(() => {
    const map = new Map<string, StockRow>();
    for (const r of filteredRows) {
      const key = `${r.itemId}::${r.siteId}`;
      const existing = map.get(key);
      if (existing) {
        existing.onHand += r.onHand;
        existing.reserved += r.reserved;
        existing.daysToExpiry = Math.min(existing.daysToExpiry, r.daysToExpiry);
      } else {
        map.set(key, { ...r, id: key });
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
          <Button variant="secondary" onClick={() => setOpeningOpen(true)}>
            + Add Opening Stock
          </Button>
          <Link href="/inventory/transfers">
            <Button variant="secondary">Transfer Stock</Button>
          </Link>
          <Link href="/inventory/adjustments">
            <Button variant="primary">+ Request Adjustment</Button>
          </Link>
        </div>
      </div>

      {toast && (
        <div
          className={`p-3 rounded-lg border text-sm ${
            toast.isError
              ? 'bg-madder-soft border-madder/30 text-madder'
              : 'bg-leaf-soft border-leaf/30 text-leaf'
          }`}
        >
          {toast.msg}
        </div>
      )}

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
                {(viewMode === 'BY_SITE' ? siteGrouped : filteredRows).map((r) => {
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
      {/* Opening Stock Dialog */}
      <Dialog open={openingOpen} onClose={() => setOpeningOpen(false)} title="Add Opening / Initial Stock">
        <div className="space-y-4">
          <p className="text-xs text-ink-3">
            Use this to load initial physical quantities into a site when starting with zero stock.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-3 mb-1">Site / Warehouse</label>
              <select
                value={opSiteId}
                onChange={(e) => setOpSiteId(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Item</label>
              <select
                value={opItemId}
                onChange={(e) => setOpItemId(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              >
                {catalogItems.map((i) => (
                  <option key={i.id} value={i.id}>{i.name} ({i.skuCode} · {i.uom})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-ink-3 mb-1">Opening Qty</label>
              <input
                type="number"
                step="0.001"
                value={opQty}
                onChange={(e) => setOpQty(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm font-mono text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Unit Cost (₹)</label>
              <input
                type="number"
                step="0.01"
                value={opUnitCost}
                onChange={(e) => setOpUnitCost(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm font-mono text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Batch # (Optional)</label>
              <input
                type="text"
                placeholder="Auto"
                value={opBatchNo}
                onChange={(e) => setOpBatchNo(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm font-mono text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Expiry Date (Opt.)</label>
              <input
                type="date"
                value={opExpiry}
                onChange={(e) => setOpExpiry(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-3 mb-1">Notes</label>
            <input
              type="text"
              value={opNotes}
              onChange={(e) => setOpNotes(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpeningOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={opBusy} onClick={handlePostOpeningStock}>
              Save Opening Stock
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

