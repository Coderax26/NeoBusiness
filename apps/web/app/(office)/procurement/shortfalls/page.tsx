'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Card, Dialog } from '@neo/ui';
import { formatINR, rankBackupSuppliers } from '@neo/shared';
import {
  type OpenShortfallRecord,
} from '../../../../src/lib/procurement-data';

export default function ShortfallWorkbenchPage() {
  const [shortfalls, setShortfalls] = useState<OpenShortfallRecord[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [writeOffTarget, setWriteOffTarget] = useState<OpenShortfallRecord | null>(null);
  const [writeOffReason, setWriteOffReason] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/procurement/shortfalls/all/open')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setShortfalls(
          rows.map((sf: any) => ({
            id: String(sf.id),
            poNumber: String(sf.poNumber ?? sf.po_no ?? ''),
            poId: String(sf.poId ?? sf.po_id ?? ''),
            grnNumber: String(sf.grnNumber ?? sf.grn_no ?? 'GRN'),
            itemId: String(sf.itemId ?? sf.item_id ?? ''),
            itemName: String(sf.itemName ?? sf.item_name ?? ''),
            uom: String(sf.uom ?? 'kg'),
            shortQty: Number(
              sf.shortQty ??
                sf.shortfall_qty ??
                Math.max(0, Number(sf.confirmed_qty ?? 0) - Number(sf.received_qty ?? 0)),
            ),
            primarySupplierId: String(sf.primarySupplierId ?? sf.supplier_id ?? ''),
            primarySupplierName: String(
              sf.primarySupplierName ?? sf.supplier_name ?? 'Primary Supplier',
            ),
            primaryRate: Number(sf.primaryRate ?? sf.unit_price ?? 0),
            status: (sf.status ?? 'OPEN') as OpenShortfallRecord['status'],
            backups: Array.isArray(sf.backups) ? sf.backups : [],
          })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4500);
  };

  const handleCreateBackupPo = async (
    sf: OpenShortfallRecord,
    supplierId: string,
    supplierName: string,
    rate: number,
  ) => {
    const originalPoId = sf.poId || (sf as any).po_id || '';
    try {
      const res = await fetch(
        `/api/bff/procurement/shortfalls/create-backup-po?originalPoId=${encodeURIComponent(originalPoId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shortfallId: sf.id,
            backupSupplierId: supplierId,
            qty: sf.shortQty,
            rate,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      const created = await res.json().catch(() => null);
      const createdData = created?.data ?? created;
      const backupPoNo = createdData?.po_no ?? createdData?.poNumber ?? 'Backup PO';
      setShortfalls((prev) =>
        prev.map((s) =>
          s.id === sf.id ? { ...s, status: 'BACKUP_PO_CREATED' } : s,
        ),
      );
      showToast(
        `Created ${backupPoNo} with ${supplierName} for ${sf.shortQty} ${sf.uom} @ ₹${rate}/${sf.uom}.`,
      );
    } catch (err) {
      showToast(`Failed to create backup PO: ${(err as Error).message}`);
    }
  };

  const handleAutoResolve = async (sf: OpenShortfallRecord) => {
    try {
      const res = await fetch(
        `/api/bff/procurement/shortfalls/auto-resolve/${encodeURIComponent(sf.poId)}`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      setShortfalls((prev) =>
        prev.map((s) =>
          s.id === sf.id ? { ...s, status: 'BACKUP_PO_CREATED' } : s,
        ),
      );
      showToast(`Auto-resolved shortfall on ${sf.poNumber}.`);
    } catch (err) {
      showToast(`Auto-resolve failed: ${(err as Error).message}`);
    }
  };

  const handleAllocate = async (sf: OpenShortfallRecord) => {
    try {
      const res = await fetch(`/api/bff/procurement/shortfalls/${encodeURIComponent(sf.id)}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ALLOCATED' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      setShortfalls((prev) =>
        prev.map((s) => (s.id === sf.id ? { ...s, status: 'ALLOCATED' } : s)),
      );
      showToast(`Allocated available depot stock to cover ${sf.itemName} shortfall.`);
    } catch (err) {
      showToast(`Failed to allocate stock: ${(err as Error).message}`);
    }
  };

  const handleWriteOff = async () => {
    if (!writeOffTarget || !writeOffReason.trim()) return;
    try {
      const res = await fetch(
        `/api/bff/procurement/shortfalls/${encodeURIComponent(writeOffTarget.id)}/status`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'WRITTEN_OFF', reason: writeOffReason }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      setShortfalls((prev) =>
        prev.map((s) =>
          s.id === writeOffTarget.id ? { ...s, status: 'WRITTEN_OFF' } : s,
        ),
      );
      showToast(`Wrote off shortfall on ${writeOffTarget.poNumber}.`);
      setWriteOffTarget(null);
      setWriteOffReason('');
    } catch (err) {
      showToast(`Failed to write off shortfall: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
          <Link href="/procurement" className="hover:text-ink">Procurement</Link>
          <span>/</span>
          <span className="text-action">Shortfall Workbench</span>
        </div>
        <h1 className="text-2xl font-bold text-ink">Shortfall Recovery Workbench</h1>
        <p className="text-sm text-ink-3">
          Resolve GRN shortages in ≤3 clicks using ranked backup suppliers (OD-010: within 2% auto-suggested).
        </p>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-leaf-soft border border-leaf/30 text-leaf text-sm">
          {toast}
        </div>
      )}

      <div className="space-y-4">
        {shortfalls.map((sf) => {
          const ranked = rankBackupSuppliers(sf.primaryRate, sf.backups);
          const best = ranked[0];

          return (
            <Card key={sf.id} className="p-5 bg-sheet border-rule space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-rule">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-action font-bold">
                      {sf.poNumber}
                    </span>
                    <span className="text-ink-3">·</span>
                    <span className="font-mono text-xs text-ink-3">{sf.grnNumber}</span>
                    <StatusPill
                      status={sf.status}
                      tone={sf.status === 'OPEN' ? 'rose' : 'emerald'}
                    />
                  </div>
                  <h3 className="text-lg font-bold text-ink mt-1">
                    {sf.itemName} —{' '}
                    <span className="text-madder">
                      Short {sf.shortQty} {sf.uom}
                    </span>
                  </h3>
                  <p className="text-xs text-ink-3 mt-0.5">
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
                <span className="text-ink-3 font-medium">Impacted Sales Orders:</span>
                {sf.impactedSalesOrders.map((so) => (
                  <Link
                    key={so.id}
                    href={`/sales/orders/${so.id}`}
                    className="px-2.5 py-1 rounded bg-madder-soft border border-madder/30 text-madder hover:opacity-90/20"
                  >
                    {so.orderNo} ({so.customerName})
                  </Link>
                ))}
              </div>

              {/* Plain-language best action callout (§4 UX notes) */}
              {best && sf.status === 'OPEN' && (
                <div className="p-3 rounded-lg bg-leaf-soft border border-leaf/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs text-leaf">
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
                  <thead className="text-ink-3 uppercase border-b border-rule">
                    <tr>
                      <th className="py-2">Rank</th>
                      <th className="py-2">Backup Supplier</th>
                      <th className="py-2 text-right">Quoted Rate</th>
                      <th className="py-2 text-right">Delta vs Primary</th>
                      <th className="py-2 text-right">Fill Rate</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {ranked.map((cand, idx) => (
                      <tr key={cand.supplierId}>
                        <td className="py-2.5 font-mono text-ink-3">#{idx + 1}</td>
                        <td className="py-2.5 text-ink font-medium">
                          {cand.supplierName}{' '}
                          {cand.withinTolerance && (
                            <Badge variant="success">Within 2% (OD-010)</Badge>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-mono text-ink">
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
                        <td className="py-2.5 text-right font-mono text-ink-2">
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
                                : 'text-ink-3 cursor-not-allowed'
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
            className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
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

