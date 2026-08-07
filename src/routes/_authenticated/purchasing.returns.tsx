import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { Search, Filter, Undo2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { scopeTo } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/purchasing/returns")({
  head: () => ({ meta: [{ title: "Purchase Returns · Muzahid Food" }] }),
  component: PurchaseReturns,
});

type Reason = "damaged" | "wrong_item" | "expired" | "overstock" | "quality" | "other";
const REASONS: { value: Reason; label: string }[] = [
  { value: "damaged", label: "Damaged" },
  { value: "wrong_item", label: "Wrong item" },
  { value: "expired", label: "Expired" },
  { value: "overstock", label: "Overstock" },
  { value: "quality", label: "Quality" },
  { value: "other", label: "Other" },
];
const reasonLabel = (r: Reason) => REASONS.find((x) => x.value === r)?.label ?? r;
const tone: Record<Reason, "danger" | "warning" | "neutral"> = {
  damaged: "danger", expired: "danger", quality: "warning", wrong_item: "warning", overstock: "neutral", other: "neutral",
};

type Row = {
  id: string; code: string; created_at: string; purchase_id: string | null;
  invoice_ref: string | null; supplier_name: string | null; amount: number;
  reason: Reason; showroom_id: string | null; item_count: number;
};

const sb = supabase as any;

function PurchaseReturns() {
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
      .from("purchase_returns")
      .select("id,code,created_at,purchase_id,invoice_ref,amount,reason,showroom_id,supplier_id,suppliers(name),purchase_return_items(id)")
      .order("created_at", { ascending: false });
    query = scopeTo(query, currentShowroomId, "showroom_id");
    const { data, error } = await query;
    if (error) { console.error(error); setRows([]); }
    else {
      setRows((data ?? []).map((r: any) => ({
        id: r.id, code: r.code, created_at: r.created_at, purchase_id: r.purchase_id,
        invoice_ref: r.invoice_ref, supplier_name: r.suppliers?.name ?? null,
        amount: Number(r.amount) || 0, reason: r.reason as Reason,
        showroom_id: r.showroom_id, item_count: r.purchase_return_items?.length ?? 0,
      })));
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentShowroomId]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (reason !== "All" && r.reason !== reason) return false;
    const date = r.created_at.slice(0, 10);
    if (from && date < from) return false;
    if (to && date > to) return false;
    if (q) {
      const s = q.toLowerCase();
      const hay = `${r.code} ${r.invoice_ref ?? ""} ${r.supplier_name ?? ""}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  }), [rows, q, reason, from, to]);

  const total = filtered.reduce((s, r) => s + r.amount, 0);

  const remove = async (id: string) => {
    if (!confirm("Delete this return?")) return;
    const { error } = await sb.from("purchase_returns").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    refresh();
  };

  return (
    <AppShell
      title="Purchase Returns"
      subtitle="Returns to suppliers and raw-material adjustments"
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
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search return, invoice or supplier…"
              className="w-full h-10 pl-8 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary" />
          </div>
          <select value={reason} onChange={(e) => setReason(e.target.value as any)} className="w-full h-10 px-2.5 rounded-md border border-border bg-background text-sm truncate">
            <option value="All">All reasons</option>
            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full h-10 px-2.5 rounded-md border border-border bg-background text-sm" />
          <input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className="w-full h-10 px-2.5 rounded-md border border-border bg-background text-sm" />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Returns</div><div className="text-lg font-semibold mt-1">{filtered.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Returned value</div><div className="text-lg font-semibold mt-1 tabular-nums text-destructive">৳{total.toFixed(2)}</div></Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Return #</th>
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-4 py-2.5">Invoice</th>
                <th className="text-left px-4 py-2.5">Supplier</th>
                <th className="text-left px-4 py-2.5">Branch</th>
                <th className="text-right px-4 py-2.5">Items</th>
                <th className="text-right px-4 py-2.5">Amount</th>
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
                  <td className="px-4 py-2.5">{r.supplier_name || "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{showroomName(r.showroom_id)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.item_count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-destructive">-৳{r.amount.toFixed(2)}</td>
                  <td className="px-4 py-2.5"><Badge tone={tone[r.reason]}>{reasonLabel(r.reason)}</Badge></td>
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

      {showNew && <NewReturn onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); refresh(); }} />}
    </AppShell>
  );
}

function NewReturn({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { currentShowroomId } = useShowroomScope();
  const [pQuery, setPQuery] = useState("");
  const [matches, setMatches] = useState<any[]>([]);
  const [purchase, setPurchase] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<Reason>("damaged");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancel = false;
    const t = setTimeout(async () => {
      if (!pQuery.trim()) { setMatches([]); return; }
      let q = sb.from("purchases").select("id,code,supplier_id,total,purchase_date,showroom_id,suppliers(name)").order("purchase_date", { ascending: false }).limit(20);
      q = scopeTo(q, currentShowroomId, "showroom_id");
      const s = pQuery.trim();
      q = q.or(`code.ilike.%${s}%,id.ilike.%${s}%`);
      const { data } = await q;
      if (!cancel) setMatches(data ?? []);
    }, 200);
    return () => { cancel = true; clearTimeout(t); };
  }, [pQuery, currentShowroomId]);

  const pick = async (p: any) => {
    setPurchase(p); setMatches([]); setPQuery("");
    const { data } = await sb.from("purchase_items").select("*").eq("purchase_id", p.id);
    setItems(data ?? []); setSelected({});
  };

  const totalReturn = useMemo(
    () => items.reduce((sum, it) => sum + (selected[it.id] ?? 0) * Number(it.unit_price || it.price || 0), 0),
    [items, selected],
  );

  const submit = async () => {
    if (!purchase) return;
    const chosen = items
      .filter((it) => (selected[it.id] ?? 0) > 0)
      .map((it) => ({
        material_id: it.material_id ?? null,
        material_name: it.material_name ?? it.name ?? "Item",
        qty: selected[it.id],
        unit_price: Number(it.unit_price || it.price || 0),
        line_total: (selected[it.id] ?? 0) * Number(it.unit_price || it.price || 0),
      }));
    if (!chosen.length) { alert("Select at least one item"); return; }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { data: ret, error } = await sb
      .from("purchase_returns")
      .insert({
        purchase_id: purchase.id,
        invoice_ref: purchase.code ?? String(purchase.id).slice(0, 8),
        supplier_id: purchase.supplier_id,
        showroom_id: purchase.showroom_id,
        reason,
        amount: totalReturn,
        note: note || null,
        created_by: userRes.user?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !ret) { setSaving(false); alert(error?.message ?? "Failed"); return; }
    const { error: iErr } = await sb.from("purchase_return_items").insert(chosen.map((it) => ({ ...it, return_id: ret.id })));
    if (iErr) { setSaving(false); alert(iErr.message); return; }
    // Decrease raw material stock
    for (const it of chosen) {
      if (!it.material_id) continue;
      await sb.rpc("commit_raw_stock_movement", {
        _material_id: it.material_id,
        _showroom_id: purchase.showroom_id,
        _qty: -Math.abs(it.qty),
        _kind: "adjustment",
        _ref_type: "purchase_return",
        _ref_id: ret.id,
        _note: `Return ${reason}`,
      });
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-background rounded-lg border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">New Purchase Return</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="size-4" /></button>
        </div>
        <div className="p-4 space-y-4 text-sm">
          {!purchase ? (
            <div>
              <label className="block mb-1 text-xs font-medium text-muted-foreground">Find purchase</label>
              <input autoFocus value={pQuery} onChange={(e) => setPQuery(e.target.value)} placeholder="Search by code or id…" className="w-full h-10 px-3 rounded-md border border-border bg-background outline-none focus:border-primary" />
              {matches.length > 0 && (
                <div className="mt-2 border border-border rounded-md divide-y divide-border max-h-64 overflow-y-auto">
                  {matches.map((p) => (
                    <button key={p.id} onClick={() => pick(p)} className="w-full text-left px-3 py-2 hover:bg-accent/60">
                      <div className="font-medium">#{p.code ?? String(p.id).slice(0, 8)} · {p.suppliers?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{p.purchase_date} · ৳{Number(p.total).toFixed(2)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                <div>
                  <div className="font-medium">#{purchase.code ?? String(purchase.id).slice(0, 8)} · {purchase.suppliers?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{purchase.purchase_date} · Total ৳{Number(purchase.total).toFixed(2)}</div>
                </div>
                <button onClick={() => { setPurchase(null); setItems([]); setSelected({}); }} className="text-xs underline text-muted-foreground">Change</button>
              </div>
              <div className="border border-border rounded-md divide-y divide-border">
                {items.length === 0 && <div className="p-3 text-muted-foreground text-xs">No items on this purchase.</div>}
                {items.map((it) => {
                  const maxQty = Number(it.qty || 0);
                  const price = Number(it.unit_price || it.price || 0);
                  return (
                    <div key={it.id} className="flex items-center gap-3 p-3">
                      <div className="flex-1">
                        <div className="font-medium">{it.material_name ?? it.name ?? "Item"}</div>
                        <div className="text-xs text-muted-foreground">Received {maxQty} × ৳{price.toFixed(2)}</div>
                      </div>
                      <input
                        type="number" min={0} max={maxQty} step="0.001"
                        value={selected[it.id] ?? 0}
                        onChange={(e) => setSelected({ ...selected, [it.id]: Math.max(0, Math.min(maxQty, +e.target.value || 0)) })}
                        className="w-24 h-9 px-2 rounded-md border border-border bg-background text-right"
                      />
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Reason</span>
                  <select value={reason} onChange={(e) => setReason(e.target.value as Reason)} className="w-full h-10 mt-1 px-2 rounded-md border border-border bg-background">
                    {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </label>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Return value</span>
                  <div className="mt-1 h-10 flex items-center justify-end px-3 rounded-md bg-muted/50 font-semibold tabular-nums text-destructive">৳{totalReturn.toFixed(2)}</div>
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
          <button onClick={submit} disabled={saving || !purchase} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {saving ? "Saving…" : "Save return"}
          </button>
        </div>
      </div>
    </div>
  );
}