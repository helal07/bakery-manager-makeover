import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Share2, Printer } from "lucide-react";
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
  head: ({ params }) => ({ meta: [{ title: `Invoice #${params.id} · Crumb & Co.` }] }),
  validateSearch: invoiceSearchSchema,
  component: InvoiceView,
});

function InvoiceView() {
  const { id } = useParams({ from: "/invoice/$id" });
  const s = useSearch({ from: "/invoice/$id" });

  type LineItem = { name: string; sku: string; price: number; qty: number };
  type StoredInvoice = {
    customer: { name: string; phone?: string };
    branch: string;
    date: string;
    mode: "cash" | "due" | "partial";
    items: LineItem[];
    subtotal: number;
    tax: number;
    total: number;
    paid: number;
    due: number;
  };

  const [stored, setStored] = useState<StoredInvoice | null>(null);
  const [company, setCompany] = useState<CompanySettings>(defaultCompany);
  const [paper, setPaper] = useState<"58mm" | "80mm" | "A4">("80mm");
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`invoice:${id}`);
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
  const branch = stored?.branch ?? s.b ?? "Main Branch";
  const date = stored ? new Date(stored.date).toLocaleString() : (s.d ?? "");
  const items: LineItem[] = stored?.items ?? [];
  const itemsCount = stored ? items.reduce((n, i) => n + i.qty, 0) : (s.i ?? 0);
  const subtotal = stored?.subtotal ?? (s.t ? +(s.t / 1.05).toFixed(2) : 0);
  const tax = stored?.tax ?? (s.t ? +(s.t - subtotal).toFixed(2) : 0);
  const total = stored?.total ?? (s.t ?? 0);
  const paid = stored?.paid ?? (s.p ?? 0);
  const due = Math.max(0, +(total - paid).toFixed(2));
  const mode = stored?.mode;

  const print = () => window.print();
  const share = async () => {
    const url = window.location.href;
    const data = { title: `Invoice #${id}`, text: `Invoice #${id} — ৳${total.toFixed(2)}`, url };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(url); alert("Invoice link copied to clipboard"); }
    } catch { /* cancelled */ }
  };

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4 print:bg-white print:p-0">
      {/* Print styles — thermal 58/80mm or A4 */}
      <style>{`
        @media print {
          @page { size: ${paper === "A4" ? "A4" : paper + " auto"}; margin: ${paper === "A4" ? "12mm" : "0"}; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          .screen-invoice { display: ${paper === "A4" ? "block" : "none"} !important; }
          .print-receipt { display: ${paper === "A4" ? "none" : "block"} !important; }
          .print-hide { display: none !important; }
        }
        .print-receipt { display: none; }
      `}</style>

      {/* Screen view */}
      <div className="screen-invoice max-w-2xl mx-auto bg-background rounded-lg border border-border shadow-sm overflow-hidden">
        {/* Branded header */}
        <div className="bg-primary text-primary-foreground px-6 sm:px-8 py-6 print:bg-primary">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-14 rounded-md bg-primary-foreground/10 border border-primary-foreground/20 grid place-items-center overflow-hidden shrink-0">
                {company.logoDataUrl
                  ? <img src={company.logoDataUrl} alt={company.name} className="size-full object-cover" />
                  : <span className="text-lg font-bold">{company.name.slice(0, 2).toUpperCase()}</span>}
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold leading-tight truncate">{company.name}</h1>
                {company.tagline && <p className="text-xs opacity-80">{company.tagline}</p>}
              </div>
            </div>
            <div className="text-right text-sm shrink-0">
              <div className="text-[10px] uppercase tracking-wider opacity-70">Invoice</div>
              <div className="text-lg font-semibold">#{id}</div>
              {mode && (
                <div className="mt-1 inline-block text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary-foreground/15">
                  {mode}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          {/* Company + meta strip */}
          <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground pb-5 mb-5 border-b border-border">
            <div className="space-y-0.5">
              <div>{company.address}</div>
              {company.phone && <div>Tel: {company.phone}</div>}
              {company.email && <div>{company.email}</div>}
              {company.vatReg && <div>VAT Reg. {company.vatReg}</div>}
            </div>
            <div className="text-right space-y-0.5">
              <div><span className="opacity-70">Date:</span> <span className="text-foreground">{date}</span></div>
              <div><span className="opacity-70">Branch:</span> <span className="text-foreground">{branch}</span></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div>
              <div className="text-muted-foreground text-xs">Billed to</div>
              <div className="font-medium">{customerName}</div>
              {customerPhone && <div className="text-xs text-muted-foreground">{customerPhone}</div>}
            </div>
            <div className="text-right">
              <div className="text-muted-foreground text-xs">Payment</div>
              <div className="font-medium capitalize">{mode ?? "cash"}</div>
            </div>
          </div>
          <table className="w-full text-sm border-t border-border">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="py-2 text-left font-medium">Item</th>
                <th className="py-2 text-right font-medium w-16">Qty</th>
                <th className="py-2 text-right font-medium w-24">Price</th>
                <th className="py-2 text-right font-medium w-24">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((it, idx) => (
                  <tr key={idx} className="border-t border-border align-top">
                    <td className="py-2.5">
                      <div className="font-medium">{it.name}</div>
                      <div className="text-[11px] text-muted-foreground">{it.sku}</div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{it.qty}</td>
                    <td className="py-2.5 text-right tabular-nums">৳{it.price.toFixed(2)}</td>
                    <td className="py-2.5 text-right tabular-nums">৳{(it.price * it.qty).toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr className="border-t border-border">
                  <td className="py-3">Sale items</td>
                  <td className="py-3 text-right">{itemsCount}</td>
                  <td className="py-3 text-right">—</td>
                  <td className="py-3 text-right">৳{subtotal.toFixed(2)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">৳{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">VAT (5%)</span><span className="tabular-nums">৳{tax.toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold pt-2 border-t border-border"><span>Total</span><span className="tabular-nums">৳{total.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="tabular-nums">৳{paid.toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold"><span>Due</span><span className={`tabular-nums ${due > 0 ? "text-destructive" : ""}`}>৳{due.toFixed(2)}</span></div>
          </div>
          <p className="mt-6 text-xs text-muted-foreground text-center">
            {company.footerNote || "Thank you for your purchase."}
          </p>
          <div className="mt-6 space-y-2 print:hidden">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Paper:</span>
              {(["58mm", "80mm", "A4"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPaper(p)}
                  className={`px-2.5 py-1 rounded border text-xs ${paper === p ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={share} className="inline-flex flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-accent"><Share2 className="size-4" /> Share</button>
              <button onClick={print} className="inline-flex flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"><Printer className="size-4" /> Print</button>
            </div>
          </div>
        </div>
      </div>

      {/* Thermal / bill-printer receipt (80mm) — visible only on print */}
      <div
        className="print-receipt"
        style={{
          width: paper === "58mm" ? "54mm" : "72mm",
          padding: "4mm",
          margin: "0 auto",
          fontFamily: "'Courier New', ui-monospace, monospace",
          fontSize: paper === "58mm" ? "10px" : "11px",
          lineHeight: 1.35,
          color: "#000",
          background: "#fff",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          {company.logoDataUrl && (
            <img
              src={company.logoDataUrl}
              alt=""
              style={{ maxHeight: "14mm", maxWidth: "40mm", margin: "0 auto 4px", display: "block" }}
            />
          )}
          <div style={{ fontSize: 14, fontWeight: 700 }}>{company.name}</div>
          {company.tagline && <div style={{ fontSize: 10 }}>{company.tagline}</div>}
          <div style={{ fontSize: 10 }}>{company.address}</div>
          {company.phone && <div style={{ fontSize: 10 }}>Tel: {company.phone}</div>}
          {company.vatReg && <div style={{ fontSize: 10 }}>VAT: {company.vatReg}</div>}
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Invoice #{id}</span>
          <span style={{ textTransform: "uppercase" }}>{mode ?? "cash"}</span>
        </div>
        <div>{date}</div>
        <div>Branch: {branch}</div>
        <div>Customer: {customerName}{customerPhone ? ` (${customerPhone})` : ""}</div>

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Item</th>
              <th style={{ textAlign: "right", width: "24%" }}>Qty×Price</th>
              <th style={{ textAlign: "right", width: "24%" }}>Amt</th>
            </tr>
          </thead>
          <tbody>
            {(items.length > 0 ? items : [{ name: "Sale items", sku: "", qty: itemsCount, price: subtotal / Math.max(1, itemsCount) }]).map((it, i) => (
              <tr key={i}>
                <td style={{ verticalAlign: "top", paddingTop: 2 }}>{it.name}</td>
                <td style={{ textAlign: "right", paddingTop: 2 }}>{it.qty}×{it.price.toFixed(2)}</td>
                <td style={{ textAlign: "right", paddingTop: 2 }}>{(it.qty * it.price).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        {(
          [
            ["Subtotal", subtotal],
            ["VAT (5%)", tax],
            ["Total", total],
            ["Paid", paid],
            ["Due", due],
          ] as const
        ).map(([label, val]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", fontWeight: label === "Total" || label === "Due" ? 700 : 400 }}>
            <span>{label}</span>
            <span>{Number(val).toFixed(2)}</span>
          </div>
        ))}

        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
        <div style={{ textAlign: "center", fontSize: 10 }}>
          {company.footerNote || "Thank you for your purchase."}
        </div>
      </div>
    </div>
  );
}