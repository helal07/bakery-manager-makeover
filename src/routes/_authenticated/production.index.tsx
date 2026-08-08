import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { Printer, FileDown, Boxes, TrendingDown, TrendingUp, Warehouse } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pageTitle, getCompany, getCachedCompany, defaultCompany, type CompanySettings } from "@/lib/company-settings";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/permission-gate";

const sb = supabase as any;


export const Route = createFileRoute("/_authenticated/production/")({
  head: () => ({ meta: [{ title: pageTitle("Daily Register Report") }] }),
  component: () => (
    <PermissionGate anyOf={["production.reports.daily_register", "production.reports.view"]} title={"Production Register"}>
      <ProductionRegister />
    </PermissionGate>
  ),

});

type Preset = "today" | "month" | "year" | "custom";

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function rangeFor(preset: Preset, from: string, to: string) {
  const now = new Date();
  const today = ymd(now);
  if (preset === "today") return { from: today, to: today };
  if (preset === "month") return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  if (preset === "year") return { from: ymd(new Date(now.getFullYear(), 0, 1)), to: today };
  return { from: from || today, to: to || today };
}
function fmt(n: number, d = 2) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: d }).format(n || 0);
}
function money(n: number) { return "৳" + fmt(n, 2); }

type MatRow = {
  id: string; name: string; unit: string; cost: number;
  opening: number; consumption: number; closing: number;
};
type BatchRow = {
  id: string; date: string; product_id: string; product_name: string; qty: number;
  materials: { name: string; qty: number; unit: string }[];
  cost: number; value: number;
};

function ProductionRegister() {
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<CompanySettings>(() => getCachedCompany() ?? defaultCompany);

  const [materials, setMaterials] = useState<MatRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);

  useEffect(() => { getCompany().then(setCompany).catch(() => {}); }, []);


  const { from, to } = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo]);
  const startIso = `${from}T00:00:00.000Z`;
  const endIso = `${to}T23:59:59.999Z`;

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    (async () => {
      const [rmRes, curStockRes, periodLedRes, prodLedRes, recRes, prodRes] = await Promise.all([
        sb.from("raw_materials").select("id,name,unit,cost").eq("is_active", true),
        sb.from("raw_material_stock").select("material_id,quantity").is("showroom_id", null),
        sb.from("raw_stock_ledger").select("material_id,qty,kind,created_at")
          .gte("created_at", startIso).lte("created_at", endIso),
        sb.from("stock_ledger").select("id,ref_id,product_id,qty,kind,created_at,products(name,cost,price)")
          .in("kind", ["production", "production_void"]).is("showroom_id", null)
          .gte("created_at", startIso).lte("created_at", endIso)
          .order("created_at", { ascending: false }),

        sb.from("recipes").select("product_id,material_id,qty"),
        sb.from("products").select("id,name,cost,price"),
      ]);
      if (cancel) return;

      const rmList = (rmRes.data ?? []) as any[];
      const closingMap = new Map<string, number>();
      for (const s of (curStockRes.data ?? []) as any[]) {
        closingMap.set(s.material_id, Number(s.quantity) || 0);
      }
      const netInPeriod = new Map<string, number>();
      const consumeInPeriod = new Map<string, number>();
      for (const r of (periodLedRes.data ?? []) as any[]) {
        const q = Number(r.qty) || 0;
        netInPeriod.set(r.material_id, (netInPeriod.get(r.material_id) || 0) + q);
        if (r.kind === "production_consume") {
          consumeInPeriod.set(r.material_id, (consumeInPeriod.get(r.material_id) || 0) + Math.abs(q));
        }
      }
      const mats: MatRow[] = rmList.map((m) => {
        const closing = closingMap.get(m.id) ?? 0;
        const net = netInPeriod.get(m.id) ?? 0;
        return {
          id: m.id, name: m.name, unit: m.unit || "", cost: Number(m.cost) || 0,
          opening: closing - net,
          consumption: consumeInPeriod.get(m.id) ?? 0,
          closing,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      // Recipes by product
      const recipeMap = new Map<string, { material_id: string; qty: number }[]>();
      for (const r of (recRes.data ?? []) as any[]) {
        const arr = recipeMap.get(r.product_id) ?? [];
        arr.push({ material_id: r.material_id, qty: Number(r.qty) || 0 });
        recipeMap.set(r.product_id, arr);
      }
      const matById = new Map<string, any>(rmList.map((m) => [m.id, m]));

      const batchRows: BatchRow[] = ((prodLedRes.data ?? []) as any[]).map((b) => {
        const qty = Number(b.qty) || 0;
        const ings = recipeMap.get(b.product_id) ?? [];
        const materialsUsed = ings.map((it) => {
          const m = matById.get(it.material_id);
          return {
            name: m?.name ?? "—",
            qty: it.qty * qty,
            unit: m?.unit ?? "",
          };
        });
        const unitCost = ings.reduce((s, it) => s + (Number(matById.get(it.material_id)?.cost) || 0) * it.qty, 0);
        const cost = unitCost * qty;
        const price = Number(b.products?.price) || 0;
        return {
          id: b.id,
          date: (b.created_at as string).slice(0, 10),
          product_id: b.product_id,
          product_name: b.products?.name ?? "—",
          qty,
          materials: materialsUsed,
          cost,
          value: price * qty,
        };
      });

      setMaterials(mats);
      setBatches(batchRows);
      setLoading(false);
    })().catch(() => setLoading(false));
    return () => { cancel = true; };
  }, [startIso, endIso]);

  // Summary aggregates
  const totals = useMemo(() => {
    const openingQty = materials.reduce((s, m) => s + m.opening, 0);
    const openingVal = materials.reduce((s, m) => s + m.opening * m.cost, 0);
    const consumptionQty = materials.reduce((s, m) => s + m.consumption, 0);
    const consumptionVal = materials.reduce((s, m) => s + m.consumption * m.cost, 0);
    const closingQty = materials.reduce((s, m) => s + m.closing, 0);
    const closingVal = materials.reduce((s, m) => s + m.closing * m.cost, 0);
    const totalBatches = batches.length;
    const totalProdCost = batches.reduce((s, b) => s + b.cost, 0);
    const totalProdValue = batches.reduce((s, b) => s + b.value, 0);
    const totalProdQty = batches.reduce((s, b) => s + b.qty, 0);
    return { openingQty, openingVal, consumptionQty, consumptionVal, closingQty, closingVal, totalBatches, totalProdCost, totalProdValue, totalProdQty };
  }, [materials, batches]);

  const rangeLabel = from === to ? from : `${from} → ${to}`;

  const exportExcel = () => {
    // Excel-friendly CSV (opens in MS Excel)
    const esc = (v: any) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines: string[] = [];
    lines.push(`Daily Register Report`);
    lines.push(`Range,${rangeLabel}`);
    lines.push("");
    lines.push("=== Summary ===");
    lines.push("Metric,Quantity,Value (BDT)");
    lines.push(`Opening Stock,${totals.openingQty.toFixed(2)},${totals.openingVal.toFixed(2)}`);
    lines.push(`Total Consumption,${totals.consumptionQty.toFixed(2)},${totals.consumptionVal.toFixed(2)}`);
    lines.push(`Closing Stock,${totals.closingQty.toFixed(2)},${totals.closingVal.toFixed(2)}`);
    lines.push(`Inventory Value (current),${totals.closingQty.toFixed(2)},${totals.closingVal.toFixed(2)}`);
    lines.push("");
    lines.push("=== Raw Material Inventory ===");
    lines.push("Material,Unit,Opening,Consumption,Closing,Cost/Unit,Inventory Value");
    materials.forEach((m) => {
      lines.push([m.name, m.unit, m.opening.toFixed(4), m.consumption.toFixed(4), m.closing.toFixed(4), m.cost.toFixed(2), (m.closing * m.cost).toFixed(2)].map(esc).join(","));
    });
    lines.push("");
    lines.push("=== Batch-wise Production ===");
    lines.push("Date,Batch ID,Product,Qty,Raw Materials Used,Production Cost,Production Value");
    batches.forEach((b) => {
      const mats = b.materials.map((m) => `${m.name}: ${m.qty.toFixed(3)} ${m.unit}`).join(" | ");
      lines.push([b.date, b.id.slice(0, 8).toUpperCase(), b.product_name, b.qty, mats, b.cost.toFixed(2), b.value.toFixed(2)].map(esc).join(","));
    });
    lines.push("");
    lines.push(`Totals,${totals.totalBatches} batches,,${totals.totalProdQty},,${totals.totalProdCost.toFixed(2)},${totals.totalProdValue.toFixed(2)}`);
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-register-${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell title="Daily Register Report" subtitle="Production register — opening, consumption, closing & batch-wise details">
      {/* Filters bar */}
      <Card className="p-3 mb-4 no-print">
        <div className="flex flex-wrap items-center gap-2">
          {(["today", "month", "year", "custom"] as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                preset === p ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
              }`}
            >
              {p === "today" ? "Today" : p === "month" ? "This Month" : p === "year" ? "This Year" : "Custom"}
            </button>
          ))}
          {preset === "custom" && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs" />
              <span className="text-xs text-muted-foreground">→</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs" />
            </div>
          )}
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={exportExcel}>
            <FileDown className="size-3.5" /> Export Excel
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-3.5" /> Print Report
          </Button>
        </div>
      </Card>

      <div className="print-area">
        {/* Print-only header */}
        <div className="print-only print-header">
          <div className="co-name">{company.name || defaultCompany.name}</div>
          {company.address && <div className="co-addr">{company.address}</div>}
          {(company.phone || company.email) && (
            <div className="co-addr">
              {company.phone}{company.phone && company.email ? " · " : ""}{company.email}
            </div>
          )}
          <div className="rpt-title">Daily Register Report — Production Register</div>
          <div className="rpt-date">Date of Stock: {rangeLabel}</div>
        </div>

        {/* Screen summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 no-print">
          <SumCard icon={Warehouse} tone="emerald" label="Opening Stock" qty={totals.openingQty} value={totals.openingVal} />
          <SumCard icon={TrendingDown} tone="rose" label="Total Consumption" qty={totals.consumptionQty} value={totals.consumptionVal} />
          <SumCard icon={TrendingUp} tone="sky" label="Closing Stock" qty={totals.closingQty} value={totals.closingVal} />
          <SumCard icon={Boxes} tone="violet" label="Inventory Value (Now)" qty={totals.closingQty} value={totals.closingVal} />
        </div>

        {/* Print-only compact summary */}
        <div className="print-only print-summary">
          <div className="kpi"><div className="lbl">Opening Stock</div><div className="val">{money(totals.openingVal)}</div><div className="sub">Qty: {fmt(totals.openingQty, 2)}</div></div>
          <div className="kpi"><div className="lbl">Consumption</div><div className="val">{money(totals.consumptionVal)}</div><div className="sub">Qty: {fmt(totals.consumptionQty, 2)}</div></div>
          <div className="kpi"><div className="lbl">Closing Stock</div><div className="val">{money(totals.closingVal)}</div><div className="sub">Qty: {fmt(totals.closingQty, 2)}</div></div>
          <div className="kpi"><div className="lbl">Inventory Value</div><div className="val">{money(totals.closingVal)}</div><div className="sub">{totals.totalBatches} batches</div></div>
        </div>

        {/* Raw Material Inventory Table */}
        <Card className="mb-4 overflow-hidden" data-card>
          <div className="px-4 py-2.5 border-b border-border bg-muted/40 text-sm font-semibold section-title">
            Raw Material Inventory
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-xs text-muted-foreground bg-muted/20">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Material (Unit)</th>
                  <th className="text-right font-medium px-4 py-2">Opening</th>
                  <th className="text-right font-medium px-4 py-2">Consumption</th>
                  <th className="text-right font-medium px-4 py-2">Closing</th>
                  <th className="text-right font-medium px-4 py-2">Cost/Unit</th>
                  <th className="text-right font-medium px-4 py-2">Inventory Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {materials.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">{loading ? "Loading…" : "No materials"}</td></tr>
                ) : materials.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 font-medium">{m.name} <span className="text-muted-foreground font-normal">({m.unit || "unit"})</span></td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(m.opening, 3)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-rose-600">{fmt(m.consumption, 3)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(m.closing, 3)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(m.cost)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{money(m.closing * m.cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 font-semibold">
                  <td className="px-4 py-2">Totals</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(totals.openingQty, 3)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(totals.consumptionQty, 3)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(totals.closingQty, 3)}</td>
                  <td className="px-4 py-2 text-right">—</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totals.closingVal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* Batch-wise Production Table */}
        <Card className="overflow-hidden" data-card>
          <div className="px-4 py-2.5 border-b border-border bg-muted/40 text-sm font-semibold section-title">
            Batch-wise Production Details
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="text-xs text-muted-foreground bg-muted/20">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Date</th>
                  <th className="text-left font-medium px-4 py-2">Batch ID</th>
                  <th className="text-left font-medium px-4 py-2">Product</th>
                  <th className="text-right font-medium px-4 py-2">Qty</th>
                  <th className="text-left font-medium px-4 py-2">Raw Materials Consumed</th>
                  <th className="text-right font-medium px-4 py-2">Prod. Cost</th>
                  <th className="text-right font-medium px-4 py-2">Prod. Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batches.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">{loading ? "Loading…" : "No batches in this range"}</td></tr>
                ) : batches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{b.date}</td>
                    <td className="px-4 py-2 font-mono text-xs">#{b.id.slice(0, 8).toUpperCase()}</td>
                    <td className="px-4 py-2 font-medium">{b.product_name}</td>
                    <td className="px-4 py-2 text-right">{fmt(b.qty, 2)}</td>
                    <td className="px-4 py-2 text-xs">
                      {b.materials.length === 0 ? <span className="text-muted-foreground">—</span> :
                        b.materials.map((m, i) => (
                          <span key={i} className="inline-block mr-2">
                            {m.name}: <span className="font-medium">{fmt(m.qty, 3)}</span> {m.unit}{i < b.materials.length - 1 ? "," : ""}
                          </span>
                        ))
                      }
                    </td>
                    <td className="px-4 py-2 text-right">{money(b.cost)}</td>
                    <td className="px-4 py-2 text-right font-medium text-primary">{money(b.value)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 font-semibold">
                  <td className="px-4 py-2" colSpan={3}>{totals.totalBatches} batches</td>
                  <td className="px-4 py-2 text-right">{fmt(totals.totalProdQty, 2)}</td>
                  <td className="px-4 py-2 text-right text-xs text-muted-foreground">Total consumption: {fmt(totals.consumptionQty, 3)}</td>
                  <td className="px-4 py-2 text-right">{money(totals.totalProdCost)}</td>
                  <td className="px-4 py-2 text-right">{money(totals.totalProdValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function SumCard({
  icon: Icon, label, qty, value, tone,
}: {
  icon: any; label: string; qty: number; value: number;
  tone: "emerald" | "rose" | "sky" | "violet";
}) {
  const toneMap: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600",
    rose: "bg-rose-500/10 text-rose-600",
    sky: "bg-sky-500/10 text-sky-600",
    violet: "bg-violet-500/10 text-violet-600",
  };
  return (
    <Card className="p-3" data-card>
      <div className="flex items-start gap-2.5">
        <div className={`size-9 rounded-lg grid place-items-center shrink-0 ${toneMap[tone]}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{label}</div>
          <div className="text-base font-semibold truncate">৳{new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value || 0)}</div>
          <div className="text-[11px] text-muted-foreground truncate mt-0.5">Qty: {new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(qty || 0)}</div>
        </div>
      </div>
    </Card>
  );
}
