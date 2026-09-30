import { supabase } from "@/integrations/supabase/client";
import { isLaravel } from "@/lib/backend-mode";
import { api } from "@/lib/api-client";

const sb = supabase as any;

export type RecipeCategory = { id: string; name: string; color: string | null; is_active: boolean };

export async function loadRecipeCategories(): Promise<RecipeCategory[]> {
  if (isLaravel()) {
    const res = await api.get<{ recipeCategories: any[] }>("lookups");
    return (res.recipeCategories ?? []) as RecipeCategory[];
  }
  const { data, error } = await sb
    .from("recipe_categories")
    .select("id,name,color,is_active")
    .order("name");
  if (error) throw error;
  return (data ?? []) as RecipeCategory[];
}

export async function createRecipeCategory(name: string, color: string | null): Promise<void> {
  const { error } = await sb.from("recipe_categories").insert({ name, color });
  if (error) throw error;
}

export async function updateRecipeCategory(id: string, patch: Partial<Pick<RecipeCategory, "name" | "color" | "is_active">>): Promise<void> {
  const { error } = await sb.from("recipe_categories").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteRecipeCategory(id: string): Promise<void> {
  const { error } = await sb.from("recipe_categories").delete().eq("id", id);
  if (error) throw error;
}
