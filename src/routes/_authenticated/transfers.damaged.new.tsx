import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { AppShell, Card } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Factory, Store, ArrowRight, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/transfers/damaged/new")({
  head: () => ({ meta: [{ title: "Damaged Return · Muzahid Food" }] }),
  component: () => (
    <PermissionGate anyOf={["inventory.damaged_return", "inventory.transfer"]} title={"Damaged Return"}>
      <DamagedReturnPage />
    </PermissionGate>
  ),

});

const sb = supabase as any;

type Product = { id: string; name: string; sku: string | null; unit: string | null };
type DamagedRow = { product_id: string; showroom_id: string | null; quantity: number };
type Row = { product_id: string; qty: string };

function DamagedReturnPage() {
  const navigate = useNavigate();
  const { showrooms, currentShowroomId } = useShowroomScope();
  const source = currentShowroomId;
  const sourceName = showrooms.find((s) => s.id === source)?.name ?? "Current showroom";

  const [products, setProducts] = useState<Product[]>([]);
  const [damaged, setDamaged] = useState<DamagedRow[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!source) { setLoading(false); return; }
    setLoading(true);
    const [{ data: p }, { data: d }] = await Promise.all([
      sb.from("products").select("id,name,sku,unit").eq("is_active", true).order("name"),
      sb.from("damaged_stock").select("product_id,showroom_id,quantity").eq("showroom_id", source),
    ]);
    setProducts((p ?? []) as Product[]);
    setDamaged(((d ?? []) as DamagedRow[]).filter((r) => Number(r.quantity) > 0));
    setLoading(false);
  }, [source]);
  useEffect(() => { load(); }, [load]);

  const productsWithDamaged = useMemo(() => {
    const map = new Map(damaged.map((d) => [d.product_id, Number(d.quantity)] as const));
    return products
      .filter((p) => map.has(p.id))
      .map((p) => ({ ...p, damagedQty: map.get(p.id) ?? 0 }));
  }, [products, damaged]);

  const totalQty = items.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const hasOver = items.some((r) => {
    const have = damaged.find((d) => d.product_id === r.product_id)?.quantity ?? 0;
    return (Number(r.qty) || 0) > Number(have);
  });

  const addProduct = (id: string) => {
    setItems((prev) => prev.some((r) => r.product_id === id) ? prev : [...prev, { product_id: id, qty: "" }]);
  };
  const setRow = (i: number, patch: Partial<Row>) =>
    setItems((v) => v.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const rmRow = (i: number) => setItems((v) => v.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!source) { toast.error("Select a showroom first"); return; }
    const clean = items
      .map((r) => ({ product_id: r.product_id, qty: Number(r.qty) }))
      .filter((r) => r.product_id && r.qty > 0);
    if (!clean.length) { toast.error("Add at least one item"); return; }
    if (hasOver) { toast.error("Some quantities exceed damaged stock"); return; }
    setSaving(true);
    const code = `DR-${Date.now().toString(36).toUpperCase()}`;
    // Factory dest = we need a "factory" placeholder. Use source_showroom_id=source, dest_showroom_id=null represents factory.
    // But transfers.dest_showroom_id is NOT NULL in schema — use source as dest sentinel and rely on kind='damaged_return'.
    // Preferred: allow dest to be source when kind=damaged_return; approval RPC ignores dest.
    const { data: created, error } = await sb
      .from("transfers")
      .insert({
        code,
        source_showroom_id: source,
        dest_showroom_id: source, // factory sentinel; kind identifies flow
        kind: "damaged_return",
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
    toast.success("Damaged return created — send to factory from transfers list");
    setSaving(false);
    navigate({ to: "/transfers" });
  };

  return (
    <AppShell
      title="New Damaged Return"
      subtitle="Return damaged / expired finished goods to factory"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/transfers"><ArrowLeft className="w-4 h-4 mr-2" />Back</Link>
        </Button>
      }
    >
      <Card className="mb-4">
        <div className="p-4 flex items-center gap-4">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-orange-500/10 text-orange-600 grid place-items-center">
              <Store className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">From</p>
              <p className="font-semibold truncate">{sourceName}</p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <Factory className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">To (repurpose queue)</p>
              <p className="font-semibold truncate">Factory</p>
            </div>
          </div>
          <Badge variant="secondary" className="ml-auto"><Undo2 className="w-3.5 h-3.5 mr-1" />Damaged</Badge>
        </div>
      </Card>

      {!source ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          Select a specific showroom scope to file a damaged return.
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <div className="p-5 space-y-3">
              <h3 className="font-semibold">Damaged items in {sourceName}</h3>
              {loading ? (
                <p className="text-sm text-muted-foreground py-6">Loading…</p>
              ) : productsWithDamaged.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6">No damaged stock at this showroom.</p>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-muted/60">
                      <tr className="text-left">
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2 text-right">Damaged</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {productsWithDamaged.map((p) => {
                        const added = items.some((r) => r.product_id === p.id);
                        return (
                          <tr key={p.id} className="border-t">
                            <td className="px-3 py-2">
                              <p className="font-medium">{p.name}</p>
                              <p className="text-xs text-muted-foreground">{p.sku ?? "—"}</p>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Badge variant="outline" className="tabular-nums">{p.damagedQty}{p.unit ? ` ${p.unit}` : ""}</Badge>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button size="sm" disabled={added} onClick={() => addProduct(p.id)}>
                                <Plus className="w-3.5 h-3.5 mr-1" />{added ? "Added" : "Add"}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></div>
                </div>
              )}
            </div>
          </Card>

          <Card className="lg:sticky lg:top-4 lg:self-start">
            <div className="p-5 space-y-3">
              <h3 className="font-semibold">Selected ({items.length})</h3>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No items yet</p>
              ) : items.map((row, i) => {
                const p = products.find((x) => x.id === row.product_id);
                const have = damaged.find((d) => d.product_id === row.product_id)?.quantity ?? 0;
                const over = (Number(row.qty) || 0) > Number(have);
                return (
                  <div key={row.product_id} className={`rounded-lg border p-3 ${over ? "border-destructive/60 bg-destructive/5" : ""}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{p?.name ?? row.product_id}</p>
                        <p className="text-xs text-muted-foreground">Available <span className="tabular-nums">{Number(have)}</span> {p?.unit ?? ""}</p>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => rmRow(i)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <Input
                      type="number" min="0" step="any" placeholder="Qty"
                      value={row.qty}
                      onChange={(e) => setRow(i, { qty: e.target.value })}
                      className={`h-9 mt-2 ${over ? "border-destructive" : ""}`}
                    />
                  </div>
                );
              })}
              <div className="space-y-1.5">
                <Label>Note</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Reason, batch info…" />
              </div>
              <div className="flex items-center justify-between text-sm pt-2 border-t">
                <span className="text-muted-foreground">Total qty</span>
                <span className="font-medium tabular-nums">{totalQty}</span>
              </div>
              <Button className="w-full" size="lg" onClick={submit} disabled={saving || items.length === 0 || hasOver}>
                {saving ? "Creating…" : "Create Damaged Return"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
