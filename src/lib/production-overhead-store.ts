import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type OverheadCategory = { id: string; name: string; is_active: boolean };
export type OverheadMode = "per_unit" | "per_batch";

export type RecipeOverhead = {
  id?: string;
  categoryId: string;
  amount: number;
  mode: OverheadMode;
};

export type BatchOverhead = {
  categoryId: string;
  amount: number;
  note?: string;
};

export async function loadOverheadCategories(): Promise<OverheadCategory[]> {
  const { data, error } = await sb
    .from("production_overhead_categories")
    .select("id,name,is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as OverheadCategory[];
}

export async function addOverheadCategory(name: string): Promise<OverheadCategory> {
  const { data, error } = await sb
    .from("production_overhead_categories")
    .insert({ name: name.trim() })
    .select("id,name,is_active")
    .single();
  if (error) throw error;
  return data as OverheadCategory;
}

export async function loadRecipeOverheads(productId: string): Promise<RecipeOverhead[]> {
  const { data, error } = await sb
    .from("recipe_overheads")
    .select("id,category_id,amount,mode")
    .eq("product_id", productId);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    categoryId: r.category_id,
    amount: Number(r.amount) || 0,
    mode: (r.mode as OverheadMode) ?? "per_unit",
  }));
}

export async function saveRecipeOverheads(
  productId: string,
  rows: RecipeOverhead[],
): Promise<void> {
  const { error: delErr } = await sb.from("recipe_overheads").delete().eq("product_id", productId);
  if (delErr) throw delErr;
  const clean = rows.filter((r) => r.categoryId && r.amount > 0);
  if (clean.length === 0) return;
  const payload = clean.map((r) => ({
    product_id: productId,
    category_id: r.categoryId,
    amount: r.amount,
    mode: r.mode,
  }));
  const { error } = await sb.from("recipe_overheads").insert(payload);
  if (error) throw error;
}

export type BatchOverheadRow = {
  id: string;
  batch_id: string;
  product_id: string | null;
  category_id: string;
  category_name: string;
  amount: number;
  note: string | null;
  created_at: string;
};

export async function loadOverheadsForBatches(batchIds: string[]): Promise<BatchOverheadRow[]> {
  if (batchIds.length === 0) return [];
  const { data, error } = await sb
    .from("production_overheads")
    .select("id,batch_id,product_id,category_id,amount,note,created_at,production_overhead_categories(name)")
    .in("batch_id", batchIds);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    batch_id: r.batch_id,
    product_id: r.product_id,
    category_id: r.category_id,
    category_name: r.production_overhead_categories?.name ?? "—",
    amount: Number(r.amount) || 0,
    note: r.note,
    created_at: r.created_at,
  }));
}

export async function loadOverheadsInRange(
  fromISO: string,
  toISO: string,
): Promise<BatchOverheadRow[]> {
  const { data, error } = await sb
    .from("production_overheads")
    .select("id,batch_id,product_id,category_id,amount,note,created_at,production_overhead_categories(name)")
    .gte("created_at", fromISO)
    .lte("created_at", toISO)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    batch_id: r.batch_id,
    product_id: r.product_id,
    category_id: r.category_id,
    category_name: r.production_overhead_categories?.name ?? "—",
    amount: Number(r.amount) || 0,
    note: r.note,
    created_at: r.created_at,
  }));
}

export async function renameOverheadCategory(id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error("Name is required");
  const { error } = await sb
    .from("production_overhead_categories")
    .update({ name: clean })
    .eq("id", id);
  if (error) throw error;
}

/** How many recipe defaults / batch records reference this overhead category. */
export async function overheadCategoryUsage(
  id: string,
): Promise<{ recipes: number; batches: number }> {
  const [r1, r2] = await Promise.all([
    sb.from("recipe_overheads").select("id", { count: "exact", head: true }).eq("category_id", id),
    sb
      .from("production_overheads")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id),
  ]);
  return { recipes: r1?.count ?? 0, batches: r2?.count ?? 0 };
}

/**
 * Deactivate a category. Historical batch rows keep their reference, so we
 * never hard-delete when the category is already used.
 */
export async function removeOverheadCategory(id: string): Promise<void> {
  const usage = await overheadCategoryUsage(id);
  if (usage.recipes > 0) {
    throw new Error(
      `This overhead is used as a default in ${usage.recipes} recipe(s). Remove it there first.`,
    );
  }
  if (usage.batches > 0) {
    const { error } = await sb
      .from("production_overhead_categories")
      .update({ is_active: false })
      .eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } = await sb.from("production_overhead_categories").delete().eq("id", id);
  if (error) throw error;
}
