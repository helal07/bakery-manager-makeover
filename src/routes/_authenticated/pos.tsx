import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ScanBarcode, Search, Plus, Minus, Trash2, Check, Clock, PieChart,
  X, Keyboard, ArrowLeft, User, Users, Pause, PlayCircle, DollarSign,
  Lock, Unlock, Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loadProducts, type Product } from "@/lib/product-store";
import { loadRecipes, type RecipeMap } from "@/lib/recipe-store";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { loadCategories, type ProductCategory } from "@/lib/product-types";
import { getCached, refresh, invalidate } from "@/lib/pos-cache";
import {
  getOpenRegister, openRegister, closeRegister, summarizeRegister,
  listHeldSales, holdSale, deleteHeldSale,
  type RegisterSession, type HeldSaleRow,
} from "@/lib/pos-v7-store";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({ meta: [{ title: "POS · Muzahid Food" }] }),
  component: PosPage,
});

type Mode = "cash" | "credit" | "multi";
type PayMethod = "cash" | "card" | "mobile" | "bank" | "cheque" | "other";
type Tender = { method: PayMethod; amount: number; reference?: string };
type CustomerLite = { id: string; name: string; phone: string | null; group_id: string | null };
type GroupLite = { id: string; name: string; discount_pct: number; mode: string | null; selling_price_group_id: string | null };

const METHOD_LABEL: Record<PayMethod, string> = {
  cash: "Cash", card: "Card", mobile: "Mobile Banking",
  bank: "Bank Transfer", cheque: "Cheque", other: "Other",
};

function PosPage() {
  const navigate = useNavigate();
  const { currentShowroomId } = useShowroomScope();
  const loc = currentShowroomId ?? null;

  const [products, setProducts] = useState<Product[]>([]);
  const [recipeMap, setRecipeMap] = useState<RecipeMap>({});
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<ProductCategory | "All">("All");
  const [query, setQuery] = useState("");
  const [scan, setScan] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<Mode>("cash");
  const [multiPayOpen, setMultiPayOpen] = useState(false);
  const [tenders, setTenders] = useState<Tender[]>([]);

  // Customer
  const [customerName, setCustomerName] = useState("Walk-in Customer");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [custQuery, setCustQuery] = useState("");
  const [custResults, setCustResults] = useState<CustomerLite[]>([]);
  const [custOpen, setCustOpen] = useState(false);

  // Groups
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [groupPct, setGroupPct] = useState(0);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [groupPrices, setGroupPrices] = useState<Record<string, number>>({});

  // Register
  const [register, setRegister] = useState<RegisterSession | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [closeRegOpen, setCloseRegOpen] = useState(false);

  // Held
  const [held, setHeld] = useState<HeldSaleRow[]>([]);
  const [recallOpen, setRecallOpen] = useState(false);

  const [saving, setSaving] = useState(false);

  const scanRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const custWrapRef = useRef<HTMLDivElement>(null);

  // Load groups + register + held
  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from("customer_groups")
        .select("id,name,discount_pct,mode,selling_price_group_id")
        .order("name");
      setGroups((data ?? []) as GroupLite[]);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try { setRegister(await getOpenRegister(loc)); } catch { /* ignore */ }
      try { setHeld(await listHeldSales(loc)); } catch { /* ignore */ }
    })();
  }, [loc]);

  const applyGroup = async (groupId: string | null) => {
    if (!groupId) { setGroupPct(0); setGroupName(null); setGroupPrices({}); return; }
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    setGroupName(g.name);
    if (g.mode === "price_group" && g.selling_price_group_id) {
      setGroupPct(0);
      const { data: rows } = await sb
        .from("product_selling_prices")
        .select("product_id,price")
        .eq("selling_price_group_id", g.selling_price_group_id);
      const map: Record<string, number> = {};
      for (const r of rows ?? []) map[r.product_id as string] = Number(r.price);
      setGroupPrices(map);
    } else {
      setGroupPct(Number(g.discount_pct ?? 0));
      setGroupPrices({});
    }
  };
  useEffect(() => { applyGroup(selectedGroupId || null); /* eslint-disable-next-line */ }, [selectedGroupId, groups]);

  // Customer search
  useEffect(() => {
    if (!custOpen) return;
    const q = custQuery.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      let query = sb.from("customers").select("id,name,phone,group_id").order("name").limit(10);
      if (q.length >= 1) {
        const safe = q.replace(/[,()"']/g, " ").trim();
        if (safe) query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`);
      }
      const { data, error } = await query;
      if (cancelled) return;
      if (error) { toast.error(`Customer search failed: ${error.message}`); setCustResults([]); return; }
      setCustResults((data ?? []) as CustomerLite[]);
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [custQuery, custOpen]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (custWrapRef.current && !custWrapRef.current.contains(e.target as Node)) setCustOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pickCustomer = (c: CustomerLite) => {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone ?? "");
    setCustQuery(`${c.name}${c.phone ? " · " + c.phone : ""}`);
    setCustOpen(false);
    setSelectedGroupId(c.group_id ?? "");
  };

  const resetCustomer = () => {
    setCustomerId(null);
    setCustomerName("Walk-in Customer");
    setCustomerPhone("");
    setCustQuery("");
    setSelectedGroupId("");
  };

  // Products
  useEffect(() => {
    let cancelled = false;
    const pKey = `pos:products:${loc ?? "all"}`;
    const rKey = `pos:recipes`;
    const cKey = `pos:categories`;
    const cachedP = getCached<Product[]>(pKey);
    const cachedR = getCached<RecipeMap>(rKey);
    const cachedC = getCached<ProductCategory[]>(cKey);
    if (cachedP) setProducts(cachedP);
    if (cachedR) setRecipeMap(cachedR);
    if (cachedC) setCategories(cachedC);
    setLoading(!cachedP);
    (async () => {
      try {
        const [ps, rm, cs] = await Promise.all([
          refresh(pKey, () => loadProducts(loc)),
          refresh(rKey, () => loadRecipes()),
          refresh(cKey, () => loadCategories()),
        ]);
        if (cancelled) return;
        setProducts(ps); setRecipeMap(rm); setCategories(cs);
      } catch (e: any) {
        if (!cachedP) toast.error(e?.message ?? "Failed to load products");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loc]);

  useEffect(() => { scanRef.current?.focus(); }, []);

  const skuIndex = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.sku.toLowerCase(), p);
    return m;
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (cat === "All" || p.category === cat) &&
        (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)),
    );
  }, [products, cat, query]);

  useEffect(() => { setCursor(0); }, [cat, query]);

  const priceFor = (p: Product) => {
    if (groupPrices[p.id] != null) return +groupPrices[p.id].toFixed(2);
    return +(p.price * (1 + groupPct / 100)).toFixed(2);
  };
  const items = Object.entries(cart)
    .map(([id, qty]) => ({ p: products.find((x) => x.id === id)!, qty }))
    .filter((x) => x.p);
  const subtotal = items.reduce((s, { p, qty }) => s + priceFor(p) * qty, 0);
  const tax = +(subtotal * 0.05).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);

  // Payment computation per Ultimate-POS logic
  const multiPaid = tenders.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const paid = mode === "cash" ? total : mode === "credit" ? 0 : Math.min(multiPaid, total);
  const due = +(total - paid).toFixed(2);
  const isWalkIn = !customerId;

  const canComplete =
    items.length > 0 && !saving &&
    (mode === "cash" ||
      (mode === "credit" && !isWalkIn) ||
      (mode === "multi" && multiPaid > 0 && (due <= 0 || !isWalkIn)));

  const add = (id: string, n = 1) =>
    setCart((c) => {
      const next = { ...c, [id]: Math.max(0, (c[id] || 0) + n) };
      if (next[id] === 0) delete next[id];
      return next;
    });
  const clearCart = () => { setCart({}); setTenders([]); };

  const handleScan = () => {
    const code = scan.trim();
    if (!code) return;
    const hit = skuIndex.get(code.toLowerCase());
    if (hit) { add(hit.id, 1); toast.success(`Added ${hit.name}`, { duration: 1200 }); }
    else toast.error(`No product for "${code}"`);
    setScan("");
    scanRef.current?.focus();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
      if (e.key === "F2") { e.preventDefault(); scanRef.current?.focus(); scanRef.current?.select(); return; }
      if (e.key === "F4") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return; }
      if (e.key === "F9") { e.preventDefault(); if (canComplete) void complete(); return; }
      if (e.key === "F7") { e.preventDefault(); if (items.length) void handleHold(); return; }
      if (e.key === "F8") { e.preventDefault(); setRecallOpen(true); return; }
      if (e.key === "Escape" && !inField) { e.preventDefault(); clearCart(); return; }
      if (!inField) {
        if (e.key === "ArrowRight") { e.preventDefault(); setCursor((c) => Math.min(filtered.length - 1, c + 1)); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
        else if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(filtered.length - 1, c + 4)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 4)); }
        else if (e.key === "Enter") {
          const p = filtered[cursor];
          if (p) { e.preventDefault(); add(p.id, 1); }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, cursor, canComplete, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleHold() {
    try {
      await holdSale(
        loc, customerId, null,
        { customerId, customerName, customerPhone, cart, selectedGroupId },
        items.length, total,
      );
      toast.success("Sale held");
      clearCart();
      resetCustomer();
      setHeld(await listHeldSales(loc));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to hold sale");
    }
  }

  async function recallHeld(row: HeldSaleRow) {
    const s = row.snapshot;
    setCart(s.cart ?? {});
    if (s.customerId) {
      setCustomerId(s.customerId);
      setCustomerName(s.customerName);
      setCustomerPhone(s.customerPhone);
      setCustQuery(`${s.customerName}${s.customerPhone ? " · " + s.customerPhone : ""}`);
      setSelectedGroupId(s.selectedGroupId ?? "");
    } else {
      resetCustomer();
    }
    await deleteHeldSale(row.id);
    setHeld(await listHeldSales(loc));
    setRecallOpen(false);
    toast.success("Sale recalled");
  }

  async function complete() {
    if (!canComplete) return;
    setSaving(true);
    const externalRef = `TX-${Math.floor(Math.random() * 9000) + 1000}`;
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const paymentMode = mode === "cash" ? "cash" : mode === "credit" ? "due" : due > 0 ? "partial" : "cash";
      const { data: sale, error: sErr } = await sb
        .from("sales")
        .insert({
          showroom_id: loc,
          cashier_id: userRes.user?.id ?? null,
          register_id: register?.id ?? null,
          customer_name: customerName.trim() || "Walk-in Customer",
          customer_phone: customerPhone.trim() || null,
          subtotal, discount: 0, tax, total, paid, due,
          payment_mode: paymentMode,
          external_ref: externalRef,
        })
        .select("id")
        .single();
      if (sErr || !sale) throw sErr ?? new Error("Insert failed");

      const lines = items.map(({ p, qty }) => {
        const up = priceFor(p);
        return {
          sale_id: sale.id, product_id: p.id, product_name: p.name, product_sku: p.sku,
          qty, unit_price: up, line_total: +(up * qty).toFixed(2),
        };
      });
      await sb.from("sale_items").insert(lines);

      // Multi-tender payment rows
      const payRows: any[] =
        mode === "cash" ? [{ sale_id: sale.id, method: "cash", amount: total }] :
        mode === "credit" ? [] :
        tenders.filter((t) => t.amount > 0).map((t) => ({
          sale_id: sale.id, method: t.method, amount: t.amount, reference: t.reference ?? null,
        }));
      if (payRows.length) await sb.from("sale_payments").insert(payRows);

      const rpcs: Promise<unknown>[] = [];
      for (const { p, qty } of items) {
        rpcs.push(sb.rpc("commit_stock_movement", {
          _product_id: p.id, _showroom_id: loc, _qty: -qty,
          _kind: "sale", _ref_type: "sale", _ref_id: sale.id, _note: null,
        }));
        const recipe = recipeMap[p.id];
        if (!recipe) continue;
        for (const ing of recipe) {
          rpcs.push(sb.rpc("commit_raw_stock_movement", {
            _material_id: ing.materialId, _showroom_id: loc,
            _qty: -Math.abs(ing.qty * qty),
            _kind: "production_consume", _ref_type: "sale", _ref_id: sale.id, _note: null,
          }));
        }
      }
      await Promise.all(rpcs);
      invalidate("pos:products:");
      toast.success(`Sale ${externalRef} completed · ৳${total.toFixed(2)}`);
      clearCart();
      setTenders([]);
      resetCustomer();
      setMode("cash");
      scanRef.current?.focus();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save sale");
    } finally {
      setSaving(false);
    }
  }

  const openMultiPay = () => {
    if (tenders.length === 0) setTenders([{ method: "cash", amount: total }]);
    setMultiPayOpen(true);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Top bar */}
      <header className="h-14 shrink-0 border-b border-border bg-card px-4 flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/dashboard" })}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-accent text-sm text-muted-foreground"
          aria-label="Exit POS"
        >
          <ArrowLeft className="size-4" /> Exit
        </button>
        <div className="flex items-center gap-2">
          <ScanBarcode className="size-4 text-primary" />
          <h1 className="font-semibold text-sm">Point of Sale</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <ScanBarcode className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-primary" />
            <input
              ref={scanRef}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleScan(); } }}
              placeholder="Scan or type SKU + Enter  (F2)"
              className="w-64 h-9 pl-8 pr-3 rounded-md border-2 border-primary/40 bg-background text-sm font-mono outline-none focus:border-primary"
              aria-label="Barcode scan input"
            />
          </div>
          <RegisterPill
            register={register}
            onOpen={() => setRegisterOpen(true)}
            onClose={() => setCloseRegOpen(true)}
          />
          <ShortcutsBadge />
        </div>
      </header>

      {/* Toolbar */}
      <div className="shrink-0 border-b border-border bg-card px-4 py-2.5 grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1.5fr_auto] gap-2 items-start">
        {/* Customer search */}
        <div className="relative" ref={custWrapRef}>
          <User className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <input
            value={custQuery}
            onChange={(e) => { setCustQuery(e.target.value); setCustOpen(true); }}
            onFocus={() => setCustOpen(true)}
            placeholder="Search customer by name or phone…"
            className="w-full h-9 pl-8 pr-8 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
          />
          {(customerId || custQuery) && (
            <button
              onClick={resetCustomer}
              aria-label="Clear customer"
              className="absolute right-1.5 top-2 p-1 rounded hover:bg-accent text-muted-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
          {custOpen && custResults.length > 0 && (
            <div className="absolute z-50 left-0 right-0 top-10 rounded-md border border-border bg-popover shadow-lg max-h-64 overflow-y-auto">
              {custResults.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pickCustomer(c)}
                  className="w-full text-left px-3 py-2 hover:bg-accent border-b border-border last:border-b-0"
                >
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground">{c.phone ?? "no phone"}</div>
                </button>
              ))}
            </div>
          )}
          {custOpen && custQuery.trim().length >= 1 && custResults.length === 0 && (
            <div className="absolute z-50 left-0 right-0 top-10 rounded-md border border-border bg-popover shadow-lg p-3 text-xs text-muted-foreground">
              No customer found — sale will use "Walk-in Customer".
            </div>
          )}
          <div className="mt-1 text-[11px] text-muted-foreground truncate">
            {customerId
              ? <>Selected: <span className="text-foreground font-medium">{customerName}</span>{customerPhone ? ` · ${customerPhone}` : ""}</>
              : "Walk-in Customer"}
          </div>
        </div>

        {/* Group */}
        <div className="relative">
          <Users className="size-4 absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none" />
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary appearance-none"
          >
            <option value="">— No customer group —</option>
            {groups.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
          </select>
          <div className="mt-1 text-[11px] truncate">
            {groupName ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                {groupName}{groupPct !== 0 ? ` · ${groupPct > 0 ? "+" : ""}${groupPct}%` : Object.keys(groupPrices).length ? " · fixed prices" : ""}
              </span>
            ) : (<span className="text-muted-foreground">Default pricing</span>)}
          </div>
        </div>

        {/* Product search */}
        <div className="relative">
          <Search className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product by name or SKU…  (F4)"
            className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
          />
          <div className="mt-1 text-[11px] text-muted-foreground">{filtered.length} product{filtered.length === 1 ? "" : "s"} in view</div>
        </div>

        {/* Hold / Recall */}
        <div className="flex gap-1.5">
          <button
            onClick={handleHold}
            disabled={items.length === 0}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border bg-background text-xs font-medium hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
            title="Hold current sale (F7)"
          >
            <Pause className="size-3.5" /> Hold
          </button>
          <button
            onClick={() => setRecallOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border bg-background text-xs font-medium hover:bg-accent relative"
            title="Recall held sale (F8)"
          >
            <PlayCircle className="size-3.5" /> Recall
            {held.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">{held.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_1fr] overflow-hidden">
        {/* Cart */}
        <aside className="flex flex-col overflow-hidden bg-card border-r border-border">
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold text-muted-foreground">CART · {items.length} item{items.length === 1 ? "" : "s"}</div>
              {items.length > 0 && (
                <button onClick={clearCart} className="text-[11px] text-destructive hover:underline">Clear (Esc)</button>
              )}
            </div>
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground py-10 text-center">
                Scan, search, or tap products on the right to add.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {items.map(({ p, qty }) => (
                  <div key={p.id} className="py-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {groupPct !== 0 || groupPrices[p.id] != null ? (
                          <><span className="line-through mr-1">৳{p.price.toFixed(2)}</span>৳{priceFor(p).toFixed(2)}</>
                        ) : (
                          <>৳{p.price.toFixed(2)}</>
                        )} × {qty} = ৳{(priceFor(p) * qty).toFixed(2)}
                      </div>
                    </div>
                    <button onClick={() => add(p.id, -1)} aria-label={`Decrease ${p.name}`} className="size-7 grid place-items-center rounded border border-border hover:bg-accent"><Minus className="size-3.5" /></button>
                    <span className="w-6 text-center text-sm tabular-nums">{qty}</span>
                    <button onClick={() => add(p.id, 1)} aria-label={`Increase ${p.name}`} className="size-7 grid place-items-center rounded border border-border hover:bg-accent"><Plus className="size-3.5" /></button>
                    <button onClick={() => setCart((c) => { const n = { ...c }; delete n[p.id]; return n; })} aria-label={`Remove ${p.name}`} className="size-7 grid place-items-center rounded text-destructive hover:bg-destructive/10"><Trash2 className="size-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>৳{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">VAT (5%)</span><span>৳{tax.toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold text-base pt-1 border-t border-border">
              <span>Total</span><span>৳{total.toFixed(2)}</span>
            </div>

            <div className="pt-2">
              <div className="text-[11px] font-medium text-muted-foreground mb-1.5">Payment</div>
              <div className="grid grid-cols-3 gap-1.5">
                <ModeBtn active={mode === "cash"} onClick={() => setMode("cash")} icon={Check} label="Cash" hint="Full paid" />
                <ModeBtn active={mode === "credit"} onClick={() => setMode("credit")} icon={Clock} label="Credit" hint="100% due" />
                <ModeBtn active={mode === "multi"} onClick={() => { setMode("multi"); openMultiPay(); }} icon={PieChart} label="Multi Pay" hint="Split" />
              </div>
            </div>

            {mode === "credit" && isWalkIn && (
              <div className="text-[11px] text-destructive bg-destructive/10 rounded-md px-2 py-1.5">
                Select a customer for credit sale
              </div>
            )}
            {mode === "multi" && (
              <button
                onClick={openMultiPay}
                className="w-full text-left text-[11px] px-2 py-1.5 rounded-md border border-dashed border-border hover:bg-accent"
              >
                {tenders.length === 0 ? "Add payment methods…" :
                  <>Paid ৳{multiPaid.toFixed(2)} across {tenders.filter((t) => t.amount > 0).length} method{tenders.filter((t) => t.amount > 0).length === 1 ? "" : "s"} · <span className="text-primary underline">Edit</span></>}
              </button>
            )}
            {mode === "multi" && due > 0 && isWalkIn && (
              <div className="text-[11px] text-destructive bg-destructive/10 rounded-md px-2 py-1.5">
                Select a customer to leave a balance due
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
              className="mt-2 w-full py-2.5 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : mode === "cash" ? "Complete Cash Sale (F9)" : mode === "credit" ? "Save as Credit (F9)" : "Complete Payment (F9)"}
            </button>
          </div>
        </aside>

        {/* Right */}
        <section className="overflow-y-auto p-4">
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <span className="text-[11px] font-semibold text-muted-foreground mr-1">CATEGORY:</span>
            {(["All", ...categories] as (ProductCategory | "All")[]).map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`px-3 py-1.5 rounded-md text-sm border transition ${
                  cat === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Loading products…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No products in "{cat}"{query ? ` matching "${query}"` : ""}.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {filtered.map((p, idx) => {
                const active = idx === cursor;
                const inCart = cart[p.id] ?? 0;
                const out = p.stock <= 0;
                const low = !out && p.stock < p.threshold;
                const shown = priceFor(p);
                const discounted = shown !== +p.price.toFixed(2);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setCursor(idx); if (!out) add(p.id, 1); }}
                    disabled={out}
                    aria-label={`${p.name}, ৳${shown.toFixed(2)}`}
                    className={`relative text-left rounded-lg border p-3 bg-card transition ${
                      active ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"
                    } ${out ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {inCart > 0 && (
                      <span className="absolute top-1.5 right-1.5 size-5 grid place-items-center rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                        {inCart}
                      </span>
                    )}
                    {(out || low) && (
                      <span
                        className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${
                          out ? "bg-destructive text-destructive-foreground" : "bg-amber-500/90 text-white"
                        }`}
                      >
                        {out ? "Out" : "Low"}
                      </span>
                    )}
                    <div className="aspect-[4/3] rounded-md bg-gradient-to-br from-accent to-secondary mb-2 overflow-hidden">
                      {p.imageUrl ? <img src={p.imageUrl} alt="" className="size-full object-cover" /> : null}
                    </div>
                    <div className="text-sm font-medium leading-tight line-clamp-2 min-h-[2.5em]">{p.name}</div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="font-mono text-[10px] text-muted-foreground">{p.sku}</span>
                      <span className="text-sm font-semibold">
                        {discounted && <span className="line-through text-[10px] text-muted-foreground mr-1">৳{p.price.toFixed(2)}</span>}
                        ৳{shown.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Stock: <span className={out ? "text-destructive" : low ? "text-amber-600" : ""}>{p.stock}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {multiPayOpen && (
        <MultiPayModal
          total={total}
          tenders={tenders}
          setTenders={setTenders}
          onClose={() => setMultiPayOpen(false)}
        />
      )}
      {recallOpen && (
        <RecallDrawer
          held={held}
          onClose={() => setRecallOpen(false)}
          onRecall={recallHeld}
          onDelete={async (id) => { await deleteHeldSale(id); setHeld(await listHeldSales(loc)); }}
        />
      )}
      {registerOpen && (
        <OpenRegisterModal
          showroomId={loc}
          onClose={() => setRegisterOpen(false)}
          onOpened={(r) => { setRegister(r); setRegisterOpen(false); toast.success("Register opened"); }}
        />
      )}
      {closeRegOpen && register && (
        <CloseRegisterModal
          register={register}
          onClose={() => setCloseRegOpen(false)}
          onClosed={() => { setRegister(null); setCloseRegOpen(false); toast.success("Register closed"); }}
        />
      )}
    </div>
  );
}

/* ---------------- Sub-components ---------------- */

function ModeBtn({ active, onClick, icon: Icon, label, hint }: { active: boolean; onClick: () => void; icon: any; label: string; hint?: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 py-2 rounded-md border text-[11px] font-medium transition ${
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-accent"
      }`}
    >
      <Icon className="size-3.5" />
      {label}
      {hint && <span className={`text-[9px] font-normal ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{hint}</span>}
    </button>
  );
}

function RegisterPill({ register, onOpen, onClose }: { register: RegisterSession | null; onOpen: () => void; onClose: () => void }) {
  if (!register) {
    return (
      <button
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-md border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-medium hover:bg-amber-500/20"
      >
        <Lock className="size-3.5" /> Register closed
      </button>
    );
  }
  return (
    <button
      onClick={onClose}
      className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-md border border-[color:var(--success)]/40 bg-[color:var(--success)]/10 text-[color:var(--success)] text-xs font-medium hover:bg-[color:var(--success)]/20"
      title="Close register"
    >
      <Unlock className="size-3.5" /> Register open · float ৳{Number(register.opening_float).toFixed(0)}
    </button>
  );
}

function MultiPayModal({
  total, tenders, setTenders, onClose,
}: {
  total: number; tenders: Tender[]; setTenders: (t: Tender[]) => void; onClose: () => void;
}) {
  const [local, setLocal] = useState<Tender[]>(tenders.length ? tenders : [{ method: "cash", amount: total }]);
  const paid = local.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const due = +(total - paid).toFixed(2);

  const update = (i: number, patch: Partial<Tender>) =>
    setLocal((L) => L.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const remove = (i: number) => setLocal((L) => L.filter((_, idx) => idx !== i));
  const addRow = () => setLocal((L) => [...L, { method: "card", amount: Math.max(0, +(total - paid).toFixed(2)) }]);

  const save = () => { setTenders(local); onClose(); };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-sm"><DollarSign className="size-4 text-primary" /> Multiple payment</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="size-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total due</span>
            <span className="font-semibold">৳{total.toFixed(2)}</span>
          </div>
          <div className="space-y-2">
            {local.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                <select
                  value={t.method}
                  onChange={(e) => update(i, { method: e.target.value as PayMethod })}
                  className="h-9 px-2 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
                >
                  {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => (
                    <option key={m} value={m}>{METHOD_LABEL[m]}</option>
                  ))}
                </select>
                <input
                  type="number" min={0} step="0.01"
                  value={t.amount || ""}
                  onChange={(e) => update(i, { amount: +e.target.value || 0 })}
                  placeholder="0.00"
                  className="w-32 h-9 px-2 rounded-md border border-border bg-background text-sm text-right outline-none focus:border-primary"
                />
                <button onClick={() => remove(i)} className="size-9 grid place-items-center rounded-md text-destructive hover:bg-destructive/10">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addRow} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            <Plus className="size-3.5" /> Add payment method
          </button>
          <div className="border-t border-border pt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span>৳{paid.toFixed(2)}</span></div>
            <div className={`flex justify-between font-semibold ${due > 0 ? "text-destructive" : "text-[color:var(--success)]"}`}>
              <span>{due > 0 ? "Balance due" : due < 0 ? "Change" : "Fully paid"}</span>
              <span>৳{Math.abs(due).toFixed(2)}</span>
            </div>
          </div>
        </div>
        <div className="px-4 h-14 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 h-9 rounded-md border border-border text-sm hover:bg-accent">Cancel</button>
          <button onClick={save} className="px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90">Apply</button>
        </div>
      </div>
    </div>
  );
}

function RecallDrawer({
  held, onClose, onRecall, onDelete,
}: {
  held: HeldSaleRow[]; onClose: () => void; onRecall: (r: HeldSaleRow) => void; onDelete: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <aside className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-sm"><PlayCircle className="size-4 text-primary" /> Held sales ({held.length})</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {held.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No held sales.</div>
          ) : held.map((h) => (
            <div key={h.id} className="p-3 border-b border-border flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{h.snapshot?.customerName || "Walk-in Customer"}</div>
                <div className="text-[11px] text-muted-foreground">
                  {h.item_count} item{h.item_count === 1 ? "" : "s"} · ৳{Number(h.total).toFixed(2)} · {new Date(h.created_at).toLocaleTimeString()}
                </div>
              </div>
              <button onClick={() => onRecall(h)} className="px-2.5 h-8 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90">Load</button>
              <button onClick={() => onDelete(h.id)} className="size-8 grid place-items-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 className="size-3.5" /></button>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function OpenRegisterModal({
  showroomId, onClose, onOpened,
}: {
  showroomId: string | null; onClose: () => void; onOpened: (r: RegisterSession) => void;
}) {
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await openRegister(showroomId, amount, note || undefined);
      onOpened(r);
    } catch (e: any) { toast.error(e?.message ?? "Failed to open register"); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-card border border-border rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-sm"><Unlock className="size-4 text-primary" /> Open register</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="size-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block text-xs">
            <span className="text-muted-foreground">Opening cash float</span>
            <input
              type="number" min={0} step="0.01" autoFocus
              value={amount || ""} onChange={(e) => setAmount(+e.target.value || 0)}
              className="mt-1 w-full h-9 px-2 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">Note (optional)</span>
            <input
              value={note} onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full h-9 px-2 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
            />
          </label>
        </div>
        <div className="px-4 h-14 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 h-9 rounded-md border border-border text-sm hover:bg-accent">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">Open</button>
        </div>
      </div>
    </div>
  );
}

function CloseRegisterModal({
  register, onClose, onClosed,
}: {
  register: RegisterSession; onClose: () => void; onClosed: () => void;
}) {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof summarizeRegister>> | null>(null);
  const [counted, setCounted] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { (async () => setSummary(await summarizeRegister(register)))(); }, [register]);

  const submit = async () => {
    setBusy(true);
    try {
      await closeRegister(register, counted, note || undefined);
      onClosed();
    } catch (e: any) { toast.error(e?.message ?? "Failed to close register"); }
    finally { setBusy(false); }
  };

  const diff = summary ? counted - summary.expectedCash : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-sm"><Receipt className="size-4 text-primary" /> Close register · Z-report</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="size-4" /></button>
        </div>
        <div className="p-4 space-y-2 text-sm">
          {summary ? (
            <>
              <Row label="Opening float" value={`৳${Number(register.opening_float).toFixed(2)}`} />
              <Row label={`Sales (${summary.saleCount})`} value={`৳${summary.totalSales.toFixed(2)}`} />
              <div className="border-t border-border my-1" />
              <Row label="Cash" value={`৳${summary.cashSales.toFixed(2)}`} />
              <Row label="Card" value={`৳${summary.cardSales.toFixed(2)}`} muted />
              <Row label="Mobile Banking" value={`৳${summary.mobileSales.toFixed(2)}`} muted />
              <Row label="Bank Transfer" value={`৳${summary.bankSales.toFixed(2)}`} muted />
              <Row label="Cheque" value={`৳${summary.chequeSales.toFixed(2)}`} muted />
              <div className="border-t border-border my-1" />
              <Row label="Expected cash in drawer" value={`৳${summary.expectedCash.toFixed(2)}`} bold />
              <label className="block pt-2">
                <span className="text-xs text-muted-foreground">Counted cash</span>
                <input
                  type="number" min={0} step="0.01" autoFocus
                  value={counted || ""} onChange={(e) => setCounted(+e.target.value || 0)}
                  className="mt-1 w-full h-9 px-2 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
                />
              </label>
              <Row
                label="Difference"
                value={`${diff >= 0 ? "+" : ""}৳${diff.toFixed(2)}`}
                bold
                className={diff === 0 ? "text-[color:var(--success)]" : "text-destructive"}
              />
              <label className="block pt-1">
                <span className="text-xs text-muted-foreground">Closing note (optional)</span>
                <input
                  value={note} onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full h-9 px-2 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
                />
              </label>
            </>
          ) : (
            <div className="text-muted-foreground text-center py-6">Loading summary…</div>
          )}
        </div>
        <div className="px-4 h-14 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 h-9 rounded-md border border-border text-sm hover:bg-accent">Cancel</button>
          <button onClick={submit} disabled={busy || !summary} className="px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">Close register</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted, bold, className }: { label: string; value: string; muted?: boolean; bold?: boolean; className?: string }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""} ${muted ? "text-muted-foreground" : ""} ${className ?? ""}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

function ShortcutsBadge() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-md border border-border text-xs text-muted-foreground hover:bg-accent"
        aria-label="Keyboard shortcuts"
      >
        <Keyboard className="size-3.5" /> Shortcuts
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-64 rounded-md border border-border bg-popover shadow-lg p-3 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold">Keyboard shortcuts</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
          </div>
          <ul className="space-y-1.5">
            {[
              ["F2", "Focus barcode scan"],
              ["F4", "Focus product search"],
              ["F7", "Hold current sale"],
              ["F8", "Recall held sale"],
              ["F9", "Complete sale"],
              ["Enter", "Add highlighted item"],
              ["← → ↑ ↓", "Move grid selection"],
              ["Esc", "Clear cart"],
            ].map(([k, v]) => (
              <li key={k} className="flex justify-between gap-2">
                <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono text-[10px]">{k}</kbd>
                <span className="text-muted-foreground">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
