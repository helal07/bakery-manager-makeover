import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { type ProductCategory, loadCategories, addCategory } from "@/lib/product-types";
import { Plus, Pencil, Trash2, QrCode, X, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import {
  loadProducts,
  addProduct,
  updateProduct,
  removeProduct,
  type Product,
} from "@/lib/product-store";
import { loadRawMaterials, type RawMaterial } from "@/lib/raw-material-store";
import { loadRecipeFor, saveRecipe, type Ingredient } from "@/lib/recipe-store";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { printLabels, type LabelSize } from "@/lib/print-labels";
import { uploadImage } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/products/")({
  head: () => ({ meta: [{ title: "Products · Crumb & Co." }] }),
  component: Products,
});

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
  category: "Cake",
  price: "",
  stock: "",
  threshold: "",
  shelfLifeDays: "",
  imageUrl: "",
};

function Products() {
  const { currentShowroomId } = useShowroomScope();
  const navigate = useNavigate();
  const [editableCats, setEditableCats] = useState<ProductCategory[]>([]);
  const cats = useMemo<string[]>(() => ["All", ...editableCats], [editableCats]);
  const [cat, setCat] = useState<string>("All");
  const [list, setList] = useState<Product[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [labelFor, setLabelFor] = useState<Product | null>(null);
  const [labelSize, setLabelSize] = useState<LabelSize>("38x25");
  const [labelQty, setLabelQty] = useState(1);

  const refresh = async () => {
    try {
      const [ps, rms, cs] = await Promise.all([
        loadProducts(currentShowroomId ?? null),
        loadRawMaterials(currentShowroomId ?? null),
        loadCategories(),
      ]);
      setList(ps);
      setRawMaterials(rms);
      setEditableCats(cs);
      setForm((f) => (f.category ? f : { ...f, category: cs[0] ?? "" }));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShowroomId]);

  // Redirect legacy #new hash to the dedicated Add page
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#new") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      navigate({ to: "/products/new" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter(
      (p) =>
        (cat === "All" || p.category === cat) &&
        (q === "" ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q)),
    );
  }, [list, cat, query]);

  // Auto-generate SKU from category + product name (professional pattern).
  const genSku = (category: ProductCategory, name: string) => {
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
  };

  const promptAddCategory = async () => {
    const name = window.prompt("New category name")?.trim();
    if (!name) return;
    try {
      await addCategory(name);
      const cs = await loadCategories();
      setEditableCats(cs);
      setForm((f) => ({ ...f, category: name, sku: editId ? f.sku : genSku(name, f.name) }));
      toast.success(`Added category "${name}"`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add category");
    }
  };

  const openEdit = async (p: Product) => {
    setEditId(p.id);
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
    setImageFile(null);
    try {
      setIngredients(await loadRecipeFor(p.id));
    } catch {
      setIngredients([]);
    }
    setOpen(true);
  };
  const remove = async (id: string) => {
    try {
      await removeProduct(id);
      setList((l) => l.filter((p) => p.id !== id));
      toast.success("Product removed");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Product name is required");
      return;
    }
    const shelf = form.shelfLifeDays.trim() ? Number(form.shelfLifeDays) : undefined;
    if (shelf !== undefined && (!Number.isFinite(shelf) || shelf < 0)) {
      toast.error("Max validity must be a positive number of days");
      return;
    }
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
    const cleanIngredients = ingredients.filter((i) => i.materialId && i.qty > 0);
    try {
      if (editId) {
        let imageUrl = payload.imageUrl;
        if (imageFile) {
          const uploaded = await uploadImage("product-images", editId, imageFile);
          imageUrl = uploaded.url;
        }
        await updateProduct(editId, { ...payload, imageUrl }, { showroomId: currentShowroomId ?? null });
        await saveRecipe(editId, cleanIngredients);
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
        await saveRecipe(created.id, cleanIngredients);
        toast.success("Product added");
      }
      setOpen(false);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save product");
    }
  };

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

  return (
    <AppShell
      title="Products List"
      subtitle="Manage SKUs, prices, categories and barcodes"
      actions={
        <Link
          to="/products/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
        >
          <Plus className="size-4" /> Add Product
        </Link>
      }
    >
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div className="flex gap-1 p-1 bg-muted/50 rounded-md w-fit">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-4 py-1.5 rounded text-sm ${cat === c ? "bg-card shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {c}
            </button>
          ))}
          <button
            type="button"
            onClick={promptAddCategory}
            className="px-3 py-1.5 rounded text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            title="Add category"
          >
            <Plus className="size-3.5" /> Category
          </button>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or SKU…"
            className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
          />
        </div>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-5 py-3">SKU</th>
              <th className="text-left font-medium px-5 py-3">Product</th>
              <th className="text-left font-medium px-5 py-3">Category</th>
              <th className="text-right font-medium px-5 py-3">Price</th>
              <th className="text-right font-medium px-5 py-3">Stock</th>
              <th className="text-left font-medium px-5 py-3">Expiry</th>
              <th className="text-right font-medium px-5 py-3">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((p) => {
              const low = p.stock < p.threshold;
              return (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{p.sku}</td>
                  <td className="px-5 py-3 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" className="size-8 rounded object-cover" />
                      ) : (
                        <span className="size-8 rounded bg-muted" />
                      )}
                      {p.name}
                    </span>
                  </td>
                  <td className="px-5 py-3"><Badge tone="primary">{p.category}</Badge></td>
                  <td className="px-5 py-3 text-right">৳{p.price.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right">{p.stock}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {p.expiryDate ? (
                      <span className={p.expiryDate < new Date().toISOString().slice(0, 10) ? "text-destructive" : ""}>
                        {p.expiryDate}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">{low ? <Badge tone="danger">Low</Badge> : <Badge tone="success">Active</Badge>}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => { setLabelFor(p); setLabelQty(1); }}
                        title="Print barcode labels"
                        className="size-7 grid place-items-center rounded hover:bg-muted text-muted-foreground"
                      >
                        <QrCode className="size-3.5" />
                      </button>
                      <button onClick={() => openEdit(p)} className="size-7 grid place-items-center rounded hover:bg-muted text-muted-foreground"><Pencil className="size-3.5" /></button>
                      <button onClick={() => remove(p.id)} className="size-7 grid place-items-center rounded hover:bg-muted text-destructive"><Trash2 className="size-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{editId ? "Edit Product" : "Add Product"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3">
              <div>
                <Label htmlFor="p-sku">SKU</Label>
                <Input
                  id="p-sku"
                  value={form.sku}
                  readOnly
                  placeholder={editId ? "" : "Auto-generated on save"}
                  className="font-mono bg-muted/40 cursor-not-allowed"
                />
              </div>
              <div>
                <Label htmlFor="p-cat">Category</Label>
                <div className="flex gap-1">
                <select
                  id="p-cat"
                  value={form.category}
                  onChange={(e) => {
                    const category = e.target.value as ProductCategory;
                    setForm((f) => ({
                      ...f,
                      category,
                      sku: editId ? f.sku : genSku(category, f.name),
                    }));
                  }}
                  className="flex-1 h-9 px-2.5 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                >
                  {editableCats.map((c) => (
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
              <div className="sm:col-span-2">
                <Label htmlFor="p-name">Product name</Label>
                <Input
                  id="p-name"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name,
                      sku: editId ? f.sku : genSku(f.category, name),
                    }));
                  }}
                  placeholder="Chocolate Truffle 1kg"
                />
              </div>
              <div>
                <Label htmlFor="p-price">Price (৳)</Label>
                <Input id="p-price" type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="p-stock">
                  {editId ? "Current stock" : "Opening stock"}
                </Label>
                <Input
                  id="p-stock"
                  type="number"
                  min={0}
                  value={form.stock}
                  readOnly={!!editId}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  className={editId ? "bg-muted/40 cursor-not-allowed" : ""}
                />
                {editId && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Adjusted automatically via purchases and sales.
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="p-threshold">Low-stock threshold</Label>
                <Input id="p-threshold" type="number" min={0} value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="p-shelf">Max validity from production (days)</Label>
                <Input
                  id="p-shelf"
                  type="number"
                  min={0}
                  value={form.shelfLifeDays}
                  onChange={(e) => setForm({ ...form, shelfLifeDays: e.target.value })}
                  placeholder="e.g. 7"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="p-image">Product image</Label>
                <div className="flex items-center gap-3">
                  {(imageFile || form.imageUrl) && (
                    <img
                      src={imageFile ? URL.createObjectURL(imageFile) : form.imageUrl}
                      alt=""
                      className="size-14 rounded object-cover border border-border"
                    />
                  )}
                  <Input
                    id="p-image"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <div className="sm:col-span-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <Label>Ingredients & Measurement</Label>
                  <button
                    type="button"
                    onClick={addIngredient}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-accent"
                  >
                    <Plus className="size-3" /> Add ingredient
                  </button>
                </div>
                {ingredients.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-2">
                    No ingredients. Add raw materials that will be deducted from stock per unit sold.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-auto">
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
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">{editId ? "Save" : "Add"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!labelFor} onOpenChange={(o) => !o && setLabelFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Print Barcode Labels</DialogTitle>
          </DialogHeader>
          {labelFor && (
            <div className="space-y-3 py-2">
              <div className="text-sm">
                <div className="font-medium">{labelFor.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{labelFor.sku}</div>
              </div>
              <div>
                <Label htmlFor="lbl-size">Label size</Label>
                <select
                  id="lbl-size"
                  value={labelSize}
                  onChange={(e) => setLabelSize(e.target.value as LabelSize)}
                  className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                >
                  <option value="38x25">Single 38mm × 25mm</option>
                  <option value="30x40">Single 30mm × 40mm</option>
                  <option value="A4-38x25">A4 sticker sheet · 38 × 25 mm</option>
                  <option value="A4-30x40">A4 sticker sheet · 30 × 40 mm</option>
                </select>
              </div>
              <div>
                <Label htmlFor="lbl-qty">Quantity</Label>
                <Input id="lbl-qty" type="number" min={1} value={labelQty} onChange={(e) => setLabelQty(Math.max(1, Number(e.target.value) || 1))} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tip: for thermal label printers pick a single size and set the same page size in your printer driver. For A4 use adhesive label sheets.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelFor(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!labelFor) return;
                printLabels(
                  {
                    sku: labelFor.sku,
                    name: labelFor.name,
                    price: labelFor.price,
                    mfgDate: labelFor.mfgDate,
                    expiryDate: labelFor.expiryDate,
                  },
                  labelQty,
                  labelSize,
                );
                setLabelFor(null);
              }}
            >
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}