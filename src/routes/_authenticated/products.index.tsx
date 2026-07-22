import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { type ProductCategory, loadCategories, addCategory } from "@/lib/product-types";
import {
  Plus,
  Pencil,
  Trash2,
  QrCode,
  Search,
  Filter,
  ChevronDown,
  FileText,
  FileSpreadsheet,
  Printer,
  Columns3,
  Download,
  MoreHorizontal,
  Eye,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

type FilterState = {
  productType: string;
  category: string;
  unit: string;
  businessLocation: string;
  notForSelling: boolean;
};

const DEFAULT_FILTERS: FilterState = {
  productType: "All",
  category: "All",
  unit: "All",
  businessLocation: "All",
  notForSelling: false,
};

function Products() {
  const { currentShowroomId, showrooms } = useShowroomScope();
  const navigate = useNavigate();
  const [editableCats, setEditableCats] = useState<ProductCategory[]>([]);
  const [list, setList] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [tab, setTab] = useState<"products" | "stock">("products");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionOpen, setActionOpen] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  const [labelFor, setLabelFor] = useState<Product | null>(null);
  const [labelSize, setLabelSize] = useState<LabelSize>("38x25");
  const [labelQty, setLabelQty] = useState(1);

  const effectiveShowroomId = useMemo(() => {
    if (filters.businessLocation === "All") return currentShowroomId ?? null;
    const match = showrooms.find((s) => s.name === filters.businessLocation);
    return match?.id ?? currentShowroomId ?? null;
  }, [filters.businessLocation, showrooms, currentShowroomId]);

  const refresh = async () => {
    try {
      const [ps, cs] = await Promise.all([
        loadProducts(effectiveShowroomId, { includeInactive: filters.notForSelling }),
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
  }, [effectiveShowroomId, filters.notForSelling]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#new") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      navigate({ to: "/products/new" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!actionMenuRef.current) return;
      if (!actionMenuRef.current.contains(e.target as Node)) setActionOpen(null);
    }
    if (actionOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [actionOpen]);

  const currentShowroomName = useMemo(() => {
    if (!effectiveShowroomId) return "All Locations";
    return showrooms.find((s) => s.id === effectiveShowroomId)?.name ?? "All Locations";
  }, [effectiveShowroomId, showrooms]);

  const unitOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of list) if (p.unit) set.add(p.unit);
    return ["All", ...Array.from(set).sort()];
  }, [list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((p) => {
      if (filters.category !== "All" && p.category !== filters.category) return false;
      if (filters.unit !== "All" && (p.unit ?? "") !== filters.unit) return false;
      if (filters.productType === "Variable") return false; // no variants in schema yet
      if (filters.notForSelling && p.isActive !== false) return false;
      if (q && !(p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [list, filters, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [query, filters, pageSize]);

  const toggleAll = () => {
    if (selected.size === pageRows.length && pageRows.length > 0) setSelected(new Set());
    else setSelected(new Set(pageRows.map((p) => p.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

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

  const exportCSV = () => {
    const headers = [
      "SKU","Product","Category","Business Location","Unit Purchase Price","Selling Price","Current Stock","Product Type",
    ];
    const rows = filtered.map((p) => [
      p.sku, p.name, p.category, currentShowroomName, p.cost.toFixed(2), p.price.toFixed(2), p.stock, "Single",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const printList = () => window.print();

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  return (
    <AppShell title="Products" subtitle="Manage your products">
      {/* Filters Card */}
      <Card className="mb-5 overflow-hidden border-l-[3px] border-l-primary">
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20"
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <span className="size-7 grid place-items-center rounded-full bg-primary/10 text-primary">
              <Filter className="size-3.5" />
            </span>
            Filters
          </span>
          <ChevronDown className={`size-4 text-muted-foreground transition-transform ${filtersOpen ? "" : "-rotate-90"}`} />
        </button>
        {filtersOpen && (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FilterSelect
              label="Product Type:"
              value={filters.productType}
              options={["All", "Single", "Variable"]}
              onChange={(v) => setFilters({ ...filters, productType: v })}
            />
            <FilterSelect
              label="Category:"
              value={filters.category}
              options={["All", ...editableCats]}
              onChange={(v) => setFilters({ ...filters, category: v })}
            />
            <FilterSelect
              label="Unit:"
              value={filters.unit}
              options={unitOptions}
              onChange={(v) => setFilters({ ...filters, unit: v })}
            />
            <FilterSelect
              label="Business Location:"
              value={filters.businessLocation}
              options={["All", ...showrooms.map((s) => s.name)]}
              onChange={(v) => setFilters({ ...filters, businessLocation: v })}
            />
            <div className="flex items-end gap-3">
              <label className="inline-flex items-center gap-2 text-sm h-9">
                <input
                  type="checkbox"
                  checked={filters.notForSelling}
                  onChange={(e) => setFilters({ ...filters, notForSelling: e.target.checked })}
                  className="size-4 rounded border-input"
                />
                Not for selling
              </label>
            </div>
            <div className="flex items-end">
              <Button variant="outline" size="sm" onClick={resetFilters}>Reset</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Table Card */}
      <Card className="overflow-hidden">
        {/* Tabs */}
        <div className="border-b border-border px-4 pt-2 flex items-center gap-1">
          <TabBtn active={tab === "products"} onClick={() => setTab("products")} icon="📦" label="All Products" />
          <TabBtn active={tab === "stock"} onClick={() => setTab("stock")} icon="⏳" label="Stock Report" />
        </div>

        {tab === "products" && (
          <div className="p-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-8 px-2 rounded-md border border-input bg-background text-sm"
                >
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span>entries</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <ToolBtn onClick={exportCSV} icon={<FileText className="size-3.5" />}>Export CSV</ToolBtn>
                <ToolBtn onClick={exportCSV} icon={<FileSpreadsheet className="size-3.5" />}>Export Excel</ToolBtn>
                <ToolBtn onClick={printList} icon={<Printer className="size-3.5" />}>Print</ToolBtn>
                <ToolBtn icon={<Columns3 className="size-3.5" />}>Column visibility</ToolBtn>
                <ToolBtn icon={<FileText className="size-3.5" />}>Export PDF ▾</ToolBtn>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  to="/products/new"
                  className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shadow-sm"
                >
                  <Plus className="size-4" /> Add
                </Link>
                <button
                  onClick={exportCSV}
                  className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shadow-sm"
                >
                  <Download className="size-4" /> Download Excel
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <button
                onClick={promptAddCategory}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <Plus className="size-3" /> Add category
              </button>
              <div className="relative w-full sm:w-64">
                <label className="text-xs text-muted-foreground mr-2">Search:</label>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-8 px-3 rounded-md border border-input bg-background text-sm w-48 outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="text-xs text-foreground bg-muted/40">
                  <tr>
                    <th className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={pageRows.length > 0 && selected.size === pageRows.length}
                        onChange={toggleAll}
                        className="size-4 rounded border-input"
                      />
                    </th>
                    <th className="text-left font-semibold px-3 py-3">Product image</th>
                    <th className="text-left font-semibold px-3 py-3">Action</th>
                    <Th>Product</Th>
                    <Th>Business Location</Th>
                    <Th>Unit Purchase Price</Th>
                    <Th>Selling Price</Th>
                    <Th>Current stock</Th>
                    <Th>Product Type</Th>
                    <Th>Category</Th>
                    <Th>Brand</Th>
                    <Th>Tax</Th>
                    <Th>SKU</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading && (
                    <tr><td colSpan={13} className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</td></tr>
                  )}
                  {!loading && pageRows.length === 0 && (
                    <tr><td colSpan={13} className="px-5 py-8 text-center text-sm text-muted-foreground">No products found</td></tr>
                  )}
                  {pageRows.map((p) => {
                    const low = p.stock < p.threshold;
                    return (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(p.id)}
                            onChange={() => toggleOne(p.id)}
                            className="size-4 rounded border-input"
                          />
                        </td>
                        <td className="px-3 py-3">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt="" className="size-10 rounded object-cover border border-border" />
                          ) : (
                            <div className="size-10 rounded bg-muted grid place-items-center text-muted-foreground text-[10px]">IMG</div>
                          )}
                        </td>
                        <td className="px-3 py-3 relative">
                          <button
                            onClick={() => setActionOpen(actionOpen === p.id ? null : p.id)}
                            className="inline-flex items-center gap-1 px-3 h-7 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
                          >
                            Actions <ChevronDown className="size-3" />
                          </button>
                          {actionOpen === p.id && (
                            <div
                              ref={actionMenuRef}
                              className="absolute z-20 left-3 top-11 w-44 rounded-md border border-border bg-popover shadow-lg py-1 text-sm"
                            >
                              <ActionItem
                                icon={<Pencil className="size-3.5" />}
                                onClick={() => { setActionOpen(null); navigate({ to: "/products/edit/$id", params: { id: p.id } }); }}
                              >Edit</ActionItem>
                              <ActionItem
                                icon={<QrCode className="size-3.5" />}
                                onClick={() => { setActionOpen(null); setLabelFor(p); setLabelQty(1); }}
                              >Labels</ActionItem>
                              <ActionItem
                                icon={<Eye className="size-3.5" />}
                                onClick={() => { setActionOpen(null); navigate({ to: "/products/edit/$id", params: { id: p.id } }); }}
                              >View</ActionItem>
                              <div className="h-px bg-border my-1" />
                              <ActionItem
                                danger
                                icon={<Trash2 className="size-3.5" />}
                                onClick={() => { setActionOpen(null); remove(p.id); }}
                              >Delete</ActionItem>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 font-medium">{p.name}</td>
                        <td className="px-3 py-3">{currentShowroomName}</td>
                        <td className="px-3 py-3">৳ {p.cost.toFixed(2)}</td>
                        <td className="px-3 py-3">৳ {p.price.toFixed(2)}</td>
                        <td className="px-3 py-3">
                          <span className={low ? "text-destructive font-medium" : ""}>{p.stock} Pieces</span>
                        </td>
                        <td className="px-3 py-3">Single</td>
                        <td className="px-3 py-3"><Badge tone="primary">{p.category}</Badge></td>
                        <td className="px-3 py-3 text-muted-foreground">—</td>
                        <td className="px-3 py-3 text-muted-foreground">—</td>
                        <td className="px-3 py-3 font-mono text-xs">{p.sku}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <div>
                Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1} to{" "}
                {Math.min(page * pageSize, filtered.length)} of {filtered.length} entries
              </div>
              <div className="inline-flex items-center gap-1">
                <PageBtn onClick={() => setPage(1)} disabled={page === 1}>First</PageBtn>
                <PageBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</PageBtn>
                <span className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs">{page}</span>
                <PageBtn onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</PageBtn>
                <PageBtn onClick={() => setPage(totalPages)} disabled={page === totalPages}>Last</PageBtn>
              </div>
            </div>
          </div>
        )}

        {tab === "stock" && (
          <StockReportPanel
            rows={filtered}
            loading={loading}
            locationName={currentShowroomName}
            onExport={() => {
              const headers = ["SKU", "Product", "Category", "Location", "Unit Price", "Selling Price", "Current Stock", "Stock Value", "Potential Revenue"];
              const csvRows = filtered.map((p) => [
                p.sku, p.name, p.category, currentShowroomName,
                p.cost.toFixed(2), p.price.toFixed(2), p.stock,
                (p.stock * p.cost).toFixed(2), (p.stock * p.price).toFixed(2),
              ]);
              const csv = [headers, ...csvRows]
                .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
                .join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "stock-report.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
            onPrint={() => window.print()}
          />
        )}
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
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelFor(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!labelFor) return;
                printLabels(
                  { sku: labelFor.sku, name: labelFor.name, price: labelFor.price, mfgDate: labelFor.mfgDate, expiryDate: labelFor.expiryDate },
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">
      <span className="inline-flex items-center gap-1">{children}<span className="text-muted-foreground/60">↕</span></span>
    </th>
  );
}

function StockReportPanel({
  rows,
  loading,
  locationName,
  onExport,
  onPrint,
}: {
  rows: Product[];
  loading: boolean;
  locationName: string;
  onExport: () => void;
  onPrint: () => void;
}) {
  const totals = rows.reduce(
    (acc, p) => {
      acc.units += p.stock;
      acc.value += p.stock * p.cost;
      acc.revenue += p.stock * p.price;
      if (p.stock <= 0) acc.out += 1;
      else if (p.stock < p.threshold) acc.low += 1;
      return acc;
    },
    { units: 0, value: 0, revenue: 0, low: 0, out: 0 },
  );

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="text-sm text-muted-foreground">
          Stock report for <span className="font-medium text-foreground">{locationName}</span> — reflects current filters.
        </div>
        <div className="flex items-center gap-2">
          <ToolBtn onClick={onExport} icon={<FileText className="size-3.5" />}>Export CSV</ToolBtn>
          <ToolBtn onClick={onPrint} icon={<Printer className="size-3.5" />}>Print</ToolBtn>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <KpiTile label="Line items" value={rows.length.toLocaleString()} />
        <KpiTile label="Total units" value={totals.units.toLocaleString()} />
        <KpiTile label="Stock value" value={`৳${totals.value.toFixed(0)}`} />
        <KpiTile label="Potential revenue" value={`৳${totals.revenue.toFixed(0)}`} />
        <KpiTile label="Low / Out" value={`${totals.low} / ${totals.out}`} tone={totals.low || totals.out ? "warn" : "default"} />
      </div>

      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-xs bg-muted/40">
            <tr>
              <th className="text-left font-semibold px-3 py-3">SKU</th>
              <th className="text-left font-semibold px-3 py-3">Product</th>
              <th className="text-left font-semibold px-3 py-3">Category</th>
              <th className="text-right font-semibold px-3 py-3">Unit Price</th>
              <th className="text-right font-semibold px-3 py-3">Selling Price</th>
              <th className="text-right font-semibold px-3 py-3">Stock</th>
              <th className="text-right font-semibold px-3 py-3">Threshold</th>
              <th className="text-right font-semibold px-3 py-3">Stock Value</th>
              <th className="text-right font-semibold px-3 py-3">Potential Revenue</th>
              <th className="text-left font-semibold px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr><td colSpan={10} className="px-5 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={10} className="px-5 py-8 text-center text-muted-foreground">No products match the current filters.</td></tr>
            )}
            {rows.map((p) => {
              const out = p.stock <= 0;
              const low = !out && p.stock < p.threshold;
              return (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-mono text-xs">{p.sku || "—"}</td>
                  <td className="px-3 py-2.5 font-medium">{p.name}</td>
                  <td className="px-3 py-2.5"><Badge tone="primary">{p.category}</Badge></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">৳{p.cost.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">৳{p.price.toFixed(2)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${out ? "text-destructive font-semibold" : low ? "text-destructive" : ""}`}>{p.stock}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{p.threshold}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">৳{(p.stock * p.cost).toFixed(0)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">৳{(p.stock * p.price).toFixed(0)}</td>
                  <td className="px-3 py-2.5">
                    {out ? <Badge tone="danger">Out</Badge> : low ? <Badge tone="warning">Low</Badge> : <Badge tone="success">OK</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-muted/30 text-sm font-semibold">
              <tr>
                <td className="px-3 py-2.5" colSpan={5}>Totals</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{totals.units.toLocaleString()}</td>
                <td></td>
                <td className="px-3 py-2.5 text-right tabular-nums">৳{totals.value.toFixed(0)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">৳{totals.revenue.toFixed(0)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function KpiTile({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 tabular-nums ${tone === "warn" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm border-b-2 -mb-px inline-flex items-center gap-2 ${
        active ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <span>{icon}</span>{label}
    </button>
  );
}

function ToolBtn({ onClick, icon, children }: { onClick?: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-border bg-card text-xs font-medium hover:bg-muted"
    >
      {icon}{children}
    </button>
  );
}

function PageBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1 rounded border border-border text-xs hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function ActionItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-1.5 text-left inline-flex items-center gap-2 hover:bg-muted ${
        danger ? "text-destructive" : ""
      }`}
    >
      {icon}{children}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-10 pl-3 pr-9 rounded-md border border-input bg-background text-sm outline-none focus:border-primary appearance-none"
        >
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown className="size-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}

// Silence unused import warning for MoreHorizontal / Search if tree-shaken
void MoreHorizontal;
void Search;
