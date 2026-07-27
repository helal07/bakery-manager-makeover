import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type Ingredient = {
  materialId: string;
  subRecipeId?: string;
  qty: number;
};
export type RecipeMap = Record<string, Ingredient[]>;

export async function loadRecipes(): Promise<RecipeMap> {
  const { data, error } = await sb
    .from("recipes")
    .select("product_id,material_id,sub_recipe_id,qty");
  if (error) throw error;
  const map: RecipeMap = {};
  for (const r of (data ?? []) as any[]) {
    (map[r.product_id] ||= []).push({
      materialId: r.material_id ?? "",
      subRecipeId: r.sub_recipe_id ?? undefined,
      qty: Number(r.qty) || 0,
    });
  }
  return map;
}

export async function loadRecipeFor(productId: string): Promise<Ingredient[]> {
  const { data, error } = await sb
    .from("recipes")
    .select("material_id,sub_recipe_id,qty")
    .eq("product_id", productId);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    materialId: r.material_id ?? "",
    subRecipeId: r.sub_recipe_id ?? undefined,
    qty: Number(r.qty) || 0,
  }));
}

export async function saveRecipe(productId: string, ingredients: Ingredient[]): Promise<void> {
  const { error: delErr } = await sb.from("recipes").delete().eq("product_id", productId);
  if (delErr) throw delErr;
  const rows = ingredients
    .filter((i) => (i.materialId || i.subRecipeId) && i.qty > 0)
    .map((i) => ({
      product_id: productId,
      material_id: i.materialId ?? null,
      sub_recipe_id: i.subRecipeId ?? null,
      qty: i.qty,
    }));
  if (rows.length === 0) return;
  const { error } = await sb.from("recipes").insert(rows);
  if (error) throw error;
}

export type ProductionOverheadInput = { categoryId: string; amount: number; note?: string };

export async function commitProduction(params: {
  productId: string;
  showroomId: string | null;
  batch: number;
  ingredients: Ingredient[];
  overheads?: ProductionOverheadInput[];
}): Promise<void> {
  const { productId, showroomId, batch, ingredients, overheads } = params;
  const cleanOverheads = (overheads ?? [])
    .filter((o) => o.categoryId && Number(o.amount) > 0)
    .map((o) => ({ categoryId: o.categoryId, amount: Number(o.amount), note: o.note ?? null }));
  const cleanIngredients = ingredients
    .filter((i) => (i.materialId || i.subRecipeId) && Number(i.qty) > 0)
    .map((i) => ({
      materialId: i.materialId ?? null,
      subRecipeId: i.subRecipeId ?? null,
      qty: Number(i.qty),
    }));
  const { error } = await sb.rpc("commit_production_batch", {
    _product_id: productId,
    _showroom_id: showroomId,
    _batch: batch,
    _ingredients: cleanIngredients,
    _overheads: cleanOverheads,
  });
  if (error) throw error;
}
