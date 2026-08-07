import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ScanBarcode, Search, Plus, Minus, Trash2, Check, Clock, PieChart, Camera,
  X, Keyboard, ArrowLeft, User, UserPlus, Users, Pause, PlayCircle, DollarSign,
  Lock, Unlock, Receipt, Calendar, Calculator, Maximize2, Briefcase,
  CircleX, RotateCcw, CreditCard, FileText, History, Info, Pencil, Menu,
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
import { BarcodeScannerDialog } from "@/components/barcode-scanner-dialog";
import { scopeTo } from "@/lib/scope";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({ meta: [{ title: "POS · Muzahid Food" }] }),
  validateSearch: (s: Record<string, unknown>): { edit?: string } => ({
    edit: typeof s.edit === "string" ? s.edit : undefined,
  }),
  component: () => (
    <PermissionGate anyOf={["pos.access"]} title="POS">
      <PosPage />
    </PermissionGate>
  ),
});


type Mode = "cash" | "card" | "credit" | "multi";
type PayMethod = "cash" | "card" | "mobile" | "bank" | "cheque" | "other";
type Tender = { method: PayMethod; amount: number; reference?: string };
type CustomerLite = { id: string; name: string; phone: string | null; selling_price_group_id: string | null };
type GroupLite = { id: string; name: string };

const METHOD_LABEL: Record<PayMethod, string> = {
  cash: "Cash", card: "Card", mobile: "Mobile Banking",
  bank: "Bank Transfer", cheque: "Cheque", other: "Other",
};

function PosPage() {
  const navigate = useNavigate();
  const { edit: editId } = Route.useSearch();
  const { currentShowroomId, showrooms, hasGlobalAccess, setCurrentShowroomId } = useShowroomScope();
  const loc = currentShowroomId ?? null;

  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [editingRef, setEditingRef] = useState<string | null>(null);
  const [editOriginalItems, setEditOriginalItems] = useState<Array<{ product_id: string; qty: number }>>([]);
  const [editOriginalPaid, setEditOriginalPaid] = useState(0);
  const [editShowroomId, setEditShowroomId] = useState<string | null>(null);
  const [editHydrated, setEditHydrated] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [recipeMap, setRecipeMap] = useState<RecipeMap>({});
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<ProductCategory | "All">("All");
  const [query, setQuery] = useState("");
  const [scan, setScan] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
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
  const [customerDue, setCustomerDue] = useState(0);
  const [addCustOpen, setAddCustOpen] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", phone: "", email: "", address: "" });
  const [savingCust, setSavingCust] = useState(false);

  // Groups
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [groupName, setGroupName] = useState<string | null>(null);
  const [groupPrices, setGroupPrices] = useState<Record<string, number>>({});

  // Register
  const [register, setRegister] = useState<RegisterSession | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [closeRegOpen, setCloseRegOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [recentSales, setRecentSales] = useState<Array<{ id: string; external_ref: string | null; total: number; paid: number; due: number; created_at: string; customer_name: string | null }>>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  async function loadRecentSales() {
    setRecentLoading(true);
    try {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      let q = sb.from("sales")
        .select("id, external_ref, total, paid, due, created_at, customer_id, customers(name)")
        .gte("created_at", start.toISOString())
        .order("created_at", { ascending: false })
        .limit(50);
      q = scopeTo(q, loc, "showroom_id");
      const { data, error } = await q;
      if (error) throw error;
      setRecentSales((data ?? []).map((r: any) => ({
        id: r.id, external_ref: r.external_ref, total: Number(r.total ?? 0),
        paid: Number(r.paid ?? 0), due: Number(r.due ?? 0), created_at: r.created_at,
        customer_name: r.customers?.name ?? null,
      })));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load recent sales");
    } finally {
      setRecentLoading(false);
    }
  }

  // Held
  const [held, setHeld] = useState<HeldSaleRow[]>([]);
  const [recallOpen, setRecallOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));

  const scanRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const custWrapRef = useRef<HTMLDivElement>(null);

  // Load groups + register + held
  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from("selling_price_groups")
        .select("id,name")
        .eq("is_active", true)
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
    if (!groupId) { setGroupName(null); setGroupPrices({}); return; }
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    setGroupName(g.name);
    const { data: rows } = await sb
      .from("product_selling_prices")
      .select("product_id,price")
      .eq("selling_price_group_id", groupId);
    const map: Record<string, number> = {};
    for (const r of rows ?? []) map[r.product_id as string] = Number(r.price);
    setGroupPrices(map);
  };
  useEffect(() => { applyGroup(selectedGroupId || null); /* eslint-disable-next-line */ }, [selectedGroupId, groups]);

  // Customer search
  useEffect(() => {
    if (!custOpen) return;
    const q = custQuery.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      let query = sb.from("customers").select("id,name,phone,selling_price_group_id").order("name").limit(10);
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

  // Fetch live outstanding due for the selected customer:
  // sum(sales.due) matched by customer_id OR normalized phone,
  // minus standalone customer_payments (sale_id IS NULL) for this customer.
  useEffect(() => {
    if (!customerId) { setCustomerDue(0); return; }
    let cancelled = false;
    const digits = (customerPhone ?? "").replace(/\D/g, "");
    (async () => {
      const sb = supabase as any;
      const salesQ = digits
        ? sb.from("sales").select("due,customer_id,customer_phone")
        : sb.from("sales").select("due,customer_id,customer_phone").eq("customer_id", customerId);
      const paysQ = digits
        ? sb.from("customer_payments").select("amount,sale_id,customer_id,customer_phone").is("sale_id", null)
        : sb.from("customer_payments").select("amount,sale_id,customer_id,customer_phone").is("sale_id", null).eq("customer_id", customerId);

      const [sRes, pRes] = await Promise.all([salesQ, paysQ]);
      if (cancelled) return;
      if (sRes.error || pRes.error) { setCustomerDue(0); return; }

      const matchesCust = (row: any) => {
        if (row.customer_id && row.customer_id === customerId) return true;
        if (!digits) return false;
        const rd = String(row.customer_phone ?? "").replace(/\D/g, "");
        return rd && rd === digits;
      };

      const salesDue = (sRes.data ?? []).filter(matchesCust)
        .reduce((s: number, r: any) => s + Number(r.due || 0), 0);
      const extraPaid = (pRes.data ?? []).filter(matchesCust)
        .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

      const outstanding = Math.max(0, salesDue - extraPaid);
      setCustomerDue(+outstanding.toFixed(2));
    })();
    return () => { cancelled = true; };
  }, [customerId, customerPhone]);

  const pickCustomer = (c: CustomerLite) => {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone ?? "");
    setCustQuery(`${c.name}${c.phone ? " · " + c.phone : ""}`);
    setCustOpen(false);
    setSelectedGroupId(c.selling_price_group_id ?? "");
  };

  const resetCustomer = () => {
    setCustomerId(null);
    setCustomerName("Walk-in Customer");
    setCustomerPhone("");
    setCustQuery("");
    setSelectedGroupId("");
  };

  async function saveNewCustomer() {
    const name = newCust.name.trim();
    if (!name) { toast.error("Customer name is required"); return; }
    setSavingCust(true);
    try {
      const { data, error } = await sb
        .from("customers")
        .insert({
          name,
          phone: newCust.phone.trim() || null,
          email: newCust.email.trim() || null,
          address: newCust.address.trim() || null,
          is_active: true,
        })
        .select("id,name,phone,selling_price_group_id")
        .single();
      if (error || !data) throw error ?? new Error("Insert failed");
      pickCustomer(data as CustomerLite);
      setAddCustOpen(false);
      setNewCust({ name: "", phone: "", email: "", address: "" });
      toast.success("Customer added");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add customer");
    } finally {
      setSavingCust(false);
    }
  }

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
    return +p.price.toFixed(2);
  };
  const items = Object.entries(cart)
    .map(([id, qty]) => ({ p: products.find((x) => x.id === id)!, qty }))
    .filter((x) => x.p);
  const subtotal = +items.reduce((s, { p, qty }) => s + priceFor(p) * qty, 0).toFixed(2);
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const total = +(subtotal - discount + shipping).toFixed(2);

  // Hydrate POS from an existing sale when ?edit=<id> is present
  useEffect(() => {
    if (!editId || editHydrated || products.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        let row: any = null;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(editId);
        if (isUuid) {
          const { data } = await sb.from("sales").select("*").eq("id", editId).maybeSingle();
          row = data;
        }
        if (!row) {
          const { data } = await sb.from("sales").select("*").eq("external_ref", editId).maybeSingle();
          row = data;
        }
        if (!row) { toast.error(`Sale not found: ${editId}`); return; }
        if (cancelled) return;

        // Match sale's showroom scope so stock ops target the right location
        if (row.showroom_id && row.showroom_id !== loc) {
          try { setCurrentShowroomId(row.showroom_id); } catch { /* ignore */ }
        }

        const { data: items } = await sb.from("sale_items").select("*").eq("sale_id", row.id);
        const cartMap: Record<string, number> = {};
        const originals: Array<{ product_id: string; qty: number }> = [];
        for (const it of items ?? []) {
          if (!it.product_id) continue;
          cartMap[it.product_id] = (cartMap[it.product_id] || 0) + Number(it.qty);
          originals.push({ product_id: it.product_id, qty: Number(it.qty) });
        }
        if (cancelled) return;
        setCart(cartMap);
        setEditOriginalItems(originals);
        setEditOriginalPaid(Number(row.paid || 0));
        setEditShowroomId(row.showroom_id ?? null);
        setEditingSaleId(row.id);
        setEditingRef(row.external_ref ?? null);
        setDiscount(Number(row.discount || 0));
        setShipping(Number(row.shipping || 0));
        setCustomerId(row.customer_id ?? null);
        setCustomerName(row.customer_name || "Walk-in Customer");
        setCustomerPhone(row.customer_phone || "");
        if (row.customer_name) setCustQuery(`${row.customer_name}${row.customer_phone ? " · " + row.customer_phone : ""}`);
        setMode((row.payment_mode === "due" ? "credit" : row.payment_mode === "partial" ? "multi" : (row.payment_mode || "cash")) as Mode);
        setEditHydrated(true);
        toast.info(`Editing sale ${row.external_ref ?? "#" + String(row.id).slice(0, 8)}`);
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to load sale for edit");
      }
    })();
    return () => { cancelled = true; };
  }, [editId, editHydrated, products.length, loc, setCurrentShowroomId]);

  const exitEditMode = () => {
    setEditingSaleId(null);
    setEditingRef(null);
    setEditOriginalItems([]);
    setEditOriginalPaid(0);
    setEditShowroomId(null);
    setEditHydrated(false);
  };


  // Payment computation per Ultimate-POS logic
  const multiPaid = tenders.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const paid =
    mode === "cash" || mode === "card" ? total :
    mode === "credit" ? 0 :
    Math.min(multiPaid, total);
  const due = +(total - paid).toFixed(2);
  const isWalkIn = !customerId;

  const canComplete =
    items.length > 0 && !saving &&
    (mode === "cash" || mode === "card" ||
      (mode === "credit" && !isWalkIn) ||
      (mode === "multi" && multiPaid > 0 && (due <= 0 || !isWalkIn)));

  const add = (id: string, n = 1) =>
    setCart((c) => {
      const next = { ...c, [id]: Math.max(0, (c[id] || 0) + n) };
      if (next[id] === 0) delete next[id];
      return next;
    });
  const clearCart = () => { setCart({}); setTenders([]); };

  const scanCode = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const hit = skuIndex.get(code.toLowerCase());
    if (!hit) toast.error(`No product for "${code}"`);
    else if (hit.stock <= 0) toast.error(`${hit.name} is out of stock`);
    else { add(hit.id, 1); toast.success(`Added ${hit.name} · ${hit.stock.toFixed(0)} left`, { duration: 1200 }); }
  };

  const handleScan = () => {
    scanCode(scan);
    setScan("");
    scanRef.current?.focus();
  };

  const addFromSearch = (p: Product) => {
    if (p.stock <= 0) { toast.error(`${p.name} is out of stock`); return; }
    add(p.id, 1);
    setQuery("");
    searchRef.current?.focus();
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
    if (items.length === 0) { toast.error("Cart is empty"); return; }
    if (saving) return;
    if (!editingSaleId) {
      if (mode === "credit" && isWalkIn) {
        toast.error("Please select a customer for credit sale");
        return;
      }
      if (mode === "multi" && multiPaid <= 0) {
        toast.error("Enter tender amounts for multiple pay");
        return;
      }
      if (mode === "multi" && due > 0 && isWalkIn) {
        toast.error("Select a customer to leave a balance due");
        return;
      }
    }
    setSaving(true);

    // ============ EDIT MODE ============
    if (editingSaleId) {
      try {
        // 1. Stock delta: reverse old, apply new (positive = returned to stock)
        const oldMap = new Map<string, number>();
        for (const l of editOriginalItems) oldMap.set(l.product_id, (oldMap.get(l.product_id) || 0) + l.qty);
        const newMap = new Map<string, number>();
        for (const { p, qty } of items) newMap.set(p.id, (newMap.get(p.id) || 0) + qty);
        const pids = new Set<string>([...oldMap.keys(), ...newMap.keys()]);
        const ops: Promise<any>[] = [];
        for (const pid of pids) {
          const delta = (oldMap.get(pid) || 0) - (newMap.get(pid) || 0);
          if (delta !== 0) {
            ops.push(sb.rpc("commit_stock_movement", {
              _product_id: pid, _showroom_id: editShowroomId, _qty: delta,
              _kind: "sale_edit", _ref_type: "sale", _ref_id: editingSaleId, _note: "POS edit",
            }));
          }
        }
        const results = await Promise.all(ops);
        for (const r of results) if ((r as any)?.error) throw new Error((r as any).error.message);

        // 2. Replace sale_items
        const { error: delErr } = await sb.from("sale_items").delete().eq("sale_id", editingSaleId);
        if (delErr) throw delErr;
        const newLines = items.map(({ p, qty }) => {
          const up = priceFor(p);
          return {
            sale_id: editingSaleId, product_id: p.id, product_name: p.name, product_sku: p.sku,
            qty, unit_price: up, line_total: +(up * qty).toFixed(2),
          };
        });
        const { error: insErr } = await sb.from("sale_items").insert(newLines);
        if (insErr) throw insErr;

        // 3. Update sale header (preserve original paid; recompute due)
        const newDue = +Math.max(0, total - editOriginalPaid).toFixed(2);
        const { error: upErr } = await sb.from("sales").update({
          customer_id: customerId,
          customer_name: customerName.trim() || "Walk-in Customer",
          customer_phone: customerPhone.trim() || null,
          subtotal, discount, tax: 0, shipping, total,
          paid: editOriginalPaid, due: newDue,
        }).eq("id", editingSaleId);
        if (upErr) throw upErr;

        invalidate("pos:products:");
        toast.success(`Sale ${editingRef ?? ""} updated · ৳${total.toFixed(2)}`);
        clearCart();
        setDiscount(0);
        setShipping(0);
        resetCustomer();
        exitEditMode();
        navigate({ to: "/sales/list" });
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to update sale");
      } finally {
        setSaving(false);
      }
      return;
    }

    const externalRef = `TX-${Math.floor(Math.random() * 9000) + 1000}`;
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const paymentMode = mode === "cash" ? "cash" : mode === "card" ? "card" : mode === "credit" ? "due" : due > 0 ? "partial" : "cash";
      const { data: sale, error: sErr } = await sb
        .from("sales")
        .insert({
          showroom_id: loc,
          cashier_id: userRes.user?.id ?? null,
          register_id: register?.id ?? null,
          customer_id: customerId,
          customer_name: customerName.trim() || "Walk-in Customer",
          customer_phone: customerPhone.trim() || null,
          subtotal, discount, tax: 0, shipping, total, paid, due,
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
      const { error: liErr } = await sb.from("sale_items").insert(lines);
      if (liErr) throw liErr;


      // Multi-tender payment rows
      const payRows: any[] =
        mode === "cash" ? [{ sale_id: sale.id, method: "cash", amount: total }] :
        mode === "card" ? [{ sale_id: sale.id, method: "card", amount: total }] :
        mode === "credit" ? [] :
        tenders.filter((t) => t.amount > 0).map((t) => ({
          sale_id: sale.id, method: t.method, amount: t.amount, reference: t.reference ?? null,
        }));
      if (payRows.length) await sb.from("sale_payments").insert(payRows);

      const rpcs: Promise<unknown>[] = [];
      for (const { p, qty } of items) {
        // Selling only decrements finished-product stock. Raw materials are
        // consumed once, at production time — deducting them again here would
        // double-count and drive raw stock negative.
        rpcs.push(sb.rpc("commit_stock_movement", {
          _product_id: p.id, _showroom_id: loc, _qty: -qty,
          _kind: "sale", _ref_type: "sale", _ref_id: sale.id, _note: null,
        }));
      }
      await Promise.all(rpcs);
      invalidate("pos:products:");

      // Stash invoice snapshot for the print window
      try {
        const currentShowroom = showrooms.find((s) => s.id === loc) as any;
        const snapshot = {
          customer: { name: customerName.trim() || "Walk-in Customer", phone: customerPhone.trim() || undefined },
          branch: currentShowroom?.name ?? (loc ? "Showroom" : "Factory"),
          showroom: currentShowroom
            ? {
                id: currentShowroom.id,
                name: currentShowroom.name,
                code: currentShowroom.code ?? null,
                address: currentShowroom.address ?? null,
                city: currentShowroom.city ?? null,
                phone: currentShowroom.phone ?? null,
                manager_name: currentShowroom.manager_name ?? null,
              }
            : null,
          cashier: register ? { id: register.id } : null,
          reference: externalRef,
          date: new Date().toISOString(),
          mode: paymentMode === "card" ? "cash" : (paymentMode as "cash" | "due" | "partial"),
          items: items.map(({ p, qty }) => ({ name: p.name, sku: p.sku ?? "", price: priceFor(p), qty, discount: 0 })),
          subtotal, discount, tax: 0, shipping, total, paid, due,
          previousDue: customerDue,
          payments: payRows.map((r) => ({ method: r.method, amount: r.amount, reference: r.reference ?? null })),
        };
        localStorage.setItem(`invoice:${sale.id}`, JSON.stringify(snapshot));
      } catch { /* ignore */ }
      window.open(`/invoice/${sale.id}?ap=1`, "_blank", "noopener,width=520,height=800");


      toast.success(`Sale ${externalRef} completed · ৳${total.toFixed(2)}`);
      clearCart();
      setTenders([]);
      resetCustomer();
      setMode("cash");
      setDiscount(0);
      setShipping(0);
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

  const nowStr = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    let h = d.getHours(); const ampm = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(h)}:${pad(d.getMinutes())} ${ampm}`;
  }, [saving]);

  const discountTotal = 0;
  const shippingTotal = 0;
  const [rightTab, setRightTab] = useState<"category" | "brands" | "featured">("category");
  const [mobileTab, setMobileTab] = useState<"products" | "cart">("cart");
  const itemCount = items.reduce((s, x) => s + x.qty, 0);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[oklch(0.97_0.005_240)] dark:bg-background text-foreground">
      {editingSaleId && (
        <div className="shrink-0 bg-amber-500/15 border-b border-amber-500/40 text-amber-900 dark:text-amber-200 px-3 py-1.5 flex items-center gap-3 text-xs">
          <Pencil className="size-3.5" />
          <span className="font-semibold">Editing sale {editingRef ?? `#${editingSaleId.slice(0, 8)}`}</span>
          <span className="opacity-70">Save to update. Original payment (৳{editOriginalPaid.toFixed(2)}) is preserved.</span>
          <button
            onClick={() => { clearCart(); setDiscount(0); setShipping(0); resetCustomer(); exitEditMode(); navigate({ to: "/sales/list" }); }}
            className="ml-auto px-2 py-0.5 rounded border border-amber-500/60 hover:bg-amber-500/20"
          >Cancel edit</button>
        </div>
      )}
      {/* ============ TOP BAR ============ */}
      <header className="shrink-0 border-b border-border bg-card px-1.5 py-1 flex items-center gap-1">
        <IconBtn title="Exit POS" onClick={() => navigate({ to: "/dashboard" })}><ArrowLeft className="size-4" /></IconBtn>
        <select
          value={currentShowroomId ?? ""}
          onChange={(e) => setCurrentShowroomId(e.target.value || null)}
          title="Business Location"
          className="h-7 min-w-0 flex-1 sm:flex-none sm:max-w-[180px] rounded-md border border-primary/40 bg-background px-1.5 text-[11px] font-semibold outline-none focus:border-primary truncate"
        >
          {hasGlobalAccess && <option value="">All locations</option>}
          {showrooms.map((s) => (
            <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</option>
          ))}
          {showrooms.length === 0 && <option value="">No showroom</option>}
        </select>

        <input
          type="date"
          value={invoiceDate}
          onChange={(e) => setInvoiceDate(e.target.value)}
          title="Invoice date"
          className="h-7 w-[112px] shrink-0 px-1.5 rounded-md border border-border bg-background text-[11px] font-semibold outline-none focus:border-primary"
        />


        <div className="hidden sm:block"><LiveClock register={register} /></div>


        {customerId && customerDue > 0 && (
          <div
            className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-[11px] font-bold leading-none"
            title={`Outstanding due for ${customerName}`}
          >
            Customer Due: ৳{customerDue.toFixed(2)}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <div className="hidden sm:flex items-center gap-1">
            <RegisterPill register={register} onOpen={() => setRegisterOpen(true)} onClose={() => setCloseRegOpen(true)} />
            <IconBtn title="Refresh" onClick={() => { invalidate("pos:"); location.reload(); }}><RotateCcw className="size-4" /></IconBtn>
            <IconBtn title="Hold (F7)" onClick={() => items.length && void handleHold()} disabled={items.length === 0}><Pause className="size-4" /></IconBtn>
            <IconBtn title="Recall held (F8)" onClick={() => setRecallOpen(true)}>
              <Briefcase className="size-4" />
              {held.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 grid place-items-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold">{held.length}</span>
              )}
            </IconBtn>
            <IconBtn title="Cancel sale (Esc)" onClick={clearCart} tone="danger"><CircleX className="size-4" /></IconBtn>
            <IconBtn title="Fullscreen" onClick={toggleFullscreen}><Maximize2 className="size-4" /></IconBtn>
            <ShortcutsBadge />
          </div>
          {/* Mobile hamburger — parks secondary actions in a breadcrumb drawer */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="sm:hidden relative h-7 w-7 shrink-0 grid place-items-center rounded-md border border-border bg-background hover:bg-accent"
            title="More"
          >
            <Menu className="size-4" />
            {(held.length > 0 || items.length > 0) && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 grid place-items-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                {held.length + (items.length > 0 ? 1 : 0)}
              </span>
            )}
          </button>
        </div>
      </header>


      {/* ============ MAIN ============ */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[3fr_2fr] overflow-hidden">
        {/* Cart column (60%) — full width on mobile (Ultimate POS style) */}
        <section className={`${mobileTab === "cart" ? "flex" : "hidden"} lg:flex flex-col overflow-hidden bg-card border-r border-border`}>
          {/* Toolbar inside 60% split: Customer | Price Group | Invoice Date */}
          <div className="shrink-0 border-b border-border pl-4 pr-2 sm:pl-6 sm:pr-4 py-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <div className="flex gap-1.5">
              <div className="relative flex-1" ref={custWrapRef}>
                <User className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={custQuery}
                  onChange={(e) => { setCustQuery(e.target.value); setCustOpen(true); }}
                  onFocus={() => setCustOpen(true)}
                  placeholder="Walk-in Customer"
                  className="w-full h-9 pl-8 pr-8 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
                />
                {(customerId || custQuery) && (
                  <button onClick={resetCustomer} aria-label="Clear customer" className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent text-muted-foreground">
                    <X className="size-3.5" />
                  </button>
                )}
                {custOpen && custResults.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 top-10 rounded-md border border-border bg-popover shadow-lg max-h-64 overflow-y-auto">
                    {custResults.map((c) => (
                      <button key={c.id} onClick={() => pickCustomer(c)} className="w-full text-left px-3 py-2 hover:bg-accent border-b border-border last:border-b-0">
                        <div className="text-sm font-medium">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground">{c.phone ?? "no phone"}</div>
                      </button>
                    ))}
                  </div>
                )}
                {custOpen && custQuery.trim().length >= 1 && custResults.length === 0 && (
                  <div className="absolute z-50 left-0 right-0 top-10 rounded-md border border-border bg-popover shadow-lg p-3 text-xs text-muted-foreground">
                    No customer found — click <span className="font-semibold">+</span> to add a new customer.
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  const q = custQuery.trim();
                  const looksPhone = /^[\d+\-\s]+$/.test(q);
                  setNewCust({
                    name: looksPhone ? "" : q,
                    phone: looksPhone ? q : "",
                    email: "",
                    address: "",
                  });
                  setAddCustOpen(true);
                }}
                title="Add new customer"
                className="h-9 px-2.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1 hover:opacity-90"
              >
                <UserPlus className="size-4" /> Add
              </button>
            </div>


            <div className="relative">
              <DollarSign className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary appearance-none"
              >
                <option value="">Default selling price</option>
                {groups.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
              </select>
            </div>
          </div>



          {/* Product search + scan/browse toggle */}
          <div className="shrink-0 border-b border-border pl-4 pr-2 sm:pl-6 sm:pr-4 py-1.5 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <ProductSearchBox
                inputRef={searchRef}
                query={query}
                setQuery={setQuery}
                products={products}
                onPick={addFromSearch}
              />
            </div>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="shrink-0 h-9 w-9 grid place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
              title="Scan with camera"
            >
              <Camera className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setMobileTab(mobileTab === "products" ? "cart" : "products")}
              className="lg:hidden shrink-0 h-9 w-9 grid place-items-center rounded-md border border-border bg-background hover:bg-accent"
              title={mobileTab === "products" ? "Back to cart" : "Browse products"}
            >
              {mobileTab === "products" ? <Receipt className="size-4" /> : <ScanBarcode className="size-4" />}
            </button>
          </div>

          <div className="grid grid-cols-[1fr_130px_100px_32px] sm:grid-cols-[1fr_170px_130px_36px] text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 pl-8 pr-2 sm:pl-10 sm:pr-4 py-2 border-b-2 border-primary/40 bg-slate-100 dark:bg-slate-800/60">
            <span>Product</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Subtotal</span>
            <span></span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Scan, search, or tap products to add.
              </div>
            ) : (
              items.map(({ p, qty }) => {
                const shown = priceFor(p);
                return (
                  <div key={p.id} className="grid grid-cols-[1fr_130px_100px_32px] sm:grid-cols-[1fr_170px_130px_36px] items-center pl-8 pr-2 sm:pl-10 sm:pr-4 py-2 border-b border-border hover:bg-accent/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-8 rounded-md bg-gradient-to-br from-accent to-secondary overflow-hidden shrink-0">
                        {p.imageUrl ? <img src={p.imageUrl} alt="" className="size-full object-cover" /> : null}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-sky-700 dark:text-sky-400 truncate">{p.name}</div>
                        <div className="text-[10px] font-semibold text-muted-foreground truncate">
                          {p.sku} · {p.stock.toFixed(0)} in stock
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => add(p.id, -1)} className="size-7 grid place-items-center rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 font-bold"><Minus className="size-3" /></button>
                      <input
                        type="number" min={0} value={qty}
                        onChange={(e) => {
                          const n = Math.max(0, +e.target.value || 0);
                          setCart((c) => { const nx = { ...c, [p.id]: n }; if (!n) delete nx[p.id]; return nx; });
                        }}
                        className="w-12 h-7 text-center rounded-md border border-border bg-background text-xs font-bold tabular-nums outline-none focus:border-primary"
                      />
                      <button onClick={() => add(p.id, 1)} className="size-7 grid place-items-center rounded-md bg-[color:var(--success)]/15 text-[color:var(--success)] hover:bg-[color:var(--success)]/25 font-bold"><Plus className="size-3" /></button>
                    </div>
                    <div className="text-right text-xs sm:text-sm font-extrabold tabular-nums text-slate-800 dark:text-slate-100">৳{(shown * qty).toFixed(2)}</div>
                    <button onClick={() => setCart((c) => { const n = { ...c }; delete n[p.id]; return n; })} className="size-7 grid place-items-center rounded-md text-destructive hover:bg-destructive/10 justify-self-end">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom stat bar */}
          <div className="grid grid-cols-5 border-t-2 border-border bg-card text-center">
            <Stat label="ITEMS" value={items.reduce((s, x) => s + x.qty, 0).toFixed(0)} />
            <Stat label="SUBTOTAL" value={subtotal.toFixed(2)} />
            <StatInput label="DISCOUNT (-)" value={discount} onChange={setDiscount} tone="danger" />
            <StatInput label="SHIPPING (+)" value={shipping} onChange={setShipping} />
            <Stat label="TOTAL PAYABLE" value={total.toFixed(2)} big />
          </div>

          {/* ============ FOOTER ACTIONS (inside 60% cart column) ============ */}
          <footer className="shrink-0 border-t border-border bg-card px-1.5 py-1 grid grid-cols-3 sm:grid-cols-6 gap-1">
            {/* Row 1 on mobile: Cancel | Multiple Pay | Cash (primary actions per Ultimate POS) */}
            <ActBtn tone="danger" onClick={clearCart} icon={<CircleX className="size-4" />} label="Cancel" />
            <ActBtn tone="dark" active={mode === "multi"} onClick={() => { setMode("multi"); openMultiPay(); }} icon={<DollarSign className="size-4" />} label="Multiple Pay" />
            <ActBtn tone="success" onClick={() => { setMode("cash"); void complete(); }} disabled={!items.length || saving} icon={<DollarSign className="size-4" />} label={saving ? "Saving…" : `Cash ৳${total.toFixed(2)}`} />
            {/* Row 2 on mobile: Quotation | Credit Sale | Card */}
            <ActBtn tone="muted" onClick={() => items.length && void handleHold()} icon={<FileText className="size-4" />} label="Quotation" />
            <ActBtn tone="warning" active={mode === "credit"} onClick={() => setMode("credit")} icon={<Check className="size-4" />} label="Credit Sale" />
            <ActBtn tone="info" active={mode === "card"} onClick={() => { setMode("card"); void complete(); }} icon={<CreditCard className="size-4" />} label="Card" />
          </footer>

          {/* Payment mode helper strip */}
          {(mode === "credit" || mode === "multi") && (
            <div className={`shrink-0 border-t-2 px-3 py-2 text-sm flex items-center justify-between gap-2 flex-wrap ${
              mode === "credit"
                ? "border-amber-500 bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100"
                : "border-border bg-muted/60"
            }`}>
              <span className="font-bold">
                Mode: <span className="font-extrabold uppercase">{mode === "credit" ? "Credit Sale (100% Due)" : "Multiple Pay"}</span>
                {mode === "multi" && <> · Paid ৳{multiPaid.toFixed(2)} · <button onClick={openMultiPay} className="text-primary underline font-semibold">Edit tenders</button></>}
              </span>
              <span className={`font-extrabold text-base ${due <= 0 ? "text-[color:var(--success)]" : "text-destructive"}`}>
                {due <= 0 ? "Fully paid" : `Due ৳${due.toFixed(2)}`}
                {isWalkIn && due > 0 && <span className="ml-1 uppercase">· Select a customer!</span>}
              </span>
              <button
                onClick={complete}
                disabled={saving || items.length === 0}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 shadow"
              >
                Complete (F9)
              </button>

            </div>
          )}

        </section>


        {/* Right panel: category + product grid */}
        <aside className={`${mobileTab === "products" ? "block" : "hidden"} lg:block overflow-y-auto p-2 bg-[oklch(0.97_0.005_240)] dark:bg-background`}>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <button onClick={() => setRightTab("category")} className={`h-9 rounded-md border text-xs font-semibold inline-flex items-center justify-center gap-2 ${rightTab === "category" ? "bg-primary/10 border-primary text-primary" : "bg-card border-border hover:bg-accent"}`}>
              Category <span className="text-[10px] font-bold opacity-70">({categories.length})</span>
            </button>
            <button onClick={() => setRightTab("brands")} className={`h-9 rounded-md border text-xs font-semibold inline-flex items-center justify-center gap-2 ${rightTab === "brands" ? "bg-primary/10 border-primary text-primary" : "bg-card border-border hover:bg-accent"}`}>
              Brands <span className="text-[10px] font-bold opacity-70">(0)</span>
            </button>
          </div>
          {rightTab === "category" && (
            <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
              <button onClick={() => setCat("All")} className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium border ${cat === "All" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/40"}`}>All</button>
              {categories.map((c) => (
                <button key={c} onClick={() => setCat(c)} className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium border ${cat === c ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/40"}`}>{c}</button>
              ))}
            </div>
          )}
          {rightTab === "brands" && (
            <div className="mb-2 px-3 py-2 text-[11px] text-muted-foreground bg-card border border-border rounded-md">
              No brands configured.
            </div>
          )}

          <div className="text-[10px] font-extrabold uppercase tracking-wider text-foreground px-1 mb-1">Featured Products</div>


          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No products.</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-1">
              {filtered.map((p, idx) => {
                const active = idx === cursor;
                const out = p.stock <= 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setCursor(idx); if (!out) add(p.id, 1); else toast.error(`${p.name} is out of stock`); }}
                    className={`text-center rounded-md border bg-card p-1 transition ${active ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"} ${out ? "opacity-60" : ""}`}
                  >
                    <div className="mx-auto size-10 rounded bg-gradient-to-br from-accent to-secondary overflow-hidden mb-0.5 relative">
                      {p.imageUrl ? <img src={p.imageUrl} alt="" className="size-full object-cover" /> : null}
                      {out && <span className="absolute inset-0 grid place-items-center bg-black/50 text-[8px] font-bold text-white">OUT</span>}
                    </div>
                    <div className="text-[10px] font-bold leading-tight line-clamp-2 min-h-[2.2em] text-foreground">{p.name}</div>
                    <div className="text-[10px] font-bold text-primary">৳{priceFor(p).toFixed(2)}</div>
                    <div className={`text-[9px] font-semibold ${out ? "text-destructive" : "text-muted-foreground"}`}>
                      {out ? "Out" : `${p.stock.toFixed(0)} in stock`}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      <BarcodeScannerDialog
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => scanCode(code)}
      />

      {multiPayOpen && (
        <MultiPayModal total={total} tenders={tenders} setTenders={setTenders} onClose={() => setMultiPayOpen(false)} />
      )}
      {recallOpen && (
        <RecallDrawer held={held} onClose={() => setRecallOpen(false)} onRecall={recallHeld}
          onDelete={async (id) => { await deleteHeldSale(id); setHeld(await listHeldSales(loc)); }} />
      )}
      {registerOpen && (
        <OpenRegisterModal showroomId={loc} onClose={() => setRegisterOpen(false)}
          onOpened={(r) => { setRegister(r); setRegisterOpen(false); toast.success("Register opened"); }} />
      )}
      {closeRegOpen && register && (
        <CloseRegisterModal register={register} onClose={() => setCloseRegOpen(false)}
          onClosed={() => { setRegister(null); setCloseRegOpen(false); toast.success("Register closed"); }} />
      )}
      {addCustOpen && (
        <div className="fixed inset-0 z-[80] bg-black/50 grid place-items-center p-4" onClick={() => !savingCust && setAddCustOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-card border border-border shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 font-semibold text-sm"><UserPlus className="size-4 text-primary" /> Add new customer</div>
              <button onClick={() => setAddCustOpen(false)} className="p-1 rounded hover:bg-accent"><X className="size-4" /></button>
            </div>
            <div className="grid gap-2.5">
              <label className="text-xs font-medium">
                Name<span className="text-destructive">*</span>
                <input autoFocus value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })}
                  className="mt-1 w-full h-9 px-2.5 rounded-md border border-border bg-background text-sm outline-none focus:border-primary" />
              </label>
              <label className="text-xs font-medium">
                Phone
                <input value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })}
                  className="mt-1 w-full h-9 px-2.5 rounded-md border border-border bg-background text-sm outline-none focus:border-primary" />
              </label>
              <label className="text-xs font-medium">
                Email
                <input type="email" value={newCust.email} onChange={(e) => setNewCust({ ...newCust, email: e.target.value })}
                  className="mt-1 w-full h-9 px-2.5 rounded-md border border-border bg-background text-sm outline-none focus:border-primary" />
              </label>
              <label className="text-xs font-medium">
                Address
                <textarea value={newCust.address} onChange={(e) => setNewCust({ ...newCust, address: e.target.value })}
                  rows={2}
                  className="mt-1 w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-sm outline-none focus:border-primary" />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAddCustOpen(false)} disabled={savingCust}
                className="h-9 px-3 rounded-md border border-border text-xs font-semibold hover:bg-accent">Cancel</button>
              <button onClick={saveNewCustomer} disabled={savingCust || !newCust.name.trim()}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
                {savingCust ? "Saving…" : "Save customer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating: Recent Transactions */}
      <button
        onClick={() => { setRecentOpen(true); void loadRecentSales(); }}
        className="hidden lg:inline-flex fixed bottom-4 right-4 z-[70] h-11 px-4 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-lg hover:opacity-90 items-center justify-center gap-2"
        title="Today's recent sales"
      >
        <History className="size-4" /> <span>Recent Transactions</span>
      </button>


      {/* Mobile floating actions removed — hamburger in header opens the drawer, and Recent Sales is available inside it. */}

      {recentOpen && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex justify-end" onClick={() => setRecentOpen(false)}>
          <div className="w-full max-w-md h-full bg-card border-l border-border shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <History className="size-4 text-primary" /> Today's Recent Sales
              </div>
              <div className="flex items-center gap-1">
                <button onClick={loadRecentSales} className="p-1.5 rounded hover:bg-accent" title="Refresh"><RotateCcw className="size-4" /></button>
                <button onClick={() => setRecentOpen(false)} className="p-1.5 rounded hover:bg-accent"><X className="size-4" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {recentLoading ? (
                <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
              ) : recentSales.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">No sales today yet.</div>
              ) : (
                recentSales.map((s) => {
                  const t = new Date(s.created_at);
                  const pad = (n: number) => String(n).padStart(2, "0");
                  let h = t.getHours(); const ampm = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
                  const time = `${pad(h)}:${pad(t.getMinutes())} ${ampm}`;
                  return (
                    <div key={s.id} className="px-4 py-3 border-b border-border hover:bg-accent/30">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-sky-700 dark:text-sky-400 truncate">{s.external_ref ?? s.id.slice(0, 8)}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{s.customer_name ?? "Walk-in Customer"} · {time}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-extrabold tabular-nums">৳{s.total.toFixed(2)}</div>
                          {s.due > 0 ? (
                            <div className="text-[10px] font-bold text-destructive">Due ৳{s.due.toFixed(2)}</div>
                          ) : (
                            <div className="text-[10px] font-bold text-[color:var(--success)]">Paid</div>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => window.open(`/invoice/${s.id}`, "_blank", "noopener,width=520,height=800")}
                          className="h-7 px-2.5 rounded-md border border-border text-[11px] font-semibold hover:bg-accent inline-flex items-center gap-1"
                        >
                          <Receipt className="size-3.5" /> View
                        </button>
                        <button
                          onClick={() => window.open(`/invoice/${s.id}?ap=1`, "_blank", "noopener,width=520,height=800")}
                          className="h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90 inline-flex items-center gap-1"
                        >
                          <FileText className="size-3.5" /> Print
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile More drawer — parks secondary menus like a breadcrumb */}
      {moreOpen && (
        <div className="fixed inset-0 z-[85] bg-black/50 sm:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-72 max-w-[85vw] bg-card border-l border-border shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="text-sm font-semibold">More</div>
              <button onClick={() => setMoreOpen(false)} className="p-1.5 rounded hover:bg-accent"><X className="size-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5">Register</div>
                <RegisterPill register={register} onOpen={() => { setMoreOpen(false); setRegisterOpen(true); }} onClose={() => { setMoreOpen(false); setCloseRegOpen(true); }} />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5">Invoice date</div>
                <div className="relative">
                  <Calendar className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    type="date" value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full h-9 pl-8 pr-2 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <DrawerBtn onClick={() => { setMoreOpen(false); setRecentOpen(true); void loadRecentSales(); }} icon={<History className="size-4" />} label="Recent Sales" />
                <DrawerBtn onClick={() => { setMoreOpen(false); setRecallOpen(true); }} icon={<Briefcase className="size-4" />} label={`Recall${held.length ? ` (${held.length})` : ""}`} />
                <DrawerBtn onClick={() => { setMoreOpen(false); if (items.length) void handleHold(); }} disabled={items.length === 0} icon={<Pause className="size-4" />} label="Hold (F7)" />
                <DrawerBtn onClick={() => { setMoreOpen(false); invalidate("pos:"); location.reload(); }} icon={<RotateCcw className="size-4" />} label="Refresh" />
                <DrawerBtn onClick={() => { setMoreOpen(false); toggleFullscreen(); }} icon={<Maximize2 className="size-4" />} label="Fullscreen" />
                <DrawerBtn onClick={() => { setMoreOpen(false); clearCart(); }} icon={<CircleX className="size-4" />} label="Cancel Sale" danger />
              </div>
              <div className="text-[10px] text-muted-foreground pt-2 border-t border-border">
                Shortcuts: F2 Scan · F4 Search · F7 Hold · F8 Recall · F9 Complete · Esc Cancel
              </div>
            </div>
          </div>
        </div>
      )}
    </div>

  );
}

/* ---------------- Sub-components ---------------- */

function DrawerBtn({
  onClick, icon, label, disabled, danger,
}: { onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={`h-14 rounded-md border text-xs font-semibold inline-flex flex-col items-center justify-center gap-1 disabled:opacity-40 ${
        danger
          ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
          : "border-border bg-background hover:bg-accent"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}


function ProductSearchBox({
  inputRef, query, setQuery, products, onPick,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  setQuery: (s: string) => void;
  products: Product[];
  onPick: (p: Product) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 10);
  }, [q, products]);
  return (
    <div className="relative" ref={wrapRef}>
      <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) {
            e.preventDefault();
            const m = matches[0];
            if (m.stock <= 0) { toast.error(`${m.name} is out of stock`); return; }
            onPick(m); setOpen(false);
          }
        }}
        placeholder="Enter product name / SKU / scan bar code (F4)"
        className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
      />
      {open && q && (
        <div className="absolute z-50 left-0 right-0 top-10 rounded-md border border-border bg-popover shadow-lg max-h-72 overflow-y-auto">
          {matches.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No products match "{query}".</div>
          ) : matches.map((p) => {
            const out = p.stock <= 0;
            return (
              <button
                key={p.id}
                onClick={() => {
                  if (out) { toast.error(`${p.name} is out of stock`); return; }
                  onPick(p); setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 border-b border-border last:border-b-0 flex items-center gap-2 ${out ? "opacity-60" : "hover:bg-accent"}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground">{p.sku} · ৳{p.price.toFixed(2)}</div>
                </div>
                <span className={`text-[10px] font-semibold shrink-0 ${out ? "text-destructive" : "text-[color:var(--success)]"}`}>
                  {out ? "Out of stock" : `${p.stock.toFixed(0)} left`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled, tone }: { children: React.ReactNode; onClick?: () => void; title?: string; disabled?: boolean; tone?: "danger" }) {
  return (
    <button
      onClick={onClick} title={title} disabled={disabled}
      className={`relative size-9 grid place-items-center rounded-md border border-border bg-card hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed ${tone === "danger" ? "text-destructive border-destructive/40 hover:bg-destructive/10" : "text-muted-foreground"}`}
    >
      {children}
    </button>
  );
}

function TabPill({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`h-10 px-3 rounded-md border text-sm font-medium inline-flex items-center justify-between gap-2 transition ${
        active ? "bg-primary/10 border-primary text-primary" : "bg-card border-border hover:bg-accent"
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="text-sky-500">{icon}</span>{label}
      </span>
      {count != null && <span className="text-xs text-sky-500 font-semibold">{count}</span>}
    </button>
  );
}

function Stat({ label, value, big, withInfo }: { label: string; value: string; big?: boolean; withInfo?: boolean }) {
  return (
    <div className={`px-2 py-1 border-r border-border last:border-r-0 ${big ? "bg-[color:var(--success)]/15" : "bg-slate-50 dark:bg-slate-900/40"}`}>
      <div className="text-[9px] font-extrabold tracking-widest text-slate-600 dark:text-slate-300 uppercase inline-flex items-center gap-1 justify-center leading-tight">
        {label}{withInfo && <Info className="size-3 text-sky-500" />}
      </div>
      <div className={`tabular-nums font-extrabold leading-tight ${big ? "text-base text-[color:var(--success)]" : "text-sm text-slate-900 dark:text-slate-50"}`}>{value}</div>
    </div>
  );
}

function StatInput({ label, value, onChange, tone }: { label: string; value: number; onChange: (n: number) => void; tone?: "danger" }) {
  return (
    <div className="px-1.5 py-1 border-r border-border last:border-r-0 bg-slate-50 dark:bg-slate-900/40">
      <div className={`text-[9px] font-extrabold tracking-widest uppercase text-center leading-tight ${tone === "danger" ? "text-destructive" : "text-slate-600 dark:text-slate-300"}`}>{label}</div>
      <input
        type="number" min={0} step="0.01"
        value={value || ""}
        onChange={(e) => onChange(Math.max(0, +e.target.value || 0))}
        placeholder="0.00"
        className="mt-0.5 w-full h-6 px-1 rounded-md border border-border bg-background text-center text-xs font-extrabold tabular-nums outline-none focus:border-primary"
      />
    </div>
  );
}

function ActBtn({ onClick, icon, label, tone, active, disabled }: { onClick?: () => void; icon: React.ReactNode; label: string; tone: "danger" | "muted" | "warning" | "info" | "dark" | "success"; active?: boolean; disabled?: boolean }) {
  const base: Record<string, string> = {
    danger: "bg-destructive text-destructive-foreground hover:opacity-90",
    muted: "bg-slate-500 text-white hover:bg-slate-600",
    warning: active ? "bg-amber-600 text-white" : "bg-amber-500 text-white hover:bg-amber-600",
    info: active ? "bg-sky-700 text-white" : "bg-sky-600 text-white hover:bg-sky-700",
    dark: active ? "bg-slate-900 text-white" : "bg-slate-800 text-white hover:bg-slate-900",
    success: "bg-[color:var(--success)] text-[color:var(--success-foreground)] hover:opacity-90",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-8 px-1.5 rounded-md text-[11px] font-bold inline-flex items-center justify-center gap-1 disabled:opacity-50 ${base[tone]}`}
    >
      {icon}<span className="truncate">{label}</span>
    </button>
  );
}

function FooterMini({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-0.5 px-2 ${active ? "text-primary" : ""}`}>
      {icon}
      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  );
}


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

function LiveClock({ register }: { register: RegisterSession | null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  let h = now.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  const timeStr = `${pad(h)}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${ampm}`;
  let elapsed = "";
  if (register?.opened_at) {
    const diff = Math.max(0, Math.floor((now.getTime() - new Date(register.opened_at).getTime()) / 1000));
    const hh = Math.floor(diff / 3600);
    const mm = Math.floor((diff % 3600) / 60);
    const ss = diff % 60;
    elapsed = `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  }
  return (
    <div className="hidden sm:inline-flex items-center gap-2 h-8 px-2.5 rounded-md border border-border bg-muted/40 text-[11px] font-mono tabular-nums leading-none">
      <Clock className="size-3.5 text-primary" />
      <span className="text-muted-foreground">{dateStr}</span>
      <span className="font-semibold text-foreground">{timeStr}</span>
      {elapsed && (
        <span className="pl-2 ml-1 border-l border-border text-[color:var(--success)] font-semibold" title="Register uptime">
          ⏱ {elapsed}
        </span>
      )}
    </div>
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
