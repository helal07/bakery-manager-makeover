/**
 * Pure recipe/production costing. Kept free of React and Supabase so the
 * numbers that end up on invoices and cost reports can be unit-tested.
 */
import type { ExpandedMaterial } from "@/lib/sub-recipe-store";

export type MaterialCosts = Record<string, { cost: number } | undefined>;

/** Cost of an expanded material list at the given per-unit material costs. */
export function materialCostOf(expanded: ExpandedMaterial[], costs: MaterialCosts): number {
  return expanded.reduce((s, r) => s + (costs[r.materialId]?.cost ?? 0) * (Number(r.total) || 0), 0);
}

export type OverheadRow = { amount: number; mode?: "per_batch" | "per_unit" | string | null };

/** Total overhead for a batch of `batchQty` units. */
export function overheadCostOf(rows: OverheadRow[], batchQty = 1): number {
  const qty = Number(batchQty) || 0;
  return rows.reduce((s, r) => {
    const a = Number(r.amount) || 0;
    return s + (r.mode === "per_unit" ? a * qty : a);
  }, 0);
}

/** Full batch cost breakdown. */
export function batchCost(input: {
  expandedPerUnit: ExpandedMaterial[];
  costs: MaterialCosts;
  overheads?: OverheadRow[];
  batchQty?: number;
}) {
  const batchQty = Number(input.batchQty ?? 1) || 0;
  const materialPerUnit = materialCostOf(input.expandedPerUnit, input.costs);
  const material = materialPerUnit * batchQty;
  const overhead = overheadCostOf(input.overheads ?? [], batchQty);
  const total = material + overhead;
  return {
    batchQty,
    materialPerUnit,
    material,
    overhead,
    total,
    unitCost: batchQty > 0 ? total / batchQty : 0,
  };
}
