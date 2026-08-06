import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDown, RotateCcw } from "lucide-react";
import {
  loadExpenses, loadExpenseCategories, type Expense, type ExpenseCategory,
} from "@/lib/expense-store";
import { exportCsv } from "@/components/report-filters";
import { pageTitle } from "@/lib/company-settings";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/expenses/report")({
  head: () => ({ meta: [{ title: pageTitle("Expense Report") }] }),
  component: () => (
    <PermissionGate anyOf={["reports.expenses", "expenses.view"]} title={"Expense Report"}>
      <ExpenseReport />
    </PermissionGate>
  ),

});

type Mode = "day" | "range" | "month" | "year";

function todayISO() { return new Date().toISOString().slice(0, 10); }
function firstOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }

function ExpenseReport() {
  const [items, setItems] = useState<Expense[]>([]);
  const [cats, setCats] = useState<ExpenseCategory[]>([]);
  const [mode, setMode] = useState<Mode>("month");
  const [day, setDay] = useState(todayISO());
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [category, setCategory] = useState("All");

  useEffect(() => {
    loadExpenses().then(setItems).catch((e) => toast.error(e?.message ?? "Failed to load"));
    loadExpenseCategories().then(setCats).catch(() => setCats([]));
  }, []);

  const { rangeFrom, rangeTo, rangeLabel } = useMemo(() => {
    if (mode === "day") return { rangeFrom: day, rangeTo: day, rangeLabel: day };
    if (mode === "range") return { rangeFrom: from, rangeTo: to, rangeLabel: `${from} → ${to}` };
    if (mode === "month") {
      const [y, m] = month.split("-").map(Number);
      const first = new Date(y, m - 1, 1).toISOString().slice(0, 10);
      const last = new Date(y, m, 0).toISOString().slice(0, 10);
      return { rangeFrom: first, rangeTo: last, rangeLabel: month };
    }
    return { rangeFrom: `${year}-01-01`, rangeTo: `${year}-12-31`, rangeLabel: year };
  }, [mode, day, from, to, month, year]);

  const filtered = useMemo(() => items.filter((e) => {
    if (e.date < rangeFrom || e.date > rangeTo) return false;
    if (category !== "All" && e.category !== category) return false;
    return true;
  }), [items, rangeFrom, rangeTo, category]);

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const count = filtered.length;
  const avg = count ? total / count : 0;

  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of filtered) m[e.category] = (m[e.category] || 0) + e.amount;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const grouped = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of filtered) {
      const key = mode === "year" ? e.date.slice(0, 7) // month buckets in year view
        : mode === "month" ? e.date // day buckets in month view
        : mode === "range" ? e.date
        : e.date;
      m[key] = (m[key] || 0) + e.amount;
    }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, mode]);

  const groupHeader = mode === "year" ? "Month" : "Date";

  const reset = () => {
    setMode("month");
    setMonth(new Date().toISOString().slice(0, 7));
    setCategory("All");
  };

  const doExport = () => {
    exportCsv(`expenses-${rangeLabel}.csv`, [
      ["Date", "Category", "Description", "Amount"],
      ...filtered.map((e) => [e.date, e.category, e.desc, e.amount]),
    ]);
  };

  return (
    <AppShell title="Expense Report" subtitle="Analyze expenses by day, month, year, or date range">
      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>View</Label>
            <div className="flex gap-1">
              {(["day", "range", "month", "year"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-3 h-9 rounded-md text-xs font-medium border capitalize ${
                    mode === m
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {m === "range" ? "Date Range" : m}
                </button>
              ))}
            </div>
          </div>

          {mode === "day" && (
            <div className="space-y-1.5">
              <Label htmlFor="er-day">Date</Label>
              <Input id="er-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-44" />
            </div>
          )}
          {mode === "range" && (
            <>
              <div className="space-y-1.5"><Label htmlFor="er-from">From</Label><Input id="er-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" /></div>
              <div className="space-y-1.5"><Label htmlFor="er-to">To</Label><Input id="er-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" /></div>
            </>
          )}
          {mode === "month" && (
            <div className="space-y-1.5">
              <Label htmlFor="er-mo">Month</Label>
              <Input id="er-mo" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
            </div>
          )}
          {mode === "year" && (
            <div className="space-y-1.5">
              <Label htmlFor="er-yr">Year</Label>
              <Input id="er-yr" type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(e.target.value)} className="w-32" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="er-cat">Category</Label>
            <select
              id="er-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 px-2.5 rounded-md border border-input bg-background text-sm outline-none focus:border-primary min-w-40"
            >
              <option value="All">All</option>
              {cats.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
            </select>
          </div>

          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={reset}><RotateCcw className="size-4" /> Reset</Button>
            <Button type="button" size="sm" onClick={doExport}><FileDown className="size-4" /> Export CSV</Button>
          </div>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">Showing {rangeFrom} to {rangeTo}</div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="Total expense" value={`৳${total.toLocaleString()}`} />
        <Kpi label="Entries" value={String(count)} />
        <Kpi label="Average / entry" value={`৳${avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
        <Kpi label="Top category" value={byCategory[0] ? `${byCategory[0][0]}` : "—"} sub={byCategory[0] ? `৳${byCategory[0][1].toLocaleString()}` : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <Card className="p-5">
          <div className="font-medium mb-3">By category</div>
          <div className="space-y-2">
            {byCategory.length === 0 && <div className="text-sm text-muted-foreground">No data.</div>}
            {byCategory.map(([c, v]) => {
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

        <Card className="p-5 lg:col-span-2 overflow-hidden">
          <div className="font-medium mb-3">Breakdown by {groupHeader.toLowerCase()}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/50">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">{groupHeader}</th>
                  <th className="text-right font-medium px-4 py-2.5">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {grouped.length === 0 && (
                  <tr><td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">No data.</td></tr>
                )}
                {grouped.map(([k, v]) => (
                  <tr key={k}>
                    <td className="px-4 py-2 tabular-nums">{k}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">৳{v.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              {grouped.length > 0 && (
                <tfoot className="bg-muted/30">
                  <tr>
                    <td className="px-4 py-3 text-right text-muted-foreground font-medium">Total</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">৳{total.toLocaleString()}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 font-medium border-b border-border">Entries</div>
        <div className="overflow-x-auto">
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
                <tr key={e.id}>
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{e.date}</td>
                  <td className="px-4 py-2.5"><Badge tone="primary">{e.category}</Badge></td>
                  <td className="px-4 py-2.5 font-medium">{e.desc}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">৳{e.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground tabular-nums mt-0.5">{sub}</div>}
    </Card>
  );
}