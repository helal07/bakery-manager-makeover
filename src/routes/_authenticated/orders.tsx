import { createFileRoute } from "@tanstack/react-router";
import { PermissionGate } from "@/components/permission-gate";

import { AppShell, Card, Badge } from "@/components/app-shell";
import { Check, Circle, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { toast } from "sonner";
import { pageTitle } from "@/lib/company-settings";
import { scopeTo } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({ meta: [{ title: pageTitle("Orders") }] }),
  component: () => (
    <PermissionGate anyOf={["sales.view"]} title="Orders">
      <Orders />
    </PermissionGate>
  ),
});


type OrderStatus = "Pending" | "In Production" | "Ready" | "Delivered";
type OrderType = "Retail" | "Wholesale" | "Custom Cake" | "Online";
type Order = {
  id: string;
  code: string;
  customer_name: string;
  order_type: OrderType;
  status: OrderStatus;
  items: string;
  total: number;
  due_date: string | null;
};

const steps: OrderStatus[] = ["Pending", "In Production", "Ready", "Delivered"];
const types: OrderType[] = ["Retail", "Wholesale", "Custom Cake", "Online"];

function Orders() {
  const { currentShowroomId } = useShowroomScope();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    customer_name: "",
    customer_phone: "",
    order_type: "Retail" as OrderType,
    items: "",
    total: 0,
    due_date: "",
  });

  const refresh = () => {
    setLoading(true);
    let q = supabase
      .from("orders")
      .select("id, code, customer_name, order_type, status, items, total, due_date")
      .order("created_at", { ascending: false })
      .limit(200);
    q = scopeTo(q, currentShowroomId, "showroom_id");
    q.then(({ data, error }) => {
      if (error) toast.error(error.message);
      else setOrders((data ?? []) as Order[]);
      setLoading(false);
    });
  };

  useEffect(refresh, [currentShowroomId]);

  const advance = async (o: Order) => {
    const idx = steps.indexOf(o.status);
    if (idx < 0 || idx >= steps.length - 1) return;
    const next = steps[idx + 1];
    const { error } = await supabase.from("orders").update({ status: next }).eq("id", o.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Marked ${next}`);
      refresh();
    }
  };

  const submit = async () => {
    if (!draft.customer_name.trim() || !draft.items.trim()) {
      toast.error("Customer and items required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("orders").insert({
      customer_name: draft.customer_name.trim(),
      customer_phone: draft.customer_phone.trim() || null,
      order_type: draft.order_type,
      items: draft.items.trim(),
      total: Number(draft.total) || 0,
      due_date: draft.due_date || null,
      showroom_id: currentShowroomId ?? null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Order created");
    setShowForm(false);
    setDraft({ customer_name: "", customer_phone: "", order_type: "Retail", items: "", total: 0, due_date: "" });
    refresh();
  };

  return (
    <AppShell
      title="Orders"
      subtitle="Track every order from walk-in to delivery"
      actions={
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
        >
          <Plus className="size-4" /> New Order
        </button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        {steps.map((s) => {
          const n = orders.filter((o) => o.status === s).length;
          return (
            <Card key={s} className="p-4">
              <div className="text-xs text-muted-foreground">{s}</div>
              <div className="text-2xl font-semibold mt-1">{n}</div>
            </Card>
          );
        })}
      </div>

      <div className="space-y-3">
        {orders.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            {loading ? "Loading…" : "No orders yet. Create your first order."}
          </Card>
        )}
        {orders.map((o) => {
          const idx = steps.indexOf(o.status);
          return (
            <Card key={o.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{o.code}</span>
                    <Badge tone={o.order_type === "Custom Cake" ? "primary" : o.order_type === "Wholesale" ? "warning" : "neutral"}>{o.order_type}</Badge>
                  </div>
                  <div className="text-sm mt-1">{o.customer_name} · <span className="text-muted-foreground">{o.items}</span></div>
                  <div className="text-xs text-muted-foreground mt-1">Due {o.due_date ?? "—"}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">৳{Number(o.total).toFixed(2)}</div>
                  {idx < steps.length - 1 && (
                    <button
                      onClick={() => advance(o)}
                      className="mt-2 text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted"
                    >
                      Mark {steps[idx + 1]}
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-4 flex items-center">
                {steps.map((s, i) => {
                  const done = i <= idx;
                  return (
                    <div key={s} className="flex items-center flex-1 last:flex-none">
                      <div className={`size-6 grid place-items-center rounded-full text-[10px] ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border border-border"}`}>
                        {done ? <Check className="size-3" /> : <Circle className="size-2.5" />}
                      </div>
                      <span className={`ml-2 text-xs ${done ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s}</span>
                      {i < steps.length - 1 && (
                        <div className={`h-px flex-1 mx-3 ${i < idx ? "bg-primary" : "bg-border"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">New Order</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <Field label="Customer name">
                <input value={draft.customer_name} onChange={(e) => setDraft({ ...draft, customer_name: e.target.value })} className="input" />
              </Field>
              <Field label="Phone">
                <input value={draft.customer_phone} onChange={(e) => setDraft({ ...draft, customer_phone: e.target.value })} className="input" />
              </Field>
              <Field label="Type">
                <select value={draft.order_type} onChange={(e) => setDraft({ ...draft, order_type: e.target.value as OrderType })} className="input">
                  {types.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Items">
                <input value={draft.items} onChange={(e) => setDraft({ ...draft, items: e.target.value })} placeholder="2x Chocolate cake, 1x Croissant" className="input" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Total (৳)">
                  <input type="number" value={draft.total} onChange={(e) => setDraft({ ...draft, total: Number(e.target.value) })} className="input" />
                </Field>
                <Field label="Due date">
                  <input type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} className="input" />
                </Field>
              </div>
              <button
                onClick={submit}
                disabled={saving}
                className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Create Order"}
              </button>
            </div>
          </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1 [&_.input]:w-full [&_.input]:px-3 [&_.input]:py-2 [&_.input]:rounded-md [&_.input]:border [&_.input]:border-border [&_.input]:bg-background [&_.input]:text-sm">
        {children}
      </div>
    </label>
  );
}