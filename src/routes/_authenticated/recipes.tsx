import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import {
  ChefHat,
  Play,
  Package,
  AlertTriangle,
  CircleDollarSign,
  Minus,
  Plus,
  Trash2,
  X,
  Factory,
  History,
  Tag,
  Pencil,
  Save,
  Search,
  ChevronDown,
  Check,
  Clock,
  BookOpen,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  loadRecipes,
  commitProduction,
  saveRecipe,
  type Ingredient,
} from "@/lib/recipe-store";
import {
  loadOverheadCategories,
  loadRecipeOverheads,
  saveRecipeOverheads,
  addOverheadCategory,
  renameOverheadCategory,
  removeOverheadCategory,
  overheadCategoryUsage,
  type OverheadCategory,
  type RecipeOverhead,
  type BatchOverhead,
} from "@/lib/production-overhead-store";
import { loadProducts, type Product } from "@/lib/product-store";
import { loadRawMaterials, type RawMaterial } from "@/lib/raw-material-store";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import {
  loadSubRecipes,
  expandIngredients,
  type SubRecipe,
} from "@/lib/sub-recipe-store";

import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PermissionGate } from "@/components/permission-gate";
import { pageTitle } from "@/lib/company-settings";
import { IngredientPicker } from "@/components/ingredient-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Search = {
  product?: string;
  tab?: "produce" | "recipe" | "history" | "list" | "overheads";
};

export const Route = createFileRoute("/_authenticated/recipes")({
  head: () => ({ meta: [{ title: pageTitle("Production Workbench") }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    product: typeof s.product === "string" ? s.product : undefined,
    tab:
      s.tab === "recipe" ||
      s.tab === "history" ||
      s.tab === "produce" ||
      s.tab === "list" ||
      s.tab === "overheads"
        ? s.tab
        : undefined,
  }),
  component: () => (
    <PermissionGate
      anyOf={["production.recipes.view", "production.access"]}
      title="Production Workbench"
    >
      <Workbench />
    </PermissionGate>
  ),
});

type TabKey = "produce" | "recipe" | "history" | "list" | "overheads";
type BatchRow = {
  id: string;
  qty: number;
  created_at: string;
  ref_id: string | null;
  showroom_id: string | null;
  note: string | null;
};

function Workbench() {
  const { currentShowroomId, showrooms } = useShowroomScope();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [products, setProducts] = useState<Product[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([]);
  const [recipeMap, setRecipeMap] = useState<Record<string, Ingredient[]>>({});
  const [loading, setLoading] = useState(true);

  const [activeId, setActiveId] = useState<string>(search.product ?? "");
  const [tab, setTab] = useState<TabKey>(search.tab ?? "produce");
  const [batch, setBatch] = useState(1);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dupWarn, setDupWarn] = useState<string | null>(null);

  // Recipe editor state (used in Edit Recipe tab and New Recipe dialog)
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorProductId, setEditorProductId] = useState<string>("");
  const [editorItems, setEditorItems] = useState<Ingredient[]>([]);
  const [editorOverheads, setEditorOverheads] = useState<RecipeOverhead[]>([]);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorBaseline, setEditorBaseline] = useState<string>("");

  // Overhead categories master list
  const [overheadCats, setOverheadCats] = useState<OverheadCategory[]>([]);

  // Recipe-level default overheads for the currently active product
  const [activeRecipeOverheads, setActiveRecipeOverheads] = useState<RecipeOverhead[]>([]);

  // Per-produce overrides (starts from recipe defaults, user can add/edit/remove)
  const [produceOverheads, setProduceOverheads] = useState<BatchOverhead[]>([]);

  // Overhead master-list manager lives in the "Overheads" tab

  // Batch history
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const refresh = async () => {
    try {
      const [ps, rms, rm, ocs, srs] = await Promise.all([
        loadProducts(currentShowroomId ?? null),
        loadRawMaterials(null), // factory-only raw stock
        loadRecipes(),
        loadOverheadCategories(),
        loadSubRecipes(),
      ]);
      setProducts(ps);
      setRawMaterials(rms);
      setRecipeMap(rm);
      setOverheadCats(ocs);
      setSubRecipes(srs);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShowroomId]);

  const withRecipes = useMemo(
    () =>
      products
        .map((p) => ({ product: p, items: recipeMap[p.id] ?? [] }))
        .filter((r) => r.items.length > 0),
    [products, recipeMap],
  );

  // Default active product
  useEffect(() => {
    if (withRecipes.length === 0) {
      if (activeId) setActiveId("");
      return;
    }
    if (!activeId || !withRecipes.some((r) => r.product.id === activeId)) {
      setActiveId(withRecipes[0].product.id);
    }
  }, [withRecipes, activeId]);

  // Sync product param to URL (without spamming history)
  useEffect(() => {
    if (!activeId) return;
    if (search.product === activeId) return;
    navigate({
      to: "/recipes",
      search: { product: activeId, tab: tab === "produce" ? undefined : tab },
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const active = withRecipes.find((r) => r.product.id === activeId);
  const items = active?.items ?? [];

  const stock = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rawMaterials) m[r.id] = r.stock;
    return m;
  }, [rawMaterials]);

  const subRecipeMap = useMemo(() => {
    const m: Record<string, SubRecipe> = {};
    for (const s of subRecipes) m[s.id] = s;
    return m;
  }, [subRecipes]);

  // Expand ingredients into aggregated per-material requirement (per batch).
  // Multiple sub-recipes are merged; sources are kept for overlap warnings.
  const rows = useMemo(() => {
    const expanded = expandIngredients(
      items.map((it) => ({
        materialId: it.materialId || undefined,
        subRecipeId: it.subRecipeId || undefined,
        qty: Number(it.qty) || 0,
      })),
      subRecipeMap,
      batch,
    );
    return expanded.map((e) => {
      const raw = rawMaterials.find((r) => r.id === e.materialId);
      const need = e.total;
      const have = stock[e.materialId] ?? 0;
      const short = Math.max(0, need - have);
      const lineCost = (raw?.cost ?? 0) * need;
      return {
        it: { materialId: e.materialId, qty: batch > 0 ? need / batch : 0 } as Ingredient,
        raw,
        need,
        have,
        short,
        lineCost,
        sources: e.sources,
        ok: short === 0,
      };
    });
  }, [items, batch, rawMaterials, subRecipeMap, stock]);

  const overlapRows = useMemo(() => rows.filter((r) => r.sources.length > 1), [rows]);


  const shortRows = rows.filter((r) => !r.ok);
  const materialCost = rows.reduce((s, r) => s + r.lineCost, 0);
  const overheadCost = produceOverheads.reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const batchCost = materialCost + overheadCost;
  const unitCost = batch > 0 ? batchCost / batch : 0;
  const materialUnitCost = batch > 0 ? materialCost / batch : 0;
  const overheadUnitCost = batch > 0 ? overheadCost / batch : 0;
  const canProduce =
    !!active && items.length > 0 && shortRows.length === 0 && !busy;

  // Load recipe overheads for the active product, and derive produce-tab
  // overheads from them (per_unit lines auto-scale with batch qty).
  useEffect(() => {
    let cancel = false;
    if (!activeId) {
      setActiveRecipeOverheads([]);
      return;
    }
    loadRecipeOverheads(activeId)
      .then((rows) => {
        if (cancel) return;
        setActiveRecipeOverheads(rows);
      })
      .catch(() => {
        if (!cancel) setActiveRecipeOverheads([]);
      });
    return () => {
      cancel = true;
    };
  }, [activeId]);

  // Rebuild produceOverheads from defaults when active product or batch changes.
  // User edits after this reset are preserved until the product/batch changes again.
  useEffect(() => {
    const derived: BatchOverhead[] = activeRecipeOverheads.map((r) => ({
      categoryId: r.categoryId,
      amount: r.mode === "per_unit" ? r.amount * batch : r.amount,
      note: undefined,
    }));
    setProduceOverheads(derived);
  }, [activeRecipeOverheads, batch]);

  const produce = async () => {
    if (!active || !canProduce) return;
    setBusy(true);
    try {
      const res = await commitProduction({
        productId: active.product.id,
        showroomId: null, // Factory-only production model
        batch,
        ingredients: items,
        overheads: produceOverheads,
      });
      if (res.visible) {
        toast.success(`✓ Produced ${batch} × ${active.product.name} — batch #${String(res.batchId).replace(/-/g, "").slice(0, 6).toUpperCase()}`);
      } else {
        toast.warning(
          "Batch was saved, but your account cannot see Factory records — so it won't appear in Batch History. Ask an admin to assign you to the Factory location in Roles & Teams.",
          { duration: 9000 },
        );
      }
      setConfirmOpen(false);
      setBatch(1);
      await refresh();
      if (tab === "history") loadHistory(active.product.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to produce");
    } finally {
      setBusy(false);
    }
  };

  // ── Recipe editor ────────────────────────────────────────────────
  const openNewRecipe = () => {
    const firstFree = products.find((p) => !(recipeMap[p.id]?.length));
    setEditorProductId(firstFree?.id ?? products[0]?.id ?? "");
    setEditorItems([{ materialId: "", qty: 0 }]);
    setEditorOverheads([]);
    setEditorBaseline(JSON.stringify({ items: [{ materialId: "", qty: 0 }], ov: [] }));
    setEditorOpen(true);
  };
  const openEditActive = () => {
    if (!active) return;
    setEditorProductId(active.product.id);
    setEditorItems(items.length ? items.map((i) => ({ ...i })) : [{ materialId: "", qty: 0 }]);
    setEditorOverheads(activeRecipeOverheads.map((r) => ({ ...r })));
    setEditorBaseline(
      JSON.stringify({
        items: items.length ? items.map((i) => ({ ...i })) : [{ materialId: "", qty: 0 }],
        ov: activeRecipeOverheads.map((r) => ({ ...r })),
      }),
    );
    setTab("recipe");
  };
  const saveEditor = async (opts?: { closeDialog?: boolean }) => {
    if (!editorProductId) { toast.error("Select a product"); return false; }
    const populated = editorItems.filter((i) => i.materialId || i.subRecipeId);
    if (populated.length === 0) { toast.error("Add at least one ingredient"); return false; }
    const bad = populated.find((i) => !(Number(i.qty) > 0));
    if (bad) {
      const label = bad.subRecipeId
        ? subRecipes.find((s) => s.id === bad.subRecipeId)?.name
        : rawMaterials.find((r) => r.id === bad.materialId)?.name;
      toast.error(`Quantity must be greater than zero${label ? ` for ${label}` : ""}`);
      return false;
    }
    const seen = new Set<string>();
    for (const i of populated) {
      const key = i.subRecipeId ? `sub:${i.subRecipeId}` : `mat:${i.materialId}`;
      if (seen.has(key)) {
        const label = i.subRecipeId
          ? subRecipes.find((s) => s.id === i.subRecipeId)?.name
          : rawMaterials.find((r) => r.id === i.materialId)?.name;
        toast.error(`Duplicate ingredient: ${label ?? key}`);
        return false;
      }
      seen.add(key);
    }
    // Validate overheads: no duplicate (category, mode); positive amounts only kept
    const seenOv = new Set<string>();
    const cleanOverheads = editorOverheads.filter((o) => o.categoryId && Number(o.amount) > 0);
    for (const o of cleanOverheads) {
      const key = `${o.categoryId}::${o.mode}`;
      if (seenOv.has(key)) {
        const cat = overheadCats.find((c) => c.id === o.categoryId);
        toast.error(`Duplicate overhead: ${cat?.name ?? o.categoryId} (${o.mode})`);
        return false;
      }
      seenOv.add(key);
    }
    setEditorSaving(true);
    try {
      await saveRecipe(editorProductId, populated);
      await saveRecipeOverheads(editorProductId, cleanOverheads);
      toast.success("Recipe saved");
      setEditorBaseline(JSON.stringify({ items: populated, ov: cleanOverheads }));
      if (opts?.closeDialog) setEditorOpen(false);
      setActiveId(editorProductId);
      // Refresh the active recipe overheads if we just edited the active product
      if (editorProductId === activeId) {
        try {
          setActiveRecipeOverheads(await loadRecipeOverheads(editorProductId));
        } catch { /* ignore */ }
      }
      await refresh();
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save recipe");
      return false;
    } finally {
      setEditorSaving(false);
    }
  };

  const editorDirty =
    !!editorBaseline &&
    JSON.stringify({ items: editorItems, ov: editorOverheads }) !== editorBaseline;

  const editorGuard = useUnsavedChanges({
    dirty: editorDirty,
    enabled: editorOpen || tab === "recipe",
    onSave: () => saveEditor(),
  });

  const closeEditor = () =>
    editorGuard.guard(() => {
      setEditorBaseline("");
      setEditorOpen(false);
    });

  const deleteActiveRecipe = async () => {
    if (!active) return;
    if (!confirm(`Delete recipe for "${active.product.name}"?`)) return;
    try {
      await saveRecipe(active.product.id, []);
      await saveRecipeOverheads(active.product.id, []);
      toast.success("Recipe deleted");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete recipe");
    }
  };

  // Load recipe items + overheads into editor whenever entering Edit Recipe tab
  useEffect(() => {
    if (tab !== "recipe" || !active) return;
    setEditorProductId(active.product.id);
    setEditorItems(items.length ? items.map((i) => ({ ...i })) : [{ materialId: "", qty: 0 }]);
    setEditorOverheads(activeRecipeOverheads.map((r) => ({ ...r })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeId, activeRecipeOverheads]);

  // ── Batch history ────────────────────────────────────────────────
  const loadHistory = async (productId: string) => {
    setHistoryLoading(true);
    try {
      const sb = supabase as any;
      const { data, error } = await sb
        .from("stock_ledger")
        .select("id,qty,created_at,ref_id,showroom_id,note")
        .eq("kind", "production")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setBatches((data ?? []) as BatchRow[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load batches");
      setBatches([]);
    } finally {
      setHistoryLoading(false);
    }
  };
  useEffect(() => {
    if (tab === "history" && activeId) loadHistory(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeId]);



  // ── Render ───────────────────────────────────────────────────────
  return (
    <AppShell
      title="Production Workbench"
      subtitle="Recipe define + one-click produce — সব এক জায়গায়"
      actions={
        <button
          onClick={openNewRecipe}
          disabled={products.length === 0}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="size-4" /> New Recipe
        </button>
      }
    >
      {loading ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : withRecipes.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="mx-auto size-12 rounded-full bg-primary/10 grid place-items-center mb-4">
            <ChefHat className="size-6 text-primary" />
          </div>
          <h3 className="text-base font-semibold mb-1">No recipes yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Produce করার আগে অন্তত একটা product-এর জন্য recipe (BOM) define করুন।
          </p>
          <button
            onClick={openNewRecipe}
            disabled={products.length === 0}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="size-4" /> Create first recipe
          </button>
          {products.length === 0 && (
            <div className="text-xs text-muted-foreground mt-3">
              No products yet.{" "}
              <Link to="/products" className="text-primary hover:underline">
                Add products first
              </Link>
              .
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Product selector — searchable */}
          <Card className="p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 shrink-0">
                <div className="size-9 rounded-md bg-primary/10 text-primary grid place-items-center">
                  <ChefHat className="size-4" />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Product
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {withRecipes.length} recipe{withRecipes.length === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
              <div className="flex-1 min-w-[260px]">
                <ProductSearchPicker
                  options={withRecipes.map((r) => ({
                    id: r.product.id,
                    name: r.product.name,
                    sku: r.product.sku,
                    hint: r.product.category,
                  }))}
                  value={activeId}
                  onChange={setActiveId}
                  placeholder="Search product by name or SKU…"
                />
              </div>
              {active && <Badge tone="primary">{active.product.category}</Badge>}
            </div>
          </Card>


          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
            <TabButton active={tab === "produce"} onClick={() => setTab("produce")} icon={<Play className="size-3.5" />} label="Produce" />
            <TabButton active={tab === "recipe"} onClick={() => setTab("recipe")} icon={<Pencil className="size-3.5" />} label="Edit Recipe" />
            <TabButton active={tab === "list"} onClick={() => setTab("list")} icon={<BookOpen className="size-3.5" />} label="Recipe list" />
            <TabButton active={tab === "history"} onClick={() => setTab("history")} icon={<History className="size-3.5" />} label="Batch history" />
            <TabButton active={tab === "overheads"} onClick={() => setTab("overheads")} icon={<CircleDollarSign className="size-3.5" />} label="Overheads" />
          </div>

          {tab === "list" && (
            <RecipeAccordionList
              recipes={withRecipes}
              rawMaterials={rawMaterials}
              activeId={activeId}
              onPick={(id) => {
                setActiveId(id);
                setTab("recipe");
              }}
            />
          )}


          {tab === "produce" && active && (
            <ProduceTab
              productName={active.product.name}
              rows={rows}
              batch={batch}
              setBatch={setBatch}
              unitCost={unitCost}
              materialUnitCost={materialUnitCost}
              overheadUnitCost={overheadUnitCost}
              batchCost={batchCost}
              materialCost={materialCost}
              overheadCost={overheadCost}
              shortRows={shortRows}
              canProduce={canProduce}
              onProduce={() => setConfirmOpen(true)}
              overheadCats={overheadCats}
              overheads={produceOverheads}
              setOverheads={setProduceOverheads}
            />
          )}

          {tab === "recipe" && active && (
            <RecipeTab
              productId={editorProductId}
              onChangeProduct={setEditorProductId}
              products={products}
              recipeMap={recipeMap}
              rawMaterials={rawMaterials}
              subRecipes={subRecipes}
              items={editorItems}
              setItems={setEditorItems}
              overheads={editorOverheads}
              setOverheads={setEditorOverheads}
              overheadCats={overheadCats}
              onAddCategory={async (name) => {
                try {
                  const cat = await addOverheadCategory(name);
                  setOverheadCats((cs) => [...cs, cat].sort((a, b) => a.name.localeCompare(b.name)));
                  return cat.id;
                } catch (e: any) {
                  toast.error(e?.message ?? "Failed to add category");
                  return null;
                }
              }}
              saving={editorSaving}
              onSave={() => saveEditor()}
              onDelete={deleteActiveRecipe}
              hasRecipe={items.length > 0}
            />
          )}

          {tab === "overheads" && (
            <OverheadManagerPanel
              cats={overheadCats}
              onChanged={async () => {
                try {
                  setOverheadCats(await loadOverheadCategories());
                } catch (e: any) {
                  toast.error(e?.message ?? "Failed to reload overheads");
                }
              }}
            />
          )}

          {tab === "history" && active && (
            <HistoryTab
              productName={active.product.name}
              rows={batches}
              loading={historyLoading}
              currentUnitCost={unitCost}
              showroomLookup={Object.fromEntries(showrooms.map((s) => [s.id, s.name]))}
            />
          )}
        </div>
      )}

      {/* Confirm dialog for Produce */}
      {confirmOpen && active && (
        <div
          className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4"
          onClick={() => !busy && setConfirmOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                <Factory className="size-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold">Produce নিশ্চিত করুন</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  <b>{batch}</b> × <b>{active.product.name}</b> produce করা হবে। {rows.length}টি raw material auto-deduct হবে (মোট খরচ ৳{batchCost.toFixed(2)})।
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
                className="px-4 h-10 rounded-md border border-border text-sm hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={produce}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                <Play className="size-4" /> {busy ? "Producing…" : "Confirm & Produce"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Recipe dialog */}
      {editorOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4 overflow-y-auto"
          onClick={() => !editorSaving && closeEditor()}
        >
          <div
            className="bg-card border border-border sm:rounded-xl shadow-2xl w-full sm:max-w-5xl h-full sm:h-[95vh] flex flex-col overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 border-b border-border flex items-start justify-between gap-3 sticky top-0 bg-card z-10">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <ChefHat className="size-5 text-primary" />
                  Create Recipe
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Choose a target product and define raw material requirements per unit produced.
                </p>
              </div>
              <button
                onClick={() => !editorSaving && closeEditor()}
                className="size-9 grid place-items-center rounded-md hover:bg-accent text-muted-foreground shrink-0"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-5 overflow-auto flex-1">
              <RecipeEditorBody
                productId={editorProductId}
                onChangeProduct={setEditorProductId}
                products={products}
                recipeMap={recipeMap}
                rawMaterials={rawMaterials}
                subRecipes={subRecipes}
                items={editorItems}
                setItems={setEditorItems}
              />
            </div>

            <div className="p-3 sm:p-4 border-t border-border flex items-center justify-end gap-2 sticky bottom-0 bg-card">
              <button
                onClick={closeEditor}
                disabled={editorSaving}
                className="px-4 h-10 rounded-md border border-border bg-background text-sm hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => saveEditor({ closeDialog: true })}
                disabled={editorSaving || !editorProductId}
                className="px-5 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Save className="size-4" />
                {editorSaving ? "Saving…" : "Save Recipe"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={editorGuard.open}
        title="Unsaved recipe changes"
        description="Recipe-এ save না করা পরিবর্তন আছে। Save করবেন, নাকি বাদ দেবেন?"
        confirmLabel="Save"
        altLabel="Don't save"
        cancelLabel="Keep editing"
        busy={editorGuard.busy || editorSaving}
        onConfirm={() => void editorGuard.saveAndProceed()}
        onAlt={() => { setEditorBaseline(""); editorGuard.proceed(); }}
        onCancel={editorGuard.cancel}
      />
    </AppShell>
  );
}

const DECIMAL_RE = /^\d*(\.\d{0,6})?$/;
function DecimalInput({
  value,
  onChange,
  className,
  placeholder = "0",
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string>(value ? String(value) : "");
  useEffect(() => {
    // sync when external value changes and doesn't match current draft
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed !== value) {
      setDraft(value ? String(value) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={draft}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || DECIMAL_RE.test(v)) {
          setDraft(v);
          const n = v === "" || v === "." ? 0 : Number(v);
          if (Number.isFinite(n)) onChange(n);
        }
      }}
      onBlur={() => {
        if (draft === "" || draft === ".") { setDraft(""); onChange(0); }
      }}
      className={className}
    />
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-10 px-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}


function RecipeAccordionList({
  recipes,
  rawMaterials,
  activeId,
  onPick,
}: {
  recipes: { product: Product; items: Ingredient[] }[];
  rawMaterials: RawMaterial[];
  activeId: string;
  onPick: (id: string) => void;
}) {
  const [openId, setOpenId] = useState<string>(activeId);
  const [q, setQ] = useState("");
  const rmMap = useMemo(() => {
    const m: Record<string, RawMaterial> = {};
    for (const r of rawMaterials) m[r.id] = r;
    return m;
  }, [rawMaterials]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return recipes;
    return recipes.filter(
      (r) =>
        r.product.name.toLowerCase().includes(term) ||
        (r.product.sku ?? "").toLowerCase().includes(term),
    );
  }, [recipes, q]);
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2 px-1 gap-2 flex-wrap">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          All recipes ({recipes.length})
        </div>
        <div className="relative">
          <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search recipes…"
            className="h-8 pl-7 pr-2 text-xs rounded-md border border-border bg-background w-52"
          />
        </div>
      </div>
      <div className="divide-y divide-border border border-border rounded-md overflow-hidden">
        {filtered.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">No matching recipes.</div>
        )}
        {filtered.map((r) => {
          const open = openId === r.product.id;
          const isActive = activeId === r.product.id;
          return (
            <div key={r.product.id} className="bg-background">
              <button
                onClick={() => setOpenId(open ? "" : r.product.id)}
                className={`w-full flex items-center gap-2 px-3 h-10 text-left text-sm transition-colors ${
                  isActive ? "bg-primary/5" : "hover:bg-accent"
                }`}
              >
                <ChevronDown
                  className={`size-3.5 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
                />
                <ChefHat className="size-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">
                  {r.product.name}
                  {isActive && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-primary">
                      editing
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {r.items.length} ingr.
                </span>
                {!isActive && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPick(r.product.id);
                    }}
                    className="ml-1 inline-flex items-center h-6 px-2 rounded border border-border text-[11px] hover:bg-accent"
                  >
                    Edit
                  </span>
                )}
              </button>
              {open && (
                <div className="px-3 pb-3 pt-1 bg-muted/30">
                  {r.items.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-1">
                      No ingredients yet.
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left font-normal py-1">Ingredient</th>
                          <th className="text-right font-normal py-1 w-28">Qty / unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.items.map((it, i) => {
                          const raw = rmMap[it.materialId];
                          return (
                            <tr key={i} className="border-t border-border/60">
                              <td className="py-1">
                                {raw?.name ?? "—"}
                                {raw?.unit && (
                                  <span className="text-muted-foreground"> ({raw.unit})</span>
                                )}
                              </td>
                              <td className="py-1 text-right tabular-nums">
                                {it.qty}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ProduceTab({
  productName,
  rows,
  batch,
  setBatch,
  unitCost,
  materialUnitCost,
  overheadUnitCost,
  batchCost,
  materialCost,
  overheadCost,
  shortRows,
  canProduce,
  onProduce,
  overheadCats,
  overheads,
  setOverheads,
}: {
  productName: string;
  rows: Array<{
    it: Ingredient;
    raw?: RawMaterial;
    need: number;
    have: number;
    short: number;
    lineCost: number;
    ok: boolean;
    sources?: { label: string; qty: number; kind: "material" | "sub" }[];
  }>;
  batch: number;
  setBatch: (v: number | ((b: number) => number)) => void;
  unitCost: number;
  materialUnitCost: number;
  overheadUnitCost: number;
  batchCost: number;
  materialCost: number;
  overheadCost: number;
  shortRows: Array<{ it: Ingredient; raw?: RawMaterial; short: number }>;
  canProduce: boolean;
  onProduce: () => void;
  overheadCats: OverheadCategory[];
  overheads: BatchOverhead[];
  setOverheads: React.Dispatch<React.SetStateAction<BatchOverhead[]>>;
}) {
  const addOverhead = () => {
    const used = new Set(overheads.map((o) => o.categoryId));
    const free = overheadCats.find((c) => !used.has(c.id));
    setOverheads((prev) => [...prev, { categoryId: free?.id ?? overheadCats[0]?.id ?? "", amount: 0 }]);
  };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
      <Card className="p-5 space-y-4 h-fit">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Batch quantity
          </label>
          <div className="mt-1.5 flex items-center rounded-md border border-border bg-background overflow-hidden">
            <button
              onClick={() => setBatch((b) => Math.max(1, b - 1))}
              className="size-11 grid place-items-center hover:bg-accent text-muted-foreground"
              aria-label="Decrease"
            >
              <Minus className="size-4" />
            </button>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={batch === 0 ? "" : String(batch)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "");
                if (raw === "") { setBatch(0); return; }
                setBatch(parseInt(raw, 10));
              }}
              onBlur={() => { if (!batch || batch < 1) setBatch(1); }}
              className="flex-1 h-11 text-center text-base font-medium bg-transparent outline-none border-x border-border [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              onClick={() => setBatch((b) => b + 1)}
              className="size-11 grid place-items-center hover:bg-accent text-muted-foreground"
              aria-label="Increase"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MiniStat icon={<Package className="size-3.5" />} label="Ingredients" value={String(rows.length)} />
          <MiniStat icon={<CircleDollarSign className="size-3.5" />} label="Unit cost" value={`৳${unitCost.toFixed(2)}`} />
        </div>

        <div className="rounded-md border border-border bg-muted/20 p-2.5 text-[11px] text-muted-foreground grid grid-cols-2 gap-y-1">
          <span>Material</span><span className="text-right text-foreground">৳{materialUnitCost.toFixed(2)}/unit</span>
          <span>Overhead</span><span className="text-right text-foreground">৳{overheadUnitCost.toFixed(2)}/unit</span>
        </div>

        {rows.some((r) => (r.sources?.length ?? 0) > 1) && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5" /> একই material একাধিক সোর্স থেকে
            </div>
            {rows
              .filter((r) => (r.sources?.length ?? 0) > 1)
              .map((r) => (
                <div key={`ov-${r.it.materialId}`} className="text-muted-foreground">
                  · <span className="text-foreground font-medium">{r.raw?.name ?? r.it.materialId}</span>{" "}
                  — {r.sources!.map((s) => s.label).join(" + ")} (total {r.need.toFixed(4)} {r.raw?.unit ?? ""})
                </div>
              ))}
          </div>
        )}

        {shortRows.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive p-3 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-3.5" /> Raw material কম আছে
            </div>
            {shortRows.map((r) => (
              <div key={r.it.materialId}>
                · {r.raw?.name ?? r.it.materialId}: {r.short} {r.raw?.unit} short
              </div>
            ))}
            <Link to="/raw-material-stock" className="inline-block mt-1 underline">
              Stock In করুন →
            </Link>
          </div>
        )}

        <button
          onClick={onProduce}
          disabled={!canProduce}
          className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-md bg-primary text-primary-foreground text-base font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="size-4" /> Produce Now
        </button>
        <div className="text-[11px] text-muted-foreground text-center">
          Total ৳{batchCost.toFixed(2)} = Material ৳{materialCost.toFixed(2)} + Overhead ৳{overheadCost.toFixed(2)}
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Factory className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Raw material preview</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {batch} × {productName} বানাতে যা লাগবে
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/20">
                <tr>
                  <th className="text-left font-medium px-5 py-2.5">Material</th>
                  <th className="text-right font-medium px-5 py-2.5">Need</th>
                  <th className="text-right font-medium px-5 py-2.5">In stock</th>
                  <th className="text-right font-medium px-5 py-2.5">Cost</th>
                  <th className="text-right font-medium px-5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.it.materialId} className="hover:bg-muted/20">
                    <td className="px-5 py-3 font-medium">{r.raw?.name ?? r.it.materialId}</td>
                    <td className="px-5 py-3 text-right">
                      {r.need} {r.raw?.unit}
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground">
                      {r.have} {r.raw?.unit}
                    </td>
                    <td className="px-5 py-3 text-right">৳{r.lineCost.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right">
                      <Badge tone={r.ok ? "success" : "danger"}>{r.ok ? "OK" : "Short"}</Badge>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                      কোনো ingredient নেই
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="p-5 border-b border-border bg-muted/30 flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <CircleDollarSign className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Production overheads</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Gas, electricity, labor ইত্যাদি — এই ব্যাচের total খরচ
              </p>
            </div>
            <button
              onClick={addOverhead}
              disabled={overheadCats.length === 0}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-border bg-background text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              <Plus className="size-3.5" /> Add
            </button>
          </div>
          <div className="p-4 space-y-2">
            {overheads.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">
                কোনো overhead নেই। Recipe-এ default set করলে এখানে auto-fill হবে।
              </div>
            )}
            {overheads.map((o, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_120px_36px] gap-2 items-center">
                <select
                  value={o.categoryId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setOverheads((prev) => prev.map((x, i) => (i === idx ? { ...x, categoryId: v } : x)));
                  }}
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {overheadCats.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <DecimalInput
                  value={Number(o.amount) || 0}
                  onChange={(v) => {
                    setOverheads((prev) => prev.map((x, i) => (i === idx ? { ...x, amount: v } : x)));
                  }}
                  placeholder="৳ 0"
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm text-right outline-none focus:border-primary tabular-nums"
                />
                <button
                  onClick={() => setOverheads((prev) => prev.filter((_, i) => i !== idx))}
                  className="size-9 grid place-items-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40"
                  aria-label="Remove"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function RecipeTab(props: {
  productId: string;
  onChangeProduct: (id: string) => void;
  products: Product[];
  recipeMap: Record<string, Ingredient[]>;
  rawMaterials: RawMaterial[];
  subRecipes: SubRecipe[];
  items: Ingredient[];
  setItems: React.Dispatch<React.SetStateAction<Ingredient[]>>;
  overheads: RecipeOverhead[];
  setOverheads: React.Dispatch<React.SetStateAction<RecipeOverhead[]>>;
  overheadCats: OverheadCategory[];
  onAddCategory: (name: string) => Promise<string | null>;
  saving: boolean;
  onSave: () => void;
  onDelete: () => void;
  hasRecipe: boolean;
}) {
  const addLine = () => {
    const used = new Set(props.overheads.map((o) => o.categoryId));
    const free = props.overheadCats.find((c) => !used.has(c.id));
    props.setOverheads((prev) => [
      ...prev,
      { categoryId: free?.id ?? props.overheadCats[0]?.id ?? "", amount: 0, mode: "per_unit" },
    ]);
  };
  const addNewCategory = async () => {
    const name = window.prompt("New overhead category name (e.g. Gas, Electricity, Labor)");
    if (!name || !name.trim()) return;
    const id = await props.onAddCategory(name.trim());
    if (id) {
      props.setOverheads((prev) => [...prev, { categoryId: id, amount: 0, mode: "per_unit" }]);
    }
  };
  return (
    <Card className="p-5 space-y-4">
      <RecipeEditorBody
        productId={props.productId}
        onChangeProduct={props.onChangeProduct}
        products={props.products}
        recipeMap={props.recipeMap}
        rawMaterials={props.rawMaterials}
        subRecipes={props.subRecipes}
        items={props.items}
        setItems={props.setItems}
      />

      <div className="pt-4 border-t border-border space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <CircleDollarSign className="size-4 text-primary" /> Default overheads
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Gas, বিদ্যুৎ, লেবার ইত্যাদি — produce করার সময় auto-fill হবে
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={addNewCategory}
              className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-border bg-background text-xs hover:bg-accent"
            >
              <Plus className="size-3" /> Category
            </button>
            <button
              onClick={addLine}
              disabled={props.overheadCats.length === 0}
              className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-border bg-background text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              <Plus className="size-3" /> Add line
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {props.overheads.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-md">
              কোনো default overhead সেট করা নেই
            </div>
          )}
          {props.overheads.map((o, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_110px_110px_36px] gap-2 items-center">
              <select
                value={o.categoryId}
                onChange={(e) => {
                  const v = e.target.value;
                  props.setOverheads((prev) => prev.map((x, i) => (i === idx ? { ...x, categoryId: v } : x)));
                }}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              >
                {props.overheadCats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <DecimalInput
                value={Number(o.amount) || 0}
                onChange={(v) => {
                  props.setOverheads((prev) => prev.map((x, i) => (i === idx ? { ...x, amount: v } : x)));
                }}
                placeholder="৳ 0"
                className="h-9 rounded-md border border-border bg-background px-2 text-sm text-right outline-none focus:border-primary tabular-nums"
              />
              <select
                value={o.mode}
                onChange={(e) => {
                  const v = e.target.value as "per_unit" | "per_batch";
                  props.setOverheads((prev) => prev.map((x, i) => (i === idx ? { ...x, mode: v } : x)));
                }}
                className="h-9 rounded-md border border-border bg-background px-2 text-xs"
              >
                <option value="per_unit">per unit</option>
                <option value="per_batch">per batch</option>
              </select>
              <button
                onClick={() => props.setOverheads((prev) => prev.filter((_, i) => i !== idx))}
                className="size-9 grid place-items-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40"
                aria-label="Remove"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        {props.hasRecipe && (
          <button
            onClick={props.onDelete}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border bg-background text-sm text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-3.5" /> Delete
          </button>
        )}
        <button
          onClick={props.onSave}
          disabled={props.saving}
          className="inline-flex items-center gap-1.5 px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="size-3.5" /> {props.saving ? "Saving…" : "Save Recipe"}
        </button>
      </div>
    </Card>
  );
}


function RecipeEditorBody({
  productId,
  onChangeProduct,
  products,
  recipeMap,
  rawMaterials,
  subRecipes,
  items,
  setItems,
}: {
  productId: string;
  onChangeProduct: (id: string) => void;
  products: Product[];
  recipeMap: Record<string, Ingredient[]>;
  rawMaterials: RawMaterial[];
  subRecipes: SubRecipe[];
  items: Ingredient[];
  setItems: React.Dispatch<React.SetStateAction<Ingredient[]>>;
}) {
  return (
    <>
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Product
        </label>
        <div className="mt-1.5">
          <ProductSearchPicker
            options={products.map((p) => ({
              id: p.id,
              name: p.name,
              sku: p.sku,
              hint: (recipeMap[p.id]?.length ?? 0) > 0 ? "has recipe" : undefined,
            }))}
            value={productId}
            onChange={onChangeProduct}
            placeholder="Search a product to define recipe…"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Ingredients (per unit)
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setItems((it) => [...it, { materialId: "", qty: 0 }])}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Plus className="size-3" /> Raw material
            </button>
            <button
              onClick={() => setItems((it) => [...it, { materialId: "", subRecipeId: "", qty: 0 }])}
              disabled={subRecipes.length === 0}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-40 disabled:no-underline"
              title={subRecipes.length === 0 ? "Create sub-recipes first" : ""}
            >
              <Plus className="size-3" /> Sub-recipe
            </button>
          </div>
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
            {items.map((it, idx) => {
              const isSub = it.subRecipeId !== undefined;
              const raw = rawMaterials.find((r) => r.id === it.materialId);
              const sub = subRecipes.find((s) => s.id === it.subRecipeId);
              const usedMatIds = new Set(
                items
                  .filter((_, i) => i !== idx)
                  .filter((i) => !i.subRecipeId)
                  .map((i) => i.materialId)
                  .filter(Boolean),
              );
              const usedSubIds = new Set(
                items
                  .filter((_, i) => i !== idx)
                  .map((i) => i.subRecipeId)
                  .filter(Boolean) as string[],
              );
              const unitCostPerYield =
                sub && sub.yield_qty > 0
                  ? sub.items.reduce((s, si) => {
                      const rm = rawMaterials.find((r) => r.id === si.materialId);
                      return s + (rm?.cost ?? 0) * si.qty;
                    }, 0) / sub.yield_qty
                  : 0;
              const lineCost = isSub
                ? unitCostPerYield * (Number(it.qty) || 0)
                : (raw?.cost ?? 0) * (Number(it.qty) || 0);
              const unitLabel = isSub ? sub?.yield_unit ?? "" : raw?.unit ?? "";
              return (
                <div key={idx} className="flex items-center gap-2">
                  {isSub ? (
                    <select
                      value={it.subRecipeId ?? ""}
                      onChange={(e) =>
                        setItems((arr) =>
                          arr.map((x, i) =>
                            i === idx ? { ...x, subRecipeId: e.target.value, materialId: "" } : x,
                          ),
                        )
                      }
                      className="flex-1 min-w-0 h-10 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                    >
                      <option value="">Select sub-recipe…</option>
                      {subRecipes.map((s) => (
                        <option
                          key={s.id}
                          value={s.id}
                          disabled={usedSubIds.has(s.id) && s.id !== it.subRecipeId}
                        >
                          {s.name} (yield {s.yield_qty} {s.yield_unit})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <IngredientPicker
                      materials={rawMaterials}
                      value={it.materialId}
                      onChange={(id) =>
                        setItems((arr) =>
                          arr.map((x, i) => (i === idx ? { ...x, materialId: id } : x)),
                        )
                      }
                      disabledIds={usedMatIds}
                    />
                  )}
                  <DecimalInput
                    value={Number(it.qty) || 0}
                    onChange={(n) =>
                      setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, qty: n } : x)))
                    }
                    className="w-24 h-10 px-2 rounded-md border border-border bg-background text-sm text-right outline-none focus:border-primary tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground w-10 shrink-0">{unitLabel}</span>
                  <span className="text-xs text-muted-foreground w-20 text-right shrink-0 tabular-nums">
                    {lineCost > 0 ? `৳${lineCost.toFixed(2)}` : ""}
                  </span>
                  {isSub && (
                    <span className="text-[10px] uppercase tracking-wider text-primary/70 shrink-0">
                      sub
                    </span>
                  )}
                  <button
                    onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))}
                    className="size-9 grid place-items-center rounded-md hover:bg-destructive/10 text-destructive shrink-0"
                    aria-label="Remove ingredient"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
            {items.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-3">
                No ingredients added yet.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function HistoryTab({
  productName,
  rows,
  loading,
  currentUnitCost,
  showroomLookup,
}: {
  productName: string;
  rows: BatchRow[];
  loading: boolean;
  currentUnitCost: number;
  showroomLookup: Record<string, string>;
}) {
  const totalQty = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
  const totalCost = rows.reduce((s, r) => s + Number(r.qty || 0) * currentUnitCost, 0);
  const first = rows[rows.length - 1];
  const last = rows[0];

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Batches</div>
          <div className="text-2xl font-semibold mt-1">{rows.length}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Last 50 shown</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total produced</div>
          <div className="text-2xl font-semibold mt-1">{totalQty}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">units of {productName}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Est. cost</div>
          <div className="text-2xl font-semibold mt-1">৳{totalCost.toFixed(2)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">@ ৳{currentUnitCost.toFixed(2)}/unit today</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Latest</div>
          <div className="text-2xl font-semibold mt-1">
            {last ? relativeTime(last.created_at) : "—"}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            First: {first ? first.created_at.slice(0, 10) : "—"}
          </div>
        </Card>
      </div>

      {/* Detailed table */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Batch history — {productName}</h3>
          </div>
          <span className="text-[11px] text-muted-foreground">Newest first</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto size-12 rounded-full bg-muted grid place-items-center mb-3">
              <History className="size-5 text-muted-foreground" />
            </div>
            <div className="text-sm font-medium">No batches yet</div>
            <div className="text-xs text-muted-foreground mt-1">
              Produce your first batch from the Produce tab.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/20">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Batch</th>
                  <th className="text-left font-medium px-4 py-2.5">Date &amp; time</th>
                  <th className="text-left font-medium px-4 py-2.5">Location</th>
                  <th className="text-right font-medium px-4 py-2.5">Qty</th>
                  <th className="text-right font-medium px-4 py-2.5">Est. unit</th>
                  <th className="text-right font-medium px-4 py-2.5">Est. total</th>
                  <th className="text-left font-medium px-4 py-2.5">Note</th>
                  <th className="text-right font-medium px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const dt = new Date(r.created_at);
                  const qty = Number(r.qty || 0);
                  const line = qty * currentUnitCost;
                  const loc = r.showroom_id ? (showroomLookup[r.showroom_id] ?? "Showroom") : "Factory";
                  return (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-semibold">
                          #{r.id.slice(0, 6).toUpperCase()}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {relativeTime(r.created_at)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium">{dt.toLocaleDateString()}</div>
                        <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={r.showroom_id ? "primary" : "success"}>{loc}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">+{qty}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        ৳{currentUnitCost.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">৳{line.toFixed(2)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                        {r.note ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to="/production/labels/$ledgerId"
                          params={{ ledgerId: r.id }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <Tag className="size-3" /> Labels
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ProductSearchPicker({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: Array<{ id: string; name: string; sku: string; hint?: string }>;
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = options.find((o) => o.id === value);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(s) ||
        o.sku.toLowerCase().includes(s),
    );
  }, [q, options]);


  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm font-medium flex items-center justify-between gap-2 hover:border-primary/60 focus:border-primary outline-none"
      >
        <span className="truncate text-left">
          {selected ? (
            <>
              {selected.name}
              <span className="text-muted-foreground font-normal"> · {selected.sku}</span>
            </>
          ) : (
            <span className="text-muted-foreground font-normal">{placeholder ?? "Search…"}</span>
          )}
        </span>
        <ChevronDown className="size-4 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 left-0 right-0 rounded-md border border-border bg-popover shadow-lg overflow-hidden">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="size-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={placeholder ?? "Search…"}
                  className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="max-h-[60vh] sm:max-h-96 overflow-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No products match “{q}”
                </div>
              ) : (
                filtered.map((o) => {
                  const active = o.id === value;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        onChange(o.id);
                        setOpen(false);
                        setQ("");
                      }}
                      className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 hover:bg-accent ${
                        active ? "bg-accent/60" : ""
                      }`}
                    >
                      <Check
                        className={`size-3.5 shrink-0 ${
                          active ? "text-primary" : "text-transparent"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{o.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {o.sku}
                          {o.hint ? ` · ${o.hint}` : ""}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <div className="px-3 py-1.5 border-t border-border bg-muted/40 text-[10px] text-muted-foreground text-center">
              {filtered.length} of {options.length} products
            </div>

          </div>
        </>
      )}
    </div>
  );
}


function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}


/* ── Overhead master-list manager ───────────────────────────────── */
function OverheadManagerPanel({
  cats,
  onChanged,
}: {
  cats: OverheadCategory[];
  onChanged: () => Promise<void> | void;
}) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [usage, setUsage] = useState<Record<string, { recipes: number; batches: number }>>({});

  useEffect(() => {
    (async () => {
      try {
        const entries = await Promise.all(
          cats.map(async (c) => [c.id, await overheadCategoryUsage(c.id)] as const),
        );
        setUsage(Object.fromEntries(entries));
      } catch {
        setUsage({});
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats.length]);

  const add = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    setBusy(true);
    try {
      await addOverheadCategory(name);
      setNewName("");
      await onChanged();
      toast.success(`Added "${name}"`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add overhead");
    } finally {
      setBusy(false);
    }
  };

  const saveRename = async () => {
    if (!editId) return;
    setBusy(true);
    try {
      await renameOverheadCategory(editId, editName);
      setEditId(null);
      await onChanged();
      toast.success("Overhead renamed");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to rename overhead");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: OverheadCategory) => {
    if (!window.confirm(`Remove overhead "${c.name}"?`)) return;
    setBusy(true);
    try {
      await removeOverheadCategory(c.id);
      await onChanged();
      toast.success(`Removed "${c.name}"`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove overhead");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <CircleDollarSign className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Production overheads</h3>
        <span className="text-xs text-muted-foreground">
          {cats.length} item{cats.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New overhead name (Gas, Electricity, Labor…)"
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <Button onClick={add} disabled={busy}>
          <Plus className="size-4 mr-1" /> Add
        </Button>
      </div>

      <div className="divide-y divide-border rounded-md border border-border">
        {cats.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No overheads yet.</p>
        )}
        {cats.map((c) => {
          const u = usage[c.id];
          return (
            <div key={c.id} className="flex items-center gap-2 p-2">
              {editId === c.id ? (
                <>
                  <Input
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename();
                      if (e.key === "Escape") setEditId(null);
                    }}
                  />
                  <Button size="sm" onClick={saveRename} disabled={busy}>
                    <Save className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditId(null)}>
                    <X className="size-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {u ? `${u.recipes} recipe default(s) · ${u.batches} batch record(s)` : "…"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditId(c.id);
                      setEditName(c.name);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(c)} disabled={busy}>
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
