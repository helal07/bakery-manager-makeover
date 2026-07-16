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
  for (const ing of ingredients) {
    const { error } = await sb.rpc("commit_raw_stock_movement", {
      _material_id: ing.materialId,
      _showroom_id: showroomId,
      _qty: -Math.abs(ing.qty * batch),
      _kind: "production_consume",
      _ref_type: "production",
      _ref_id: null,
    });
    if (error) throw error;
  }
  const { error } = await sb.rpc("commit_stock_movement", {
    _product_id: productId,
    _showroom_id: showroomId,
    _qty: batch,
    _kind: "production",
    _ref_type: "production",
    _ref_id: null,
  });
  if (error) throw error;

  // Stamp mfg/expiry on the product based on its shelf life.
  const { data: prod } = await sb
    .from("products")
    .select("shelf_life_days")
    .eq("id", productId)
    .maybeSingle();
  const shelf = prod?.shelf_life_days ? Number(prod.shelf_life_days) : 0;
  const today = new Date();
  const mfg = today.toISOString().slice(0, 10);
  const patch: Record<string, unknown> = { mfg_date: mfg };
  if (shelf > 0) {
    const exp = new Date(today);
    exp.setDate(exp.getDate() + shelf);
    patch.expiry_date = exp.toISOString().slice(0, 10);
  }
  await sb.from("products").update(patch).eq("id", productId);
}