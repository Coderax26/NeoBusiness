'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Card, Dialog } from '@neo/ui';
import {
  formatINR,
  scaleBomIngredients,
  calculateBomCostRollup,
  canViewMarginAndCost,
  type BomRecord,
  type SessionUser,
} from '@neo/shared';

interface CatalogItem {
  id: string;
  name: string;
  skuCode: string;
  category: string;
  primaryUom: string;
}

export default function BomsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [activeSiteId, setActiveSiteId] = useState('');
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [selectedBomId, setSelectedBomId] = useState<string>('');
  const [scaleTargetQty, setScaleTargetQty] = useState<number>(100);
  const [liveRollup, setLiveRollup] = useState<{ totalBatchCost: number; costPerUnit: number } | null>(null);
  const [toast, setToast] = useState<{ msg: string; isError?: boolean } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newBomNo, setNewBomNo] = useState('');
  const [newFgItemId, setNewFgItemId] = useState('');
  const [newLines, setNewLines] = useState<Array<{ itemId: string; qtyPerUnit: string }>>([
    { itemId: '', qtyPerUnit: '1.05' },
  ]);
  const [newYieldPct, setNewYieldPct] = useState('97.00');
  const [busy, setBusy] = useState(false);

  const loadBoms = useCallback(async (siteIdFilter: string) => {
    const siteQuery = siteIdFilter ? `?siteId=${encodeURIComponent(siteIdFilter)}` : '';
    const res = await fetch(`/api/proxy/production/boms${siteQuery}`).then((r) => (r.ok ? r.json() : []));
    const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    const normalized: BomRecord[] = rows.map((b: any) => ({
      id: String(b.id),
      code: String(b.code ?? b.bomNo ?? b.bom_no ?? 'BOM'),
      version: Number(b.version ?? 1),
      finishedItemId: String(b.finishedItemId ?? b.itemId ?? ''),
      finishedItemName: String(b.finishedItemName ?? b.itemName ?? 'Item'),
      outputQty: Number(b.outputQty ?? 1),
      outputUom: String(b.outputUom ?? b.uom ?? 'KG'),
      steps: Array.isArray(b.steps)
        ? b.steps
        : [`Blend ${(b.lines ?? []).length} raw material components and verify ${b.yieldPct ?? '95'}% yield`],
      status: (b.status === 'OBSOLETE' ? 'ARCHIVED' : b.status ?? 'DRAFT') as BomRecord['status'],
      ingredients: Array.isArray(b.ingredients)
        ? b.ingredients
        : Array.isArray(b.lines)
          ? b.lines.map((l: any) => ({
              itemId: String(l.itemId ?? l.componentItemId ?? ''),
              itemSku: String(l.itemSkuCode ?? l.itemSku ?? ''),
              itemName: String(l.itemName ?? l.componentItemName ?? 'Ingredient'),
              qty: Number(l.qtyPerUnit ?? l.qty ?? 0),
              uom: String(l.uom ?? 'KG'),
              expectedLossPct: Number(l.expectedLossPct ?? l.scrapPct ?? 0),
              unitCost: Number(l.unitCost ?? 0),
            }))
          : [],
    }));
    setBoms(normalized);
    setSelectedBomId((prev) =>
      prev && normalized.some((b) => b.id === prev) ? prev : normalized[0]?.id ?? '',
    );
  }, []);

  useEffect(() => {
    let active = true;
    setNewBomNo((prev) => prev || `BOM-${Date.now().toString().slice(-4)}`);
    const storedSite =
      typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') ?? '' : '';
    const effectiveSite = storedSite && storedSite !== 'all' ? storedSite : '';
    setActiveSiteId(effectiveSite);

    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        if (d?.user) setUser(d.user);
        if (!effectiveSite) {
          const fallback = d?.user?.activeSiteId || d?.user?.sites?.[0]?.id || '';
          if (fallback) setActiveSiteId(String(fallback));
        }
      })
      .catch(() => {});

    fetch('/api/proxy/items')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        const mapped: CatalogItem[] = rows.map((i: any) => ({
          id: String(i.id),
          name: String(i.name ?? ''),
          skuCode: String(i.sku_code ?? i.skuCode ?? ''),
          category: String(i.category ?? i.item_category ?? ''),
          primaryUom: String(i.primary_uom ?? i.primaryUom ?? 'KG'),
        }));
        setItems(mapped);
        const fgs = mapped.filter((i) => i.category === 'PROCESSED_FG');
        const rms = mapped.filter((i) => i.category === 'RAW_MATERIAL' || i.category === 'PACKAGING');
        if (fgs.length > 0) setNewFgItemId(fgs[0].id);
        if (rms.length > 0) {
          setNewLines((prev) =>
            prev.length === 1 && !prev[0].itemId ? [{ itemId: rms[0].id, qtyPerUnit: '1.05' }] : prev,
          );
        }
      })
      .catch(() => {});

    loadBoms(effectiveSite).catch(() => {});
    return () => {
      active = false;
    };
  }, [loadBoms]);

  const showCostRollup = !user || canViewMarginAndCost(user.role);
  const selectedBom = boms.find((b) => b.id === selectedBomId) || boms[0] || {
    id: '',
    code: '—',
    version: 1,
    finishedItemId: '',
    finishedItemName: 'No BOMs loaded',
    outputQty: 1,
    outputUom: 'KG',
    steps: [],
    status: 'DRAFT' as const,
    ingredients: [],
  };

  useEffect(() => {
    if (!showCostRollup || !selectedBom.id || selectedBom.id.startsWith('bom-')) {
      setLiveRollup(null);
      return;
    }
    let active = true;
    fetch(`/api/proxy/production/boms/${encodeURIComponent(selectedBom.id)}/cost-rollup`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (!active || !res) return;
        const d = res?.data ?? res;
        const costPerUnit = Number(
          d?.totalCostPerUnit ?? d?.estimatedCostPerUnitInr ?? d?.costPerUnit ?? 0,
        );
        if (Number.isFinite(costPerUnit)) {
          setLiveRollup({
            totalBatchCost: Number((costPerUnit * selectedBom.outputQty).toFixed(2)),
            costPerUnit: Number(costPerUnit.toFixed(2)),
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedBom.id, selectedBom.outputQty, showCostRollup]);

  const scaledIngredients = useMemo(
    () => scaleBomIngredients(selectedBom.ingredients, selectedBom.outputQty, scaleTargetQty),
    [selectedBom, scaleTargetQty],
  );

  const clientRollup = useMemo(
    () => calculateBomCostRollup(selectedBom.ingredients, selectedBom.outputQty),
    [selectedBom],
  );
  const costRollup = liveRollup && liveRollup.costPerUnit > 0 ? liveRollup : clientRollup;

  const showToast = (msg: string, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 5000);
  };

  const handleActivate = async (bom: BomRecord) => {
    try {
      setBusy(true);
      const res = await fetch(`/api/proxy/production/boms/${encodeURIComponent(bom.id)}/activate`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || `HTTP ${res.status}`);
      }
      await loadBoms(activeSiteId);
      showToast(`Activated ${bom.code} (v${bom.version}).`);
    } catch (err) {
      showToast(`Failed to activate BOM: ${(err as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDraft = async (bom: BomRecord) => {
    if (bom.status !== 'DRAFT') return;
    try {
      setBusy(true);
      const res = await fetch(`/api/proxy/production/boms/${encodeURIComponent(bom.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || `HTTP ${res.status}`);
      }
      await loadBoms(activeSiteId);
      showToast(`Deleted draft ${bom.code}.`);
    } catch (err) {
      showToast(`Failed to delete draft: ${(err as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateDraft = async () => {
    const validLines = newLines.filter((l) => l.itemId && Number(l.qtyPerUnit) > 0);
    if (!newFgItemId || validLines.length === 0 || !newBomNo.trim()) {
      showToast('Select a Finished Good, add at least one Raw Material / Packaging ingredient, and enter a BOM Code.', true);
      return;
    }
    try {
      setBusy(true);
      const res = await fetch('/api/proxy/production/boms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bomNo: newBomNo.trim(),
          itemId: newFgItemId,
          siteId: activeSiteId || undefined,
          status: 'DRAFT',
          yieldPct: newYieldPct || '95.00',
          lines: validLines.map((l, idx) => {
            const rmItem = items.find((i) => i.id === l.itemId);
            return {
              itemId: l.itemId,
              qtyPerUnit: l.qtyPerUnit || '1.00',
              uom: rmItem?.primaryUom || 'KG',
              sequenceNo: idx + 1,
              isCritical: idx === 0,
            };
          }),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadBoms(activeSiteId);
      setCreateOpen(false);
      setNewBomNo(`BOM-${Date.now().toString().slice(-4)}`);
      showToast(`Created draft recipe ${newBomNo}.`);
    } catch (err) {
      showToast(`Failed to create draft BOM: ${(err as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  };

  const fgItems = items.filter((i) => i.category === 'PROCESSED_FG');
  const rmItems = items.filter((i) => i.category === 'RAW_MATERIAL' || i.category === 'PACKAGING');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/production" className="hover:text-ink">Production</Link>
            <span>/</span>
            <span className="text-orange-400">Recipes &amp; BOMs</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Recipes / Bills of Material</h1>
          <p className="text-sm text-ink-3">
            Recipe-card view with batch scale calculator, single-active-version control, and owner-only cost roll-up.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          + New Draft Recipe
        </Button>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-3">
          {boms.map((bom) => (
            <div
              key={bom.id}
              onClick={() => setSelectedBomId(bom.id)}
              className={`p-4 rounded-[3px] border cursor-pointer transition-colors ${
                selectedBom.id === bom.id
                  ? 'bg-orange-500/10 border-orange-500'
                  : 'bg-sheet border-rule hover:border-rule-strong'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-orange-400 font-bold">
                  {bom.code} (v{bom.version})
                </span>
                <StatusPill
                  status={bom.status}
                  tone={
                    bom.status === 'ACTIVE'
                      ? 'emerald'
                      : bom.status === 'DRAFT'
                        ? 'amber'
                        : 'slate'
                  }
                />
              </div>
              <div className="text-sm font-semibold text-ink mt-1">
                {bom.finishedItemName}
              </div>
              <div className="text-xs text-ink-3 mt-1">
                Base {bom.outputQty} {bom.outputUom} · {bom.ingredients.length} ingredients
              </div>
              <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                {bom.status === 'DRAFT' && (
                  <>
                    <Button variant="primary" disabled={busy} onClick={() => handleActivate(bom)}>
                      Activate Version
                    </Button>
                    <Button variant="secondary" disabled={busy} onClick={() => handleDeleteDraft(bom)}>
                      Delete Draft
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5 bg-sheet border-rule space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-rule">
              <div>
                <h2 className="text-lg font-bold text-ink">
                  Recipe Card: {selectedBom.finishedItemName}
                </h2>
                <p className="text-xs text-ink-3">
                  {selectedBom.code} · Base: {selectedBom.outputQty} {selectedBom.outputUom}
                </p>
              </div>
              {showCostRollup && (
                <div className="text-right">
                  <div className="text-[11px] text-ink-3">Estimated Cost Roll-up (Owner)</div>
                  <div className="text-sm font-bold text-leaf font-mono">
                    {formatINR(costRollup.costPerUnit)} / {selectedBom.outputUom}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 rounded-lg bg-paper border border-rule flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-ink-2 font-medium">
                Scale Calculator: Make{' '}
                <input
                  type="number"
                  value={scaleTargetQty}
                  onChange={(e) => setScaleTargetQty(Number(e.target.value) || 0)}
                  className="w-24 mx-1 bg-sheet border border-rule-strong rounded px-2 py-1 text-ink font-mono"
                />{' '}
                {selectedBom.outputUom} → needs:
              </div>
              <Badge variant="info">Includes expected process loss %</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-ink-3 border-b border-rule">
                  <tr>
                    <th className="py-2">Ingredient</th>
                    <th className="py-2 text-right">Per {selectedBom.outputQty} {selectedBom.outputUom}</th>
                    <th className="py-2 text-right">Loss %</th>
                    <th className="py-2 text-right">Scaled ({scaleTargetQty} {selectedBom.outputUom})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {scaledIngredients.map((ing) => (
                    <tr key={ing.itemId}>
                      <td className="py-2.5 text-ink font-medium">{ing.itemName}</td>
                      <td className="py-2.5 text-right font-mono text-ink-2">
                        {ing.qty} {ing.uom}
                      </td>
                      <td className="py-2.5 text-right font-mono text-ink-3">
                        {ing.expectedLossPct}%
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-orange-400">
                        {ing.scaledQty} {ing.uom}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-2 border-t border-rule">
              <h4 className="text-xs font-semibold uppercase text-ink-3 mb-2">Process Steps</h4>
              <ol className="list-decimal list-inside space-y-1 text-xs text-ink-2">
                {selectedBom.steps.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ol>
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create Draft BOM">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-ink-3 mb-1">BOM Code</label>
            <input
              type="text"
              value={newBomNo}
              onChange={(e) => setNewBomNo(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-3 mb-1">Finished Good Item (PROCESSED_FG)</label>
            <select
              value={newFgItemId}
              onChange={(e) => setNewFgItemId(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            >
              {fgItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.skuCode})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs text-ink-3">Ingredients (Raw Materials &amp; Packaging)</label>
              <button
                type="button"
                onClick={() =>
                  setNewLines((prev) => [
                    ...prev,
                    { itemId: rmItems[0]?.id ?? '', qtyPerUnit: '1.00' },
                  ])
                }
                className="text-xs font-semibold text-action hover:underline"
              >
                + Add Ingredient
              </button>
            </div>
            {newLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select
                  value={line.itemId}
                  onChange={(e) =>
                    setNewLines((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, itemId: e.target.value } : x)),
                    )
                  }
                  className="col-span-7 bg-paper border border-rule-strong rounded-lg p-2 text-xs text-ink"
                >
                  <option value="">Select ingredient...</option>
                  {rmItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.skuCode} · {i.primaryUom})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.001"
                  value={line.qtyPerUnit}
                  onChange={(e) =>
                    setNewLines((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, qtyPerUnit: e.target.value } : x)),
                    )
                  }
                  placeholder="Qty / unit"
                  className="col-span-3 bg-paper border border-rule-strong rounded-lg p-2 text-xs font-mono text-ink"
                />
                {newLines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setNewLines((prev) => prev.filter((_, i) => i !== idx))}
                    className="col-span-2 text-xs text-madder hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs text-ink-3 mb-1">Target Yield %</label>
            <input
              type="text"
              value={newYieldPct}
              onChange={(e) => setNewYieldPct(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={handleCreateDraft}>Create Draft</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
