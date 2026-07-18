import { Link, useNavigate } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { type ProductCategory, loadCategories, addCategory } from "@/lib/product-types";
import { ArrowLeft, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { addProduct, updateProduct, loadProducts, type Product } from "@/lib/product-store";
import { addRawMaterial, loadRawMaterials, type RawMaterial } from "@/lib/raw-material-store";
import { loadUnits, type Unit } from "@/lib/unit-store";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadRecipeFor, saveRecipe, type Ingredient } from "@/lib/recipe-store";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { uploadImage } from "@/lib/storage";

type FormState = {
  sku: string;
  name: string;
  category: ProductCategory;
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

export function ProductForm({ editId }: { editId?: string }) {
  const navigate = useNavigate();
  const { currentShowroomId } = useShowroomScope();
  const isEdit = !!editId;
  const [cats, setCats] = useState<ProductCategory[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [rmOpen, setRmOpen] = useState(false);
  const [rm, setRm] = useState({ name: "", unit: "", cost: "", threshold: "" });
  const [rmSaving, setRmSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    (async () => {
      try {
        const [cs, rms, us] = await Promise.all([
          loadCategories(),
          loadRawMaterials(currentShowroomId ?? null),
          loadUnits(),
        ]);
        setCats(cs);
        setRawMaterials(rms);
        setUnits(us);
        setRm((s) => ({ ...s, unit: s.unit || us[0]?.code || "" }));

        if (isEdit && editId) {
          const products = await loadProducts(currentShowroomId ?? null);
          const p = products.find((x) => x.id === editId);
          if (!p) {
            toast.error("Product not found");
            navigate({ to: "/products" });
            return;
          }
          setForm({
            sku: p.sku,
            name: p.name,
            category: p.category,
            price: String(p.price),
            stock: String(p.stock),
            threshold: String(p.threshold),
            shelfLifeDays: p.shelfLifeDays !== undefined ? String(p.shelfLifeDays) : "",
            imageUrl: p.imageUrl ?? "",
          });
          try {
            setIngredients(await loadRecipeFor(p.id));
          } catch {
            setIngredients([]);
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
  }, [currentShowroomId, editId]);

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
      setIngredients((l) => [...l, { materialId: created.id, qty: 1 }]);
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

  const addIngredient = () => {
    const used = new Set(ingredients.map((i) => i.materialId));
    const next = rawMaterials.find((r) => !used.has(r.id));
    if (!next) {
      toast.info("Add raw materials first from the Raw Materials page");
      return;
    }
    setIngredients((l) => [...l, { materialId: next.id, qty: 1 }]);
  };
  const updateIngredient = (idx: number, patch: Partial<Ingredient>) =>
    setIngredients((l) => l.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeIngredient = (idx: number) =>
    setIngredients((l) => l.filter((_, i) => i !== idx));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Product name is required");
      return;
    }
    if (!form.category) {
      toast.error("Please select a category");
      return;
    }
    const shelf = form.shelfLifeDays.trim() ? Number(form.shelfLifeDays) : undefined;
    if (shelf !== undefined && (!Number.isFinite(shelf) || shelf < 0)) {
      toast.error("Max validity must be a positive number of days");
      return;
    }
    setSaving(true);
    try {
      const sku = form.sku.trim() || genSku(form.category, form.name);
      const payload = {
        sku,
        name: form.name.trim(),
        category: form.category,
        price: Number(form.price) || 0,
        threshold: Number(form.threshold) || 0,
        shelfLifeDays: shelf,
        imageUrl: form.imageUrl || undefined,
      };
      const clean = ingredients.filter((i) => i.materialId && i.qty > 0);

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
      navigate({ to: "/products" });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

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
                <Label htmlFor="p-sku">SKU</Label>
                <Input
                  id="p-sku"
                  value={form.sku}
                  readOnly
                  placeholder="Auto-generated on save"
                  className="font-mono bg-muted/40 cursor-not-allowed"
                />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-semibold mb-4">Pricing & stock</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Ingredients & Measurement</h3>
              <div className="flex items-center gap-2">
                {rawMaterials.length > 0 && (
                  <button
                    type="button"
                    onClick={addIngredient}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-accent"
                  >
                    <Plus className="size-3" /> Add ingredient
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setRmOpen(true)}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="size-3" /> Add raw material
                </button>
              </div>
            </div>
            {rawMaterials.length === 0 ? (
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
                Click <span className="font-medium">Add ingredient</span> above to pick
                raw materials that will be deducted from stock per unit sold.
              </div>
            ) : (
              <div className="space-y-2">
                {ingredients.map((ing, idx) => {
                  const mat = rawMaterials.find((r) => r.id === ing.materialId);
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={ing.materialId}
                        onChange={(e) => updateIngredient(idx, { materialId: e.target.value })}
                        className="flex-1 h-9 px-2 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                      >
                        {rawMaterials.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={ing.qty}
                        onChange={(e) => updateIngredient(idx, { qty: Number(e.target.value) || 0 })}
                        className="w-24"
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
                onClick={() => navigate({ to: "/products" })}
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
    </AppShell>
  );
}
