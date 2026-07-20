import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Card } from "@/components/app-shell";
import { getCompanyNameSync, buildDocTitle } from "@/lib/company-settings";
import { Printer, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

type Layout = "a4" | "roll";

export const Route = createFileRoute("/_authenticated/production/labels/$ledgerId")({
  head: () => ({ meta: [{ title: buildDocTitle("Print Labels") }] }),
  validateSearch: (s: Record<string, unknown>): { layout?: Layout; qty?: number } => ({
    layout: s.layout === "roll" ? "roll" : "a4",
    qty: s.qty ? Math.max(1, Math.min(500, Number(s.qty))) : undefined,
  }),
  component: LabelsPage,
});

type BatchInfo = {
  batchNo: string;
  productName: string;
  sku: string;
  price: number;
  mfgDate: string;
  expiryDate: string;
  qty: number;
};

function LabelsPage() {
  const { ledgerId } = Route.useParams();
  const search = useSearch({ from: "/_authenticated/production/labels/$ledgerId" });
  const [layout, setLayout] = useState<Layout>(search.layout ?? "a4");
  const [info, setInfo] = useState<BatchInfo | null>(null);
  const [count, setCount] = useState<number>(search.qty ?? 0);
  const [loading, setLoading] = useState(true);
  const company = getCompanyNameSync();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("stock_ledger")
        .select("id, qty, created_at, ref_id, product_id, products(name, sku, price, mfg_date, expiry_date)")
        .eq("id", ledgerId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error(error?.message ?? "Batch not found");
        setLoading(false);
        return;
      }
      const p = (data as { products?: { name?: string; sku?: string; price?: number; mfg_date?: string; expiry_date?: string } | null }).products ?? {};
      const qty = Math.max(0, Number(data.qty ?? 0));
      const batchRef = (data.ref_id as string | null) ?? (data.id as string);
      const built: BatchInfo = {
        batchNo: batchRef.slice(0, 8).toUpperCase(),
        productName: p.name ?? "—",
        sku: p.sku ?? "",
        price: Number(p.price ?? 0),
        mfgDate: (p.mfg_date ?? (data.created_at as string) ?? "").slice(0, 10),
        expiryDate: (p.expiry_date ?? "").slice(0, 10),
        qty,
      };
      setInfo(built);
      setCount((c) => (c > 0 ? c : Math.min(qty, 50)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ledgerId]);

  const labels = useMemo(() => Array.from({ length: Math.max(0, count) }, (_, i) => i), [count]);

  return (
    <AppShell
      title="Print Batch Labels"
      subtitle={info ? `${info.productName} · Batch ${info.batchNo}` : "Loading…"}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <Link to="/production/batches" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm hover:bg-muted">
            <ArrowLeft className="size-4" /> Back
          </Link>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
          >
            <Printer className="size-4" /> Print
          </button>
        </div>
      }
    >
      <Card className="p-4 mb-4 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Label layout</label>
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => setLayout("a4")}
                className={`flex-1 px-3 py-2 rounded-md border text-sm ${layout === "a4" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                A4 sticker sheet
              </button>
              <button
                onClick={() => setLayout("roll")}
                className={`flex-1 px-3 py-2 rounded-md border text-sm ${layout === "roll" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                38 × 25 mm roll
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
            {info && <div className="text-[11px] text-muted-foreground mt-1">Batch qty: {info.qty}</div>}
          </div>
          <div className="text-xs text-muted-foreground flex items-end">
            {layout === "a4"
              ? "A4 grid — 38×25 mm cells, print at 100% scale."
              : "Continuous 38×25 mm roll — one label per page."}
          </div>
        </div>
      </Card>

      {loading && <Card className="p-6 text-sm text-muted-foreground">Loading batch…</Card>}
      {!loading && info && count === 0 && (
        <Card className="p-6 text-sm text-muted-foreground print:hidden">Enter a number of labels above to preview.</Card>
      )}

      {!loading && info && count > 0 && (
        <div className={layout === "a4" ? "labels-a4" : "labels-roll"}>
          {labels.map((i) => (
            <LabelCell key={i} info={info} company={company} />
          ))}
        </div>
      )}

      <style>{`
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
          overflow: hidden;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        }
        .label-name { font-size: 8pt; font-weight: 700; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .label-meta { font-size: 6pt; line-height: 1.15; color: #334155; }
        .label-meta b { color: #0f172a; }
        .label-price { font-size: 9pt; font-weight: 800; }
        .label-barcode { width: 100%; height: 8mm; }
        .label-company { font-size: 5.5pt; text-align: center; color: #475569; letter-spacing: 0.2px; }
        @media print {
          @page { size: ${layout === "roll" ? "38mm 25mm" : "A4"}; margin: ${layout === "roll" ? "0" : "5mm"}; }
          .label-cell { border: none; }
          .labels-roll .label-cell { page-break-after: always; }
        }
      `}</style>
    </AppShell>
  );
}

function LabelCell({ info, company }: { info: BatchInfo; company: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, info.sku || info.batchNo, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 30,
        width: 1.2,
      });
    } catch {
      /* ignore */
    }
  }, [info.sku, info.batchNo]);

  return (
    <div className="label-cell">
      <div>
        <div className="label-name">{info.productName}</div>
        <div className="label-meta">
          <b>B:</b> {info.batchNo}
        </div>
        <div className="label-meta">
          <b>MFG:</b> {info.mfgDate || "—"} · <b>EXP:</b> {info.expiryDate || "—"}
        </div>
      </div>
      <div className="flex items-end justify-between gap-1">
        <svg ref={ref} className="label-barcode" />
        <div className="label-price">৳{info.price.toFixed(0)}</div>
      </div>
      <div className="label-company">{company}</div>
    </div>
  );
}
