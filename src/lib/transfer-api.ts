import { api, apiRequest } from "@/lib/api-client";

/** Transfer calls to the Laravel API, shaped like the current database rows. */

export async function apiTransferList(): Promise<any[]> {
  const res = await api.get<{ rows: any[] }>("transfers", { limit: 200 });
  return res.rows ?? [];
}

/** Rows like `transfer_items`. */
export async function apiTransferItems(id: string): Promise<any[]> {
  const res = await api.get<{ items: any[] }>(`transfers/${id}`);
  return (res.items ?? []).map((i) => ({ ...i, transfer_id: id, qty: Number(i.qty), unit_price: i.unit_price == null ? null : Number(i.unit_price) }));
}

export async function apiTransferById(id: string): Promise<{ transfer: any; items: any[] }> {
  const res = await api.get<{ transfer: any; items: any[] }>(`transfers/${id}`);
  return { transfer: res.transfer, items: await Promise.resolve((res.items ?? []).map((i) => ({ ...i, qty: Number(i.qty) }))) };
}

export const apiTransferSend = (id: string) => api.post(`transfers/${id}/send`);
export const apiTransferReceive = (id: string) => api.post(`transfers/${id}/receive`);
export const apiTransferApproveDamaged = (id: string) => api.post(`transfers/${id}/approve-damaged`);
export const apiTransferCancel = (id: string) => api.post(`transfers/${id}/cancel`);

export async function apiTransferCreate(source: string | null, body: {
  destShowroomId: string | null;
  kind?: string;
  note?: string | null;
  items: { productId?: string | null; materialId?: string | null; qty: number; unitPrice?: number | null }[];
}): Promise<string> {
  const res = await apiRequest<{ id: string }>("POST", "transfers", { body, location: source ?? "factory" });
  return res.id;
}

/** Rows like `damaged_stock` for one showroom. */
export async function apiDamagedStock(showroomId: string): Promise<{ product_id: string; showroom_id: string; quantity: number }[]> {
  const res = await apiRequest<{ rows: any[] }>("GET", "stock/damaged", { location: showroomId });
  return (res.rows ?? []).map((r) => ({ product_id: r.product_id, showroom_id: showroomId, quantity: Number(r.quantity ?? 0) }));
}
