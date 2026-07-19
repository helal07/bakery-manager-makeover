import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { useEffect, useState } from "react";
import { loadProducts, type Product } from "@/lib/product-store";
import { loadRawMaterials, type RawMaterial } from "@/lib/raw-material-store";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { toast } from "sonner";
import { pageTitle } from "@/lib/company-settings";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: pageTitle("Inventory") }] }),
  component: Inventory,
});

function Inventory() {
  const { currentShowroomId } = useShowroomScope();
  const [tab, setTab] = useState<"raw" | "finished">("raw");
  const [products, setProducts] = useState<Product[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [ps, rms] = await Promise.all([
          loadProducts(currentShowroomId ?? null),
          loadRawMaterials(currentShowroomId ?? null),
        ]);
        if (cancelled) return;
        setProducts(ps);
        setRawMaterials(rms);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Failed to load inventory");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentShowroomId]);

  return (
    <AppShell title="Inventory" subtitle="Raw materials and finished goods · FIFO/FEFO tracking">
      <div className="flex gap-1 p-1 bg-muted/50 rounded-md w-fit mb-5">
        {(["raw", "finished"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded text-sm ${tab === t ? "bg-card shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t === "raw" ? "Raw Materials" : "Finished Goods"}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-5 py-3">{tab === "raw" ? "Material" : "Product"}</th>
              {tab === "finished" && <th className="text-left font-medium px-5 py-3">SKU</th>}
              <th className="text-right font-medium px-5 py-3">Stock</th>
              <th className="text-right font-medium px-5 py-3">Threshold</th>
              {tab === "raw" ? (
                <>
                  <th className="text-right font-medium px-5 py-3">Unit Cost</th>
                  <th className="text-left font-medium px-5 py-3">Expiry</th>
                </>
              ) : (
                <th className="text-right font-medium px-5 py-3">Price</th>
              )}
              <th className="text-right font-medium px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr><td colSpan={tab === "raw" ? 6 : 6} className="px-5 py-10 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && (tab === "raw" ? rawMaterials.length === 0 : products.length === 0) && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">Nothing here yet.</td></tr>
            )}
            {tab === "raw"
              ? rawMaterials.map((r) => {
                  const low = r.stock < r.threshold;
                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3 font-medium">{r.name}</td>
                      <td className="px-5 py-3 text-right">{r.stock} {r.unit}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{r.threshold} {r.unit}</td>
                      <td className="px-5 py-3 text-right">৳{r.cost.toFixed(2)}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">—</td>
                      <td className="px-5 py-3 text-right">
                        {low ? <Badge tone="danger">Low</Badge> : <Badge tone="success">OK</Badge>}
                      </td>
                    </tr>
                  );
                })
              : products.map((p) => {
                  const low = p.stock < p.threshold;
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3 font-medium">{p.name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{p.sku}</td>
                      <td className="px-5 py-3 text-right">{p.stock}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{p.threshold}</td>
                      <td className="px-5 py-3 text-right">৳{p.price.toFixed(2)}</td>
                      <td className="px-5 py-3 text-right">
                        {low ? <Badge tone="danger">Low</Badge> : <Badge tone="success">OK</Badge>}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}