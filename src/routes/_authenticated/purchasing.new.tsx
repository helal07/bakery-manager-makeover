import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
import { pageTitle } from "@/lib/company-settings";
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, UserPlus, PackagePlus, Search } from "lucide-react";
import { toast } from "sonner";
import { savePurchase, type PurchaseItem } from "@/lib/purchase-store";
import { loadSuppliers, addSupplier, type Supplier } from "@/lib/supplier-store";
import { loadRawMaterials, addRawMaterial, type RawMaterial } from "@/lib/raw-material-store";
import { useShowroomScope } from "@/hooks/use-showroom-scope";

export const Route = createFileRoute("/_authenticated/purchasing/new")({
  head: () => ({ meta: [{ title: pageTitle("Add Purchase") }] }),
  component: AddPurchase,
});

function AddPurchase() {
  const nav = useNavigate();
  const { currentShowroomId } = useShowroomScope();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const today = new Date().toISOString().slice(0, 10);
  const [supplierId, setSupplierId] = useState("");

  useEffect(() => {
    loadSuppliers()
      .then((list) => {
        setSuppliers(list);
        setSupplierId((cur) => cur || list[0]?.id || "");
      })
      .catch((e) => toast.error(e.message ?? "Failed to load suppliers"));
  }, []);
  useEffect(() => {
    loadRawMaterials(currentShowroomId)
      .then(setRawMaterials)
      .catch((e) => toast.error(e?.message ?? "Failed to load raw materials"));
  }, [currentShowroomId]);
  const [date, setDate] = useState(today);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [payment, setPayment] = useState<"Paid" | "Due" | "Partial">("Paid");
  const [paid, setPaid] = useState("");

  // Supplier dialog
  const [supOpen, setSupOpen] = useState(false);
  const [supForm, setSupForm] = useState({ name: "", email: "", phone: "", address: "" });

  // Raw material dialog
  const [matOpen, setMatOpen] = useState(false);
  const [matTargetIdx, setMatTargetIdx] = useState<number | null>(null);
  const [matForm, setMatForm] = useState({ name: "", unit: "kg", cost: "" });

  const total = useMemo(() => items.reduce((s, it) => s + it.qty * it.price, 0), [items]);

  const paidAmount =
    payment === "Paid" ? total : payment === "Due" ? 0 : Math.min(Number(paid) || 0, total);
  const dueAmount = Math.max(0, total - paidAmount);

  const updateItem = (idx: number, patch: Partial<PurchaseItem>) =>
    setItems((l) =>
      l.map((it, i) => {
        if (i !== idx) return it;
        const merged = { ...it, ...patch };
        if (patch.materialId) {
          const raw = rawMaterials.find((r) => r.id === patch.materialId);
          if (raw) {
            merged.name = raw.name;
            merged.unit = raw.unit;
            if (patch.price === undefined) merged.price = raw.cost;
          }
        }
        return merged;
      }),
    );
  const removeItem = (idx: number) => setItems((l) => l.filter((_, i) => i !== idx));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) return toast.error("Supplier is required");
    if (items.length === 0) return toast.error("Add at least one item");
    if (payment === "Partial" && (paidAmount <= 0 || paidAmount >= total))
      return toast.error("Partial paid must be greater than 0 and less than total");
    try {
      const p = await savePurchase({
        supplier_id: supplierId,
        showroom_id: currentShowroomId,
        date,
        items,
        total,
        paid: paidAmount,
        payment,
      });
      toast.success(`Purchase ${p.id} added`);
      nav({ to: "/purchasing/list" });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save purchase");
    }
  };

  const submitSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supForm.name.trim()) return toast.error("Supplier name is required");
    let s: Supplier;
    try {
      s = await addSupplier({
        name: supForm.name.trim(),
        email: supForm.email.trim(),
        phone: supForm.phone.trim(),
        address: supForm.address.trim(),
      });
    } catch (err: any) {
      return toast.error(err?.message ?? "Failed to add supplier");
    }
    setSuppliers((l) => [s, ...l]);
    setSupplierId(s.id);
    setSupForm({ name: "", email: "", phone: "", address: "" });
    setSupOpen(false);
    toast.success("Supplier added");
  };

  const openAddMaterial = (idx: number | null) => {
    setMatTargetIdx(idx);
    setMatForm({ name: "", unit: "kg", cost: "" });
    setMatOpen(true);
  };

  const submitMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matForm.name.trim()) return toast.error("Material name is required");
    try {
      const m = await addRawMaterial({
        name: matForm.name.trim(),
        unit: matForm.unit.trim() || "unit",
        cost: Number(matForm.cost) || 0,
        threshold: 0,
      });
      setRawMaterials((l) => [m, ...l]);
      if (matTargetIdx !== null) {
        updateItem(matTargetIdx, { materialId: m.id });
      } else {
        setItems((l) => [
          ...l,
          { materialId: m.id, name: m.name, unit: m.unit, qty: 1, price: m.cost },
        ]);
      }
      setMatOpen(false);
      toast.success("Raw material added");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add material");
    }
  };

  return (
    <AppShell title="Add Purchase" subtitle="Record a new supplier purchase order">
      <Card className="p-6 max-w-4xl">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="pu-sup">Supplier</Label>
              <div className="flex gap-2">
                <select
                  id="pu-sup"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="flex-1 h-9 px-2.5 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                >
                  {suppliers.length === 0 && <option value="">— No suppliers —</option>}
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setSupOpen(true)}
                  title="Add supplier"
                  className="size-9 grid place-items-center rounded-md border border-border bg-background hover:bg-accent text-primary shrink-0"
                >
                  <UserPlus className="size-4" />
                </button>
              </div>
            </div>
            <div>
              <Label htmlFor="pu-date">Date</Label>
              <Input id="pu-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <Label>Raw material items</Label>
              <button
                type="button"
                onClick={() => openAddMaterial(null)}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-border hover:bg-accent text-primary"
              >
                <PackagePlus className="size-3.5" /> New material
              </button>
            </div>
            <div className="mb-3">
              <MultiMaterialPicker
                materials={rawMaterials}
                selectedIds={items.map((i) => i.materialId)}
                onAdd={(ids) => {
                  const existing = new Set(items.map((i) => i.materialId));
                  const toAdd = ids
                    .filter((id) => !existing.has(id))
                    .map((id) => rawMaterials.find((r) => r.id === id))
                    .filter((r): r is RawMaterial => !!r)
                    .map((r) => ({ materialId: r.id, name: r.name, unit: r.unit, qty: 1, price: r.cost }));
                  if (toAdd.length === 0) return toast.info("No new materials selected");
                  setItems((l) => [...l, ...toAdd]);
                }}
              />
            </div>
            {items.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center border border-dashed rounded-md">
                No items yet. Click “Add item” to add raw materials.
              </div>
            ) : (
              <div className="overflow-hidden border border-border rounded-md">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground bg-muted/40">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Material</th>
                      <th className="text-right font-medium px-3 py-2 w-24">Qty</th>
                      <th className="text-left font-medium px-3 py-2 w-16">Unit</th>
                      <th className="text-right font-medium px-3 py-2 w-28">Unit price</th>
                      <th className="text-right font-medium px-3 py-2 w-28">Line total</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2">
                          <div className="flex gap-1.5">
                            <MaterialCombo
                              value={it.materialId}
                              materials={rawMaterials}
                              onChange={(id) => updateItem(idx, { materialId: id })}
                            />
                            <button
                              type="button"
                              onClick={() => openAddMaterial(idx)}
                              title="Add new raw material"
                              className="size-8 grid place-items-center rounded-md border border-border bg-background hover:bg-accent text-primary shrink-0"
                            >
                              <Plus className="size-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={it.qty}
                            onChange={(e) => updateItem(idx, { qty: Number(e.target.value) || 0 })}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{it.unit}</td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={it.price}
                            onChange={(e) => updateItem(idx, { price: Number(e.target.value) || 0 })}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          ৳{(it.qty * it.price).toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="size-7 grid place-items-center rounded text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30">
                      <td colSpan={4} className="px-3 py-2 text-right font-medium">Total</td>
                      <td className="px-3 py-2 text-right font-semibold">৳{total.toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-border">
            <Label>Bill payment</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {(["Paid", "Due", "Partial"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setPayment(opt)}
                  className={`px-3 py-1.5 rounded-md border text-sm ${
                    payment === opt
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            {payment === "Partial" && (
              <div className="mt-3 max-w-xs">
                <Label htmlFor="pu-paid">Paid amount (৳)</Label>
                <Input
                  id="pu-paid"
                  type="number"
                  min={0}
                  step="0.01"
                  max={total}
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                />
              </div>
            )}
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm max-w-md">
              <Stat label="Total" value={`৳${total.toFixed(2)}`} />
              <Stat label="Paid" value={`৳${paidAmount.toFixed(2)}`} tone="success" />
              <Stat label="Due" value={`৳${dueAmount.toFixed(2)}`} tone={dueAmount > 0 ? "danger" : undefined} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => nav({ to: "/purchasing/list" })}>
              Cancel
            </Button>
            <Button type="submit">Save Purchase</Button>
          </div>
        </form>
      </Card>

      <Dialog open={supOpen} onOpenChange={setSupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Supplier</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitSupplier} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ns-name">Supplier</Label>
              <Input id="ns-name" value={supForm.name} onChange={(e) => setSupForm({ ...supForm, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-email">Email</Label>
              <Input id="ns-email" value={supForm.email} onChange={(e) => setSupForm({ ...supForm, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-phone">Phone</Label>
              <Input id="ns-phone" value={supForm.phone} onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-addr">Address</Label>
              <Input id="ns-addr" value={supForm.address} onChange={(e) => setSupForm({ ...supForm, address: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSupOpen(false)}>Cancel</Button>
              <Button type="submit">Add Supplier</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={matOpen} onOpenChange={setMatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Raw Material</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitMaterial} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nm-name">Name</Label>
              <Input id="nm-name" value={matForm.name} onChange={(e) => setMatForm({ ...matForm, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nm-unit">Unit</Label>
                <Input id="nm-unit" value={matForm.unit} onChange={(e) => setMatForm({ ...matForm, unit: e.target.value })} placeholder="kg, L, pcs" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nm-cost">Unit cost (৳)</Label>
                <Input id="nm-cost" type="number" min={0} step="0.01" value={matForm.cost} onChange={(e) => setMatForm({ ...matForm, cost: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMatOpen(false)}>Cancel</Button>
              <Button type="submit">Add Material</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  const color =
    tone === "success" ? "text-[color:var(--success)]" : tone === "danger" ? "text-destructive" : "";
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function MultiMaterialPicker({
  materials,
  selectedIds,
  onAdd,
}: {
  materials: RawMaterial[];
  selectedIds: string[];
  onAdd: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const wrapRef = useRef<HTMLDivElement>(null);
  const alreadyAdded = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return materials.slice(0, 100);
    return materials
      .filter((m) => m.name.toLowerCase().includes(q) || m.unit.toLowerCase().includes(q))
      .slice(0, 100);
  }, [materials, query]);

  const toggle = (id: string) => {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const commit = () => {
    if (picked.size === 0) return;
    onAdd(Array.from(picked));
    setPicked(new Set());
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          placeholder="Search raw materials to add…"
          className="h-9 pl-8 text-sm"
        />
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <ul className="max-h-64 overflow-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">No matches</li>
            ) : (
              filtered.map((m) => {
                const inList = alreadyAdded.has(m.id);
                const checked = picked.has(m.id);
                return (
                  <li key={m.id}>
                    <label
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2 cursor-pointer ${
                        inList ? "opacity-60" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked || inList}
                        disabled={inList}
                        onChange={() => toggle(m.id)}
                      />
                      <span className="truncate flex-1">{m.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {inList ? "added" : m.unit}
                      </span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t border-border p-2">
            <span className="text-xs text-muted-foreground">{picked.size} selected</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => { setPicked(new Set()); setOpen(false); }}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={commit} disabled={picked.size === 0}>
                Add selected
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MaterialCombo({
  value,
  materials,
  onChange,
}: {
  value: string;
  materials: RawMaterial[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = materials.find((m) => m.id === value);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return materials.slice(0, 50);
    return materials
      .filter((m) => m.name.toLowerCase().includes(q) || m.unit.toLowerCase().includes(q))
      .slice(0, 50);
  }, [materials, query]);

  return (
    <div ref={wrapRef} className="relative flex-1">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery(""); }}
        className="w-full h-8 px-2 rounded-md border border-input bg-background text-sm text-left outline-none focus:border-primary truncate"
      >
        {selected ? selected.name : <span className="text-muted-foreground">Select material…</span>}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-72 rounded-md border border-border bg-popover shadow-md">
          <div className="p-1.5 border-b border-border relative">
            <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search material…"
              className="h-8 pl-7 text-sm"
            />
          </div>
          <ul className="max-h-56 overflow-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">No matches</li>
            ) : (
              filtered.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => { onChange(m.id); setOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex justify-between gap-2 ${
                      m.id === value ? "bg-accent/60" : ""
                    }`}
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{m.unit}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}