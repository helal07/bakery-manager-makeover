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

const CACHE_KEY = "company-settings-cache-v1";

export function getCachedCompany(): CompanySettings | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CompanySettings;
  } catch { return null; }
}

function writeCache(c: CompanySettings) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
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
    // Demote any other stale "current" rows so getCompany always resolves one.
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