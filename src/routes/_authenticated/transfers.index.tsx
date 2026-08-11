import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AppShell, Card } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Send, PackageCheck, X, Undo2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { PermissionGate } from "@/components/permission-gate";
import { getCompany, defaultCompany, type CompanySettings } from "@/lib/company-settings";
import { printTransferSheet } from "@/lib/transfer-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";


export const Route = createFileRoute("/_authenticated/transfers/")({
  head: () => ({ meta: [{ title: "Transfers · Muzahid Food" }] }),
  component: () => (
    <PermissionGate anyOf={["inventory.transfer", "inventory.receive", "inventory.damaged_return"]} title={"Transfers"}>
      <TransfersPage />
    </PermissionGate>
  ),

});

const sb = supabase as any;

type Product = { id: string; name: string; sku: string | null; unit: string };
type Showroom = { id: string; name: string };
type TransferRow = {
  id: string;
  code: string | null;
  status: "draft" | "sent" | "received" | "cancelled";
  source_showroom_id: string | null;
  dest_showroom_id: string;
  note: string | null;
  kind: "normal" | "damaged_return" | null;
  created_at: string;
  sent_at: string | null;
  received_at: string | null;
};
type TransferItem = { id: string; product_id: string; qty: number };

function locName(id: string | null, rooms: Showroom[]) {
  if (!id) return "Factory";
  return rooms.find((r) => r.id === id)?.name ?? "Unknown";
}

function TransfersPage() {
  const { showrooms, hasGlobalAccess, currentShowroomId } = useShowroomScope();
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [openView, setOpenView] = useState<TransferRow | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<TransferRow | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [viewItems, setViewItems] = useState<TransferItem[]>([]);
  const [company, setCompany] = useState<CompanySettings>(defaultCompany);

  useEffect(() => { getCompany().then(setCompany).catch(() => {}); }, []);

  const printSheet = async (row: TransferRow) => {
    const { data } = await sb.from("transfer_items").select("*").eq("transfer_id", row.id);
    const list = (data ?? []) as TransferItem[];
    if (list.length === 0) { toast.error("No items in this transfer"); return; }
    const ok = printTransferSheet({
      company,
      code: row.code ?? row.id.slice(0, 8),
      status: row.status,
      kind: row.kind,
      from: locName(row.source_showroom_id, showrooms),
      to: locName(row.dest_showroom_id, showrooms),
      note: row.note,
      createdAt: row.created_at,
      sentAt: row.sent_at,
      receivedAt: row.received_at,
      lines: list.map((it) => {
        const p = products.find((x) => x.id === it.product_id);
        return { name: p?.name ?? it.product_id, sku: p?.sku ?? "", qty: Number(it.qty), unit: p?.unit ?? "" };
      }),
    });
    if (!ok) toast.error("Allow pop-ups to print");
  };



  const load = useCallback(async () => {
    setLoading(true);
    let q = sb.from("transfers").select("*").order("created_at", { ascending: false }).limit(200);
    // Strict location scope: only transfers this location sent or is receiving.
    // No scope selected means Factory (source/dest IS NULL).
    q = currentShowroomId
      ? q.or(`source_showroom_id.eq.${currentShowroomId},dest_showroom_id.eq.${currentShowroomId}`)
      : q.or("source_showroom_id.is.null,dest_showroom_id.is.null");

    const [{ data: t }, { data: p }] = await Promise.all([
      q,
      sb.from("products").select("id,name,sku,unit").eq("is_active", true).order("name"),
    ]);
    setRows((t ?? []) as TransferRow[]);
    setProducts((p ?? []) as Product[]);
    setLoading(false);
  }, [hasGlobalAccess, currentShowroomId]);

  useEffect(() => { load(); }, [load]);

  const openTransfer = async (row: TransferRow) => {
    setOpenView(row);
    const { data } = await sb.from("transfer_items").select("*").eq("transfer_id", row.id);
    setViewItems((data ?? []) as TransferItem[]);
  };

  const sendTransfer = async (row: TransferRow) => {
    const isDamaged = row.kind === "damaged_return";
    const { data: items } = await sb.from("transfer_items").select("*").eq("transfer_id", row.id);
    const list = (items ?? []) as TransferItem[];
    if (list.length === 0) { toast.error("Add items first"); return; }
    const productIds = list.map((i) => i.product_id);
    const stockTable = isDamaged ? "damaged_stock" : "product_stock";
    const { data: stockRows } = await sb
      .from(stockTable)
      .select("product_id, quantity, showroom_id")
      .in("product_id", productIds);
    const onHand = new Map<string, number>();
    for (const s of (stockRows ?? []) as { product_id: string; quantity: number; showroom_id: string | null }[]) {
      if ((s.showroom_id ?? null) === (row.source_showroom_id ?? null)) {
        onHand.set(s.product_id, Number(s.quantity));
      }
    }
    for (const it of list) {
      const have = onHand.get(it.product_id) ?? 0;
      if (have < Number(it.qty)) {
        const p = products.find((x) => x.id === it.product_id);
        toast.error(`Insufficient ${isDamaged ? "damaged" : ""} stock for ${p?.name ?? "item"} (have ${have}, need ${it.qty})`);
        return;
      }
    }
    for (const it of list) {
      const rpc = isDamaged ? "commit_damaged_movement" : "commit_stock_movement";
      const { error } = await sb.rpc(rpc, {
        _product_id: it.product_id,
        _showroom_id: row.source_showroom_id,
        _qty: -Number(it.qty),
        _kind: "transfer_out",
        _ref_type: "transfer",
        _ref_id: row.id,
        _note: null,
      });
      if (error) { toast.error(error.message); return; }
    }
    const { error: upErr } = await sb
      .from("transfers")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", row.id);
    if (upErr) { toast.error(upErr.message); return; }
    toast.success("Transfer sent");
    setOpenView(null);
    load();
  };

  const receiveTransfer = async (row: TransferRow) => {
    if (row.kind === "damaged_return") {
      const { error } = await sb.rpc("commit_damaged_transfer_approve", { _transfer_id: row.id });
      if (error) { toast.error(error.message); return; }
      toast.success("Received into repurpose queue");
      setOpenView(null); load();
      return;
    }
    const { data: items } = await sb.from("transfer_items").select("*").eq("transfer_id", row.id);
    const list = (items ?? []) as TransferItem[];
    for (const it of list) {
      const { error } = await sb.rpc("commit_stock_movement", {
        _product_id: it.product_id,
        _showroom_id: row.dest_showroom_id,
        _qty: Number(it.qty),
        _kind: "transfer_in",
        _ref_type: "transfer",
        _ref_id: row.id,
        _note: null,
      });
      if (error) { toast.error(error.message); return; }
    }
    const { error: upErr } = await sb
      .from("transfers")
      .update({ status: "received", received_at: new Date().toISOString() })
      .eq("id", row.id);
    if (upErr) { toast.error(upErr.message); return; }
    toast.success("Transfer received");
    setOpenView(null);
    load();
  };

  const cancelTransfer = async (row: TransferRow) => {
    setCancelBusy(true);
    const { error } = await sb.from("transfers").update({ status: "cancelled" }).eq("id", row.id);
    setCancelBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Cancelled");
    setConfirmCancel(null);
    setOpenView(null); load();
  };

  const statusColor = (s: TransferRow["status"]) =>
    s === "draft" ? "bg-muted text-foreground"
    : s === "sent" ? "bg-primary/15 text-primary"
    : s === "received" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : "bg-destructive/15 text-destructive";

  return (
    <AppShell title="Transfers" subtitle="Move stock between factory and showrooms">
      <div className="flex justify-end gap-2 mb-4">
        <Button asChild variant="outline">
          <Link to="/transfers/damaged/new">
            <Undo2 className="w-4 h-4 mr-2" /> New Damaged Return
          </Link>
        </Button>
        <Button asChild>
          <Link to="/transfers/new">
            <Plus className="w-4 h-4 mr-2" /> New Transfer
          </Link>
        </Button>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transfers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-2">Code</th>
                  <th className="py-2 px-2">From</th>
                  <th className="py-2 px-2">To</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 px-2">Created</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/40">
                    <td className="py-2 px-2 font-mono text-xs">{r.code ?? r.id.slice(0, 8)}</td>
                    <td className="py-2 px-2">{locName(r.source_showroom_id, showrooms)}</td>
                    <td className="py-2 px-2">{locName(r.dest_showroom_id, showrooms)}</td>
                    <td className="py-2 px-2">
                      <Badge className={statusColor(r.status)}>{r.status}</Badge>
                    </td>
                    <td className="py-2 px-2 text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => printSheet(r)} title="Print transfer sheet">
                          <Printer className="w-4 h-4" />
                        </Button>
                        {r.status === "draft" ? (
                          <Button size="sm" variant="outline" onClick={() => openTransfer(r)}>Open</Button>
                        ) : (
                          <Button size="sm" variant="outline" asChild>
                            <Link to="/transfers/receive/$id" params={{ id: r.id }}>Open</Link>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {openView && (
        <Dialog open onOpenChange={() => setOpenView(null)}>
          <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-3xl max-h-[88vh] overflow-y-auto p-0 gap-0">
            <DialogHeader className="px-5 py-4 border-b bg-muted/40 text-left space-y-1">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                <span className="font-mono">{openView.code ?? openView.id.slice(0, 8)}</span>
                <Badge className={statusColor(openView.status)}>{openView.status}</Badge>
                {openView.kind === "damaged_return" && <Badge variant="outline">damaged return</Badge>}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Created {new Date(openView.created_at).toLocaleString()}
              </p>
            </DialogHeader>

            <div className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "From", value: locName(openView.source_showroom_id, showrooms) },
                  { label: "To", value: locName(openView.dest_showroom_id, showrooms) },
                  { label: "Line items", value: String(viewItems.length) },
                  {
                    label: "Total qty",
                    value: String(viewItems.reduce((s, i) => s + Number(i.qty || 0), 0)),
                  },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border bg-card px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                    <p className="font-semibold truncate">{s.value}</p>
                  </div>
                ))}
              </div>

              {openView.note && (
                <div className="rounded-lg border bg-muted/40 px-3 py-2 text-muted-foreground">
                  <span className="font-medium text-foreground">Note: </span>{openView.note}
                </div>
              )}

              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr className="text-left">
                      <th className="py-2 px-3 font-medium">Product</th>
                      <th className="py-2 px-3 font-medium hidden sm:table-cell">SKU</th>
                      <th className="py-2 px-3 font-medium text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewItems.map((it) => {
                      const p = products.find((x) => x.id === it.product_id);
                      return (
                        <tr key={it.id} className="border-t">
                          <td className="py-2 px-3">{p?.name ?? it.product_id}</td>
                          <td className="py-2 px-3 text-muted-foreground hidden sm:table-cell">{p?.sku ?? "—"}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{it.qty} {p?.unit}</td>
                        </tr>
                      );
                    })}
                    {viewItems.length === 0 && (
                      <tr><td colSpan={3} className="py-6 px-3 text-center text-muted-foreground">No items yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <DialogFooter className="px-5 py-4 border-t bg-muted/30 gap-2 sm:justify-between">
              <Button variant="outline" onClick={() => printSheet(openView)}>
                <Printer className="w-4 h-4 mr-2" /> Print sheet
              </Button>
              <div className="flex gap-2">
                {openView.status === "draft" && (
                  <>
                    <Button variant="outline" onClick={() => setConfirmCancel(openView)}>
                      <X className="w-4 h-4 mr-2" /> Cancel
                    </Button>
                    <Button onClick={() => sendTransfer(openView)}>
                      <Send className="w-4 h-4 mr-2" /> Send
                    </Button>
                  </>
                )}
                {openView.status === "sent" && (
                  <Button asChild>
                    <Link to="/transfers/receive/$id" params={{ id: openView.id }}>
                      <PackageCheck className="w-4 h-4 mr-2" /> Open to Receive
                    </Link>
                  </Button>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDialog
        open={!!confirmCancel}
        title="Cancel this transfer?"
        description={
          confirmCancel
            ? `Transfer ${confirmCancel.code ?? confirmCancel.id.slice(0, 8)} will be marked cancelled. This cannot be undone.`
            : undefined
        }
        confirmLabel="Yes, cancel transfer"
        cancelLabel="Keep it"
        destructive
        busy={cancelBusy}
        onConfirm={() => { if (confirmCancel) void cancelTransfer(confirmCancel); }}
        onCancel={() => setConfirmCancel(null)}
      />

    </AppShell>
  );
}
