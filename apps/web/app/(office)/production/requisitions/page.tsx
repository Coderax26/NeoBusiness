'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button, StatusPill } from '@neo/ui';
import { type RmRequisitionRecord } from '../../../../src/lib/production-data';

function normalizeRequisitions(rawList: any[]): RmRequisitionRecord[] {
  const rows: RmRequisitionRecord[] = [];
  for (const r of rawList) {
    const lines = Array.isArray(r.lines) && r.lines.length > 0 ? r.lines : [null];
    for (const line of lines) {
      rows.push({
        id: String(r.id),
        reqNo: String(r.reqNo ?? r.req_no ?? ''),
        itemId: String(line?.itemId ?? r.itemId ?? ''),
        itemSku: String(line?.itemSkuCode ?? r.itemSku ?? ''),
        itemName: String(line?.itemName ?? r.itemName ?? 'Raw Material'),
        qty: Number(line?.requiredQty ?? r.qty ?? 0),
        uom: String(line?.uom ?? r.uom ?? 'KG'),
        neededBy: String(r.requiredByDate ?? r.neededBy ?? '').slice(0, 10),
        sourceWoNo: String(r.sourceWoNo ?? r.reqNo ?? 'BOM Plan'),
        status: String(r.status ?? 'DRAFT') as RmRequisitionRecord['status'],
      });
    }
  }
  return rows;
}

export default function ProductionRequisitionsPage() {
  const [reqs, setReqs] = useState<RmRequisitionRecord[]>([]);
  const [activeSiteId, setActiveSiteId] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadReqs = useCallback(async (siteIdFilter: string) => {
    const siteQuery = siteIdFilter ? `?siteId=${encodeURIComponent(siteIdFilter)}` : '';
    const reqRes = await fetch(`/api/proxy/production/requisitions${siteQuery}`).then((r) =>
      r.ok ? r.json() : [],
    );
    const list = Array.isArray(reqRes) ? reqRes : Array.isArray(reqRes?.data) ? reqRes.data : [];
    setReqs(normalizeRequisitions(list));
  }, []);

  useEffect(() => {
    const storedSite =
      typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') ?? '' : '';
    const effectiveSite = storedSite && storedSite !== 'all' ? storedSite : '';
    setActiveSiteId(effectiveSite);

    if (!effectiveSite) {
      fetch('/api/auth/me')
        .then((r) => (r.ok ? r.json() : null))
        .then((me) => {
          const fallback = me?.user?.activeSiteId || me?.user?.sites?.[0]?.id || '';
          if (fallback) setActiveSiteId(String(fallback));
        })
        .catch(() => {});
    }

    loadReqs(effectiveSite).catch(() => {});
  }, [loadReqs]);

  const handleGenerateFromPlan = async () => {
    try {
      setBusy(true);
      const res = await fetch('/api/proxy/production/requisitions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: activeSiteId || undefined,
          demands: [],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadReqs(activeSiteId);
      setToast('Generated RM requisitions from planned Work Orders minus available & inbound stock.');
    } catch (err) {
      setToast(`Unable to generate requisitions: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (id: string, endpoint: string, label: string) => {
    try {
      setBusy(true);
      const res = await fetch(`/api/proxy/production/requisitions/${encodeURIComponent(id)}/${endpoint}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadReqs(activeSiteId);
      setToast(label);
    } catch (err) {
      setToast(`Failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteDraft = async (id: string) => {
    try {
      setBusy(true);
      const res = await fetch(`/api/proxy/production/requisitions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || `HTTP ${res.status}`);
      }
      await loadReqs(activeSiteId);
      setToast('Deleted requisition.');
    } catch (err) {
      setToast(`Failed to delete requisition: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/production" className="hover:text-ink">Production</Link>
            <span>/</span>
            <span className="text-orange-400">Material Requests (RM)</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Raw Material Requisitions</h1>
          <p className="text-sm text-ink-3">
            Auto-calculate RM shortfalls from planned Work Orders &amp; BOMs, approve, and convert to PO.
          </p>
        </div>
        <Button variant="primary" disabled={busy} onClick={handleGenerateFromPlan}>
          ⚡ Generate from Production Plan
        </Button>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-leaf-soft border border-leaf/30 text-leaf text-sm">
          {toast}
        </div>
      )}

      <div className="bg-sheet border border-rule rounded-[3px] overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper border-b border-rule text-xs uppercase text-ink-3">
            <tr>
              <th className="p-3">Req #</th>
              <th className="p-3">Raw Material</th>
              <th className="p-3">Source</th>
              <th className="p-3 text-right">Qty Needed</th>
              <th className="p-3">Needed By</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {reqs.map((r, idx) => {
              const st = String(r.status);
              const canApprove = st === 'DRAFT' || st === 'PENDING' || st === 'OPEN';
              const canConvert = st === 'APPROVED';
              const canDelete = st === 'DRAFT' || st === 'CANCELLED';
              return (
                <tr key={`${r.id}-${r.itemId}-${idx}`} className="hover:bg-sunken">
                  <td className="p-3 font-mono text-xs text-orange-400 font-semibold">{r.reqNo}</td>
                  <td className="p-3">
                    <div className="text-ink font-medium">{r.itemName}</div>
                    <div className="text-[11px] font-mono text-ink-3">{r.itemSku}</div>
                  </td>
                  <td className="p-3 text-xs font-mono text-ink-2">{r.sourceWoNo || 'Manual'}</td>
                  <td className="p-3 text-right font-mono font-bold text-ink">
                    {r.qty} {r.uom}
                  </td>
                  <td className="p-3 text-xs font-mono text-ink-2">{r.neededBy}</td>
                  <td className="p-3">
                    <StatusPill
                      status={st}
                      tone={
                        st === 'CONVERTED' || st === 'PO_CREATED' || st === 'APPROVED'
                          ? 'emerald'
                          : st === 'CANCELLED'
                            ? 'rose'
                            : 'amber'
                      }
                    />
                  </td>
                  <td className="p-3 text-right space-x-2">
                    {canApprove && (
                      <button
                        disabled={busy}
                        onClick={() => runAction(r.id, 'approve', `Approved requisition ${r.reqNo}.`)}
                        className="text-xs text-action hover:text-action font-medium"
                      >
                        Approve
                      </button>
                    )}
                    {canConvert && (
                      <button
                        disabled={busy}
                        onClick={() => runAction(r.id, 'convert-to-po', `Converted ${r.reqNo} to PO.`)}
                        className="text-xs text-leaf hover:text-leaf font-medium"
                      >
                        Convert to PO
                      </button>
                    )}
                    {canDelete && (
                      <button
                        disabled={busy}
                        onClick={() => deleteDraft(r.id)}
                        className="text-xs text-madder hover:text-madder font-medium"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
