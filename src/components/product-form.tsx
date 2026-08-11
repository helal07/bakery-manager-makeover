import { Link, useNavigate } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { type ProductCategory, loadCategories, addCategory } from "@/lib/product-types";
import { ArrowLeft, ChevronDown, Plus, X, AlertTriangle, ChefHat, Copy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { addProduct, updateProduct, loadProducts, findProductBySku, type Product } from "@/lib/product-store";
import { addRawMaterial, loadRawMaterials, type RawMaterial } from "@/lib/raw-material-store";
import { loadUnits, type Unit } from "@/lib/unit-store";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IngredientPicker } from "@/components/ingredient-picker";
import { loadRecipeFor, loadRecipes, saveRecipe, type Ingredient } from "@/lib/recipe-store";
import {
  loadSubRecipes,
  expandIngredients,
  findOverlaps,
  type SubRecipe,
} from "@/lib/sub-recipe-store";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { uploadImage } from "@/lib/storage";

// Local editor row keeps qty as a STRING so users can type ".029" naturally.
// Exactly one of materialId / subRecipeId is set.
type IngredientRow = { materialId?: string; subRecipeId?: string; qty: string };

type FormState = {
  sku: string;
  name: string;
  category: ProductCategory;
  unit: string;
  price: string;
  stock: string;
  threshold: string;
  shelfLifeDays: string;
  imageUrl: string;
};

const emptyForm: FormState = {
  sku: "",
  name: "",
  category: "",
  unit: "",
  price: "",
  stock: "",
  threshold: "",
  shelfLifeDays: "",
  imageUrl: "",
};

function genSku(category: ProductCategory, name: string) {
  const defaults: Record<string, string> = { Cake: "CK", Bread: "BR", Biscuit: "BI", Pastry: "PA" };
  const prefix =
    defaults[category] ??
    (category.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2) || "PR");
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.slice(0, 3))
    .join("-");
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${prefix}-${slug || "NEW"}-${rand}`;
}

export function ProductForm({ editId, from }: { editId?: string; from?: string }) {
  const navigate = useNavigate();
  const { currentShowroomId } = useShowroomScope();
  const isEdit = !!editId;
  const [cats, setCats] = useState<ProductCategory[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [rmOpen, setRmOpen] = useState(false);
  const [rm, setRm] = useState({ name: "", unit: "", cost: "", threshold: "" });
  const [rmSaving, setRmSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [recipeEnabled, setRecipeEnabled] = useState(false);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [recipeIndex, setRecipeIndex] = useState<Record<string, number>>({});
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [copySource, setCopySource] = useState<string>("");
  const [copyBusy, setCopyBusy] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [skuTouched, setSkuTouched] = useState(false);
  const [skuError, setSkuError] = useState<string | null>(null);
  const [skuChecking, setSkuChecking] = useState(false);
  const [loading, setLoading] = useState(isEdit || !!from);
  const [showExpanded, setShowExpanded] = useState(false);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [savedClean, setSavedClean] = useState(false);
  // Synchronous flags: a save in flight (or already finished) must never trigger
  // the unsaved-changes prompt, because state updates land after navigation.
  const suppressGuardRef = useRef(false);
  const savedRef = useRef(false);

  // Snapshot used for the unsaved-changes guard.
  const snapshot = useMemo(
    () => JSON.stringify({ form, recipeEnabled, ingredients, image: imageFile?.name ?? null }),
    [form, recipeEnabled, ingredients, imageFile],
  );
  const dirty = !loading && !savedClean && baseline !== null && snapshot !== baseline;


  // Establish the baseline once the initial data finished loading.
  useEffect(() => {
    if (loading) return;
    setBaseline((b) => b ?? snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);



  useEffect(() => {
    (async () => {
      try {
        const [cs, rms, us, allPs, rMap, subs] = await Promise.all([
          loadCategories(),
          loadRawMaterials(currentShowroomId ?? null),
          loadUnits(),
          loadProducts(currentShowroomId ?? null),
          loadRecipes(),
          loadSubRecipes().catch(() => [] as SubRecipe[]),
        ]);
        setCats(cs);
        setRawMaterials(rms);
        setUnits(us);
        setAllProducts(allPs);
        setSubRecipes(subs);
        const idx: Record<string, number> = {};
        for (const pid of Object.keys(rMap)) idx[pid] = (rMap[pid] ?? []).length;
        setRecipeIndex(idx);
        setRm((s) => ({ ...s, unit: s.unit || us[0]?.code || "" }));

        if (isEdit && editId) {
          const p = allPs.find((x) => x.id === editId);
          if (!p) {
            toast.error("Product not found");
            navigate({ to: "/products" });
            return;
          }
          setForm({
            sku: p.sku,
            name: p.name,
            category: p.category,
            unit: p.unit ?? "",
            price: String(p.price),
            stock: String(p.stock),
            threshold: String(p.threshold),
            shelfLifeDays: p.shelfLifeDays !== undefined ? String(p.shelfLifeDays) : "",
            imageUrl: p.imageUrl ?? "",
          });
          try {
            const rows = await loadRecipeFor(p.id);
            setIngredients(
              rows.map((r) => ({
                materialId: r.subRecipeId ? undefined : r.materialId,
                subRecipeId: r.subRecipeId,
                qty: String(r.qty),
              })),
            );
            setRecipeEnabled(rows.length > 0);
          } catch {
            setIngredients([]);
            setRecipeEnabled(false);
          }
        } else if (from) {
          const src = allPs.find((x) => x.id === from);
          if (!src) {
            toast.error("Source product not found");
          } else {
            setForm({
              sku: "",
              name: `${src.name} (Copy)`,
              category: src.category,
              unit: src.unit ?? "",
              price: String(src.price),
              stock: "0",
              threshold: String(src.threshold),
              shelfLifeDays: src.shelfLifeDays !== undefined ? String(src.shelfLifeDays) : "",
              imageUrl: src.imageUrl ?? "",
            });
          }
        } else {
          setForm((f) => (f.category ? f : { ...f, category: cs[0] ?? "" }));
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShowroomId, editId, from]);

  const submitNewRawMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rm.name.trim()) { toast.error("Name is required"); return; }
    if (!rm.unit.trim()) { toast.error("Please select a unit"); return; }
    setRmSaving(true);
    try {
      const created = await addRawMaterial({
        name: rm.name.trim(),
        unit: rm.unit.trim(),
        cost: Number(rm.cost) || 0,
        threshold: Number(rm.threshold) || 0,
      });
      const rms = await loadRawMaterials(currentShowroomId ?? null);
      setRawMaterials(rms);
      setIngredients((l) => [...l, { materialId: created.id, qty: "" }]);
      setRecipeEnabled(true);
      setRm({ name: "", unit: units[0]?.code ?? "", cost: "", threshold: "" });
      setRmOpen(false);
      toast.success(`Added "${created.name}"`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add raw material");
    } finally {
      setRmSaving(false);
    }
  };

  const promptAddCategory = async () => {
    const name = window.prompt("New category name")?.trim();
    if (!name) return;
    try {
      await addCategory(name);
      const cs = await loadCategories();
      setCats(cs);
      setForm((f) => ({ ...f, category: name, sku: isEdit ? f.sku : genSku(name, f.name) }));
      toast.success(`Added category "${name}"`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add category");
    }
  };

  const previewUrl = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : form.imageUrl),
    [imageFile, form.imageUrl],
  );

  const subMap = useMemo(() => {
    const m: Record<string, SubRecipe> = {};
    for (const s of subRecipes) m[s.id] = s;
    return m;
  }, [subRecipes]);
  const rawMap = useMemo(() => {
    const m: Record<string, RawMaterial> = {};
    for (const r of rawMaterials) m[r.id] = r;
    return m;
  }, [rawMaterials]);

  const addMaterialRow = () => {
    const used = new Set(ingredients.map((i) => i.materialId).filter(Boolean) as string[]);
    const next = rawMaterials.find((r) => !used.has(r.id));
    if (!next) {
      toast.info("All raw materials are already used. Add a new one first.");
      return;
    }
    setIngredients((l) => [...l, { materialId: next.id, qty: "" }]);
  };
  const addSubRecipeRow = () => {
    const active = subRecipes.filter((s) => s.is_active);
    if (active.length === 0) {
      toast.info("No sub-recipes yet. Create one from the Sub-Recipes page.");
      return;
    }
    const used = new Set(ingredients.map((i) => i.subRecipeId).filter(Boolean) as string[]);
    const next = active.find((s) => !used.has(s.id)) ?? active[0];
    setIngredients((l) => [...l, { subRecipeId: next.id, qty: "" }]);
  };
  const updateIngredient = (idx: number, patch: Partial<IngredientRow>) =>
    setIngredients((l) => l.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeIngredient = (idx: number) =>
    setIngredients((l) => l.filter((_, i) => i !== idx));

  const copyFromSource = async (srcProductId: string) => {
    if (!srcProductId) return;
    setCopyBusy(true);
    try {
      const rows = await loadRecipeFor(srcProductId);
      setIngredients(
        rows.map((r) => ({
          materialId: r.subRecipeId ? undefined : r.materialId,
          subRecipeId: r.subRecipeId,
          qty: String(r.qty),
        })),
      );
      const src = allProducts.find((p) => p.id === srcProductId);
      toast.success(`Copied ${rows.length} ingredient${rows.length === 1 ? "" : "s"}${src ? ` from ${src.name}` : ""}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load source recipe");
    } finally {
      setCopyBusy(false);
    }
  };

  // Expand sub-recipes into aggregated raw-material demand per unit of product.
  // Multiple sub-recipes are merged; each material keeps track of its sources.
  const expandedPerUnit = useMemo(() => {
    const rows = expandIngredients(
      ingredients.map((i) => ({
        materialId: i.materialId,
        subRecipeId: i.subRecipeId,
        qty: Number(i.qty) || 0,
      })),
      subMap,
    );
    return rows.map((r) => {
      const raw = rawMap[r.materialId];
      return { materialId: r.materialId, raw, qty: r.total, cost: (raw?.cost ?? 0) * r.total, sources: r.sources };
    });
  }, [ingredients, subMap, rawMap]);

  // Materials that arrive from more than one source (two sub-recipes, or a
  // sub-recipe plus a direct material) — surfaced as a warning, not an error.
  const overlaps = useMemo(
    () => findOverlaps(expandedPerUnit.map((r) => ({ materialId: r.materialId, total: r.qty, sources: r.sources }))),
    [expandedPerUnit],
  );


  const estimatedCost = useMemo(
    () => expandedPerUnit.reduce((s, r) => s + r.cost, 0),
    [expandedPerUnit],
  );

  // Returns true when the SKU is free (or blank → will be auto-generated).
  const checkSku = async (raw: string): Promise<boolean> => {
    const s = raw.trim();
    if (!s) {
      setSkuError(null);
      return true;
    }
    setSkuChecking(true);
    try {
      const hit = await findProductBySku(s, editId);
      if (hit) {
        setSkuError(`Already used by "${hit.name}"`);
        return false;
      }
      setSkuError(null);
      return true;
    } catch {
      // Network/permission hiccup — let the DB unique index be the final judge.
      setSkuError(null);
      return true;
    } finally {
      setSkuChecking(false);
    }
  };

  // Pick a free auto SKU (retry a few times in case of a random collision).
  const autoSku = async (): Promise<string> => {
    for (let i = 0; i < 5; i++) {
      const candidate = genSku(form.category, form.name);
      try {
        if (!(await findProductBySku(candidate))) return candidate;
      } catch {
        return candidate;
      }
    }
    return genSku(form.category, form.name);
  };


  const doSave = async (opts?: { navigateAfter?: boolean }): Promise<boolean> => {
    const navigateAfter = opts?.navigateAfter !== false;
    // Already persisted once (e.g. guard dialog after a successful save) —
    // never write a second time, that is what produced duplicate-SKU errors.
    if (savedRef.current) {
      if (navigateAfter) navigate({ to: "/products" });
      return true;
    }
    if (saving) return false;

    if (!form.name.trim()) {
      toast.error("Product name is required");
      return false;
    }
    if (!form.category) {
      toast.error("Please select a category");
      return false;
    }
    const typedSku = form.sku.trim();
    if (typedSku && !(await checkSku(typedSku))) {
      toast.error(`SKU "${typedSku}" is already used by another product`);
      return false;
    }
    setSaving(true);
    suppressGuardRef.current = true;

    try {
      const sku = typedSku || (await autoSku());

      const payload = {
        sku,
        name: form.name.trim(),
        category: form.category,
        unit: form.unit || undefined,
        price: Number(form.price) || 0,
        threshold: Number(form.threshold) || 0,
        shelfLifeDays: shelf,
        imageUrl: form.imageUrl || undefined,
      };

      let clean: Ingredient[] = [];
      if (recipeEnabled) {
        const seenMat = new Set<string>();
        const seenSub = new Set<string>();
        for (const i of ingredients) {
          const qty = Number(i.qty);
          if (!Number.isFinite(qty) || qty <= 0) continue;
          if (i.subRecipeId) {
            if (seenSub.has(i.subRecipeId)) {
              toast.error("Duplicate sub-recipe in the recipe");
              setSaving(false);
              return false;
            }
            seenSub.add(i.subRecipeId);
            clean.push({ materialId: "", subRecipeId: i.subRecipeId, qty });
          } else if (i.materialId) {
            if (seenMat.has(i.materialId)) {
              toast.error("Duplicate material in the recipe");
              setSaving(false);
              return false;
            }
            seenMat.add(i.materialId);
            clean.push({ materialId: i.materialId, qty });
          }
        }
        if (clean.length === 0) {
          toast.error("Add at least one ingredient with quantity > 0, or turn off the recipe toggle");
          setSaving(false);
          return false;
        }
      }

      if (isEdit && editId) {
        let imageUrl = payload.imageUrl;
        if (imageFile) {
          const uploaded = await uploadImage("product-images", editId, imageFile);
          imageUrl = uploaded.url;
        }
        await updateProduct(editId, { ...payload, imageUrl }, { showroomId: currentShowroomId ?? null });
        await saveRecipe(editId, clean);
        toast.success("Product updated");
      } else {
        const created = await addProduct(payload, {
          showroomId: currentShowroomId ?? null,
          openingStock: Number(form.stock) || 0,
        });
        if (imageFile) {
          const uploaded = await uploadImage("product-images", created.id, imageFile);
          await updateProduct(created.id, { imageUrl: uploaded.url });
        }
        await saveRecipe(created.id, clean);
        toast.success("Product added");
      }
      savedRef.current = true;
      setSavedClean(true);
      if (navigateAfter) navigate({ to: "/products" });
      return true;
    } catch (e: any) {
      suppressGuardRef.current = false;
      toast.error(e?.message ?? "Failed to save product");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void doSave();
  };

  const {
    open: guardOpen,
    busy: guardBusy,
    guard,
    proceed: discardChanges,
    cancel: cancelLeave,
    saveAndProceed,
  } = useUnsavedChanges({
    dirty,
    onSave: () => doSave({ navigateAfter: false }),
    suppressRef: suppressGuardRef,
  });


  return (
    <AppShell
      title={isEdit ? "Edit Product" : "Add Product"}
      subtitle={isEdit ? "Update pricing, stock threshold and recipe" : "Create a new product with pricing, stock and recipe"}
      actions={
        <Link
          to="/products"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent"
        >
          <ArrowLeft className="size-4" /> Back to list
        </Link>
      }
    >
      {loading ? (
        <div className="text-sm text-muted-foreground py-10 text-center">Loading product…</div>
      ) : (
      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-5">
          <Card className="p-6">
            <h3 className="text-sm font-semibold mb-4">Basic details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="p-name">Product name</Label>
                <Input
                  id="p-name"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({ ...f, name, sku: isEdit ? f.sku : genSku(f.category, name) }));
                  }}
                  placeholder="Chocolate Truffle 1kg"
                />
              </div>
              <div>
                <Label htmlFor="p-cat">Category</Label>
                <div className="flex gap-1">
                  <select
                    id="p-cat"
                    value={form.category}
                    onChange={(e) => {
                      const category = e.target.value;
                      setForm((f) => ({ ...f, category, sku: isEdit ? f.sku : genSku(category, f.name) }));
                    }}
                    className="flex-1 h-9 px-2.5 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                  >
                    {cats.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={promptAddCategory}
                    className="h-9 px-2 rounded-md border border-input text-xs hover:bg-accent inline-flex items-center gap-1"
                    title="Add new category"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="p-sku">SKU <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <button
                    type="button"
                    onClick={() => {
                      setSkuTouched(false);
                      setSkuError(null);
                      setForm((f) => ({ ...f, sku: genSku(f.category, f.name) }));
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Regenerate
                  </button>
                </div>
                <Input
                  id="p-sku"
                  value={form.sku}
                  onChange={(e) => {
                    setSkuTouched(true);
                    setSkuError(null);
                    setForm((f) => ({ ...f, sku: e.target.value }));
                  }}
                  onBlur={() => void checkSku(form.sku)}
                  placeholder="Leave blank to auto-generate"
                  className={`font-mono ${skuError ? "border-destructive" : ""}`}
                />
                {skuError ? (
                  <p className="mt-1 text-xs text-destructive">{skuError}</p>
                ) : skuChecking ? (
                  <p className="mt-1 text-xs text-muted-foreground">Checking availability…</p>
                ) : null}
              </div>

            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-semibold mb-4">Pricing & stock</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="p-unit">Unit</Label>
                <select
                  id="p-unit"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a unit…</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.code}>
                      {u.code} — {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="p-price">Price (৳)</Label>
                <Input id="p-price" type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="p-stock">{isEdit ? "Current stock" : "Opening stock"}</Label>
                <Input
                  id="p-stock"
                  type="number"
                  min={0}
                  value={form.stock}
                  readOnly={isEdit}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  className={isEdit ? "bg-muted/40 cursor-not-allowed" : ""}
                />
                {isEdit && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Adjusted automatically via purchases and sales.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="p-threshold">Low-stock threshold</Label>
                <Input id="p-threshold" type="number" min={0} value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="p-shelf">Max validity from production (days)</Label>
                <Input
                  id="p-shelf"
                  type="number"
                  min={0}
                  value={form.shelfLifeDays}
                  onChange={(e) => setForm({ ...form, shelfLifeDays: e.target.value })}
                  placeholder="e.g. 7"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Expiry is calculated from production date per batch.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-3 mb-3">
              <div className="min-w-0 lg:max-w-[220px]">
                <h3 className="text-sm font-semibold">Recipe & Ingredients</h3>
                <p className="text-[11px] text-muted-foreground truncate">
                  Attach a bill-of-materials.
                </p>
              </div>
              <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 lg:justify-end">
                <label
                  className={`inline-flex items-center gap-2 text-xs font-bold cursor-pointer select-none rounded-full border px-3 py-1.5 whitespace-nowrap transition-colors ${
                    recipeEnabled
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-muted/40 hover:bg-accent"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={recipeEnabled}
                    onChange={(e) => setRecipeEnabled(e.target.checked)}
                    className="size-4 accent-current"
                  />
                  <span className="uppercase tracking-wide">Recipe</span>
                </label>

                {recipeEnabled && (
                  <>
                    <button
                      type="button"
                      onClick={addMaterialRow}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-background hover:bg-accent whitespace-nowrap transition-colors"
                    >
                      <Plus className="size-3.5" /> Ingredient
                    </button>
                    <button
                      type="button"
                      onClick={addSubRecipeRow}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 whitespace-nowrap transition-colors"
                    >
                      <ChefHat className="size-3.5" /> Sub-recipe
                    </button>
                    <button
                      type="button"
                      onClick={() => setRmOpen(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm whitespace-nowrap transition-colors"
                    >
                      <Plus className="size-3.5" /> Raw material
                    </button>

                    <span className="hidden lg:block h-6 w-px bg-border" />

                    <span
                      className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap"
                      title="Copy from existing recipe"
                    >
                      Copy from
                    </span>
                    <select
                      value={copySource}
                      onChange={(e) => setCopySource(e.target.value)}
                      className="h-8 rounded-full border border-input bg-background px-2 text-xs w-[130px] shrink-0"
                    >
                      <option value="">Select product…</option>
                      {allProducts
                        .filter((p) => (recipeIndex[p.id] ?? 0) > 0 && p.id !== editId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={!copySource || copyBusy}
                      onClick={() => copyFromSource(copySource)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 whitespace-nowrap transition-colors"
                    >
                      <Copy className="size-3.5" /> {copyBusy ? "Copying…" : "Copy"}
                    </button>
                  </>
                )}
              </div>
            </div>




            {recipeEnabled && (
              <>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Edits here override this product's recipe only.
                </p>





                {rawMaterials.length === 0 && ingredients.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm">
                    <div className="font-medium mb-1">No raw materials yet</div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Ingredients are built from your raw materials (flour, sugar, etc.). Add
                      one right here without leaving this page.
                    </p>
                    <button
                      type="button"
                      onClick={() => setRmOpen(true)}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <Plus className="size-3.5" /> Add raw material
                    </button>
                  </div>
                ) : ingredients.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-2">
                    Click <span className="font-medium">Add ingredient</span> to add a raw material or sub-recipe.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ingredients.map((ing, idx) => {
                      if (ing.subRecipeId) {
                        const sub = subMap[ing.subRecipeId];
                        const usedSub = new Set(
                          ingredients
                            .filter((_, i) => i !== idx)
                            .map((i) => i.subRecipeId)
                            .filter(Boolean) as string[],
                        );
                        return (
                          <div key={idx} className="flex items-center gap-2">
                            <div className="flex-1 flex items-center gap-2 min-w-0">
                              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                Sub
                              </span>
                              <select
                                value={ing.subRecipeId}
                                onChange={(e) =>
                                  updateIngredient(idx, { subRecipeId: e.target.value, materialId: undefined })
                                }
                                className="flex-1 min-w-0 h-10 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                              >
                                {subRecipes.map((s) => (
                                  <option
                                    key={s.id}
                                    value={s.id}
                                    disabled={usedSub.has(s.id) && s.id !== ing.subRecipeId}
                                  >
                                    {s.name} (yields {s.yield_qty} {s.yield_unit})
                                    {!s.is_active ? " · inactive" : ""}
                                  </option>
                                ))}
                                {!sub && (
                                  <option value={ing.subRecipeId}>Unknown sub-recipe</option>
                                )}
                              </select>
                            </div>
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder="0"
                              value={ing.qty}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "" || /^\d*\.?\d{0,6}$/.test(v)) {
                                  updateIngredient(idx, { qty: v });
                                }
                              }}
                              className="w-24 text-right"
                            />
                            <span className="text-xs text-muted-foreground w-10">
                              {sub?.yield_unit ?? ""}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeIngredient(idx)}
                              className="size-8 grid place-items-center rounded text-destructive hover:bg-destructive/10"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        );
                      }

                      const mat = ing.materialId ? rawMap[ing.materialId] : undefined;
                      const usedIds = new Set(
                        ingredients
                          .filter((_, i) => i !== idx)
                          .map((i) => i.materialId)
                          .filter(Boolean) as string[],
                      );
                      return (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            Mat
                          </span>
                          <IngredientPicker
                            materials={rawMaterials}
                            value={ing.materialId ?? ""}
                            onChange={(id) => updateIngredient(idx, { materialId: id, subRecipeId: undefined })}
                            disabledIds={usedIds}
                          />
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            value={ing.qty}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "" || /^\d*\.?\d{0,6}$/.test(v)) {
                                updateIngredient(idx, { qty: v });
                              }
                            }}
                            className="w-24 text-right"
                          />
                          <span className="text-xs text-muted-foreground w-10">{mat?.unit ?? ""}</span>
                          <button
                            type="button"
                            onClick={() => removeIngredient(idx)}
                            className="size-8 grid place-items-center rounded text-destructive hover:bg-destructive/10"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {overlaps.length > 0 && (
                  <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                    <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="size-3.5" /> একই raw material একাধিক জায়গা থেকে আসছে
                    </div>
                    <ul className="mt-1.5 space-y-0.5 pl-5 list-disc text-muted-foreground">
                      {overlaps.map((o) => (
                        <li key={o.materialId}>
                          <span className="font-medium text-foreground">
                            {rawMap[o.materialId]?.name ?? "Unknown material"}
                          </span>{" "}
                          — {o.sources.map((s) => s.label).join(" + ")} (total {o.total.toFixed(4)}{" "}
                          {rawMap[o.materialId]?.unit ?? ""})
                        </li>
                      ))}
                    </ul>
                    <div className="mt-1.5 text-[11px] text-muted-foreground">
                      Production-এ এগুলো যোগ করে একবারেই stock থেকে কাটা হবে — ঠিক আছে কিনা দেখে নিন।
                    </div>
                  </div>
                )}

                {ingredients.length > 0 && (

                  <div className="mt-4 rounded-md border border-border bg-muted/20">
                    <button
                      type="button"
                      onClick={() => setShowExpanded((s) => !s)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium hover:bg-accent/50"
                    >
                      <span>
                        Expanded raw material preview · Est. cost/unit ৳{estimatedCost.toFixed(2)}
                      </span>
                      <ChevronDown
                        className={`size-3.5 transition-transform ${showExpanded ? "rotate-180" : ""}`}
                      />
                    </button>
                    {showExpanded && (
                      <div className="border-t border-border p-3">
                        {expandedPerUnit.length === 0 ? (
                          <div className="text-[11px] text-muted-foreground">
                            Add quantities to see the expanded breakdown.
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {expandedPerUnit.map((r) => (
                              <div key={r.materialId} className="text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate flex items-center gap-1">
                                    {r.sources.length > 1 && (
                                      <AlertTriangle className="size-3 text-amber-500 shrink-0" />
                                    )}
                                    {r.raw?.name ?? "Unknown material"}
                                  </span>
                                  <span className="tabular-nums text-muted-foreground shrink-0">
                                    {r.qty.toFixed(4)} {r.raw?.unit ?? ""} · ৳{r.cost.toFixed(2)}
                                  </span>
                                </div>
                                {r.sources.length > 1 && (
                                  <div className="pl-4 text-[10px] text-muted-foreground">
                                    {r.sources
                                      .map((s) => `${s.label}: ${s.qty.toFixed(4)}`)
                                      .join(" + ")}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-6">
            <h3 className="text-sm font-semibold mb-3">Product image</h3>
            <div className="flex flex-col items-center gap-3">
              {previewUrl ? (
                <img src={previewUrl} alt="" className="size-40 rounded-md object-cover border border-border" />
              ) : (
                <div className="size-40 rounded-md bg-muted grid place-items-center text-xs text-muted-foreground">
                  No image
                </div>
              )}
              <Input
                id="p-image"
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : isEdit ? "Save changes" : "Save product"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => guard(() => navigate({ to: "/products" }))}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      </form>
      )}

      <Dialog open={rmOpen} onOpenChange={setRmOpen}>
        <DialogContent>
          <form onSubmit={submitNewRawMaterial}>
            <DialogHeader>
              <DialogTitle>Add Raw Material</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3">
              <div className="sm:col-span-2">
                <Label htmlFor="rm2-name">Name</Label>
                <Input id="rm2-name" value={rm.name} onChange={(e) => setRm({ ...rm, name: e.target.value })} placeholder="Flour, Sugar, Butter…" autoFocus />
              </div>
              <div>
                <Label htmlFor="rm2-unit">Unit</Label>
                <select
                  id="rm2-unit"
                  value={rm.unit}
                  onChange={(e) => setRm({ ...rm, unit: e.target.value })}
                  className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                >
                  <option value="" disabled>Select a unit…</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.code}>{u.code} — {u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="rm2-cost">Unit cost (৳)</Label>
                <Input id="rm2-cost" type="number" min={0} step="0.01" value={rm.cost} onChange={(e) => setRm({ ...rm, cost: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="rm2-threshold">Low-stock threshold</Label>
                <Input id="rm2-threshold" type="number" min={0} value={rm.threshold} onChange={(e) => setRm({ ...rm, threshold: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRmOpen(false)} disabled={rmSaving}>Cancel</Button>
              <Button type="submit" disabled={rmSaving}>{rmSaving ? "Adding…" : "Add & use"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={guardOpen}
        title="Unsaved changes"
        description="এই product-এ save না করা পরিবর্তন আছে। Save করবেন, নাকি বাদ দেবেন?"
        confirmLabel="Save"
        altLabel="Don't save"
        cancelLabel="Keep editing"
        busy={guardBusy || saving}
        onConfirm={() => void saveAndProceed()}
        onAlt={discardChanges}
        onCancel={cancelLeave}
      />
    </AppShell>
  );
}
