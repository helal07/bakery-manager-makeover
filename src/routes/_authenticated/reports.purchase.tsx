import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { loadPurchases, loadCategories, type Purchase, type PurchaseCategory } from "@/lib/purchase-store";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { ReportFilters, exportCsv, type ReportFilter } from "@/components/report-filters";
import { pageTitle } from "@/lib/company-settings";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/reports/purchase")({
  head: () => ({ meta: [{ title: pageTitle("Purchase Reports") }] }),
  component: () => (
    <PermissionGate anyOf={["reports.purchase"]} title={"Purchase Reports"}>
      <PurchaseReport />
    </PermissionGate>
  ),

});

const initial = (): ReportFilter => ({ from: "", to: "", category: "All" });

function PurchaseReport() {
  const { currentShowroomId } = useShowroomScope();
  const [filter, setFilter] = useState<ReportFilter>(initial);
  const [supplier, setSupplier] = useState("All");
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  useEffect(() => {
    loadCategories()
      .then((cats: PurchaseCategory[]) => setCategories(cats.map((c) => c.name)))
      .catch(() => setCategories([]));
  }, []);
  useEffect(() => {
    loadPurchases(currentShowroomId).then(setPurchases).catch(() => setPurchases([]));
  }, [currentShowroomId]);

  const filtered = useMemo(() => {
    return purchases.filter((p) => {
      if (filter.from && p.date < filter.from) return false;
      if (filter.to && p.date > filter.to) return false;
      if (filter.category !== "All" && p.category !== filter.category) return false;
      if (supplier !== "All" && p.supplier !== supplier) return false;
      return true;
    });
  }, [purchases, filter, supplier]);

  const totals = filtered.reduce(
    (a, p) => ({ total: a.total + p.total, paid: a.paid + (p.paid ?? 0), due: a.due + (p.total - (p.paid ?? 0)) }),
    { total: 0, paid: 0, due: 0 },
  );
  const suppliers = Array.from(new Set(purchases.map((p) => p.supplier)));

  return (
    <AppShell title="Purchase Reports" subtitle="Supplier purchases with date and category filters">
      <ReportFilters
        filter={filter}
        onChange={setFilter}
        onReset={() => { setFilter(initial()); setSupplier("All"); }}
        categoryOptions={categories}
        onExport={() =>
          exportCsv("purchase-report.csv", [
            ["Ref", "Date", "Supplier", "Category", "Total", "Paid", "Due", "Status"],
            ...filtered.map((p) => [p.id, p.date, p.supplier, p.category ?? "—", p.total, p.paid ?? 0, p.total - (p.paid ?? 0), p.status]),
          ])
        }
        extra={
          <div className="space-y-1.5">
            <label className="text-sm font-medium block">Supplier</label>
            <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="h-9 px-2.5 rounded-md border border-input bg-background text-sm outline-none focus:border-primary min-w-40">
              <option value="All">All</option>
              {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="Purchases" value={filtered.length.toString()} />
        <Kpi label="Total spend" value={`৳${totals.total.toLocaleString()}`} />
        <Kpi label="Paid" value={`৳${totals.paid.toLocaleString()}`} />
        <Kpi label="Due" value={`৳${totals.due.toLocaleString()}`} tone={totals.due ? "warn" : "default"} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
          <thead className="text-xs text-muted-foreground bg-muted/50">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Ref</th>
              <th className="text-left font-medium px-4 py-2.5">Date</th>
              <th className="text-left font-medium px-4 py-2.5">Supplier</th>
              <th className="text-left font-medium px-4 py-2.5">Category</th>
              <th className="text-right font-medium px-4 py-2.5">Total</th>
              <th className="text-right font-medium px-4 py-2.5">Paid</th>
              <th className="text-right font-medium px-4 py-2.5">Due</th>
              <th className="text-left font-medium px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No purchases match your filters.</td></tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <td className="px-4 py-2.5 font-mono text-xs">{p.id}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.date}</td>
                <td className="px-4 py-2.5 font-medium">{p.supplier}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.category ?? "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">৳{p.total.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">৳{(p.paid ?? 0).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">৳{(p.total - (p.paid ?? 0)).toLocaleString()}</td>
                <td className="px-4 py-2.5"><Badge tone="primary">{p.status}</Badge></td>
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