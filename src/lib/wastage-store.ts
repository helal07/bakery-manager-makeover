import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type WastageEntry = {
  id: string;
  material_id: string;
  material_name?: string;
  showroom_id: string | null;
  qty: number;
  reason: string;
  notes: string | null;
  logged_at: string;
};

export async function loadWastage(showroomId: string | null): Promise<WastageEntry[]> {
  let q = sb
    .from("wastage_log")
    .select("id,material_id,showroom_id,qty,reason,notes,logged_at,raw_materials(name)")
    .order("logged_at", { ascending: false })
    .limit(500);
  if (showroomId) q = q.eq("showroom_id", showroomId);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    material_name: r.raw_materials?.name,
    qty: Number(r.qty),
  }));
}

export async function logWastage(input: {
  materialId: string;
  showroomId: string | null;
  qty: number;
  reason: string;
  notes: string | null;
}): Promise<void> {
  // Deduct from raw stock via RPC (enum 'wastage')
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
