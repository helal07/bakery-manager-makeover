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
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  loadRecipes,
  commitProduction,
  saveRecipe,
  type Ingredient,
} from "@/lib/recipe-store";
import { loadProducts, type Product } from "@/lib/product-store";
import { loadRawMaterials, type RawMaterial } from "@/lib/raw-material-store";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PermissionGate } from "@/components/permission-gate";
import { pageTitle } from "@/lib/company-settings";

type Search = { product?: string; tab?: "produce" | "recipe" | "history" };

export const Route = createFileRoute("/_authenticated/recipes")({
  head: () => ({ meta: [{ title: pageTitle("Production Workbench") }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    product: typeof s.product === "string" ? s.product : undefined,
    tab:
      s.tab === "recipe" || s.tab === "history" || s.tab === "produce"
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

type TabKey = "produce" | "recipe" | "history";
type BatchRow = {
  id: string;
  qty: number;
  created_at: string;
  ref_id: string | null;
};

function Workbench() {
  const { currentShowroomId } = useShowroomScope();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [products, setProducts] = useState<Product[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [recipeMap, setRecipeMap] = useState<Record<string, Ingredient[]>>({});
  const [loading, setLoading] = useState(true);

  const [activeId, setActiveId] = useState<string>(search.product ?? "");
  const [tab, setTab] = useState<TabKey>(search.tab ?? "produce");
  const [batch, setBatch] = useState(1);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Recipe editor state (used in Edit Recipe tab and New Recipe dialog)
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorProductId, setEditorProductId] = useState<string>("");
  const [editorItems, setEditorItems] = useState<Ingredient[]>([]);
  const [editorSaving, setEditorSaving] = useState(false);

  // Batch history
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const refresh = async () => {
    try {
      const [ps, rms, rm] = await Promise.all([
        loadProducts(currentShowroomId ?? null),
        loadRawMaterials(null), // factory-only raw stock
        loadRecipes(),
      ]);
      setProducts(ps);
      setRawMaterials(rms);
      setRecipeMap(rm);
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

  const rows = items.map((it) => {
    const raw = rawMaterials.find((r) => r.id === it.materialId);
    const need = it.qty * batch;
    const have = stock[it.materialId] ?? 0;
    const short = Math.max(0, need - have);
    const lineCost = (raw?.cost ?? 0) * need;
    return { it, raw, need, have, short, lineCost, ok: short === 0 };
  });

  const shortRows = rows.filter((r) => !r.ok);
  const batchCost = rows.reduce((s, r) => s + r.lineCost, 0);
  const unitCost = batch > 0 ? batchCost / batch : 0;
  const canProduce =
    !!active && rows.length > 0 && shortRows.length === 0 && !busy;

  const produce = async () => {
    if (!active || !canProduce) return;
    setBusy(true);
    try {
      await commitProduction({
        productId: active.product.id,
        showroomId: currentShowroomId ?? null,
        batch,
        ingredients: items,
      });
      toast.success(`✓ Produced ${batch} × ${active.product.name}`);
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
    setEditorItems([{ materialId: "", qty: 1 }]);
    setEditorOpen(true);
  };
  const openEditActive = () => {
    if (!active) return;
    setEditorProductId(active.product.id);
    setEditorItems(items.length ? items.map((i) => ({ ...i })) : [{ materialId: "", qty: 1 }]);
    setTab("recipe");
  };
  const saveEditor = async (opts?: { closeDialog?: boolean }) => {
    if (!editorProductId) return toast.error("Select a product");
    const populated = editorItems.filter((i) => i.materialId);
    if (populated.length === 0) return toast.error("Add at least one ingredient");
    const bad = populated.find((i) => !(Number(i.qty) > 0));
    if (bad) {
      const raw = rawMaterials.find((r) => r.id === bad.materialId);
      return toast.error(`Quantity must be greater than zero${raw ? ` for ${raw.name}` : ""}`);
    }
    const seen = new Set<string>();
    for (const i of populated) {
      if (seen.has(i.materialId)) {
        const raw = rawMaterials.find((r) => r.id === i.materialId);
        return toast.error(`Duplicate ingredient: ${raw?.name ?? i.materialId}`);
      }
      seen.add(i.materialId);
    }
    setEditorSaving(true);
    try {
      await saveRecipe(editorProductId, populated);
      toast.success("Recipe saved");
      if (opts?.closeDialog) setEditorOpen(false);
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

  // Load recipe items into editor whenever entering Edit Recipe tab
  useEffect(() => {
    if (tab !== "recipe" || !active) return;
    setEditorProductId(active.product.id);
    setEditorItems(items.length ? items.map((i) => ({ ...i })) : [{ materialId: "", qty: 1 }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeId]);

  // ── Batch history ────────────────────────────────────────────────
  const loadHistory = async (productId: string) => {
    setHistoryLoading(true);
    try {
      const sb = supabase as any;
      const { data, error } = await sb
        .from("stock_ledger")
        .select("id,qty,created_at,ref_id")
        .eq("kind", "production")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(20);
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
          {/* Product selector */}
          <Card className="p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
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
              <select
                value={activeId}
                onChange={(e) => setActiveId(e.target.value)}
                className="flex-1 min-w-[240px] h-10 px-3 rounded-md border border-border bg-background text-sm font-medium outline-none focus:border-primary"
              >
                {withRecipes.map((r) => (
                  <option key={r.product.id} value={r.product.id}>
                    {r.product.name} · {r.product.sku}
                  </option>
                ))}
              </select>
              {active && (
                <Badge tone="primary">{active.product.category}</Badge>
              )}
            </div>
          </Card>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-border">
            <TabButton active={tab === "produce"} onClick={() => setTab("produce")} icon={<Play className="size-3.5" />} label="Produce" />
            <TabButton active={tab === "recipe"} onClick={() => setTab("recipe")} icon={<Pencil className="size-3.5" />} label="Edit Recipe" />
            <TabButton active={tab === "history"} onClick={() => setTab("history")} icon={<History className="size-3.5" />} label="Batch history" />
          </div>

          {tab === "produce" && active && (
            <ProduceTab
              productName={active.product.name}
              rows={rows}
              batch={batch}
              setBatch={setBatch}
              unitCost={unitCost}
              batchCost={batchCost}
              shortRows={shortRows}
              canProduce={canProduce}
              onProduce={() => setConfirmOpen(true)}
            />
          )}

          {tab === "recipe" && active && (
            <RecipeTab
              productId={editorProductId}
              onChangeProduct={setEditorProductId}
              products={products}
              recipeMap={recipeMap}
              rawMaterials={rawMaterials}
              items={editorItems}
              setItems={setEditorItems}
              saving={editorSaving}
              onSave={() => saveEditor()}
              onDelete={deleteActiveRecipe}
              hasRecipe={items.length > 0}
            />
          )}

          {tab === "history" && active && (
            <HistoryTab
              productName={active.product.name}
              rows={batches}
              loading={historyLoading}
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
          className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4"
          onClick={() => !editorSaving && setEditorOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">Create Recipe</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select a product and define its raw material requirements per unit.
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
              <RecipeEditorBody
                productId={editorProductId}
                onChangeProduct={setEditorProductId}
                products={products}
                recipeMap={recipeMap}
                rawMaterials={rawMaterials}
                items={editorItems}
                setItems={setEditorItems}
              />
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
                onClick={() => saveEditor({ closeDialog: true })}
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

function ProduceTab({
  productName,
  rows,
  batch,
  setBatch,
  unitCost,
  batchCost,
  shortRows,
  canProduce,
  onProduce,
}: {
  productName: string;
  rows: Array<{ it: Ingredient; raw?: RawMaterial; need: number; have: number; short: number; lineCost: number; ok: boolean }>;
  batch: number;
  setBatch: (v: number | ((b: number) => number)) => void;
  unitCost: number;
  batchCost: number;
  shortRows: Array<{ it: Ingredient; raw?: RawMaterial; short: number }>;
  canProduce: boolean;
  onProduce: () => void;
}) {
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
              type="number"
              min={1}
              value={batch}
              onChange={(e) => setBatch(Math.max(1, +e.target.value || 1))}
              className="flex-1 h-11 text-center text-base font-medium bg-transparent outline-none border-x border-border"
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
          Total cost: ৳{batchCost.toFixed(2)} · {batch} unit
        </div>
      </Card>

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
    </div>
  );
}

function RecipeTab(props: {
  productId: string;
  onChangeProduct: (id: string) => void;
  products: Product[];
  recipeMap: Record<string, Ingredient[]>;
  rawMaterials: RawMaterial[];
  items: Ingredient[];
  setItems: React.Dispatch<React.SetStateAction<Ingredient[]>>;
  saving: boolean;
  onSave: () => void;
  onDelete: () => void;
  hasRecipe: boolean;
}) {
  return (
    <Card className="p-5 space-y-4">
      <RecipeEditorBody
        productId={props.productId}
        onChangeProduct={props.onChangeProduct}
        products={props.products}
        recipeMap={props.recipeMap}
        rawMaterials={props.rawMaterials}
        items={props.items}
        setItems={props.setItems}
      />
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
  items,
  setItems,
}: {
  productId: string;
  onChangeProduct: (id: string) => void;
  products: Product[];
  recipeMap: Record<string, Ingredient[]>;
  rawMaterials: RawMaterial[];
  items: Ingredient[];
  setItems: React.Dispatch<React.SetStateAction<Ingredient[]>>;
}) {
  return (
    <>
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Product
        </label>
        <select
          value={productId}
          onChange={(e) => onChangeProduct(e.target.value)}
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
            onClick={() => setItems((it) => [...it, { materialId: "", qty: 1 }])}
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
            {items.map((it, idx) => {
              const raw = rawMaterials.find((r) => r.id === it.materialId);
              return (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={it.materialId}
                    onChange={(e) =>
                      setItems((arr) =>
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
                      setItems((arr) =>
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
                      setItems((arr) => arr.filter((_, i) => i !== idx))
                    }
                    className="size-9 grid place-items-center rounded-md hover:bg-destructive/10 text-destructive"
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

function HistoryTab({
  productName,
  rows,
  loading,
}: {
  productName: string;
  rows: BatchRow[];
  loading: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="p-5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <History className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Recent batches — {productName}</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Last 20 production entries</p>
      </div>
      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          এখনো কোনো batch হয়নি
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-mono text-xs text-muted-foreground">
                  #{r.id.slice(0, 8).toUpperCase()} · {r.created_at.slice(0, 10)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone="success">+{Number(r.qty)}</Badge>
                <Link
                  to="/production/labels/$ledgerId"
                  params={{ ledgerId: r.id }}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Tag className="size-3" /> Labels
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
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
