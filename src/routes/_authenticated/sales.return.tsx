import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { Search, Filter, Undo2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";

export const Route = createFileRoute("/_authenticated/sales/return")({
  head: () => ({ meta: [{ title: "Return Sale · Muzahid Food" }] }),
  component: ReturnSale,
});

type Reason = "damaged" | "wrong_item" | "customer_request" | "expired" | "other";
const REASONS: { value: Reason; label: string }[] = [
  { value: "damaged", label: "Damaged" },
  { value: "wrong_item", label: "Wrong item" },
  { value: "customer_request", label: "Customer request" },
  { value: "expired", label: "Expired" },
  { value: "other", label: "Other" },
];
const reasonLabel = (r: Reason) => REASONS.find((x) => x.value === r)?.label ?? r;
const reasonTone: Record<Reason, "danger" | "warning" | "neutral"> = {
  damaged: "danger", expired: "danger", wrong_item: "warning", customer_request: "neutral", other: "neutral",
};

type Row = {
  id: string; code: string; created_at: string; sale_id: string | null;
  invoice_ref: string | null; customer_name: string | null; amount: number;
  reason: Reason; showroom_id: string | null; item_count: number;
};

const sb = supabase as any;

function ReturnSale() {
  const { currentShowroomId, showrooms } = useShowroomScope();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [reason, setReason] = useState<"All" | Reason>("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showNew, setShowNew] = useState(false);

  const showroomName = useMemo(() => {
    const m = new Map(showrooms.map((s) => [s.id, s.name] as const));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "All");
  }, [showrooms]);

  const refresh = async () => {
    setLoading(true);
    let query = sb
      .from("sale_returns")
      .select("id,code,created_at,sale_id,invoice_ref,customer_name,amount,reason,showroom_id,sale_return_items(id)")
      .order("created_at", { ascending: false });
    if (currentShowroomId) query = query.eq("showroom_id", currentShowroomId);
    const { data, error } = await query;
    if (error) {
      console.error(error);
      setRows([]);
    } else {
      setRows(
        (data ?? []).map((r: any) => ({
          id: r.id, code: r.code, created_at: r.created_at, sale_id: r.sale_id,
          invoice_ref: r.invoice_ref, customer_name: r.customer_name,
          amount: Number(r.amount) || 0, reason: r.reason as Reason,
          showroom_id: r.showroom_id, item_count: r.sale_return_items?.length ?? 0,
        })),
      );
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentShowroomId]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (reason !== "All" && r.reason !== reason) return false;
        const date = r.created_at.slice(0, 10);
        if (from && date < from) return false;
        if (to && date > to) return false;
        if (q) {
          const s = q.toLowerCase();
          const hay = `${r.code} ${r.invoice_ref ?? ""} ${r.customer_name ?? ""}`.toLowerCase();
          if (!hay.includes(s)) return false;
        }
        return true;
      }),
    [rows, q, reason, from, to],
  );

  const total = filtered.reduce((s, r) => s + r.amount, 0);

  const remove = async (id: string) => {
    if (!confirm("Delete this return?")) return;
    const { error } = await sb.from("sale_returns").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    refresh();
  };

  return (
    <AppShell
      title="Return Sale"
      subtitle="Refunds and returned items"
      actions={
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
          <Plus className="size-4" /> New Return
        </button>
      }
    >
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3 text-sm">
          <Filter className="size-4 text-muted-foreground" />
          <span className="font-medium">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search return, invoice or customer…"
              className="w-full h-10 pl-8 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary" />
          </div>
          <select value={reason} onChange={(e) => setReason(e.target.value as any)} className="w-full h-10 px-2.5 rounded-md border border-border bg-background text-sm truncate">
            <option value="All">All reasons</option>
            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full h-10 min-w-0 px-2.5 rounded-md border border-border bg-background text-sm" />
          <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full h-10 min-w-0 px-2.5 rounded-md border border-border bg-background text-sm" />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Returns</div><div className="text-lg font-semibold mt-1">{filtered.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Refunded amount</div><div className="text-lg font-semibold mt-1 tabular-nums text-destructive">৳{total.toFixed(2)}</div></Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Return #</th>
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-4 py-2.5">Invoice</th>
                <th className="text-left px-4 py-2.5">Customer</th>
                <th className="text-left px-4 py-2.5">Branch</th>
                <th className="text-right px-4 py-2.5">Items</th>
                <th className="text-right px-4 py-2.5">Refund</th>
                <th className="text-left px-4 py-2.5">Reason</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-accent/40">
                  <td className="px-4 py-2.5 font-medium">#{r.code}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.created_at.slice(0, 10)}</td>
                  <td className="px-4 py-2.5">{r.invoice_ref ? `#${r.invoice_ref}` : "—"}</td>
                  <td className="px-4 py-2.5">{r.customer_name || "Walk-in Customer"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{showroomName(r.showroom_id)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.item_count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-destructive">-৳{r.amount.toFixed(2)}</td>
                  <td className="px-4 py-2.5"><Badge tone={reasonTone[r.reason]}>{reasonLabel(r.reason)}</Badge></td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => remove(r.id)} className="size-7 grid place-items-center rounded hover:bg-accent text-muted-foreground" title="Delete return"><Undo2 className="size-3.5" /></button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center text-sm text-muted-foreground py-10">No returns match your filters</td></tr>
              )}
              {loading && (
                <tr><td colSpan={9} className="text-center text-sm text-muted-foreground py-10">Loading…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {showNew && (
        <NewReturnModal
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); refresh(); }}
        />
      )}
    </AppShell>
  );
}

function NewReturnModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { currentShowroomId } = useShowroomScope();
  const [saleQuery, setSaleQuery] = useState("");
  const [saleMatches, setSaleMatches] = useState<any[]>([]);
  const [sale, setSale] = useState<any | null>(null);
  const [saleItems, setSaleItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [conditions, setConditions] = useState<Record<string, "resellable" | "damaged" | "expired">>({});
  const [reason, setReason] = useState<Reason>("damaged");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancel = false;
    const t = setTimeout(async () => {
      if (!saleQuery.trim()) { setSaleMatches([]); return; }
      let q = sb.from("sales").select("id,customer_name,customer_phone,total,created_at,showroom_id").order("created_at", { ascending: false }).limit(20);
      if (currentShowroomId) q = q.eq("showroom_id", currentShowroomId);
      const s = saleQuery.trim();
      q = q.or(`id.ilike.%${s}%,customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%`);
      const { data } = await q;
      if (!cancel) setSaleMatches(data ?? []);
    }, 200);
    return () => { cancel = true; clearTimeout(t); };
  }, [saleQuery, currentShowroomId]);

  const pickSale = async (s: any) => {
    setSale(s);
    setSaleMatches([]);
    setSaleQuery("");
    const { data } = await sb.from("sale_items").select("*").eq("sale_id", s.id);
    setSaleItems(data ?? []);
    setSelected({});
    setConditions({});
  };

  const totalRefund = useMemo(
    () => saleItems.reduce((sum, it) => sum + (selected[it.id] ?? 0) * Number(it.unit_price || 0), 0),
    [saleItems, selected],
  );

  const submit = async () => {
    if (!sale) { alert("Pick a sale first"); return; }
    const items = saleItems
      .filter((it) => (selected[it.id] ?? 0) > 0)
      .map((it) => ({
        product_id: it.product_id,
        product_name: it.product_name,
        qty: selected[it.id],
        unit_price: Number(it.unit_price) || 0,
        line_total: (selected[it.id] ?? 0) * (Number(it.unit_price) || 0),
        condition: conditions[it.id] ?? "resellable",
      }));
    if (!items.length) { alert("Select at least one item to return"); return; }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { data: ret, error } = await sb
      .from("sale_returns")
      .insert({
        sale_id: sale.id,
        invoice_ref: String(sale.id).slice(0, 8),
        showroom_id: sale.showroom_id,
        customer_name: sale.customer_name,
        reason,
        amount: totalRefund,
        note: note || null,
        created_by: userRes.user?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !ret) { setSaving(false); alert(error?.message ?? "Failed"); return; }
    const { error: iErr } = await sb
      .from("sale_return_items")
      .insert(items.map((it) => ({ ...it, return_id: ret.id })));
    if (iErr) { setSaving(false); alert(iErr.message); return; }
    // Route each line by condition
    for (const it of items) {
      if (!it.product_id) continue;
      if (it.condition === "resellable") {
        await sb.rpc("commit_stock_movement", {
          _product_id: it.product_id,
          _showroom_id: sale.showroom_id,
          _qty: it.qty,
          _kind: "return",
          _ref_type: "sale_return",
          _ref_id: ret.id,
          _note: `Return ${reason}`,
        });
      } else {
        // damaged / expired → damaged bucket, NOT saleable stock
        await sb.rpc("commit_damaged_movement", {
          _product_id: it.product_id,
          _showroom_id: sale.showroom_id,
          _qty: it.qty,
          _kind: "return_in",
          _ref_type: "sale_return",
          _ref_id: ret.id,
          _note: `Return ${it.condition}`,
        });
      }
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-background rounded-lg border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">New Return</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="size-4" /></button>
        </div>
        <div className="p-4 space-y-4 text-sm">
          {!sale ? (
            <div>
              <label className="block mb-1 text-xs font-medium text-muted-foreground">Find sale</label>
              <input autoFocus value={saleQuery} onChange={(e) => setSaleQuery(e.target.value)} placeholder="Search by sale id, customer name or phone…" className="w-full h-10 px-3 rounded-md border border-border bg-background outline-none focus:border-primary" />
              {saleMatches.length > 0 && (
                <div className="mt-2 border border-border rounded-md divide-y divide-border max-h-64 overflow-y-auto">
                  {saleMatches.map((s) => (
                    <button key={s.id} onClick={() => pickSale(s)} className="w-full text-left px-3 py-2 hover:bg-accent/60">
                      <div className="font-medium">#{String(s.id).slice(0, 8)} · {s.customer_name || "Walk-in"}</div>
                      <div className="text-xs text-muted-foreground">{s.created_at.slice(0, 10)} · ৳{Number(s.total).toFixed(2)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                <div>
                  <div className="font-medium">#{String(sale.id).slice(0, 8)} · {sale.customer_name || "Walk-in"}</div>
                  <div className="text-xs text-muted-foreground">{sale.created_at.slice(0, 10)} · Sale total ৳{Number(sale.total).toFixed(2)}</div>
                </div>
                <button onClick={() => { setSale(null); setSaleItems([]); setSelected({}); }} className="text-xs underline text-muted-foreground">Change</button>
              </div>
              <div className="border border-border rounded-md divide-y divide-border">
                {saleItems.length === 0 && <div className="p-3 text-muted-foreground text-xs">No items on this sale.</div>}
                {saleItems.map((it) => (
                  <div key={it.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1">
                      <div className="font-medium">{it.product_name}</div>
                      <div className="text-xs text-muted-foreground">Sold {Number(it.qty)} × ৳{Number(it.unit_price).toFixed(2)}</div>
                    </div>
                    <select
                      value={conditions[it.id] ?? "resellable"}
                      onChange={(e) => setConditions({ ...conditions, [it.id]: e.target.value as any })}
                      className="h-9 px-2 rounded-md border border-border bg-background text-xs"
                      title="Condition of returned item"
                    >
                      <option value="resellable">Resellable</option>
                      <option value="damaged">Damaged</option>
                      <option value="expired">Expired</option>
                    </select>
                    <input
                      type="number" min={0} max={Number(it.qty)} step="1"
                      value={selected[it.id] ?? 0}
                      onChange={(e) => setSelected({ ...selected, [it.id]: Math.max(0, Math.min(Number(it.qty), +e.target.value || 0)) })}
                      className="w-20 h-9 px-2 rounded-md border border-border bg-background text-right"
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Reason</span>
                  <select value={reason} onChange={(e) => setReason(e.target.value as Reason)} className="w-full h-10 mt-1 px-2 rounded-md border border-border bg-background">
                    {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </label>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Refund total</span>
                  <div className="mt-1 h-10 flex items-center justify-end px-3 rounded-md bg-muted/50 font-semibold tabular-nums text-destructive">৳{totalRefund.toFixed(2)}</div>
                </div>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Note</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background outline-none focus:border-primary" />
              </label>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">Cancel</button>
          <button onClick={submit} disabled={saving || !sale} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {saving ? "Saving…" : "Save return"}
          </button>
        </div>
      </div>
    </div>
  );
}