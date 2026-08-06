import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { Printer, FileDown, Receipt } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadOverheadsInRange, type BatchOverheadRow } from "@/lib/production-overhead-store";
import { exportCsv } from "@/components/report-filters";
import {
  pageTitle, getCompany, getCachedCompany, defaultCompany, type CompanySettings,
} from "@/lib/company-settings";
import { toast } from "sonner";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/production/overhead-report")({
  head: () => ({ meta: [{ title: pageTitle("Production Overhead Report") }] }),
  component: OverheadReportPage,
});

const money = (n: number) => `৳${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function presetRange(kind: "today" | "week" | "month"): { from: string; to: string } {
  const now = new Date();
  const to = iso(now);
  if (kind === "today") return { from: to, to };
  if (kind === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return { from: iso(d), to };
  }
  const m = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: iso(m), to };
}

function OverheadReportPage() {
  const initial = presetRange("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [rows, setRows] = useState<BatchOverheadRow[]>([]);
  const [productName, setProductName] = useState<Record<string, string>>({});
  const [company, setCompany] = useState<CompanySettings>(getCachedCompany() ?? defaultCompany);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getCompany().then(setCompany).catch(() => {}); }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [oh, prods] = await Promise.all([
        loadOverheadsInRange(`${from}T00:00:00Z`, `${to}T23:59:59Z`),
        sb.from("products").select("id,name"),
      ]);
      if (cancelled) return;
      const names: Record<string, string> = {};
      for (const p of (((prods as any).data ?? []) as any[])) names[p.id] = p.name;
      setProductName(names);
      setRows(oh);
      setLoading(false);
    })().catch((e: any) => {
      if (!cancelled) { toast.error(e?.message ?? "Failed to load report"); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [from, to]);

  const summary = useMemo(() => {
    const byCat: Record<string, { name: string; batches: Set<string>; amount: number }> = {};
    const batches = new Set<string>();
    let total = 0;
    for (const r of rows) {
      const key = r.category_id || r.category_name;
      byCat[key] ??= { name: r.category_name, batches: new Set(), amount: 0 };
      byCat[key].batches.add(r.batch_id);
      byCat[key].amount += r.amount;
      batches.add(r.batch_id);
      total += r.amount;
    }
    const list = Object.values(byCat)
      .map((v) => ({ name: v.name, batches: v.batches.size, amount: v.amount }))
      .sort((a, b) => b.amount - a.amount);
    return {
      list,
      total,
      batchCount: batches.size,
      avgPerBatch: batches.size > 0 ? total / batches.size : 0,
    };
  }, [rows]);

  const rangeLabel = from === to ? from : `${from} → ${to}`;
  const applyPreset = (k: "today" | "week" | "month") => { const r = presetRange(k); setFrom(r.from); setTo(r.to); };

  const handleExport = () => {
    const out: (string | number)[][] = [
      [company.name || defaultCompany.name],
      ["Production Overhead Report"],
      [`Date range: ${from} to ${to}`],
      [],
      ["Category", "Batches", "Amount", "% of overhead"],
      ...summary.list.map((c) => [
        c.name, c.batches, c.amount.toFixed(2),
        summary.total > 0 ? `${((c.amount / summary.total) * 100).toFixed(1)}%` : "0%",
      ]),
      ["Total", summary.batchCount, summary.total.toFixed(2), "100%"],
      [],
      ["Date", "Product", "Category", "Amount", "Note"],
      ...rows.map((r) => [
        String(r.created_at).slice(0, 10),
        r.product_id ? (productName[r.product_id] ?? "—") : "—",
        r.category_name,
        r.amount.toFixed(2),
        r.note ?? "",
      ]),
    ];
    exportCsv(`overhead-report-${from}_${to}.csv`, out);
  };

  return (
    <AppShell
      title="Production Overhead Report"
      subtitle="Overheads booked against production batches"
      actions={
        <div className="flex gap-2">
          <button onClick={handleExport} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent">
            <FileDown className="size-4" /> Export CSV
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
            <Printer className="size-4" /> Print / PDF
          </button>
        </div>
      }
    >
      <Card className="p-4 mb-4 no-print">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="block h-9 px-2 rounded-md border border-border bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="block h-9 px-2 rounded-md border border-border bg-background text-sm" />
          </div>
          <div className="flex gap-1.5">
            {([["today", "Today"], ["week", "This week"], ["month", "This month"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => applyPreset(k)}
                className="px-3 h-9 rounded-md border border-border text-xs font-medium hover:bg-accent">
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="print-area">
        <div className="print-only print-header">
          <div className="co-name">{company.name || defaultCompany.name}</div>
          {company.address && <div className="co-addr">{company.address}</div>}
          {(company.phone || company.email) && (
            <div className="co-addr">{company.phone}{company.phone && company.email ? " · " : ""}{company.email}</div>
          )}
          <div className="rpt-title">Production Overhead Report</div>
          <div className="rpt-date">Date Range: {rangeLabel} · Generated {new Date().toLocaleString()}</div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 no-print">
          <Kpi label="Total overhead" value={money(summary.total)} />
          <Kpi label="Categories" value={String(summary.list.length)} />
          <Kpi label="Batches with overhead" value={String(summary.batchCount)} />
          <Kpi label="Avg per batch" value={money(summary.avgPerBatch)} />
        </div>

        <div className="print-only print-summary">
          <div className="kpi"><div className="lbl">Total Overhead</div><div className="val">{money(summary.total)}</div></div>
          <div className="kpi"><div className="lbl">Batches</div><div className="val">{summary.batchCount}</div></div>
          <div className="kpi"><div className="lbl">Avg per Batch</div><div className="val">{money(summary.avgPerBatch)}</div></div>
        </div>

        <Card className="overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-border section-title flex items-center gap-2">
            <Receipt className="size-4 text-muted-foreground no-print" />
            <div className="font-semibold text-sm">Category Summary</div>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[520px]">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left font-medium px-5 py-3">Category</th>
                <th className="text-right font-medium px-5 py-3">Batches</th>
                <th className="text-right font-medium px-5 py-3">Amount</th>
                <th className="text-right font-medium px-5 py-3">% of overhead</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary.list.map((c) => (
                <tr key={c.name} className="hover:bg-muted/30">
                  <td className="px-5 py-3 font-medium">{c.name}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{c.batches}</td>
                  <td className="px-5 py-3 text-right">{money(c.amount)}</td>
                  <td className="px-5 py-3 text-right">{summary.total > 0 ? ((c.amount / summary.total) * 100).toFixed(1) : "0.0"}%</td>
                </tr>
              ))}
              {summary.list.length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-sm text-muted-foreground">{loading ? "Loading…" : "No overheads recorded in this range."}</td></tr>
              )}
            </tbody>
            {summary.list.length > 0 && (
              <tfoot>
                <tr className="font-semibold bg-muted/30">
                  <td className="px-5 py-3">Total</td>
                  <td className="px-5 py-3 text-right">{summary.batchCount}</td>
                  <td className="px-5 py-3 text-right">{money(summary.total)}</td>
                  <td className="px-5 py-3 text-right">100%</td>
                </tr>
              </tfoot>
            )}
          </table></div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border section-title">
            <div className="font-semibold text-sm">Overhead Details</div>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left font-medium px-5 py-3">Date</th>
                <th className="text-left font-medium px-5 py-3">Product</th>
                <th className="text-left font-medium px-5 py-3">Category</th>
                <th className="text-right font-medium px-5 py-3">Amount</th>
                <th className="text-left font-medium px-5 py-3">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 text-muted-foreground">{String(r.created_at).slice(0, 10)}</td>
                  <td className="px-5 py-3 font-medium">{r.product_id ? (productName[r.product_id] ?? "—") : "—"}</td>
                  <td className="px-5 py-3">{r.category_name}</td>
                  <td className="px-5 py-3 text-right">{money(r.amount)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{r.note ?? ""}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">{loading ? "Loading…" : "No overhead entries in this range."}</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="font-semibold bg-muted/30">
                  <td className="px-5 py-3">Total</td>
                  <td className="px-5 py-3" />
                  <td className="px-5 py-3" />
                  <td className="px-5 py-3 text-right">{money(summary.total)}</td>
                  <td className="px-5 py-3" />
                </tr>
              </tfoot>
            )}
          </table></div>
        </Card>

        <div className="print-only" style={{ marginTop: 10, textAlign: "center", fontSize: 8, color: "#666" }}>
          Powered by IT Solution · www.itsolution.bd
        </div>
      </div>
    </AppShell>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </Card>
  );
}
