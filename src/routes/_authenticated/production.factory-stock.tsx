import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell, Card } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Boxes, Factory, FileSpreadsheet, PackagePlus, Printer, Search, Sliders } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadRawMaterials, type RawMaterial } from "@/lib/raw-material-store";
import { PermissionGate } from "@/components/permission-gate";
import { pageTitle, getCompany, defaultCompany, type CompanySettings } from "@/lib/company-settings";
import { exportStockXlsx, printStockReport, type StockExportColumn } from "@/lib/stock-report-export";

export const Route = createFileRoute("/_authenticated/production/factory-stock")({
  head: () => ({ meta: [{ title: pageTitle("Factory Stock") }] }),
  component: () => (
    <PermissionGate anyOf={["production.access", "inventory.view"]} title="Factory Stock">
      <FactoryStockPage />
    </PermissionGate>
  ),
});

const sb = supabase as any;

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  price: number | null;
  cost: number | null;
  quantity: number;
};

function FactoryStockPage() {
  const [raw, setRaw] = useState<RawMaterial[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [company, setCompany] = useState<CompanySettings>(defaultCompany);

  useEffect(() => { getCompany().then(setCompany).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Factory = showroom_id IS NULL
      const [mats, prodStock, prodMeta] = await Promise.all([
        loadRawMaterials(null),
        sb.from("product_stock").select("product_id,quantity").is("showroom_id", null),
        sb.from("products").select("id,name,sku,unit,price,cost").eq("is_active", true),
      ]);
      if (prodStock.error) throw prodStock.error;
      if (prodMeta.error) throw prodMeta.error;
      const qtyMap = new Map<string, number>();
      for (const r of (prodStock.data ?? []) as any[]) qtyMap.set(r.product_id, Number(r.quantity ?? 0));
      const list: ProductRow[] = ((prodMeta.data ?? []) as any[]).map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        price: p.price != null ? Number(p.price) : null,
        cost: p.cost != null ? Number(p.cost) : null,
        quantity: qtyMap.get(p.id) ?? 0,
      })).sort((a, b) => a.name.localeCompare(b.name));
      setRaw(mats);
      setProducts(list);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load factory stock");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rawTotals = useMemo(() => ({
    items: raw.length,
    value: raw.reduce((a, r) => a + r.stock * r.cost, 0),
    low: raw.filter((r) => r.threshold > 0 && r.stock <= r.threshold && r.stock > 0).length,
    out: raw.filter((r) => r.stock <= 0).length,
  }), [raw]);

  const prodTotals = useMemo(() => ({
    items: products.length,
    inStock: products.filter((p) => p.quantity > 0).length,
    valueRetail: products.reduce((a, p) => a + p.quantity * (p.price ?? 0), 0),
    valueCost: products.reduce((a, p) => a + p.quantity * (p.cost ?? 0), 0),
  }), [products]);

  const filteredRaw = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? raw.filter((r) => r.name.toLowerCase().includes(s) || r.unit.toLowerCase().includes(s)) : raw;
  }, [raw, q]);
  const filteredProducts = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? products.filter((p) => p.name.toLowerCase().includes(s) || (p.sku ?? "").toLowerCase().includes(s)) : products;
  }, [products, q]);

  const prodReport = useCallback(() => {
    const columns: StockExportColumn[] = [
      { key: "name", label: "Product" },
      { key: "sku", label: "SKU" },
      { key: "unit", label: "Unit" },
      { key: "qty", label: "Qty", align: "right" },
      { key: "cost", label: "Cost", align: "right" },
      { key: "price", label: "Price", align: "right" },
      { key: "value", label: "Value (retail)", align: "right" },
    ];
    const rows = filteredProducts.map((p) => ({
      name: p.name,
      sku: p.sku ?? "—",
      unit: p.unit ?? "",
      qty: p.quantity,
      cost: Number((p.cost ?? 0).toFixed(2)),
      price: Number((p.price ?? 0).toFixed(2)),
      value: Number((p.quantity * (p.price ?? 0)).toFixed(2)),
    }));
    const totals = {
      qty: rows.reduce((a, r) => a + r.qty, 0),
      value: Number(rows.reduce((a, r) => a + r.value, 0).toFixed(2)),
    };
    return { title: "Finished Products Stock", columns, rows, totals };
  }, [filteredProducts]);

  const rawReport = useCallback(() => {
    const columns: StockExportColumn[] = [
      { key: "name", label: "Material" },
      { key: "unit", label: "Unit" },
      { key: "qty", label: "Qty", align: "right" },
      { key: "cost", label: "Cost", align: "right" },
      { key: "value", label: "Value", align: "right" },
    ];
    const rows = filteredRaw.map((r) => ({
      name: r.name,
      unit: r.unit,
      qty: r.stock,
      cost: Number(r.cost.toFixed(2)),
      value: Number((r.stock * r.cost).toFixed(2)),
    }));
    const totals = {
      qty: rows.reduce((a, r) => a + r.qty, 0),
      value: Number(rows.reduce((a, r) => a + r.value, 0).toFixed(2)),
    };
    return { title: "Raw Materials Stock", columns, rows, totals };
  }, [filteredRaw]);

  const doPrint = (r: ReturnType<typeof rawReport>) => {
    if (r.rows.length === 0) return toast.error("Nothing to print");
    const ok = printStockReport({ title: r.title, company, columns: r.columns, rows: r.rows, totals: r.totals, totalsLabel: "Total" });
    if (!ok) toast.error("Popup blocked — allow popups to print");
  };
  const doXlsx = (r: ReturnType<typeof rawReport>) => {
    if (r.rows.length === 0) return toast.error("Nothing to export");
    exportStockXlsx({
      fileName: `${r.title.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: r.title,
      title: r.title,
      company,
      columns: r.columns,
      rows: r.rows,
      totals: r.totals,
      totalsLabel: "Total",
    });
  };

  const Toolbar = ({ build }: { build: () => ReturnType<typeof rawReport> }) => (
    <div className="flex flex-wrap gap-2 justify-end">
      <Button variant="outline" size="sm" onClick={() => doPrint(build())}>
        <Printer className="w-4 h-4 mr-2" /> Print / PDF (A4)
      </Button>
      <Button variant="outline" size="sm" onClick={() => doXlsx(build())}>
        <FileSpreadsheet className="w-4 h-4 mr-2" /> Export XLSX
      </Button>
    </div>
  );

  return (
    <AppShell
      title="Factory Stock"
      subtitle="On-hand raw materials & finished products at the factory"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/transfers/new"><Factory className="w-4 h-4 mr-2" /> Transfer to Showroom</Link>
        </Button>
      }
    >
      <div className="flex justify-end mb-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Tabs defaultValue="products" className="w-full">
        <TabsList>
          <TabsTrigger value="products">Finished Products</TabsTrigger>
          <TabsTrigger value="raw">Raw Materials</TabsTrigger>
        </TabsList>

        <TabsContent value="raw" className="mt-4 space-y-4">
          <Toolbar build={rawReport} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat icon={<Boxes className="w-4 h-4" />} label="Ingredients" value={rawTotals.items.toString()} />
            <Stat icon={<PackagePlus className="w-4 h-4" />} label="Stock value" value={`৳${rawTotals.value.toFixed(0)}`} />
            <Stat icon={<Sliders className="w-4 h-4" />} label="Low stock" value={rawTotals.low.toString()} tone={rawTotals.low ? "warn" : undefined} />
            <Stat icon={<Sliders className="w-4 h-4" />} label="Out of stock" value={rawTotals.out.toString()} tone={rawTotals.out ? "warn" : undefined} />
          </div>
          <Card>
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : filteredRaw.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No raw materials.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Unit</th>
                      <th className="py-2 px-3 text-right">Qty</th>
                      <th className="py-2 px-3 text-right">Cost</th>
                      <th className="py-2 px-3 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRaw.map((r) => {
                      const out = r.stock <= 0;
                      const low = !out && r.threshold > 0 && r.stock <= r.threshold;
                      return (
                        <tr key={r.id} className={`border-b hover:bg-muted/40 ${out ? "bg-destructive/5" : low ? "bg-amber-500/5" : ""}`}>
                          <td className="py-2 px-3 font-medium">{r.name}</td>
                          <td className="py-2 px-3 text-muted-foreground">{r.unit}</td>
                          <td className={`py-2 px-3 text-right tabular-nums ${out ? "text-destructive font-semibold" : low ? "text-amber-600 font-semibold" : ""}`}>
                            {r.stock}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">৳{r.cost.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold">৳{(r.stock * r.cost).toFixed(0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold bg-muted/40">
                      <td className="py-2 px-3" colSpan={4}>Total</td>
                      <td className="py-2 px-3 text-right tabular-nums">৳{rawTotals.value.toFixed(0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="products" className="mt-4 space-y-4">
          <Toolbar build={prodReport} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat icon={<Boxes className="w-4 h-4" />} label="Products" value={prodTotals.items.toString()} />
            <Stat icon={<PackagePlus className="w-4 h-4" />} label="With stock" value={prodTotals.inStock.toString()} />
            <Stat icon={<PackagePlus className="w-4 h-4" />} label="Value (cost)" value={`৳${prodTotals.valueCost.toFixed(0)}`} />
            <Stat icon={<PackagePlus className="w-4 h-4" />} label="Value (retail)" value={`৳${prodTotals.valueRetail.toFixed(0)}`} />
          </div>
          <Card>
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : filteredProducts.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No products.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 px-3">Product</th>
                      <th className="py-2 px-3">SKU</th>
                      <th className="py-2 px-3">Unit</th>
                      <th className="py-2 px-3 text-right">Qty</th>
                      <th className="py-2 px-3 text-right">Cost</th>
                      <th className="py-2 px-3 text-right">Price</th>
                      <th className="py-2 px-3 text-right">Value (retail)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => (
                      <tr key={p.id} className={`border-b hover:bg-muted/40 ${p.quantity <= 0 ? "text-muted-foreground" : ""}`}>
                        <td className="py-2 px-3 font-medium">{p.name}</td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">{p.sku ?? "—"}</td>
                        <td className="py-2 px-3 text-muted-foreground">{p.unit}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold">{p.quantity}</td>
                        <td className="py-2 px-3 text-right tabular-nums">৳{(p.cost ?? 0).toFixed(2)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">৳{(p.price ?? 0).toFixed(2)}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold">৳{(p.quantity * (p.price ?? 0)).toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold bg-muted/40">
                      <td className="py-2 px-3" colSpan={6}>Total</td>
                      <td className="py-2 px-3 text-right tabular-nums">৳{prodTotals.valueRetail.toFixed(0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "warn" }) {
  return (
    <Card>
      <div className="flex items-center gap-3 p-3">
        <div className={`w-9 h-9 rounded-md grid place-items-center ${tone === "warn" ? "bg-amber-500/15 text-amber-600" : "bg-primary/10 text-primary"}`}>
          {icon}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold tabular-nums">{value}</div>
        </div>
      </div>
    </Card>
  );
}
