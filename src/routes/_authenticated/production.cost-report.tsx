import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { BarChart3, ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { loadRecipes } from "@/lib/recipe-store";
import { loadRawMaterials } from "@/lib/raw-material-store";
import { loadOverheadsForBatches, type BatchOverheadRow } from "@/lib/production-overhead-store";
import { toast } from "sonner";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/production/cost-report")({
  head: () => ({ meta: [{ title: "Production Cost Report · Muzahid Food" }] }),
  component: CostReportPage,
});

type BatchRow = {
  id: string;
  batchId: string | null;
  product_id: string;
  product_name: string;
  qty: number;
  date: string;
  materialCost: number;
  overheadCost: number;
  cost: number;
  unitCost: number;
  overheads: BatchOverheadRow[];
};

const money = (n: number) => `৳${(Number(n) || 0).toFixed(2)}`;

function CostReportPage() {
  const { currentShowroomId } = useShowroomScope();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      let q = sb
        .from("stock_ledger")
        .select("id,ref_id,product_id,qty,created_at,products(name)")
        .eq("kind", "production")
        .gte("created_at", `${from}T00:00:00Z`)
        .lte("created_at", `${to}T23:59:59Z`)
        .order("created_at", { ascending: false });
      if (currentShowroomId) q = q.eq("showroom_id", currentShowroomId);
      const { data: batches, error } = await q;
      if (error) throw error;

      const batchIds = ((batches ?? []) as any[]).map((b) => b.ref_id).filter(Boolean) as string[];
      const [recipes, materials, overheads] = await Promise.all([
        loadRecipes(),
        loadRawMaterials(currentShowroomId ?? null),
        loadOverheadsForBatches(Array.from(new Set(batchIds))),
      ]);
      const costMap: Record<string, number> = {};
      for (const m of materials) costMap[m.id] = m.cost;

      const ohByBatch: Record<string, BatchOverheadRow[]> = {};
      for (const o of overheads) {
        (ohByBatch[o.batch_id] ??= []).push(o);
      }

      const out: BatchRow[] = ((batches ?? []) as any[]).map((b) => {
        const qty = Number(b.qty);
        const ing = recipes[b.product_id] ?? [];
        const unitMaterial = ing.reduce((s, it) => s + (costMap[it.materialId] ?? 0) * it.qty, 0);
        const materialCost = unitMaterial * qty;
        const bOverheads = b.ref_id ? (ohByBatch[b.ref_id] ?? []) : [];
        const overheadCost = bOverheads.reduce((s, o) => s + o.amount, 0);
        const cost = materialCost + overheadCost;
        return {
          id: b.id,
          batchId: b.ref_id ?? null,
          product_id: b.product_id,
          product_name: b.products?.name ?? "—",
          qty,
          date: b.created_at.slice(0, 10),
          materialCost,
          overheadCost,
          cost,
          unitCost: qty > 0 ? cost / qty : 0,
          overheads: bOverheads,
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
    const materialCost = rows.reduce((s, r) => s + r.materialCost, 0);
    const overheadCost = rows.reduce((s, r) => s + r.overheadCost, 0);
    const totalCost = materialCost + overheadCost;
    return { totalQty, materialCost, overheadCost, totalCost, avgUnit: totalQty > 0 ? totalCost / totalQty : 0 };
  }, [rows]);

  return (
    <AppShell title="Production Cost Report" subtitle="Batch material cost, overheads and true unit cost">
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div><label className="text-xs text-muted-foreground">From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block h-9 px-2 rounded-md border border-border bg-background text-sm" /></div>
        <div><label className="text-xs text-muted-foreground">To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block h-9 px-2 rounded-md border border-border bg-background text-sm" /></div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Batches</div><div className="text-xl font-semibold mt-1">{rows.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Units produced</div><div className="text-xl font-semibold mt-1">{totals.totalQty}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Material cost</div><div className="text-xl font-semibold mt-1">{money(totals.materialCost)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Overhead cost</div><div className="text-xl font-semibold mt-1 text-amber-600">{money(totals.overheadCost)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total cost · avg unit</div><div className="text-xl font-semibold mt-1 text-primary">{money(totals.totalCost)} <span className="text-sm text-muted-foreground">· {money(totals.avgUnit)}</span></div></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[820px]">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-5 py-3">Date</th>
              <th className="text-left font-medium px-5 py-3">Product</th>
              <th className="text-right font-medium px-5 py-3">Qty</th>
              <th className="text-right font-medium px-5 py-3">Material cost</th>
              <th className="text-right font-medium px-5 py-3">Overhead cost</th>
              <th className="text-right font-medium px-5 py-3">Total cost</th>
              <th className="text-right font-medium px-5 py-3">Unit cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const expanded = !!open[r.id];
              const canExpand = r.overheads.length > 0;
              return (
                <Fragment key={r.id}>
                  <tr
                    className={`hover:bg-muted/30 ${canExpand ? "cursor-pointer" : ""}`}
                    onClick={() => canExpand && setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}
                  >
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {canExpand ? (expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />) : <span className="inline-block size-3.5" />}
                        {r.date}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium">{r.product_name}</td>
                    <td className="px-5 py-3 text-right">{r.qty}</td>
                    <td className="px-5 py-3 text-right">{money(r.materialCost)}</td>
                    <td className="px-5 py-3 text-right text-amber-600">{money(r.overheadCost)}</td>
                    <td className="px-5 py-3 text-right font-medium">{money(r.cost)}</td>
                    <td className="px-5 py-3 text-right">{money(r.unitCost)}</td>
                  </tr>
                  {expanded && (
                    <tr className="bg-muted/20">
                      <td colSpan={7} className="px-5 py-3">
                        <div className="text-xs font-semibold text-muted-foreground mb-2">Overheads for this batch</div>
                        <div className="space-y-1">
                          {r.overheads.map((o) => (
                            <div key={o.id} className="flex items-center justify-between text-xs">
                              <span className="font-medium">{o.category_name}{o.note ? <span className="text-muted-foreground font-normal"> · {o.note}</span> : null}</span>
                              <span className="tabular-nums">{money(o.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">{loading ? "Loading…" : <><BarChart3 className="inline size-4 mr-1" />No batches in this range.</>}</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="font-semibold bg-muted/30">
                <td className="px-5 py-3">Total</td>
                <td className="px-5 py-3" />
                <td className="px-5 py-3 text-right">{totals.totalQty}</td>
                <td className="px-5 py-3 text-right">{money(totals.materialCost)}</td>
                <td className="px-5 py-3 text-right">{money(totals.overheadCost)}</td>
                <td className="px-5 py-3 text-right">{money(totals.totalCost)}</td>
                <td className="px-5 py-3 text-right">{money(totals.avgUnit)}</td>
              </tr>
            </tfoot>
          )}
        </table></div>
      </Card>
    </AppShell>
  );
}
