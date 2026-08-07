import { supabase } from "@/integrations/supabase/client";
import { scopeTo } from "@/lib/scope";

const sb = supabase as any;

export type QcResult = "pass" | "fail";

export type QcCheck = {
  id: string;
  batch_id: string;
  product_id: string | null;
  showroom_id: string | null;
  result: QcResult;
  notes: string | null;
  checked_at: string;
};

export type BatchWithQc = {
  batch_id: string;
  product_id: string;
  product_name?: string;
  showroom_id: string | null;
  qty: number;
  created_at: string;
  qc?: QcCheck;
};

export async function loadRecentBatchesWithQc(showroomId: string | null): Promise<BatchWithQc[]> {
  let q = sb
    .from("stock_ledger")
    .select("id,product_id,showroom_id,qty,created_at,products(name)")
    .eq("kind", "production")
    .order("created_at", { ascending: false })
    .limit(100);
  q = scopeTo(q, showroomId, "showroom_id");
  const { data: batches, error } = await q;
  if (error) throw error;

  const ids = ((batches ?? []) as any[]).map((b) => b.id);
  const qcMap: Record<string, QcCheck> = {};
  if (ids.length > 0) {
    const { data: qcs } = await sb.from("qc_checks").select("*").in("batch_id", ids);
    for (const q of (qcs ?? []) as QcCheck[]) qcMap[q.batch_id] = q;
  }

  return ((batches ?? []) as any[]).map((b) => ({
    batch_id: b.id,
    product_id: b.product_id,
    product_name: b.products?.name,
    showroom_id: b.showroom_id,
    qty: Number(b.qty),
    created_at: b.created_at,
    qc: qcMap[b.id],
  }));
}

export async function upsertQc(input: {
  batchId: string;
  productId: string;
  showroomId: string | null;
  result: QcResult;
  notes: string | null;
}): Promise<void> {
  // Delete existing then insert (simple upsert without a unique constraint)
  await sb.from("qc_checks").delete().eq("batch_id", input.batchId);
  const { error } = await sb.from("qc_checks").insert({
    batch_id: input.batchId,
    product_id: input.productId,
    showroom_id: input.showroomId,
    result: input.result,
    notes: input.notes,
  });
  if (error) throw error;
}
