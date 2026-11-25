'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Card } from '@neo/ui';
import { formatINR, maskGrnForBlindView } from '@neo/shared';
import { type GrnRecord } from '../../../../src/lib/procurement-data';

export default function GoodsReceivedPage() {
  const [grns, setGrns] = useState<GrnRecord[]>([]);
  const [selectedGrn, setSelectedGrn] = useState<GrnRecord | null>(null);
  const [viewRoleMode, setViewRoleMode] = useState<'OFFICE' | 'BLIND_STOREKEEPER'>('OFFICE');

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/procurement/grns')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!active || !Array.isArray(rows)) return;
        const mapped: GrnRecord[] = rows.map((g: any) => ({
          id: String(g.id),
          grnNumber: String(g.grnNumber || g.grn_number || g.grn_no || g.id),
          poId: String(g.poId || g.po_id || ''),
          poNumber: String(g.poNumber || g.po_number || g.po_no || ''),
          supplierId: String(g.supplierId || g.supplier_id || ''),
          supplierName: String(g.supplierName || g.supplier_name || 'Supplier'),
          siteName: String(g.siteName || g.site_name || 'Main Site'),
          receivedDate: String(g.receivedDate || g.received_date || g.receivedAt || g.received_at || g.created_at || '').slice(0, 10),
          receivedBy: String(g.receivedBy || g.received_by_name || 'Storekeeper'),
          hasShortfall: Boolean(g.hasShortfall ?? g.has_shortfall),
          lines: Array.isArray(g.lines)
            ? g.lines.map((l: any, idx: number) => ({
                lineId: String(l.lineId || l.id || `l-${idx}`),
                itemId: String(l.itemId || l.item_id || ''),
                itemSku: String(l.itemSku || l.sku_code || ''),
                itemName: String(l.itemName || l.item_name || 'Item'),
                uom: String(l.uom || 'kg'),
                orderedQty: Number(l.orderedQty ?? l.ordered_qty ?? 0),
                unitPrice: Number(l.unitPrice ?? l.unit_price ?? 0),
                receivedQty: Number(l.receivedQty ?? l.received_qty ?? 0),
              }))
            : [],
        }));
        setGrns(mapped);
        if (mapped.length > 0) setSelectedGrn(mapped[0]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const blindMaskedLines = useMemo(
    () =>
      selectedGrn
        ? maskGrnForBlindView(
            selectedGrn.lines.map((l) => ({
              lineId: l.lineId,
              itemId: l.itemId,
              itemSku: l.itemSku,
              itemName: l.itemName,
              uom: l.uom,
              orderedQty: l.orderedQty,
              unitPrice: l.unitPrice,
              receivedQty: l.receivedQty,
            })),
          )
        : [],
    [selectedGrn],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/procurement" className="hover:text-ink">Procurement</Link>
            <span>/</span>
            <span className="text-action">Goods Received (GRNs)</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Goods Received Notes</h1>
          <p className="text-sm text-ink-3">
            Office receipt inspection (Ordered vs Received comparison) and BR-05 Blind Storekeeper preview.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-sheet border border-rule rounded-[3px] p-1">
          <button
            onClick={() => setViewRoleMode('OFFICE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium${
              viewRoleMode === 'OFFICE'
                ? 'bg-indigo-600 text-white'
                : 'text-ink-3 hover:text-ink'
            }`}
          >
            Office Comparison View
          </button>
          <button
            onClick={() => setViewRoleMode('BLIND_STOREKEEPER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium${
              viewRoleMode === 'BLIND_STOREKEEPER'
                ? 'bg-haldi text-white'
                : 'text-ink-3 hover:text-ink'
            }`}
          >
            Blind GRN (Storekeeper)
          </button>
        </div>
      </div>

      {/* Office List */}
      <div className="bg-sheet border border-rule rounded-[3px] overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper border-b border-rule text-xs uppercase text-ink-3">
            <tr>
              <th className="p-3">GRN #</th>
              <th className="p-3">Date</th>
              <th className="p-3">Supplier</th>
              <th className="p-3">PO #</th>
              <th className="p-3">Received By</th>
              <th className="p-3">Lines</th>
              <th className="p-3">Shortfall</th>
              <th className="p-3 text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {grns.map((g) => (
              <tr
                key={g.id}
                className={`hover:bg-sunken cursor-pointer${
                  selectedGrn?.id === g.id ? 'bg-indigo-500/10' : ''
                }`}
                onClick={() => setSelectedGrn(g)}
              >
                <td className="p-3 font-mono text-xs text-action font-semibold">
                  {g.grnNumber}
                </td>
                <td className="p-3 text-xs font-mono text-ink-2">{g.receivedDate}</td>
                <td className="p-3 text-ink font-medium">{g.supplierName}</td>
                <td className="p-3 font-mono text-xs text-ink-2">{g.poNumber}</td>
                <td className="p-3 text-xs text-ink-2">{g.receivedBy}</td>
                <td className="p-3 font-mono text-xs text-ink">{g.lines.length}</td>
                <td className="p-3">
                  {g.hasShortfall ? (
                    <StatusPill status="SHORTFALL" tone="rose" />
                  ) : (
                    <StatusPill status="COMPLETE" tone="emerald" />
                  )}
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => setSelectedGrn(g)}
                    className="text-xs text-action hover:text-action font-medium"
                  >
                    Compare →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Comparison / Blind View Panel */}
      <Card className="p-5 bg-sheet border-rule">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-rule">
          <div>
            <h2 className="text-base font-semibold text-ink">
              {selectedGrn?.grnNumber ?? '—'} —{' '}
              {viewRoleMode === 'OFFICE'
                ? 'Office Comparison (Ordered vs Received)'
                : 'Blind GRN View (Storekeeper — No Ordered Qty or Price)'}
            </h2>
            <p className="text-xs text-ink-3">
              PO: {selectedGrn?.poNumber ?? '—'} · Supplier: {selectedGrn?.supplierName ?? '—'} · Site: {selectedGrn?.siteName ?? '—'}
            </p>
          </div>
          {selectedGrn?.hasShortfall && viewRoleMode === 'OFFICE' && (
            <Link href="/procurement/shortfalls">
              <Button variant="primary">Recover Shortfall →</Button>
            </Link>
          )}
        </div>

        {viewRoleMode === 'OFFICE' ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-ink-3 border-b border-rule">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Ordered Qty</th>
                  <th className="py-2 text-right">Received Qty</th>
                  <th className="py-2 text-right">Short Qty</th>
                  <th className="py-2 text-right">PO Rate</th>
                  <th className="py-2 text-right">Short Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {(selectedGrn?.lines ?? []).map((line) => (
                  <tr key={line.lineId}>
                    <td className="py-3">
                      <div className="text-ink font-medium">{line.itemName}</div>
                      <div className="text-xs font-mono text-ink-3">{line.itemSku}</div>
                    </td>
                    <td className="py-3 text-right font-mono text-ink-2">
                      {line.orderedQty} {line.uom}
                    </td>
                    <td className="py-3 text-right font-mono text-leaf font-semibold">
                      {line.receivedQty} {line.uom}
                    </td>
                    <td className="py-3 text-right font-mono text-madder font-semibold">
                      {line.shortQty > 0 ? `-${line.shortQty} ${line.uom}` : '0'}
                    </td>
                    <td className="py-3 text-right font-mono text-ink-2">
                      ₹{line.unitPrice}/{line.uom}
                    </td>
                    <td className="py-3 text-right font-mono text-madder">
                      {formatINR(line.shortQty * line.unitPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4" data-testid="blind-grn-dom">
            <div className="p-3 rounded-lg bg-haldi-soft border border-haldi/30 text-haldi text-xs mb-3">
              BR-05 Blind Receiving Active: Storekeeper sees only item SKU, description, and physical count field. Ordered quantities and supplier rates are stripped.
            </div>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-ink-3 border-b border-rule">
                <tr>
                  <th className="py-2">SKU</th>
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Physical Count Captured</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {blindMaskedLines.map((line) => (
                  <tr key={line.lineId}>
                    <td className="py-3 font-mono text-xs text-action">{line.itemSku}</td>
                    <td className="py-3 text-ink font-medium">{line.itemName}</td>
                    <td className="py-3 text-right font-mono text-leaf">
                      {line.receivedQty} {line.uom}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

