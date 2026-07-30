import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type SubRecipeItem = { materialId: string; qty: number };

export type SubRecipe = {
  id: string;
  name: string;
  yield_qty: number;
  yield_unit: string;
  is_active: boolean;
  created_at?: string;
  items: SubRecipeItem[];
};

export async function loadSubRecipes(): Promise<SubRecipe[]> {
  const { data: heads, error: e1 } = await sb
    .from("sub_recipes")
    .select("id,name,yield_qty,yield_unit,is_active,created_at")
    .eq("is_active", true)
    .order("name");
  if (e1) throw e1;
  const ids = (heads ?? []).map((h: any) => h.id);
  if (ids.length === 0) return [];
  const { data: items, error: e2 } = await sb
    .from("sub_recipe_items")
    .select("sub_recipe_id,material_id,qty")
    .in("sub_recipe_id", ids);
  if (e2) throw e2;
  const byId: Record<string, SubRecipeItem[]> = {};
  for (const it of (items ?? []) as any[]) {
    (byId[it.sub_recipe_id] ||= []).push({
      materialId: it.material_id,
      qty: Number(it.qty) || 0,
    });
  }
  return (heads as any[]).map((h) => ({
    id: h.id,
    name: h.name,
    yield_qty: Number(h.yield_qty) || 0,
    yield_unit: h.yield_unit,
    is_active: h.is_active,
    created_at: h.created_at ?? undefined,
    items: byId[h.id] ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Shared expansion helper — turns a mixed ingredient list (raw materials and
// sub-recipes) into aggregated per-material demand, tracking which source(s)
// each material came from so the UI can warn about overlaps.
// ---------------------------------------------------------------------------

export type ExpandRow = { materialId?: string; subRecipeId?: string; qty: number };

export type ExpandedMaterial = {
  materialId: string;
  total: number;
  sources: { label: string; qty: number; kind: "material" | "sub" }[];
};

export function expandIngredients(
  rows: ExpandRow[],
  subRecipes: SubRecipe[] | Record<string, SubRecipe>,
  multiplier = 1,
): ExpandedMaterial[] {
  const subMap: Record<string, SubRecipe> = Array.isArray(subRecipes)
    ? Object.fromEntries(subRecipes.map((s) => [s.id, s]))
    : subRecipes;

  const acc = new Map<string, ExpandedMaterial>();
  const push = (materialId: string, qty: number, label: string, kind: "material" | "sub") => {
    if (!materialId || !(qty > 0)) return;
    const cur = acc.get(materialId) ?? { materialId, total: 0, sources: [] };
    cur.total += qty;
    const existing = cur.sources.find((s) => s.label === label && s.kind === kind);
    if (existing) existing.qty += qty;
    else cur.sources.push({ label, qty, kind });
    acc.set(materialId, cur);
  };

  for (const row of rows) {
    const qty = (Number(row.qty) || 0) * multiplier;
    if (!(qty > 0)) continue;
    if (row.subRecipeId) {
      const sub = subMap[row.subRecipeId];
      if (!sub || !(sub.yield_qty > 0)) continue;
      const ratio = qty / sub.yield_qty;
      for (const si of sub.items) push(si.materialId, si.qty * ratio, sub.name, "sub");
    } else if (row.materialId) {
      push(row.materialId, qty, "Direct", "material");
    }
  }
  return Array.from(acc.values());
}

/** Materials that come from more than one source (two sub-recipes, or sub + direct). */
export function findOverlaps(expanded: ExpandedMaterial[]): ExpandedMaterial[] {
  return expanded.filter((e) => e.sources.length > 1);
}


export async function saveSubRecipe(input: {
  id?: string;
  name: string;
  yield_qty: number;
  yield_unit: string;
  items: SubRecipeItem[];
}): Promise<string> {
  const populated = input.items.filter((i) => i.materialId && Number(i.qty) > 0);
  if (populated.length === 0) throw new Error("Add at least one ingredient");
  const seen = new Set<string>();
  for (const i of populated) {
    if (seen.has(i.materialId)) throw new Error("Duplicate ingredient in sub-recipe");
    seen.add(i.materialId);
  }
  if (!(input.yield_qty > 0)) throw new Error("Yield qty must be greater than zero");
  if (!input.name.trim()) throw new Error("Name required");

  let id = input.id;
  const payload = {
    name: input.name.trim(),
    yield_qty: input.yield_qty,
    yield_unit: input.yield_unit || "kg",
  };
  if (id) {
    const { error } = await sb.from("sub_recipes").update(payload).eq("id", id);
    if (error) throw error;
    const { error: delErr } = await sb.from("sub_recipe_items").delete().eq("sub_recipe_id", id);
    if (delErr) throw delErr;
  } else {
    const { data, error } = await sb
      .from("sub_recipes")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    id = data.id as string;
  }
  const rows = populated.map((i) => ({
    sub_recipe_id: id,
    material_id: i.materialId,
    qty: i.qty,
  }));
  const { error: insErr } = await sb.from("sub_recipe_items").insert(rows);
  if (insErr) throw insErr;
  return id!;
}

export async function deleteSubRecipe(id: string): Promise<void> {
  // Guard: block if any recipe references this sub-recipe
  const { data: refs, error: e1 } = await sb
    .from("recipes")
    .select("product_id")
    .eq("sub_recipe_id", id)
    .limit(1);
  if (e1) throw e1;
  if ((refs ?? []).length > 0) {
    throw new Error("This sub-recipe is used in a product recipe. Remove it from the recipe first.");
  }
  const { error } = await sb.from("sub_recipes").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}
