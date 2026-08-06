import { describe, it, expect } from "vitest";
import { expandIngredients, findOverlaps, type SubRecipe } from "@/lib/sub-recipe-store";

const sub = (over: Partial<SubRecipe>): SubRecipe => ({
  id: over.id ?? "s1",
  name: over.name ?? "Master dough",
  yield_qty: over.yield_qty ?? 10,
  yield_unit: over.yield_unit ?? "kg",
  is_active: true,
  items: over.items ?? [],
});

const dough = sub({
  id: "dough",
  name: "Master dough",
  yield_qty: 10,
  items: [
    { materialId: "flour", qty: 6 },
    { materialId: "water", qty: 3 },
    { materialId: "yeast", qty: 1 },
  ],
});

const cream = sub({
  id: "cream",
  name: "Cream filling",
  yield_qty: 5,
  items: [
    { materialId: "sugar", qty: 2 },
    { materialId: "butter", qty: 3 },
  ],
});

const byId = (list: SubRecipe[]) => Object.fromEntries(list.map((s) => [s.id, s]));
const find = (rows: ReturnType<typeof expandIngredients>, id: string) =>
  rows.find((r) => r.materialId === id);

describe("expandIngredients", () => {
  it("passes direct materials straight through", () => {
    const rows = expandIngredients([{ materialId: "flour", qty: 2 }], []);
    expect(rows).toHaveLength(1);
    expect(find(rows, "flour")!.total).toBe(2);
    expect(find(rows, "flour")!.sources[0]).toMatchObject({ kind: "material", label: "Direct" });
  });

  it("expands a sub-recipe pro-rata to its yield", () => {
    // 5 kg of a 10 kg dough = half the ingredients
    const rows = expandIngredients([{ subRecipeId: "dough", qty: 5 }], [dough]);
    expect(find(rows, "flour")!.total).toBe(3);
    expect(find(rows, "water")!.total).toBe(1.5);
    expect(find(rows, "yeast")!.total).toBe(0.5);
  });

  it("applies the batch multiplier", () => {
    const rows = expandIngredients([{ subRecipeId: "dough", qty: 5 }], [dough], 4);
    expect(find(rows, "flour")!.total).toBe(12);
  });

  it("aggregates multiple sub-recipes plus direct materials", () => {
    const rows = expandIngredients(
      [
        { subRecipeId: "dough", qty: 10 },
        { subRecipeId: "cream", qty: 5 },
        { materialId: "sugar", qty: 1 },
      ],
      byId([dough, cream]),
    );
    expect(find(rows, "flour")!.total).toBe(6);
    expect(find(rows, "butter")!.total).toBe(3);
    // 2 from cream + 1 direct
    expect(find(rows, "sugar")!.total).toBe(3);
    expect(find(rows, "sugar")!.sources).toHaveLength(2);
  });

  it("merges the same material coming from two sub-recipes", () => {
    const other = sub({ id: "other", name: "Glaze", yield_qty: 1, items: [{ materialId: "flour", qty: 0.5 }] });
    const rows = expandIngredients(
      [
        { subRecipeId: "dough", qty: 10 },
        { subRecipeId: "other", qty: 1 },
      ],
      byId([dough, other]),
    );
    expect(find(rows, "flour")!.total).toBe(6.5);
    expect(findOverlaps(rows).map((o) => o.materialId)).toEqual(["flour"]);
  });

  it("skips zero-yield sub-recipes and non-positive quantities", () => {
    const broken = sub({ id: "broken", yield_qty: 0, items: [{ materialId: "flour", qty: 5 }] });
    expect(expandIngredients([{ subRecipeId: "broken", qty: 5 }], [broken])).toEqual([]);
    expect(expandIngredients([{ materialId: "flour", qty: 0 }], [])).toEqual([]);
    expect(expandIngredients([{ materialId: "flour", qty: -3 }], [])).toEqual([]);
  });

  it("ignores unknown sub-recipe references", () => {
    expect(expandIngredients([{ subRecipeId: "nope", qty: 5 }], [dough])).toEqual([]);
  });

  it("reports no overlap when every material has one source", () => {
    const rows = expandIngredients([{ subRecipeId: "dough", qty: 10 }], [dough]);
    expect(findOverlaps(rows)).toEqual([]);
  });

  it("handles fine-grained quantities without drift", () => {
    const spice = sub({ id: "spice", yield_qty: 1, items: [{ materialId: "salt", qty: 0.0001 }] });
    const rows = expandIngredients([{ subRecipeId: "spice", qty: 1 }], [spice]);
    expect(find(rows, "salt")!.total).toBeCloseTo(0.0001, 8);
  });
});
