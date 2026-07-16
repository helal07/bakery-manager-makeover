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

export async function getCompany(): Promise<CompanySettings> {
  const { data, error } = await supabase
    .from("company_settings")
    .select("name, tagline, address, phone, email, vat_reg, logo_url, footer_note")
    .eq("is_current", true)
    .maybeSingle();
  if (error || !data) return defaultCompany;
  const merged: CompanySettings = { ...defaultCompany, ...fromRow(data) };
  if (merged.logoPath && !merged.logoDataUrl) {
    const { data: signed } = await supabase.storage
      .from("company-logos")
      .createSignedUrl(merged.logoPath, 60 * 60 * 24 * 7);
    if (signed?.signedUrl) merged.logoDataUrl = signed.signedUrl;
  }
  return merged;
}

export async function saveCompany(c: CompanySettings) {
  const payload = {
    name: c.name,
    tagline: c.tagline || null,
    address: c.address,
    phone: c.phone || null,
    email: c.email || null,
    vat_reg: c.vatReg || null,
    // Prefer storing the storage path so URLs can be re-signed on load
    logo_url: c.logoPath || c.logoDataUrl || null,
    footer_note: c.footerNote || null,
  };
  const { error } = await supabase
    .from("company_settings")
    .update(payload)
    .eq("is_current", true);
  if (error) throw error;
}