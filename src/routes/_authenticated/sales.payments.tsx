import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { Search, Filter, Plus, X, Trash2, ExternalLink, MoreHorizontal, Wallet, BookOpen, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReceivePaymentDialog } from "@/components/receive-payment-dialog";

export const Route = createFileRoute("/_authenticated/sales/payments")({
  head: () => ({ meta: [{ title: "Customer Payments · Muzahid Food" }] }),
  component: CustomerPayments,
});

const METHODS = ["cash", "bank", "mobile", "card", "cheque", "other"] as const;

type Row = {
  id: string; paid_on: string;
  customer_name: string | null; customer_phone: string | null;
  sale_id: string | null; invoice_ref: string | null;
  sale_total: number | null; sale_due: number | null;
  amount: number; method: string; reference: string | null; note: string | null;
  showroom_id: string | null;
};

const sb = supabase as any;

function CustomerPayments() {
  const { currentShowroomId, showrooms } = useShowroomScope();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [method, setMethod] = useState<string>("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [invoice, setInvoice] = useState<any | null>(null);

  const showroomName = useMemo(() => {
    const m = new Map(showrooms.map((s) => [s.id, s.name] as const));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "All");
  }, [showrooms]);

  const refresh = async () => {
    setLoading(true);
    let query = sb.from("customer_payments")
      .select("id,paid_on,amount,method,reference,note,showroom_id,sale_id,invoice_ref,customer_name,customer_phone,sales(total,due)")
      .order("paid_on", { ascending: false }).order("created_at", { ascending: false });
    if (currentShowroomId) query = query.eq("showroom_id", currentShowroomId);
    const { data, error } = await query;
    if (error) { console.error(error); setRows([]); }
    else setRows((data ?? []).map((r: any) => ({
      id: r.id, paid_on: r.paid_on, customer_name: r.customer_name, customer_phone: r.customer_phone,
      sale_id: r.sale_id, invoice_ref: r.invoice_ref,
      sale_total: r.sales?.total ? Number(r.sales.total) : null,
      sale_due: r.sales?.due != null ? Number(r.sales.due) : null,
      amount: Number(r.amount) || 0, method: r.method, reference: r.reference,
      note: r.note, showroom_id: r.showroom_id,
    })));
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentShowroomId]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (method !== "All" && r.method !== method) return false;
    if (from && r.paid_on < from) return false;
    if (to && r.paid_on > to) return false;
    const s = q.trim().toLowerCase();
    if (s) {
      const terms = s.split(/\s+/);
      const hay = [
        r.customer_name,
        r.customer_phone,
        r.invoice_ref,
        r.sale_id,
        r.sale_id ? String(r.sale_id).slice(0, 8) : "",
        r.reference,
        r.note,
        r.method,
        showroomName(r.showroom_id),
        r.paid_on,
        r.amount.toFixed(2),
      ].filter(Boolean).join(" ").toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  }), [rows, q, method, from, to, showroomName]);


  const total = filtered.reduce((s, r) => s + r.amount, 0);

  const remove = async (id: string) => {
    if (!confirm("Delete this payment?")) return;
    const { error } = await sb.from("customer_payments").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    refresh();
  };

  const openInvoice = async (r: Row) => {
    if (!r.sale_id) return;
    const { data: sale } = await sb.from("sales").select("*").eq("id", r.sale_id).maybeSingle();
    const { data: items } = await sb.from("sale_items").select("*").eq("sale_id", r.sale_id);
    setInvoice({ sale, items: items ?? [] });
  };

  return (
    <AppShell
      title="Customer Payments"
      subtitle="Inbound payments and receipts against sale invoices"
      actions={
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
          <Plus className="size-4" /> Record Payment
        </button>
      }
    >
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3 text-sm">
          <Filter className="size-4 text-muted-foreground" /><span className="font-medium">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, invoice or reference…"
              className="w-full h-10 pl-8 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary" />
          </div>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full h-10 px-2.5 rounded-md border border-border bg-background text-sm">
            <option value="All">All methods</option>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full h-10 px-2.5 rounded-md border border-border bg-background text-sm" />
          <input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className="w-full h-10 px-2.5 rounded-md border border-border bg-background text-sm" />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Payments</div><div className="text-lg font-semibold mt-1">{filtered.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total received</div><div className="text-lg font-semibold mt-1 tabular-nums text-emerald-600">৳{total.toFixed(2)}</div></Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-4 py-2.5">Customer</th>
                <th className="text-left px-4 py-2.5">Invoice</th>
                <th className="text-left px-4 py-2.5">Branch</th>
                <th className="text-left px-4 py-2.5">Method</th>
                <th className="text-left px-4 py-2.5">Reference</th>
                <th className="text-right px-4 py-2.5">Amount</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-accent/40">
                  <td className="px-4 py-2.5 text-muted-foreground">{r.paid_on}</td>
                  <td className="px-4 py-2.5 font-medium">{r.customer_name || "Walk-in"}<div className="text-xs text-muted-foreground">{r.customer_phone ?? ""}</div></td>
                  <td className="px-4 py-2.5">
                    {r.sale_id ? (
                      <button onClick={() => openInvoice(r)} className="inline-flex items-center gap-1 text-primary hover:underline">
                        #{r.invoice_ref ?? String(r.sale_id).slice(0, 8)} <ExternalLink className="size-3" />
                      </button>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{showroomName(r.showroom_id)}</td>
                  <td className="px-4 py-2.5 capitalize">{r.method}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.reference ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">৳{r.amount.toFixed(2)}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => remove(r.id)} className="size-7 grid place-items-center rounded hover:bg-accent text-muted-foreground"><Trash2 className="size-3.5" /></button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center text-sm text-muted-foreground py-10">No payments match your filters</td></tr>
              )}
              {loading && (
                <tr><td colSpan={8} className="text-center text-sm text-muted-foreground py-10">Loading…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showNew && <NewPayment onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); refresh(); }} />}
      {invoice && <InvoiceModal data={invoice} onClose={() => setInvoice(null)} />}
    </AppShell>
  );
}

function InvoiceModal({ data, onClose }: { data: { sale: any; items: any[] }; onClose: () => void }) {
  const { sale, items } = data;
  if (!sale) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-background rounded-lg border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="font-semibold">Invoice #{String(sale.id).slice(0, 8)}</h2>
            <div className="text-xs text-muted-foreground">{sale.customer_name || "Walk-in"} · {sale.created_at?.slice(0, 10)}</div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/invoice/$id" params={{ id: sale.id }} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Open full <ExternalLink className="size-3" /></Link>
            <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="size-4" /></button>
          </div>
        </div>
        <div className="p-4 text-sm">
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left py-1.5">Item</th><th className="text-right py-1.5">Qty</th><th className="text-right py-1.5">Price</th><th className="text-right py-1.5">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="py-1.5">{it.product_name}</td>
                  <td className="py-1.5 text-right tabular-nums">{Number(it.qty)}</td>
                  <td className="py-1.5 text-right tabular-nums">৳{Number(it.unit_price).toFixed(2)}</td>
                  <td className="py-1.5 text-right tabular-nums">৳{(Number(it.qty) * Number(it.unit_price)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="mt-4 space-y-1 text-right">
            <div>Subtotal: <span className="tabular-nums">৳{Number(sale.subtotal).toFixed(2)}</span></div>
            <div>Discount: <span className="tabular-nums">৳{Number(sale.discount).toFixed(2)}</span></div>
            <div>Tax: <span className="tabular-nums">৳{Number(sale.tax).toFixed(2)}</span></div>
            <div className="font-semibold">Total: <span className="tabular-nums">৳{Number(sale.total).toFixed(2)}</span></div>
            <div className="text-emerald-600">Paid: <span className="tabular-nums">৳{Number(sale.paid).toFixed(2)}</span></div>
            <div className="text-destructive">Due: <span className="tabular-nums">৳{Number(sale.due).toFixed(2)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewPayment({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { currentShowroomId } = useShowroomScope();
  const [saleQuery, setSaleQuery] = useState("");
  const [saleMatches, setSaleMatches] = useState<any[]>([]);
  const [sale, setSale] = useState<any | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState<string>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancel = false;
    const t = setTimeout(async () => {
      if (!saleQuery.trim()) { setSaleMatches([]); return; }
      let q = sb.from("sales").select("id,customer_name,customer_phone,total,paid,due,created_at,showroom_id")
        .order("created_at", { ascending: false }).limit(15);
      if (currentShowroomId) q = q.eq("showroom_id", currentShowroomId);
      const s = saleQuery.trim();
      q = q.or(`id.ilike.%${s}%,customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%`);
      const { data } = await q;
      if (!cancel) setSaleMatches(data ?? []);
    }, 200);
    return () => { cancel = true; clearTimeout(t); };
  }, [saleQuery, currentShowroomId]);

  const pick = (s: any) => {
    setSale(s); setSaleMatches([]); setSaleQuery("");
    setCustomerName(s.customer_name ?? "");
    setCustomerPhone(s.customer_phone ?? "");
    setAmount(Number(s.due) || 0);
  };

  const submit = async () => {
    if (!amount || amount <= 0) { alert("Enter an amount"); return; }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await sb.from("customer_payments").insert({
      sale_id: sale?.id ?? null,
      invoice_ref: sale ? String(sale.id).slice(0, 8) : null,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      showroom_id: sale?.showroom_id ?? currentShowroomId,
      paid_on: paidOn,
      amount,
      method,
      reference: reference || null,
      note: note || null,
      created_by: userRes.user?.id ?? null,
    });
    if (error) { setSaving(false); alert(error.message); return; }
    if (sale) {
      const newPaid = Number(sale.paid || 0) + amount;
      const newDue = Math.max(0, Number(sale.total || 0) - newPaid);
      await sb.from("sales").update({ paid: newPaid, due: newDue }).eq("id", sale.id);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-background rounded-lg border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">Record Customer Payment</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="size-4" /></button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          {!sale ? (
            <div>
              <label className="block mb-1 text-xs font-medium text-muted-foreground">Link to invoice (optional)</label>
              <input value={saleQuery} onChange={(e) => setSaleQuery(e.target.value)} placeholder="Search sale id, customer or phone…" className="w-full h-10 px-3 rounded-md border border-border bg-background outline-none focus:border-primary" />
              {saleMatches.length > 0 && (
                <div className="mt-2 border border-border rounded-md divide-y divide-border max-h-56 overflow-y-auto">
                  {saleMatches.map((s) => (
                    <button key={s.id} onClick={() => pick(s)} className="w-full text-left px-3 py-2 hover:bg-accent/60">
                      <div className="font-medium">#{String(s.id).slice(0, 8)} · {s.customer_name || "Walk-in"}</div>
                      <div className="text-xs text-muted-foreground">{s.created_at.slice(0, 10)} · Total ৳{Number(s.total).toFixed(2)} · Due ৳{Number(s.due).toFixed(2)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
              <div>
                <div className="font-medium">#{String(sale.id).slice(0, 8)} · {sale.customer_name || "Walk-in"}</div>
                <div className="text-xs text-muted-foreground">{sale.created_at.slice(0, 10)} · Total ৳{Number(sale.total).toFixed(2)} · Due ৳{Number(sale.due).toFixed(2)}</div>
              </div>
              <button onClick={() => setSale(null)} className="text-xs underline text-muted-foreground">Change</button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Customer name</span>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full h-10 mt-1 px-2 rounded-md border border-border bg-background" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Phone</span>
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="w-full h-10 mt-1 px-2 rounded-md border border-border bg-background" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Date</span>
              <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="w-full h-10 mt-1 px-2 rounded-md border border-border bg-background" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Amount (৳)</span>
              <input type="number" min={0} step="0.01" value={amount || ""} onChange={(e) => setAmount(+e.target.value || 0)} className="w-full h-10 mt-1 px-2 rounded-md border border-border bg-background text-right" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Method</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full h-10 mt-1 px-2 rounded-md border border-border bg-background">
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Reference</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="TXN / cheque #" className="w-full h-10 mt-1 px-2 rounded-md border border-border bg-background" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Note</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background outline-none focus:border-primary" />
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {saving ? "Saving…" : "Save payment"}
          </button>
        </div>
      </div>
    </div>
  );
}