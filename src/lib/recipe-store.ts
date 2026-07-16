import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type Ingredient = { materialId: string; qty: number };
export type RecipeMap = Record<string, Ingredient[]>;

export async function loadRecipes(): Promise<RecipeMap> {
  const { data, error } = await sb.from("recipes").select("product_id,material_id,qty");
  if (error) throw error;
  const map: RecipeMap = {};
  for (const r of (data ?? []) as any[]) {
    (map[r.product_id] ||= []).push({ materialId: r.material_id, qty: Number(r.qty) || 0 });
  }
  return map;
}

export async function loadRecipeFor(productId: string): Promise<Ingredient[]> {
  const { data, error } = await sb
    .from("recipes")
    .select("material_id,qty")
    .eq("product_id", productId);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    materialId: r.material_id,
    qty: Number(r.qty) || 0,
  }));
}

export async function saveRecipe(productId: string, ingredients: Ingredient[]): Promise<void> {
  const { error: delErr } = await sb.from("recipes").delete().eq("product_id", productId);
  if (delErr) throw delErr;
  const rows = ingredients
    .filter((i) => i.materialId && i.qty > 0)
    .map((i) => ({ product_id: productId, material_id: i.materialId, qty: i.qty }));
  if (rows.length === 0) return;
  const { error } = await sb.from("recipes").insert(rows);
  if (error) throw error;
}

export async function commitProduction(params: {
  productId: string;
  showroomId: string | null;
  batch: number;
  ingredients: Ingredient[];
}): Promise<void> {
  const { productId, showroomId, batch, ingredients } = params;
  const { error } = await sb.rpc("commit_production_batch", {
    _product_id: productId,
    _showroom_id: showroomId,
    _batch: batch,
    _ingredients: ingredients,
  });
  if (error) throw error;
}