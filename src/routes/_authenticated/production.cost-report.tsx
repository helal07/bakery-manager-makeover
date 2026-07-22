import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { BarChart3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { loadRecipes } from "@/lib/recipe-store";
import { loadRawMaterials } from "@/lib/raw-material-store";
import { toast } from "sonner";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/production/cost-report")({
  head: () => ({ meta: [{ title: "Production Cost Report · Muzahid Food" }] }),
  component: CostReportPage,
});

type BatchRow = { id: string; product_id: string; product_name: string; qty: number; date: string; cost: number; unitCost: number };

function CostReportPage() {
  const { currentShowroomId } = useShowroomScope();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      let q = sb
        .from("stock_ledger")
        .select("id,product_id,qty,created_at,products(name)")
        .eq("kind", "production")
        .gte("created_at", `${from}T00:00:00Z`)
        .lte("created_at", `${to}T23:59:59Z`)
        .order("created_at", { ascending: false });
      if (currentShowroomId) q = q.eq("showroom_id", currentShowroomId);
      const { data: batches, error } = await q;
      if (error) throw error;

      const [recipes, materials] = await Promise.all([loadRecipes(), loadRawMaterials(currentShowroomId ?? null)]);
      const costMap: Record<string, number> = {};
      for (const m of materials) costMap[m.id] = m.cost;

      const out: BatchRow[] = ((batches ?? []) as any[]).map((b) => {
        const qty = Number(b.qty);
        const ing = recipes[b.product_id] ?? [];
        const unitCost = ing.reduce((s, it) => s + (costMap[it.materialId] ?? 0) * it.qty, 0);
        const cost = unitCost * qty;
        return {
          id: b.id,
          product_id: b.product_id,
          product_name: b.products?.name ?? "—",
          qty,
          date: b.created_at.slice(0, 10),
          cost,
          unitCost,
        };
      });
      setRows(out);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShowroomId, from, to]);

  const totals = useMemo(() => {
    const totalQty = rows.reduce((s, r) => s + r.qty, 0);
    const totalCost = rows.reduce((s, r) => s + r.cost, 0);
    return { totalQty, totalCost, avgUnit: totalQty > 0 ? totalCost / totalQty : 0 };
  }, [rows]);

  return (
    <AppShell title="Production Cost Report" subtitle="Batch cost and unit-cost trend based on recipes">
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div><label className="text-xs text-muted-foreground">From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block h-9 px-2 rounded-md border border-border bg-background text-sm" /></div>
        <div><label className="text-xs text-muted-foreground">To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block h-9 px-2 rounded-md border border-border bg-background text-sm" /></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Batches</div><div className="text-2xl font-semibold mt-1">{rows.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Units produced</div><div className="text-2xl font-semibold mt-1">{totals.totalQty}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total cost · avg unit</div><div className="text-2xl font-semibold mt-1 text-primary">৳{totals.totalCost.toFixed(2)} <span className="text-sm text-muted-foreground">· ৳{totals.avgUnit.toFixed(2)}</span></div></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-5 py-3">Date</th>
              <th className="text-left font-medium px-5 py-3">Product</th>
              <th className="text-right font-medium px-5 py-3">Qty</th>
              <th className="text-right font-medium px-5 py-3">Unit cost</th>
              <th className="text-right font-medium px-5 py-3">Total cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-5 py-3 text-muted-foreground">{r.date}</td>
                <td className="px-5 py-3 font-medium">{r.product_name}</td>
                <td className="px-5 py-3 text-right">{r.qty}</td>
                <td className="px-5 py-3 text-right">৳{r.unitCost.toFixed(2)}</td>
                <td className="px-5 py-3 text-right font-medium">৳{r.cost.toFixed(2)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">{loading ? "Loading…" : <><BarChart3 className="inline size-4 mr-1" />No batches in this range.</>}</td></tr>
            )}
          </tbody>
        </table></div>
      </Card>
    </AppShell>
  );
}
