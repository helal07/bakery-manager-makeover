import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import {
  Factory,
  Trash2,
  BarChart3,
  Wheat,
  Recycle,
  History,
  Package,
  AlertTriangle,
  TrendingUp,
  Boxes,
  ArrowRightLeft,
  ChefHat,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { pageTitle } from "@/lib/company-settings";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/production/")({
  head: () => ({ meta: [{ title: pageTitle("Production Dashboard") }] }),
  component: ProductionDashboard,
});

type Preset = "today" | "week" | "month" | "custom";

function rangeFor(preset: Preset, from: string, to: string) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  let start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (preset === "week") start.setDate(start.getDate() - 6);
  else if (preset === "month") start.setDate(start.getDate() - 29);
  else if (preset === "custom") {
    if (from) start = new Date(from + "T00:00:00");
    if (to) {
      const e = new Date(to + "T23:59:59");
      return { start: start.toISOString(), end: e.toISOString() };
    }
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n || 0);
}
function money(n: number) {
  return "৳" + fmt(n);
}
function dayKey(iso: string) {
  return iso.slice(0, 10);
}

const PIE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#94a3b8"];

function ProductionDashboard() {
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  const [production, setProduction] = useState<any[]>([]);
  const [consumption, setConsumption] = useState<any[]>([]);
  const [wastage, setWastage] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [rawStock, setRawStock] = useState<any[]>([]);
  const [prodStock, setProdStock] = useState<any[]>([]);
  const [rawMaterials, setRawMaterials] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);

  const { start, end } = useMemo(() => rangeFor(preset, from, to), [preset, from, to]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    (async () => {
      const [
        prodRes, consRes, wastRes, trRes, rsRes, psRes, rmRes, pRes, recRes,
      ] = await Promise.all([
        sb.from("stock_ledger")
          .select("id, product_id, qty, created_at, products(name, cost)")
          .eq("kind", "production").is("showroom_id", null)
          .gte("created_at", start).lte("created_at", end),
        sb.from("raw_stock_ledger")
          .select("id, material_id, qty, created_at, raw_materials(name, cost)")
          .eq("kind", "production_consume")
          .gte("created_at", start).lte("created_at", end),
        sb.from("wastage_log")
          .select("id, qty, created_at, product_id, material_id, products(name, cost), raw_materials(name, cost)")
          .gte("created_at", start).lte("created_at", end),
        sb.from("transfer_items")
          .select("id, qty, product_id, material_id, transfers!inner(id, status, created_at, source_showroom_id, dest_showroom_id)")
          .gte("transfers.created_at", start).lte("transfers.created_at", end),
        sb.from("raw_material_stock").select("material_id, quantity, showroom_id, raw_materials(name, cost, min_stock)").is("showroom_id", null),
        sb.from("product_stock").select("product_id, quantity, showroom_id, products(name, cost)"),
        sb.from("raw_materials").select("id, name, cost, min_stock, is_active"),
        sb.from("products").select("id, name, cost, is_active"),
        sb.from("stock_ledger")
          .select("id, qty, created_at, products(name)")
          .eq("kind", "production").is("showroom_id", null)
          .order("created_at", { ascending: false }).limit(8),
      ]);
      if (cancel) return;
      setProduction(prodRes.data ?? []);
      setConsumption(consRes.data ?? []);
      setWastage(wastRes.data ?? []);
      setTransfers(trRes.data ?? []);
      setRawStock(rsRes.data ?? []);
      setProdStock(psRes.data ?? []);
      setRawMaterials(rmRes.data ?? []);
      setProducts(pRes.data ?? []);
      setRecent(recRes.data ?? []);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [start, end]);

  // KPIs
  const totalProducedQty = production.reduce((s, r) => s + Number(r.qty || 0), 0);
  const batchIds = new Set(production.map((r: any) => r.id));
  const batchCount = batchIds.size;
  const producedValue = production.reduce(
    (s, r) => s + Number(r.qty || 0) * Number(r.products?.cost ?? 0), 0,
  );

  const consumedValue = consumption.reduce(
    (s, r) => s + Math.abs(Number(r.qty || 0)) * Number(r.raw_materials?.cost ?? 0), 0,
  );

  const wastageQty = wastage.reduce((s, r) => s + Number(r.qty || 0), 0);
  const wastageValue = wastage.reduce((s, r) => {
    const cost = Number(r.products?.cost ?? r.raw_materials?.cost ?? 0);
    return s + Number(r.qty || 0) * cost;
  }, 0);

  const transferOutQty = transfers.reduce((s, r) => s + Number(r.qty || 0), 0);
  const transferCount = new Set(transfers.map((r: any) => r.transfers?.id)).size;

  const rawStockValue = rawStock.reduce(
    (s, r) => s + Number(r.quantity || 0) * Number(r.raw_materials?.cost ?? 0), 0,
  );
  const finishedStockValue = prodStock.reduce(
    (s, r) => s + Number(r.quantity || 0) * Number(r.products?.cost ?? 0), 0,
  );

  const avgCost = totalProducedQty > 0 ? consumedValue / totalProducedQty : 0;

  // Charts
  const dailyProduction = useMemo(() => {
    const map: Record<string, number> = {};
    production.forEach((r: any) => {
      const k = dayKey(r.created_at);
      map[k] = (map[k] || 0) + Number(r.qty || 0);
    });
    return Object.entries(map).sort().map(([date, qty]) => ({ date: date.slice(5), qty }));
  }, [production]);

  const dailyWastage = useMemo(() => {
    const map: Record<string, number> = {};
    wastage.forEach((r: any) => {
      const k = dayKey(r.created_at);
      map[k] = (map[k] || 0) + Number(r.qty || 0);
    });
    return Object.entries(map).sort().map(([date, qty]) => ({ date: date.slice(5), qty }));
  }, [wastage]);

  const productShare = useMemo(() => {
    const map: Record<string, { name: string; qty: number }> = {};
    production.forEach((r: any) => {
      const key = r.product_id;
      const name = r.products?.name ?? "—";
      if (!map[key]) map[key] = { name, qty: 0 };
      map[key].qty += Number(r.qty || 0);
    });
    const arr = Object.values(map).sort((a, b) => b.qty - a.qty);
    const top = arr.slice(0, 5);
    const otherQty = arr.slice(5).reduce((s, r) => s + r.qty, 0);
    if (otherQty > 0) top.push({ name: "Others", qty: otherQty });
    return top;
  }, [production]);

  const topProduct = productShare[0];

  const lowStock = useMemo(() => {
    return rawStock
      .map((r: any) => ({
        name: r.raw_materials?.name ?? "—",
        qty: Number(r.quantity || 0),
        min: Number(r.raw_materials?.min_stock ?? 0),
      }))
      .filter((r) => r.min > 0 && r.qty <= r.min)
      .sort((a, b) => a.qty / (a.min || 1) - b.qty / (b.min || 1))
      .slice(0, 8);
  }, [rawStock]);

  return (
    <AppShell title="Production Dashboard" subtitle="Real-time production, stock ও wastage overview">
      {/* Filter bar */}
      <Card className="p-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["today", "week", "month", "custom"] as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                preset === p ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
              }`}
            >
              {p === "today" ? "Today" : p === "week" ? "Last 7 days" : p === "month" ? "Last 30 days" : "Custom"}
            </button>
          ))}
          {preset === "custom" && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs" />
              <span className="text-xs text-muted-foreground">→</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs" />
            </div>
          )}
          <div className="flex-1" />
          <Link to="/recipes" className="h-8 inline-flex items-center gap-1.5 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90">
            <Factory className="size-3.5" /> Open Workbench
          </Link>
        </div>
      </Card>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi icon={Factory} label="Total Production" value={fmt(totalProducedQty)} sub={`${batchCount} batches · ${money(producedValue)}`} tone="primary" />
        <Kpi icon={Wheat} label="Raw Consumed" value={money(consumedValue)} sub={`Avg cost/unit ${money(avgCost)}`} tone="amber" />
        <Kpi icon={ArrowRightLeft} label="Transfers Out" value={fmt(transferOutQty)} sub={`${transferCount} transfers`} tone="sky" />
        <Kpi icon={Trash2} label="Wastage" value={fmt(wastageQty)} sub={money(wastageValue)} tone="rose" />
        <Kpi icon={Boxes} label="Factory Raw Stock" value={money(rawStockValue)} sub={`${rawStock.length} items`} tone="emerald" />
        <Kpi icon={Package} label="Finished Stock Value" value={money(finishedStockValue)} sub={`${prodStock.length} rows (all locations)`} tone="violet" />
        <Kpi icon={TrendingUp} label="Top Product" value={topProduct?.name ?? "—"} sub={topProduct ? `${fmt(topProduct.qty)} units` : "No production"} tone="primary" />
        <Kpi icon={AlertTriangle} label="Low Stock Alerts" value={String(lowStock.length)} sub="Raw materials ≤ min" tone={lowStock.length ? "rose" : "emerald"} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-4 lg:col-span-2">
          <div className="text-sm font-semibold mb-2">Daily Production</div>
          <div className="h-56">
            {dailyProduction.length === 0 ? (
              <EmptyChart label={loading ? "Loading…" : "No production in this range"} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyProduction}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="qty" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold mb-2">Production Share</div>
          <div className="h-56">
            {productShare.length === 0 ? (
              <EmptyChart label="No data" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={productShare} dataKey="qty" nameKey="name" innerRadius={40} outerRadius={70}>
                    {productShare.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card className="p-4">
          <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Trash2 className="size-4 text-rose-500" /> Daily Wastage
          </div>
          <div className="h-48">
            {dailyWastage.length === 0 ? (
              <EmptyChart label="No wastage" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyWastage}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="qty" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <AlertTriangle className="size-4 text-amber-500" /> Low Stock (Raw Materials)
            </div>
          </div>
          {lowStock.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">সব stock ঠিক আছে ✓</div>
          ) : (
            <div className="divide-y divide-border">
              {lowStock.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0 truncate">{r.name}</div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">min {fmt(r.min)}</span>
                    <Badge tone={r.qty === 0 ? "danger" : "warning"}>{fmt(r.qty)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent batches */}
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Recent Batches</h3>
          </div>
          <Link to="/production/batches" className="text-xs text-primary hover:underline">View all →</Link>
        </div>
        {recent.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            এখনো কোনো batch হয়নি —{" "}
            <Link to="/production/produce" className="text-primary hover:underline">প্রথম batch বানান</Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recent.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.products?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {(r.id as string).slice(0, 8).toUpperCase()} · {(r.created_at as string).slice(0, 10)}
                  </div>
                </div>
                <Badge tone="success">+{fmt(Number(r.qty || 0))}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <QuickLink to="/production/wastage" icon={Trash2} label="Wastage Log" />
        <QuickLink to="/production/repurpose" icon={Recycle} label="Wastage Management" />
        <QuickLink to="/production/batches" icon={History} label="Batches" />
        <QuickLink to="/production/cost-report" icon={BarChart3} label="Cost Report" />
        <QuickLink to="/production/consumption-report" icon={Wheat} label="Consumption" />
      </div>
    </AppShell>
  );
}

function Kpi({
  icon: Icon, label, value, sub, tone = "primary",
}: {
  icon: any; label: string; value: string; sub?: string;
  tone?: "primary" | "amber" | "sky" | "rose" | "emerald" | "violet";
}) {
  const toneMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    amber: "bg-amber-500/10 text-amber-600",
    sky: "bg-sky-500/10 text-sky-600",
    rose: "bg-rose-500/10 text-rose-600",
    emerald: "bg-emerald-500/10 text-emerald-600",
    violet: "bg-violet-500/10 text-violet-600",
  };
  return (
    <Card className="p-3">
      <div className="flex items-start gap-2.5">
        <div className={`size-9 rounded-lg grid place-items-center shrink-0 ${toneMap[tone]}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{label}</div>
          <div className="text-base font-semibold truncate">{value}</div>
          {sub && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{sub}</div>}
        </div>
      </div>
    </Card>
  );
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link to={to} className="group">
      <Card className="p-3 hover:border-primary/60 transition">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
            <Icon className="size-4" />
          </div>
          <div className="text-xs font-medium truncate">{label}</div>
        </div>
      </Card>
    </Link>
  );
}

function EmptyChart({ label }: { label: string }) {
  return <div className="h-full grid place-items-center text-xs text-muted-foreground">{label}</div>;
}
