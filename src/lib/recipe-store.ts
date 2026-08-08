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
      material_id: i.subRecipeId ? null : i.materialId,
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
}): Promise<{ batchId: string | null; visible: boolean }> {
  const { productId, showroomId, batch, ingredients, overheads } = params;
  const cleanOverheads = (overheads ?? [])
    .filter((o) => o.categoryId && Number(o.amount) > 0)
    .map((o) => ({ categoryId: o.categoryId, amount: Number(o.amount), note: o.note ?? null }));
  const cleanIngredients = ingredients
    .filter((i) => (i.materialId || i.subRecipeId) && Number(i.qty) > 0)
    .map((i) => ({
      materialId: i.subRecipeId ? null : i.materialId,
      subRecipeId: i.subRecipeId ?? null,
      qty: Number(i.qty),
    }));
  const { data, error } = await sb.rpc("commit_production_batch", {
    _product_id: productId,
    _showroom_id: showroomId,
    _batch: batch,
    _ingredients: cleanIngredients,
    _overheads: cleanOverheads,
  });
  if (error) throw error;

  // The RPC returns the created batch id. Read it back through the normal
  // (RLS-filtered) path so we can tell the user honestly whether the batch
  // they just saved is actually visible to their account.
  const batchId: string | null =
    typeof data === "string" ? data : (data?.batch_id ?? data?.id ?? null);
  if (!batchId) return { batchId: null, visible: false };
  const { data: check } = await sb
    .from("stock_ledger")
    .select("id")
    .eq("ref_id", batchId)
    .limit(1);
  return { batchId, visible: !!(check && check.length) };
}

/** Friendly wording for the batch CRUD RPC failures. */
function explainBatchRpcError(err: any): Error {
  const msg = String(err?.message ?? err ?? "Unknown error");
  if (/permission required/i.test(msg)) {
    return new Error(
      "Your role does not allow this. Ask an admin to grant the batch edit/delete permission in Settings → Roles & Teams.",
    );
  }
  if (/does not exist/i.test(msg) && /production_batch/i.test(msg)) {
    return new Error(
      "The database is missing the batch correction functions. Run sql/32_batch_crud.sql on your database, then try again.",
    );
  }
  if (/Cannot reverse this batch/i.test(msg)) return new Error(msg.replace(/^.*?:\s*/, "Cannot delete this batch: "));
  if (/Not authorized for this location/i.test(msg)) {
    return new Error("Your account is not assigned to the Factory location, so it cannot change production batches.");
  }
  return err instanceof Error ? err : new Error(msg);
}

/** Reverse (delete) a production batch: returns raw materials, removes output. */
export async function voidProductionBatch(batchId: string, note?: string): Promise<void> {
  const { error } = await sb.rpc("void_production_batch", {
    _batch_id: batchId,
    _note: note ?? null,
  });
  if (error) throw explainBatchRpcError(error);
}

/** Correct a batch in place (same batch id): reverses then re-applies. */
export async function editProductionBatch(params: {
  batchId: string;
  batch: number;
  ingredients: Ingredient[];
  overheads?: ProductionOverheadInput[];
}): Promise<void> {
  const cleanIngredients = params.ingredients
    .filter((i) => (i.materialId || i.subRecipeId) && Number(i.qty) > 0)
    .map((i) => ({
      materialId: i.subRecipeId ? null : i.materialId,
      subRecipeId: i.subRecipeId ?? null,
      qty: Number(i.qty),
    }));
  const cleanOverheads = (params.overheads ?? [])
    .filter((o) => o.categoryId && Number(o.amount) > 0)
    .map((o) => ({ categoryId: o.categoryId, amount: Number(o.amount), note: o.note ?? null }));
  const { error } = await sb.rpc("edit_production_batch", {
    _batch_id: params.batchId,
    _batch: params.batch,
    _ingredients: cleanIngredients,
    _overheads: cleanOverheads,
  });
  if (error) throw explainBatchRpcError(error);
}

/**
 * Guard against accidental double-saves: looks for a batch of the same product
 * and quantity created earlier today. Returns minutes since it was saved.
 */
export async function findRecentSimilarBatch(
  productId: string,
  batch: number,
): Promise<{ batchId: string; minutesAgo: number } | null> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data, error } = await sb
    .from("stock_ledger")
    .select("ref_id,qty,created_at")
    .eq("kind", "production")
    .eq("product_id", productId)
    .gte("created_at", startOfDay.toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return null;
  const match = ((data ?? []) as any[]).find(
    (r) => Math.abs((Number(r.qty) || 0) - batch) < 1e-6 && r.ref_id,
  );
  if (!match) return null;
  return {
    batchId: match.ref_id,
    minutesAgo: Math.max(0, Math.round((Date.now() - new Date(match.created_at).getTime()) / 60000)),
  };
}
