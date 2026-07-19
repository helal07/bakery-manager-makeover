import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import {
import { pageTitle } from "@/lib/company-settings";
  ShoppingBag, Cake, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Plus, ScanBarcode, Flame, Wheat, Search,
  X, Trash2, Minus, Cookie, Croissant, Check, Clock, PieChart, UserPlus,
  Printer, Share2, ExternalLink,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { ProductCategory } from "@/lib/product-types";
type CustomerGroup = { id: string; name: string; discountPct: number };
import { loadProducts, type Product } from "@/lib/product-store";
import { loadRecipes, type RecipeMap } from "@/lib/recipe-store";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: (s: Record<string, unknown>) => ({ sale: s.sale ? 1 : undefined }),
  head: () => ({
    meta: [
      { title: pageTitle("Dashboard") },
      { name: "description", content: "Unified dashboard for multi-branch commercial bakery operations." },
    ],
  }),
  component: Dashboard,
});

function useDashboardData() {
  const { currentShowroomId } = useShowroomScope();
  const loc = currentShowroomId;
  const [state, setState] = useState({
    today: 0, week: 0, prevWeek: 0, due: 0, low: 0, tickets: 0,
    hourly: [] as { h: string; s: number }[],
    daily: [] as { day: string; sales: number }[],
    loading: true,
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const now = new Date();
      const start = new Date(now); start.setDate(now.getDate() - 13); start.setHours(0, 0, 0, 0);
      const salesQ = loc === null
        ? sb.from("sales").select("total,paid,due,created_at").is("showroom_id", null).gte("created_at", start.toISOString())
        : sb.from("sales").select("total,paid,due,created_at").eq("showroom_id", loc).gte("created_at", start.toISOString());
      const stockQ = loc === null
        ? sb.from("product_stock").select("quantity,min_stock").is("showroom_id", null)
        : sb.from("product_stock").select("quantity,min_stock").eq("showroom_id", loc);
      const [{ data: sales }, { data: stock }] = await Promise.all([salesQ, stockQ]);
      if (cancelled) return;
      const todayStr = now.toDateString();
      const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
      let today = 0, tickets = 0, week = 0, prevWeek = 0, due = 0;
      const byDay = new Map<string, number>();
      const byHour = new Map<number, number>();
      for (const s of (sales ?? []) as any[]) {
        const d = new Date(s.created_at);
        const total = Number(s.total ?? 0);
        due += Number(s.due ?? 0);
        const key = d.toISOString().slice(0, 10);
        byDay.set(key, (byDay.get(key) ?? 0) + total);
        if (d.toDateString() === todayStr) {
          today += total; tickets += 1;
          byHour.set(d.getHours(), (byHour.get(d.getHours()) ?? 0) + total);
        }
        if (d >= weekAgo) week += total;
        else prevWeek += total;
      }
      const daily: { day: string; sales: number }[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now); d.setDate(now.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        daily.push({ day: d.toLocaleDateString(undefined, { weekday: "short" }), sales: byDay.get(key) ?? 0 });
      }
      const hourly: { h: string; s: number }[] = [];
      for (let h = 6; h <= 22; h++) hourly.push({ h: `${h}`, s: byHour.get(h) ?? 0 });
      const low = ((stock ?? []) as any[]).filter((r) => Number(r.quantity) <= Number(r.min_stock ?? 0)).length;
      setState({ today, week, prevWeek, due, low, tickets, hourly, daily, loading: false });
    })();
    return () => { cancelled = true; };
  }, [loc]);
  return state;
}

function Dashboard() {
  const { sale } = Route.useSearch();
  const navigate = Route.useNavigate();
  const saleOpen = !!sale;
  const setSaleOpen = (v: boolean) =>
    navigate({ search: v ? { sale: 1 } : {}, replace: true });
  const [addOpen, setAddOpen] = useState(false);
  const data = useDashboardData();
  const delta = data.prevWeek > 0
    ? `${(((data.week - data.prevWeek) / data.prevWeek) * 100).toFixed(0)}%`
    : "—";
  const up = data.week >= data.prevWeek;
  const kpis = [
    { label: "Today's Sales", value: `৳${data.today.toLocaleString()}`, delta: `${data.tickets} tx`, up: true, icon: ShoppingBag, hint: data.tickets ? "recorded today" : "no sales yet" },
    { label: "This Week", value: `৳${data.week.toLocaleString()}`, delta, up, icon: Flame, hint: "vs. previous 7 days" },
    { label: "Outstanding Due", value: `৳${data.due.toLocaleString()}`, delta: "—", up: data.due === 0, icon: Cake, hint: data.due ? "collect from customers" : "all clear" },
    { label: "Low Stock Alerts", value: `${data.low} items`, delta: "—", up: data.low === 0, icon: AlertTriangle, hint: data.low ? "at or below min" : "all good" },
  ];

  return (
    <AppShell
      title="Dashboard"
      subtitle="Overview of your bakery operations"
      actions={
        <>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-sm hover:bg-accent"
          >
            <Plus className="size-4" /> Add Item
          </button>
          <Link
            to="/pos"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-base font-semibold hover:bg-primary/90 shadow-md"
          >
            <ScanBarcode className="size-5" /> New Sale
          </Link>
        </>
      }
    >
      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="p-5">
              <div className="flex items-start justify-between">
                <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
                  <Icon className="size-4" />
                </div>
                <span className={`inline-flex items-center gap-1 text-xs ${k.up ? "text-[color:var(--success)]" : "text-destructive"}`}>
                  {k.up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                  {k.delta}
                </span>
              </div>
              <div className="mt-4 text-2xl font-semibold tracking-tight">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.label} · {k.hint}</div>
            </Card>
          );
        })}
      </div>

      {/* Row 2 — Hourly pulse + Production gauge + Today's bake plan */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-5">
        <Card className="p-5 lg:col-span-3">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="text-sm font-semibold">Today's sales pulse</h2>
              <p className="text-xs text-muted-foreground">Hourly revenue · all branches</p>
            </div>
              <div className="text-right">
                <div className="text-lg font-semibold tracking-tight">৳{data.today.toLocaleString()}</div>
                <div className="text-[11px] text-muted-foreground">{data.tickets ? `${data.tickets} tickets today` : "No sales today"}</div>
              </div>
          </div>
          <div className="h-52 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.hourly} margin={{ top: 6, right: 6, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="pulse" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="h" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="s" stroke="var(--primary)" strokeWidth={2.5} fill="url(#pulse)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-border text-center">
            <div><div className="text-[11px] text-muted-foreground">Tickets</div><div className="text-sm font-semibold">{data.tickets}</div></div>
            <div><div className="text-[11px] text-muted-foreground">Avg basket</div><div className="text-sm font-semibold">৳{data.tickets ? Math.round(data.today / data.tickets).toLocaleString() : 0}</div></div>
            <div><div className="text-[11px] text-muted-foreground">Peak hour</div><div className="text-sm font-semibold">{data.hourly.reduce((a, b) => (b.s > a.s ? b : a), { h: "—", s: 0 }).h}</div></div>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-1">
          <h2 className="text-sm font-semibold">Weekly trend</h2>
          <p className="text-xs text-muted-foreground">Sales</p>
          <div className="space-y-1.5 mt-4">
            {data.daily.slice(-7).map((d, i) => {
              const last7 = data.daily.slice(-7);
              const max = Math.max(1, ...last7.map((x) => x.sales));
              const pct = (d.sales / max) * 100;
              const key = `${d.day}-${i}`;
              return (
                <div key={key} className="flex items-center gap-2 text-[11px]">
                  <span className="w-6 text-muted-foreground">{d.day}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-12 text-right tabular-nums">৳{(d.sales / 1000).toFixed(1)}k</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {saleOpen && <QuickSaleModal onClose={() => setSaleOpen(false)} />}
      {addOpen && <AddItemModal onClose={() => setAddOpen(false)} />}
    </AppShell>
  );
}

const cats: (ProductCategory | "All")[] = ["All", "Cake", "Bread", "Biscuit", "Pastry"];

type Customer = { id: string; name: string; phone?: string };
const seedCustomers: Customer[] = [
  { id: "walkin", name: "Walk-in Customer" },
];

export function QuickSaleModal({ onClose }: { onClose: () => void }) {
  const [txId] = useState(() => `TX-${Math.floor(Math.random() * 9000) + 1000}`);
  const { currentShowroomId } = useShowroomScope();
  const loc = currentShowroomId;
  const [cat, setCat] = useState<(typeof cats)[number]>("All");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [recipeMap, setRecipeMap] = useState<RecipeMap>({});
  const [loadingProducts, setLoadingProducts] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ps, rm] = await Promise.all([loadProducts(loc ?? null), loadRecipes()]);
        if (cancelled) return;
        setProducts(ps);
        setRecipeMap(rm);
      } catch {
        /* toast handled elsewhere */
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loc]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<"cash" | "due" | "partial">("cash");
  const [customers, setCustomers] = useState<Customer[]>(seedCustomers);
  const [customerId, setCustomerId] = useState<string>("walkin");
  const [groups, setGroups] = useState<CustomerGroup[]>([{ id: "none", name: "No Group", discountPct: 0 }]);
  const [groupId, setGroupId] = useState<string>("none");
  useEffect(() => {
    supabase
      .from("customer_groups")
      .select("id, name, discount_pct, is_default")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("discount_pct", { ascending: true })
      .then(({ data, error }) => {
        if (error || !data) return;
        const mapped = data.map((r) => ({
          id: r.id as string,
          name: r.name as string,
          discountPct: Number(r.discount_pct ?? 0),
        }));
        if (!mapped.length) return;
        setGroups(mapped);
        const def = data.find((r) => r.is_default);
        if (def) setGroupId(def.id as string);
      });
  }, []);
  const [addCustOpen, setAddCustOpen] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", phone: "" });
  const [partialPaid, setPartialPaid] = useState<number>(0);
  const [done, setDone] = useState<null | { id: string; mode: string; paid: number; due: number; total: number }>(null);
  const customer = customers.find((c) => c.id === customerId) ?? customers[0];
  const isWalkIn = customer.id === "walkin";
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) =>
      (cat === "All" || p.category === cat) &&
      (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
    );
  }, [cat, query, products]);
  const items = Object.entries(cart).map(([id, qty]) => ({ p: products.find((x) => x.id === id)!, qty })).filter((x) => x.p);
  const subtotal = items.reduce((s, { p, qty }) => s + p.price * qty, 0);
  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  const discountPct = group?.discountPct ?? 0;
  const discount = +((subtotal * discountPct) / 100).toFixed(2);
  const afterDiscount = +(subtotal - discount).toFixed(2);
  const tax = +(afterDiscount * 0.05).toFixed(2);
  const total = +(afterDiscount + tax).toFixed(2);
  const paid = mode === "cash" ? total : mode === "partial" ? Math.min(partialPaid, total) : 0;
  const due = +(total - paid).toFixed(2);
  const add = (id: string, n = 1) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + n) }));
  const canComplete =
    items.length > 0 &&
    (mode === "cash" ||
      (mode === "due" && !isWalkIn) ||
      (mode === "partial" && !isWalkIn && partialPaid > 0 && partialPaid < total));

  function saveCustomer() {
    const name = newCust.name.trim();
    if (!name) return;
    const c: Customer = { id: `c${Date.now()}`, name, phone: newCust.phone.trim() || undefined };
    setCustomers((prev) => [...prev, c]);
    setCustomerId(c.id);
    setNewCust({ name: "", phone: "" });
    setAddCustOpen(false);
  }

  async function complete() {
    if (!canComplete) return;
    const id = `TX-${Math.floor(Math.random() * 9000) + 1000}`;
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { data: sale, error: sErr } = await sb
        .from("sales")
        .insert({
          showroom_id: loc,
          cashier_id: userRes.user?.id ?? null,
          customer_name: customer.name,
          customer_phone: customer.phone ?? null,
          subtotal, discount, tax, total, paid, due,
          payment_mode: mode,
          external_ref: id,
        })
        .select("id")
        .single();
      if (sErr || !sale) throw sErr ?? new Error("insert failed");
      const lines = items.map(({ p, qty }) => ({
        sale_id: sale.id,
        product_id: p.id,
        product_name: p.name,
        product_sku: p.sku,
        qty,
        unit_price: p.price,
        line_total: +(p.price * qty).toFixed(2),
      }));
      await sb.from("sale_items").insert(lines);
      for (const { p, qty } of items) {
        await sb.rpc("commit_stock_movement", {
          _product_id: p.id, _showroom_id: loc, _qty: -qty,
          _kind: "sale", _ref_type: "sale", _ref_id: sale.id, _note: null,
        });
        const recipe = recipeMap[p.id];
        if (!recipe) continue;
        for (const ing of recipe) {
          await sb.rpc("commit_raw_stock_movement", {
            _material_id: ing.materialId, _showroom_id: loc,
            _qty: -Math.abs(ing.qty * qty),
            _kind: "production_consume",
            _ref_type: "sale", _ref_id: sale.id, _note: null,
          });
        }
      }
    } catch (e: any) {
      console.warn("[sales] DB write failed:", e?.message ?? e);
    }
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(
          `invoice:${id}`,
          JSON.stringify({
            customer: { name: customer.name, phone: customer.phone ?? "" },
            branch: "Main Branch",
            date: new Date().toISOString(),
            mode,
            items: items.map(({ p, qty }) => ({ name: p.name, sku: p.sku, price: p.price, qty })),
            subtotal, tax, total, paid, due,
          }),
        );
      } catch { /* storage unavailable */ }
    }
    setDone({ id, mode, paid, due, total });
  }

  function buildInvoiceUrl(id: string) {
    const params = new URLSearchParams({
      c: customer.name,
      d: new Date().toLocaleDateString(),
      b: "Main Branch",
      i: String(items.reduce((s, x) => s + x.qty, 0)),
      t: String(total),
      p: String(paid),
    });
    return `/invoice/${id}?${params.toString()}`;
  }

  async function shareInvoice(id: string) {
    const url = window.location.origin + buildInvoiceUrl(id);
    const shareData = { title: `Invoice ${id}`, text: `Invoice ${id} — ৳${total.toFixed(2)}`, url };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(url); alert("Invoice link copied to clipboard"); }
    } catch { /* user cancelled */ }
  }

  function printInvoice(id: string) {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = buildInvoiceUrl(id);
    iframe.onload = () => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) return;
      frameWindow.focus();
      setTimeout(() => {
        frameWindow.print();
        setTimeout(() => iframe.remove(), 1000);
      }, 250);
    };
    document.body.appendChild(iframe);
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-[60] bg-foreground/50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-card rounded-xl shadow-2xl w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
          <div className="size-12 mx-auto rounded-full bg-[color:var(--success)]/15 text-[color:var(--success)] grid place-items-center mb-3">
            <Check className="size-6" />
          </div>
          <h3 className="font-semibold text-lg">Sale completed</h3>
          <p className="text-xs text-muted-foreground">Receipt #{done.id}</p>
          <div className="mt-4 rounded-lg border border-border p-3 text-sm space-y-1 text-left">
            <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span>৳{done.total.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Paid ({done.mode})</span><span>৳{done.paid.toFixed(2)}</span></div>
            <div className="flex justify-between font-medium"><span>Due</span><span className={done.due > 0 ? "text-destructive" : ""}>৳{done.due.toFixed(2)}</span></div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button onClick={() => shareInvoice(done.id)} className="inline-flex items-center justify-center gap-1.5 py-2 rounded-md border border-border text-sm hover:bg-accent">
              <Share2 className="size-4" /> Share
            </button>
            <button onClick={() => printInvoice(done.id)} className="inline-flex items-center justify-center gap-1.5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
              <Printer className="size-4" /> Print
            </button>
          </div>
          <a href={buildInvoiceUrl(done.id)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-md text-xs text-muted-foreground hover:text-foreground">
            <ExternalLink className="size-3.5" /> Open invoice
          </a>
          <button onClick={onClose} className="mt-1 w-full py-1.5 text-xs text-muted-foreground hover:text-foreground">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-foreground/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanBarcode className="size-4 text-primary" />
            <h2 className="font-semibold">New Sale · Quick Checkout</h2>
            <Badge tone="primary">#{txId}</Badge>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-md hover:bg-accent"><X className="size-4" /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] flex-1 overflow-hidden">
          <div className="p-4 overflow-auto border-r border-border">
            <div className="relative mb-3">
              <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products by name or SKU…"
                className="w-full pl-8 pr-3 py-2 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {cats.map((c) => (
                <button key={c} onClick={() => setCat(c)}
                  className={`px-3 py-1.5 rounded-full text-xs border ${cat === c ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-accent"}`}>{c}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {list.length === 0 && (
                <div className="col-span-full text-center text-sm text-muted-foreground py-8">No products match "{query}"</div>
              )}
              {list.map((p) => (
                <button key={p.id} onClick={() => add(p.id, 1)}
                  className="text-left p-2.5 rounded-lg border border-border bg-card hover:border-primary/50 transition">
                  <div className="aspect-[4/3] rounded-md bg-gradient-to-br from-accent to-secondary mb-2 grid place-items-center text-primary/70">
                    {p.category === "Cake" ? <Cake className="size-6" /> : p.category === "Bread" ? <Wheat className="size-6" /> : p.category === "Pastry" ? <Croissant className="size-6" /> : <Cookie className="size-6" />}
                  </div>
                  <div className="text-xs font-medium leading-tight truncate">{p.name}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground">{p.sku}</span>
                    <span className="text-xs font-semibold">৳{p.price.toFixed(2)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto p-4">
              <div className="text-xs font-semibold text-muted-foreground mb-2">CUSTOMER</div>
              <div className="mb-3 flex gap-1.5">
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="flex-1 px-2.5 py-2 rounded-md border border-border bg-background text-xs outline-none focus:border-primary"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.phone ? ` · ${c.phone}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setAddCustOpen((v) => !v)}
                  title="Add customer"
                  className="size-9 grid place-items-center rounded-md border border-border hover:bg-accent text-primary shrink-0"
                >
                  <UserPlus className="size-4" />
                </button>
              </div>
              {addCustOpen && (
                <div className="mb-3 p-2.5 rounded-md border border-primary/40 bg-primary/5 space-y-2">
                  <input
                    autoFocus
                    value={newCust.name}
                    onChange={(e) => setNewCust({ ...newCust, name: e.target.value })}
                    placeholder="Customer name"
                    className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs outline-none focus:border-primary"
                  />
                  <input
                    value={newCust.phone}
                    onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })}
                    placeholder="Phone (optional)"
                    className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs outline-none focus:border-primary"
                  />
                  <div className="flex gap-1.5">
                    <button onClick={() => { setAddCustOpen(false); setNewCust({ name: "", phone: "" }); }} className="flex-1 py-1 rounded border border-border text-[11px] hover:bg-accent">Cancel</button>
                    <button onClick={saveCustomer} disabled={!newCust.name.trim()} className="flex-1 py-1 rounded bg-primary text-primary-foreground text-[11px] disabled:opacity-50">Save</button>
                  </div>
                </div>
              )}
              <div className="text-xs font-semibold text-muted-foreground mb-2">DISCOUNT GROUP</div>
              <div className="mb-3">
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-md border border-border bg-background text-xs outline-none focus:border-primary"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}{g.discountPct ? ` · ${g.discountPct}% off` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">CART</div>
              {items.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">Tap items to add</div>
              ) : (
                <div className="divide-y divide-border">
                  {items.map(({ p, qty }) => (
                    <div key={p.id} className="py-2.5 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">৳{p.price.toFixed(2)} × {qty}</div>
                      </div>
                      <button onClick={() => add(p.id, -1)} className="size-6 grid place-items-center rounded border border-border hover:bg-accent"><Minus className="size-3" /></button>
                      <span className="w-5 text-center text-sm">{qty}</span>
                      <button onClick={() => add(p.id, 1)} className="size-6 grid place-items-center rounded border border-border hover:bg-accent"><Plus className="size-3" /></button>
                      <button onClick={() => setCart((c) => { const n = { ...c }; delete n[p.id]; return n; })} className="size-6 grid place-items-center rounded text-destructive hover:bg-destructive/10"><Trash2 className="size-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-border p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>৳{subtotal.toFixed(2)}</span></div>
              {discount > 0 && (
                <div className="flex justify-between text-[color:var(--success)]">
                  <span>Discount ({discountPct}%)</span><span>−৳{discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">VAT (5%)</span><span>৳{tax.toFixed(2)}</span></div>
              <div className="flex justify-between font-semibold text-base pt-1 border-t border-border"><span>Total</span><span>৳{total.toFixed(2)}</span></div>

              <div className="pt-2">
                <div className="text-[11px] font-medium text-muted-foreground mb-1.5">Payment mode</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <ModeBtn active={mode === "cash"} onClick={() => setMode("cash")} icon={Check} label="Cash" />
                  <ModeBtn active={mode === "due"} onClick={() => setMode("due")} icon={Clock} label="Due" />
                  <ModeBtn active={mode === "partial"} onClick={() => setMode("partial")} icon={PieChart} label="Partial" />
                </div>
              </div>

              {(mode === "due" || mode === "partial") && (
                isWalkIn && (
                  <div className="text-[11px] text-destructive bg-destructive/10 rounded-md px-2 py-1.5">
                    Select or add a customer for {mode} sale
                  </div>
                )
              )}
              {mode === "partial" && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground flex-1">Amount paid</span>
                  <span className="text-xs">৳</span>
                  <input
                    type="number"
                    min={0}
                    max={total}
                    value={partialPaid || ""}
                    onChange={(e) => setPartialPaid(+e.target.value || 0)}
                    placeholder="0.00"
                    className="w-24 px-2 py-1 rounded border border-border bg-background text-xs text-right outline-none focus:border-primary"
                  />
                </div>
              )}

              <div className="flex justify-between text-[11px] pt-1">
                <span className="text-muted-foreground">Paid ৳{paid.toFixed(2)}</span>
                <span className={due <= 0 ? "text-[color:var(--success)]" : "text-destructive"}>
                  {due <= 0 ? "Fully paid" : `Due ৳${due.toFixed(2)}`}
                </span>
              </div>

              <button
                onClick={complete}
                disabled={!canComplete}
                className="mt-2 w-full py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mode === "cash" ? "Complete Cash Sale" : mode === "due" ? "Save as Due" : "Complete Partial Sale"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 py-2 rounded-md border text-[11px] font-medium transition ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background border-border hover:bg-accent"
      }`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function AddItemModal({ onClose }: { onClose: () => void }) {
  const [cats, setCats] = useState<string[]>(["Cake", "Bread", "Biscuit", "Pastry"]);
  const [cat, setCat] = useState("Cake");
  const [addingCat, setAddingCat] = useState(false);
  const [newCat, setNewCat] = useState("");

  function addCategory() {
    const v = newCat.trim();
    if (!v || cats.includes(v)) return;
    setCats([...cats, v]);
    setCat(v);
    setNewCat("");
    setAddingCat(false);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-foreground/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">Add new product</h2>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-md hover:bg-accent"><X className="size-4" /></button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <Field label="Product name"><input className="qi" placeholder="e.g. Pistachio Éclair" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU"><input className="qi" placeholder="BK-1042" /></Field>
            <Field label="Category">
              <div className="flex gap-1.5">
                <select value={cat} onChange={(e) => setCat(e.target.value)} className="qi flex-1">
                  {cats.map((c) => <option key={c}>{c}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setAddingCat((v) => !v)}
                  title="Add category"
                  className="size-9 grid place-items-center rounded-md border border-border hover:bg-accent text-primary shrink-0"
                >
                  <Plus className="size-4" />
                </button>
              </div>
              {addingCat && (
                <div className="mt-2 flex gap-1.5">
                  <input
                    autoFocus
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }}
                    placeholder="New category name"
                    className="qi flex-1"
                  />
                  <button type="button" onClick={addCategory} className="px-3 rounded-md bg-primary text-primary-foreground text-xs">Add</button>
                </div>
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
          <Field label="Price (৳)"><input type="number" className="qi" placeholder="0.00" /></Field>
            <Field label="Opening stock"><input type="number" className="qi" placeholder="0" /></Field>
          </div>
          <Field label="Low-stock threshold"><input type="number" className="qi" placeholder="10" /></Field>
        </div>
        <div className="px-5 py-3.5 border-t border-border flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent">Cancel</button>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">Save product</button>
        </div>
        <style>{`.qi{width:100%;padding:.5rem .75rem;border-radius:.5rem;border:1px solid var(--border);background:var(--background);font-size:.875rem;outline:none}.qi:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
