import { supabase } from "@/integrations/supabase/client";

export type ProductCategory = string;

export type CategoryRow = { id: string; name: string };

function mapError(e: any, action: string): Error {
  const msg = e?.message ?? String(e ?? "");
  if (/row-level security|permission|denied|violates/i.test(msg)) {
    return new Error(`You don't have permission to ${action} categories`);
  }
  if (/duplicate|unique/i.test(msg)) {
    return new Error("A category with that name already exists");
  }
  return new Error(msg || `Failed to ${action} category`);
}

export async function loadCategoryRows(): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from("product_categories")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw mapError(error, "load");
  return data ?? [];
}

export async function loadCategories(): Promise<ProductCategory[]> {
  const rows = await loadCategoryRows();
  return rows.map((r) => r.name);
}

export async function addCategory(name: string): Promise<CategoryRow> {
  const clean = name.trim();
  if (!clean) throw new Error("Name is required");
  const { data, error } = await supabase
    .from("product_categories")
    .insert({ name: clean })
    .select("id, name")
    .single();
  if (error) throw mapError(error, "create");
  return data;
}

export async function renameCategory(id: string, to: string): Promise<CategoryRow> {
  const clean = to.trim();
  if (!clean) throw new Error("Name is required");
  const { data, error } = await supabase
    .from("product_categories")
    .update({ name: clean })
    .eq("id", id)
    .select("id, name")
    .single();
  if (error) throw mapError(error, "rename");
  return data;
}

export async function removeCategory(id: string): Promise<void> {
  const { error } = await supabase.from("product_categories").delete().eq("id", id);
  if (error) throw mapError(error, "delete");
}

export function expiryStatus(dateStr: string): "safe" | "soon" | "expired" {
  const d = new Date(dateStr).getTime();
  const now = Date.now();
  const days = (d - now) / (1000 * 60 * 60 * 24);
  if (days < 0) return "expired";
  if (days < 14) return "soon";
  return "safe";
}
