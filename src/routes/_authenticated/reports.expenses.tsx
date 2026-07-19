import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { loadExpenses, EXPENSE_CATEGORIES, type Expense } from "@/lib/expense-store";
import { ReportFilters, exportCsv, type ReportFilter } from "@/components/report-filters";
import { pageTitle } from "@/lib/company-settings";

export const Route = createFileRoute("/_authenticated/reports/expenses")({
  head: () => ({ meta: [{ title: pageTitle("Expense Reports") }] }),
  component: ExpenseReport,
});

const initial = (): ReportFilter => ({ from: "", to: "", category: "All" });

function ExpenseReport() {
  const [filter, setFilter] = useState<ReportFilter>(initial);
  const [items, setItems] = useState<Expense[]>([]);
  useEffect(() => {
    loadExpenses().then(setItems).catch(() => setItems([]));
  }, []);

  const filtered = useMemo(() => {
    return items.filter((e) => {
      if (filter.from && e.date < filter.from) return false;
      if (filter.to && e.date > filter.to) return false;
      if (filter.category !== "All" && e.category !== filter.category) return false;
      return true;
    });
  }, [items, filter]);

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const byCat = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of filtered) m[e.category] = (m[e.category] || 0) + e.amount;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  return (
    <AppShell title="Expense Reports" subtitle="Category-wise expense analysis">
      <ReportFilters
        filter={filter}
        onChange={setFilter}
        onReset={() => setFilter(initial())}
        categoryOptions={[...EXPENSE_CATEGORIES]}
        onExport={() =>
          exportCsv("expense-report.csv", [
            ["Date", "Category", "Description", "Amount"],
            ...filtered.map((e) => [e.date, e.category, e.desc, e.amount]),
          ])
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <Kpi label="Entries" value={filtered.length.toString()} />
        <Kpi label="Total expense" value={`৳${total.toLocaleString()}`} />
        <Kpi label="Top category" value={byCat[0] ? `${byCat[0][0]} · ৳${byCat[0][1].toLocaleString()}` : "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="p-5 lg:col-span-1">
          <div className="font-medium mb-3">By category</div>
          <div className="space-y-2">
            {byCat.length === 0 && <div className="text-sm text-muted-foreground">No data.</div>}
            {byCat.map(([c, v]) => {
              const pct = total ? Math.round((v / total) * 100) : 0;
              return (
                <div key={c}>
                  <div className="flex justify-between text-sm">
                    <span>{c}</span>
                    <span className="tabular-nums text-muted-foreground">৳{v.toLocaleString()} · {pct}%</span>
                  </div>
                  <div className="h-1.5 rounded bg-muted mt-1 overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="lg:col-span-2 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/50">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Date</th>
                <th className="text-left font-medium px-4 py-2.5">Category</th>
                <th className="text-left font-medium px-4 py-2.5">Description</th>
                <th className="text-right font-medium px-4 py-2.5">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No expenses match your filters.</td></tr>
              )}
              {filtered.map((e) => (
                <tr key={e.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{e.date}</td>
                  <td className="px-4 py-2.5"><Badge tone="primary">{e.category}</Badge></td>
                  <td className="px-4 py-2.5 font-medium">{e.desc}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">৳{e.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-muted/30">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-right text-muted-foreground font-medium">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">৳{total.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </Card>
      </div>
    </AppShell>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
    </Card>
  );
}