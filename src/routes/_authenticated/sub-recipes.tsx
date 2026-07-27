import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { PermissionGate } from "@/components/permission-gate";
import { IngredientPicker } from "@/components/ingredient-picker";
import { pageTitle } from "@/lib/company-settings";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChefHat, Plus, Pencil, Trash2, X, Save, Copy } from "lucide-react";
import {
  loadSubRecipes,
  saveSubRecipe,
  deleteSubRecipe,
  type SubRecipe,
  type SubRecipeItem,
} from "@/lib/sub-recipe-store";
import { loadRawMaterials, type RawMaterial } from "@/lib/raw-material-store";
import { loadUnits, type Unit } from "@/lib/unit-store";

export const Route = createFileRoute("/_authenticated/sub-recipes")({
  head: () => ({ meta: [{ title: pageTitle("Sub-Recipes") }] }),
  component: () => (
    <PermissionGate anyOf={["production.recipes.view", "production.access"]} title="Sub-Recipes">
      <SubRecipesPage />
    </PermissionGate>
  ),
});

type EditorState = {
  id?: string;
  name: string;
  yield_qty: string;
  yield_unit: string;
  items: { materialId: string; qty: string }[];
};

const empty: EditorState = {
  name: "",
  yield_qty: "100",
  yield_unit: "kg",
  items: [{ materialId: "", qty: "" }],
};

function SubRecipesPage() {
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EditorState>(empty);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    try {
      const [srs, rms, us] = await Promise.all([
        loadSubRecipes(),
        loadRawMaterials(null),
        loadUnits(),
      ]);
      setSubRecipes(srs);
      setRawMaterials(rms);
      setUnits(us);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const materialCost = (item: SubRecipeItem) => {
    const raw = rawMaterials.find((r) => r.id === item.materialId);
    return (raw?.cost ?? 0) * item.qty;
  };

  const costPerYieldUnit = (sr: SubRecipe) => {
    const total = sr.items.reduce((s, it) => s + materialCost(it), 0);
    return sr.yield_qty > 0 ? total / sr.yield_qty : 0;
  };

  const openNew = () => {
    setForm(empty);
    setOpen(true);
  };
  const openEdit = (sr: SubRecipe) => {
    setForm({
      id: sr.id,
      name: sr.name,
      yield_qty: String(sr.yield_qty),
      yield_unit: sr.yield_unit,
      items:
        sr.items.length > 0
          ? sr.items.map((i) => ({ materialId: i.materialId, qty: String(i.qty) }))
          : [{ materialId: "", qty: "" }],
    });
    setOpen(true);
  };
  const openDuplicate = (sr: SubRecipe) => {
    setForm({
      name: `${sr.name} (Copy)`,
      yield_qty: String(sr.yield_qty),
      yield_unit: sr.yield_unit,
      items:
        sr.items.length > 0
          ? sr.items.map((i) => ({ materialId: i.materialId, qty: String(i.qty) }))
          : [{ materialId: "", qty: "" }],
    });
    setOpen(true);
  };

  const addRow = () =>
    setForm({ ...form, items: [...form.items, { materialId: "", qty: "" }] });
  const removeRow = (idx: number) =>
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  const setRow = (idx: number, patch: Partial<{ materialId: string; qty: string }>) =>
    setForm({
      ...form,
      items: form.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    });

  const save = async () => {
    const items = form.items
      .filter((i) => i.materialId && Number(i.qty) > 0)
      .map((i) => ({ materialId: i.materialId, qty: Number(i.qty) }));
    if (!form.name.trim()) return toast.error("Name required");
    if (!(Number(form.yield_qty) > 0)) return toast.error("Yield qty must be > 0");
    if (items.length === 0) return toast.error("At least one ingredient with qty > 0");
    setSaving(true);
    try {
      await saveSubRecipe({
        id: form.id,
        name: form.name,
        yield_qty: Number(form.yield_qty),
        yield_unit: form.yield_unit,
        items,
      });
      toast.success("Sub-recipe saved");
      setOpen(false);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (sr: SubRecipe) => {
    if (!confirm(`Delete sub-recipe "${sr.name}"?`)) return;
    try {
      await deleteSubRecipe(sr.id);
      toast.success("Deleted");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete");
    }
  };

  const usedIds = useMemo(
    () => new Set(form.items.map((i) => i.materialId).filter(Boolean)),
    [form.items],
  );

  return (
    <AppShell
      title="Sub-Recipes"
      subtitle="মাস্টার mix (যেমন 'বেসিক খামির') তৈরি করুন — final product-এ ingredient হিসেবে ব্যবহার করা যাবে"
      actions={
        <button
          onClick={openNew}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="size-4" /> New Sub-Recipe
        </button>
      }
    >
      {loading ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : subRecipes.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="mx-auto size-12 rounded-full bg-primary/10 grid place-items-center mb-4">
            <ChefHat className="size-6 text-primary" />
          </div>
          <h3 className="text-base font-semibold mb-1">No sub-recipes yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            যেমন "বেসিক রুটির খামির" — একবার সেট করে দিলে সব রুটির recipe-এ ingredient হিসেবে ব্যবহার করা যাবে।
          </p>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="size-4" /> Create first sub-recipe
          </button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {subRecipes.map((sr) => {
            const cost = costPerYieldUnit(sr);
            return (
              <Card key={sr.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="font-semibold">{sr.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Yield: {sr.yield_qty} {sr.yield_unit}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(sr)}
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => remove(sr)}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 text-xs border-t border-border pt-2">
                  {sr.items.map((it) => {
                    const raw = rawMaterials.find((r) => r.id === it.materialId);
                    return (
                      <div key={it.materialId} className="flex justify-between">
                        <span className="text-muted-foreground">{raw?.name ?? "—"}</span>
                        <span className="tabular-nums">
                          {it.qty} {raw?.unit ?? ""}
                        </span>
                      </div>
                    );
                  })}
                  {sr.items.length === 0 && (
                    <div className="text-muted-foreground italic">No ingredients</div>
                  )}
                </div>
                <div className="text-xs mt-2 pt-2 border-t border-border flex justify-between">
                  <span className="text-muted-foreground">Cost / {sr.yield_unit}</span>
                  <span className="font-semibold tabular-nums">৳{cost.toFixed(2)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-2 sm:p-4">
          <div className="bg-background border border-border rounded-lg w-full max-w-2xl sm:h-auto h-[95vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="font-semibold flex items-center gap-2">
                <ChefHat className="size-4" />
                {form.id ? "Edit Sub-Recipe" : "New Sub-Recipe"}
              </div>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_120px] gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Name *</label>
                  <input
                    autoFocus
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Basic Bread Dough"
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Yield qty *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.yield_qty}
                    onChange={(e) => setForm({ ...form, yield_qty: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Unit</label>
                  <select
                    value={form.yield_unit}
                    onChange={(e) => setForm({ ...form, yield_unit: e.target.value })}
                    className="w-full h-10 px-2 rounded-md border border-input bg-background text-sm"
                  >
                    {units.length === 0 && (
                      <>
                        <option value="kg">kg</option>
                        <option value="g">g</option>
                        <option value="L">L</option>
                        <option value="ml">ml</option>
                        <option value="pc">pc</option>
                      </>
                    )}
                    {units.map((u) => (
                      <option key={u.id} value={u.code}>
                        {u.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Ingredients (per {form.yield_qty || "?"} {form.yield_unit})</div>
                  <button
                    onClick={addRow}
                    className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20"
                  >
                    <Plus className="size-3" /> Add row
                  </button>
                </div>
                <div className="space-y-2">
                  {form.items.map((it, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <div className="flex-1 min-w-0">
                        <IngredientPicker
                          materials={rawMaterials}
                          value={it.materialId}
                          onChange={(id) => setRow(idx, { materialId: id })}
                          disabledIds={usedIds}
                        />
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={it.qty}
                        onChange={(e) => setRow(idx, { qty: e.target.value })}
                        placeholder="Qty"
                        className="w-24 h-10 px-3 rounded-md border border-input bg-background text-sm tabular-nums"
                      />
                      <button
                        onClick={() => removeRow(idx)}
                        className="p-2 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="h-9 px-3 rounded-md border border-input text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="size-4" /> {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
