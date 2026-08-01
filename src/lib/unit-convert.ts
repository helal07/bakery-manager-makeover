import type { Unit } from "@/lib/unit-store";

/**
 * Unit conversion engine.
 *
 * Two sources of truth, in priority order:
 *  1. The `units` table (Ultimate-POS style): a unit may declare
 *     `base_unit_id` + `conversion_factor` (e.g. 1 kg = 1000 g).
 *  2. A built-in fallback table for common codes, so conversions keep
 *     working before the user configures anything.
 *
 * Anything not resolvable returns `null` — callers must then skip the
 * conversion instead of silently mixing numbers.
 */

type Builtin = { dim: string; factor: number };

const BUILTIN: Record<string, Builtin> = {
  // mass -> grams
  mg: { dim: "mass", factor: 0.001 },
  g: { dim: "mass", factor: 1 },
  gm: { dim: "mass", factor: 1 },
  gram: { dim: "mass", factor: 1 },
  grams: { dim: "mass", factor: 1 },
  kg: { dim: "mass", factor: 1000 },
  kgs: { dim: "mass", factor: 1000 },
  kilo: { dim: "mass", factor: 1000 },
  kilogram: { dim: "mass", factor: 1000 },
  ton: { dim: "mass", factor: 1_000_000 },
  // volume -> millilitres
  ml: { dim: "volume", factor: 1 },
  l: { dim: "volume", factor: 1000 },
  ltr: { dim: "volume", factor: 1000 },
  litre: { dim: "volume", factor: 1000 },
  liter: { dim: "volume", factor: 1000 },
  // count -> pieces
  pc: { dim: "count", factor: 1 },
  pcs: { dim: "count", factor: 1 },
  piece: { dim: "count", factor: 1 },
  pieces: { dim: "count", factor: 1 },
  dozen: { dim: "count", factor: 12 },
  dz: { dim: "count", factor: 12 },
};

const norm = (code: string) => (code ?? "").trim().toLowerCase();

/** Resolved unit: which dimension it belongs to and its factor to that dimension's base. */
export type Resolved = { dim: string; factor: number };

/** Walk `base_unit_id` up to the root, multiplying conversion factors. */
export function resolveUnit(code: string, units: Unit[]): Resolved | null {
  const key = norm(code);
  if (!key) return null;

  const byCode = new Map(units.map((u) => [norm(u.code), u]));
  const byId = new Map(units.map((u) => [u.id, u]));

  let current = byCode.get(key);
  let factor = 1;
  const seen = new Set<string>();

  while (current) {
    if (seen.has(current.id)) return null; // cycle guard
    seen.add(current.id);
    if (!current.base_unit_id) {
      // Root of a user-defined chain. Prefer the built-in dimension when the
      // root code is a known one, so user units interop with built-ins.
      const bi = BUILTIN[norm(current.code)];
      if (bi) return { dim: bi.dim, factor: factor * bi.factor };
      return { dim: `unit:${current.id}`, factor };
    }
    factor *= Number(current.conversion_factor) || 1;
    current = byId.get(current.base_unit_id);
  }

  const bi = BUILTIN[key];
  return bi ? { dim: bi.dim, factor: bi.factor } : null;
}

/** True when both codes belong to the same measurable dimension. */
export function isCompatible(a: string, b: string, units: Unit[]): boolean {
  if (norm(a) === norm(b)) return true;
  const ra = resolveUnit(a, units);
  const rb = resolveUnit(b, units);
  return !!ra && !!rb && ra.dim === rb.dim;
}

/** Convert `qty` from one unit code to another. Returns null if not convertible. */
export function convertQty(
  qty: number,
  from: string,
  to: string,
  units: Unit[],
): number | null {
  const q = Number(qty) || 0;
  if (norm(from) === norm(to)) return q;
  const ra = resolveUnit(from, units);
  const rb = resolveUnit(to, units);
  if (!ra || !rb || ra.dim !== rb.dim || !(rb.factor > 0)) return null;
  return (q * ra.factor) / rb.factor;
}

/**
 * Unit-aware sum: converts every row into `target` and reports what could not
 * be converted so the UI can warn instead of adding apples to oranges.
 */
export function sumInUnit(
  rows: { qty: number; unit: string }[],
  target: string,
  units: Unit[],
): { total: number; skipped: { qty: number; unit: string }[] } {
  let total = 0;
  const skipped: { qty: number; unit: string }[] = [];
  for (const r of rows) {
    const q = Number(r.qty) || 0;
    if (!(q > 0)) continue;
    const c = convertQty(q, r.unit, target, units);
    if (c === null) skipped.push({ qty: q, unit: r.unit });
    else total += c;
  }
  return { total, skipped };
}

/** Human label like "1 kg = 1000 g". */
export function conversionLabel(u: Unit, units: Unit[]): string | null {
  if (!u.base_unit_id || !u.conversion_factor) return null;
  const base = units.find((x) => x.id === u.base_unit_id);
  if (!base) return null;
  return `1 ${u.code} = ${u.conversion_factor} ${base.code}`;
}
