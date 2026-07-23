import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type CarouselSlide = {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  linkUrl?: string;
  sortOrder: number;
  isActive: boolean;
};

function mapRow(r: any): CarouselSlide {
  return {
    id: r.id,
    title: r.title ?? "",
    subtitle: r.subtitle ?? undefined,
    imageUrl: r.image_url,
    linkUrl: r.link_url ?? undefined,
    sortOrder: Number(r.sort_order) || 0,
    isActive: !!r.is_active,
  };
}

export async function listCarousels(opts?: { onlyActive?: boolean }): Promise<CarouselSlide[]> {
  let q = sb
    .from("landing_carousels")
    .select("id,title,subtitle,image_url,link_url,sort_order,is_active")
    .order("sort_order", { ascending: true });
  if (opts?.onlyActive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function upsertCarousel(slide: Partial<CarouselSlide> & { imageUrl: string }) {
  const payload: Record<string, unknown> = {
    title: slide.title ?? "",
    subtitle: slide.subtitle ?? null,
    image_url: slide.imageUrl,
    link_url: slide.linkUrl ?? null,
    sort_order: slide.sortOrder ?? 0,
    is_active: slide.isActive ?? true,
  };
  if (slide.id) {
    const { error } = await sb.from("landing_carousels").update(payload).eq("id", slide.id);
    if (error) throw error;
  } else {
    const { error } = await sb.from("landing_carousels").insert(payload);
    if (error) throw error;
  }
}

export async function deleteCarousel(id: string) {
  const { error } = await sb.from("landing_carousels").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadCarouselImage(file: File): Promise<string> {
  const { compressImage } = await import("@/lib/storage");
  const compressed = await compressImage(file, { maxDim: 1920, quality: 0.85, maxBytes: 2 * 1024 * 1024 }).catch(() => file);
  const ext = (compressed.name.split(".").pop() || "webp").toLowerCase();
  const path = `carousel/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("landing-images").upload(path, compressed, {
    upsert: false,
    cacheControl: "3600",
    contentType: compressed.type || file.type,
  });
  if (error) throw error;
  const pub = supabase.storage.from("landing-images").getPublicUrl(path).data.publicUrl;
  const { data: signed } = await supabase.storage
    .from("landing-images")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  return signed?.signedUrl || pub;
}
