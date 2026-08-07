import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { Search, Filter, Plus, X, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { scopeTo } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/purchasing/payments")({
  head: () => ({ meta: [{ title: "Supplier Payments · Muzahid Food" }] }),
  component: SupplierPayments,
});

const METHODS = ["cash", "bank", "mobile", "cheque", "other"] as const;

type Row = {
  id: string; paid_on: string; supplier_id: string; supplier_name: string | null;
  purchase_id: string | null; purchase_code: string | null;
  amount: number; method: string; reference: string | null; note: string | null;
  showroom_id: string | null;
};

const sb = supabase as any;

function SupplierPayments() {
  const { currentShowroomId, showrooms } = useShowroomScope();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [method, setMethod] = useState<string>("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showNew, setShowNew] = useState(false);

  const showroomName = useMemo(() => {
    const m = new Map(showrooms.map((s) => [s.id, s.name] as const));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "All");
  }, [showrooms]);

  const refresh = async () => {
    setLoading(true);
    let query = sb.from("supplier_payments")
      .select("id,paid_on,amount,method,reference,note,showroom_id,supplier_id,purchase_id,suppliers(name),purchases(code)")
      .order("paid_on", { ascending: false }).order("created_at", { ascending: false });
    query = scopeTo(query, currentShowroomId, "showroom_id");
    const { data, error } = await query;
    if (error) { console.error(error); setRows([]); }
    else setRows((data ?? []).map((r: any) => ({
      id: r.id, paid_on: r.paid_on, supplier_id: r.supplier_id,
      supplier_name: r.suppliers?.name ?? null,
      purchase_id: r.purchase_id, purchase_code: r.purchases?.code ?? null,
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
    if (q) {
      const s = q.toLowerCase();
      const hay = `${r.supplier_name ?? ""} ${r.purchase_code ?? ""} ${r.reference ?? ""}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  }), [rows, q, method, from, to]);

  const total = filtered.reduce((s, r) => s + r.amount, 0);

  const remove = async (id: string) => {
    if (!confirm("Delete this payment?")) return;
    const { error } = await sb.from("supplier_payments").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    refresh();
  };

  return (
    <AppShell
      title="Supplier Payments"
      subtitle="Outbound payments to suppliers"
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
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search supplier, invoice or reference…"
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
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total paid</div><div className="text-lg font-semibold mt-1 tabular-nums">৳{total.toFixed(2)}</div></Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-4 py-2.5">Supplier</th>
                <th className="text-left px-4 py-2.5">Purchase</th>
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
                  <td className="px-4 py-2.5 font-medium">{r.supplier_name ?? "—"}</td>
                  <td className="px-4 py-2.5">{r.purchase_code ? `#${r.purchase_code}` : "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{showroomName(r.showroom_id)}</td>
                  <td className="px-4 py-2.5 capitalize">{r.method}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.reference ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">৳{r.amount.toFixed(2)}</td>
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
    </AppShell>
  );
}

function NewPayment({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { currentShowroomId } = useShowroomScope();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [purchases, setPurchases] = useState<any[]>([]);
  const [purchaseId, setPurchaseId] = useState("");
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState<string>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await sb.from("suppliers").select("id,name").eq("is_active", true).order("name");
      setSuppliers(data ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!supplierId) { setPurchases([]); return; }
    (async () => {
      let q = sb.from("purchases").select("id,code,total,paid,due,purchase_date").eq("supplier_id", supplierId).order("purchase_date", { ascending: false }).limit(50);
      q = scopeTo(q, currentShowroomId, "showroom_id");
      const { data } = await q;
      setPurchases(data ?? []);
    })();
  }, [supplierId, currentShowroomId]);

  const submit = async () => {
    if (!supplierId) { alert("Pick a supplier"); return; }
    if (!amount || amount <= 0) { alert("Enter an amount"); return; }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const chosen = purchases.find((p) => p.id === purchaseId);
    const { error } = await sb.from("supplier_payments").insert({
      supplier_id: supplierId,
      purchase_id: purchaseId || null,
      showroom_id: currentShowroomId,
      paid_on: paidOn,
      amount,
      method,
      reference: reference || null,
      note: note || null,
      created_by: userRes.user?.id ?? null,
    });
    if (error) { setSaving(false); alert(error.message); return; }
    // Best-effort: bump the purchase's paid/due
    if (chosen) {
      const newPaid = Number(chosen.paid || 0) + amount;
      const newDue = Math.max(0, Number(chosen.total || 0) - newPaid);
      await sb.from("purchases").update({ paid: newPaid, due: newDue }).eq("id", chosen.id);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-background rounded-lg border border-border w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">Record Supplier Payment</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="size-4" /></button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Supplier</span>
            <select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPurchaseId(""); }} className="w-full h-10 mt-1 px-2 rounded-md border border-border bg-background">
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Purchase (optional)</span>
            <select value={purchaseId} onChange={(e) => setPurchaseId(e.target.value)} className="w-full h-10 mt-1 px-2 rounded-md border border-border bg-background">
              <option value="">Not linked</option>
              {purchases.map((p) => (
                <option key={p.id} value={p.id}>#{p.code ?? String(p.id).slice(0, 8)} · {p.purchase_date} · Due ৳{Number(p.due).toFixed(2)}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
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