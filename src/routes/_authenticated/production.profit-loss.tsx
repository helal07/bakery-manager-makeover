import { PermissionGate } from "@/components/permission-gate";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { Printer, FileDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { toast } from "sonner";
import { scopeTo } from "@/lib/scope";
import {
  pageTitle, getCompany, getCachedCompany, defaultCompany, type CompanySettings,
} from "@/lib/company-settings";


const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/production/profit-loss")({
  head: () => ({ meta: [{ title: pageTitle("Factory Profit & Loss") }] }),
  component: () => (
    <PermissionGate anyOf={["production.reports.profit_loss", "production.reports.view"]} title={"Profit & Loss"}>
      <ProfitLossPage />
    </PermissionGate>
  ),

});

type MaterialRow = { id: string; name: string; unit: string; qty: number; cost: number };
type OutputRow = { id: string; name: string; qty: number; unitPrice: number; value: number };
type TransferRow = { key: string; date: string; showroom: string; product: string; qty: number; unitPrice: number; value: number };
type LossRow = { key: string; date: string; item: string; qty: number; cost: number; reason: string };

const money = (n: number) => `৳${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmt = (n: number, d = 3) => (Number(n) || 0).toFixed(d).replace(/\.?0+$/, "") || "0";

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function presetRange(kind: "today" | "week" | "month"): { from: string; to: string } {
  const now = new Date();
  const to = iso(now);
  if (kind === "today") return { from: to, to };
  if (kind === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return { from: iso(d), to };
  }
  const m = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: iso(m), to };
}

function ProfitLossPage() {
  const { currentShowroomId } = useShowroomScope();
  const initial = presetRange("week");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [company, setCompany] = useState<CompanySettings>(getCachedCompany() ?? defaultCompany);
  const [loading, setLoading] = useState(true);

  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [outputs, setOutputs] = useState<OutputRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [losses, setLosses] = useState<LossRow[]>([]);
  const [overheads, setOverheads] = useState(0);

  useEffect(() => { getCompany().then(setCompany).catch(() => {}); }, []);

  useEffect(() => {
    let cancelled = false;
    const fromTs = `${from}T00:00:00Z`;
    const toTs = `${to}T23:59:59Z`;
    setLoading(true);
    (async () => {
      // Raw material consumption (production only; reversals of deleted/edited
      // batches are netted out below)
      let consumeQ = sb
        .from("raw_stock_ledger")
        .select("material_id,qty,kind,created_at,raw_materials(name,unit,cost)")
        .in("kind", ["production_consume", "production_reverse"])
        .gte("created_at", fromTs).lte("created_at", toTs);
      consumeQ = scopeTo(consumeQ, currentShowroomId, "showroom_id");

      // Finished goods produced
      let produceQ = sb
        .from("stock_ledger")
        .select("id,ref_id,product_id,qty,kind,created_at,products(name,price)")
        .in("kind", ["production", "production_void"])
        .gte("created_at", fromTs).lte("created_at", toTs);
      produceQ = scopeTo(produceQ, currentShowroomId, "showroom_id");


      // Transfers dispatched to showrooms
      let transferQ = sb
        .from("transfers")
        .select("id,code,created_at,dest_showroom_id,transfer_items(qty,product_id,products(name,price))")

        .gte("created_at", fromTs).lte("created_at", toTs)
        .order("created_at", { ascending: false });
      transferQ = scopeTo(transferQ, currentShowroomId, "source_showroom_id");

      // Overheads booked in the period
      const overheadQ = sb
        .from("production_overheads")
        .select("amount,created_at")
        .gte("created_at", fromTs).lte("created_at", toTs);

      // Losses: raw wastage + finished product wastage
      let rawWasteQ = sb
        .from("raw_stock_ledger")
        .select("id,material_id,qty,created_at,raw_materials(name,unit,cost)")
        .eq("kind", "wastage")
        .gte("created_at", fromTs).lte("created_at", toTs);
      rawWasteQ = scopeTo(rawWasteQ, currentShowroomId, "showroom_id");

      let prodWasteQ = sb
        .from("wastage_log")
        .select("id,qty,reason,logged_at,product_id,products(name,cost)")
        .not("product_id", "is", null)
        .gte("logged_at", fromTs).lte("logged_at", toTs);
      prodWasteQ = scopeTo(prodWasteQ, currentShowroomId, "showroom_id");

      const showroomsQ = sb.from("showrooms").select("id,name");

      const [consume, produce, trans, ovh, rawWaste, prodWaste, srooms] = await Promise.all([
        consumeQ, produceQ, transferQ, overheadQ, rawWasteQ, prodWasteQ, showroomsQ,
      ]);
      if (cancelled) return;

      const firstError = [consume, produce, trans, ovh, rawWaste, prodWaste].find((r: any) => r?.error);
      if (firstError) toast.error((firstError as any).error.message);

      const showroomName: Record<string, string> = {};
      for (const s of (((srooms as any).data ?? []) as any[])) showroomName[s.id] = s.name;


      // Materials (consume rows are negative, reverse rows positive → net)
      const mMap: Record<string, MaterialRow> = {};
      for (const r of ((consume as any).data ?? []) as any[]) {
        const id = r.material_id as string;
        if (!mMap[id]) {
          mMap[id] = { id, name: r.raw_materials?.name ?? "—", unit: r.raw_materials?.unit ?? "", qty: 0, cost: 0 };
        }
        const signed = r.kind === "production_reverse" ? -Math.abs(Number(r.qty) || 0) : Math.abs(Number(r.qty) || 0);
        mMap[id].qty += signed;
        mMap[id].cost += signed * (Number(r.raw_materials?.cost) || 0);
      }
      setMaterials(
        Object.values(mMap)
          .map((m) => ({ ...m, qty: Math.max(0, m.qty), cost: Math.max(0, m.cost) }))
          .filter((m) => m.qty > 1e-9)
          .sort((a, b) => b.cost - a.cost),
      );

      // Output — voided batches net to zero and drop out
      const oMap: Record<string, OutputRow> = {};
      for (const r of ((produce as any).data ?? []) as any[]) {
        const id = r.product_id as string;
        const price = Number(r.products?.price) || 0;
        if (!oMap[id]) oMap[id] = { id, name: r.products?.name ?? "—", qty: 0, unitPrice: price, value: 0 };
        const qty = r.kind === "production_void" ? -Math.abs(Number(r.qty) || 0) : Math.abs(Number(r.qty) || 0);
        oMap[id].qty += qty;
        oMap[id].value += qty * price;
      }
      setOutputs(
        Object.values(oMap)
          .map((o) => ({ ...o, qty: Math.max(0, o.qty), value: Math.max(0, o.value) }))
          .filter((o) => o.qty > 1e-9)
          .sort((a, b) => b.value - a.value),
      );


      // Transfers
      const tRows: TransferRow[] = [];
      for (const t of ((trans as any).data ?? []) as any[]) {
        for (const [i, it] of ((t.transfer_items ?? []) as any[]).entries()) {
          if (!it.product_id) continue;
          const qty = Math.abs(Number(it.qty) || 0);
          const price = Number(it.products?.price) || 0;
          tRows.push({
            key: `${t.id}-${i}`,
            date: String(t.created_at).slice(0, 10),
            showroom: showroomName[t.dest_showroom_id] ?? "—",
            product: it.products?.name ?? "—",
            qty,
            unitPrice: price,
            value: qty * price,
          });
        }
      }
      setTransfers(tRows);

      setOverheads((((ovh as any).data ?? []) as any[]).reduce((s, r) => s + (Number(r.amount) || 0), 0));

      // Losses
      const lRows: LossRow[] = [];
      for (const r of ((rawWaste as any).data ?? []) as any[]) {
        const qty = Math.abs(Number(r.qty) || 0);
        lRows.push({
          key: `raw-${r.id}`,
          date: String(r.created_at).slice(0, 10),
          item: `${r.raw_materials?.name ?? "—"} (${r.raw_materials?.unit ?? ""})`,
          qty,
          cost: qty * (Number(r.raw_materials?.cost) || 0),
          reason: "Raw wastage",
        });
      }
      for (const r of ((prodWaste as any).data ?? []) as any[]) {
        const qty = Math.abs(Number(r.qty) || 0);
        lRows.push({
          key: `prod-${r.id}`,
          date: String(r.logged_at).slice(0, 10),
          item: r.products?.name ?? "—",
          qty,
          cost: qty * (Number(r.products?.cost) || 0),
          reason: r.reason ?? "Product wastage",
        });
      }
      setLosses(lRows.sort((a, b) => (a.date < b.date ? 1 : -1)));
      setLoading(false);
    })().catch((e: any) => {
      if (!cancelled) { toast.error(e?.message ?? "Failed to load report"); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [currentShowroomId, from, to]);

  const totals = useMemo(() => {
    const materialCost = materials.reduce((s, r) => s + r.cost, 0);
    const producedValue = outputs.reduce((s, r) => s + r.value, 0);
    const producedQty = outputs.reduce((s, r) => s + r.qty, 0);
    const transferredValue = transfers.reduce((s, r) => s + r.value, 0);
    const wastageCost = losses.reduce((s, r) => s + r.cost, 0);
    const revenueBase = transferredValue > 0 ? transferredValue : producedValue;
    const totalCost = materialCost + overheads + wastageCost;
    const profit = revenueBase - totalCost;
    const margin = revenueBase > 0 ? (profit / revenueBase) * 100 : 0;
    return { materialCost, producedValue, producedQty, transferredValue, wastageCost, revenueBase, totalCost, profit, margin };
  }, [materials, outputs, transfers, losses, overheads]);

  const rangeLabel = from === to ? from : `${from} → ${to}`;
  const applyPreset = (k: "today" | "week" | "month") => { const r = presetRange(k); setFrom(r.from); setTo(r.to); };

  return (
    <AppShell
      title="Factory Profit & Loss"
      subtitle="Materials consumed vs. production value transferred to showrooms"
      actions={
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent">
            <Printer className="size-4" /> Print
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
            <FileDown className="size-4" /> Export PDF
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
          <div className="rpt-title">Factory Profit &amp; Loss Report</div>
          <div className="rpt-date">Date Range: {rangeLabel} · Generated {new Date().toLocaleString()}</div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4 no-print">
          <Kpi label="Materials consumed" value={money(totals.materialCost)} sub={`${materials.length} materials`} />
          <Kpi label="Production output" value={money(totals.producedValue)} sub={`${fmt(totals.producedQty, 2)} units`} />
          <Kpi label="Transferred to showrooms" value={money(totals.transferredValue)} sub={`${transfers.length} lines`} />
          <Kpi label="Overheads" value={money(overheads)} />
          <Kpi label="Wastage loss" value={money(totals.wastageCost)} tone="rose" />
          <Kpi
            label={totals.profit >= 0 ? "Net profit" : "Net loss"}
            value={money(Math.abs(totals.profit))}
            sub={`${totals.margin.toFixed(1)}% margin`}
            tone={totals.profit >= 0 ? "emerald" : "rose"}
          />
        </div>

        <div className="print-only print-summary">
          <div className="kpi"><div className="lbl">Materials Consumed</div><div className="val">{money(totals.materialCost)}</div></div>
          <div className="kpi"><div className="lbl">Transferred Value</div><div className="val">{money(totals.transferredValue)}</div></div>
          <div className="kpi"><div className="lbl">Overheads + Wastage</div><div className="val">{money(overheads + totals.wastageCost)}</div></div>
          <div className="kpi"><div className="lbl">{totals.profit >= 0 ? "Net Profit" : "Net Loss"}</div><div className="val">{money(Math.abs(totals.profit))}</div><div className="sub">{totals.margin.toFixed(1)}% margin</div></div>
        </div>

        <Section title="Profit & Loss Summary">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              <SumLine label="Value transferred to showrooms" value={totals.transferredValue} />
              <SumLine label="Production output value (at product price)" value={totals.producedValue} muted />
              <SumLine label="Raw materials consumed" value={-totals.materialCost} />
              <SumLine label="Production overheads" value={-overheads} />
              <SumLine label="Wastage / damage loss" value={-totals.wastageCost} />
              <tr className="font-semibold">
                <td className="px-4 py-2.5">{totals.profit >= 0 ? "Net Profit" : "Net Loss"}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${totals.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {totals.profit < 0 ? `-${money(Math.abs(totals.profit))}` : money(totals.profit)}
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section title="Raw Materials Consumed">
          <Table
            head={["Material", "Quantity", "Cost"]}
            empty={loading ? "Loading…" : "No consumption in this range"}
            rows={materials.map((m) => [
              `${m.name}${m.unit ? ` (${m.unit})` : ""}`,
              `${fmt(m.qty)} ${m.unit}`,
              money(m.cost),
            ])}
            footer={["Total", "", money(totals.materialCost)]}
          />
        </Section>

        <Section title="Production Output">
          <Table
            head={["Product", "Produced qty", "Unit price", "Value"]}
            empty={loading ? "Loading…" : "No production in this range"}
            rows={outputs.map((o) => [o.name, fmt(o.qty, 2), money(o.unitPrice), money(o.value)])}
            footer={["Total", fmt(totals.producedQty, 2), "", money(totals.producedValue)]}
          />
        </Section>

        <Section title="Transferred to Showrooms">
          <Table
            head={["Date", "Showroom", "Product", "Qty", "Unit price", "Value"]}
            empty={loading ? "Loading…" : "No transfers in this range"}
            rows={transfers.map((t) => [t.date, t.showroom, t.product, fmt(t.qty, 2), money(t.unitPrice), money(t.value)])}
            footer={["Total", "", "", "", "", money(totals.transferredValue)]}
          />
        </Section>

        <Section title="Wastage & Damage">
          <Table
            head={["Date", "Item", "Qty", "Reason", "Cost"]}
            empty={loading ? "Loading…" : "No wastage in this range"}
            rows={losses.map((l) => [l.date, l.item, fmt(l.qty), l.reason, money(l.cost)])}
            footer={["Total", "", "", "", money(totals.wastageCost)]}
          />
        </Section>

        <div className="print-only" style={{ marginTop: 10, textAlign: "center", fontSize: 8, color: "#666" }}>
          Powered by IT Solution · www.itsolution.bd
        </div>
      </div>
    </AppShell>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "emerald" | "rose" }) {
  const color = tone === "emerald" ? "text-emerald-600" : tone === "rose" ? "text-rose-600" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mb-4 overflow-hidden" data-card>
      <div className="px-4 py-2.5 border-b border-border bg-muted/40 text-sm font-semibold section-title">{title}</div>
      <div className="overflow-x-auto">{children}</div>
    </Card>
  );
}

function SumLine({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <tr className={muted ? "text-muted-foreground" : ""}>
      <td className="px-4 py-2">{label}</td>
      <td className="px-4 py-2 text-right tabular-nums">{value < 0 ? `-${money(Math.abs(value))}` : money(value)}</td>
    </tr>
  );
}

function Table({ head, rows, footer, empty }: { head: string[]; rows: string[][]; footer?: string[]; empty: string }) {
  return (
    <table className="w-full text-sm min-w-[560px]">
      <thead className="text-xs text-muted-foreground bg-muted/20">
        <tr>
          {head.map((h, i) => (
            <th key={h} className={`font-medium px-4 py-2 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.length === 0 ? (
          <tr><td colSpan={head.length} className="text-center py-6 text-muted-foreground">{empty}</td></tr>
        ) : rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((c, ci) => (
              <td key={ci} className={`px-4 py-2 ${ci === 0 ? "font-medium" : "text-right tabular-nums"}`}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
      {footer && rows.length > 0 && (
        <tfoot>
          <tr className="font-semibold bg-muted/30">
            {footer.map((c, ci) => (
              <td key={ci} className={`px-4 py-2 ${ci === 0 ? "" : "text-right tabular-nums"}`}>{c}</td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
