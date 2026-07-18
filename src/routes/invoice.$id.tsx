import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Share2, Printer, MapPin, Phone, User2 } from "lucide-react";
import { getCompany, defaultCompany, type CompanySettings } from "@/lib/company-settings";

const invoiceSearchSchema = z.object({
  c: z.string().optional(),
  d: z.string().optional(),
  b: z.string().optional(),
  i: z.coerce.number().optional(),
  t: z.coerce.number().optional(),
  p: z.coerce.number().optional(),
  ap: z.coerce.number().optional(),
});

export const Route = createFileRoute("/invoice/$id")({
  head: ({ params }) => ({ meta: [{ title: `Invoice #${params.id}` }] }),
  validateSearch: invoiceSearchSchema,
  component: InvoiceView,
});

type LineItem = { name: string; sku: string; price: number; qty: number };
type ShowroomInfo = {
  id?: string;
  name?: string;
  code?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  manager_name?: string | null;
};
type StoredInvoice = {
  customer: { name: string; phone?: string };
  branch: string;
  showroom?: ShowroomInfo | null;
  reference?: string;
  date: string;
  mode: "cash" | "due" | "partial";
  items: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  due: number;
};

function InvoiceView() {
  const { id } = useParams({ from: "/invoice/$id" });
  const s = useSearch({ from: "/invoice/$id" });

  const [stored, setStored] = useState<StoredInvoice | null>(null);
  const [company, setCompany] = useState<CompanySettings>(defaultCompany);
  const [paper, setPaper] = useState<"58mm" | "80mm" | "A4">("80mm");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`invoice:${id}`) ?? sessionStorage.getItem(`invoice:${id}`);
      if (raw) setStored(JSON.parse(raw) as StoredInvoice);
    } catch { /* ignore */ }
    getCompany().then(setCompany).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!s.ap) return;
    const t = setTimeout(() => { try { window.print(); } catch { /* ignore */ } }, 500);
    return () => clearTimeout(t);
  }, [s.ap]);

  const customerName = stored?.customer.name ?? s.c ?? "Walk-in Customer";
  const customerPhone = stored?.customer.phone ?? "";
  const showroom = stored?.showroom ?? null;
  const branch = showroom?.name ?? stored?.branch ?? s.b ?? "Main Branch";
  const reference = stored?.reference ?? `INV-${id.slice(0, 8).toUpperCase()}`;
  const dateObj = stored ? new Date(stored.date) : null;
  const date = dateObj ? dateObj.toLocaleString() : (s.d ?? "");
  const items: LineItem[] = stored?.items ?? [];
  const itemsCount = stored ? items.reduce((n, i) => n + i.qty, 0) : (s.i ?? 0);
  const subtotal = stored?.subtotal ?? (s.t ? +(s.t / 1.05).toFixed(2) : 0);
  const tax = stored?.tax ?? (s.t ? +(s.t - subtotal).toFixed(2) : 0);
  const total = stored?.total ?? (s.t ?? 0);
  const paid = stored?.paid ?? (s.p ?? 0);
  const due = Math.max(0, +(total - paid).toFixed(2));
  const mode = stored?.mode ?? "cash";

  // Prefer showroom contact info; fall back to company settings.
  const outletAddress = showroom?.address || company.address;
  const outletCity = showroom?.city || "";
  const outletPhone = showroom?.phone || company.phone || "";
  const manager = showroom?.manager_name || "";

  const modeBadge = useMemo(() => {
    if (mode === "cash") return { label: "PAID", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    if (mode === "partial") return { label: "PARTIAL", cls: "bg-amber-100 text-amber-900 border-amber-200" };
    return { label: "CREDIT", cls: "bg-rose-100 text-rose-800 border-rose-200" };
  }, [mode]);

  const print = () => window.print();
  const share = async () => {
    const url = window.location.href;
    const data = { title: `Invoice ${reference}`, text: `${reference} — ৳${total.toFixed(2)}`, url };
    try {
      if ((navigator as any).share) await (navigator as any).share(data);
      else { await navigator.clipboard.writeText(url); alert("Invoice link copied to clipboard"); }
    } catch { /* cancelled */ }
  };

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: ${paper === "A4" ? "A4" : paper + " auto"}; margin: ${paper === "A4" ? "10mm" : "0"}; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          .screen-invoice { display: ${paper === "A4" ? "block" : "none"} !important; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; max-width: 100% !important; }
          .print-receipt { display: ${paper === "A4" ? "none" : "block"} !important; }
          .print-hide { display: none !important; }
        }
        .print-receipt { display: none; }
      `}</style>

      {/* ============ A4 / SCREEN VIEW ============ */}
      <div className="screen-invoice max-w-3xl mx-auto bg-background rounded-xl border border-border shadow-sm overflow-hidden print:shadow-none">
        {/* Header band */}
        <div className="relative px-8 pt-8 pb-6 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-4 min-w-0">
              <div className="size-16 rounded-lg bg-primary-foreground/10 border border-primary-foreground/25 grid place-items-center overflow-hidden shrink-0">
                {company.logoDataUrl
                  ? <img src={company.logoDataUrl} alt={company.name} className="size-full object-cover" />
                  : <span className="text-xl font-bold">{company.name.slice(0, 2).toUpperCase()}</span>}
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold leading-tight truncate">{company.name}</h1>
                {company.tagline && <p className="text-xs opacity-85 mt-0.5">{company.tagline}</p>}
                {company.vatReg && <p className="text-[11px] opacity-75 mt-0.5">VAT Reg. {company.vatReg}</p>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-[0.15em] opacity-80">Invoice</div>
              <div className="text-2xl font-bold tabular-nums">{reference}</div>
              <div className={`mt-1.5 inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${modeBadge.cls}`}>
                {modeBadge.label}
              </div>
            </div>
          </div>
        </div>

        {/* Outlet + meta strip */}
        <div className="grid sm:grid-cols-3 gap-4 px-8 py-5 bg-muted/40 border-b border-border text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Outlet</div>
            <div className="font-semibold text-sm">{branch}</div>
            {showroom?.code && <div className="text-muted-foreground">Code: {showroom.code}</div>}
            {outletAddress && <div className="flex items-start gap-1 text-muted-foreground mt-1"><MapPin className="size-3 mt-0.5 shrink-0" /><span>{outletAddress}{outletCity ? `, ${outletCity}` : ""}</span></div>}
            {outletPhone && <div className="flex items-center gap-1 text-muted-foreground"><Phone className="size-3" /> {outletPhone}</div>}
            {manager && <div className="flex items-center gap-1 text-muted-foreground"><User2 className="size-3" /> {manager}</div>}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Billed to</div>
            <div className="font-semibold text-sm">{customerName}</div>
            {customerPhone && <div className="text-muted-foreground">{customerPhone}</div>}
          </div>
          <div className="sm:text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Details</div>
            <div><span className="text-muted-foreground">Date: </span><span className="font-medium">{date}</span></div>
            <div><span className="text-muted-foreground">Payment: </span><span className="font-medium capitalize">{mode}</span></div>
            <div><span className="text-muted-foreground">Items: </span><span className="font-medium">{itemsCount}</span></div>
          </div>
        </div>

        {/* Items */}
        <div className="px-8 py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="py-2 text-left font-medium w-8">#</th>
                <th className="py-2 text-left font-medium">Item</th>
                <th className="py-2 text-right font-medium w-16">Qty</th>
                <th className="py-2 text-right font-medium w-24">Price</th>
                <th className="py-2 text-right font-medium w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((it, idx) => (
                  <tr key={idx} className="border-b border-border/60 align-top">
                    <td className="py-3 text-muted-foreground tabular-nums">{idx + 1}</td>
                    <td className="py-3">
                      <div className="font-medium">{it.name}</div>
                      {it.sku && <div className="text-[11px] text-muted-foreground">SKU: {it.sku}</div>}
                    </td>
                    <td className="py-3 text-right tabular-nums">{it.qty}</td>
                    <td className="py-3 text-right tabular-nums">৳{it.price.toFixed(2)}</td>
                    <td className="py-3 text-right tabular-nums font-medium">৳{(it.price * it.qty).toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr className="border-b border-border/60">
                  <td className="py-3">—</td>
                  <td className="py-3">Sale items</td>
                  <td className="py-3 text-right">{itemsCount}</td>
                  <td className="py-3 text-right">—</td>
                  <td className="py-3 text-right">৳{subtotal.toFixed(2)}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-full sm:w-80 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">৳{subtotal.toFixed(2)}</span></div>
              {tax > 0 && <div className="flex justify-between"><span className="text-muted-foreground">VAT</span><span className="tabular-nums">৳{tax.toFixed(2)}</span></div>}
              <div className="flex justify-between text-base font-bold pt-2 mt-1 border-t border-border">
                <span>Grand Total</span><span className="tabular-nums">৳{total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="tabular-nums">৳{paid.toFixed(2)}</span></div>
              <div className={`flex justify-between font-semibold ${due > 0 ? "text-destructive" : "text-emerald-700"}`}>
                <span>Due</span><span className="tabular-nums">৳{due.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="mt-10 grid grid-cols-2 gap-8 text-xs text-muted-foreground">
            <div className="border-t border-dashed border-border pt-2 text-center">Received by (Customer)</div>
            <div className="border-t border-dashed border-border pt-2 text-center">Authorized by ({branch})</div>
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            {company.footerNote || "Thank you for your purchase."}
          </p>
        </div>

        {/* Controls (screen only) */}
        <div className="px-8 pb-6 space-y-3 print-hide">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Paper:</span>
            {(["58mm", "80mm", "A4"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPaper(p)}
                className={`px-3 py-1 rounded-full border text-xs font-medium transition ${paper === p ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={share} className="inline-flex flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-accent"><Share2 className="size-4" /> Share</button>
            <button onClick={print} className="inline-flex flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"><Printer className="size-4" /> Print</button>
          </div>
        </div>
      </div>

      {/* ============ THERMAL 58/80mm ============ */}
      <div
        className="print-receipt"
        style={{
          width: paper === "58mm" ? "54mm" : "72mm",
          padding: "3mm",
          margin: "0 auto",
          fontFamily: "'Courier New', ui-monospace, monospace",
          fontSize: paper === "58mm" ? "10px" : "11px",
          lineHeight: 1.35,
          color: "#000",
          background: "#fff",
        }}
      >
        <div style={{ textAlign: "center" }}>
          {company.logoDataUrl && (
            <img
              src={company.logoDataUrl}
              alt=""
              style={{ maxHeight: "12mm", maxWidth: "36mm", margin: "0 auto 3px", display: "block" }}
            />
          )}
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.3 }}>{company.name}</div>
          {company.tagline && <div style={{ fontSize: 10 }}>{company.tagline}</div>}
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        {/* Outlet block (per-showroom) */}
        <div style={{ textAlign: "center", fontSize: 10 }}>
          <div style={{ fontWeight: 700 }}>{branch}{showroom?.code ? ` · ${showroom.code}` : ""}</div>
          {outletAddress && <div>{outletAddress}{outletCity ? `, ${outletCity}` : ""}</div>}
          {outletPhone && <div>Tel: {outletPhone}</div>}
          {company.vatReg && <div>VAT: {company.vatReg}</div>}
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span>{reference}</span>
          <span style={{ textTransform: "uppercase" }}>{modeBadge.label}</span>
        </div>
        <div>{date}</div>
        <div>Customer: {customerName}{customerPhone ? ` · ${customerPhone}` : ""}</div>
        {manager && <div>Served by: {manager}</div>}

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px dashed #000" }}>
              <th style={{ textAlign: "left", paddingBottom: 2 }}>Item</th>
              <th style={{ textAlign: "right", width: "22%", paddingBottom: 2 }}>Qty×Rate</th>
              <th style={{ textAlign: "right", width: "26%", paddingBottom: 2 }}>Amt</th>
            </tr>
          </thead>
          <tbody>
            {(items.length > 0 ? items : [{ name: "Sale items", sku: "", qty: itemsCount, price: subtotal / Math.max(1, itemsCount) }]).map((it, i) => (
              <tr key={i}>
                <td style={{ verticalAlign: "top", paddingTop: 3 }}>
                  <div>{it.name}</div>
                  {it.sku && <div style={{ fontSize: 9, opacity: 0.75 }}>{it.sku}</div>}
                </td>
                <td style={{ textAlign: "right", paddingTop: 3 }}>{it.qty}×{it.price.toFixed(2)}</td>
                <td style={{ textAlign: "right", paddingTop: 3 }}>{(it.qty * it.price).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        {(
          [
            ["Subtotal", subtotal, false],
            ...(tax > 0 ? [["VAT", tax, false] as const] : []),
            ["TOTAL", total, true],
            ["Paid", paid, false],
            ["Due", due, true],
          ] as const
        ).map(([label, val, bold]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? 800 : 400, fontSize: bold ? 12 : 11 }}>
            <span>{label}</span>
            <span>৳{Number(val).toFixed(2)}</span>
          </div>
        ))}

        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
        <div style={{ textAlign: "center", fontSize: 10 }}>
          {company.footerNote || "Thank you for your purchase."}
        </div>
        <div style={{ textAlign: "center", fontSize: 9, marginTop: 4, opacity: 0.7 }}>
          Powered by {company.name}
        </div>
      </div>
    </div>
  );
}
