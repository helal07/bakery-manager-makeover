import { supabase } from "@/integrations/supabase/client";

export type CompanySettings = {
  name: string;
  tagline?: string;
  address: string;
  phone?: string;
  email?: string;
  vatReg?: string;
  logoDataUrl?: string;
  logoPath?: string;
  footerNote?: string;
};

export const defaultCompany: CompanySettings = {
  name: "Muzahid Food",
  tagline: "",
  address: "Dhaka, Bangladesh",
  phone: "",
  email: "",
  vatReg: "",
  footerNote: "Thank you for your purchase.",
};

// ============================================================
// Invoice customization (stored in company_settings.settings.invoice)
// ============================================================

export type HeaderStyle = "gradient" | "solid" | "minimal" | "bordered";
export type PaperSize = "58mm" | "80mm" | "A4";

export type InvoiceSettings = {
  // Header
  headerStyle: HeaderStyle;
  accentColor: string;         // any CSS color value
  showLogo: boolean;
  showBusinessName: boolean;
  showTagline: boolean;
  showVatReg: boolean;
  invoiceTitle: string;        // e.g. "Invoice", "Tax Invoice", "চালান"
  numberPrefix: string;        // e.g. "INV-"
  numberPadding: number;       // digits, e.g. 6

  // Outlet & customer
  showOutletBlock: boolean;
  showCustomerBlock: boolean;
  showServedBy: boolean;
  labelOutlet: string;
  labelBilledTo: string;
  labelDetails: string;

  // Items table
  colIndex: boolean;
  colSku: boolean;
  colQty: boolean;
  colPrice: boolean;
  colAmount: boolean;
  zebraRows: boolean;

  // Totals
  showSubtotal: boolean;
  showTax: boolean;
  showShipping: boolean;
  showGrandTotal: boolean;
  showPaid: boolean;
  showPreviousDue: boolean;
  showDue: boolean;
  labelSubtotal: string;
  labelTax: string;
  labelShipping: string;
  labelGrandTotal: string;
  labelPaid: string;
  labelDue: string;
  currencySymbol: string;
  decimals: number;

  // Footer
  footerNote: string;
  termsText: string;
  showSignatures: boolean;
  sigCustomer: string;
  sigAuthorized: string;
  showPoweredBy: boolean;

  // Print
  defaultPaper: PaperSize;
  autoPrint: boolean;
  thermalShowLogo: boolean;
  thermalMonospace: boolean;

  // Badges
  badgePaid: string;
  badgePartial: string;
  badgeCredit: string;
};

export const defaultInvoiceSettings: InvoiceSettings = {
  headerStyle: "gradient",
  accentColor: "hsl(var(--primary))",
  showLogo: true,
  showBusinessName: true,
  showTagline: true,
  showVatReg: true,
  invoiceTitle: "Invoice",
  numberPrefix: "INV-",
  numberPadding: 6,

  showOutletBlock: true,
  showCustomerBlock: true,
  showServedBy: true,
  labelOutlet: "Outlet",
  labelBilledTo: "Billed to",
  labelDetails: "Details",

  colIndex: true,
  colSku: true,
  colQty: true,
  colPrice: true,
  colAmount: true,
  zebraRows: false,

  showSubtotal: true,
  showTax: true,
  showShipping: true,
  showGrandTotal: true,
  showPaid: true,
  showPreviousDue: true,
  showDue: true,
  labelSubtotal: "Subtotal",
  labelTax: "VAT",
  labelShipping: "Shipping",
  labelGrandTotal: "Grand Total",
  labelPaid: "Paid",
  labelDue: "Due",
  currencySymbol: "৳",
  decimals: 2,

  footerNote: "Thank you for your purchase.",
  termsText: "",
  showSignatures: true,
  sigCustomer: "Received by (Customer)",
  sigAuthorized: "Authorized signature",
  showPoweredBy: true,

  defaultPaper: "80mm",
  autoPrint: true,
  thermalShowLogo: true,
  thermalMonospace: true,

  badgePaid: "PAID",
  badgePartial: "PARTIAL",
  badgeCredit: "CREDIT",
};

function fromRow(r: Record<string, unknown>): CompanySettings {
  const stored = (r.logo_url as string) ?? "";
  const isUrl = /^(https?:|data:|blob:)/i.test(stored);
  return {
    name: (r.name as string) ?? "",
    tagline: (r.tagline as string) ?? "",
    address: (r.address as string) ?? "",
    phone: (r.phone as string) ?? "",
    email: (r.email as string) ?? "",
    vatReg: (r.vat_reg as string) ?? "",
    logoDataUrl: isUrl ? stored : "",
    logoPath: !isUrl && stored ? stored : undefined,
    footerNote: (r.footer_note as string) ?? "",
  };
}

const CACHE_KEY = "company-settings-cache-v1";
const INVOICE_CACHE_KEY = "invoice-settings-cache-v1";

export function getCachedCompany(): CompanySettings | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CompanySettings;
  } catch { return null; }
}

export function getCachedInvoiceSettings(): InvoiceSettings | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(INVOICE_CACHE_KEY);
    if (!raw) return null;
    return { ...defaultInvoiceSettings, ...JSON.parse(raw) } as InvoiceSettings;
  } catch { return null; }
}

/** Build a document title using the cached company name (safe in head()). */
export function pageTitle(section: string): string {
  const cached = getCachedCompany();
  const name = (cached?.name && cached.name.trim()) || defaultCompany.name;
  return section ? `${section} · ${name}` : name;
}

/** Get the company display name synchronously from cache (fallback to default). */
export function getCompanyName(): string {
  const cached = getCachedCompany();
  return (cached?.name && cached.name.trim()) || defaultCompany.name;
}

function writeCache(c: CompanySettings) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}
function writeInvoiceCache(s: InvoiceSettings) {
  try { localStorage.setItem(INVOICE_CACHE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

let inflight: Promise<CompanySettings> | null = null;

export async function getCompany(): Promise<CompanySettings> {
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase
      .from("company_settings")
      .select("name, tagline, address, phone, email, vat_reg, logo_url, footer_note")
      .eq("is_current", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return defaultCompany;
    const merged: CompanySettings = { ...defaultCompany, ...fromRow(data) };
    if (merged.logoPath && !merged.logoDataUrl) {
      const { data: signed } = await supabase.storage
        .from("company-logos")
        .createSignedUrl(merged.logoPath, 60 * 60 * 24 * 7);
      if (signed?.signedUrl) merged.logoDataUrl = signed.signedUrl;
    }
    writeCache(merged);
    return merged;
  })();
  try { return await inflight; } finally { inflight = null; }
}

let invoiceInflight: Promise<InvoiceSettings> | null = null;

export async function getInvoiceSettings(): Promise<InvoiceSettings> {
  if (invoiceInflight) return invoiceInflight;
  invoiceInflight = (async () => {
    const { data, error } = await supabase
      .from("company_settings")
      .select("settings")
      .eq("is_current", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return defaultInvoiceSettings;
    const s = (data as { settings?: { invoice?: Partial<InvoiceSettings> } }).settings;
    const merged: InvoiceSettings = { ...defaultInvoiceSettings, ...(s?.invoice ?? {}) };
    writeInvoiceCache(merged);
    return merged;
  })();
  try { return await invoiceInflight; } finally { invoiceInflight = null; }
}

export async function saveInvoiceSettings(next: InvoiceSettings): Promise<void> {
  const { data: existing } = await supabase
    .from("company_settings")
    .select("id, settings")
    .eq("is_current", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentSettings = (existing?.settings as Record<string, unknown> | null) ?? {};
  const patched = { ...currentSettings, invoice: next };

  if (existing?.id) {
    const { error } = await supabase
      .from("company_settings")
      .update({ settings: patched })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("company_settings")
      .insert({ is_current: true, settings: patched, name: defaultCompany.name, address: defaultCompany.address });
    if (error) throw error;
  }
  writeInvoiceCache(next);
}

export async function saveCompany(c: CompanySettings) {
  const payload = {
    name: c.name,
    tagline: c.tagline || null,
    address: c.address,
    phone: c.phone || null,
    email: c.email || null,
    vat_reg: c.vatReg || null,
    logo_url: c.logoPath || c.logoDataUrl || null,
    footer_note: c.footerNote || null,
    is_current: true,
  };
  const { data: existing } = await supabase
    .from("company_settings")
    .select("id")
    .eq("is_current", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    await supabase
      .from("company_settings")
      .update({ is_current: false })
      .eq("is_current", true)
      .neq("id", existing.id);
    const { data, error } = await supabase
      .from("company_settings")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new Error("Save blocked — check that you are signed in (RLS)");
  } else {
    const { data, error } = await supabase
      .from("company_settings")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new Error("Save blocked — check that you are signed in (RLS)");
  }
}
