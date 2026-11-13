'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Card } from '@neo/ui';
import { formatINR, maskGrnForBlindView } from '@neo/shared';
import { INITIAL_GRNS, type GrnRecord } from '../../../src/lib/procurement-data';

export default function GoodsReceivedPage() {
  const [grns] = useState<GrnRecord[]>(INITIAL_GRNS);
  const [selectedGrn, setSelectedGrn] = useState<GrnRecord>(INITIAL_GRNS[0]);
  const [viewRoleMode, setViewRoleMode] = useState<'OFFICE' | 'BLIND_STOREKEEPER'>('OFFICE');

  const blindMaskedLines = useMemo(
    () =>
      maskGrnForBlindView(
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
      ),
    [selectedGrn],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
            <Link href="/procurement" className="hover:text-white">Procurement</Link>
            <span>/</span>
            <span className="text-indigo-400">Goods Received (GRNs)</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Goods Received Notes</h1>
          <p className="text-sm text-zinc-400">
            Office receipt inspection (Ordered vs Received comparison) and BR-05 Blind Storekeeper preview.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          <button
            onClick={() => setViewRoleMode('OFFICE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              viewRoleMode === 'OFFICE'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Office Comparison View
          </button>
          <button
            onClick={() => setViewRoleMode('BLIND_STOREKEEPER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              viewRoleMode === 'BLIND_STOREKEEPER'
                ? 'bg-amber-600 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Blind GRN (Storekeeper)
          </button>
        </div>
      </div>

      {/* Office List */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950/80 border-b border-zinc-800 text-xs uppercase text-zinc-400">
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
          <tbody className="divide-y divide-zinc-800/70">
            {grns.map((g) => (
              <tr
                key={g.id}
                className={`hover:bg-zinc-800/40 cursor-pointer ${
                  selectedGrn.id === g.id ? 'bg-indigo-500/10' : ''
                }`}
                onClick={() => setSelectedGrn(g)}
              >
                <td className="p-3 font-mono text-xs text-indigo-400 font-semibold">
                  {g.grnNumber}
                </td>
                <td className="p-3 text-xs font-mono text-zinc-300">{g.receivedDate}</td>
                <td className="p-3 text-zinc-100 font-medium">{g.supplierName}</td>
                <td className="p-3 font-mono text-xs text-zinc-300">{g.poNumber}</td>
                <td className="p-3 text-xs text-zinc-300">{g.receivedBy}</td>
                <td className="p-3 font-mono text-xs text-zinc-200">{g.lines.length}</td>
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
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
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
      <Card className="p-5 bg-zinc-900 border-zinc-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-semibold text-white">
              {selectedGrn.grnNumber} —{' '}
              {viewRoleMode === 'OFFICE'
                ? 'Office Comparison (Ordered vs Received)'
                : 'Blind GRN View (Storekeeper — No Ordered Qty or Price)'}
            </h2>
            <p className="text-xs text-zinc-400">
              PO: {selectedGrn.poNumber} · Supplier: {selectedGrn.supplierName} · Site: {selectedGrn.siteName}
            </p>
          </div>
          {selectedGrn.hasShortfall && viewRoleMode === 'OFFICE' && (
            <Link href="/procurement/shortfalls">
              <Button variant="primary">Recover Shortfall →</Button>
            </Link>
          )}
        </div>

        {viewRoleMode === 'OFFICE' ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Ordered Qty</th>
                  <th className="py-2 text-right">Received Qty</th>
                  <th className="py-2 text-right">Short Qty</th>
                  <th className="py-2 text-right">PO Rate</th>
                  <th className="py-2 text-right">Short Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {selectedGrn.lines.map((line) => (
                  <tr key={line.lineId}>
                    <td className="py-3">
                      <div className="text-white font-medium">{line.itemName}</div>
                      <div className="text-xs font-mono text-zinc-500">{line.itemSku}</div>
                    </td>
                    <td className="py-3 text-right font-mono text-zinc-300">
                      {line.orderedQty} {line.uom}
                    </td>
                    <td className="py-3 text-right font-mono text-emerald-400 font-semibold">
                      {line.receivedQty} {line.uom}
                    </td>
                    <td className="py-3 text-right font-mono text-rose-400 font-semibold">
                      {line.shortQty > 0 ? `-${line.shortQty} ${line.uom}` : '0'}
                    </td>
                    <td className="py-3 text-right font-mono text-zinc-300">
                      ₹{line.unitPrice}/{line.uom}
                    </td>
                    <td className="py-3 text-right font-mono text-rose-400">
                      {formatINR(line.shortQty * line.unitPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4" data-testid="blind-grn-dom">
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs mb-3">
              BR-05 Blind Receiving Active: Storekeeper sees only item SKU, description, and physical count field. Ordered quantities and supplier rates are stripped.
            </div>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="py-2">SKU</th>
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Physical Count Captured</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {blindMaskedLines.map((line) => (
                  <tr key={line.lineId}>
                    <td className="py-3 font-mono text-xs text-indigo-400">{line.itemSku}</td>
                    <td className="py-3 text-white font-medium">{line.itemName}</td>
                    <td className="py-3 text-right font-mono text-emerald-400">
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

