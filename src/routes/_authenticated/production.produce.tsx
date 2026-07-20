import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { Factory, ChefHat, Play, AlertTriangle, CircleDollarSign, Package, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadRecipes, commitProduction, type Ingredient } from "@/lib/recipe-store";
import { loadProducts, type Product } from "@/lib/product-store";
import { loadRawMaterials, type RawMaterial } from "@/lib/raw-material-store";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { toast } from "sonner";
import { PermissionGate } from "@/components/permission-gate";
import { pageTitle } from "@/lib/company-settings";

type Search = { product?: string };

export const Route = createFileRoute("/_authenticated/production/produce")({
  head: () => ({ meta: [{ title: pageTitle("Produce") }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    product: typeof s.product === "string" ? s.product : undefined,
  }),
  component: () => (
    <PermissionGate anyOf={["production.batches", "production.access"]} title="Produce">
      <ProducePage />
    </PermissionGate>
  ),
});

function ProducePage() {
  const { currentShowroomId } = useShowroomScope();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [products, setProducts] = useState<Product[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [recipeMap, setRecipeMap] = useState<Record<string, Ingredient[]>>({});
  const [productId, setProductId] = useState<string>("");
  const [batch, setBatch] = useState(1);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const productsWithRecipe = useMemo(
    () => products.filter((p) => (recipeMap[p.id]?.length ?? 0) > 0),
    [products, recipeMap],
  );

  // Prefill from ?product= or first available
  useEffect(() => {
    if (!productId && productsWithRecipe.length > 0) {
      const wanted = search.product && productsWithRecipe.find((p) => p.id === search.product);
      setProductId(wanted?.id ?? productsWithRecipe[0].id);
    }
  }, [productsWithRecipe, search.product, productId]);

  const stock = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rawMaterials) m[r.id] = r.stock;
    return m;
  }, [rawMaterials]);

  const active = productsWithRecipe.find((p) => p.id === productId);
  const items = active ? recipeMap[active.id] ?? [] : [];

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
  const canProduce = !!active && rows.length > 0 && shortRows.length === 0 && !busy;

  const produce = async () => {
    if (!active || !canProduce) return;
    setBusy(true);
    try {
      await commitProduction({
        productId: active.id,
        showroomId: currentShowroomId ?? null,
        batch,
        ingredients: items,
      });
      toast.success(`✓ Produced ${batch} × ${active.name}`);
      setConfirmOpen(false);
      setBatch(1);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to produce");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell
      title="Produce"
      subtitle="এক ক্লিকে batch produce — raw material auto-deduct হবে"
      actions={
        <Link
          to="/production"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Production
        </Link>
      }
    >
      {loading ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : productsWithRecipe.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="mx-auto size-12 rounded-full bg-primary/10 grid place-items-center mb-4">
            <ChefHat className="size-6 text-primary" />
          </div>
          <h3 className="text-base font-semibold mb-1">কোনো recipe define করা নেই</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Produce করার আগে অন্তত একটা product-এর জন্য recipe (BOM) define করুন।
          </p>
          <Link
            to="/recipes"
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            <ChefHat className="size-4" /> Set up recipes
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
          <Card className="p-5 space-y-4 h-fit">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Product
              </label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="mt-1.5 w-full h-11 px-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
              >
                {productsWithRecipe.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                শুধু recipe-সহ product দেখানো হচ্ছে ·{" "}
                <Link to="/recipes" className="text-primary hover:underline">
                  নতুন recipe
                </Link>
              </p>
            </div>

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
              <Stat icon={<Package className="size-3.5" />} label="Ingredients" value={String(rows.length)} />
              <Stat
                icon={<CircleDollarSign className="size-3.5" />}
                label="Unit cost"
                value={`৳${unitCost.toFixed(2)}`}
              />
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
              onClick={() => setConfirmOpen(true)}
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
                {active ? `${batch} × ${active.name} বানাতে যা লাগবে` : "Product select করুন"}
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
      )}

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
                  <b>{batch}</b> × <b>{active.name}</b> produce করা হবে। {rows.length}টি raw material
                  auto-deduct হবে (মোট খরচ ৳{batchCost.toFixed(2)})।
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
    </AppShell>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
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
