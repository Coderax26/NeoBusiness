'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, StatusPill, Card, Dialog } from '@neo/ui';
import { type StockCountRecord } from '../../../../src/lib/inventory-data';

export default function StockCountsPage() {
  const [counts, setCounts] = useState<StockCountRecord[]>([]);
  const [stockBatches, setStockBatches] = useState<any[]>([]);
  const [catalogItems, setCatalogItems] = useState<Array<{ id: string; name: string; sku: string; uom: string }>>([]);
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newNotes, setNewNotes] = useState('');
  const [countedMap, setCountedMap] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<{ msg: string; isError?: boolean } | null>(null);

  const loadCounts = async () => {
    try {
      const [cntRes, stkRes, itmRes, siteRes] = await Promise.all([
        fetch('/api/proxy/inventory/stock-counts').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/proxy/inventory/stock/current').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/proxy/items').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/proxy/sites').then((r) => (r.ok ? r.json() : [])),
      ]);
      const rows = Array.isArray(cntRes) ? cntRes : Array.isArray(cntRes?.data) ? cntRes.data : [];
      const sRows = Array.isArray(stkRes) ? stkRes : Array.isArray(stkRes?.data) ? stkRes.data : [];
      const iRows = Array.isArray(itmRes) ? itmRes : Array.isArray(itmRes?.data) ? itmRes.data : [];
      const stRows = Array.isArray(siteRes) ? siteRes : Array.isArray(siteRes?.data) ? siteRes.data : [];
      setStockBatches(sRows);
      setCatalogItems(
        iRows.map((i: any) => ({
          id: String(i.id),
          name: String(i.name ?? 'Item'),
          sku: String(i.sku_code ?? i.skuCode ?? ''),
          uom: String(i.primary_uom ?? i.primaryUom ?? 'KG'),
        })),
      );
      const mappedSites = stRows.map((s: any) => ({ id: String(s.id), name: String(s.name ?? 'Site') }));
      setSites(mappedSites);
      if (mappedSites.length > 0) setSelectedSiteId((p) => p || mappedSites[0].id);

      setCounts(
        rows.map((s: any) => {
          const st = String(s.status || 'DRAFT').toUpperCase();
          const rawItems = Array.isArray(s.lines) ? s.lines : Array.isArray(s.items) ? s.items : [];
          return {
            id: String(s.id),
            sheetNo: String(s.sheetNo || s.count_no || s.id),
            siteName: String(s.siteName || s.site_name || 'Main Site'),
            locationCode: String(s.locationCode || s.location_id || 'ALL'),
            category: String(s.notes || s.category || 'Cycle Count'),
            status: (st === 'DRAFT' || st === 'OPEN' ? 'OPEN' : 'POSTED') as StockCountRecord['status'],
            createdAt: String(s.createdAt || s.created_at || ''),
            lines: rawItems.map((it: any) => ({
              itemId: String(it.itemId || it.item_id || ''),
              itemName: String(it.itemName || it.item_name || 'Item'),
              uom: String(it.uom || it.primary_uom || 'KG'),
              systemQty: Number(it.systemQty ?? it.system_qty ?? 0),
              countedQty: Number(it.countedQty ?? it.counted_qty ?? 0),
            })),
          };
        }),
      );
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadCounts();
  }, []);

  const updateCounted = (sheetId: string, itemId: string, val: number) => {
    setCounts((prev) =>
      prev.map((c) =>
        c.id === sheetId
          ? {
              ...c,
              lines: (c.lines || []).map((l) =>
                l.itemId === itemId ? { ...l, countedQty: val } : l,
              ),
            }
          : c,
      ),
    );
  };

  const countSourceRows =
    stockBatches.length > 0
      ? stockBatches.slice(0, 15).map((b: any) => ({
          idKey: String(b.batchId || b.id),
          itemId: String(b.itemId || b.item_id),
          itemName: String(b.itemName || b.item_name || 'Item'),
          batchNo: String(b.batchNumber || b.batch_number || ''),
          sysQty: Number(b.qtyOnHand ?? b.qty_on_hand ?? b.onHand ?? 0),
        }))
      : catalogItems.slice(0, 15).map((i) => ({
          idKey: i.id,
          itemId: i.id,
          itemName: i.name,
          batchNo: '',
          sysQty: 0,
        }));

  const handleCreateCount = async () => {
    const siteId =
      selectedSiteId ||
      String(stockBatches[0]?.siteId || stockBatches[0]?.site_id || '');
    if (!siteId || countSourceRows.length === 0) {
      setToast({ msg: 'Select a site and ensure at least one item exists.', isError: true });
      return;
    }
    const items = countSourceRows.map((b) => ({
      itemId: b.itemId,
      ...(b.batchNo ? { batchNo: b.batchNo } : {}),
      systemQty: String(b.sysQty),
      countedQty: String(countedMap[b.idKey] ?? b.sysQty),
    }));
    try {
      const res = await fetch('/api/proxy/inventory/stock-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, notes: newNotes || 'Physical cycle count', items }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadCounts();
      setCreateOpen(false);
      setNewNotes('');
      setToast({ msg: 'Created physical stock count sheet.' });
    } catch (err) {
      setToast({ msg: `Failed to create stock count: ${(err as Error).message}`, isError: true });
    }
  };

  const postSheet = async (sheet: StockCountRecord) => {
    try {
      // Persist edited countedQty values before posting variances
      const patchRes = await fetch(
        `/api/proxy/inventory/stock-counts/${encodeURIComponent(sheet.id)}/lines`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: sheet.lines.map((l) => ({
              itemId: l.itemId,
              countedQty: String(Math.max(0, Number(l.countedQty) || 0)),
            })),
          }),
        },
      );
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${patchRes.status}`);
      }

      const res = await fetch(`/api/proxy/inventory/stock-counts/${encodeURIComponent(sheet.id)}/approve`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadCounts();
      setToast({ msg: `Posted variance adjustments to ledger for count sheet ${sheet.sheetNo}.` });
    } catch (err) {
      setToast({ msg: `Failed to approve stock count: ${(err as Error).message}`, isError: true });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/inventory/stock" className="hover:text-ink">Inventory</Link>
            <span>/</span>
            <span className="text-haldi">Physical Stock Counts</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Cycle Count &amp; Variance Review</h1>
          <p className="text-sm text-ink-3">
            Enter physical counts, review system vs counted variance, and post bulk adjustments.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            Print Count Sheet
          </Button>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            + New Stock Count
          </Button>
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

      {counts.map((sheet) => (
        <Card key={sheet.id} className="p-5 bg-sheet border-rule space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-rule">
            <div>
              <span className="font-mono text-sm text-haldi font-bold mr-2">
                {sheet.sheetNo}
              </span>
              <StatusPill status={sheet.status} tone={sheet.status === 'POSTED' ? 'emerald' : 'amber'} />
              <div className="text-xs text-ink-3 mt-1">
                {sheet.siteName} · {sheet.locationCode} · {sheet.category}
              </div>
            </div>
            {sheet.status === 'OPEN' && (
              <Button variant="primary" onClick={() => postSheet(sheet)}>
                Post Variance Adjustments
              </Button>
            )}
          </div>

          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-ink-3 border-b border-rule">
              <tr>
                <th className="py-2">Item</th>
                <th className="py-2 text-right">System Qty</th>
                <th className="py-2 text-right">Counted Qty</th>
                <th className="py-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {sheet.lines.map((line) => {
                const variance = line.countedQty - line.systemQty;
                return (
                  <tr key={line.itemId}>
                    <td className="py-3 text-ink font-medium">{line.itemName}</td>
                    <td className="py-3 text-right font-mono text-ink-2">
                      {line.systemQty} {line.uom}
                    </td>
                    <td className="py-3 text-right">
                      <input
                        type="number"
                        disabled={sheet.status === 'POSTED'}
                        value={line.countedQty}
                        onChange={(e) =>
                          updateCounted(sheet.id, line.itemId, Number(e.target.value))
                        }
                        className="w-28 text-right bg-paper border border-rule-strong rounded px-2 py-1 font-mono text-ink"
                      />
                    </td>
                    <td
                      className={`py-3 text-right font-mono font-bold ${
                        variance === 0
                          ? 'text-emerald-400'
                          : variance < 0
                            ? 'text-rose-400'
                            : 'text-amber-400'
                      }`}
                    >
                      {variance > 0 ? `+${variance}` : variance} {line.uom}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ))}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create Physical Stock Count">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Count notes (e.g. Monthly cycle count)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            />
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {countSourceRows.map((b) => (
              <div key={b.idKey} className="flex items-center justify-between gap-2 text-xs p-2 bg-paper border border-rule rounded">
                <div>
                  <div className="font-medium text-ink">{b.itemName}</div>
                  <div className="font-mono text-ink-3">
                    {b.batchNo || 'Zero stock'} (Sys: {b.sysQty})
                  </div>
                </div>
                <input
                  type="number"
                  value={countedMap[b.idKey] ?? b.sysQty}
                  onChange={(e) => setCountedMap((prev) => ({ ...prev, [b.idKey]: Number(e.target.value) }))}
                  className="w-24 text-right bg-sheet border border-rule-strong rounded px-2 py-1 font-mono"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreateCount}>Create Sheet</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

