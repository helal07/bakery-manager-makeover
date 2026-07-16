import { supabase } from "@/integrations/supabase/client";

export type ImageBucket = "product-images" | "customer-avatars" | "company-logos";

const SIGN_TTL = 60 * 60 * 24 * 365; // 1 year

// Compression defaults — tune per bucket if needed.
const COMPRESS_DEFAULTS: Record<ImageBucket, { maxDim: number; quality: number }> = {
  "product-images":   { maxDim: 1600, quality: 0.82 },
  "customer-avatars": { maxDim: 512,  quality: 0.85 },
  "company-logos":    { maxDim: 512,  quality: 0.9  },
};

/** Compress an image File to WebP (fallback JPEG) using a canvas. */
export async function compressImage(
  file: File,
  opts: { maxDim?: number; quality?: number; mime?: "image/webp" | "image/jpeg" } = {},
): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") {
    return file; // skip vectors & animations
  }
  const { maxDim = 1600, quality = 0.82, mime = "image/webp" } = opts;

  const bmp = await createImageBitmap(file).catch(() => null);
  const src: CanvasImageSource | null = bmp ?? (await loadHTMLImage(file));
  if (!src) return file;

  const iw = (src as any).width as number;
  const ih = (src as any).height as number;
  const scale = Math.min(1, maxDim / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(src, 0, 0, w, h);
  if ("close" in (src as any)) (src as ImageBitmap).close();

  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, mime, quality))
    ?? await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
  if (!blob || blob.size >= file.size) return file; // don't upsize

  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const base = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}

function loadHTMLImage(file: File): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function extOf(file: File): string {
  const m = /\.([a-z0-9]+)$/i.exec(file.name);
  return (m?.[1] || "png").toLowerCase();
}

/**
 * Upload a file to a private storage bucket and return a signed URL.
 * Images are automatically compressed before upload.
 */
export async function uploadImage(
  bucket: ImageBucket,
  key: string,
  file: File,
): Promise<{ path: string; url: string }> {
  const compressed = await compressImage(file, COMPRESS_DEFAULTS[bucket]).catch(() => file);
  const rand = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, "");
  const path = `${key}/${Date.now()}-${rand}.${extOf(compressed)}`;
  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, compressed, { upsert: false, contentType: compressed.type || undefined });
  if (upErr) throw upErr;
  const { data, error: signErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGN_TTL);
  if (signErr || !data) throw signErr ?? new Error("Failed to sign URL");
  return { path, url: data.signedUrl };
}

/** Refresh a signed URL for a stored object path (when it has expired). */
export async function signImagePath(bucket: ImageBucket, path: string) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGN_TTL);
  if (error || !data) throw error ?? new Error("Failed to sign URL");
  return data.signedUrl;
}
