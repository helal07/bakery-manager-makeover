import { describe, it, expect } from "vitest";
import { materialCostOf, overheadCostOf, batchCost } from "@/lib/recipe-cost";
import { expandIngredients, type SubRecipe } from "@/lib/sub-recipe-store";

const costs = {
  flour: { cost: 60 },
  water: { cost: 0 },
  yeast: { cost: 400 },
  sugar: { cost: 120 },
};

const dough: SubRecipe = {
  id: "dough",
  name: "Master dough",
  yield_qty: 10,
  yield_unit: "kg",
  is_active: true,
  items: [
    { materialId: "flour", qty: 6 },
    { materialId: "water", qty: 3 },
    { materialId: "yeast", qty: 1 },
  ],
};

describe("materialCostOf", () => {
  it("prices an expanded material list", () => {
    const expanded = expandIngredients([{ subRecipeId: "dough", qty: 10 }], [dough]);
    // 6 flour * 60 + 3 water * 0 + 1 yeast * 400
    expect(materialCostOf(expanded, costs)).toBe(760);
  });

  it("treats unknown materials as free rather than NaN", () => {
    const expanded = expandIngredients([{ materialId: "ghost", qty: 5 }], []);
    expect(materialCostOf(expanded, costs)).toBe(0);
  });
});

describe("overheadCostOf", () => {
  it("adds per-batch overheads once", () => {
    expect(overheadCostOf([{ amount: 500, mode: "per_batch" }, { amount: 250 }], 20)).toBe(750);
  });

  it("multiplies per-unit overheads by batch qty", () => {
    expect(overheadCostOf([{ amount: 5, mode: "per_unit" }], 20)).toBe(100);
  });

  it("handles an empty list", () => {
    expect(overheadCostOf([], 10)).toBe(0);
  });
});

describe("batchCost", () => {
  const expandedPerUnit = expandIngredients([{ subRecipeId: "dough", qty: 0.2 }], [dough]);

  it("splits material and overhead and derives unit cost", () => {
    const r = batchCost({
      expandedPerUnit,
      costs,
      overheads: [{ amount: 300, mode: "per_batch" }, { amount: 1, mode: "per_unit" }],
      batchQty: 100,
    });
    // per unit materials: 0.2/10 of the dough = 2% => 760 * 0.02 = 15.2
    expect(r.materialPerUnit).toBeCloseTo(15.2, 6);
    expect(r.material).toBeCloseTo(1520, 6);
    expect(r.overhead).toBe(400);
    expect(r.total).toBeCloseTo(1920, 6);
    expect(r.unitCost).toBeCloseTo(19.2, 6);
  });

  it("does not divide by zero on an empty batch", () => {
    const r = batchCost({ expandedPerUnit, costs, batchQty: 0 });
    expect(r.total).toBe(0);
    expect(r.unitCost).toBe(0);
  });
});
