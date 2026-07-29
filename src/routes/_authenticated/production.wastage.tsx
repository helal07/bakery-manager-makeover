import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { AppShell, Card } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Recycle, Trash2, Wheat, ClipboardList, History as HistoryIcon, Package, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PermissionGate } from "@/components/permission-gate";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { loadRawMaterials, type RawMaterial } from "@/lib/raw-material-store";
import {
  loadWastage, logWastage, logFinishedProductWastage, sellDamagedGoods,
  type WastageEntry,
} from "@/lib/wastage-store";
import { loadProducts, type Product } from "@/lib/product-store";

export const Route = createFileRoute("/_authenticated/production/wastage")({
  head: () => ({ meta: [{ title: "Wastage Management · Muzahid Food" }] }),
  component: () => (
    <PermissionGate anyOf={["production.wastage.manage", "production.repurpose"]} title="Wastage Management">
      <WastagePage />
    </PermissionGate>
  ),
});

const sb = supabase as any;
const REASONS = ["Spoilage", "Damage", "Expired", "Spillage", "Contamination", "Other"];

type QueueRow = {
  id: string;
  product_id: string;
  product_name?: string;
  qty: number;
  source_showroom_id: string | null;
  source_showroom_name?: string;
  status: "pending" | "converted" | "discarded";
  converted_material_id: string | null;
  material_name?: string;
  yield_qty: number | null;
  wastage_qty: number | null;
  created_at: string;
  processed_at: string | null;
};
type Material = { id: string; name: string; unit: string | null };
type Tab = "log" | "repurpose" | "history";
type WastageMode = "material" | "product";

function WastagePage() {
  const { currentShowroomId } = useShowroomScope();
  const [tab, setTab] = useState<Tab>("log");

  // Log-wastage state
  const [mode, setMode] = useState<WastageMode>("material");
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [entries, setEntries] = useState<WastageEntry[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [qty, setQty] = useState(0);
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Repurpose state
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [rawMats, setRawMats] = useState<Material[]>([]);
  const [loadingRep, setLoadingRep] = useState(true);
  const [convert, setConvert] = useState<QueueRow | null>(null);
  const [sell, setSell] = useState<QueueRow | null>(null);

  const refreshWastage = useCallback(async () => {
    try {
      const [rms, ws, ps] = await Promise.all([
        loadRawMaterials(currentShowroomId ?? null),
        loadWastage(currentShowroomId ?? null),
        loadProducts(currentShowroomId ?? null),
      ]);
      setMaterials(rms);
      setEntries(ws);
      setProducts(ps);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    }
  }, [currentShowroomId]);

  const loadRepurpose = useCallback(async () => {
    setLoadingRep(true);
    const [{ data: q }, { data: m }] = await Promise.all([
      sb.from("repurpose_queue").select(`
        id,product_id,qty,source_showroom_id,status,converted_material_id,yield_qty,wastage_qty,created_at,processed_at,
        products(name),showrooms:source_showroom_id(name),raw_materials:converted_material_id(name)
      `).order("created_at", { ascending: false }).limit(300),
      sb.from("raw_materials").select("id,name,unit").order("name"),
    ]);
    setRows(((q ?? []) as any[]).map((r) => ({
      ...r,
      qty: Number(r.qty),
      yield_qty: r.yield_qty !== null ? Number(r.yield_qty) : null,
      wastage_qty: r.wastage_qty !== null ? Number(r.wastage_qty) : null,
      product_name: r.products?.name,
      source_showroom_name: r.showrooms?.name,
      material_name: r.raw_materials?.name,
    })));
    setRawMats((m ?? []) as Material[]);
    setLoadingRep(false);
  }, []);

  useEffect(() => { refreshWastage(); }, [refreshWastage]);
  useEffect(() => { loadRepurpose(); }, [loadRepurpose]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q))
      .slice(0, 20);
  }, [products, productSearch]);

  const submitWastage = async () => {
    if (qty <= 0) { toast.error("Quantity must be greater than zero"); return; }
    setSaving(true);
    try {
      if (mode === "material") {
        if (!materialId) { toast.error("Pick a raw material"); setSaving(false); return; }
        await logWastage({ materialId, showroomId: null, qty, reason, notes: notes || null });
        toast.success("Raw material wastage logged");
      } else {
        if (!productId) { toast.error("Pick a finished product"); setSaving(false); return; }
        await logFinishedProductWastage({
          productId,
          showroomId: currentShowroomId ?? null,
          qty,
          reason,
          notes: notes || null,
        });
        toast.success("Finished-product wastage logged — item queued for repurpose or resale");
      }
      setMaterialId(""); setProductId(""); setProductSearch(""); setQty(0); setNotes("");
      await Promise.all([refreshWastage(), loadRepurpose()]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  const discard = async (row: QueueRow) => {
    if (!confirm(`Discard ${row.qty} × ${row.product_name} as full wastage?`)) return;
    const { error } = await sb.rpc("commit_repurpose", {
      _queue_id: row.id, _material_id: null, _yield_qty: null,
      _wastage_qty: row.qty, _note: "Discarded",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Discarded");
    loadRepurpose();
  };

  const pending = rows.filter((r) => r.status === "pending");
  const history = rows.filter((r) => r.status !== "pending");
  const totalQty = entries.reduce((s, e) => s + e.qty, 0);

  const tabs: { key: Tab; label: string; icon: any; count?: number }[] = [
    { key: "log", label: "Log Wastage", icon: ClipboardList, count: entries.length },
    { key: "repurpose", label: "Damaged Queue", icon: Recycle, count: pending.length },
    { key: "history", label: "Repurpose History", icon: HistoryIcon, count: history.length },
  ];

  return (
    <AppShell
      title="Wastage Management"
      subtitle="Log raw & finished-product wastage, then repurpose, discard, or sell damaged goods"
    >
      <div className="flex flex-wrap gap-2 mb-4 border-b border-border">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition ${
                active
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {t.label}
              {typeof t.count === "number" && (
                <span className={`ml-1 rounded-full px-1.5 text-[10px] ${active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "log" && (
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-5">
          <Card className="p-5">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Trash2 className="size-4" /> Log wastage
            </div>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-muted mb-4">
              <button
                type="button"
                onClick={() => setMode("material")}
                className={`inline-flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-medium transition ${
                  mode === "material" ? "bg-background shadow text-foreground" : "text-muted-foreground"
                }`}
              >
                <Wheat className="size-3.5" /> Raw Material
              </button>
              <button
                type="button"
                onClick={() => setMode("product")}
                className={`inline-flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-medium transition ${
                  mode === "product" ? "bg-background shadow text-foreground" : "text-muted-foreground"
                }`}
              >
                <Package className="size-3.5" /> Finished Product
              </button>
            </div>

            <div className="space-y-3">
              {mode === "material" ? (
                <div>
                  <label className="text-xs text-muted-foreground">Raw material</label>
                  <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm">
                    <option value="">— Select —</option>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-xs text-muted-foreground">Finished product</label>
                  <Input
                    value={productSearch}
                    onChange={(e) => { setProductSearch(e.target.value); setProductId(""); }}
                    placeholder="Search by name or SKU…"
                    className="h-9 mt-0.5"
                  />
                  {productId ? (
                    <div className="mt-1.5 flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5">
                      <span className="text-xs font-medium">
                        {products.find((p) => p.id === productId)?.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setProductId(""); setProductSearch(""); }}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Clear
                      </button>
                    </div>
                  ) : (
                    productSearch && (
                      <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-background">
                        {filteredProducts.length === 0 ? (
                          <p className="text-xs text-muted-foreground px-2.5 py-2">No matches</p>
                        ) : (
                          filteredProducts.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => { setProductId(p.id); setProductSearch(p.name); }}
                              className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-muted flex justify-between"
                            >
                              <span>{p.name}</span>
                              <span className="text-muted-foreground">Stk {p.stock ?? 0}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Quantity</label>
                  <input type="number" min={0} step="0.001" value={qty} onChange={(e) => setQty(+e.target.value || 0)} className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Reason</label>
                  <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm">
                    {REASONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm" />
              </div>
              <button onClick={submitWastage} disabled={saving} className="w-full inline-flex items-center justify-center gap-1.5 px-3 h-9 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Saving…" : "Log wastage"}
              </button>

              {mode === "product" && (
                <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-md p-2 leading-relaxed">
                  Finished-product wastage moves stock into the Damaged Queue where it can be sold as feed/discounted goods, repurposed to raw material, or discarded.
                </p>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="text-sm font-semibold">Recent wastage</div>
              <div className="text-xs text-muted-foreground">Total qty: <span className="font-semibold text-foreground">{totalQty.toFixed(3)}</span></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground bg-muted/40">
                  <tr>
                    <th className="text-left font-medium px-5 py-3">Date</th>
                    <th className="text-left font-medium px-5 py-3">Item</th>
                    <th className="text-left font-medium px-5 py-3">Type</th>
                    <th className="text-right font-medium px-5 py-3">Qty</th>
                    <th className="text-left font-medium px-5 py-3">Reason</th>
                    <th className="text-left font-medium px-5 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3 text-muted-foreground">{e.logged_at.slice(0, 10)}</td>
                      <td className="px-5 py-3 font-medium">{e.product_name ?? e.material_name ?? "—"}</td>
                      <td className="px-5 py-3">
                        {e.origin === "product" ? (
                          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Product</Badge>
                        ) : (
                          <Badge variant="secondary">Material</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-destructive">-{e.qty}</td>
                      <td className="px-5 py-3">{e.reason}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{e.notes}</td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No wastage logged.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {(tab === "repurpose" || tab === "history") && (
        <Card>
          {loadingRep ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : (tab === "repurpose" ? pending : history).length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {tab === "repurpose"
                ? "No pending damaged items. Log finished-product wastage or receive a damaged-return transfer to see items here."
                : "No repurpose history yet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3">Product</th>
                    <th className="py-2 px-3">Qty</th>
                    <th className="py-2 px-3">From</th>
                    <th className="py-2 px-3">Received</th>
                    {tab === "history" && <>
                      <th className="py-2 px-3">Result</th>
                      <th className="py-2 px-3">Yield / Waste</th>
                    </>}
                    {tab === "repurpose" && <th className="py-2 px-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {(tab === "repurpose" ? pending : history).map((r) => (
                    <tr key={r.id} className="border-b hover:bg-muted/40">
                      <td className="py-2 px-3 font-medium">{r.product_name ?? r.product_id.slice(0, 8)}</td>
                      <td className="py-2 px-3 tabular-nums">{r.qty}</td>
                      <td className="py-2 px-3">{r.source_showroom_name ?? "Factory"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                      {tab === "history" && <>
                        <td className="py-2 px-3">
                          {r.status === "converted" ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">→ {r.material_name}</Badge>
                          ) : (
                            <Badge variant="destructive">Discarded</Badge>
                          )}
                        </td>
                        <td className="py-2 px-3 tabular-nums text-xs">
                          <span className="text-emerald-600">+{r.yield_qty ?? 0}</span>
                          {" / "}
                          <span className="text-destructive">-{r.wastage_qty ?? 0}</span>
                        </td>
                      </>}
                      {tab === "repurpose" && (
                        <td className="py-2 px-3 text-right">
                          <div className="flex justify-end gap-2 flex-wrap">
                            <Button size="sm" onClick={() => setSell(r)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                              <DollarSign className="w-3.5 h-3.5 mr-1" />Sell
                            </Button>
                            <Button size="sm" onClick={() => setConvert(r)}>
                              <Recycle className="w-3.5 h-3.5 mr-1" />Repurpose
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => discard(r)}>
                              <Trash2 className="w-3.5 h-3.5 mr-1" />Discard
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {convert && (
        <ConvertDialog
          row={convert}
          materials={rawMats}
          onClose={() => setConvert(null)}
          onDone={() => { setConvert(null); loadRepurpose(); }}
        />
      )}
      {sell && (
        <SellDialog
          row={sell}
          onClose={() => setSell(null)}
          onDone={() => { setSell(null); loadRepurpose(); }}
        />
      )}
    </AppShell>
  );
}

function ConvertDialog({ row, materials, onClose, onDone }: {
  row: QueueRow; materials: Material[]; onClose: () => void; onDone: () => void;
}) {
  const [materialId, setMaterialId] = useState<string>("");
  const [yieldQty, setYieldQty] = useState<string>(String(row.qty));
  const [wastage, setWastage] = useState<string>("0");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!materialId) { toast.error("Pick a target raw material"); return; }
    const y = Number(yieldQty);
    if (!y || y <= 0) { toast.error("Yield must be > 0"); return; }
    setSaving(true);
    const { error } = await sb.rpc("commit_repurpose", {
      _queue_id: row.id,
      _material_id: materialId,
      _yield_qty: y,
      _wastage_qty: Number(wastage) || 0,
      _note: note || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Converted to raw material");
    onDone();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Repurpose to raw material</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Source damaged product</p>
            <p className="font-medium">{row.product_name} · {row.qty} units</p>
          </div>
          <div>
            <Label>Target raw material</Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="e.g. Fish feed flour" /></SelectTrigger>
              <SelectContent>
                {materials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}{m.unit ? ` (${m.unit})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-1.5"><Wheat className="w-3.5 h-3.5" />Yield qty</Label>
              <Input type="number" min="0" step="any" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />Wastage qty</Label>
              <Input type="number" min="0" step="any" value={wastage} onChange={(e) => setWastage(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Repurpose"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SellDialog({ row, onClose, onDone }: {
  row: QueueRow; onClose: () => void; onDone: () => void;
}) {
  const [qty, setQty] = useState<string>(String(row.qty));
  const [unitPrice, setUnitPrice] = useState<string>("0");
  const [customer, setCustomer] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const total = (Number(qty) || 0) * (Number(unitPrice) || 0);

  const submit = async () => {
    const q = Number(qty);
    const p = Number(unitPrice);
    if (!q || q <= 0) { toast.error("Quantity must be greater than zero"); return; }
    if (q > row.qty) { toast.error(`Only ${row.qty} available`); return; }
    if (p < 0) { toast.error("Unit price cannot be negative"); return; }
    setSaving(true);
    try {
      await sellDamagedGoods({
        productId: row.product_id,
        showroomId: row.source_showroom_id,
        qty: q,
        unitPrice: p,
        customerName: customer || null,
        note: note || null,
      });
      // If we sold the entire queued quantity, mark the queue row as discarded (fully processed).
      if (q >= row.qty) {
        await sb.from("repurpose_queue").update({
          status: "discarded",
          note: `Sold as damaged goods · ${total.toFixed(2)}`,
          processed_at: new Date().toISOString(),
        }).eq("id", row.id);
      } else {
        // Partial sale — reduce remaining qty on the queued row.
        await sb.from("repurpose_queue").update({ qty: row.qty - q }).eq("id", row.id);
      }
      toast.success(`Sold ${q} units for ${total.toFixed(2)}`);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to record sale");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="size-4 text-emerald-600" />
            Sell damaged goods
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Damaged product available</p>
            <p className="font-medium">{row.product_name} · {row.qty} units</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantity to sell</Label>
              <Input type="number" min="0" max={row.qty} step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Unit price</Label>
              <Input type="number" min="0" step="any" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Total revenue</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400 text-lg">
              {total.toFixed(2)}
            </span>
          </div>
          <div>
            <Label>Customer name (optional)</Label>
            <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Local feed buyer" className="mt-1" />
          </div>
          <div>
            <Label>Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sold as animal feed / discount clearance…" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? "Saving…" : "Record sale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
