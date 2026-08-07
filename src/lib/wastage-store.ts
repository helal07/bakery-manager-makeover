import { supabase } from "@/integrations/supabase/client";
import { scopeTo } from "@/lib/scope";

const sb = supabase as any;

export type WastageEntry = {
  id: string;
  material_id: string | null;
  material_name?: string;
  product_id?: string | null;
  product_name?: string;
  showroom_id: string | null;
  qty: number;
  reason: string;
  notes: string | null;
  logged_at: string;
  origin: "material" | "product";
};

export async function loadWastage(showroomId: string | null): Promise<WastageEntry[]> {
  let q = sb
    .from("wastage_log")
    .select(
      "id,material_id,product_id,showroom_id,qty,reason,notes,logged_at,raw_materials(name),products(name)",
    )
    .order("logged_at", { ascending: false })
    .limit(500);
  q = scopeTo(q, showroomId, "showroom_id");
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    material_name: r.raw_materials?.name,
    product_name: r.products?.name,
    qty: Number(r.qty),
    origin: r.product_id ? "product" : "material",
  }));
}

export async function logWastage(input: {
  materialId: string;
  showroomId: string | null;
  qty: number;
  reason: string;
  notes: string | null;
}): Promise<void> {
  const { data: ledgerId, error: rpcErr } = await sb.rpc("commit_raw_stock_movement", {
    _material_id: input.materialId,
    _showroom_id: input.showroomId,
    _qty: -Math.abs(input.qty),
    _kind: "wastage",
    _ref_type: "wastage",
    _ref_id: null,
    _note: input.reason,
  });
  if (rpcErr) throw rpcErr;

  const { error } = await sb.from("wastage_log").insert({
    material_id: input.materialId,
    showroom_id: input.showroomId,
    qty: input.qty,
    reason: input.reason,
    notes: input.notes,
    ref_ledger_id: ledgerId,
  });
  if (error) throw error;
}

/**
 * Finished-product wastage:
 * - Deducts from product_stock
 * - Moves qty into damaged_stock at the same location
 * - Queues into repurpose_queue so it can be sold, repurposed, or discarded
 * - Records a wastage_log row for the audit trail
 */
export async function logFinishedProductWastage(input: {
  productId: string;
  showroomId: string | null;
  qty: number;
  reason: string;
  notes: string | null;
}): Promise<void> {
  const { error: rpcErr } = await sb.rpc("log_finished_product_wastage", {
    _product_id: input.productId,
    _showroom_id: input.showroomId,
    _qty: Math.abs(input.qty),
    _reason: input.reason,
    _note: input.notes,
  });
  if (rpcErr) throw rpcErr;

  // Audit trail row (best-effort; the RPC has already moved stock)
  await sb.from("wastage_log").insert({
    product_id: input.productId,
    showroom_id: input.showroomId,
    qty: input.qty,
    reason: input.reason,
    notes: input.notes,
  });
}

/** Sell damaged goods to recover revenue (feed / discounted resale). */
export async function sellDamagedGoods(input: {
  productId: string;
  showroomId: string | null;
  qty: number;
  unitPrice: number;
  customerName?: string | null;
  note?: string | null;
}): Promise<void> {
  const { error } = await sb.rpc("commit_damaged_sale", {
    _product_id: input.productId,
    _showroom_id: input.showroomId,
    _qty: Math.abs(input.qty),
    _unit_price: input.unitPrice,
    _customer_name: input.customerName ?? null,
    _note: input.note ?? null,
  });
  if (error) throw error;
}
