import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type LandingProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  imageUrl?: string;
  showOnLanding: boolean;
};

function mapRow(r: any): LandingProduct {
  return {
    id: r.id,
    name: r.name,
    sku: r.sku ?? "",
    category: r.category ?? "",
    price: Number(r.price) || 0,
    imageUrl: r.image_url ?? undefined,
    showOnLanding: !!r.show_on_landing,
  };
}

export async function listAllProductsForLanding(): Promise<LandingProduct[]> {
  const { data, error } = await sb
    .from("products")
    .select("id,name,sku,category,price,image_url,show_on_landing,is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function listLandingProducts(): Promise<LandingProduct[]> {
  const { data, error } = await sb
    .from("products")
    .select("id,name,sku,category,price,image_url,show_on_landing")
    .eq("is_active", true)
    .eq("show_on_landing", true)
    .order("name");
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function setProductShowOnLanding(id: string, show: boolean) {
  const { error } = await sb.from("products").update({ show_on_landing: show }).eq("id", id);
  if (error) throw error;
}
