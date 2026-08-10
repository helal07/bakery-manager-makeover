import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, UserPlus, PackagePlus, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { savePurchase, updatePurchase, loadPurchase, type PurchaseItem } from "@/lib/purchase-store";
import { loadSuppliers, addSupplier, type Supplier } from "@/lib/supplier-store";
import { loadRawMaterials, addRawMaterial, type RawMaterial } from "@/lib/raw-material-store";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { pageTitle } from "@/lib/company-settings";

export const Route = createFileRoute("/_authenticated/purchasing/new")({
  head: () => ({ meta: [{ title: pageTitle("Add Purchase") }] }),
  component: () => <PurchaseFormPage />,
});

/** Digits + single decimal point only — keeps partial input like "" or "1." typable. */
function sanitizeNum(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, "");
  const first = v.indexOf(".");
  if (first !== -1) v = v.slice(0, first + 1) + v.slice(first + 1).replace(/\./g, "");
  return v;
}
const num = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

function NumField({
  value,
  onChange,
  className = "",
  id,
  placeholder,
  align = "right",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  id?: string;
  placeholder?: string;
  align?: "right" | "left";
}) {
  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      value={value}
      onWheel={(e) => (e.target as HTMLInputElement).blur()}
      onChange={(e) => onChange(sanitizeNum(e.target.value))}
      className={`${align === "right" ? "text-right" : ""} tabular-nums ${className}`}
    />
  );
}

type Row = { materialId: string; name: string; unit: string; qty: string; price: string };

export function PurchaseFormPage({ editId }: { editId?: string }) {
  const nav = useNavigate();
  const { currentShowroomId } = useShowroomScope();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const today = new Date().toISOString().slice(0, 10);
  const [supplierId, setSupplierId] = useState("");
  const [ref, setRef] = useState(() => `PO-${Date.now().toString().slice(-6)}`);
  const [saving, setSaving] = useState(false);
  const [loadingPurchase, setLoadingPurchase] = useState(!!editId);

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
  const [items, setItems] = useState<Row[]>([]);
  const [payment, setPayment] = useState<"Paid" | "Due" | "Partial">("Paid");
  const [paid, setPaid] = useState("");

  // Load the existing purchase when editing.
  useEffect(() => {
    if (!editId) return;
    let alive = true;
    setLoadingPurchase(true);
    loadPurchase(editId)
      .then((p) => {
        if (!alive) return;
        if (!p) { toast.error("Purchase not found"); nav({ to: "/purchasing/list" }); return; }
        setSupplierId(p.supplier_id ?? "");
        setRef(p.id);
        setDate(p.date);
        setItems(
          (p.items ?? []).map((it) => ({
            materialId: it.materialId,
            name: it.name,
            unit: it.unit,
            qty: String(it.qty),
            price: String(it.price),
          })),
        );
        const pay = p.payment ?? (p.paid && p.paid >= p.total ? "Paid" : p.paid ? "Partial" : "Due");
        setPayment(pay);
        setPaid(String(p.paid ?? ""));
      })
      .catch((e) => toast.error(e?.message ?? "Failed to load purchase"))
      .finally(() => { if (alive) setLoadingPurchase(false); });
    return () => { alive = false; };
  }, [editId, nav]);

  // Supplier dialog
  const [supOpen, setSupOpen] = useState(false);
  const [supForm, setSupForm] = useState({ name: "", email: "", phone: "", address: "" });

  // Raw material dialog
  const [matOpen, setMatOpen] = useState(false);
  const [matTargetIdx, setMatTargetIdx] = useState<number | null>(null);
  const [matForm, setMatForm] = useState({ name: "", unit: "kg", cost: "" });

  const lineTotal = (it: Row) => num(it.qty) * num(it.price);
  const total = useMemo(() => items.reduce((s, it) => s + lineTotal(it), 0), [items]);
  const totalQty = useMemo(() => items.reduce((s, it) => s + num(it.qty), 0), [items]);

  const paidAmount =
    payment === "Paid" ? total : payment === "Due" ? 0 : Math.min(num(paid), total);
  const dueAmount = Math.max(0, total - paidAmount);

  const updateItem = (idx: number, patch: Partial<Row>) =>
    setItems((l) =>
      l.map((it, i) => {
        if (i !== idx) return it;
        const merged = { ...it, ...patch };
        if (patch.materialId) {
          const raw = rawMaterials.find((r) => r.id === patch.materialId);
          if (raw) {
            merged.name = raw.name;
            merged.unit = raw.unit;
            if (patch.price === undefined) merged.price = String(raw.cost ?? "");
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
    if (currentShowroomId)
      return toast.error("Factory Only Can Purchase Raw Materials. Change your showroom to Factory.");
    if (items.some((it) => !it.materialId)) return toast.error("Select a material for every row");
    if (items.some((it) => num(it.qty) <= 0)) return toast.error("Quantity must be greater than 0");
    if (payment === "Partial" && (paidAmount <= 0 || paidAmount >= total))
      return toast.error("Partial paid must be greater than 0 and less than total");
    const payloadItems: PurchaseItem[] = items.map((it) => ({
      materialId: it.materialId,
      name: it.name,
      unit: it.unit,
      qty: num(it.qty),
      price: num(it.price),
    }));
    setSaving(true);
    try {
      if (editId) {
        await updatePurchase(editId, {
          supplier_id: supplierId,
          date,
          items: payloadItems,
          total,
          paid: paidAmount,
          payment,
          code: ref.trim() || undefined,
        });
        toast.success(`Purchase ${ref.trim()} updated`);
      } else {
        const p = await savePurchase({
          supplier_id: supplierId,
          showroom_id: null,
          date,
          items: payloadItems,
          total,
          paid: paidAmount,
          payment,
          code: ref.trim() || undefined,
        });
        toast.success(`Purchase ${p.id} added`);
      }
      nav({ to: "/purchasing/list" });
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.includes("raw_stock_ledger_factory_only") || msg.includes("factory_only")) {
        toast.error("Factory Only Can Purchase Raw Materials. Change your showroom to Factory.");
      } else {
        toast.error(msg || "Failed to save purchase");
      }
    } finally {
      setSaving(false);
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
        cost: num(matForm.cost),
        threshold: 0,
      });
      setRawMaterials((l) => [m, ...l]);
      if (matTargetIdx !== null) {
        updateItem(matTargetIdx, { materialId: m.id });
      } else {
        setItems((l) => [
          ...l,
          { materialId: m.id, name: m.name, unit: m.unit, qty: "1", price: String(m.cost ?? "") },
        ]);
      }
      setMatOpen(false);
      toast.success("Raw material added");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add material");
    }
  };

  return (
    <AppShell
      title={editId ? "Edit Purchase" : "Add Purchase"}
      subtitle={editId ? "Update this supplier purchase order" : "Record a new supplier purchase order"}
    >
      {currentShowroomId ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>Only factory can purchase raw materials.</strong> Switch your location to
            Factory from the top bar to record this purchase.
          </span>
        </div>
      ) : null}
      <form onSubmit={submit} className="pb-40 sm:pb-28">
        {/* ---- Header details ---- */}
        <Card className="p-4 sm:p-5 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pu-sup">Supplier *</Label>
              <div className="flex gap-2">
                <select
                  id="pu-sup"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="flex-1 min-w-0 h-10 px-2.5 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
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
                  className="size-10 grid place-items-center rounded-md border border-border bg-background hover:bg-accent text-primary shrink-0"
                >
                  <UserPlus className="size-4" />
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pu-ref">Reference no.</Label>
              <Input id="pu-ref" value={ref} onChange={(e) => setRef(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pu-date">Purchase date *</Label>
              <Input id="pu-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <div className="h-10 flex items-center px-3 rounded-md border border-dashed border-border bg-muted/40 text-sm text-muted-foreground">
                Factory (raw materials only)
              </div>
            </div>
          </div>
        </Card>

        {/* ---- Items ---- */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <div className="text-sm font-semibold">Purchase items</div>
            <button
              type="button"
              onClick={() => openAddMaterial(null)}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-border hover:bg-accent text-primary"
            >
              <PackagePlus className="size-3.5" /> New material
            </button>
          </div>
          <div className="mb-4">
            <MultiMaterialPicker
              materials={rawMaterials}
              selectedIds={items.map((i) => i.materialId)}
              onAdd={(ids) => {
                const existing = new Set(items.map((i) => i.materialId));
                const toAdd = ids
                  .filter((id) => !existing.has(id))
                  .map((id) => rawMaterials.find((r) => r.id === id))
                  .filter((r): r is RawMaterial => !!r)
                  .map((r) => ({
                    materialId: r.id,
                    name: r.name,
                    unit: r.unit,
                    qty: "1",
                    price: String(r.cost ?? ""),
                  }));
                if (toAdd.length === 0) return toast.info("No new materials selected");
                setItems((l) => [...l, ...toAdd]);
              }}
            />
          </div>

          {items.length === 0 ? (
            <div className="text-xs text-muted-foreground py-10 text-center border border-dashed rounded-md">
              No items yet. Search a raw material above to add it.
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-hidden border border-border rounded-md">
                <div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]">
                  <thead className="text-xs text-muted-foreground bg-muted/40">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">#</th>
                      <th className="text-left font-medium px-3 py-2">Material</th>
                      <th className="text-right font-medium px-3 py-2 w-32">Quantity</th>
                      <th className="text-left font-medium px-3 py-2 w-20">Unit</th>
                      <th className="text-right font-medium px-3 py-2 w-36">Unit cost</th>
                      <th className="text-right font-medium px-3 py-2 w-32">Subtotal</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-muted/20">
                        <td className="px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>
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
                          <NumField value={it.qty} onChange={(v) => updateItem(idx, { qty: v })} className="h-8" />
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{it.unit}</td>
                        <td className="px-3 py-2">
                          <NumField value={it.price} onChange={(v) => updateItem(idx, { price: v })} className="h-8" />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          ৳{lineTotal(it).toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            title="Remove row"
                            className="size-7 grid place-items-center rounded text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30 text-sm">
                      <td colSpan={2} className="px-3 py-2 text-right font-medium">Total</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{totalQty}</td>
                      <td colSpan={2}></td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">৳{total.toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table></div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2.5">
                {items.map((it, idx) => (
                  <div key={idx} className="rounded-lg border border-border bg-card p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold tabular-nums">
                          {idx + 1}
                        </span>
                        <MaterialCombo
                          value={it.materialId}
                          materials={rawMaterials}
                          onChange={(id) => updateItem(idx, { materialId: id })}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        aria-label="Remove item"
                        className="size-10 shrink-0 grid place-items-center rounded-md border border-border text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Qty{it.unit ? ` (${it.unit})` : ""}
                        </Label>
                        <NumField value={it.qty} onChange={(v) => updateItem(idx, { qty: v })} className="h-11 text-base" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Unit cost</Label>
                        <NumField value={it.price} onChange={(v) => updateItem(idx, { price: v })} className="h-11 text-base" />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-dashed border-border pt-2 text-sm">
                      <span className="text-xs text-muted-foreground">Subtotal</span>
                      <span className="font-semibold tabular-nums">৳{lineTotal(it).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Total qty <strong className="text-foreground tabular-nums">{totalQty}</strong></span>
                  <span className="font-semibold tabular-nums">৳{total.toFixed(2)}</span>
                </div>
              </div>

            </>
          )}

          {/* ---- Payment ---- */}
          <div className="mt-6 pt-4 border-t border-border grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <Label>Bill payment</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["Paid", "Due", "Partial"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setPayment(opt)}
                    className={`h-11 rounded-md border text-sm font-medium ${
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
                <div className="mt-3 sm:max-w-xs space-y-1">
                  <Label htmlFor="pu-paid">Paid amount (৳)</Label>
                  <NumField id="pu-paid" value={paid} onChange={setPaid} className="h-11 text-base" placeholder="0.00" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 text-sm self-end">
              <Stat label="Total" value={`৳${total.toFixed(2)}`} />
              <Stat label="Paid" value={`৳${paidAmount.toFixed(2)}`} tone="success" />
              <Stat label="Due" value={`৳${dueAmount.toFixed(2)}`} tone={dueAmount > 0 ? "danger" : undefined} />
            </div>
          </div>
        </Card>

        {/* ---- Sticky action bar ---- */}
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur px-3 py-2.5 sm:px-4 sm:py-3 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="flex items-center justify-between gap-3 text-xs sm:text-sm text-muted-foreground">
              <span>Items: <strong className="text-foreground">{items.length}</strong></span>
              <span className="hidden sm:inline">Qty: <strong className="text-foreground tabular-nums">{totalQty}</strong></span>
              <span>Net: <strong className="text-foreground tabular-nums">৳{total.toFixed(2)}</strong></span>
              <span>Due: <strong className="text-foreground tabular-nums">৳{dueAmount.toFixed(2)}</strong></span>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 sm:flex sm:shrink-0">
              <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={() => nav({ to: "/purchasing/list" })}>
                Cancel
              </Button>
              <Button type="submit" disabled={!!currentShowroomId || saving || loadingPurchase} className="h-11 sm:h-9 font-semibold">
                {currentShowroomId
                  ? "Factory only"
                  : loadingPurchase
                    ? "Loading…"
                    : saving
                      ? "Saving…"
                      : editId
                        ? "Update Purchase"
                        : "Save Purchase"}
              </Button>
            </div>
          </div>
        </div>

      </form>


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
                <NumField id="nm-cost" value={matForm.cost} onChange={(v) => setMatForm({ ...matForm, cost: v })} placeholder="0.00" />
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
          className="h-11 pl-8 text-base sm:h-9 sm:text-sm"
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
        className="w-full h-10 md:h-8 px-2 rounded-md border border-input bg-background text-sm text-left outline-none focus:border-primary truncate"
      >
        {selected ? selected.name : <span className="text-muted-foreground">Select material…</span>}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-[min(18rem,calc(100vw-3rem))] rounded-md border border-border bg-popover shadow-md">

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