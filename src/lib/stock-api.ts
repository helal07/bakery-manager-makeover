import { api } from "@/lib/api-client";

/** Stock reads through the Laravel API, shaped like the current database rows. */

async function fetchAll<T>(path: string, query: Record<string, any> = {}, location?: string | null): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const page = location === undefined
      ? await api.get<{ total: number; rows: T[] }>(path, { ...query, limit: 200, offset })
      : await (await import("@/lib/api-client")).apiRequest<{ total: number; rows: T[] }>("GET", path, {
          query: { ...query, limit: 200, offset },
          location: location ?? "factory",
        });
    out.push(...(page.rows ?? []));
    offset += 200;
    if (!page.rows?.length || offset >= Number(page.total ?? 0)) break;
  }
  return out;
}

export type ApiProduct = {
  id: string; name: string; sku: string | null; category: string | null; unit: string | null;
  price: number; cost: number;
};

export async function apiProducts(): Promise<ApiProduct[]> {
  const rows = await fetchAll<any>("products");
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku ?? null,
    category: p.category && typeof p.category === "object" ? p.category.name ?? null : p.category ?? null,
    unit: p.unit ?? null,
    price: Number(p.price ?? 0),
    cost: Number(p.cost ?? 0),
  }));
}

/** Rows like `product_stock` for one location (null = factory). */
export async function apiProductStock(loc: string | null) {
  const rows = await fetchAll<any>("stock/products", {}, loc);
  return rows.map((r) => ({
    product_id: r.product_id as string,
    quantity: Number(r.quantity ?? 0),
    min_stock: Number(r.min_stock ?? 0),
    updated_at: null as string | null,
  }));
}

/** Raw materials with factory stock. */
export async function apiRawMaterialsWithStock() {
  const [mats, stock] = await Promise.all([
    api.get<{ rows: any[] }>("materials"),
    fetchAll<any>("stock/materials", {}, null),
  ]);
  const map = new Map(stock.map((s) => [s.material_id, Number(s.quantity ?? 0)]));
  return (mats.rows ?? []).map((m) => ({
    id: m.id as string,
    name: m.name as string,
    unit: m.unit,
    min_stock: Number(m.min_stock ?? 0),
    cost: Number(m.cost ?? 0),
    is_active: m.is_active !== false,
    stock: map.get(m.id) ?? 0,
  }));
}

/** Supabase-style `{ data, error }` wrappers so screens can swap one call. */
export async function apiProductsResult() {
  try { return { data: await apiProducts(), error: null as any }; }
  catch (error: any) { return { data: [] as ApiProduct[], error }; }
}
export async function apiProductStockResult(loc: string | null) {
  try { return { data: await apiProductStock(loc), error: null as any }; }
  catch (error: any) { return { data: [] as Awaited<ReturnType<typeof apiProductStock>>, error }; }
}
