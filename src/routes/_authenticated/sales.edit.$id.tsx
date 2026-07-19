import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save, Trash2, Plus, Search, Loader2, AlertCircle, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { pageTitle } from "@/lib/company-settings";
import { PermissionGate } from "@/components/permission-gate";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/sales/edit/$id")({
  head: ({ params }) => ({ meta: [{ title: pageTitle(`Edit Sale #${params.id}`) }] }),
  component: () => (
    <PermissionGate anyOf={["sales.edit"]} title="Edit Sale">
      <EditSalePage />
    </PermissionGate>
  ),
});

type SaleRow = {
  id: string;
  external_ref: string | null;
  showroom_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: number; discount: number; tax: number; shipping: number;
  total: number; paid: number; due: number;
  payment_mode: string | null;
  created_at: string;
};

type LineRow = {
  id?: string;              // existing sale_items row id (undefined when new)
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  qty: number;
  unit_price: number;
  // original qty for stock delta (undefined = fully new line)
  original_qty?: number;
};

type Product = { id: string; name: string; sku: string | null; price: number };

function EditSalePage() {
  const { id } = useParams({ from: "/_authenticated/sales/edit/$id" });
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sale, setSale] = useState<SaleRow | null>(null);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [originalLines, setOriginalLines] = useState<LineRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMode, setPaymentMode] = useState<string>("cash");
  const [showroomName, setShowroomName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        // Resolve by UUID or external_ref
        let row: any = null;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (isUuid) {
          const { data } = await sb.from("sales").select("*").eq("id", id).maybeSingle();
          row = data;
        }
        if (!row) {
          const { data } = await sb.from("sales").select("*").eq("external_ref", id).maybeSingle();
          row = data;
        }
        if (!row) {
          const { data } = await sb.from("sales").select("*").ilike("id", `${id}%`).limit(1).maybeSingle();
          row = data;
        }
        if (!row) throw new Error(`Sale not found: ${id}`);
        if (cancelled) return;
        setSale(row);
        setCustomerName(row.customer_name || "");
        setCustomerPhone(row.customer_phone || "");
        setDiscount(Number(row.discount || 0));
        setTax(Number(row.tax || 0));
        setShipping(Number(row.shipping || 0));
        setPaymentMode(row.payment_mode || "cash");

        const [{ data: items }, { data: sh }, { data: prods }] = await Promise.all([
          sb.from("sale_items").select("*").eq("sale_id", row.id),
          row.showroom_id
            ? sb.from("showrooms").select("name").eq("id", row.showroom_id).maybeSingle()
            : Promise.resolve({ data: null }),
          sb.from("products").select("id,name,sku,price").order("name").limit(500),
        ]);
        if (cancelled) return;

        const mapped: LineRow[] = (items ?? []).map((r: any) => ({
          id: r.id,
          product_id: r.product_id,
          product_name: r.product_name,
          product_sku: r.product_sku,
          qty: Number(r.qty),
          unit_price: Number(r.unit_price),
          original_qty: Number(r.qty),
        }));
        setLines(mapped);
        setOriginalLines(mapped.map((l) => ({ ...l })));
        setShowroomName(sh?.name || (row.showroom_id ? "Showroom" : "Factory"));
        setProducts(
          (prods ?? []).map((p: any) => ({
            id: p.id, name: p.name, sku: p.sku, price: Number(p.price || 0),
          })),
        );
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load sale");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.qty * l.unit_price, 0),
    [lines],
  );
  const total = Math.max(0, subtotal - Number(discount || 0) + Number(tax || 0) + Number(shipping || 0));
  const due = Math.max(0, total - Number(sale?.paid || 0));

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q),
    ).slice(0, 8);
  }, [products, productSearch]);

  function addProduct(p: Product) {
    setLines((prev) => {
      const existing = prev.findIndex((l) => l.product_id === p.id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], qty: next[existing].qty + 1 };
        return next;
      }
      return [
        ...prev,
        { product_id: p.id, product_name: p.name, product_sku: p.sku, qty: 1, unit_price: p.price },
      ];
    });
    setProductSearch("");
  }

  function updateLine(idx: number, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!sale) return;
    setSaving(true); setError(null);
    try {
      if (lines.length === 0) throw new Error("At least one line item is required");
      if (lines.some((l) => l.qty <= 0)) throw new Error("Quantities must be greater than zero");

      // 1. Stock delta: reverse old, apply new
      const oldMap = new Map<string, number>();
      for (const l of originalLines) if (l.product_id) oldMap.set(l.product_id, (oldMap.get(l.product_id) || 0) + l.qty);
      const newMap = new Map<string, number>();
      for (const l of lines) if (l.product_id) newMap.set(l.product_id, (newMap.get(l.product_id) || 0) + l.qty);

      const productIds = new Set<string>([...oldMap.keys(), ...newMap.keys()]);
      const stockOps: Promise<any>[] = [];
      for (const pid of productIds) {
        const delta = (oldMap.get(pid) || 0) - (newMap.get(pid) || 0); // positive = stock returned, negative = more consumed
        if (delta !== 0) {
          stockOps.push(
            sb.rpc("commit_stock_movement", {
              _product_id: pid,
              _showroom_id: sale.showroom_id,
              _qty: delta,
              _kind: "sale_edit",
              _ref_type: "sale",
              _ref_id: sale.id,
              _note: "Adjusted via sale edit",
            }),
          );
        }
      }
      const stockResults = await Promise.all(stockOps);
      for (const r of stockResults) if ((r as any)?.error) throw new Error((r as any).error.message);

      // 2. Replace sale_items: delete existing, insert current
      const { error: delErr } = await sb.from("sale_items").delete().eq("sale_id", sale.id);
      if (delErr) throw delErr;
      const insertRows = lines.map((l) => ({
        sale_id: sale.id,
        product_id: l.product_id,
        product_name: l.product_name,
        product_sku: l.product_sku,
        qty: l.qty,
        unit_price: l.unit_price,
        line_total: +(l.qty * l.unit_price).toFixed(2),
      }));
      const { error: insErr } = await sb.from("sale_items").insert(insertRows);
      if (insErr) throw insErr;

      // 3. Update sale totals
      const { error: upErr } = await sb
        .from("sales")
        .update({
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.trim() || null,
          subtotal: +subtotal.toFixed(2),
          discount: +Number(discount || 0).toFixed(2),
          tax: +Number(tax || 0).toFixed(2),
          shipping: +Number(shipping || 0).toFixed(2),
          total: +total.toFixed(2),
          due: +due.toFixed(2),
          payment_mode: paymentMode,
        })
        .eq("id", sale.id);
      if (upErr) throw upErr;

      navigate({ to: "/sales/list" });
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell title="Edit Sale" subtitle="Loading…">
        <Card><div className="py-14 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading sale…</div></Card>
      </AppShell>
    );
  }

  if (error && !sale) {
    return (
      <AppShell title="Edit Sale" subtitle="Error">
        <Card>
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <div className="text-sm text-destructive">{error}</div>
            <Link to="/sales/list" className="text-sm underline">Back to Sale List</Link>
          </div>
        </Card>
      </AppShell>
    );
  }

  if (!sale) return null;

  return (
    <AppShell title={`Edit Sale ${sale.external_ref ?? "#" + sale.id.slice(0, 8)}`} subtitle={`${showroomName} · ${new Date(sale.created_at).toLocaleString()}`}>
      <div className="mb-3 flex items-center justify-between">
        <Link to="/sales/list" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Sale List
        </Link>
        <a href={`/invoice/${sale.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border hover:bg-accent">
          <Printer className="size-4" /> View Invoice
        </a>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="size-4" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Customer */}
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">Customer</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Field label="Name">
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="input-field" placeholder="Walk-in Customer" />
              </Field>
              <Field label="Phone">
                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="input-field" />
              </Field>
            </div>
          </Card>

          {/* Line items */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">Line items</div>
              <div className="text-xs text-muted-foreground">{lines.length} item{lines.length === 1 ? "" : "s"}</div>
            </div>

            {/* Product search */}
            <div className="relative mb-3">
              <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search product to add…"
                className="input-field pl-8"
              />
              {productSearch && filteredProducts.length > 0 && (
                <div className="absolute z-10 mt-1 left-0 right-0 bg-popover border border-border rounded-md shadow-md max-h-64 overflow-auto">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent text-left"
                    >
                      <span>
                        <span className="font-medium">{p.name}</span>
                        {p.sku && <span className="ml-2 text-xs text-muted-foreground">{p.sku}</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">৳{p.price.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                    <th className="py-2 pr-2">Product</th>
                    <th className="py-2 px-2 w-24">Qty</th>
                    <th className="py-2 px-2 w-32">Unit price</th>
                    <th className="py-2 px-2 w-28 text-right">Total</th>
                    <th className="py-2 pl-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No items. Search a product above to add.</td></tr>
                  )}
                  {lines.map((l, i) => (
                    <tr key={l.id ?? `new-${i}`} className="border-b border-border last:border-0">
                      <td className="py-2 pr-2">
                        <div className="font-medium">{l.product_name}</div>
                        {l.product_sku && <div className="text-xs text-muted-foreground">{l.product_sku}</div>}
                      </td>
                      <td className="py-2 px-2">
                        <input type="number" min={0} step="1" value={l.qty}
                          onChange={(e) => updateLine(i, { qty: +e.target.value })}
                          className="input-field" />
                      </td>
                      <td className="py-2 px-2">
                        <input type="number" min={0} step="0.01" value={l.unit_price}
                          onChange={(e) => updateLine(i, { unit_price: +e.target.value })}
                          className="input-field" />
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">৳{(l.qty * l.unit_price).toFixed(2)}</td>
                      <td className="py-2 pl-2 text-right">
                        <button type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">Summary</div>
            <div className="space-y-2 text-sm">
              <Row label="Subtotal" value={`৳${subtotal.toFixed(2)}`} />
              <Field label="Discount (৳)">
                <input type="number" min={0} step="0.01" value={discount}
                  onChange={(e) => setDiscount(+e.target.value)} className="input-field" />
              </Field>
              <Field label="Tax (৳)">
                <input type="number" min={0} step="0.01" value={tax}
                  onChange={(e) => setTax(+e.target.value)} className="input-field" />
              </Field>
              <Field label="Shipping (৳)">
                <input type="number" min={0} step="0.01" value={shipping}
                  onChange={(e) => setShipping(+e.target.value)} className="input-field" />
              </Field>
              <div className="border-t border-border pt-2 mt-2 space-y-1.5">
                <Row label="Total" value={`৳${total.toFixed(2)}`} strong />
                <Row label="Paid" value={`৳${Number(sale.paid || 0).toFixed(2)}`} />
                <Row label="Due" value={`৳${due.toFixed(2)}`} tone={due > 0 ? "danger" : "ok"} strong />
              </div>
              <div className="text-xs text-muted-foreground pt-2">
                Received payments are managed via the <Link to="/sales/list" className="underline">Sales list → Receive payment</Link> action.
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">Payment mode</div>
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className="input-field">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bkash">bKash</option>
              <option value="nagad">Nagad</option>
              <option value="bank">Bank</option>
              <option value="credit">Credit (due)</option>
              <option value="multi">Multi-tender</option>
            </select>
          </Card>

          <div className="flex flex-col gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : <><Save className="size-4" /> Save changes</>}
            </button>
            <Link to="/sales/list" className="w-full text-center px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">
              Cancel
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        .input-field{width:100%;padding:0.5rem 0.625rem;border:1px solid hsl(var(--border));border-radius:0.375rem;background:hsl(var(--background));outline:none;font-size:0.875rem}
        .input-field:focus{border-color:hsl(var(--primary))}
      `}</style>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "danger" | "ok" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""} ${tone === "danger" ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}

// Keep icons imported to avoid tree-shake removal in build
void Plus;
