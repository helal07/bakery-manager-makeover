import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { ReportFilters, exportCsv, type ReportFilter } from "@/components/report-filters";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { loadRawMaterials } from "@/lib/raw-material-store";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/reports/stock")({
  head: () => ({ meta: [{ title: "Stock Reports · Muzahid Food" }] }),
  component: () => (
    <PermissionGate anyOf={["reports.stock"]} title={"Stock Reports"}>
      <StockReport />
    </PermissionGate>
  ),

});

const sb = supabase as any;

type StockRow = { code: string; name: string; category: string; qty: number; threshold: number; price: number; value: number };

const initial = (): ReportFilter => ({ from: "", to: "", category: "All" });

function StockReport() {
  const { currentShowroomId } = useShowroomScope();
  const loc = currentShowroomId;
  const [filter, setFilter] = useState<ReportFilter>(initial);
  const [scope, setScope] = useState<"Products" | "Raw Materials">("Products");
  const [dbRows, setDbRows] = useState<StockRow[]>([]);
  const [rawRows, setRawRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (scope === "Products") {
        const [{ data: products }, stockRes] = await Promise.all([
          sb.from("products").select("id,name,sku,category,unit,price").eq("is_active", true).order("name"),
          loc === null
            ? sb.from("product_stock").select("product_id,quantity,min_stock").is("showroom_id", null)
            : sb.from("product_stock").select("product_id,quantity,min_stock").eq("showroom_id", loc),
        ]);
        if (cancelled) return;
        const map = new Map<string, { quantity: number; min_stock: number }>();
        for (const s of (stockRes.data ?? []) as any[]) {
          map.set(s.product_id, { quantity: Number(s.quantity ?? 0), min_stock: Number(s.min_stock ?? 0) });
        }
        const rows: StockRow[] = ((products ?? []) as any[]).map((p) => {
          const s = map.get(p.id) ?? { quantity: 0, min_stock: 0 };
          const price = Number(p.price ?? 0);
          return {
            code: p.sku ?? "—",
            name: p.name,
            category: p.category ?? "—",
            qty: s.quantity,
            threshold: s.min_stock,
            price,
            value: s.quantity * price,
          };
        });
        setDbRows(rows);
      } else {
        try {
          const mats = await loadRawMaterials(loc ?? null);
          if (cancelled) return;
          setRawRows(
            mats.map((r) => ({
              code: (r.id.slice(0, 8) || "—").toUpperCase(),
              name: r.name,
              category: r.unit,
              qty: r.stock,
              threshold: r.threshold,
              price: r.cost,
              value: r.stock * r.cost,
            })),
          );
        } catch { /* toast handled elsewhere */ }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [scope, loc]);

  const rows = useMemo(() => {
    if (scope === "Products") {
      return dbRows.filter((r) => filter.category === "All" || r.category === filter.category);
    }
    return rawRows;
  }, [scope, dbRows, rawRows, filter]);

  const totals = rows.reduce(
    (acc, r) => {
      acc.qty += r.qty;
      acc.value += r.value;
      if (r.qty <= r.threshold) acc.low += 1;
      return acc;
    },
    { qty: 0, value: 0, low: 0 },
  );

  const categories = scope === "Products" ? Array.from(new Set(dbRows.map((r) => r.category))) : [];

  return (
    <AppShell title="Stock Reports" subtitle="Product and raw material stock overview">
      <ReportFilters
        filter={filter}
        onChange={setFilter}
        onReset={() => setFilter(initial())}
        categoryOptions={categories}
        categoryLabel={scope === "Products" ? "Category" : "Unit"}
        onExport={() =>
          exportCsv(
            `stock-${scope.toLowerCase()}.csv`,
            [["Code", "Name", "Category", "Qty", "Threshold", "Price", "Value"], ...rows.map((r) => [r.code, r.name, r.category, r.qty, r.threshold, r.price, r.value.toFixed(2)])],
          )
        }
        extra={
          <div className="space-y-1.5">
            <div className="text-sm font-medium">Scope</div>
            <div className="flex rounded-md border border-border p-0.5">
              {(["Products", "Raw Materials"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => { setScope(s); setFilter({ ...filter, category: "All" }); }}
                  className={`px-3 h-8 text-xs rounded ${scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="Line items" value={rows.length.toString()} />
        <Kpi label="Total units" value={totals.qty.toLocaleString()} />
        <Kpi label="Stock value" value={`৳${totals.value.toFixed(0)}`} />
        <Kpi label="Low stock" value={totals.low.toString()} tone={totals.low ? "warn" : "default"} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
          <thead className="text-xs text-muted-foreground bg-muted/50">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Code</th>
              <th className="text-left font-medium px-4 py-2.5">Name</th>
              <th className="text-left font-medium px-4 py-2.5">{scope === "Products" ? "Category" : "Unit"}</th>
              <th className="text-right font-medium px-4 py-2.5">Qty</th>
              <th className="text-right font-medium px-4 py-2.5">Threshold</th>
              <th className="text-right font-medium px-4 py-2.5">Price</th>
              <th className="text-right font-medium px-4 py-2.5">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && scope === "Products" && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No stock rows.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.code} className="hover:bg-muted/30">
                <td className="px-4 py-2.5 font-mono text-xs">{r.code}</td>
                <td className="px-4 py-2.5 font-medium">{r.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.category}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${r.qty <= r.threshold ? "text-destructive font-semibold" : ""}`}>{r.qty}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{r.threshold}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">৳{r.price.toFixed(2)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">৳{r.value.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
    </AppShell>
  );
}

function Kpi({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 tabular-nums ${tone === "warn" ? "text-destructive" : ""}`}>{value}</div>
    </Card>
  );
}