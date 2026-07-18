import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AppShell, Card } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Send, PackageCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";

export const Route = createFileRoute("/_authenticated/transfers")({
  head: () => ({ meta: [{ title: "Transfers · Muzahid Food" }] }),
  component: TransfersPage,
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
  const [openView, setOpenView] = useState<TransferRow | null>(null);
  const [viewItems, setViewItems] = useState<TransferItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = sb.from("transfers").select("*").order("created_at", { ascending: false }).limit(200);
    if (!hasGlobalAccess && currentShowroomId) {
      q = q.or(`source_showroom_id.eq.${currentShowroomId},dest_showroom_id.eq.${currentShowroomId}`);
    }
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
    // Fetch items and commit stock_out on source
    const { data: items } = await sb.from("transfer_items").select("*").eq("transfer_id", row.id);
    const list = (items ?? []) as TransferItem[];
    if (list.length === 0) { toast.error("Add items first"); return; }
    // Validate stock at source
    const productIds = list.map((i) => i.product_id);
    const { data: stockRows } = await sb
      .from("product_stock")
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
        toast.error(`Insufficient stock for ${p?.name ?? "item"} (have ${have}, need ${it.qty})`);
        return;
      }
    }
    for (const it of list) {
      const { error } = await sb.rpc("commit_stock_movement", {
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
    const { error } = await sb.from("transfers").update({ status: "cancelled" }).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cancelled");
    setOpenView(null); load();
  };

  const statusColor = (s: TransferRow["status"]) =>
    s === "draft" ? "bg-muted text-foreground"
    : s === "sent" ? "bg-primary/15 text-primary"
    : s === "received" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : "bg-destructive/15 text-destructive";

  return (
    <AppShell title="Transfers" subtitle="Move stock between factory and showrooms">
      <div className="flex justify-end mb-4">
        <Button onClick={() => setOpenNew(true)}>
          <Plus className="w-4 h-4 mr-2" /> New Transfer
        </Button>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transfers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
                      <Button size="sm" variant="outline" onClick={() => openTransfer(r)}>Open</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {openNew && (
        <NewTransferDialog
          products={products}
          showrooms={showrooms}
          hasGlobalAccess={hasGlobalAccess}
          currentShowroomId={currentShowroomId}
          onClose={() => setOpenNew(false)}
          onCreated={() => { setOpenNew(false); load(); }}
        />
      )}

      {openView && (
        <Dialog open onOpenChange={() => setOpenView(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Transfer {openView.code ?? openView.id.slice(0, 8)}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex gap-6">
                <div><span className="text-muted-foreground">From:</span> {locName(openView.source_showroom_id, showrooms)}</div>
                <div><span className="text-muted-foreground">To:</span> {locName(openView.dest_showroom_id, showrooms)}</div>
                <div><Badge className={statusColor(openView.status)}>{openView.status}</Badge></div>
              </div>
              {openView.note && <p className="text-muted-foreground">{openView.note}</p>}
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Product</th>
                    <th className="py-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {viewItems.map((it) => {
                    const p = products.find((x) => x.id === it.product_id);
                    return (
                      <tr key={it.id} className="border-b">
                        <td className="py-2">{p?.name ?? it.product_id}</td>
                        <td className="py-2 text-right">{it.qty} {p?.unit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <DialogFooter className="gap-2">
              {openView.status === "draft" && (
                <>
                  <Button variant="outline" onClick={() => cancelTransfer(openView)}>
                    <X className="w-4 h-4 mr-2" /> Cancel
                  </Button>
                  <Button onClick={() => sendTransfer(openView)}>
                    <Send className="w-4 h-4 mr-2" /> Send
                  </Button>
                </>
              )}
              {openView.status === "sent" && (
                <Button onClick={() => receiveTransfer(openView)}>
                  <PackageCheck className="w-4 h-4 mr-2" /> Receive
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}

function NewTransferDialog({
  products, showrooms, hasGlobalAccess, currentShowroomId, onClose, onCreated,
}: {
  products: Product[];
  showrooms: Showroom[];
  hasGlobalAccess: boolean;
  currentShowroomId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const defaultSource = hasGlobalAccess ? "factory" : (currentShowroomId ?? "factory");
  const [source, setSource] = useState<string>(defaultSource); // "factory" or showroom id
  const [dest, setDest] = useState<string>("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<{ product_id: string; qty: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const destOptions = useMemo(
    () => showrooms.filter((s) => (source === "factory" ? true : s.id !== source)),
    [showrooms, source]
  );

  const addRow = () => setItems((v) => [...v, { product_id: "", qty: "" }]);
  const setRow = (i: number, patch: Partial<{ product_id: string; qty: string }>) =>
    setItems((v) => v.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const rmRow = (i: number) => setItems((v) => v.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!dest) { toast.error("Pick destination"); return; }
    const clean = items
      .map((r) => ({ product_id: r.product_id, qty: Number(r.qty) }))
      .filter((r) => r.product_id && r.qty > 0);
    if (clean.length === 0) { toast.error("Add at least one item"); return; }
    setSaving(true);
    const source_showroom_id = source === "factory" ? null : source;
    const code = `TR-${Date.now().toString(36).toUpperCase()}`;
    const { data: created, error } = await sb
      .from("transfers")
      .insert({ code, source_showroom_id, dest_showroom_id: dest, note: note || null, status: "draft" })
      .select("id")
      .single();
    if (error || !created) { toast.error(error?.message ?? "Failed"); setSaving(false); return; }
    const { error: itErr } = await sb
      .from("transfer_items")
      .insert(clean.map((c) => ({ transfer_id: created.id, product_id: c.product_id, qty: c.qty })));
    if (itErr) { toast.error(itErr.message); setSaving(false); return; }
    toast.success("Transfer created as draft");
    setSaving(false);
    onCreated();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Transfer</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>From</Label>
              <Select value={source} onValueChange={setSource} disabled={!hasGlobalAccess}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {hasGlobalAccess && <SelectItem value="factory">Factory</SelectItem>}
                  {showrooms.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>To</Label>
              <Select value={dest} onValueChange={setDest}>
                <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                <SelectContent>
                  {destOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Items</Label>
              <Button size="sm" variant="outline" onClick={addRow}>
                <Plus className="w-4 h-4 mr-1" /> Add item
              </Button>
            </div>
            <div className="space-y-2">
              {items.length === 0 && (
                <p className="text-sm text-muted-foreground">No items yet.</p>
              )}
              {items.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_120px_40px] gap-2">
                  <Select value={row.product_id} onValueChange={(v) => setRow(i, { product_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Product" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{p.sku ? ` (${p.sku})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Qty"
                    value={row.qty}
                    onChange={(e) => setRow(i, { qty: e.target.value })}
                  />
                  <Button size="icon" variant="ghost" onClick={() => rmRow(i)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}