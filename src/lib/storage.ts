import { supabase } from "@/integrations/supabase/client";

export type ImageBucket = "product-images" | "customer-avatars" | "company-logos" | "landing-images";

const SIGN_TTL = 60 * 60 * 24 * 365; // 1 year
const TWO_MB = 2 * 1024 * 1024;

// Compression defaults — tune per bucket if needed.
const COMPRESS_DEFAULTS: Record<ImageBucket, { maxDim: number; quality: number; maxBytes: number }> = {
  "product-images":   { maxDim: 1600, quality: 0.82, maxBytes: TWO_MB },
  "customer-avatars": { maxDim: 512,  quality: 0.85, maxBytes: TWO_MB },
  "company-logos":    { maxDim: 512,  quality: 0.9,  maxBytes: TWO_MB },
  "landing-images":   { maxDim: 1920, quality: 0.82, maxBytes: TWO_MB },
};

async function encode(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((res) => canvas.toBlob(res, mime, quality));
}

/**
 * Compress an image File to WebP (fallback JPEG) using a canvas.
 * Iteratively lowers quality and dimensions until output is under `maxBytes` (default 2MB).
 */
export async function compressImage(
  file: File,
  opts: { maxDim?: number; quality?: number; mime?: "image/webp" | "image/jpeg"; maxBytes?: number } = {},
): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") {
    return file;
  }
  const { maxDim = 1920, quality = 0.85, mime = "image/webp", maxBytes = TWO_MB } = opts;

  const bmp = await createImageBitmap(file).catch(() => null);
  const src: CanvasImageSource | null = bmp ?? (await loadHTMLImage(file));
  if (!src) return file;

  const iw = (src as any).width as number;
  const ih = (src as any).height as number;

  let dim = maxDim;
  let q = quality;
  let out: Blob | null = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, dim / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.drawImage(src, 0, 0, w, h);

    out = (await encode(canvas, mime, q)) ?? (await encode(canvas, "image/jpeg", q));
    if (out && out.size <= maxBytes) break;

    if (q > 0.55) q = Math.max(0.5, q - 0.1);
    else dim = Math.round(dim * 0.8);
  }

  if ("close" in (src as any)) (src as ImageBitmap).close();

  if (!out) return file;
  if (out.size >= file.size && file.size <= maxBytes) return file;

  const ext = out.type === "image/webp" ? "webp" : "jpg";
  const base = file.name.replace(/\.[^.]+$/, "");
  return new File([out], `${base}.${ext}`, { type: out.type });
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
 * Images are automatically compressed to fit under 2MB before upload.
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
