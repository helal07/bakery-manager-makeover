import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { ChefHat, Play, Search, Package, AlertTriangle, CircleDollarSign, Minus, Plus, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { loadRecipes, commitProduction, saveRecipe, type Ingredient } from "@/lib/recipe-store";
import { loadProducts, type Product } from "@/lib/product-store";
import { loadRawMaterials, type RawMaterial } from "@/lib/raw-material-store";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { toast } from "sonner";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/recipes")({
  head: () => ({ meta: [{ title: "Recipes & BOM · Crumb & Co." }] }),
  component: () => (
    <PermissionGate anyOf={["production.recipes.view", "production.access"]} title="Recipes & BOM">
      <Recipes />
    </PermissionGate>
  ),
});


function Recipes() {
  const { currentShowroomId } = useShowroomScope();
  const [products, setProducts] = useState<Product[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [recipeMap, setRecipeMap] = useState<Record<string, { materialId: string; qty: number }[]>>({});
  const [busy, setBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorProductId, setEditorProductId] = useState<string>("");
  const [editorItems, setEditorItems] = useState<Ingredient[]>([]);
  const [editorSaving, setEditorSaving] = useState(false);

  const openNewRecipe = () => {
    const firstFree = products.find((p) => !(recipeMap[p.id]?.length));
    setEditorProductId(firstFree?.id ?? products[0]?.id ?? "");
    setEditorItems([{ materialId: "", qty: 1 }]);
    setEditorOpen(true);
  };
  const openEditRecipe = (productId: string) => {
    setEditorProductId(productId);
    const existing = recipeMap[productId] ?? [];
    setEditorItems(existing.length ? existing.map((i) => ({ ...i })) : [{ materialId: "", qty: 1 }]);
    setEditorOpen(true);
  };
  const saveEditor = async () => {
    if (!editorProductId) return toast.error("Select a product");
    const clean = editorItems.filter((i) => i.materialId && i.qty > 0);
    if (clean.length === 0) return toast.error("Add at least one ingredient");
    setEditorSaving(true);
    try {
      await saveRecipe(editorProductId, clean);
      toast.success("Recipe saved");
      setEditorOpen(false);
      setActiveId(editorProductId);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save recipe");
    } finally {
      setEditorSaving(false);
    }
  };
  const deleteActiveRecipe = async () => {
    if (!active) return;
    if (!confirm(`Delete recipe for "${active.product.name}"?`)) return;
    try {
      await saveRecipe(active.product.id, []);
      toast.success("Recipe deleted");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete recipe");
    }
  };

  const refresh = async () => {
    try {
      const [ps, rms, rm] = await Promise.all([
        loadProducts(currentShowroomId ?? null),
        loadRawMaterials(currentShowroomId ?? null),
        loadRecipes(),
      ]);
      setProducts(ps);
      setRawMaterials(rms);
      setRecipeMap(rm);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load recipes");
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShowroomId]);

  const stock = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rawMaterials) m[r.id] = r.stock;
    return m;
  }, [rawMaterials]);

  const withRecipes = useMemo(
    () =>
      products
        .map((p) => ({ product: p, items: recipeMap[p.id] ?? [] }))
        .filter((r) => r.items.length > 0),
    [products, recipeMap],
  );

  const [activeId, setActiveId] = useState<string | null>(withRecipes[0]?.product.id ?? null);
  const [batch, setBatch] = useState(1);
  const [query, setQuery] = useState("");
  const active = withRecipes.find((r) => r.product.id === activeId) ?? withRecipes[0];

  useEffect(() => {
    if (withRecipes.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!activeId || !withRecipes.some((r) => r.product.id === activeId)) {
      setActiveId(withRecipes[0].product.id);
    }
  }, [withRecipes, activeId]);

  const filtered = withRecipes.filter((r) =>
    r.product.name.toLowerCase().includes(query.toLowerCase()) ||
    r.product.sku.toLowerCase().includes(query.toLowerCase()),
  );

  const totalIngredients = active?.items.length ?? 0;
  const shortCount = active
    ? active.items.filter((it) => (stock[it.materialId] ?? 0) < it.qty * batch).length
    : 0;
  const batchCost = active
    ? active.items.reduce((sum, it) => {
        const raw = rawMaterials.find((r) => r.id === it.materialId);
        return sum + (raw?.cost ?? 0) * it.qty * batch;
      }, 0)
    : 0;
  const unitCost = batch > 0 ? batchCost / batch : 0;
  const canApprove = active !== undefined && shortCount === 0;

  const approve = async () => {
    if (!active || busy) return;
    if (shortCount > 0) {
      toast.error("Insufficient raw materials for this batch");
      return;
    }
    setBusy(true);
    try {
      await commitProduction({
        productId: active.product.id,
        showroomId: currentShowroomId ?? null,
        batch,
        ingredients: active.items,
      });
      toast.success(`Batch approved — ${batch} × ${active.product.name}`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to commit production");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell
      title="Recipes & Bill of Materials"
      subtitle="Define recipes on products — production deducts raw materials automatically"
    >
      <div className="flex items-center justify-end mb-4">
        <button
          onClick={openNewRecipe}
          disabled={products.length === 0}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="size-4" /> New Recipe
        </button>
      </div>
      {withRecipes.length === 0 || !active ? (
        <Card className="p-12 text-center">
          <div className="mx-auto size-12 rounded-full bg-primary/10 grid place-items-center mb-4">
            <ChefHat className="size-6 text-primary" />
          </div>
          <h3 className="text-base font-semibold mb-1">No recipes defined</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create a recipe to define the raw materials required to produce a finished product.
          </p>
          <button
            onClick={openNewRecipe}
            disabled={products.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="size-4" /> Create Recipe
          </button>
          {products.length === 0 && (
            <div className="text-xs text-muted-foreground mt-3">
              No products yet. <Link to="/products" className="text-primary hover:underline">Add products first</Link>.
            </div>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
          <Card className="p-0 overflow-hidden flex flex-col">
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search recipes…"
                  className="w-full h-9 pl-8 pr-2.5 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-3 px-1">
                {filtered.length} recipe{filtered.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="p-2 space-y-1 overflow-auto max-h-[70vh]">
              {filtered.map((r) => {
                const isActive = active.product.id === r.product.id;
                return (
                  <button
                    key={r.product.id}
                    onClick={() => setActiveId(r.product.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-md flex items-center gap-2.5 transition-colors ${
                      isActive
                        ? "bg-primary/10 ring-1 ring-primary/20"
                        : "hover:bg-accent"
                    }`}
                  >
                    <div className={`size-8 rounded-md grid place-items-center shrink-0 ${isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      <ChefHat className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{r.product.name}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate">{r.product.sku}</div>
                    </div>
                    <Badge tone="primary">{r.items.length}</Badge>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-6">No matches</div>
              )}
            </div>
          </Card>

          <div className="space-y-5">
            <Card className="overflow-hidden">
              <div className="p-6 pb-5 border-b border-border bg-gradient-to-br from-primary/5 to-transparent">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="flex items-start gap-3">
                    <div className="size-11 rounded-lg bg-primary/10 grid place-items-center">
                      <ChefHat className="size-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl font-semibold tracking-tight">{active.product.name}</h2>
                        <Badge tone="primary">{active.product.category}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">SKU · {active.product.sku}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-md border border-border bg-background overflow-hidden">
                      <button
                        onClick={() => setBatch((b) => Math.max(1, b - 1))}
                        className="size-9 grid place-items-center hover:bg-accent text-muted-foreground"
                        aria-label="Decrease batch"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={batch}
                        onChange={(e) => setBatch(Math.max(1, +e.target.value || 1))}
                        className="w-14 h-9 text-center text-sm bg-transparent outline-none border-x border-border"
                      />
                      <button
                        onClick={() => setBatch((b) => b + 1)}
                        className="size-9 grid place-items-center hover:bg-accent text-muted-foreground"
                        aria-label="Increase batch"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => openEditRecipe(active.product.id)}
                      className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border bg-background text-sm hover:bg-accent"
                    >
                      <Pencil className="size-3.5" /> Edit
                    </button>
                    <button
                      onClick={deleteActiveRecipe}
                      className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border bg-background text-sm text-destructive hover:bg-destructive/10"
                      aria-label="Delete recipe"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    <button
                      onClick={approve}
                      disabled={!canApprove}
                      className="inline-flex items-center gap-1.5 px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Play className="size-3.5" /> Approve Batch
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                  <Stat icon={<Package className="size-4" />} label="Ingredients" value={String(totalIngredients)} />
                  <Stat icon={<Play className="size-4" />} label="Batch size" value={`× ${batch}`} />
                  <Stat
                    icon={<CircleDollarSign className="size-4" />}
                    label="Unit cost"
                    value={`৳${unitCost.toFixed(2)}`}
                    sub={`Batch ৳${batchCost.toFixed(2)}`}
                  />
                  <Stat
                    icon={<AlertTriangle className="size-4" />}
                    label="Shortages"
                    value={String(shortCount)}
                    tone={shortCount > 0 ? "danger" : "success"}
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground bg-muted/40">
                    <tr>
                      <th className="text-left font-medium px-6 py-3">Ingredient</th>
                      <th className="text-right font-medium px-6 py-3">Per unit</th>
                      <th className="text-right font-medium px-6 py-3">Required</th>
                      <th className="text-right font-medium px-6 py-3">In stock</th>
                      <th className="text-right font-medium px-6 py-3">Cost</th>
                      <th className="text-right font-medium px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {active.items.map((it) => {
                      const raw = rawMaterials.find((r) => r.id === it.materialId);
                      const need = it.qty * batch;
                      const have = stock[it.materialId] ?? 0;
                      const ok = have >= need;
                      const lineCost = (raw?.cost ?? 0) * need;
                      const pct = need > 0 ? Math.min(100, (have / need) * 100) : 100;
                      return (
                        <tr key={it.materialId} className="hover:bg-muted/30">
                          <td className="px-6 py-3">
                            <div className="font-medium">{raw?.name ?? it.materialId}</div>
                            <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full ${ok ? "bg-primary" : "bg-destructive"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right text-muted-foreground">
                            {it.qty} {raw?.unit}
                          </td>
                          <td className="px-6 py-3 text-right font-medium">
                            {need} {raw?.unit}
                          </td>
                          <td className="px-6 py-3 text-right">
                            {have} {raw?.unit}
                          </td>
                          <td className="px-6 py-3 text-right">৳{lineCost.toFixed(2)}</td>
                          <td className="px-6 py-3 text-right">
                            <Badge tone={ok ? "success" : "danger"}>{ok ? "Sufficient" : "Short"}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-6 py-4 border-t border-border bg-muted/30 text-xs text-muted-foreground flex items-center justify-between flex-wrap gap-2">
                <span>Approving deducts raw materials from store inventory (FEFO).</span>
                <Link to="/raw-materials" className="text-primary hover:underline">
                  View raw materials →
                </Link>
              </div>
            </Card>
          </div>
        </div>
      )}

      {editorOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4"
          onClick={() => !editorSaving && setEditorOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">
                  {recipeMap[editorProductId]?.length ? "Edit Recipe" : "Create Recipe"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select a finished product and define its raw material requirements per unit.
                </p>
              </div>
              <button
                onClick={() => !editorSaving && setEditorOpen(false)}
                className="size-8 grid place-items-center rounded-md hover:bg-accent text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-auto">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Product
                </label>
                <select
                  value={editorProductId}
                  onChange={(e) => setEditorProductId(e.target.value)}
                  className="mt-1.5 w-full h-10 px-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
                >
                  <option value="">— Select a product —</option>
                  {products.map((p) => {
                    const has = (recipeMap[p.id]?.length ?? 0) > 0;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku}){has ? " · has recipe" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Ingredients (per unit)
                  </label>
                  <button
                    onClick={() => setEditorItems((it) => [...it, { materialId: "", qty: 1 }])}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Plus className="size-3" /> Add ingredient
                  </button>
                </div>
                {rawMaterials.length === 0 ? (
                  <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-4 text-center">
                    No raw materials yet.{" "}
                    <Link to="/raw-materials" className="text-primary hover:underline">
                      Add raw materials
                    </Link>{" "}
                    first.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {editorItems.map((it, idx) => {
                      const raw = rawMaterials.find((r) => r.id === it.materialId);
                      return (
                        <div key={idx} className="flex items-center gap-2">
                          <select
                            value={it.materialId}
                            onChange={(e) =>
                              setEditorItems((arr) =>
                                arr.map((x, i) => (i === idx ? { ...x, materialId: e.target.value } : x)),
                              )
                            }
                            className="flex-1 h-9 px-2 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
                          >
                            <option value="">— Select material —</option>
                            {rawMaterials.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.unit})
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={0}
                            step="0.001"
                            value={it.qty}
                            onChange={(e) =>
                              setEditorItems((arr) =>
                                arr.map((x, i) =>
                                  i === idx ? { ...x, qty: Math.max(0, +e.target.value || 0) } : x,
                                ),
                              )
                            }
                            className="w-24 h-9 px-2 rounded-md border border-border bg-background text-sm text-right outline-none focus:border-primary"
                          />
                          <span className="text-xs text-muted-foreground w-10">{raw?.unit ?? ""}</span>
                          <button
                            onClick={() =>
                              setEditorItems((arr) => arr.filter((_, i) => i !== idx))
                            }
                            className="size-9 grid place-items-center rounded-md hover:bg-destructive/10 text-destructive"
                            aria-label="Remove ingredient"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      );
                    })}
                    {editorItems.length === 0 && (
                      <div className="text-xs text-muted-foreground text-center py-3">
                        No ingredients added yet.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-border flex items-center justify-end gap-2">
              <button
                onClick={() => setEditorOpen(false)}
                disabled={editorSaving}
                className="px-3 h-9 rounded-md border border-border bg-background text-sm hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEditor}
                disabled={editorSaving || !editorProductId}
                className="px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {editorSaving ? "Saving…" : "Save Recipe"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "danger";
}) {
  const valueClass =
    tone === "danger" ? "text-destructive" : tone === "success" ? "text-foreground" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="text-muted-foreground/80">{icon}</span>
        {label}
      </div>
      <div className={`text-lg font-semibold mt-1 ${valueClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}