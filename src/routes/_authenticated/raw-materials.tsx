import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import {
  loadRawMaterials,
  adjustRawStock,
  addRawMaterial,
  updateRawMaterial,
  deleteRawMaterial,
  type RawMaterial,
} from "@/lib/raw-material-store";
import { ArrowDownToLine, ArrowUpFromLine, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loadUnits, type Unit } from "@/lib/unit-store";
import { z } from "zod";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/raw-materials")({
  head: () => ({ meta: [{ title: "Raw Materials · Crumb & Co." }] }),
  component: () => (
    <PermissionGate anyOf={["production.raw_materials.view", "production.access"]} title="Raw Materials">
      <RawMaterials />
    </PermissionGate>
  ),
});
});

function RawMaterials() {
  const { currentShowroomId } = useShowroomScope();
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const reload = () => {
    loadRawMaterials(currentShowroomId)
      .then(setMaterials)
      .catch((e) => toast.error(e?.message ?? "Failed to load raw materials"));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [currentShowroomId]);
  const [query, setQuery] = useState("");
  const [move, setMove] = useState<{ id: string; type: "in" | "out" } | null>(null);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [nm, setNm] = useState({ name: "", unit: "kg", threshold: "", cost: "" });
  const [errs, setErrs] = useState<{ name?: string; unit?: string; cost?: string; threshold?: string }>({});
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [editForm, setEditForm] = useState({ name: "", unit: "kg", threshold: "", cost: "" });
  const [editErrs, setEditErrs] = useState<typeof errs>({});
  const [editSaving, setEditSaving] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  useEffect(() => {
    loadUnits()
      .then((us) => {
        setUnits(us);
        setNm((n) => (us.some((u) => u.code === n.unit) ? n : { ...n, unit: us[0]?.code ?? "" }));
      })
      .catch(() => {});
  }, []);

  // Open the Add dialog when navigated with #new hash (sidebar link)
  useEffect(() => {
    const check = () => {
      if (typeof window === "undefined") return;
      if (window.location.hash === "#new") {
        setAddOpen(true);
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  const rawMaterialSchema = z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(80, "Name must be under 80 characters"),
    unit: z.string().trim().min(1, "Please select a unit"),
    cost: z.number({ error: "Cost must be a number" }).finite("Cost must be a valid number").min(0, "Cost cannot be negative").max(1_000_000, "Cost is too large"),
    threshold: z.number({ error: "Threshold must be a number" }).finite("Threshold must be a valid number").min(0, "Threshold cannot be negative").max(1_000_000, "Threshold is too large"),
  });

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = rawMaterialSchema.safeParse({
      name: nm.name,
      unit: nm.unit,
      cost: nm.cost === "" ? NaN : Number(nm.cost),
      threshold: nm.threshold === "" ? 0 : Number(nm.threshold),
    });
    if (!parsed.success) {
      const fieldErrs: typeof errs = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof typeof errs;
        if (key && !fieldErrs[key]) fieldErrs[key] = issue.message;
      }
      setErrs(fieldErrs);
      toast.error("Please fix the highlighted fields");
      return;
    }
    setErrs({});
    try {
      await addRawMaterial(parsed.data);
      toast.success(`Added "${parsed.data.name}"`);
      setAddOpen(false);
      setNm({ name: "", unit: units[0]?.code ?? "kg", threshold: "", cost: "" });
      reload();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add raw material");
    }
  };

  const clearErr = (k: keyof typeof errs) => setErrs((p) => ({ ...p, [k]: undefined }));
  const inputCls = (bad?: string) => (bad ? "border-destructive focus-visible:ring-destructive" : "");
  const clearEditErr = (k: keyof typeof errs) => setEditErrs((p) => ({ ...p, [k]: undefined }));

  const openEdit = (r: RawMaterial) => {
    setEditing(r);
    setEditErrs({});
    setEditForm({
      name: r.name,
      unit: r.unit,
      threshold: String(r.threshold),
      cost: String(r.cost),
    });
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const parsed = rawMaterialSchema.safeParse({
      name: editForm.name,
      unit: editForm.unit,
      cost: editForm.cost === "" ? NaN : Number(editForm.cost),
      threshold: editForm.threshold === "" ? 0 : Number(editForm.threshold),
    });
    if (!parsed.success) {
      const fieldErrs: typeof errs = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof typeof errs;
        if (key && !fieldErrs[key]) fieldErrs[key] = issue.message;
      }
      setEditErrs(fieldErrs);
      toast.error("Please fix the highlighted fields");
      return;
    }
    setEditSaving(true);
    try {
      await updateRawMaterial(editing.id, parsed.data);
      toast.success(`Updated "${parsed.data.name}"`);
      setEditing(null);
      reload();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update raw material");
    } finally {
      setEditSaving(false);
    }
  };

  const removeMaterial = async (r: RawMaterial) => {
    if (!confirm(`Delete raw material "${r.name}"? This will hide it from lists.`)) return;
    try {
      await deleteRawMaterial(r.id);
      toast.success(`Deleted "${r.name}"`);
      reload();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete");
    }
  };

  const rawMaterials = materials
    .filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()));

  const totalValue = rawMaterials.reduce((s, r) => s + r.stock * r.cost, 0);
  const lowCount = rawMaterials.filter((r) => r.stock < r.threshold).length;

  const openMove = (id: string, type: "in" | "out") => {
    setMove({ id, type });
    setQty("");
    setNote("");
  };
  const submitMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!move) return;
    const n = Number(qty);
    if (!n || n <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    const mat = materials.find((r) => r.id === move.id);
    const current = mat?.stock ?? 0;
    if (move.type === "out" && n > current) {
      toast.error("Not enough stock");
      return;
    }
    try {
      await adjustRawStock(
        move.id,
        currentShowroomId,
        move.type === "in" ? n : -n,
        note || undefined,
      );
      toast.success(
        `${move.type === "in" ? "Stock in" : "Stock out"} · ${n} ${mat?.unit} of ${mat?.name}`,
      );
      setMove(null);
      reload();
    } catch (err: any) {
      toast.error(err?.message ?? "Stock movement failed");
    }
  };

  const active = move ? materials.find((r) => r.id === move.id) : null;

  return (
    <AppShell
      title="Raw Materials"
      subtitle="Flour, sugar, butter, eggs, milk, yeast · suppliers & stock movement"
      actions={
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
        >
          <Plus className="size-4" /> Add Raw Material
        </button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <Card className="p-5"><div className="text-xs text-muted-foreground">Inventory value</div><div className="text-2xl font-semibold mt-1">৳{totalValue.toFixed(0)}</div></Card>
        <Card className="p-5"><div className="text-xs text-muted-foreground">Low stock items</div><div className="text-2xl font-semibold mt-1 text-destructive">{lowCount}</div></Card>
        <Card className="p-5"><div className="text-xs text-muted-foreground">Materials tracked</div><div className="text-2xl font-semibold mt-1">{materials.length}</div></Card>
      </div>
      <div className="mb-4 relative w-full sm:w-80">
        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search raw materials…"
          className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
        />
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-5 py-3">Material</th>
              <th className="text-right font-medium px-5 py-3">Stock</th>
              <th className="text-right font-medium px-5 py-3">Threshold</th>
              <th className="text-right font-medium px-5 py-3">Unit Cost</th>
              <th className="text-right font-medium px-5 py-3">Value</th>
              <th className="text-left font-medium px-5 py-3">Expiry (FEFO)</th>
              <th className="text-right font-medium px-5 py-3">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rawMaterials.map((r) => {
              const low = r.stock < r.threshold;
              return (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 font-medium">{r.name}</td>
                  <td className="px-5 py-3 text-right">{r.stock} {r.unit}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{r.threshold} {r.unit}</td>
                  <td className="px-5 py-3 text-right">৳{r.cost.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right">৳{(r.stock * r.cost).toFixed(0)}</td>
                  <td className="px-5 py-3 text-muted-foreground">—</td>
                  <td className="px-5 py-3 text-right">{low ? <Badge tone="danger">Low</Badge> : <Badge tone="success">OK</Badge>}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => openMove(r.id, "in")}
                        title="Stock In"
                        className="size-7 grid place-items-center rounded hover:bg-muted text-muted-foreground"
                      >
                        <ArrowDownToLine className="size-3.5" />
                      </button>
                      <button
                        onClick={() => openMove(r.id, "out")}
                        title="Stock Out"
                        className="size-7 grid place-items-center rounded hover:bg-muted text-muted-foreground"
                      >
                        <ArrowUpFromLine className="size-3.5" />
                      </button>
                      <button
                        onClick={() => openEdit(r)}
                        title="Edit"
                        className="size-7 grid place-items-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={() => removeMaterial(r)}
                        title="Delete"
                        className="size-7 grid place-items-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted-foreground mt-3">
        See <Link to="/suppliers" className="text-primary hover:underline">suppliers</Link> and <Link to="/purchasing" className="text-primary hover:underline">purchase orders</Link>.
      </p>

      <Dialog open={!!move} onOpenChange={(o) => !o && setMove(null)}>
        <DialogContent>
          <form onSubmit={submitMove}>
            <DialogHeader>
              <DialogTitle>
                {move?.type === "in" ? "Stock In" : "Stock Out"} · {active?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-3">
              <div className="text-xs text-muted-foreground">
                Current stock: <span className="font-medium text-foreground">
                  {active?.stock ?? 0} {active?.unit}
                </span>
              </div>
              <div>
                <Label htmlFor="mv-qty">Quantity ({active?.unit})</Label>
                <Input
                  id="mv-qty"
                  type="number"
                  min={0}
                  step="0.01"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="mv-note">Note (optional)</Label>
                <Input
                  id="mv-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={move?.type === "in" ? "Purchase / return" : "Wastage / transfer"}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMove(null)}>Cancel</Button>
              <Button type="submit">Confirm</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <form onSubmit={submitNew}>
            <DialogHeader>
              <DialogTitle>Add Raw Material</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3">
              <div className="sm:col-span-2">
                <Label htmlFor="rm-name">Name</Label>
                <Input
                  id="rm-name"
                  value={nm.name}
                  onChange={(e) => { setNm({ ...nm, name: e.target.value }); clearErr("name"); }}
                  placeholder="Flour, Sugar, Butter…"
                  maxLength={80}
                  aria-invalid={!!errs.name}
                  aria-describedby={errs.name ? "rm-name-err" : undefined}
                  className={inputCls(errs.name)}
                  autoFocus
                />
                {errs.name && <p id="rm-name-err" className="text-xs text-destructive mt-1">{errs.name}</p>}
              </div>
              <div>
                <Label htmlFor="rm-unit">Unit</Label>
                <select
                  id="rm-unit"
                  value={nm.unit}
                  onChange={(e) => { setNm({ ...nm, unit: e.target.value }); clearErr("unit"); }}
                  aria-invalid={!!errs.unit}
                  aria-describedby={errs.unit ? "rm-unit-err" : undefined}
                  className={`w-full h-9 px-2.5 rounded-md border bg-background text-sm outline-none focus:border-primary ${errs.unit ? "border-destructive" : "border-input"}`}
                >
                  <option value="" disabled>Select a unit…</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.code}>{u.code} — {u.name}</option>
                  ))}
                </select>
                {errs.unit ? (
                  <p id="rm-unit-err" className="text-xs text-destructive mt-1">{errs.unit}</p>
                ) : (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Manage units on the <Link to="/products/units" className="text-primary hover:underline">Units</Link> page.
                </p>
                )}
              </div>
              <div>
                <Label htmlFor="rm-cost">Unit cost (৳)</Label>
                <Input
                  id="rm-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={nm.cost}
                  onChange={(e) => { setNm({ ...nm, cost: e.target.value }); clearErr("cost"); }}
                  aria-invalid={!!errs.cost}
                  aria-describedby={errs.cost ? "rm-cost-err" : undefined}
                  className={inputCls(errs.cost)}
                />
                {errs.cost && <p id="rm-cost-err" className="text-xs text-destructive mt-1">{errs.cost}</p>}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="rm-threshold">Low-stock threshold</Label>
                <Input
                  id="rm-threshold"
                  type="number"
                  min={0}
                  value={nm.threshold}
                  onChange={(e) => { setNm({ ...nm, threshold: e.target.value }); clearErr("threshold"); }}
                  aria-invalid={!!errs.threshold}
                  aria-describedby={errs.threshold ? "rm-threshold-err" : undefined}
                  className={inputCls(errs.threshold)}
                />
                {errs.threshold && <p id="rm-threshold-err" className="text-xs text-destructive mt-1">{errs.threshold}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit">Add</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <form onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit Raw Material</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3">
              <div className="sm:col-span-2">
                <Label htmlFor="rm-e-name">Name</Label>
                <Input
                  id="rm-e-name"
                  value={editForm.name}
                  onChange={(e) => { setEditForm({ ...editForm, name: e.target.value }); clearEditErr("name"); }}
                  maxLength={80}
                  aria-invalid={!!editErrs.name}
                  className={inputCls(editErrs.name)}
                  autoFocus
                />
                {editErrs.name && <p className="text-xs text-destructive mt-1">{editErrs.name}</p>}
              </div>
              <div>
                <Label htmlFor="rm-e-unit">Unit</Label>
                <select
                  id="rm-e-unit"
                  value={editForm.unit}
                  onChange={(e) => { setEditForm({ ...editForm, unit: e.target.value }); clearEditErr("unit"); }}
                  className={`w-full h-9 px-2.5 rounded-md border bg-background text-sm outline-none focus:border-primary ${editErrs.unit ? "border-destructive" : "border-input"}`}
                >
                  <option value="" disabled>Select a unit…</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.code}>{u.code} — {u.name}</option>
                  ))}
                  {editForm.unit && !units.some((u) => u.code === editForm.unit) && (
                    <option value={editForm.unit}>{editForm.unit}</option>
                  )}
                </select>
                {editErrs.unit && <p className="text-xs text-destructive mt-1">{editErrs.unit}</p>}
                {editing && editForm.unit !== editing.unit && editing.stock !== 0 && (
                  <p className="text-[11px] text-destructive mt-1">
                    {editing.stock} {editing.unit} currently on hand. Zero the stock (Stock Out) before changing units to keep inventory consistent.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="rm-e-cost">Unit cost (৳)</Label>
                <Input
                  id="rm-e-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={editForm.cost}
                  onChange={(e) => { setEditForm({ ...editForm, cost: e.target.value }); clearEditErr("cost"); }}
                  aria-invalid={!!editErrs.cost}
                  className={inputCls(editErrs.cost)}
                />
                {editErrs.cost && <p className="text-xs text-destructive mt-1">{editErrs.cost}</p>}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="rm-e-threshold">Low-stock threshold</Label>
                <Input
                  id="rm-e-threshold"
                  type="number"
                  min={0}
                  value={editForm.threshold}
                  onChange={(e) => { setEditForm({ ...editForm, threshold: e.target.value }); clearEditErr("threshold"); }}
                  aria-invalid={!!editErrs.threshold}
                  className={inputCls(editErrs.threshold)}
                />
                {editErrs.threshold && <p className="text-xs text-destructive mt-1">{editErrs.threshold}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={editSaving}>{editSaving ? "Saving…" : "Save changes"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}