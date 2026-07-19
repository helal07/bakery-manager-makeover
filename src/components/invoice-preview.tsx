import { useMemo } from "react";
import { MapPin, Phone, User2 } from "lucide-react";
import type { CompanySettings, InvoiceSettings, PaperSize } from "@/lib/company-settings";

export type InvoiceLine = { name: string; sku: string; price: number; qty: number };
export type InvoiceShowroom = {
  id?: string;
  name?: string;
  code?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  manager_name?: string | null;
};
export type InvoiceSnapshot = {
  customer: { name: string; phone?: string };
  branch?: string;
  showroom?: InvoiceShowroom | null;
  reference?: string;
  date: string;
  mode: "cash" | "due" | "partial";
  items: InvoiceLine[];
  subtotal: number;
  tax: number;
  shipping?: number;
  total: number;
  paid: number;
  due: number;
};

type Props = {
  snapshot: InvoiceSnapshot;
  settings: InvoiceSettings;
  company: CompanySettings;
  paper: PaperSize;
  scale?: number; // for previews
};

export function InvoicePreview({ snapshot, settings, company, paper, scale }: Props) {
  const s = settings;
  const money = (n: number) => `${s.currencySymbol}${Number(n).toFixed(s.decimals)}`;

  const showroom = snapshot.showroom ?? null;
  const branch = showroom?.name ?? snapshot.branch ?? "Main Branch";
  const items = snapshot.items ?? [];
  const outletAddress = showroom?.address || company.address;
  const outletCity = showroom?.city || "";
  const outletPhone = showroom?.phone || company.phone || "";
  const manager = showroom?.manager_name || "";
  const shipping = snapshot.shipping ?? 0;

  const badge = useMemo(() => {
    if (snapshot.mode === "cash") return { label: s.badgePaid, cls: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    if (snapshot.mode === "partial") return { label: s.badgePartial, cls: "bg-amber-100 text-amber-900 border-amber-200" };
    return { label: s.badgeCredit, cls: "bg-rose-100 text-rose-800 border-rose-200" };
  }, [snapshot.mode, s.badgePaid, s.badgePartial, s.badgeCredit]);

  const headerBg =
    s.headerStyle === "gradient"
      ? { background: `linear-gradient(135deg, ${s.accentColor}, ${s.accentColor})`, color: "white" }
      : s.headerStyle === "solid"
      ? { background: s.accentColor, color: "white" }
      : s.headerStyle === "bordered"
      ? { background: "transparent", color: "inherit", borderBottom: `3px solid ${s.accentColor}` }
      : { background: "transparent", color: "inherit" };

  const colCount = [s.colIndex, true, s.colQty, s.colPrice, s.colAmount].filter(Boolean).length;

  const wrapStyle: React.CSSProperties = scale
    ? { transform: `scale(${scale})`, transformOrigin: "top left", width: `${100 / scale}%` }
    : {};

  // ============ A4 layout ============
  if (paper === "A4") {
    return (
      <div style={wrapStyle}>
        <div className="a4-invoice max-w-3xl mx-auto bg-background rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="relative px-8 pt-8 pb-6" style={headerBg}>
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-center gap-4 min-w-0">
                {s.showLogo && (
                  <div className="size-16 rounded-lg border grid place-items-center overflow-hidden shrink-0"
                    style={{ background: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.25)" }}>
                    {company.logoDataUrl
                      ? <img src={company.logoDataUrl} alt={company.name} className="size-full object-cover" />
                      : <span className="text-xl font-bold">{company.name.slice(0, 2).toUpperCase()}</span>}
                  </div>
                )}
                <div className="min-w-0">
                  {s.showBusinessName && <h1 className="text-2xl font-bold leading-tight truncate">{company.name}</h1>}
                  {s.showTagline && company.tagline && <p className="text-xs opacity-85 mt-0.5">{company.tagline}</p>}
                  {s.showVatReg && company.vatReg && <p className="text-[11px] opacity-75 mt-0.5">VAT Reg. {company.vatReg}</p>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] uppercase tracking-[0.15em] opacity-80">{s.invoiceTitle}</div>
                <div className="text-2xl font-bold tabular-nums">{snapshot.reference}</div>
                <div className={`mt-1.5 inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badge.cls}`}>
                  {badge.label}
                </div>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 px-8 py-5 bg-muted/40 border-b border-border text-xs">
            {s.showOutletBlock && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{s.labelOutlet}</div>
                <div className="font-semibold text-sm">{branch}</div>
                {showroom?.code && <div className="text-muted-foreground">Code: {showroom.code}</div>}
                {outletAddress && <div className="flex items-start gap-1 text-muted-foreground mt-1"><MapPin className="size-3 mt-0.5 shrink-0" /><span>{outletAddress}{outletCity ? `, ${outletCity}` : ""}</span></div>}
                {outletPhone && <div className="flex items-center gap-1 text-muted-foreground"><Phone className="size-3" /> {outletPhone}</div>}
                {s.showServedBy && manager && <div className="flex items-center gap-1 text-muted-foreground"><User2 className="size-3" /> {manager}</div>}
              </div>
            )}
            {s.showCustomerBlock && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{s.labelBilledTo}</div>
                <div className="font-semibold text-sm">{snapshot.customer.name}</div>
                {snapshot.customer.phone && <div className="text-muted-foreground">{snapshot.customer.phone}</div>}
              </div>
            )}
            <div className="sm:text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{s.labelDetails}</div>
              <div><span className="text-muted-foreground">Date: </span><span className="font-medium">{new Date(snapshot.date).toLocaleString()}</span></div>
              <div><span className="text-muted-foreground">Payment: </span><span className="font-medium capitalize">{snapshot.mode}</span></div>
              <div><span className="text-muted-foreground">Items: </span><span className="font-medium">{items.reduce((n, i) => n + i.qty, 0)}</span></div>
            </div>
          </div>

          <div className="px-8 py-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  {s.colIndex && <th className="py-2 text-left font-medium w-8">#</th>}
                  <th className="py-2 text-left font-medium">Item</th>
                  {s.colQty && <th className="py-2 text-right font-medium w-16">Qty</th>}
                  {s.colPrice && <th className="py-2 text-right font-medium w-24">Price</th>}
                  {s.colAmount && <th className="py-2 text-right font-medium w-28">Amount</th>}
                </tr>
              </thead>
              <tbody>
                {items.length > 0 ? items.map((it, idx) => (
                  <tr key={idx} className={`border-b border-border/60 align-top ${s.zebraRows && idx % 2 === 1 ? "bg-muted/30" : ""}`}>
                    {s.colIndex && <td className="py-3 text-muted-foreground tabular-nums">{idx + 1}</td>}
                    <td className="py-3">
                      <div className="font-medium">{it.name}</div>
                      {s.colSku && it.sku && <div className="text-[11px] text-muted-foreground">SKU: {it.sku}</div>}
                    </td>
                    {s.colQty && <td className="py-3 text-right tabular-nums">{it.qty}</td>}
                    {s.colPrice && <td className="py-3 text-right tabular-nums">{money(it.price)}</td>}
                    {s.colAmount && <td className="py-3 text-right tabular-nums font-medium">{money(it.price * it.qty)}</td>}
                  </tr>
                )) : (
                  <tr><td colSpan={colCount} className="py-6 text-center text-muted-foreground">No items</td></tr>
                )}
              </tbody>
            </table>

            <div className="mt-6 flex justify-end">
              <div className="w-full sm:w-80 space-y-1.5 text-sm">
                {s.showSubtotal && <div className="flex justify-between"><span className="text-muted-foreground">{s.labelSubtotal}</span><span className="tabular-nums">{money(snapshot.subtotal)}</span></div>}
                {s.showTax && snapshot.tax > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{s.labelTax}</span><span className="tabular-nums">{money(snapshot.tax)}</span></div>}
                {s.showShipping && shipping > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{s.labelShipping}</span><span className="tabular-nums">{money(shipping)}</span></div>}
                {s.showGrandTotal && (
                  <div className="flex justify-between text-base font-bold pt-2 mt-1 border-t border-border">
                    <span>{s.labelGrandTotal}</span><span className="tabular-nums">{money(snapshot.total)}</span>
                  </div>
                )}
                {s.showPaid && <div className="flex justify-between"><span className="text-muted-foreground">{s.labelPaid}</span><span className="tabular-nums">{money(snapshot.paid)}</span></div>}
                {s.showDue && (
                  <div className={`flex justify-between font-semibold ${snapshot.due > 0 ? "text-destructive" : "text-emerald-700"}`}>
                    <span>{s.labelDue}</span><span className="tabular-nums">{money(snapshot.due)}</span>
                  </div>
                )}
              </div>
            </div>

            {s.showSignatures && (
              <div className="mt-10 grid grid-cols-2 gap-8 text-xs text-muted-foreground">
                <div className="border-t border-dashed border-border pt-2 text-center">{s.sigCustomer}</div>
                <div className="border-t border-dashed border-border pt-2 text-center">{s.sigAuthorized}</div>
              </div>
            )}

            {s.termsText && (
              <div className="mt-6 text-[11px] text-muted-foreground whitespace-pre-wrap border-t border-border pt-3">
                {s.termsText}
              </div>
            )}

            {s.footerNote && (
              <p className="mt-6 text-center text-xs text-muted-foreground whitespace-pre-wrap">{s.footerNote}</p>
            )}
            {s.showPoweredBy && (
              <p className="mt-2 text-center text-[10px] text-muted-foreground/70">Powered by {company.name}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============ Thermal 58/80mm ============
  const width = paper === "58mm" ? "54mm" : "72mm";
  const fontSize = paper === "58mm" ? 10 : 11;
  return (
    <div style={wrapStyle}>
      <div
        style={{
          width,
          padding: "3mm",
          margin: "0 auto",
          fontFamily: s.thermalMonospace ? "'Courier New', ui-monospace, monospace" : "system-ui, sans-serif",
          fontSize,
          lineHeight: 1.35,
          color: "#000",
          background: "#fff",
        }}
      >
        <div style={{ textAlign: "center" }}>
          {s.thermalShowLogo && company.logoDataUrl && (
            <img src={company.logoDataUrl} alt="" style={{ maxHeight: "12mm", maxWidth: "36mm", margin: "0 auto 3px", display: "block" }} />
          )}
          {s.showBusinessName && <div style={{ fontSize: 14, fontWeight: 800 }}>{company.name}</div>}
          {s.showTagline && company.tagline && <div style={{ fontSize: 10 }}>{company.tagline}</div>}
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        {s.showOutletBlock && (
          <div style={{ textAlign: "center", fontSize: 10 }}>
            <div style={{ fontWeight: 700 }}>{branch}{showroom?.code ? ` · ${showroom.code}` : ""}</div>
            {outletAddress && <div>{outletAddress}{outletCity ? `, ${outletCity}` : ""}</div>}
            {outletPhone && <div>Tel: {outletPhone}</div>}
            {s.showVatReg && company.vatReg && <div>VAT: {company.vatReg}</div>}
          </div>
        )}

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span>{snapshot.reference}</span>
          <span style={{ textTransform: "uppercase" }}>{badge.label}</span>
        </div>
        <div>{new Date(snapshot.date).toLocaleString()}</div>
        {s.showCustomerBlock && <div>Customer: {snapshot.customer.name}{snapshot.customer.phone ? ` · ${snapshot.customer.phone}` : ""}</div>}
        {s.showServedBy && manager && <div>Served by: {manager}</div>}

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px dashed #000" }}>
              <th style={{ textAlign: "left", paddingBottom: 2 }}>Item</th>
              {s.colQty && s.colPrice && <th style={{ textAlign: "right", width: "22%", paddingBottom: 2 }}>Qty×Rate</th>}
              {s.colAmount && <th style={{ textAlign: "right", width: "26%", paddingBottom: 2 }}>Amt</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td style={{ verticalAlign: "top", paddingTop: 3 }}>
                  <div>{it.name}</div>
                  {s.colSku && it.sku && <div style={{ fontSize: 9, opacity: 0.75 }}>{it.sku}</div>}
                </td>
                {s.colQty && s.colPrice && <td style={{ textAlign: "right", paddingTop: 3 }}>{it.qty}×{it.price.toFixed(s.decimals)}</td>}
                {s.colAmount && <td style={{ textAlign: "right", paddingTop: 3 }}>{(it.qty * it.price).toFixed(s.decimals)}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        {[
          s.showSubtotal ? [s.labelSubtotal, snapshot.subtotal, false] as const : null,
          s.showTax && snapshot.tax > 0 ? [s.labelTax, snapshot.tax, false] as const : null,
          s.showShipping && shipping > 0 ? [s.labelShipping, shipping, false] as const : null,
          s.showGrandTotal ? [s.labelGrandTotal.toUpperCase(), snapshot.total, true] as const : null,
          s.showPaid ? [s.labelPaid, snapshot.paid, false] as const : null,
          s.showDue ? [s.labelDue, snapshot.due, true] as const : null,
        ].filter(Boolean).map((row) => {
          const [label, val, bold] = row as readonly [string, number, boolean];
          return (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? 800 : 400, fontSize: bold ? 12 : 11 }}>
              <span>{label}</span>
              <span>{money(val)}</span>
            </div>
          );
        })}

        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
        {s.footerNote && <div style={{ textAlign: "center", fontSize: 10, whiteSpace: "pre-wrap" }}>{s.footerNote}</div>}
        {s.termsText && <div style={{ textAlign: "center", fontSize: 9, marginTop: 3, whiteSpace: "pre-wrap" }}>{s.termsText}</div>}
        {s.showPoweredBy && (
          <div style={{ textAlign: "center", fontSize: 9, marginTop: 4, opacity: 0.7 }}>Powered by {company.name}</div>
        )}
      </div>
    </div>
  );
}

export const sampleInvoice: InvoiceSnapshot = {
  customer: { name: "Rahim Uddin", phone: "01711-000000" },
  branch: "Main Branch",
  showroom: { name: "Main Branch", code: "MB-01", address: "123 Main Rd", city: "Dhaka", phone: "01711-111111", manager_name: "Karim" },
  reference: "INV-000123",
  date: new Date().toISOString(),
  mode: "cash",
  items: [
    { name: "Butter Croissant", sku: "BC-001", price: 60, qty: 4 },
    { name: "Chocolate Muffin", sku: "CM-002", price: 80, qty: 2 },
    { name: "White Bread Loaf", sku: "WB-003", price: 120, qty: 1 },
  ],
  subtotal: 520,
  tax: 26,
  shipping: 30,
  total: 576,
  paid: 576,
  due: 0,
};
