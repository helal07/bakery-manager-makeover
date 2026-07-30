import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { PermissionGate } from "@/components/permission-gate";
import { IngredientPicker } from "@/components/ingredient-picker";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { pageTitle } from "@/lib/company-settings";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChefHat, Plus, Pencil, Trash2, X, Save, Copy, Search, ChevronDown, ArrowUpDown } from "lucide-react";
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
  autoYield: boolean;
  items: { materialId: string; qty: string }[];
};

const empty: EditorState = {
  name: "",
  yield_qty: "100",
  yield_unit: "kg",
  autoYield: true,
  items: [{ materialId: "", qty: "" }],
};

type SortKey = "name" | "qty" | "cost" | "created";


function SubRecipesPage() {
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EditorState>(empty);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [baseline, setBaseline] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SubRecipe | null>(null);
  const dirty = open && baseline !== null && JSON.stringify(form) !== baseline;


  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

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

  const fromSubRecipe = (sr: SubRecipe, copy = false): EditorState => ({
    id: copy ? undefined : sr.id,
    name: copy ? `${sr.name} (Copy)` : sr.name,
    yield_qty: String(sr.yield_qty),
    yield_unit: sr.yield_unit,
    autoYield: false,
    items:
      sr.items.length > 0
        ? sr.items.map((i) => ({ materialId: i.materialId, qty: String(i.qty) }))
        : [{ materialId: "", qty: "" }],
  });

  const openWith = (next: EditorState) => {
    guard(() => {
      setForm(next);
      setBaseline(JSON.stringify(next));
      setOpen(true);
    });
  };

  const openNew = () => openWith(empty);
  const openEdit = (sr: SubRecipe) => openWith(fromSubRecipe(sr));
  const openDuplicate = (sr: SubRecipe) => openWith(fromSubRecipe(sr, true));

  /** Auto-calculated yield = sum of ingredient quantities. */
  const autoYieldTotal = useMemo(
    () => form.items.reduce((s, i) => s + (Number(i.qty) || 0), 0),
    [form.items],
  );

  const patchForm = (patch: Partial<EditorState>) =>
    setForm((f) => {
      const next = { ...f, ...patch };
      if (next.autoYield) {
        const total = next.items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
        next.yield_qty = total > 0 ? String(Number(total.toFixed(4))) : "";
      }
      return next;
    });

  const addRow = () => patchForm({ items: [...form.items, { materialId: "", qty: "" }] });
  const removeRow = (idx: number) =>
    patchForm({ items: form.items.filter((_, i) => i !== idx) });
  const setRow = (idx: number, patch: Partial<{ materialId: string; qty: string }>) =>
    patchForm({ items: form.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });

  const save = async (): Promise<boolean> => {
    const items = form.items
      .filter((i) => i.materialId && Number(i.qty) > 0)
      .map((i) => ({ materialId: i.materialId, qty: Number(i.qty) }));
    if (!form.name.trim()) {
      toast.error("Name required");
      return false;
    }
    if (!(Number(form.yield_qty) > 0)) {
      toast.error("Yield qty must be > 0");
      return false;
    }
    if (items.length === 0) {
      toast.error("At least one ingredient with qty > 0");
      return false;
    }
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
      setBaseline(JSON.stringify(form));
      setOpen(false);
      await refresh();
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const closeEditor = () =>
    guard(() => {
      setOpen(false);
      setBaseline(null);
    });

  const remove = async (sr: SubRecipe) => {
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

  const matName = (id: string) => rawMaterials.find((r) => r.id === id)?.name ?? "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? subRecipes
      : subRecipes.filter(
          (sr) =>
            sr.name.toLowerCase().includes(q) ||
            sr.items.some((it) => matName(it.materialId).toLowerCase().includes(q)),
        );
    const sorted = [...base].sort((a, b) => {
      switch (sort) {
        case "qty":
          return b.yield_qty - a.yield_qty;
        case "cost":
          return costPerYieldUnit(b) - costPerYieldUnit(a);
        case "created":
          return (b.created_at ?? "").localeCompare(a.created_at ?? "");
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [subRecipes, query, rawMaterials, sort]);



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
        <div className="space-y-3">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sub-recipe or ingredient…"
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm"
            />
          </div>

          {filtered.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No sub-recipe matches “{query}”
            </Card>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden divide-y divide-border bg-card">
              {filtered.map((sr) => {
                const cost = costPerYieldUnit(sr);
                const isOpen = expanded.has(sr.id);
                return (
                  <div key={sr.id} className={isOpen ? "bg-accent/30" : "hover:bg-accent/20 transition-colors"}>
                    <div className="flex items-center gap-2 p-3">
                      <button
                        onClick={() => toggleExpand(sr.id)}
                        className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
                      >
                        <span className="size-8 shrink-0 rounded-lg bg-primary/10 grid place-items-center">
                          <ChefHat className="size-4 text-primary" />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-sm truncate">{sr.name}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            Yield {sr.yield_qty} {sr.yield_unit} · {sr.items.length} ingredient
                            {sr.items.length === 1 ? "" : "s"}
                          </span>
                        </span>
                      </button>
                      <div className="hidden sm:block text-right shrink-0 mr-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Cost / {sr.yield_unit}
                        </div>
                        <div className="text-sm font-semibold tabular-nums">৳{cost.toFixed(2)}</div>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <button
                          onClick={() => openEdit(sr)}
                          title="Edit"
                          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          onClick={() => openDuplicate(sr)}
                          title="Duplicate"
                          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="size-4" />
                        </button>
                        <button
                          onClick={() => remove(sr)}
                          title="Delete"
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                        <button
                          onClick={() => toggleExpand(sr.id)}
                          title={isOpen ? "Collapse" : "Expand"}
                          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
                        >
                          <ChevronDown
                            className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="px-3 pb-3 pt-0">
                        <div className="rounded-lg border border-border bg-background overflow-hidden">
                          <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/50">
                            <span>Ingredient</span>
                            <span className="text-right">Qty</span>
                            <span className="text-right w-20">Cost</span>
                          </div>
                          {sr.items.length === 0 ? (
                            <div className="px-3 py-3 text-xs text-muted-foreground italic">
                              No ingredients
                            </div>
                          ) : (
                            sr.items.map((it) => {
                              const raw = rawMaterials.find((r) => r.id === it.materialId);
                              return (
                                <div
                                  key={it.materialId}
                                  className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-1.5 text-xs border-t border-border"
                                >
                                  <span className="truncate">{raw?.name ?? "—"}</span>
                                  <span className="tabular-nums text-right">
                                    {it.qty} {raw?.unit ?? ""}
                                  </span>
                                  <span className="tabular-nums text-right w-20">
                                    ৳{materialCost(it).toFixed(2)}
                                  </span>
                                </div>
                              );
                            })
                          )}
                          <div className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2 text-xs border-t border-border bg-muted/40 font-medium">
                            <span>Total batch cost</span>
                            <span className="tabular-nums">
                              ৳{sr.items.reduce((s, it) => s + materialCost(it), 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => openEdit(sr)}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-input text-xs hover:bg-accent"
                          >
                            <Pencil className="size-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => openDuplicate(sr)}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-input text-xs hover:bg-accent"
                          >
                            <Copy className="size-3.5" /> Duplicate
                          </button>
                          <span className="sm:hidden ml-auto text-xs self-center">
                            <span className="text-muted-foreground">Cost/{sr.yield_unit}: </span>
                            <span className="font-semibold tabular-nums">৳{cost.toFixed(2)}</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
