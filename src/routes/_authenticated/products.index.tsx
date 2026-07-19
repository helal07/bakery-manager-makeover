import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { type ProductCategory, loadCategories, addCategory } from "@/lib/product-types";
import { Plus, Pencil, Trash2, QrCode, Search } from "lucide-react";
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
  removeProduct,
  type Product,
} from "@/lib/product-store";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { printLabels, type LabelSize } from "@/lib/print-labels";
import { pageTitle } from "@/lib/company-settings";

export const Route = createFileRoute("/_authenticated/products/")({
  head: () => ({ meta: [{ title: pageTitle("Products") }] }),
  component: Products,
});

function Products() {
  const { currentShowroomId } = useShowroomScope();
  const navigate = useNavigate();
  const [editableCats, setEditableCats] = useState<ProductCategory[]>([]);
  const cats = useMemo<string[]>(() => ["All", ...editableCats], [editableCats]);
  const [cat, setCat] = useState<string>("All");
  const [list, setList] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [labelFor, setLabelFor] = useState<Product | null>(null);
  const [labelSize, setLabelSize] = useState<LabelSize>("38x25");
  const [labelQty, setLabelQty] = useState(1);

  const refresh = async () => {
    try {
      const [ps, cs] = await Promise.all([
        loadProducts(currentShowroomId ?? null),
        loadCategories(),
      ]);
      setList(ps);
      setEditableCats(cs);
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

  // Legacy #new hash → redirect to dedicated Add page
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

  const promptAddCategory = async () => {
    const name = window.prompt("New category name")?.trim();
    if (!name) return;
    try {
      await addCategory(name);
      setEditableCats(await loadCategories());
      toast.success(`Added category "${name}"`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add category");
    }
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
            {loading && (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-muted-foreground">No products found</td></tr>
            )}
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
                      <button
                        onClick={() => navigate({ to: "/products/edit/$id", params: { id: p.id } })}
                        title="Edit product"
                        className="size-7 grid place-items-center rounded hover:bg-muted text-muted-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
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
