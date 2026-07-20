import { useMemo } from "react";
import { MapPin, Phone, User2 } from "lucide-react";
import { formatInvoiceDate, type CompanySettings, type InvoiceSettings, type PaperSize } from "@/lib/company-settings";

export type InvoiceLine = {
  name: string;
  sku: string;
  price: number;
  qty: number;
  discount?: number; // per-line discount amount (total, not per unit)
};
export type InvoiceShowroom = {
  id?: string;
  name?: string;
  code?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  manager_name?: string | null;
};
export type InvoicePayment = { method: string; amount: number; reference?: string | null };
export type InvoiceSnapshot = {
  customer: { name: string; phone?: string; address?: string };
  branch?: string;
  showroom?: InvoiceShowroom | null;
  reference?: string;
  date: string;
  mode: "cash" | "due" | "partial";
  items: InvoiceLine[];
  subtotal: number;
  discount?: number;    // sale-level discount
  tax: number;
  shipping?: number;
  total: number;        // today's bill (after discount, before previous due)
  paid: number;         // today's payment
  due: number;          // today's remaining
  previousDue?: number; // customer's outstanding before this sale
  payments?: InvoicePayment[];
};

type Props = {
  snapshot: InvoiceSnapshot;
  settings: InvoiceSettings;
  company: CompanySettings;
  paper: PaperSize;
  scale?: number;
};

const methodLabel: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  mobile: "Mobile Banking",
  bank: "Bank Transfer",
  cheque: "Cheque",
  other: "Other",
};

export function InvoicePreview({ snapshot, settings, company, paper, scale }: Props) {
  const s = settings;
  const money = (n: number) => `${s.currencySymbol}${Number(n || 0).toFixed(s.decimals)}`;

  const showroom = snapshot.showroom ?? null;
  const branch = showroom?.name ?? snapshot.branch ?? "Main Branch";
  const items = snapshot.items ?? [];
  const outletAddress = showroom?.address || company.address;
  const outletCity = showroom?.city || "";
  const outletPhone = showroom?.phone || company.phone || "";
  const manager = showroom?.manager_name || "";

  const saleDiscount = Number(snapshot.discount || 0);
  const shipping = Number(snapshot.shipping || 0);
  const previousDue = Number(snapshot.previousDue || 0);
  const grandWithPrev = Number(snapshot.total || 0) + previousDue;
  const dueTillToday = Math.max(0, grandWithPrev - Number(snapshot.paid || 0));
  const payments = snapshot.payments && snapshot.payments.length
    ? snapshot.payments
    : (snapshot.paid > 0 ? [{ method: "cash", amount: snapshot.paid }] : []);

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

  const wrapStyle: React.CSSProperties = scale
    ? { transform: `scale(${scale})`, transformOrigin: "top left", width: `${100 / scale}%` }
    : {};

  const lineAmount = (it: InvoiceLine) => it.price * it.qty - Number(it.discount || 0);

  // ============ A4 layout ============
  if (paper === "A4") {
    return (
      <div style={wrapStyle}>
        <div className="a4-invoice max-w-3xl mx-auto bg-background rounded-xl border border-border shadow-sm overflow-hidden">
          {/* Header: showroom identity + invoice meta */}
          <div className="relative px-8 pt-6 pb-5" style={headerBg}>
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
                  <div className="text-[10px] uppercase tracking-wider opacity-80">{s.labelOutlet}</div>
                  <h1 className="text-2xl font-bold leading-tight truncate">{branch}</h1>
                  {outletAddress && (
                    <div className="text-xs opacity-90 mt-1 flex items-start gap-1">
                      <MapPin className="size-3 mt-0.5 shrink-0" />
                      <span>{outletAddress}{outletCity ? `, ${outletCity}` : ""}</span>
                    </div>
                  )}
                  {outletPhone && (
                    <div className="text-xs opacity-90 flex items-center gap-1">
                      <Phone className="size-3" /> {outletPhone}
                    </div>
                  )}
                  {s.showVatReg && company.vatReg && <div className="text-[11px] opacity-75 mt-0.5">VAT Reg. {company.vatReg}</div>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] uppercase tracking-[0.15em] opacity-80">{s.invoiceTitle}</div>
                {s.showVatReg && company.vatReg && <div className="text-[11px] opacity-75 mt-0.5">VAT Reg. {company.vatReg}</div>}
              </div>
            </div>
          </div>

          {/* Customer left, Invoice # + date right — same row */}
          <div className="grid sm:grid-cols-2 gap-4 px-8 py-4 bg-muted/40 border-b border-border text-xs">
            {s.showCustomerBlock ? (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{s.labelBilledTo}</div>
                <div className="font-semibold text-sm">{snapshot.customer.name}</div>
                {snapshot.customer.phone && (
                  <div className="text-muted-foreground flex items-center gap-1">
                    <Phone className="size-3" /> {snapshot.customer.phone}
                  </div>
                )}
                {snapshot.customer.address && (
                  <div className="text-muted-foreground flex items-start gap-1">
                    <MapPin className="size-3 mt-0.5 shrink-0" /> <span>{snapshot.customer.address}</span>
                  </div>
                )}
              </div>
            ) : <div />}
            <div className="sm:text-right space-y-0.5">
              <div className="text-xl font-bold tabular-nums leading-tight">{snapshot.reference}</div>
              <div className="text-[11px] text-muted-foreground">{formatInvoiceDate(snapshot.date, s.dateFormat)}</div>
              <div className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badge.cls}`}>
                {badge.label}
              </div>
              <div className="pt-1 text-muted-foreground">Items: <span className="font-medium text-foreground">{items.reduce((n, i) => n + i.qty, 0)}</span> · Payment: <span className="font-medium capitalize text-foreground">{snapshot.mode}</span></div>
              {s.showServedBy && manager && (
                <div className="text-muted-foreground flex items-center gap-1 sm:justify-end">
                  <User2 className="size-3" /> Served by {manager}
                </div>
              )}
            </div>
          </div>


          {/* Items table with visible row separators */}
          <div className="px-8 py-5">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-y-2 border-foreground/70">
                  {s.colIndex && <th className="py-2 px-2 text-left font-semibold w-8">#</th>}
                  <th className="py-2 px-2 text-left font-semibold">Product</th>
                  {s.colPrice && <th className="py-2 px-2 text-right font-semibold w-24">Unit Price</th>}
                  {s.colQty && <th className="py-2 px-2 text-right font-semibold w-16">Qty</th>}
                  <th className="py-2 px-2 text-right font-semibold w-24">Discount</th>
                  {s.colAmount && <th className="py-2 px-2 text-right font-semibold w-28">Amount</th>}
                </tr>
              </thead>
              <tbody>
                {items.length > 0 ? items.map((it, idx) => (
                  <tr key={idx} className={`border-b border-border align-top ${s.zebraRows && idx % 2 === 1 ? "bg-muted/30" : ""}`}>
                    {s.colIndex && <td className="py-3 px-2 text-muted-foreground tabular-nums">{idx + 1}</td>}
                    <td className="py-3 px-2">
                      <div className="font-medium">{it.name}</div>
                      {s.colSku && it.sku && <div className="text-[11px] text-muted-foreground">SKU: {it.sku}</div>}
                    </td>
                    {s.colPrice && <td className="py-3 px-2 text-right tabular-nums">{money(it.price)}</td>}
                    {s.colQty && <td className="py-3 px-2 text-right tabular-nums">{it.qty}</td>}
                    <td className="py-3 px-2 text-right tabular-nums">{it.discount ? `- ${money(it.discount)}` : "—"}</td>
                    {s.colAmount && <td className="py-3 px-2 text-right tabular-nums font-medium">{money(lineAmount(it))}</td>}
                  </tr>
                )) : (
                  <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No items</td></tr>
                )}
              </tbody>
            </table>

            {/* Summary: totals only */}
            <div className="mt-6 flex justify-end">
              <div className="text-sm w-full sm:w-1/2">

                <div className="space-y-1.5">
                  {s.showSubtotal && <div className="flex justify-between"><span className="text-muted-foreground">{s.labelSubtotal}</span><span className="tabular-nums">{money(snapshot.subtotal)}</span></div>}
                  {saleDiscount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">- {money(saleDiscount)}</span></div>}
                  {s.showTax && snapshot.tax > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{s.labelTax}</span><span className="tabular-nums">{money(snapshot.tax)}</span></div>}
                  {s.showShipping && shipping > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{s.labelShipping}</span><span className="tabular-nums">{money(shipping)}</span></div>}
                  <div className="flex justify-between font-semibold pt-1.5 mt-1 border-t border-border">
                    <span>Today's Bill</span><span className="tabular-nums">{money(snapshot.total)}</span>
                  </div>
                  {s.showPreviousDue && (
                    <div className="flex justify-between text-amber-800">
                      <span>Previous Due</span><span className="tabular-nums">+ {money(previousDue)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold pt-2 mt-1 border-t-2 border-foreground/70" style={{ color: s.accentColor }}>
                    <span>{s.labelGrandTotal}</span><span className="tabular-nums">{money(grandWithPrev)}</span>
                  </div>
                  {s.showPaid && <div className="flex justify-between"><span className="text-muted-foreground">Today Payment</span><span className="tabular-nums">- {money(snapshot.paid)}</span></div>}
                  <div className={`flex justify-between font-bold pt-1.5 border-t border-border ${dueTillToday > 0 ? "text-destructive" : "text-emerald-700"}`}>
                    <span>Due Till Today</span><span className="tabular-nums">{money(dueTillToday)}</span>
                  </div>
                </div>
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
          <div style={{ fontSize: 14, fontWeight: 800 }}>{branch}</div>
          {outletAddress && <div style={{ fontSize: 10 }}>{outletAddress}{outletCity ? `, ${outletCity}` : ""}</div>}
          {outletPhone && <div style={{ fontSize: 10 }}>Tel: {outletPhone}</div>}
          {s.showVatReg && company.vatReg && <div style={{ fontSize: 10 }}>VAT: {company.vatReg}</div>}
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span>{snapshot.reference}</span>
          <span style={{ textTransform: "uppercase" }}>{badge.label}</span>
        </div>
        <div style={{ fontSize: 10 }}>{formatInvoiceDate(snapshot.date, s.dateFormat)}</div>

        {s.showCustomerBlock && (
          <>
            <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
            <div style={{ fontWeight: 700 }}>{snapshot.customer.name}</div>
            {snapshot.customer.phone && <div style={{ fontSize: 10 }}>{snapshot.customer.phone}</div>}
            {snapshot.customer.address && <div style={{ fontSize: 10 }}>{snapshot.customer.address}</div>}
          </>
        )}

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px dashed #000" }}>
              <th style={{ textAlign: "left", paddingBottom: 2 }}>Item</th>
              <th style={{ textAlign: "right", width: "26%", paddingBottom: 2 }}>Qty×Rate</th>
              <th style={{ textAlign: "right", width: "26%", paddingBottom: 2 }}>Amt</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ borderBottom: "1px dashed #999" }}>
                <td style={{ verticalAlign: "top", paddingTop: 3, paddingBottom: 3 }}>
                  <div>{it.name}</div>
                  {it.discount ? <div style={{ fontSize: 9 }}>disc -{it.discount.toFixed(s.decimals)}</div> : null}
                </td>
                <td style={{ textAlign: "right", paddingTop: 3 }}>{it.qty}×{it.price.toFixed(s.decimals)}</td>
                <td style={{ textAlign: "right", paddingTop: 3 }}>{lineAmount(it).toFixed(s.decimals)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        {s.showSubtotal && (
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>{s.labelSubtotal}</span><span>{money(snapshot.subtotal)}</span></div>
        )}
        {saleDiscount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Discount</span><span>- {money(saleDiscount)}</span></div>
        )}
        {s.showTax && snapshot.tax > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>{s.labelTax}</span><span>{money(snapshot.tax)}</span></div>
        )}
        {shipping > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>{s.labelShipping}</span><span>{money(shipping)}</span></div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span>Today's Bill</span><span>{money(snapshot.total)}</span>
        </div>
        {s.showPreviousDue && (
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Previous Due</span><span>+ {money(previousDue)}</span></div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 12, borderTop: "1px dashed #000", paddingTop: 2, marginTop: 2 }}>
          <span>TOTAL</span><span>{money(grandWithPrev)}</span>
        </div>

        {payments.length > 0 && (
          <>
            <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
            <div style={{ fontWeight: 700, fontSize: 10 }}>Payments</div>
            {payments.map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ textTransform: "capitalize" }}>{methodLabel[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                <span>{money(p.amount)}</span>
              </div>
            ))}
          </>
        )}
        {s.showPaid && (
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
            <span>Today Payment</span><span>- {money(snapshot.paid)}</span>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 12, borderTop: "1px dashed #000", paddingTop: 2, marginTop: 2 }}>
          <span>Due Till Today</span><span>{money(dueTillToday)}</span>
        </div>

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
  customer: { name: "Rahim Uddin", phone: "01711-000000", address: "House 12, Road 5, Dhanmondi, Dhaka" },
  branch: "Main Branch",
  showroom: { name: "Main Branch", code: "MB-01", address: "123 Main Rd", city: "Dhaka", phone: "01711-111111", manager_name: "Karim" },
  reference: "INV-000123",
  date: new Date().toISOString(),
  mode: "partial",
  items: [
    { name: "Butter Croissant", sku: "BC-001", price: 60, qty: 4, discount: 10 },
    { name: "Chocolate Muffin", sku: "CM-002", price: 80, qty: 2 },
    { name: "White Bread Loaf", sku: "WB-003", price: 120, qty: 1 },
  ],
  subtotal: 520,
  discount: 20,
  tax: 0,
  shipping: 0,
  total: 500,
  paid: 400,
  due: 100,
  previousDue: 150,
  payments: [{ method: "cash", amount: 300 }, { method: "mobile", amount: 100, reference: "bKash 9821" }],
};
