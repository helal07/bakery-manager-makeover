import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { AppShell, Card } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, ArrowLeft, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";

export const Route = createFileRoute("/_authenticated/transfers/new")({
  head: () => ({ meta: [{ title: "New Transfer · Muzahid Food" }] }),
  component: NewTransferPage,
});

const sb = supabase as any;

type Product = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  category: string | null;
};
type StockRow = { product_id: string; showroom_id: string | null; quantity: number };
type Row = { product_id: string; qty: string };

function NewTransferPage() {
  const navigate = useNavigate();
  const { showrooms, hasGlobalAccess, currentShowroomId } = useShowroomScope();

  const defaultSource = hasGlobalAccess ? "factory" : (currentShowroomId ?? "factory");
  const [source, setSource] = useState<string>(defaultSource);
  const [dest, setDest] = useState<string>("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: s }] = await Promise.all([
      sb.from("products").select("id,name,sku,unit,category").eq("is_active", true).order("name"),
      sb.from("product_stock").select("product_id,showroom_id,quantity"),
    ]);
    setProducts((p ?? []) as Product[]);
    setStock((s ?? []) as StockRow[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const stockAt = useCallback((productId: string, locId: string | null) => {
    const row = stock.find(
      (r) => r.product_id === productId && (r.showroom_id ?? null) === (locId ?? null),
    );
    return row ? Number(row.quantity) : 0;
  }, [stock]);

  const sourceLocId: string | null = source === "factory" ? null : source;

  const destOptions = useMemo(
    () => showrooms.filter((s) => (source === "factory" ? true : s.id !== source)),
    [showrooms, source],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  const addProduct = (p: Product) => {
    setItems((prev) => {
      if (prev.some((r) => r.product_id === p.id)) {
        toast.info(`${p.name} already added`);
        return prev;
      }
      return [...prev, { product_id: p.id, qty: "" }];
    });
  };
  const setRow = (i: number, patch: Partial<Row>) =>
    setItems((v) => v.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const rmRow = (i: number) => setItems((v) => v.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!dest) { toast.error("Pick destination"); return; }
    if (source !== "factory" && source === dest) { toast.error("Source and destination cannot be same"); return; }
    const clean = items
      .map((r) => ({ product_id: r.product_id, qty: Number(r.qty) }))
      .filter((r) => r.product_id && r.qty > 0);
    if (clean.length === 0) { toast.error("Add at least one item with qty"); return; }
    for (const c of clean) {
      const have = stockAt(c.product_id, sourceLocId);
      if (c.qty > have) {
        const p = products.find((x) => x.id === c.product_id);
        toast.error(`Not enough stock for ${p?.name ?? "item"} (have ${have})`);
        return;
      }
    }
    setSaving(true);
    const code = `TR-${Date.now().toString(36).toUpperCase()}`;
    const { data: created, error } = await sb
      .from("transfers")
      .insert({
        code,
        source_showroom_id: sourceLocId,
        dest_showroom_id: dest,
        note: note || null,
        status: "draft",
      })
      .select("id")
      .single();
    if (error || !created) { toast.error(error?.message ?? "Failed"); setSaving(false); return; }
    const { error: itErr } = await sb
      .from("transfer_items")
      .insert(clean.map((c) => ({ transfer_id: created.id, product_id: c.product_id, qty: c.qty })));
    if (itErr) { toast.error(itErr.message); setSaving(false); return; }
    toast.success("Transfer created as draft");
    setSaving(false);
    navigate({ to: "/transfers" });
  };

  return (
    <AppShell
      title="New Transfer"
      subtitle="Move stock between factory and showrooms"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/transfers"><ArrowLeft className="w-4 h-4 mr-2" />Back</Link>
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card>
            <div className="grid md:grid-cols-2 gap-3">
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
            <div className="mt-3">
              <Label>Note</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Search products</h3>
              <div className="relative w-64">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Name or SKU"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="max-h-[420px] overflow-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="py-2 px-2">Product</th>
                      <th className="py-2 px-2">SKU</th>
                      <th className="py-2 px-2 text-right">Stock at source</th>
                      <th className="py-2 px-2 text-right">Stock at dest</th>
                      <th className="py-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 200).map((p) => {
                      const src = stockAt(p.id, sourceLocId);
                      const dst = dest ? stockAt(p.id, dest) : 0;
                      const added = items.some((r) => r.product_id === p.id);
                      return (
                        <tr key={p.id} className="border-b hover:bg-muted/40">
                          <td className="py-2 px-2">{p.name}</td>
                          <td className="py-2 px-2 text-muted-foreground">{p.sku ?? "—"}</td>
                          <td className="py-2 px-2 text-right">
                            <Badge variant={src > 0 ? "secondary" : "outline"}>
                              {src} {p.unit ?? ""}
                            </Badge>
                          </td>
                          <td className="py-2 px-2 text-right text-muted-foreground">
                            {dest ? `${dst} ${p.unit ?? ""}` : "—"}
                          </td>
                          <td className="py-2 px-2 text-right">
                            <Button
                              size="sm"
                              variant={added ? "outline" : "default"}
                              disabled={added || src <= 0}
                              onClick={() => addProduct(p)}
                            >
                              {added ? "Added" : <><Plus className="w-3 h-3 mr-1" />Add</>}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No products</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h3 className="font-semibold mb-3">Selected items ({items.length})</h3>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Search and add products from the left.</p>
            ) : (
              <div className="space-y-2">
                {items.map((row, i) => {
                  const p = products.find((x) => x.id === row.product_id);
                  const have = stockAt(row.product_id, sourceLocId);
                  const qtyNum = Number(row.qty) || 0;
                  const over = qtyNum > have;
                  return (
                    <div key={row.product_id} className="border rounded p-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{p?.name ?? row.product_id}</p>
                          <p className="text-xs text-muted-foreground">
                            Available: {have} {p?.unit ?? ""}
                          </p>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => rmRow(i)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="Qty"
                          value={row.qty}
                          onChange={(e) => setRow(i, { qty: e.target.value })}
                          className={over ? "border-destructive" : ""}
                        />
                        <span className="text-xs text-muted-foreground w-10">{p?.unit ?? ""}</span>
                      </div>
                      {over && (
                        <p className="text-xs text-destructive mt-1">Exceeds available stock</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Button className="w-full" onClick={submit} disabled={saving || items.length === 0}>
            {saving ? "Creating…" : "Create Draft Transfer"}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
