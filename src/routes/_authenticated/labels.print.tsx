import { createFileRoute, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Card } from "@/components/app-shell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCompanyName, pageTitle } from "@/lib/company-settings";
import { Printer, ArrowLeft, Eye, X } from "lucide-react";
import { toast } from "sonner";
import { PermissionGate } from "@/components/permission-gate";

type Layout = "a4" | "roll";

type Search = { productId?: string; mfg?: string; exp?: string; qty?: number; layout?: Layout };

export const Route = createFileRoute("/_authenticated/labels/print")({
  head: () => ({ meta: [{ title: pageTitle("Print Labels") }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    productId: s.productId ? String(s.productId) : undefined,
    mfg: s.mfg ? String(s.mfg) : undefined,
    exp: s.exp ? String(s.exp) : undefined,
    qty: s.qty ? Math.max(1, Math.min(500, Number(s.qty))) : undefined,
    layout: s.layout === "roll" ? "roll" : "a4",
  }),
  component: () => (
    <PermissionGate anyOf={["products.view", "production.labels.print", "production.access"]} title="Print Labels">
      <PrintLabelsPage />
    </PermissionGate>
  ),
});

type Info = { productName: string; sku: string; price: number };

function PrintLabelsPage() {
  const search = useSearch({ from: "/_authenticated/labels/print" });
  const navigate = useNavigate();
  const router = useRouter();
  const company = getCompanyName();

  const [layout, setLayout] = useState<Layout>(search.layout ?? "a4");
  const [count, setCount] = useState<number>(search.qty ?? 12);
  const [mfgDate, setMfgDate] = useState<string>(search.mfg ?? new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState<string>(search.exp ?? "");
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(!!search.productId);

  useEffect(() => {
    if (!search.productId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select("name, sku, price")
        .eq("id", search.productId!)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error(error?.message ?? "Product not found");
        setLoading(false);
        return;
      }
      setInfo({ productName: data.name ?? "—", sku: (data as { sku?: string }).sku ?? "", price: Number(data.price ?? 0) });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [search.productId]);

  const labels = useMemo(() => Array.from({ length: Math.max(0, count) }, (_, i) => i), [count]);
  const [previewOpen, setPreviewOpen] = useState(false);

  const cell = info ? { ...info, mfgDate, expiryDate } : null;

  return (
    <AppShell
      title="Print Labels"
      subtitle={info ? `${info.productName} · expiry for print only (not saved)` : loading ? "Loading…" : "Select a product from the Products list"}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={() => (router.history.length > 1 ? router.history.back() : navigate({ to: "/products" }))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm hover:bg-muted"
          >
            <ArrowLeft className="size-4" /> Back
          </button>
          <button
            onClick={() => setPreviewOpen(true)}
            disabled={!cell || count === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            <Eye className="size-4" /> Preview & Print
          </button>
        </div>
      }
    >
      <Card className="p-4 mb-4 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Label layout</label>
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => setLayout("a4")}
                className={`flex-1 px-3 py-2 rounded-md border text-sm ${layout === "a4" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                A4 sheet
              </button>
              <button
                onClick={() => setLayout("roll")}
                className={`flex-1 px-3 py-2 rounded-md border text-sm ${layout === "roll" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                38 × 25 roll
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Number of labels</label>
            <input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(Math.max(0, Math.min(500, Number(e.target.value) || 0)))}
              className="mt-1 w-full h-9 rounded-md border px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Manufacture date</label>
            <input
              type="date"
              value={mfgDate}
              onChange={(e) => setMfgDate(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Expiry date (print only)</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border px-3 text-sm"
            />
            <div className="text-[11px] text-muted-foreground mt-1">Not saved to the product.</div>
          </div>
        </div>
      </Card>

      {loading && <Card className="p-6 text-sm text-muted-foreground print:hidden">Loading product…</Card>}
      {!loading && !info && (
        <Card className="p-6 text-sm text-muted-foreground print:hidden">
          Open this page from the Products list (Print labels action) to choose a product.
        </Card>
      )}
      {!loading && cell && count > 0 && (
        <Card className="p-4 print:hidden">
          <div className="text-xs text-muted-foreground mb-3">Inline preview (first {Math.min(count, 10)} of {count})</div>
          <div className={layout === "a4" ? "labels-a4" : "labels-roll"}>
            {labels.slice(0, 10).map((i) => (
              <LabelCell key={i} info={cell} company={company} />
            ))}
          </div>
        </Card>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden p-0 print:max-w-none print:max-h-none print:h-auto print:overflow-visible print:shadow-none print:border-0">
          <DialogHeader className="px-5 py-3 border-b flex-row items-center justify-between space-y-0 print:hidden">
            <DialogTitle className="text-sm">
              Print preview — {layout === "a4" ? "A4 sticker sheet" : "38 × 25 mm roll"} · {count} label{count !== 1 ? "s" : ""}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90"
              >
                <Printer className="size-3.5" /> Print now
              </button>
              <button
                onClick={() => setPreviewOpen(false)}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border text-xs hover:bg-muted"
              >
                <X className="size-3.5" /> Close
              </button>
            </div>
          </DialogHeader>
          <div className="overflow-auto bg-muted/40 p-6 print:bg-white print:p-0" style={{ maxHeight: "80vh" }}>
            {cell && (
              <div className="mx-auto bg-white shadow-sm print:shadow-none" style={{
                width: layout === "a4" ? "210mm" : "38mm",
                minHeight: layout === "a4" ? "297mm" : undefined,
                padding: layout === "a4" ? "5mm" : "0",
              }}>
                <div className={layout === "a4" ? "labels-a4" : "labels-roll"}>
                  {labels.map((i) => (
                    <LabelCell key={i} info={cell} company={company} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {cell && count > 0 && (
        <div className={`print-root ${layout === "a4" ? "print-root-a4" : "print-root-roll"}`} aria-hidden="true">
          <div className={layout === "a4" ? "labels-a4" : "labels-roll"}>
            {labels.map((i) => (
              <LabelCell key={i} info={cell} company={company} />
            ))}
          </div>
        </div>
      )}

      <style>{`
        .print-root { display: none; }
        .labels-a4 {
          display: grid;
          grid-template-columns: repeat(5, 38mm);
          grid-auto-rows: 25mm;
          gap: 2mm;
          justify-content: center;
        }
        .labels-roll {
          display: flex;
          flex-direction: column;
          gap: 2mm;
          align-items: center;
        }
        .label-cell {
          width: 38mm;
          height: 25mm;
          padding: 1.2mm 1.6mm;
          border: 1px dashed #cbd5e1;
          background: white;
          color: #0f172a;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: center;
          text-align: center;
          overflow: hidden;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        }
        .label-name { width: 100%; font-size: clamp(6pt, 2.2vw, 8.5pt); font-weight: 700; line-height: 1.05; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; hyphens: auto; }
        .label-meta { width: 100%; font-size: 6pt; line-height: 1.15; color: #334155; }
        .label-meta b { color: #0f172a; }
        .label-price { font-size: 8.5pt; font-weight: 800; }
        .label-barcode { width: 100%; height: 8mm; }
        .label-company { width: 100%; font-size: 5.5pt; text-align: center; color: #475569; letter-spacing: 0.2px; }
        @media print {
          @page { size: ${layout === "roll" ? "38mm 25mm" : "A4"}; margin: ${layout === "roll" ? "0" : "5mm"}; }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          body * { visibility: hidden !important; }
          .print-root, .print-root * { visibility: visible !important; }
          .print-root {
            display: block !important;
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            z-index: 2147483647 !important;
          }
          .print-root-a4 .labels-a4 { justify-content: center; align-content: start; }
          .print-root-roll { width: 38mm !important; }
          .label-cell { border: none; }
          .labels-roll .label-cell { break-after: page; page-break-after: always; }
          .labels-roll .label-cell:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
    </AppShell>
  );
}

function LabelCell({
  info,
  company,
}: {
  info: { productName: string; sku: string; price: number; mfgDate: string; expiryDate: string };
  company: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, info.sku || info.productName, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 30,
        width: 1.2,
      });
    } catch {
      /* ignore */
    }
  }, [info.sku, info.productName]);

  return (
    <div className="label-cell">
      <div className="w-full">
        <div className="label-name">{info.productName}</div>
        <div className="label-meta">
          <b>MFG:</b> {info.mfgDate || "—"} · <b>EXP:</b> {info.expiryDate || "—"}
        </div>
      </div>
      <div className="label-price">MRP: ৳{info.price.toFixed(2)}</div>
      <svg ref={ref} className="label-barcode" />
      <div className="label-company">{company ? `${company} · ` : ""}www.muzahidfood.com</div>
    </div>
  );
}
