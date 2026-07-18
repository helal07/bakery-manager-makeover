import { supabase } from "@/integrations/supabase/client";

export type LandingContent = {
  brand: { name: string; tagline: string };
  hero: {
    headline: string;
    subhead: string;
    ctaPrimary: { label: string; href: string };
    ctaSecondary: { label: string; href: string };
  };
  story: { title: string; body: string };
  products: { name: string; desc: string }[];
  contact: { address: string; phone: string; email: string; hours: string };
};

export const defaultLanding: LandingContent = {
  brand: { name: "Muzahid Food", tagline: "Freshly baked, honestly made." },
  hero: {
    headline: "Bakery goodness from our factory to your neighborhood.",
    subhead:
      "A family-run food factory producing breads, biscuits, cakes and pastries — distributed to our showrooms and partner retailers across the country.",
    ctaPrimary: { label: "Sign in", href: "/auth" },
    ctaSecondary: { label: "Our products", href: "#products" },
  },
  story: {
    title: "Our story",
    body: "Muzahid Food started as a small neighborhood bakery. Today we operate a modern production factory and multiple retail showrooms, serving thousands of customers every week with the same care we started with.",
  },
  products: [
    { name: "Fresh Breads", desc: "Milk bread, sandwich loaves, buns and rolls baked every morning." },
    { name: "Biscuits", desc: "Butter cookies, salted crackers and traditional biscuits by the packet." },
    { name: "Cakes & Pastries", desc: "Birthday cakes, sponge cakes and everyday pastries for any occasion." },
    { name: "Wholesale supply", desc: "Bulk orders for retailers, dealers and event customers with delivery." },
  ],
  contact: {
    address: "Factory & Head Office, Dhaka, Bangladesh",
    phone: "+880 1XXX-XXXXXX",
    email: "hello@muzahidfood.com",
    hours: "Sun – Fri, 9:00 AM – 8:00 PM",
  },
};

const sb = supabase as any;

export async function fetchLandingContent(): Promise<LandingContent> {
  const { data, error } = await sb
    .from("landing_content")
    .select("content")
    .eq("is_current", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return defaultLanding;
  return { ...defaultLanding, ...(data.content as Partial<LandingContent>) } as LandingContent;
}

export async function saveLandingContent(content: LandingContent) {
  const { data: userRes } = await supabase.auth.getUser();
  // Find existing current row
  const { data: existing } = await sb
    .from("landing_content")
    .select("id")
    .eq("is_current", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    content,
    is_current: true,
    updated_by: userRes.user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await sb.from("landing_content").update(payload).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await sb.from("landing_content").insert(payload);
    if (error) throw error;
  }
}