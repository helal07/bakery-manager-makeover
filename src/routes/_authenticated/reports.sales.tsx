import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { ReportFilters, exportCsv, type ReportFilter } from "@/components/report-filters";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";

export const Route = createFileRoute("/_authenticated/reports/sales")({
  head: () => ({ meta: [{ title: "Sales Reports · Muzahid Food" }] }),
  component: SalesReport,
});

const sb = supabase as any;

type Status = "Paid" | "Due" | "Partial";
type Row = { id: string; date: string; customer: string; items: number; total: number; paid: number; due: number; status: Status; mode: string };

const tone: Record<Status, "success" | "danger" | "warning"> = { Paid: "success", Due: "danger", Partial: "warning" };

function isoDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
}
const initial = (): ReportFilter => ({ from: isoDaysAgo(30), to: isoDaysAgo(0), category: "All" });

function SalesReport() {
  const { currentShowroomId } = useShowroomScope();
  const loc = currentShowroomId;
  const [filter, setFilter] = useState<ReportFilter>(initial);
  const [status, setStatus] = useState<"All" | Status>("All");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const from = filter.from ? new Date(filter.from + "T00:00:00").toISOString() : new Date(0).toISOString();
      const to = filter.to ? new Date(filter.to + "T23:59:59").toISOString() : new Date().toISOString();
      const q = loc === null
        ? sb.from("sales").select("id,external_ref,customer_name,total,paid,due,payment_mode,created_at,sale_items(id)").is("showroom_id", null)
        : sb.from("sales").select("id,external_ref,customer_name,total,paid,due,payment_mode,created_at,sale_items(id)").eq("showroom_id", loc);
      const { data } = await q.gte("created_at", from).lte("created_at", to).order("created_at", { ascending: false }).limit(500);
      if (cancelled) return;
      const mapped: Row[] = ((data ?? []) as any[]).map((s) => {
        const total = Number(s.total ?? 0), paid = Number(s.paid ?? 0), due = Number(s.due ?? 0);
        const st: Status = due <= 0 ? "Paid" : paid > 0 ? "Partial" : "Due";
        return {
          id: s.external_ref ?? s.id.slice(0, 8),
          date: new Date(s.created_at).toISOString().slice(0, 10),
          customer: s.customer_name ?? "Walk-in",
          items: (s.sale_items ?? []).length,
          total, paid, due, status: st, mode: s.payment_mode,
        };
      });
      setRows(mapped);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loc, filter.from, filter.to]);

  const filtered = useMemo(() => rows.filter((r) => status === "All" || r.status === status), [rows, status]);
  const totals = filtered.reduce(
    (a, r) => ({ total: a.total + r.total, paid: a.paid + r.paid, due: a.due + r.due }),
    { total: 0, paid: 0, due: 0 },
  );

  return (
    <AppShell title="Sales Reports" subtitle="Filter sales by date, branch and status">
      <ReportFilters
        filter={filter}
        onChange={setFilter}
        onReset={() => { setFilter(initial()); setStatus("All"); }}
        categoryOptions={[]}
        categoryLabel="—"
        onExport={() =>
          exportCsv("sales-report.csv", [
            ["Ref", "Date", "Customer", "Payment", "Items", "Total", "Paid", "Due", "Status"],
            ...filtered.map((r) => [r.id, r.date, r.customer, r.mode, r.items, r.total, r.paid, r.due, r.status]),
          ])
        }
        extra={
          <div className="space-y-1.5">
            <div className="text-sm font-medium">Status</div>
            <div className="flex rounded-md border border-border p-0.5">
              {(["All", "Paid", "Partial", "Due"] as const).map((s) => (
                <button key={s} onClick={() => setStatus(s)} className={`px-3 h-8 text-xs rounded ${status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="Transactions" value={filtered.length.toString()} />
        <Kpi label="Gross sales" value={`৳${totals.total.toLocaleString()}`} />
        <Kpi label="Collected" value={`৳${totals.paid.toLocaleString()}`} />
        <Kpi label="Outstanding" value={`৳${totals.due.toLocaleString()}`} tone={totals.due ? "warn" : "default"} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
          <thead className="text-xs text-muted-foreground bg-muted/50">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Ref</th>
              <th className="text-left font-medium px-4 py-2.5">Date</th>
              <th className="text-left font-medium px-4 py-2.5">Customer</th>
              <th className="text-left font-medium px-4 py-2.5">Payment</th>
              <th className="text-right font-medium px-4 py-2.5">Items</th>
              <th className="text-right font-medium px-4 py-2.5">Total</th>
              <th className="text-right font-medium px-4 py-2.5">Paid</th>
              <th className="text-right font-medium px-4 py-2.5">Due</th>
              <th className="text-left font-medium px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No sales match your filters.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-4 py-2.5 font-mono text-xs">{r.id}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.date}</td>
                <td className="px-4 py-2.5 font-medium">{r.customer}</td>
                <td className="px-4 py-2.5 text-muted-foreground capitalize">{r.mode}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.items}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">৳{r.total.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">৳{r.paid.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">৳{r.due.toLocaleString()}</td>
                <td className="px-4 py-2.5"><Badge tone={tone[r.status]}>{r.status}</Badge></td>
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