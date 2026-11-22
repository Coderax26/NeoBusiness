'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, StatusPill, Card } from '@neo/ui';
import { type StockCountRecord } from '../../../../src/lib/inventory-data';

export default function StockCountsPage() {
  const [counts, setCounts] = useState<StockCountRecord[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/inventory/stock-counts')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setCounts(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const updateCounted = (sheetId: string, itemId: string, val: number) => {
    setCounts((prev) =>
      prev.map((c) =>
        c.id === sheetId
          ? {
              ...c,
              lines: c.lines.map((l) =>
                l.itemId === itemId ? { ...l, countedQty: val } : l,
              ),
            }
          : c,
      ),
    );
  };

  const postSheet = (sheet: StockCountRecord) => {
    fetch(`/api/bff/inventory/stock-counts/${sheet.id}/approve`, { method: 'POST' }).catch(() => {});
    setCounts((prev) =>
      prev.map((c) => (c.id === sheet.id ? { ...c, status: 'POSTED' } : c)),
    );
    setToast(`Posted variance adjustments for count sheet ${sheet.sheetNo}.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
            <Link href="/inventory/stock" className="hover:text-white">Inventory</Link>
            <span>/</span>
            <span className="text-amber-400">Physical Stock Counts</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Cycle Count &amp; Variance Review</h1>
          <p className="text-sm text-zinc-400">
            Enter physical counts, review system vs counted variance, and post bulk adjustments.
          </p>
        </div>
        <Button variant="secondary" onClick={() => window.print()}>
          Print Count Sheet
        </Button>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm">
          {toast}
        </div>
      )}

      {counts.map((sheet) => (
        <Card key={sheet.id} className="p-5 bg-zinc-900 border-zinc-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-800">
            <div>
              <span className="font-mono text-sm text-amber-400 font-bold mr-2">
                {sheet.sheetNo}
              </span>
              <StatusPill status={sheet.status} tone={sheet.status === 'POSTED' ? 'emerald' : 'amber'} />
              <div className="text-xs text-zinc-400 mt-1">
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
            <thead className="text-xs uppercase text-zinc-400 border-b border-zinc-800">
              <tr>
                <th className="py-2">Item</th>
                <th className="py-2 text-right">System Qty</th>
                <th className="py-2 text-right">Counted Qty</th>
                <th className="py-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {sheet.lines.map((line) => {
                const variance = line.countedQty - line.systemQty;
                return (
                  <tr key={line.itemId}>
                    <td className="py-3 text-white font-medium">{line.itemName}</td>
                    <td className="py-3 text-right font-mono text-zinc-300">
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
                        className="w-28 text-right bg-zinc-950 border border-zinc-700 rounded px-2 py-1 font-mono text-white"
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
    </div>
  );
}

