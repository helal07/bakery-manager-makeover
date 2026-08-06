import { describe, it, expect } from "vitest";
import { convertQty, isCompatible, resolveUnit, sumInUnit, conversionLabel } from "@/lib/unit-convert";
import type { Unit } from "@/lib/unit-store";

const u = (over: Partial<Unit>): Unit =>
  ({
    id: over.id ?? crypto.randomUUID(),
    name: over.name ?? "unit",
    code: over.code ?? "x",
    short_name: over.short_name ?? null,
    is_active: true,
    base_unit_id: over.base_unit_id ?? null,
    conversion_factor: over.conversion_factor ?? null,
  }) as unknown as Unit;

describe("unit-convert built-ins", () => {
  it("converts within mass", () => {
    expect(convertQty(1, "kg", "g", [])).toBe(1000);
    expect(convertQty(2500, "g", "kg", [])).toBe(2.5);
    expect(convertQty(1, "ton", "kg", [])).toBe(1000);
  });

  it("converts within volume", () => {
    expect(convertQty(1, "l", "ml", [])).toBe(1000);
    expect(convertQty(250, "ml", "ltr", [])).toBe(0.25);
  });

  it("refuses to mix dimensions", () => {
    expect(convertQty(1, "kg", "l", [])).toBeNull();
    expect(convertQty(1, "pcs", "g", [])).toBeNull();
    expect(isCompatible("kg", "ml", [])).toBe(false);
    expect(isCompatible("kg", "GM", [])).toBe(true);
  });

  it("is case and alias tolerant", () => {
    expect(convertQty(1, "KG", "gram", [])).toBe(1000);
    expect(convertQty(1, "dozen", "pcs", [])).toBe(12);
  });

  it("returns null for unknown units", () => {
    expect(convertQty(1, "flurb", "g", [])).toBeNull();
    expect(resolveUnit("", [])).toBeNull();
  });
});

describe("unit-convert user-defined chains", () => {
  const g = u({ id: "g1", code: "g" });
  const bag = u({ id: "b1", code: "bag", base_unit_id: "g1", conversion_factor: 50_000 });
  const pallet = u({ id: "p1", code: "pallet", base_unit_id: "b1", conversion_factor: 10 });
  const units = [g, bag, pallet];

  it("walks the chain to the built-in root", () => {
    expect(convertQty(1, "bag", "kg", units)).toBe(50);
    expect(convertQty(1, "pallet", "kg", units)).toBe(500);
    expect(convertQty(500, "kg", "bag", units)).toBe(10);
  });

  it("guards against cycles", () => {
    const a = u({ id: "a", code: "a", base_unit_id: "b", conversion_factor: 2 });
    const b = u({ id: "b", code: "b", base_unit_id: "a", conversion_factor: 2 });
    expect(resolveUnit("a", [a, b])).toBeNull();
  });

  it("isolates unrelated custom roots", () => {
    const roll = u({ id: "r1", code: "roll" });
    expect(convertQty(1, "roll", "kg", [roll])).toBeNull();
  });

  it("labels conversions", () => {
    expect(conversionLabel(bag, units)).toBe("1 bag = 50000 g");
    expect(conversionLabel(g, units)).toBeNull();
  });
});

describe("sumInUnit (auto-yield)", () => {
  it("sums mixed mass units into the target", () => {
    const r = sumInUnit(
      [
        { qty: 500, unit: "g" },
        { qty: 1.5, unit: "kg" },
        { qty: 250, unit: "gm" },
      ],
      "kg",
      [],
    );
    expect(r.total).toBeCloseTo(2.25, 6);
    expect(r.skipped).toEqual([]);
  });

  it("skips incompatible rows instead of adding them", () => {
    const r = sumInUnit(
      [
        { qty: 1, unit: "kg" },
        { qty: 500, unit: "ml" },
        { qty: 3, unit: "pcs" },
      ],
      "kg",
      [],
    );
    expect(r.total).toBe(1);
    expect(r.skipped).toHaveLength(2);
  });

  it("ignores zero and negative quantities", () => {
    const r = sumInUnit([{ qty: 0, unit: "kg" }, { qty: -2, unit: "kg" }], "kg", []);
    expect(r.total).toBe(0);
    expect(r.skipped).toEqual([]);
  });
});
