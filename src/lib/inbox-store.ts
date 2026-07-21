import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type IncomingTransfer = {
  id: string;
  code: string | null;
  status: string;
  source_showroom_id: string | null;
  dest_showroom_id: string;
  note: string | null;
  kind: "normal" | "damaged_return" | null;
  created_at: string;
  sent_at: string | null;
};

export type IncomingTransferItem = {
  id: string;
  transfer_id: string;
  product_id: string | null;
  qty: number;
};

/**
 * Pending inbound transfers to a specific showroom (status = 'sent').
 * Factory (null) has no inbound transfers — sender-side.
 */
export async function loadIncomingTransfers(showroomId: string | null): Promise<IncomingTransfer[]> {
  if (!showroomId) return [];
  const { data, error } = await sb
    .from("transfers")
    .select("*")
    .eq("dest_showroom_id", showroomId)
    .eq("status", "sent")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as IncomingTransfer[];
}

export async function countIncomingTransfers(showroomId: string | null): Promise<number> {
  if (!showroomId) return 0;
  const { count, error } = await sb
    .from("transfers")
    .select("id", { count: "exact", head: true })
    .eq("dest_showroom_id", showroomId)
    .eq("status", "sent");
  if (error) return 0;
  return count ?? 0;
}

export async function loadTransferItems(transferId: string): Promise<IncomingTransferItem[]> {
  const { data, error } = await sb
    .from("transfer_items")
    .select("id,transfer_id,product_id,qty")
    .eq("transfer_id", transferId);
  if (error) throw error;
  return (data ?? []) as IncomingTransferItem[];
}

export async function receiveTransfer(t: IncomingTransfer): Promise<void> {
  if (t.kind === "damaged_return") {
    const { error } = await sb.rpc("commit_damaged_transfer_approve", { _transfer_id: t.id });
    if (error) throw error;
    return;
  }
  const items = await loadTransferItems(t.id);
  for (const it of items) {
    if (!it.product_id) continue;
    const { error } = await sb.rpc("commit_stock_movement", {
      _product_id: it.product_id,
      _showroom_id: t.dest_showroom_id,
      _qty: Number(it.qty),
      _kind: "transfer_in",
      _ref_type: "transfer",
      _ref_id: t.id,
      _note: null,
    });
    if (error) throw error;
  }
  const { error: upErr } = await sb
    .from("transfers")
    .update({ status: "received", received_at: new Date().toISOString() })
    .eq("id", t.id);
  if (upErr) throw upErr;
}
