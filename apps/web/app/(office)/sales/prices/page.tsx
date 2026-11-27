'use client';

import React, { useState, useEffect } from 'react';
import { Button, Badge, Dialog, KpiCard } from '@neo/ui';
import {
  calculateAutoFloorPrice,
  canViewMarginAndCost,
  formatINR,
  type SessionUser,
} from '@neo/shared';
import { type DailyPriceRow } from '../../../../src/lib/sales-data';

export default function TodaysPricesPage() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [rows, setRows] = useState<DailyPriceRow[]>([]);
  const [initialRows, setInitialRows] = useState<DailyPriceRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [missingOnly, setMissingOnly] = useState(false);
  const [openQuotesCount, setOpenQuotesCount] = useState<number>(0);

  // Dialog states
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [sharePreviewOpen, setSharePreviewOpen] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});

    fetch('/api/proxy/quotes')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
        setOpenQuotesCount(list.filter((q: any) => q.status === 'OPEN' || q.status === 'DRAFT' || q.status === 'SENT').length);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`/api/proxy/prices/${encodeURIComponent(selectedDate)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !Array.isArray(data)) return;
        const mapped: DailyPriceRow[] = data.map((r: any) => ({
          itemId: String(r.itemId),
          sku: String(r.skuCode || ''),
          itemName: String(r.itemName || ''),
          category:
            r.itemCategory === 'RAW_MATERIAL' ||
            r.itemCategory === 'PROCESSED_FG' ||
            r.itemCategory === 'TRADED_GOOD'
              ? r.itemCategory
              : 'PROCESSED_FG',
          uom: String(r.primaryUom || 'KG').toLowerCase(),
          yesterdayFloor: r.floorPrice != null ? Number(r.floorPrice) : 0,
          yesterdayTarget: r.targetPrice != null ? Number(r.targetPrice) : 0,
          landedCost: r.latestLandedCost != null ? Number(r.latestLandedCost) : 0,
          minMarginPct:
            r.minMarginPctUsed != null ? Number(r.minMarginPctUsed) * 100 : 15,
          floorPrice: r.floorPrice != null ? Number(r.floorPrice) : null,
          targetPrice: r.targetPrice != null ? Number(r.targetPrice) : null,
          atpStock: 500,
        }));
        setRows(mapped);
        setInitialRows(mapped);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedDate]);

  const isReadOnlyDate = selectedDate < todayStr;
  const isOwner = !user || canViewMarginAndCost(user.role);
  const canEdit = isOwner && !isReadOnlyDate;

  const missingCount = rows.filter((r) => r.floorPrice === null || r.targetPrice === null).length;

  const changedRows = rows.filter((r) => {
    const orig = initialRows.find((o) => o.itemId === r.itemId);
    return orig && (r.floorPrice !== orig.floorPrice || r.targetPrice !== orig.targetPrice);
  });

  const handlePriceChange = (itemId: string, field: 'floorPrice' | 'targetPrice', rawVal: string) => {
    if (!canEdit) return;
    const parsed = rawVal === '' ? null : parseFloat(rawVal);
    setRows((prev) =>
      prev.map((r) => (r.itemId === itemId ? { ...r, [field]: isNaN(parsed as number) ? null : parsed } : r)),
    );
  };

  // Bulk Tools (§3)
  const handleCopyYesterday = () => {
    if (!canEdit) return;
    setRows((prev) =>
      prev.map((r) => {
        if (selectedIds.length > 0 && !selectedIds.includes(r.itemId)) return r;
        return {
          ...r,
          floorPrice: r.yesterdayFloor,
          targetPrice: r.yesterdayTarget,
        };
      }),
    );
  };

  const handleApplyPlus2Pct = () => {
    if (!canEdit) return;
    setRows((prev) =>
      prev.map((r) => {
        if (selectedIds.length > 0 && !selectedIds.includes(r.itemId)) return r;
        const baseFloor = r.floorPrice ?? r.yesterdayFloor;
        const baseTarget = r.targetPrice ?? r.yesterdayTarget;
        return {
          ...r,
          floorPrice: Math.ceil(baseFloor * 1.02 * 2) / 2,
          targetPrice: Math.ceil(baseTarget * 1.02 * 2) / 2,
        };
      }),
    );
  };

  const handleUseSuggestedFloors = () => {
    if (!canEdit) return;
    setRows((prev) =>
      prev.map((r) => {
        if (selectedIds.length > 0 && !selectedIds.includes(r.itemId)) return r;
        const suggested = calculateAutoFloorPrice(r.landedCost, r.minMarginPct);
        return {
          ...r,
          floorPrice: suggested,
          targetPrice: r.targetPrice && r.targetPrice >= suggested ? r.targetPrice : Math.ceil(suggested * 1.05),
        };
      }),
    );
  };

  const handlePublishPrices = async () => {
    setPublishError(null);
    try {
      const res = await fetch(`/api/proxy/prices/${selectedDate}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          effectiveDate: selectedDate,
          items: rows.map((r) => ({
            itemId: r.itemId,
            latestLandedCost: Number(r.landedCost || 0),
            floorPrice: r.floorPrice ?? undefined,
            targetPrice: r.targetPrice ?? undefined,
            source: 'MANUAL',
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPublishConfirmOpen(false);
        setPublishError(err?.error?.message || err?.message || `Failed to publish prices (${res.status})`);
        return;
      }
      setInitialRows(rows);
      setPublishConfirmOpen(false);
      setPublishSuccess(`Published daily price sheet for ${selectedDate} (${rows.length} items).`);
      setTimeout(() => setPublishSuccess(null), 5000);
    } catch {
      setPublishConfirmOpen(false);
      setPublishError('Unable to reach backend API to publish prices.');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const visibleRows = missingOnly
    ? rows.filter((r) => r.floorPrice === null || r.targetPrice === null)
    : rows;

  const hasInvalidTarget = rows.some(
    (r) => r.floorPrice !== null && r.targetPrice !== null && r.targetPrice < r.floorPrice,
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24">
      {/* 1. Header & Date Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rule pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-action/10 text-action border border-action/30 mb-1.5">
            <span>🏷️ Daily Commercial Desk</span>
          </div>
          <h1 className="text-2xl font-semibold text-ink">Today&apos;s Prices — Base & Floor Sheet</h1>
          <p className="text-xs text-ink-3 mt-0.5">
            Publish daily minimum floor and target selling prices. Orders cannot be priced without today&apos;s rates.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-sheet border border-rule rounded-[3px] px-3 py-1.5">
            <span className="text-xs text-ink-3">Price Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs text-ink font-mono focus:outline-none"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={() => setSharePreviewOpen(true)}>
            💬 WhatsApp / Print List
          </Button>
        </div>
      </div>

      {/* Read-only past date banner */}
      {isReadOnlyDate && (
        <div className="p-3 rounded-[3px] bg-sheet border border-rule-strong text-xs text-ink-2">
          🔒 Viewing historical price sheet for <strong>{selectedDate}</strong> (read-only). Switch back to today ({todayStr}) to publish updates.
        </div>
      )}

      {/* Missing today alert (§3) */}
      {missingCount > 0 && (
        <div className="p-4 rounded-[4px] border border-haldi/30 bg-haldi-soft flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h2 className="text-sm font-bold text-haldi">
                {missingCount} {missingCount === 1 ? 'item has' : 'items have'} no price for today
              </h2>
              <p className="text-xs text-haldi">
                Set Floor & Target prices below or use bulk tools so coordinators can take orders for them.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMissingOnly(!missingOnly)}
            className="bg-haldi-soft text-haldi border-haldi/30"
          >
            {missingOnly ? 'Show All Items' : `Filter Missing (${missingCount})`}
          </Button>
        </div>
      )}

      {publishSuccess && (
        <div className="p-4 rounded-[4px] border border-leaf/30 bg-leaf-soft text-xs font-semibold text-leaf">
          ✓ {publishSuccess}
        </div>
      )}

      {publishError && (
        <div className="p-4 rounded-[4px] border border-madder/30 bg-madder-soft text-xs font-semibold text-madder">
          ❌ {publishError}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Catalog Items Priced" value={`${rows.length - missingCount} / ${rows.length}`} subtitle="Ready for Quick Order" tone="default" />
        <KpiCard title="Modified in Draft" value={String(changedRows.length)} subtitle="Unsaved price adjustments" tone={changedRows.length > 0 ? 'warning' : 'success'} />
        <KpiCard title="Open Quotes Impacted" value={String(openQuotesCount)} subtitle="Active quotes referencing items" tone="default" />
      </div>

      {/* Bulk Tools Bar */}
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-sheet border border-rule p-3.5 rounded-[4px]">
          <div className="text-xs text-ink-3">
            Bulk Tools {selectedIds.length > 0 ? `(${selectedIds.length} selected)` : '(applies to all rows)'}:
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="secondary" size="sm" onClick={handleCopyYesterday}>
              📋 {"Copy yesterday's prices"}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleApplyPlus2Pct}>
              📈 Apply +2% to selected
            </Button>
            {isOwner && (
              <Button variant="secondary" size="sm" onClick={handleUseSuggestedFloors}>
                ⚡ Use suggested floors
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Price Grid */}
      <div className="bg-sheet border border-rule rounded-[4px] overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-paper border-b border-rule text-ink-3 uppercase font-semibold">
            <tr>
              <th className="p-3 w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.length === rows.length && rows.length > 0}
                  onChange={(e) => setSelectedIds(e.target.checked ? rows.map((r) => r.itemId) : [])}
                />
              </th>
              <th className="p-3">Item & Category</th>
              <th className="p-3">Yesterday (Floor / Target)</th>
              {isOwner && <th className="p-3">Landed Cost & Min %</th>}
              {isOwner && <th className="p-3">Suggested Floor</th>}
              <th className="p-3">Today&apos;s Floor (₹)</th>
              <th className="p-3">Today&apos;s Target (₹)</th>
              <th className="p-3">vs Yesterday</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {visibleRows.map((row) => {
              const suggestedFloor = calculateAutoFloorPrice(row.landedCost, row.minMarginPct);
              const changePct =
                row.targetPrice !== null && row.yesterdayTarget > 0
                  ? ((row.targetPrice - row.yesterdayTarget) / row.yesterdayTarget) * 100
                  : null;
              const isBigChange = changePct !== null && Math.abs(changePct) > 10;
              const isTargetBelowFloor =
                row.floorPrice !== null && row.targetPrice !== null && row.targetPrice < row.floorPrice;
              const isFloorBelowSuggested =
                isOwner && row.floorPrice !== null && row.floorPrice < suggestedFloor;

              return (
                <tr key={row.itemId} className="hover:bg-sheet">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.itemId)}
                      onChange={() => toggleSelect(row.itemId)}
                    />
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-ink">{row.itemName}</div>
                    <div className="text-[11px] text-ink-3 flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-action">{row.sku}</span>
                      <span>•</span>
                      <span>{row.category.replace('_', ' ')}</span>
                      <span>•</span>
                      <span>per {row.uom}</span>
                    </div>
                  </td>
                  <td className="p-3 font-mono text-ink-3">
                    ₹{row.yesterdayFloor} / ₹{row.yesterdayTarget}
                  </td>
                  {isOwner && (
                    <td className="p-3 font-mono text-ink-2">
                      ₹{row.landedCost} <span className="text-ink-3">({row.minMarginPct}%)</span>
                    </td>
                  )}
                  {isOwner && (
                    <td className="p-3">
                      <span className="font-mono font-bold text-action">₹{suggestedFloor.toFixed(2)}</span>
                      <span className="block text-[10px] text-ink-3">cost / (1−margin)</span>
                    </td>
                  )}
                  <td className="p-3">
                    <input
                      type="number"
                      step="0.5"
                      disabled={!canEdit}
                      value={row.floorPrice ?? ''}
                      onChange={(e) => handlePriceChange(row.itemId, 'floorPrice', e.target.value)}
                      placeholder="Set floor"
                      className={`w-24 bg-paper border rounded-lg px-2.5 py-1.5 font-mono text-xs text-ink focus:outline-none ${
                        isFloorBelowSuggested
                          ? 'border-amber-500'
                          : row.floorPrice === null
                          ? 'border-rose-500/60'
                          : 'border-rule-strong focus:border-action/30'
                      }`}
                    />
                    {isFloorBelowSuggested && (
                      <span className="block text-[10px] text-haldi mt-0.5">Below suggested ₹{suggestedFloor}</span>
                    )}
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      step="0.5"
                      disabled={!canEdit}
                      value={row.targetPrice ?? ''}
                      onChange={(e) => handlePriceChange(row.itemId, 'targetPrice', e.target.value)}
                      placeholder="Set target"
                      className={`w-24 bg-paper border rounded-lg px-2.5 py-1.5 font-mono text-xs text-ink focus:outline-none ${
                        isTargetBelowFloor
                          ? 'border-rose-500'
                          : row.targetPrice === null
                          ? 'border-rose-500/60'
                          : 'border-rule-strong focus:border-action/30'
                      }`}
                    />
                    {isTargetBelowFloor && (
                      <span className="block text-[10px] text-madder mt-0.5">Must be ≥ Floor</span>
                    )}
                  </td>
                  <td className="p-3 font-mono">
                    {changePct === null ? (
                      <Badge tone="danger">Missing</Badge>
                    ) : (
                      <span
                        className={`font-bold ${
                          isBigChange
                            ? 'text-amber-400'
                            : changePct > 0
                            ? 'text-emerald-400'
                            : changePct < 0
                            ? 'text-rose-400'
                            : 'text-ink-3'
                        }`}
                      >
                        {changePct > 0 ? `+${changePct.toFixed(1)}%` : `${changePct.toFixed(1)}%`}
                        {isBigChange && ' (>10%!)'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sticky Publish Bar (§3) */}
      {canEdit && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-4xl bg-sheet border border-action/30 rounded-[4px] p-3.5 shadow-2xl flex items-center justify-between gap-4">
          <div className="text-xs text-ink">
            <strong className="text-action">{changedRows.length} items changed</strong>
            <span className="text-ink-3 ml-2">
              {hasInvalidTarget ? '⚠️ Fix Target < Floor errors before publishing' : 'Ready to publish daily rate sheet'}
            </span>
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={hasInvalidTarget}
            onClick={() => setPublishConfirmOpen(true)}
          >
            Publish prices ({rows.length - missingCount} ready) →
          </Button>
        </div>
      )}

      {/* Confirm Publish Dialog */}
      <Dialog
        open={publishConfirmOpen}
        onClose={() => setPublishConfirmOpen(false)}
        title="Confirm Daily Price Publication"
        maxWidth="sm"
      >
        <div className="space-y-4 my-2 text-xs text-ink-2">
          <p>
            You are publishing prices for <strong>{selectedDate}</strong> ({changedRows.length} items modified).
          </p>
          <div className="p-3 bg-haldi-soft border border-haldi/30 rounded-[3px] text-haldi">
            ℹ️ Impact Check: <strong>2 open quotes</strong> reference items in this sheet. New sales orders will immediately enforce these floor & target bands.
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setPublishConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handlePublishPrices}>
              Confirm &amp; Publish
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Customer-Facing Printable / WhatsApp Price List (Target Price Only!) */}
      <Dialog
        open={sharePreviewOpen}
        onClose={() => setSharePreviewOpen(false)}
        title="Customer-Facing Price List (Target Rates Only)"
        maxWidth="md"
      >
        <div className="space-y-4 my-2">
          <p className="text-xs text-ink-3">
            Floor prices, landed costs, and margins are strictly hidden from this customer-facing sheet.
          </p>
          <div className="bg-paper border border-rule rounded-[3px] p-4 font-mono text-xs text-ink whitespace-pre-wrap">
            {`*NeoFresh Daily Rate Card — ${selectedDate}*\n\n` +
              rows
                .filter((r) => r.targetPrice !== null)
                .map((r) => `• ${r.itemName}: ${formatINR(r.targetPrice)} / ${r.uom}`)
                .join('\n')}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => typeof window !== 'undefined' && window.print()}>
              🖨️ Print Sheet
            </Button>
            <Button variant="primary" size="sm" onClick={() => setSharePreviewOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
