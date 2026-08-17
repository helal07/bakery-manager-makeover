import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { AppShell, Card } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, Trash2, ArrowLeft, Search, ArrowRight, Factory, Store,
  PackageSearch, ClipboardList, Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/transfers/new")({
  head: () => ({ meta: [{ title: "New Transfer · Muzahid Food" }] }),
  component: () => (
    <PermissionGate anyOf={["inventory.transfer"]} title={"New Transfer"}>
      <NewTransferPage />
    </PermissionGate>
  ),

});

const sb = supabase as any;

type Product = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  category: string | null;
  cost: number | null;
  transfer_price: number | null;
};
type StockRow = { product_id: string; showroom_id: string | null; quantity: number };
type Row = { product_id: string; qty: string; price: string };

function NewTransferPage() {
  const navigate = useNavigate();
  const { showrooms, hasGlobalAccess, currentShowroomId, assignedShowroomIds } = useShowroomScope();

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

  /**
   * Locations this user may send FROM. Global admins may send from the factory
   * or any outlet they can see; an outlet user may only send from their own
   * assigned outlets. Never offer a location the user cannot access.
   */
  const sourceOptions = useMemo(() => {
    if (hasGlobalAccess) {
      return [{ id: "factory", name: "Factory" }, ...showrooms.map((s) => ({ id: s.id, name: s.name }))];
    }
    return showrooms
      .filter((s) => assignedShowroomIds.includes(s.id))
      .map((s) => ({ id: s.id, name: s.name }));
  }, [hasGlobalAccess, showrooms, assignedShowroomIds]);

  // Keep the selection inside the allowed set.
  useEffect(() => {
    if (sourceOptions.length === 0) return;
    if (!sourceOptions.some((o) => o.id === source)) setSource(sourceOptions[0].id);
  }, [sourceOptions, source]);

  const sourceLocId: string | null = source === "factory" ? null : source;

  const load = useCallback(async () => {
    setLoading(true);
    // Stock is read for the two locations involved only — never "all locations".
    const stockQ = sb.from("product_stock").select("product_id,showroom_id,quantity");
    const [{ data: p }, { data: sSrc }, { data: sDest }] = await Promise.all([
      sb.from("products").select("id,name,sku,unit,category").eq("is_active", true).order("name"),
      sourceLocId ? stockQ.eq("showroom_id", sourceLocId) : stockQ.is("showroom_id", null),
      dest
        ? sb.from("product_stock").select("product_id,showroom_id,quantity").eq("showroom_id", dest)
        : Promise.resolve({ data: [] as StockRow[] }),
    ]);
    setProducts((p ?? []) as Product[]);
    setStock([...((sSrc ?? []) as StockRow[]), ...((sDest ?? []) as StockRow[])]);
    setLoading(false);
  }, [sourceLocId, dest]);
  useEffect(() => { load(); }, [load]);

  const stockAt = useCallback((productId: string, locId: string | null) => {
    const row = stock.find(
      (r) => r.product_id === productId && (r.showroom_id ?? null) === (locId ?? null),
    );
    return row ? Number(row.quantity) : 0;
  }, [stock]);

  const sourceName = source === "factory" ? "Factory" : (showrooms.find((s) => s.id === source)?.name ?? "—");
  const destName = dest ? (showrooms.find((s) => s.id === dest)?.name ?? "—") : "Select destination";

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

  const totalUnits = useMemo(
    () => items.reduce((sum, r) => sum + (Number(r.qty) || 0), 0),
    [items],
  );
  const hasOver = items.some((r) => (Number(r.qty) || 0) > stockAt(r.product_id, sourceLocId));

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
    if (!sourceOptions.some((o) => o.id === source)) {
      toast.error("You don't have access to this source location");
      return;
    }
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
      {/* Route summary strip */}
      <Card className="mb-4">
        <div className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
              {source === "factory" ? <Factory className="w-5 h-5" /> : <Store className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">From</p>
              <p className="font-semibold truncate">{sourceName}</p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0 hidden md:block" />
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`h-10 w-10 rounded-lg grid place-items-center shrink-0 ${dest ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
              <Store className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">To</p>
              <p className={`font-semibold truncate ${dest ? "" : "text-muted-foreground"}`}>{destName}</p>
            </div>
          </div>
          <Separator orientation="vertical" className="hidden md:block h-10" />
          <div className="flex gap-6 md:gap-8">
            <div>
              <p className="text-xs text-muted-foreground">Items</p>
              <p className="text-lg font-semibold tabular-nums">{items.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total qty</p>
              <p className="text-lg font-semibold tabular-nums">{totalUnits}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* LEFT: Route + Product search */}
        <div className="space-y-5 min-w-0">
          <Card>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-md bg-muted grid place-items-center">
                  <ArrowRight className="w-4 h-4" />
                </div>
                <h3 className="font-semibold">Route & note</h3>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>From</Label>
                  <Select value={source} onValueChange={setSource} disabled={sourceOptions.length <= 1}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {sourceOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                </div>
                <div className="space-y-1.5">
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
              <div className="space-y-1.5">
                <Label>Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Anything the receiving showroom should know…"
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-5 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-md bg-muted grid place-items-center">
                  <PackageSearch className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold leading-tight">Search products</h3>
                  <p className="text-xs text-muted-foreground">Live stock at source & destination</p>
                </div>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by name or SKU"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="px-5 pb-5">
              {loading ? (
                <div className="py-16 text-center text-sm text-muted-foreground">Loading products…</div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <div className="max-h-[520px] overflow-auto">
                    <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
                      <thead className="bg-muted/60 sticky top-0 backdrop-blur">
                        <tr className="text-left">
                          <th className="py-2.5 px-3 font-medium">Product</th>
                          <th className="py-2.5 px-3 font-medium hidden md:table-cell">SKU</th>
                          <th className="py-2.5 px-3 font-medium text-right">Source</th>
                          <th className="py-2.5 px-3 font-medium text-right hidden sm:table-cell">Dest</th>
                          <th className="py-2.5 px-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, 200).map((p) => {
                          const src = stockAt(p.id, sourceLocId);
                          const dst = dest ? stockAt(p.id, dest) : 0;
                          const added = items.some((r) => r.product_id === p.id);
                          const disabled = added || src <= 0;
                          return (
                            <tr key={p.id} className="border-t hover:bg-muted/40 transition-colors">
                              <td className="py-2.5 px-3">
                                <p className="font-medium truncate">{p.name}</p>
                                <p className="text-xs text-muted-foreground md:hidden">{p.sku ?? "—"}</p>
                              </td>
                              <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">{p.sku ?? "—"}</td>
                              <td className="py-2.5 px-3 text-right">
                                <Badge variant={src > 0 ? "secondary" : "outline"} className="tabular-nums">
                                  {src}{p.unit ? ` ${p.unit}` : ""}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3 text-right text-muted-foreground tabular-nums hidden sm:table-cell">
                                {dest ? `${dst}${p.unit ? ` ${p.unit}` : ""}` : "—"}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <Button
                                  size="sm"
                                  variant={added ? "outline" : "default"}
                                  disabled={disabled}
                                  onClick={() => addProduct(p)}
                                >
                                  {added ? (
                                    <><Check className="w-3.5 h-3.5 mr-1" />Added</>
                                  ) : (
                                    <><Plus className="w-3.5 h-3.5 mr-1" />Add</>
                                  )}
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                        {filtered.length === 0 && (
                          <tr><td colSpan={5} className="py-12 text-center text-muted-foreground">No products match your search</td></tr>
                        )}
                      </tbody>
                    </table></div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT: Cart */}
        <div className="lg:sticky lg:top-4 lg:self-start space-y-4">
          <Card>
            <div className="p-5 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-md bg-muted grid place-items-center">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <h3 className="font-semibold">Selected items</h3>
              </div>
              <Badge variant="secondary" className="tabular-nums">{items.length}</Badge>
            </div>

            <div className="px-5 pb-5">
              {items.length === 0 ? (
                <div className="rounded-lg border border-dashed py-10 text-center">
                  <PackageSearch className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No items yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Add products from the list on the left</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[440px] overflow-auto pr-1 -mr-1">
                  {items.map((row, i) => {
                    const p = products.find((x) => x.id === row.product_id);
                    const have = stockAt(row.product_id, sourceLocId);
                    const qtyNum = Number(row.qty) || 0;
                    const over = qtyNum > have;
                    return (
                      <div
                        key={row.product_id}
                        className={`rounded-lg border p-3 transition-colors ${over ? "border-destructive/60 bg-destructive/5" : "hover:bg-muted/40"}`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <p className="font-medium truncate leading-tight">{p?.name ?? row.product_id}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Available <span className="tabular-nums">{have}</span> {p?.unit ?? ""}
                            </p>
                          </div>
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => rmRow(i)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="Qty"
                            value={row.qty}
                            onChange={(e) => setRow(i, { qty: e.target.value })}
                            className={`h-9 ${over ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          />
                          <span className="text-xs text-muted-foreground w-12 shrink-0">{p?.unit ?? ""}</span>
                        </div>
                        {over && (
                          <p className="text-xs text-destructive mt-1.5">Exceeds available stock</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t p-4 space-y-3 bg-muted/30 rounded-b-xl">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Items</span>
                <span className="font-medium tabular-nums">{items.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total qty</span>
                <span className="font-medium tabular-nums">{totalUnits}</span>
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={submit}
                disabled={saving || items.length === 0 || !dest || hasOver}
              >
                {saving ? "Creating…" : "Create Draft Transfer"}
              </Button>
              {!dest && items.length > 0 && (
                <p className="text-xs text-center text-muted-foreground">Pick a destination to continue</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
