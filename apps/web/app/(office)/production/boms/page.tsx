'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Card, Dialog } from '@neo/ui';
import {
  formatINR,
  scaleBomIngredients,
  calculateBomCostRollup,
  activateBomVersion,
  canViewMarginAndCost,
  type BomRecord,
  type SessionUser,
} from '@neo/shared';

export default function BomsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [selectedBomId, setSelectedBomId] = useState<string>('');
  const [scaleTargetQty, setScaleTargetQty] = useState<number>(500);
  const [toast, setToast] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('Premium Dairy Cattle Feed (50kg)');
  const [newOutputQty, setNewOutputQty] = useState(100);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.user) setUser(d.user);
      })
      .catch(() => {});

    const storedSite =
      typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') : null;
    const siteQuery =
      storedSite && storedSite !== 'all' ? `?siteId=${encodeURIComponent(storedSite)}` : '';

    fetch(`/api/proxy/production/boms${siteQuery}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        const normalized: BomRecord[] = rows.map((b: any) => ({
          id: String(b.id),
          code: String(b.code ?? b.bomNo ?? b.bom_no ?? 'BOM'),
          name: String(b.name ?? b.itemName ?? b.bomNo ?? 'BOM'),
          version: Number(b.version ?? 1),
          outputItemId: String(b.outputItemId ?? b.itemId ?? ''),
          outputItemName: String(b.outputItemName ?? b.itemName ?? 'Item'),
          outputQty: Number(b.outputQty ?? b.batch_size ?? 100),
          outputUom: String(b.outputUom ?? b.uom ?? 'kg'),
          finishedItemId: String(b.finishedItemId ?? b.itemId ?? ''),
          finishedItemName: String(b.finishedItemName ?? b.itemName ?? 'Item'),
          steps: Array.isArray(b.steps) ? b.steps : [],
          status: (b.status ?? 'ACTIVE') as BomRecord['status'],
          ingredients: Array.isArray(b.ingredients)
            ? b.ingredients
            : Array.isArray(b.lines)
              ? b.lines.map((l: any) => ({
                  itemId: String(l.itemId ?? l.componentItemId ?? ''),
                  itemName: String(l.itemName ?? l.componentItemName ?? 'Ingredient'),
                  qtyPerBatch: Number(l.qtyPerBatch ?? l.qtyPerUnit ?? l.qty ?? 0),
                  uom: String(l.uom ?? 'kg'),
                  unitCost: Number(l.unitCost ?? 0),
                  wastagePct: Number(l.wastagePct ?? l.scrapPct ?? 0),
                }))
              : [],
        }));
        setBoms(normalized);
        if (normalized.length > 0) setSelectedBomId(normalized[0].id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const showCostRollup = !user || canViewMarginAndCost(user.role);
  const selectedBom = boms.find((b) => b.id === selectedBomId) || boms[0] || {
    id: '',
    code: '—',
    name: 'No BOMs loaded',
    version: 1,
    outputItemId: '',
    outputItemName: '—',
    outputQty: 1,
    outputUom: 'kg',
    finishedItemId: '',
    finishedItemName: '—',
    steps: [],
    status: 'DRAFT',
    ingredients: [],
  } as BomRecord;

  const scaledIngredients = useMemo(
    () =>
      scaleBomIngredients(
        selectedBom.ingredients,
        selectedBom.outputQty,
        scaleTargetQty,
      ),
    [selectedBom, scaleTargetQty],
  );

  const costRollup = useMemo(
    () => calculateBomCostRollup(selectedBom.ingredients, selectedBom.outputQty),
    [selectedBom],
  );

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleActivate = (bom: BomRecord) => {
    fetch(`/api/bff/production/boms/${bom.id}/activate`, { method: 'POST' }).catch(() => {});
    const res = activateBomVersion(boms, bom.id);
    setBoms(res.updated);
    showToast(
      `Activated ${bom.code} (v${bom.version}). Deactivated ${res.deactivatedIds.length} previous active version(s).`,
    );
  };

  const handleDeleteDraft = (bom: BomRecord) => {
    if (bom.status !== 'DRAFT') return;
    fetch(`/api/bff/production/boms/${bom.id}`, { method: 'DELETE' }).catch(() => {});
    const remaining = boms.filter((b) => b.id !== bom.id);
    setBoms(remaining);
    if (remaining[0]) setSelectedBomId(remaining[0].id);
    showToast(`Deleted draft ${bom.code}.`);
  };

  const handleCreateDraft = () => {
    const draft: BomRecord = {
      id: `bom-draft-${Date.now()}`,
      code: `BOM-NEW-V${boms.length + 1}`,
      version: boms.length + 1,
      finishedItemId: 'itm-feed-fg',
      finishedItemName: newName,
      outputQty: newOutputQty,
      outputUom: 'kg',
      status: 'DRAFT',
      steps: ['Standard batch mix & pack'],
      ingredients: boms[0]?.ingredients ?? [],
    };
    setBoms((prev) => [draft, ...prev]);
    setSelectedBomId(draft.id);
    setCreateOpen(false);
    showToast(`Created draft recipe ${draft.code}.`);
  };

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
        <div className="p-3 rounded-lg bg-leaf-soft border border-leaf/30 text-leaf text-sm">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* BOM List */}
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
                Yields {bom.outputQty} {bom.outputUom} · {bom.ingredients.length} ingredients
              </div>
              <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                {bom.status === 'DRAFT' && (
                  <>
                    <Button variant="primary" onClick={() => handleActivate(bom)}>
                      Activate Version
                    </Button>
                    <Button variant="secondary" onClick={() => handleDeleteDraft(bom)}>
                      Delete Draft
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Recipe Card Preview + Scale Calculator */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5 bg-sheet border-rule space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-rule">
              <div>
                <h2 className="text-lg font-bold text-ink">
                  Recipe Card: {selectedBom.finishedItemName}
                </h2>
                <p className="text-xs text-ink-3">
                  {selectedBom.code} · Base batch: {selectedBom.outputQty} {selectedBom.outputUom}
                </p>
              </div>
              {showCostRollup && (
                <div className="text-right">
                  <div className="text-[11px] text-ink-3">Estimated Cost Roll-up (Owner)</div>
                  <div className="text-sm font-bold text-leaf font-mono">
                    {formatINR(costRollup.costPerUnit)} / {selectedBom.outputUom} ({formatINR(costRollup.totalBatchCost)}/batch)
                  </div>
                </div>
              )}
            </div>

            {/* Scale Calculator */}
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
                    <th className="py-2 text-right">Base ({selectedBom.outputQty} {selectedBom.outputUom})</th>
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
              <h4 className="text-xs font-semibold uppercase text-ink-3 mb-2">
                Process Steps
              </h4>
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
            <label className="block text-xs text-ink-3 mb-1">Finished Item</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-3 mb-1">Base Output Qty (kg)</label>
            <input
              type="number"
              value={newOutputQty}
              onChange={(e) => setNewOutputQty(Number(e.target.value))}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreateDraft}>Create Draft</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

