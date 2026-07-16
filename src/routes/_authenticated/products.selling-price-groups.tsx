import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, Card } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Tag, Search, Save, Pencil, Power, PowerOff, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/products/selling-price-groups")({
  head: () => ({ meta: [{ title: "Selling Price Groups · Muzahid Food" }] }),
  component: SellingPriceGroupsPage,
});

type Spg = { id: string; name: string; isActive: boolean };
type Prod = { id: string; name: string; sku: string; price: number };

function SellingPriceGroupsPage() {
  const [spgs, setSpgs] = useState<Spg[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [products, setProducts] = useState<Prod[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({}); // productId -> price string ("" = no override)
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refreshGroups = async () => {
    const { data, error } = await sb
      .from("selling_price_groups")
      .select("id,name,is_active")
      .order("is_active", { ascending: false })
      .order("name");
    if (error) return toast.error(error.message);
    const rows: Spg[] = (data ?? []).map((r: any) => ({ id: r.id, name: r.name, isActive: !!r.is_active }));
    setSpgs(rows);
    const firstActive = rows.find((r) => r.isActive);
    if (!selectedId && firstActive) setSelectedId(firstActive.id);
  };

  useEffect(() => { refreshGroups(); }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: pd, error: pe }, { data: xd, error: xe }] = await Promise.all([
        sb.from("products").select("id,name,sku,price").order("name"),
        sb.from("product_selling_prices").select("product_id,price").eq("selling_price_group_id", selectedId),
      ]);
      if (cancelled) return;
      if (pe || xe) { toast.error((pe ?? xe)!.message); setLoading(false); return; }
      const map: Record<string, string> = {};
      for (const r of xd ?? []) map[r.product_id as string] = String(r.price);
      setProducts((pd ?? []) as Prod[]);
      setPrices(map);
      setDirty({});
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  const createGroup = async () => {
    const name = newName.trim();
    if (!name) return toast.error("Name required");
    if (name.length > 60) return toast.error("Name too long (max 60)");
    const { data, error } = await sb.from("selling_price_groups").insert({ name }).select("id").single();
    if (error) return toast.error(error.message);
    setNewName("");
    await refreshGroups();
    setSelectedId(data.id);
  };

  const startEdit = (g: Spg) => { setEditingId(g.id); setEditName(g.name); };
  const cancelEdit = () => { setEditingId(null); setEditName(""); };
  const saveEdit = async () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) return toast.error("Name required");
    if (name.length > 60) return toast.error("Name too long (max 60)");
    const { error } = await sb.from("selling_price_groups").update({ name }).eq("id", editingId);
    if (error) return toast.error(error.message);
    toast.success("Renamed");
    cancelEdit();
    refreshGroups();
  };

  const toggleActive = async (g: Spg) => {
    const { error } = await sb.from("selling_price_groups").update({ is_active: !g.isActive }).eq("id", g.id);
    if (error) return toast.error(error.message);
    toast.success(g.isActive ? "Deactivated" : "Activated");
    if (g.isActive && selectedId === g.id) setSelectedId(null);
    refreshGroups();
  };

  const deleteGroup = async (g: Spg) => {
    if (!confirm(`Permanently delete "${g.name}"? All product prices for this group will be removed.`)) return;
    const { error } = await sb.from("selling_price_groups").delete().eq("id", g.id);
    if (error) {
      toast.error(error.message.includes("foreign key")
        ? "Cannot delete — group is linked to customers. Deactivate it instead."
        : error.message);
      return;
    }
    toast.success("Deleted");
    if (selectedId === g.id) setSelectedId(null);
    refreshGroups();
  };

  const visibleGroups = useMemo(
    () => spgs.filter((g) => showInactive || g.isActive),
    [spgs, showInactive],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }, [products, query]);

  const onChangePrice = (productId: string, v: string) => {
    setPrices((m) => ({ ...m, [productId]: v }));
    setDirty((d) => ({ ...d, [productId]: true }));
  };

  const saveAll = async () => {
    if (!selectedId) return;
    const changed = Object.keys(dirty);
    if (changed.length === 0) return toast.info("No changes");
    const toUpsert: any[] = [];
    const toDelete: string[] = [];
    for (const pid of changed) {
      const raw = (prices[pid] ?? "").trim();
      if (raw === "") { toDelete.push(pid); continue; }
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 0) return toast.error(`Invalid price for a product`);
      toUpsert.push({ product_id: pid, selling_price_group_id: selectedId, price: num });
    }
    setSaving(true);
    try {
      if (toUpsert.length) {
        const { error } = await sb
          .from("product_selling_prices")
          .upsert(toUpsert, { onConflict: "product_id,selling_price_group_id" });
        if (error) throw error;
      }
      if (toDelete.length) {
        const { error } = await sb
          .from("product_selling_prices")
          .delete()
          .eq("selling_price_group_id", selectedId)
          .in("product_id", toDelete);
        if (error) throw error;
      }
      toast.success(`Saved ${changed.length} price${changed.length === 1 ? "" : "s"}`);
      setDirty({});
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const dirtyCount = Object.keys(dirty).length;

  return (
    <AppShell
      title="Selling Price Groups"
      subtitle="Define fixed alternate prices per product for each price group"
    >
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-muted-foreground">PRICE GROUPS</div>
            <label className="text-[11px] text-muted-foreground inline-flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show inactive
            </label>
          </div>
          <div className="flex gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Wholesale" />
            <Button onClick={createGroup} size="sm"><Plus className="size-4" /></Button>
          </div>
          <ul className="space-y-1">
            {visibleGroups.map((g) => {
              const isEditing = editingId === g.id;
              return (
                <li key={g.id}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded ${selectedId === g.id ? "bg-primary/10 text-primary" : "hover:bg-muted"} ${!g.isActive ? "opacity-60" : ""}`}>
                  {isEditing ? (
                    <>
                      <Input autoFocus className="h-7 flex-1 text-sm" value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }} />
                      <button onClick={saveEdit} className="p-1 hover:bg-muted rounded" aria-label="Save"><Check className="size-3.5" /></button>
                      <button onClick={cancelEdit} className="p-1 hover:bg-muted rounded" aria-label="Cancel"><X className="size-3.5" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => g.isActive && setSelectedId(g.id)}
                        disabled={!g.isActive}
                        className="flex-1 inline-flex items-center gap-1.5 text-sm text-left disabled:cursor-not-allowed">
                        <Tag className="size-3.5" />{g.name}
                        {!g.isActive && <span className="text-[10px] px-1 rounded bg-muted text-muted-foreground">inactive</span>}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); startEdit(g); }} className="p-1 rounded hover:bg-muted" aria-label="Rename"><Pencil className="size-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); toggleActive(g); }} className="p-1 rounded hover:bg-muted" aria-label={g.isActive ? "Deactivate" : "Activate"}>
                        {g.isActive ? <PowerOff className="size-3.5" /> : <Power className="size-3.5 text-[color:var(--success)]" />}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteGroup(g); }} className="p-1 rounded text-destructive hover:bg-destructive/10" aria-label="Delete"><Trash2 className="size-3.5" /></button>
                    </>
                  )}
                </li>
              );
            })}
            {visibleGroups.length === 0 && (
              <li className="text-xs text-muted-foreground py-2">No groups yet.</li>
            )}
          </ul>
        </Card>

        <Card className="p-4">
          {!selectedId ? (
            <div className="text-sm text-muted-foreground py-10 text-center">Select or create a price group to set product prices.</div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Search products…" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <Button onClick={saveAll} disabled={saving || dirtyCount === 0}>
                  <Save className="size-4 mr-1" /> Save{dirtyCount ? ` (${dirtyCount})` : ""}
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Product</th>
                      <th className="text-left px-3 py-2 font-medium">SKU</th>
                      <th className="text-right px-3 py-2 font-medium">Default ৳</th>
                      <th className="text-right px-3 py-2 font-medium w-40">Group price ৳</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading ? (
                      <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">Loading…</td></tr>
                    ) : filtered.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2">{p.name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.sku}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(p.price).toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <Input
                            type="number" min={0} step="0.01"
                            className={`text-right ${dirty[p.id] ? "border-primary" : ""}`}
                            placeholder="—"
                            value={prices[p.id] ?? ""}
                            onChange={(e) => onChangePrice(p.id, e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                    {!loading && filtered.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">No products.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Leave a price empty to remove the override (product falls back to its default price for this group).</p>
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}