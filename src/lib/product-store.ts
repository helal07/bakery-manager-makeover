import { supabase } from "@/integrations/supabase/client";
import type { ProductCategory } from "./product-types";

const sb = supabase as any;

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  price: number;
  cost: number;
  /** Default price charged when the factory supplies this product to a showroom. */
  transferPrice: number;
  stock: number;
  threshold: number;
  mfgDate?: string;
  expiryDate?: string;
  shelfLifeDays?: number;
  imageUrl?: string;
  unit?: string;
  isActive?: boolean;
};

export type ProductInput = {
  sku: string;
  name: string;
  category: ProductCategory;
  unit?: string;
  price: number;
  cost?: number;
  transferPrice?: number;
  threshold?: number;
  mfgDate?: string;
  expiryDate?: string;
  shelfLifeDays?: number;
  imageUrl?: string;
};

function mapRow(r: any, stockMap: Map<string, { qty: number; min: number }>): Product {
  const s = stockMap.get(r.id);
  return {
    id: r.id,
    sku: r.sku ?? "",
    name: r.name,
    category: (r.category ?? "Cake") as ProductCategory,
    price: Number(r.price) || 0,
    cost: Number(r.cost) || 0,
    transferPrice: Number(r.transfer_price) || 0,
    stock: s?.qty ?? 0,
    threshold: s?.min ?? 0,
    mfgDate: r.mfg_date ?? undefined,
    expiryDate: r.expiry_date ?? undefined,
    shelfLifeDays: r.shelf_life_days ?? undefined,
    imageUrl: r.image_url ?? undefined,
    unit: r.unit ?? undefined,
    isActive: r.is_active ?? true,
  };
}
/** Find a product using this SKU (case-insensitive). Optionally ignore one id. */
export async function findProductBySku(
  sku: string,
  excludeId?: string,
): Promise<{ id: string; name: string; sku: string } | null> {
  const s = sku.trim();
  if (!s) return null;
  let q = sb.from("products").select("id,name,sku").ilike("sku", s).limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  if (error) throw error;
  const row = (data ?? [])[0];
  return row ? { id: row.id, name: row.name, sku: row.sku ?? "" } : null;
}

function friendlySkuError(error: any, sku: string) {
  const code = error?.code ?? "";
  const msg = String(error?.message ?? "");
  if (code === "23505" || msg.includes("products_sku_key")) {
    return new Error(`SKU "${sku}" is already used by another product`);
  }
  return error;
}


export async function loadProducts(
  showroomId?: string | null,
  opts?: { includeInactive?: boolean; aggregateAll?: boolean },
): Promise<Product[]> {
  let q = sb
    .from("products")
    .select("id,sku,name,category,price,cost,mfg_date,expiry_date,shelf_life_days,image_url,is_active,unit")
    .order("name");
  if (!opts?.includeInactive) q = q.eq("is_active", true);
  const { data: rows, error } = await q;
  if (error) throw error;

  let stockQ = sb.from("product_stock").select("product_id,showroom_id,quantity,min_stock");
  if (opts?.aggregateAll) {
    // no filter — sum across factory + all showrooms
  } else if (showroomId) {
    stockQ = stockQ.eq("showroom_id", showroomId);
  } else {
    stockQ = stockQ.is("showroom_id", null);
  }
  const { data: stocks, error: e2 } = await stockQ;
  if (e2) throw e2;

  const stockMap = new Map<string, { qty: number; min: number }>();
  for (const s of (stocks ?? []) as any[]) {
    const prev = stockMap.get(s.product_id);
    const qty = (prev?.qty ?? 0) + (Number(s.quantity) || 0);
    const min = Math.max(prev?.min ?? 0, Number(s.min_stock) || 0);
    stockMap.set(s.product_id, { qty, min });
  }
  return ((rows ?? []) as any[]).map((r) => mapRow(r, stockMap));
}

export async function addProduct(
  p: ProductInput,
  opts?: { showroomId?: string | null; openingStock?: number },
): Promise<Product> {
  // Auto-compute manufacture/expiry from shelf life when not provided.
  const today = new Date().toISOString().slice(0, 10);
  const mfg = p.mfgDate || (p.shelfLifeDays != null ? today : null);
  let expiry = p.expiryDate || null;
  if (!expiry && mfg && p.shelfLifeDays != null && p.shelfLifeDays > 0) {
    const d = new Date(mfg);
    d.setDate(d.getDate() + Number(p.shelfLifeDays));
    expiry = d.toISOString().slice(0, 10);
  }
  const { data, error } = await sb
    .from("products")
    .insert({
      sku: p.sku,
      name: p.name,
      category: p.category,
      unit: p.unit ?? null,
      price: p.price,
      cost: p.cost ?? 0,
      mfg_date: mfg,
      expiry_date: expiry,
      shelf_life_days: p.shelfLifeDays ?? null,
      image_url: p.imageUrl ?? null,
    })
    .select("id,sku,name,category,unit,price,cost,mfg_date,expiry_date,shelf_life_days,image_url")
    .single();
  if (error) throw friendlySkuError(error, p.sku);

  const threshold = p.threshold ?? 0;
  const opening = opts?.openingStock ?? 0;
  if (threshold > 0) {
    await sb.from("product_stock").upsert(
      { product_id: data.id, showroom_id: opts?.showroomId ?? null, min_stock: threshold, quantity: 0 },
      { onConflict: "product_id,showroom_id" },
    );
  }
  if (opening > 0) {
    await sb.rpc("commit_stock_movement", {
      _product_id: data.id,
      _showroom_id: opts?.showroomId ?? null,
      _qty: opening,
      _kind: "adjustment",
      _note: "Opening stock",
    });
  }
  return {
    id: data.id,
    sku: data.sku ?? "",
    name: data.name,
    category: data.category,
    unit: data.unit ?? undefined,
    price: Number(data.price) || 0,
    cost: Number(data.cost) || 0,
    stock: opening,
    threshold,
    mfgDate: data.mfg_date ?? undefined,
    expiryDate: data.expiry_date ?? undefined,
    shelfLifeDays: data.shelf_life_days ?? undefined,
    imageUrl: data.image_url ?? undefined,
  };
}

export async function updateProduct(
  id: string,
  patch: Partial<ProductInput>,
  opts?: { showroomId?: string | null },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.sku !== undefined) row.sku = patch.sku;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.unit !== undefined) row.unit = patch.unit || null;
  if (patch.price !== undefined) row.price = patch.price;
  if (patch.cost !== undefined) row.cost = patch.cost;
  if (patch.mfgDate !== undefined) row.mfg_date = patch.mfgDate || null;
  if (patch.expiryDate !== undefined) row.expiry_date = patch.expiryDate || null;
  if (patch.shelfLifeDays !== undefined) row.shelf_life_days = patch.shelfLifeDays ?? null;
  if (patch.imageUrl !== undefined) row.image_url = patch.imageUrl || null;
  if (Object.keys(row).length > 0) {
    const { error } = await sb.from("products").update(row).eq("id", id);
    if (error) throw friendlySkuError(error, patch.sku ?? "");
  }
  if (patch.threshold !== undefined) {
    const { error } = await sb.from("product_stock").upsert(
      { product_id: id, showroom_id: opts?.showroomId ?? null, min_stock: patch.threshold, quantity: 0 },
      { onConflict: "product_id,showroom_id", ignoreDuplicates: false },
    );
    if (error) throw error;
  }
}

export async function removeProduct(id: string): Promise<void> {
  const { error } = await sb.from("products").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}