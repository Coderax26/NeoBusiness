/**
 * @neo/shared — Production, BOM Versioning, RM Plan Generation & Yield Rules (Phase F7)
 * Implements:
 * - BOM Scaling & Owner-Only Cost Roll-up (G-M4-1)
 * - BOM Activation (deactivates previous active BOM for the same item)
 * - RM Requisition Generation: BOM x planned WO qty - current stock
 * - BR-06 / OD-012: Yield Mass-Balance (±3% tolerance, never blocks completion)
 * - PROD_MGR Financial/Cost Masking
 */

import { evaluateBatchYield } from './business-rules.js';

export interface BomIngredient {
  itemId: string;
  itemSku: string;
  itemName: string;
  qty: number;
  uom: string;
  expectedLossPct: number;
  unitCost?: number; // Owner-only; masked for PROD_MGR
}

export interface BomRecord {
  id: string;
  code: string;
  version: number;
  finishedItemId: string;
  finishedItemName: string;
  outputQty: number;
  outputUom: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  steps: string[];
  ingredients: BomIngredient[];
}

export function scaleBomIngredients(
  ingredients: BomIngredient[],
  baseOutputQty: number,
  targetOutputQty: number,
): Array<BomIngredient & { scaledQty: number }> {
  const factor = baseOutputQty > 0 ? targetOutputQty / baseOutputQty : 0;
  return ingredients.map((ing) => ({
    ...ing,
    scaledQty: Number((ing.qty * factor * (1 + ing.expectedLossPct / 100)).toFixed(2)),
  }));
}

export function calculateBomCostRollup(
  ingredients: BomIngredient[],
  outputQty: number,
): { totalBatchCost: number; costPerUnit: number } {
  const totalBatchCost = Number(
    ingredients
      .reduce((sum, ing) => sum + ing.qty * (ing.unitCost ?? 0), 0)
      .toFixed(2),
  );
  const costPerUnit =
    outputQty > 0 ? Number((totalBatchCost / outputQty).toFixed(2)) : 0;
  return { totalBatchCost, costPerUnit };
}

/**
 * Acceptance Criterion #3: Activating a BOM version deactivates the previous active one
 * for the same finishedItemId.
 */
export function activateBomVersion(
  boms: BomRecord[],
  bomIdToActivate: string,
): { updated: BomRecord[]; deactivatedIds: string[] } {
  const target = boms.find((b) => b.id === bomIdToActivate);
  if (!target) return { updated: boms, deactivatedIds: [] };

  const deactivatedIds: string[] = [];
  const updated = boms.map((b) => {
    if (b.id === bomIdToActivate) {
      return { ...b, status: 'ACTIVE' as const };
    }
    if (b.finishedItemId === target.finishedItemId && b.status === 'ACTIVE') {
      deactivatedIds.push(b.id);
      return { ...b, status: 'ARCHIVED' as const };
    }
    return b;
  });

  return { updated, deactivatedIds };
}

export interface PlannedWorkOrderInput {
  id: string;
  woNumber: string;
  finishedItemId: string;
  bomId: string;
  plannedQty: number;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}

export interface GeneratedRmNeed {
  itemId: string;
  itemSku: string;
  itemName: string;
  uom: string;
  requiredQty: number;
  availableStock: number;
  shortfallQty: number;
}

/**
 * Acceptance Criterion #4: Generates RM needs matching (BOM x planned qty) - stock.
 */
export function generateRmRequisitionsFromPlan(
  workOrders: PlannedWorkOrderInput[],
  boms: BomRecord[],
  stockByItemId: Record<string, number>,
): GeneratedRmNeed[] {
  const totals = new Map<string, GeneratedRmNeed>();

  for (const wo of workOrders) {
    if (wo.status !== 'PLANNED') continue;
    const bom =
      boms.find((b) => b.id === wo.bomId) ||
      boms.find((b) => b.finishedItemId === wo.finishedItemId && b.status === 'ACTIVE');
    if (!bom) continue;

    const factor = bom.outputQty > 0 ? wo.plannedQty / bom.outputQty : 0;
    for (const ing of bom.ingredients) {
      const reqQty = Number((ing.qty * factor).toFixed(2));
      const existing = totals.get(ing.itemId);
      if (existing) {
        existing.requiredQty = Number((existing.requiredQty + reqQty).toFixed(2));
      } else {
        const availableStock = stockByItemId[ing.itemId] ?? 0;
        totals.set(ing.itemId, {
          itemId: ing.itemId,
          itemSku: ing.itemSku,
          itemName: ing.itemName,
          uom: ing.uom,
          requiredQty: reqQty,
          availableStock,
          shortfallQty: 0,
        });
      }
    }
  }

  const needs: GeneratedRmNeed[] = [];
  for (const item of totals.values()) {
    const shortfall = Number(Math.max(0, item.requiredQty - item.availableStock).toFixed(2));
    if (shortfall > 0) {
      needs.push({ ...item, shortfallQty: shortfall });
    }
  }
  return needs;
}

export interface WoYieldEvaluation {
  yieldPct: number;
  variancePct: number;
  exceedsTolerance: boolean;
  label: 'Good' | 'Slightly low' | 'Low';
  warningBanner: string | null;
  raisesYieldVarianceException: boolean;
  canComplete: true; // BR-06: never blocks completion
}

/**
 * BR-06 & OD-012: Evaluates Work Order yield (±3% tolerance) and formats
 * plain-language feedback for non-tech users. Completion is never blocked.
 */
export function evaluateWoYieldStatus(
  issuedRmKg: number,
  actualOutputKg: number,
  scrapKg = 0,
): WoYieldEvaluation {
  const res = evaluateBatchYield(issuedRmKg, actualOutputKg, scrapKg, 3);
  const variancePct =
    issuedRmKg > 0
      ? Number((((actualOutputKg - issuedRmKg) / issuedRmKg) * 100).toFixed(1))
      : 0;
  const outside = Math.abs(variancePct) > 3 || res.exceedsTolerance;

  let label: WoYieldEvaluation['label'] = 'Good';
  if (outside && Math.abs(variancePct) > 5) label = 'Low';
  else if (outside) label = 'Slightly low';

  const warningBanner = outside
    ? `Expected ${issuedRmKg} kg · Got ${actualOutputKg} kg · ${res.yieldPct}% (${variancePct > 0 ? `+${variancePct}` : variancePct}%) — outside ±3%, Owner will be informed`
    : null;

  return {
    yieldPct: res.yieldPct,
    variancePct,
    exceedsTolerance: outside,
    label,
    warningBanner,
    raisesYieldVarianceException: outside,
    canComplete: true,
  };
}

/**
 * Acceptance Criterion #5: Strips any financial/cost fields for PROD_MGR views.
 */
export function maskWorkOrderForProdMgr<T extends Record<string, unknown>>(
  record: T,
): Omit<T, 'unitCost' | 'totalCost' | 'costPerUnit' | 'estimatedCost' | 'price'> {
  const forbidden = new Set(['unitCost', 'totalCost', 'costPerUnit', 'estimatedCost', 'price']);
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (!forbidden.has(k)) {
      clean[k] = v;
    }
  }
  return clean as Omit<T, 'unitCost' | 'totalCost' | 'costPerUnit' | 'estimatedCost' | 'price'>;
}

