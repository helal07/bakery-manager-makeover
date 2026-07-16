import { supabase } from "@/integrations/supabase/client";
import { loadRecipeFor, commitProduction } from "@/lib/recipe-store";

const sb = supabase as any;

export type WorkOrderStatus = "pending" | "in_progress" | "done" | "cancelled";

export type WorkOrder = {
  id: string;
  product_id: string;
  product_name?: string;
  showroom_id: string | null;
  batch_qty: number;
  assigned_to: string | null;
  status: WorkOrderStatus;
  planned_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  batch_id: string | null;
  created_at: string;
};

export async function loadWorkOrders(showroomId: string | null): Promise<WorkOrder[]> {
  let q = sb
    .from("work_orders")
    .select("id,product_id,showroom_id,batch_qty,assigned_to,status,planned_date,started_at,completed_at,notes,batch_id,created_at,products(name)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (showroomId) q = q.eq("showroom_id", showroomId);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    product_name: r.products?.name,
    batch_qty: Number(r.batch_qty),
  }));
}

export async function createWorkOrder(input: {
  productId: string;
  showroomId: string | null;
  batchQty: number;
  plannedDate: string | null;
  assignedTo: string | null;
  notes: string | null;
}): Promise<void> {
  const { error } = await sb.from("work_orders").insert({
    product_id: input.productId,
    showroom_id: input.showroomId,
    batch_qty: input.batchQty,
    planned_date: input.plannedDate,
    assigned_to: input.assignedTo,
    notes: input.notes,
  });
  if (error) throw error;
}

export async function setWorkOrderStatus(id: string, status: WorkOrderStatus): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "in_progress") patch.started_at = new Date().toISOString();
  if (status === "done" || status === "cancelled") patch.completed_at = new Date().toISOString();
  const { error } = await sb.from("work_orders").update(patch).eq("id", id);
  if (error) throw error;
}

export async function completeWorkOrder(wo: WorkOrder): Promise<void> {
  const ingredients = await loadRecipeFor(wo.product_id);
  if (ingredients.length === 0) throw new Error("No recipe defined for this product");
  await commitProduction({
    productId: wo.product_id,
    showroomId: wo.showroom_id,
    batch: wo.batch_qty,
    ingredients,
  });
  await setWorkOrderStatus(wo.id, "done");
}

export async function deleteWorkOrder(id: string): Promise<void> {
  const { error } = await sb.from("work_orders").delete().eq("id", id);
  if (error) throw error;
}
