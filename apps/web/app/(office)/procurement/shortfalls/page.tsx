'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Card, Dialog } from '@neo/ui';
import { formatINR, rankBackupSuppliers } from '@neo/shared';
import {
  INITIAL_SHORTFALLS,
  type OpenShortfallRecord,
} from '../../../src/lib/procurement-data';

export default function ShortfallWorkbenchPage() {
  const [shortfalls, setShortfalls] = useState<OpenShortfallRecord[]>(INITIAL_SHORTFALLS);
  const [toast, setToast] = useState<string | null>(null);
  const [writeOffTarget, setWriteOffTarget] = useState<OpenShortfallRecord | null>(null);
  const [writeOffReason, setWriteOffReason] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4500);
  };

  const handleCreateBackupPo = (
    sf: OpenShortfallRecord,
    supplierId: string,
    supplierName: string,
    rate: number,
  ) => {
    // 1-click from the ranked suggestion card (<= 3 clicks total)
    fetch('/api/bff/procurement/shortfalls/create-backup-po', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shortfallId: sf.id,
        backupSupplierId: supplierId,
        qty: sf.shortQty,
        rate,
      }),
    }).catch(() => {});

    setShortfalls((prev) =>
      prev.map((s) =>
        s.id === sf.id ? { ...s, status: 'BACKUP_PO_CREATED' } : s,
      ),
    );
    const backupPoNo = `PO-2026-${Math.floor(120 + Math.random() * 79)}`;
    showToast(
      `Created Backup ${backupPoNo} with ${supplierName} for ${sf.shortQty} ${sf.uom} @ ₹${rate}/${sf.uom}.`,
    );
  };

  const handleAutoResolve = (sf: OpenShortfallRecord) => {
    fetch(`/api/bff/procurement/shortfalls/auto-resolve/${sf.poId}`, {
      method: 'POST',
    }).catch(() => {});

    const ranked = rankBackupSuppliers(sf.primaryRate, sf.backups);
    const best = ranked[0];
    if (best) {
      handleCreateBackupPo(sf, best.supplierId, best.supplierName, best.quotedRate);
    }
  };

  const handleAllocate = (sf: OpenShortfallRecord) => {
    fetch(`/api/bff/procurement/shortfalls/${sf.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ALLOCATED' }),
    }).catch(() => {});

    setShortfalls((prev) =>
      prev.map((s) => (s.id === sf.id ? { ...s, status: 'ALLOCATED' } : s)),
    );
    showToast(`Allocated available depot stock to cover ${sf.itemName} shortfall.`);
  };

  const handleWriteOff = () => {
    if (!writeOffTarget || !writeOffReason.trim()) return;
    fetch(`/api/bff/procurement/shortfalls/${writeOffTarget.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'WRITTEN_OFF', reason: writeOffReason }),
    }).catch(() => {});

    setShortfalls((prev) =>
      prev.map((s) =>
        s.id === writeOffTarget.id ? { ...s, status: 'WRITTEN_OFF' } : s,
      ),
    );
    showToast(`Wrote off shortfall on ${writeOffTarget.poNumber}.`);
    setWriteOffTarget(null);
    setWriteOffReason('');
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
          <Link href="/procurement" className="hover:text-white">Procurement</Link>
          <span>/</span>
          <span className="text-indigo-400">Shortfall Workbench</span>
        </div>
        <h1 className="text-2xl font-bold text-white">Shortfall Recovery Workbench</h1>
        <p className="text-sm text-zinc-400">
          Resolve GRN shortages in ≤3 clicks using ranked backup suppliers (OD-010: within 2% auto-suggested).
        </p>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm">
          {toast}
        </div>
      )}

      <div className="space-y-4">
        {shortfalls.map((sf) => {
          const ranked = rankBackupSuppliers(sf.primaryRate, sf.backups);
          const best = ranked[0];

          return (
            <Card key={sf.id} className="p-5 bg-zinc-900 border-zinc-800 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-indigo-400 font-bold">
                      {sf.poNumber}
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span className="font-mono text-xs text-zinc-400">{sf.grnNumber}</span>
                    <StatusPill
                      status={sf.status}
                      tone={sf.status === 'OPEN' ? 'rose' : 'emerald'}
                    />
                  </div>
                  <h3 className="text-lg font-bold text-white mt-1">
                    {sf.itemName} —{' '}
                    <span className="text-rose-400">
                      Short {sf.shortQty} {sf.uom}
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Primary Supplier: {sf.primarySupplierName} (₹{sf.primaryRate}/{sf.uom})
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {sf.status === 'OPEN' && (
                    <>
                      <Button variant="primary" onClick={() => handleAutoResolve(sf)}>
                        Auto-Resolve (Best Backup)
                      </Button>
                      <Button variant="secondary" onClick={() => handleAllocate(sf)}>
                        Allocate Stock
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setWriteOffTarget(sf)}
                      >
                        Write Off
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Impacted Sales Orders */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-zinc-400 font-medium">Impacted Sales Orders:</span>
                {sf.impactedSalesOrders.map((so) => (
                  <Link
                    key={so.id}
                    href={`/sales/orders/${so.id}`}
                    className="px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20"
                  >
                    {so.orderNo} ({so.customerName})
                  </Link>
                ))}
              </div>

              {/* Plain-language best action callout (§4 UX notes) */}
              {best && sf.status === 'OPEN' && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs text-emerald-200">
                    <strong>Suggested action:</strong> Order {sf.shortQty} {sf.uom} from{' '}
                    <strong>{best.supplierName}</strong> at ₹{best.quotedRate}/{sf.uom} —{' '}
                    {best.withinTolerance
                      ? `within 2% (+${best.deltaPct}%)`
                      : `+${best.deltaPct}% vs primary`}
                  </div>
                  <Button
                    variant="primary"
                    onClick={() =>
                      handleCreateBackupPo(
                        sf,
                        best.supplierId,
                        best.supplierName,
                        best.quotedRate,
                      )
                    }
                  >
                    Create Backup PO ({formatINR(sf.shortQty * best.quotedRate)})
                  </Button>
                </div>
              )}

              {/* Ranked Backup Suppliers Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-zinc-400 uppercase border-b border-zinc-800">
                    <tr>
                      <th className="py-2">Rank</th>
                      <th className="py-2">Backup Supplier</th>
                      <th className="py-2 text-right">Quoted Rate</th>
                      <th className="py-2 text-right">Delta vs Primary</th>
                      <th className="py-2 text-right">Fill Rate</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {ranked.map((cand, idx) => (
                      <tr key={cand.supplierId}>
                        <td className="py-2.5 font-mono text-zinc-400">#{idx + 1}</td>
                        <td className="py-2.5 text-zinc-100 font-medium">
                          {cand.supplierName}{' '}
                          {cand.withinTolerance && (
                            <Badge variant="success">Within 2% (OD-010)</Badge>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-mono text-white">
                          ₹{cand.quotedRate}/{sf.uom}
                        </td>
                        <td className="py-2.5 text-right font-mono">
                          <span
                            className={
                              cand.withinTolerance ? 'text-emerald-400' : 'text-amber-400'
                            }
                          >
                            +{cand.deltaPct}%
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-mono text-zinc-300">
                          {cand.fillRate}%
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            disabled={sf.status !== 'OPEN'}
                            onClick={() =>
                              handleCreateBackupPo(
                                sf,
                                cand.supplierId,
                                cand.supplierName,
                                cand.quotedRate,
                              )
                            }
                            className={`font-medium ${
                              sf.status === 'OPEN'
                                ? 'text-indigo-400 hover:text-indigo-300'
                                : 'text-zinc-600 cursor-not-allowed'
                            }`}
                          >
                            Create Backup PO →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Write-off Modal */}
      <Dialog
        open={!!writeOffTarget}
        onClose={() => setWriteOffTarget(null)}
        title={`Write Off Shortfall — ${writeOffTarget?.poNumber ?? ''}`}
      >
        <div className="space-y-4">
          <textarea
            rows={3}
            value={writeOffReason}
            onChange={(e) => setWriteOffReason(e.target.value)}
            placeholder="Reason required to write off shortfall..."
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setWriteOffTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!writeOffReason.trim()}
              onClick={handleWriteOff}
            >
              Confirm Write Off
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

