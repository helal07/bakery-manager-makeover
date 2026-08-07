import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Search, PackagePlus, Boxes, AlertTriangle, History, Sliders } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";

export const Route = createFileRoute("/_authenticated/product-stock")({
  head: () => ({ meta: [{ title: "Product Stock · Muzahid Food" }] }),
  component: ProductStockPage,
});

const sb = supabase as any;

type Product = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
};
type StockRow = {
  product: Product;
  quantity: number;
  min_stock: number;
  updated_at: string | null;
};
type LedgerRow = {
  id: string;
  kind: string;
  qty: number;
  note: string | null;
  created_at: string;
  ref_type: string | null;
};

function ProductStockPage() {
  const { currentShowroomId, hasGlobalAccess, showrooms } = useShowroomScope();
  const loc = currentShowroomId; // null = factory
  const isFactory = loc === null;

  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [adjustFor, setAdjustFor] = useState<StockRow | null>(null);
  const [prodOpen, setProdOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<StockRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: products, error: pErr }, stockRes] = await Promise.all([
      sb.from("products").select("id,name,sku,category,unit").eq("is_active", true).order("name"),
      isFactory
        ? sb.from("product_stock").select("product_id,quantity,min_stock,updated_at").is("showroom_id", null)
        : sb.from("product_stock").select("product_id,quantity,min_stock,updated_at").eq("showroom_id", loc),
    ]);
    if (pErr) toast.error(pErr.message);
    const stockMap = new Map<string, { quantity: number; min_stock: number; updated_at: string | null }>();
    for (const s of (stockRes.data ?? []) as any[]) {
      stockMap.set(s.product_id, {
        quantity: Number(s.quantity ?? 0),
        min_stock: Number(s.min_stock ?? 0),
        updated_at: s.updated_at ?? null,
      });
    }
    const merged: StockRow[] = ((products ?? []) as Product[]).map((p) => {
      const s = stockMap.get(p.id);
      return {
        product: p,
        quantity: s?.quantity ?? 0,
        min_stock: s?.min_stock ?? 0,
        updated_at: s?.updated_at ?? null,
      };
    });
    setRows(merged);
    setLoading(false);
  }, [loc, isFactory]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.product.name.toLowerCase().includes(q) ||
        (r.product.sku ?? "").toLowerCase().includes(q) ||
        (r.product.category ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const totals = useMemo(() => {
    const total = rows.reduce((a, r) => a + r.quantity, 0);
    const low = rows.filter((r) => r.min_stock > 0 && r.quantity <= r.min_stock).length;
    return { total, low, skus: rows.length };
  }, [rows]);

  const locationLabel = isFactory
    ? "Factory"
    : showrooms.find((s) => s.id === loc)?.name ?? "Showroom";

  return (
    <AppShell title="Product Stock" subtitle={`Live stock at ${locationLabel}`}>
      <div className="mb-4 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
        This screen reads live stock from the database, scoped to your current location.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <StatCard icon={<Boxes className="w-4 h-4" />} label="SKUs" value={totals.skus} />
        <StatCard icon={<PackagePlus className="w-4 h-4" />} label="Units on hand" value={totals.total} />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Low stock"
          value={totals.low}
          tone={totals.low > 0 ? "warn" : undefined}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-between mb-4">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, SKU, category…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {isFactory && hasGlobalAccess && (
          <Link
            to="/production/produce"
            className="inline-flex items-center justify-center h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
          >
            <PackagePlus className="w-4 h-4 mr-2" /> New Production
          </Link>
        )}
      </div>




      <Card>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No products yet.{" "}
            <Link to="/catalog" className="text-primary underline">Create products in the catalog</Link>.
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matches.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-2">Product</th>
                  <th className="py-2 px-2">SKU</th>
                  <th className="py-2 px-2">Category</th>
                  <th className="py-2 px-2 text-right">Qty</th>
                  <th className="py-2 px-2 text-right">Min</th>
                  <th className="py-2 px-2">Updated</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const low = r.min_stock > 0 && r.quantity <= r.min_stock;
                  return (
                    <tr key={r.product.id} className={`border-b hover:bg-muted/40 ${low ? "bg-amber-500/5" : ""}`}>
                      <td className="py-2 px-2 font-medium">{r.product.name}</td>
                      <td className="py-2 px-2 font-mono text-xs">{r.product.sku ?? "—"}</td>
                      <td className="py-2 px-2">{r.product.category ?? "—"}</td>
                      <td className="py-2 px-2 text-right">
                        <span className={low ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}>
                          {r.quantity}
                        </span>{" "}
                        <span className="text-muted-foreground text-xs">{r.product.unit}</span>
                      </td>
                      <td className="py-2 px-2 text-right text-muted-foreground">{r.min_stock || "—"}</td>
                      <td className="py-2 px-2 text-muted-foreground text-xs">
                        {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setHistoryFor(r)}>
                          <History className="w-4 h-4 mr-1" /> History
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setAdjustFor(r)}>
                          <Sliders className="w-4 h-4 mr-1" /> Adjust
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {adjustFor && (
        <AdjustDialog
          row={adjustFor}
          showroomId={loc}
          onClose={() => setAdjustFor(null)}
          onSaved={() => { setAdjustFor(null); load(); }}
        />
      )}




      {historyFor && (
        <HistorySheet
          row={historyFor}
          showroomId={loc}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </AppShell>
  );
}

function StatCard({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: number; tone?: "warn" }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-md grid place-items-center ${
          tone === "warn" ? "bg-amber-500/15 text-amber-600" : "bg-primary/10 text-primary"
        }`}>
          {icon}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function AdjustDialog({
  row, showroomId, onClose, onSaved,
}: {
  row: StockRow;
  showroomId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const n = Number(qty);
    if (!qty || Number.isNaN(n) || n === 0) { toast.error("Enter a non-zero quantity"); return; }
    setSaving(true);
    const { error } = await sb.rpc("commit_stock_movement", {
      _product_id: row.product.id,
      _showroom_id: showroomId,
      _qty: n,
      _kind: "adjustment",
      _ref_type: null,
      _ref_id: null,
      _note: note || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Stock adjusted");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust — {row.product.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="text-sm text-muted-foreground">
            Current: <span className="font-medium text-foreground">{row.quantity} {row.product.unit}</span>
          </div>
          <div>
            <Label>Change (+ / −)</Label>
            <Input
              type="number"
              step="any"
              placeholder="e.g. 10 or -3"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div>
            <Label>Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Apply"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductionDialog({
  products, onClose, onSaved,
}: {
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const n = Number(qty);
    if (!productId) { toast.error("Pick a product"); return; }
    if (!qty || Number.isNaN(n) || n <= 0) { toast.error("Enter a positive quantity"); return; }
    setSaving(true);
    const { error } = await sb.rpc("commit_stock_movement", {
      _product_id: productId,
      _showroom_id: null,
      _qty: n,
      _kind: "production",
      _ref_type: null,
      _ref_id: null,
      _note: note || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Production added to factory stock");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Production (Factory)</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.sku ? ` (${p.sku})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantity</Label>
            <Input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <Label>Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistorySheet({
  row, showroomId, onClose,
}: {
  row: StockRow;
  showroomId: string | null;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      let q = sb
        .from("stock_ledger")
        .select("id,kind,qty,note,created_at,ref_type")
        .eq("product_id", row.product.id)
        .order("created_at", { ascending: false })
        .limit(50);
      q = showroomId === null ? q.is("showroom_id", null) : q.eq("showroom_id", showroomId);
      const { data, error } = await q;
      if (!alive) return;
      if (error) toast.error(error.message);
      setEntries((data ?? []) as LedgerRow[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [row.product.id, showroomId]);

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>History — {row.product.name}</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No movements yet.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => (
                <li key={e.id} className="border rounded-md p-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-medium capitalize">{e.kind.replace(/_/g, " ")}</span>
                    <span className={`font-mono ${e.qty >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {e.qty >= 0 ? "+" : ""}{e.qty}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(e.created_at).toLocaleString()}
                    {e.ref_type ? ` · ${e.ref_type}` : ""}
                  </div>
                  {e.note && <div className="text-xs mt-1">{e.note}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
