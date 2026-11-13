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
import { INITIAL_BOMS } from '../../../src/lib/production-data';

export default function BomsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [boms, setBoms] = useState<BomRecord[]>(INITIAL_BOMS);
  const [selectedBomId, setSelectedBomId] = useState<string>(INITIAL_BOMS[0].id);
  const [scaleTargetQty, setScaleTargetQty] = useState<number>(500);
  const [toast, setToast] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('Premium Dairy Cattle Feed (50kg)');
  const [newOutputQty, setNewOutputQty] = useState(100);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) setUser(d.user);
      })
      .catch(() => {});
  }, []);

  const showCostRollup = !user || canViewMarginAndCost(user.role);
  const selectedBom = boms.find((b) => b.id === selectedBomId) || boms[0];

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
      ingredients: INITIAL_BOMS[0].ingredients,
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
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
            <Link href="/production" className="hover:text-white">Production</Link>
            <span>/</span>
            <span className="text-orange-400">Recipes &amp; BOMs</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Recipes / Bills of Material</h1>
          <p className="text-sm text-zinc-400">
            Recipe-card view with batch scale calculator, single-active-version control, and owner-only cost roll-up.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          + New Draft Recipe
        </Button>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm">
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
              className={`p-4 rounded-xl border cursor-pointer transition-colors ${
                selectedBom.id === bom.id
                  ? 'bg-orange-500/10 border-orange-500'
                  : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
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
              <div className="text-sm font-semibold text-white mt-1">
                {bom.finishedItemName}
              </div>
              <div className="text-xs text-zinc-400 mt-1">
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
          <Card className="p-5 bg-zinc-900 border-zinc-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Recipe Card: {selectedBom.finishedItemName}
                </h2>
                <p className="text-xs text-zinc-400">
                  {selectedBom.code} · Base batch: {selectedBom.outputQty} {selectedBom.outputUom}
                </p>
              </div>
              {showCostRollup && (
                <div className="text-right">
                  <div className="text-[11px] text-zinc-400">Estimated Cost Roll-up (Owner)</div>
                  <div className="text-sm font-bold text-emerald-400 font-mono">
                    {formatINR(costRollup.costPerUnit)} / {selectedBom.outputUom} ({formatINR(costRollup.totalBatchCost)}/batch)
                  </div>
                </div>
              )}
            </div>

            {/* Scale Calculator */}
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-zinc-300 font-medium">
                Scale Calculator: Make{' '}
                <input
                  type="number"
                  value={scaleTargetQty}
                  onChange={(e) => setScaleTargetQty(Number(e.target.value) || 0)}
                  className="w-24 mx-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white font-mono"
                />{' '}
                {selectedBom.outputUom} → needs:
              </div>
              <Badge variant="info">Includes expected process loss %</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-zinc-400 border-b border-zinc-800">
                  <tr>
                    <th className="py-2">Ingredient</th>
                    <th className="py-2 text-right">Base ({selectedBom.outputQty} {selectedBom.outputUom})</th>
                    <th className="py-2 text-right">Loss %</th>
                    <th className="py-2 text-right">Scaled ({scaleTargetQty} {selectedBom.outputUom})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {scaledIngredients.map((ing) => (
                    <tr key={ing.itemId}>
                      <td className="py-2.5 text-white font-medium">{ing.itemName}</td>
                      <td className="py-2.5 text-right font-mono text-zinc-300">
                        {ing.qty} {ing.uom}
                      </td>
                      <td className="py-2.5 text-right font-mono text-zinc-400">
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

            <div className="pt-2 border-t border-zinc-800">
              <h4 className="text-xs font-semibold uppercase text-zinc-400 mb-2">
                Process Steps
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-xs text-zinc-300">
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
            <label className="block text-xs text-zinc-400 mb-1">Finished Item</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Base Output Qty (kg)</label>
            <input
              type="number"
              value={newOutputQty}
              onChange={(e) => setNewOutputQty(Number(e.target.value))}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
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

