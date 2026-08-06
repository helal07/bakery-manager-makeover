import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { Wheat, Receipt } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { loadOverheadsInRange, type BatchOverheadRow } from "@/lib/production-overhead-store";
import { toast } from "sonner";
import { PermissionGate } from "@/components/permission-gate";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/production/consumption-report")({
  head: () => ({ meta: [{ title: "Raw Material Consumption · Muzahid Food" }] }),
  component: () => (
    <PermissionGate anyOf={["production.reports.consumption", "production.reports.view"]} title={"Consumption Report"}>
      <ConsumptionReportPage />
    </PermissionGate>
  ),

});

type Row = { material_id: string; material_name: string; unit: string; consumed: number; wasted: number };

const money = (n: number) => `৳${(Number(n) || 0).toFixed(2)}`;

function ConsumptionReportPage() {
  const { currentShowroomId } = useShowroomScope();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<Row[]>([]);
  const [overheads, setOverheads] = useState<BatchOverheadRow[]>([]);

  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      let q = sb
        .from("raw_stock_ledger")
        .select("material_id,qty,kind,raw_materials(name,unit)")
        .in("kind", ["production_consume", "wastage"])
        .gte("created_at", `${from}T00:00:00Z`)
        .lte("created_at", `${to}T23:59:59Z`);
      if (currentShowroomId) q = q.eq("showroom_id", currentShowroomId);
      const { data, error } = await q;
      if (error) throw error;

      const map: Record<string, Row> = {};
      for (const r of (data ?? []) as any[]) {
        const id = r.material_id as string;
        if (!map[id]) {
          map[id] = {
            material_id: id,
            material_name: r.raw_materials?.name ?? "—",
            unit: r.raw_materials?.unit ?? "",
            consumed: 0,
            wasted: 0,
          };
        }
        const abs = Math.abs(Number(r.qty));
        if (r.kind === "production_consume") map[id].consumed += abs;
        else if (r.kind === "wastage") map[id].wasted += abs;
      }
      setRows(Object.values(map).sort((a, b) => (b.consumed + b.wasted) - (a.consumed + a.wasted)));

      const oh = await loadOverheadsInRange(`${from}T00:00:00Z`, `${to}T23:59:59Z`);
      setOverheads(oh);
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

  const totals = useMemo(() => ({
    consumed: rows.reduce((s, r) => s + r.consumed, 0),
    wasted: rows.reduce((s, r) => s + r.wasted, 0),
  }), [rows]);

  const overheadSummary = useMemo(() => {
    const map: Record<string, { name: string; batches: Set<string>; amount: number }> = {};
    for (const o of overheads) {
      const key = o.category_id || o.category_name;
      map[key] ??= { name: o.category_name, batches: new Set(), amount: 0 };
      map[key].batches.add(o.batch_id);
      map[key].amount += o.amount;
    }
    const list = Object.values(map)
      .map((v) => ({ name: v.name, batches: v.batches.size, amount: v.amount }))
      .sort((a, b) => b.amount - a.amount);
    return { list, total: list.reduce((s, r) => s + r.amount, 0) };
  }, [overheads]);


  return (
    <AppShell title="Raw Material Consumption" subtitle="Production usage and wastage over the selected period">
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div><label className="text-xs text-muted-foreground">From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block h-9 px-2 rounded-md border border-border bg-background text-sm" /></div>
        <div><label className="text-xs text-muted-foreground">To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block h-9 px-2 rounded-md border border-border bg-background text-sm" /></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Materials</div><div className="text-2xl font-semibold mt-1">{rows.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total consumed</div><div className="text-2xl font-semibold mt-1 text-primary">{totals.consumed.toFixed(3)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total wasted</div><div className="text-2xl font-semibold mt-1 text-destructive">{totals.wasted.toFixed(3)}</div></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-5 py-3">Material</th>
              <th className="text-left font-medium px-5 py-3">Unit</th>
              <th className="text-right font-medium px-5 py-3">Consumed</th>
              <th className="text-right font-medium px-5 py-3">Wasted</th>
              <th className="text-right font-medium px-5 py-3">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.material_id} className="hover:bg-muted/30">
                <td className="px-5 py-3 font-medium inline-flex items-center gap-2"><Wheat className="size-3.5 text-muted-foreground" />{r.material_name}</td>
                <td className="px-5 py-3 text-muted-foreground">{r.unit}</td>
                <td className="px-5 py-3 text-right">{r.consumed.toFixed(3)}</td>
                <td className="px-5 py-3 text-right text-destructive">{r.wasted.toFixed(3)}</td>
                <td className="px-5 py-3 text-right font-medium">{(r.consumed + r.wasted).toFixed(3)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">{loading ? "Loading…" : "No consumption or wastage in this range."}</td></tr>
            )}
          </tbody>
        </table></div>
      </Card>

      <Card className="overflow-hidden mt-5">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <Receipt className="size-4 text-muted-foreground" />
          <div className="font-semibold text-sm">Overheads in this period</div>
          <div className="ml-auto text-sm font-semibold">{money(overheadSummary.total)}</div>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[480px]">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-5 py-3">Overhead category</th>
              <th className="text-right font-medium px-5 py-3">Batches</th>
              <th className="text-right font-medium px-5 py-3">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {overheadSummary.list.map((o) => (
              <tr key={o.name} className="hover:bg-muted/30">
                <td className="px-5 py-3 font-medium">{o.name}</td>
                <td className="px-5 py-3 text-right text-muted-foreground">{o.batches}</td>
                <td className="px-5 py-3 text-right">{money(o.amount)}</td>
              </tr>
            ))}
            {overheadSummary.list.length === 0 && (
              <tr><td colSpan={3} className="text-center py-8 text-sm text-muted-foreground">{loading ? "Loading…" : "No overheads recorded in this range."}</td></tr>
            )}
          </tbody>
          {overheadSummary.list.length > 0 && (
            <tfoot>
              <tr className="font-semibold bg-muted/30">
                <td className="px-5 py-3">Total</td>
                <td className="px-5 py-3" />
                <td className="px-5 py-3 text-right">{money(overheadSummary.total)}</td>
              </tr>
            </tfoot>
          )}
        </table></div>
      </Card>
    </AppShell>

  );
}
