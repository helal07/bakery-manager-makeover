import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { addUnit, loadUnits, removeUnit, updateUnit, type Unit } from "@/lib/unit-store";
import { conversionLabel } from "@/lib/unit-convert";
import { pageTitle } from "@/lib/company-settings";

export const Route = createFileRoute("/_authenticated/products/units")({
  head: () => ({ meta: [{ title: pageTitle("Units") }] }),
  component: UnitsPage,
});

function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isMultiple, setIsMultiple] = useState(false);
  const [baseId, setBaseId] = useState("");
  const [factor, setFactor] = useState("");
  const [allowDecimal, setAllowDecimal] = useState(true);

  const reload = () => loadUnits().then(setUnits).catch((e) => toast.error(e.message));
  useEffect(() => { reload(); }, []);

  const openAdd = () => {
    setEditing(null); setCode(""); setName("");
    setIsMultiple(false); setBaseId(""); setFactor(""); setAllowDecimal(true);
    setOpen(true);
  };
  const openEdit = (u: Unit) => {
    setEditing(u); setCode(u.code); setName(u.name);
    setIsMultiple(!!u.base_unit_id);
    setBaseId(u.base_unit_id ?? "");
    setFactor(u.conversion_factor ? String(u.conversion_factor) : "");
    setAllowDecimal(u.allow_decimal ?? true);
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = {
      code,
      name,
      base_unit_id: isMultiple ? baseId || null : null,
      conversion_factor: isMultiple ? Number(factor) : null,
      allow_decimal: allowDecimal,
    };
    if (isMultiple && !baseId) { toast.error("Select the base unit"); return; }
    try {
      if (editing) { await updateUnit(editing.id, input); toast.success("Unit updated"); }
      else { await addUnit(input); toast.success(`Added "${code.trim()}"`); }
      setOpen(false);
      reload();
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  };

  const del = async (u: Unit) => {
    if (!confirm(`Remove unit "${u.code}"?`)) return;
    try { await removeUnit(u.id); toast.success("Removed"); reload(); }
    catch (err: any) { toast.error(err?.message ?? "Failed"); }
  };

  return (
    <AppShell
      title="Units"
      subtitle="Measurement units used by raw materials (e.g. kg, L, pc). Define sub-units like 1 kg = 1000 g so recipe totals convert correctly."
      actions={
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
        >
          <Plus className="size-4" /> Add Unit
        </button>
      }
    >
      <Card className="overflow-hidden">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-5 py-3">Code</th>
              <th className="text-left font-medium px-5 py-3">Name</th>
              <th className="text-left font-medium px-5 py-3">Conversion</th>
              <th className="text-left font-medium px-5 py-3">Decimal</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {units.map((u) => (
              <tr key={u.id} className="hover:bg-muted/30">
                <td className="px-5 py-3 font-mono">{u.code}</td>
                <td className="px-5 py-3">{u.name}</td>
                <td className="px-5 py-3 text-muted-foreground">
                  {conversionLabel(u, units) ?? <span className="text-xs">Base unit</span>}
                </td>
                <td className="px-5 py-3 text-muted-foreground text-xs">
                  {u.allow_decimal === false ? "No" : "Yes"}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button onClick={() => openEdit(u)} className="size-7 grid place-items-center rounded hover:bg-muted text-muted-foreground"><Pencil className="size-3.5" /></button>
                    <button onClick={() => del(u)} className="size-7 grid place-items-center rounded hover:bg-muted text-destructive"><Trash2 className="size-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {units.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground text-sm">No units yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit}>
            <DialogHeader><DialogTitle>{editing ? "Edit Unit" : "Add Unit"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3">
              <div>
                <Label htmlFor="u-code">Code (short name)</Label>
                <Input id="u-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="kg, L, pc" autoFocus />
              </div>
              <div>
                <Label htmlFor="u-name">Name</Label>
                <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kilogram, Litre, Piece" />
              </div>

              <label className="sm:col-span-2 flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowDecimal}
                  onChange={(e) => setAllowDecimal(e.target.checked)}
                  className="size-4"
                />
                Allow decimal quantities
              </label>

              <label className="sm:col-span-2 flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={isMultiple}
                  onChange={(e) => setIsMultiple(e.target.checked)}
                  className="size-4"
                />
                Add as multiple of another unit
              </label>

              {isMultiple && (
                <>
                  <div>
                    <Label htmlFor="u-base">Base unit</Label>
                    <select
                      id="u-base"
                      value={baseId}
                      onChange={(e) => setBaseId(e.target.value)}
                      className="w-full h-10 px-2 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="">Select…</option>
                      {units.filter((u) => u.id !== editing?.id).map((u) => (
                        <option key={u.id} value={u.id}>{u.code} — {u.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="u-factor">1 {code || "unit"} equals</Label>
                    <Input
                      id="u-factor"
                      inputMode="decimal"
                      value={factor}
                      onChange={(e) => setFactor(e.target.value)}
                      placeholder="1000"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      e.g. 1 kg = 1000 g · 1 dozen = 12 pc
                    </p>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">{editing ? "Save" : "Add"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
