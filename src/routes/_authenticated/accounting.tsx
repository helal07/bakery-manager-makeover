import { createFileRoute } from "@tanstack/react-router";
import { PermissionGate } from "@/components/permission-gate";

import { AppShell, Card } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { toast } from "sonner";
import { pageTitle } from "@/lib/company-settings";
import { scopeTo } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/accounting")({
  head: () => ({ meta: [{ title: pageTitle("Accounting") }] }),
  component: () => (
    <PermissionGate anyOf={["reports.ledgers", "reports.sales"]} title="Accounting">
      <Accounting />
    </PermissionGate>
  ),
});


type LedgerRow = {
  date: string;
  account: string;
  type: "Income" | "Expense" | "Liability";
  debit: number;
  credit: number;
};

function Accounting() {
  const { currentShowroomId, showrooms } = useShowroomScope();
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const iso = monthStart.toISOString();
      const day = monthStart.toISOString().slice(0, 10);

      const salesQ = supabase
        .from("sales")
        .select("id, total, created_at, customer_name, showroom_id")
        .gte("created_at", iso);
      const expQ = supabase
        .from("expenses")
        .select("id, amount, expense_date, category, description, showroom_id")
        .gte("expense_date", day);
      const purQ = supabase
        .from("purchases")
        .select("id, code, due, purchase_date, showroom_id, suppliers(name)")
        .gt("due", 0)
        .gte("purchase_date", day);

      const [sales, expenses, purchases] = await Promise.all([
        scopeTo(salesQ, currentShowroomId),
        scopeTo(expQ, currentShowroomId),
        scopeTo(purQ, currentShowroomId),
      ]);

      if (cancelled) return;
      if (sales.error) toast.error(sales.error.message);
      if (expenses.error) toast.error(expenses.error.message);
      if (purchases.error) toast.error(purchases.error.message);

      const rows: LedgerRow[] = [];
      for (const s of sales.data ?? []) {
        rows.push({
          date: (s.created_at as string).slice(0, 10),
          account: `Sale · ${s.customer_name ?? "Walk-in"}`,
          type: "Income",
          debit: 0,
          credit: Number(s.total ?? 0),
        });
      }
      for (const e of expenses.data ?? []) {
        rows.push({
          date: e.expense_date as string,
          account: `${e.category}${e.description ? ` · ${e.description}` : ""}`,
          type: "Expense",
          debit: Number(e.amount ?? 0),
          credit: 0,
        });
      }
      for (const p of purchases.data ?? []) {
        const sup = (p as { suppliers?: { name?: string } | null }).suppliers?.name ?? "Supplier";
        rows.push({
          date: p.purchase_date as string,
          account: `${p.code ?? "Purchase"} · ${sup}`,
          type: "Liability",
          debit: 0,
          credit: Number(p.due ?? 0),
        });
      }
      rows.sort((a, b) => (a.date < b.date ? 1 : -1));
      setLedger(rows);
      setLoading(false);
    })().catch((e) => {
      if (!cancelled) {
        toast.error(e?.message ?? "Failed to load accounting data");
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentShowroomId]);

  const { income, expenses, liabilities, profit } = useMemo(() => {
    const income = ledger.filter((l) => l.type === "Income").reduce((s, l) => s + l.credit, 0);
    const expenses = ledger.filter((l) => l.type === "Expense").reduce((s, l) => s + l.debit, 0);
    const liabilities = ledger.filter((l) => l.type === "Liability").reduce((s, l) => s + l.credit, 0);
    return { income, expenses, liabilities, profit: income - expenses };
  }, [ledger]);

  // Accounts are kept per location: factory and each outlet never mix.
  const locationName = currentShowroomId
    ? (showrooms.find((s) => s.id === currentShowroomId)?.name ?? "Outlet")
    : "Factory";

  return (
    <AppShell
      title="Accounting"
      subtitle={`${locationName} · double-entry ledger · expenses · P&L`}
    >
      <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">Account scope</span>
        <span className="font-semibold">{locationName}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
        {[
          { l: "Total Income", v: income, c: "text-[color:var(--success)]" },
          { l: "Operating Expenses", v: expenses, c: "text-foreground" },
          { l: "Supplier Dues", v: liabilities, c: "text-destructive" },
          { l: "Net Profit (period)", v: profit, c: "text-primary" },
        ].map((k) => (
          <Card key={k.l} className="p-5">
            <div className="text-xs text-muted-foreground">{k.l}</div>
            <div className={`text-2xl font-semibold mt-1 ${k.c}`}>৳{k.v.toLocaleString()}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">General Ledger</h2>
          </div>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Date</th>
                <th className="text-left font-medium px-5 py-2.5">Account</th>
                <th className="text-left font-medium px-5 py-2.5">Type</th>
                <th className="text-right font-medium px-5 py-2.5">Debit</th>
                <th className="text-right font-medium px-5 py-2.5">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ledger.map((l, i) => (
                <tr key={i} className="hover:bg-muted/30">
                  <td className="px-5 py-2.5 text-muted-foreground">{l.date}</td>
                  <td className="px-5 py-2.5 font-medium">{l.account}</td>
                  <td className="px-5 py-2.5 text-muted-foreground">{l.type}</td>
                  <td className="px-5 py-2.5 text-right">{l.debit ? `৳${l.debit.toLocaleString()}` : "—"}</td>
                  <td className="px-5 py-2.5 text-right">{l.credit ? `৳${l.credit.toLocaleString()}` : "—"}</td>
                </tr>
              ))}
              {ledger.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">{loading ? "Loading…" : "No ledger entries this period"}</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Profit & Loss</h2>
          <p className="text-xs text-muted-foreground">Month to date</p>
          <div className="mt-4 space-y-2 text-sm">
            <Row label="Revenue" value={income} />
            <Row label="Operating Expenses" value={-expenses} />
            <Row label="Supplier Dues" value={-liabilities} />
            <div className="border-t border-border pt-2">
              <Row label="Net Profit" value={profit} bold success={profit >= 0} />
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Row({ label, value, bold, success }: { label: string; value: number; bold?: boolean; success?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""} ${success ? "text-[color:var(--success)]" : ""}`}>
      <span>{label}</span>
      <span>{value < 0 ? `-৳${Math.abs(value).toLocaleString()}` : `৳${value.toLocaleString()}`}</span>
    </div>
  );
}