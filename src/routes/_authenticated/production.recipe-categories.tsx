import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { Tag, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  loadRecipeCategories,
  createRecipeCategory,
  deleteRecipeCategory,
  type RecipeCategory,
} from "@/lib/recipe-category-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/production/recipe-categories")({
  head: () => ({ meta: [{ title: "Recipe Categories · Muzahid Food" }] }),
  component: RecipeCategoriesPage,
});

function RecipeCategoriesPage() {
  const [items, setItems] = useState<RecipeCategory[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#f59e0b");
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setItems(await loadRecipeCategories());
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load categories");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const add = async () => {
    if (!name.trim()) return;
    try {
      await createRecipeCategory(name.trim(), color);
      setName("");
      await refresh();
      toast.success("Category added");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    try {
      await deleteRecipeCategory(id);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  return (
    <AppShell title="Recipe Categories" subtitle="Group recipes (Breads, Cakes, Snacks…)">
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
        <Card className="p-5">
          <div className="text-sm font-semibold mb-3">Add category</div>
          <div className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Breads"
              className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Color</label>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 rounded-md border border-border bg-background" />
            </div>
            <button
              onClick={add}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
            >
              <Plus className="size-3.5" /> Add
            </button>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left font-medium px-5 py-3">Name</th>
                <th className="text-left font-medium px-5 py-3">Color</th>
                <th className="text-right font-medium px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 font-medium inline-flex items-center gap-2"><Tag className="size-3.5 text-muted-foreground" />{c.name}</td>
                  <td className="px-5 py-3">
                    <span className="inline-block size-4 rounded" style={{ background: c.color ?? "transparent" }} />
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{c.color}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Badge tone={c.is_active ? "success" : "neutral"}>{c.is_active ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => remove(c.id)} className="text-destructive hover:underline text-xs inline-flex items-center gap-1"><Trash2 className="size-3.5" />Delete</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-sm text-muted-foreground">{loading ? "Loading…" : "No categories yet."}</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
