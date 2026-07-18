import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { ClipboardList, Play, Check, X, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { loadProducts, type Product } from "@/lib/product-store";
import {
  loadWorkOrders,
  createWorkOrder,
  setWorkOrderStatus,
  completeWorkOrder,
  deleteWorkOrder,
  type WorkOrder,
  type WorkOrderStatus,
} from "@/lib/work-order-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/production/work-orders")({
  head: () => ({ meta: [{ title: "Work Orders · Muzahid Food" }] }),
  component: WorkOrdersPage,
});

const STATUS_TONE: Record<WorkOrderStatus, "neutral" | "primary" | "success" | "danger"> = {
  pending: "neutral",
  in_progress: "primary",
  done: "success",
  cancelled: "danger",
};

function WorkOrdersPage() {
  const { currentShowroomId } = useShowroomScope();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const [productId, setProductId] = useState("");
  const [batchQty, setBatchQty] = useState(1);
  const [plannedDate, setPlannedDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes] = useState("");

  const refresh = async () => {
    try {
      const [ps, wos] = await Promise.all([
        loadProducts(currentShowroomId ?? null),
        loadWorkOrders(currentShowroomId ?? null),
      ]);
      setProducts(ps);
      setOrders(wos);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShowroomId]);

  const grouped = useMemo(() => {
    const g: Record<WorkOrderStatus, WorkOrder[]> = { pending: [], in_progress: [], done: [], cancelled: [] };
    for (const o of orders) g[o.status].push(o);
    return g;
  }, [orders]);

  const create = async () => {
    if (!productId || batchQty <= 0) {
      toast.error("Pick a product and batch qty");
      return;
    }
    try {
      await createWorkOrder({
        productId,
        showroomId: null, // factory-only
        batchQty,
        plannedDate: plannedDate || null,
        assignedTo: assignedTo || null,
        notes: notes || null,
      });
      setProductId("");
      setBatchQty(1);
      setPlannedDate("");
      setAssignedTo("");
      setNotes("");
      await refresh();
      toast.success("Work order created");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const changeStatus = async (o: WorkOrder, status: WorkOrderStatus) => {
    try {
      if (status === "done") {
        await completeWorkOrder(o);
        toast.success("Batch produced and stock updated");
      } else {
        await setWorkOrderStatus(o.id, status);
      }
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this work order?")) return;
    try {
      await deleteWorkOrder(id);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  return (
    <AppShell title="Work Orders" subtitle="Assign production batches to staff and track progress">
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
        <Card className="p-5">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2"><ClipboardList className="size-4" /> New work order</div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Product</label>
              <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm">
                <option value="">— Select —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Batch qty</label>
                <input type="number" min={1} value={batchQty} onChange={(e) => setBatchQty(Math.max(1, +e.target.value || 1))} className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Planned date</label>
                <input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Assigned to (name or user id)</label>
              <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Optional" className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm" />
            </div>
            <button onClick={create} className="w-full inline-flex items-center justify-center gap-1.5 px-3 h-9 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
              Create work order
            </button>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {(["pending", "in_progress", "done", "cancelled"] as WorkOrderStatus[]).map((s) => (
            <Card key={s} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s.replace("_", " ")}</div>
                <Badge tone={STATUS_TONE[s]}>{grouped[s].length}</Badge>
              </div>
              <div className="space-y-2">
                {grouped[s].map((o) => (
                  <div key={o.id} className="rounded-md border border-border p-3 bg-background">
                    <div className="font-medium text-sm">{o.product_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      × {o.batch_qty} {o.planned_date ? `· ${o.planned_date}` : ""}
                    </div>
                    {o.assigned_to && <div className="text-xs text-muted-foreground mt-0.5">→ {o.assigned_to}</div>}
                    {o.notes && <div className="text-xs mt-1 text-muted-foreground">{o.notes}</div>}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {s === "pending" && (
                        <button onClick={() => changeStatus(o, "in_progress")} className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1"><Play className="size-3" /> Start</button>
                      )}
                      {(s === "pending" || s === "in_progress") && (
                        <button onClick={() => changeStatus(o, "done")} className="text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 inline-flex items-center gap-1"><Check className="size-3" /> Complete</button>
                      )}
                      {(s === "pending" || s === "in_progress") && (
                        <button onClick={() => changeStatus(o, "cancelled")} className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground hover:bg-muted/70 inline-flex items-center gap-1"><X className="size-3" /> Cancel</button>
                      )}
                      <button onClick={() => remove(o.id)} className="text-xs px-2 py-1 rounded text-destructive hover:bg-destructive/10 inline-flex items-center gap-1 ml-auto"><Trash2 className="size-3" /></button>
                    </div>
                  </div>
                ))}
                {grouped[s].length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-4">Empty</div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
      {loading && <div className="mt-4 text-xs text-muted-foreground">Loading…</div>}
    </AppShell>
  );
}
