import { createFileRoute } from "@tanstack/react-router";
import { PermissionGate } from "@/components/permission-gate";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell, Card } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/catalog")({
  head: () => ({ meta: [{ title: "Products · Muzahid Food" }] }),
  component: () => (
    <PermissionGate anyOf={["products.view"]} title="Catalog">
      <CatalogPage />
    </PermissionGate>
  ),
});


const sb = supabase as any;

type Product = {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  unit: string;
  cost: number;
  price: number;
  is_active: boolean;
};

const categories = ["Cake", "Bread", "Biscuit", "Pastry", "Snack", "Beverage", "Other"];
const units = ["pc", "kg", "g", "L", "ml", "pack", "box"];

type FormState = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  cost: string;
  price: string;
};
const empty: FormState = { sku: "", name: "", category: "Cake", unit: "pc", cost: "", price: "" };

function CatalogPage() {
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb
      .from("products")
      .select("id,sku,name,category,unit,cost,price,is_active")
      .order("name");
    if (error) toast.error(error.message);
    setRows((data ?? []) as Product[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const openNew = () => { setEditId(null); setForm(empty); setOpen(true); };
  const openEdit = (p: Product) => {
    setEditId(p.id);
    setForm({
      sku: p.sku ?? "",
      name: p.name,
      category: p.category ?? "Cake",
      unit: p.unit,
      cost: String(p.cost ?? 0),
      price: String(p.price ?? 0),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    const payload = {
      sku: form.sku.trim() || null,
      name: form.name.trim(),
      category: form.category || null,
      unit: form.unit || "pc",
      cost: Number(form.cost) || 0,
      price: Number(form.price) || 0,
    };
    if (editId) {
      const { error } = await sb.from("products").update(payload).eq("id", editId);
      if (error) { toast.error(error.message); return; }
      toast.success("Product updated");
    } else {
      const { error } = await sb.from("products").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Product created");
    }
    setOpen(false); load();
  };

  const remove = async (p: Product) => {
    if (!confirm(`Delete ${p.name}?`)) return;
    const { error } = await sb.from("products").update({ is_active: false }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deactivated"); load();
  };

  return (
    <AppShell title="Products" subtitle="Shared factory products used by transfers and stock">
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
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" /> New Product
        </Button>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-2">Name</th>
                  <th className="py-2 px-2">SKU</th>
                  <th className="py-2 px-2">Category</th>
                  <th className="py-2 px-2">Unit</th>
                  <th className="py-2 px-2 text-right">Cost</th>
                  <th className="py-2 px-2 text-right">Price</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className={`border-b hover:bg-muted/40 ${p.is_active ? "" : "opacity-50"}`}>
                    <td className="py-2 px-2 font-medium">{p.name}</td>
                    <td className="py-2 px-2 font-mono text-xs">{p.sku ?? "—"}</td>
                    <td className="py-2 px-2">{p.category ?? "—"}</td>
                    <td className="py-2 px-2">{p.unit}</td>
                    <td className="py-2 px-2 text-right">৳{p.cost}</td>
                    <td className="py-2 px-2 text-right">৳{p.price}</td>
                    <td className="py-2 px-2 text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(p)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Product" : "New Product"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cost (৳)</Label>
              <Input type="number" min="0" step="any" value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            </div>
            <div>
              <Label>Price (৳)</Label>
              <Input type="number" min="0" step="any" value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editId ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}