import { supabase } from "@/integrations/supabase/client";

export type RawMaterial = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  threshold: number;
  expiry: string; // legacy UI field, no longer tracked
  cost: number;
};

const sb = supabase as any;

export async function loadRawMaterials(showroomId?: string | null): Promise<RawMaterial[]> {
  const { data: mats, error } = await sb
    .from("raw_materials")
    .select("id,name,unit,min_stock,cost,is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;

  let stockQ = sb.from("raw_material_stock").select("material_id,showroom_id,quantity");
  if (showroomId) stockQ = stockQ.eq("showroom_id", showroomId);
  else stockQ = stockQ.is("showroom_id", null);
  const { data: stocks, error: e2 } = await stockQ;
  if (e2) throw e2;

  const stockMap = new Map<string, number>();
  for (const s of (stocks ?? []) as any[]) {
    stockMap.set(s.material_id, Number(s.quantity) || 0);
  }

  return ((mats ?? []) as any[]).map((m) => ({
    id: m.id,
    name: m.name,
    unit: m.unit,
    stock: stockMap.get(m.id) ?? 0,
    threshold: Number(m.min_stock) || 0,
    expiry: "",
    cost: Number(m.cost) || 0,
  }));
}

export async function addRawMaterial(
  m: Omit<RawMaterial, "id" | "stock" | "expiry"> & { expiry?: string; stock?: number },
): Promise<RawMaterial> {
  const { data, error } = await sb
    .from("raw_materials")
    .insert({
      name: m.name,
      unit: m.unit || "unit",
      min_stock: m.threshold ?? 0,
      cost: m.cost ?? 0,
    })
    .select("id,name,unit,min_stock,cost")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    unit: data.unit,
    threshold: Number(data.min_stock) || 0,
    cost: Number(data.cost) || 0,
    stock: 0,
    expiry: "",
  };
}

export async function adjustRawStock(
  materialId: string,
  showroomId: string | null,
  delta: number,
  note?: string,
): Promise<void> {
  const { error } = await sb.rpc("commit_raw_stock_movement", {
    _material_id: materialId,
    _showroom_id: showroomId,
    _qty: delta,
    _kind: "adjustment",
    _note: note ?? null,
  });
  if (error) throw error;
}

export async function updateRawMaterial(
  id: string,
  patch: Partial<Pick<RawMaterial, "name" | "unit" | "cost" | "threshold">>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.cost !== undefined) row.cost = patch.cost;
  if (patch.threshold !== undefined) row.min_stock = patch.threshold;

  // A unit change would silently reinterpret every stock quantity stored in
  // raw_material_stock (which is denominated in the material's unit). Only
  // allow the change when there is no on-hand stock across all showrooms.
  if (patch.unit !== undefined) {
    const { data: current, error: e0 } = await sb
      .from("raw_materials")
      .select("unit")
      .eq("id", id)
      .single();
    if (e0) throw e0;
    if (current && current.unit !== patch.unit) {
      const { data: stocks, error: e1 } = await sb
        .from("raw_material_stock")
        .select("quantity")
        .eq("material_id", id);
      if (e1) throw e1;
      const total = (stocks ?? []).reduce(
        (s: number, r: any) => s + (Number(r.quantity) || 0),
        0,
      );
      if (Math.abs(total) > 1e-9) {
        throw new Error(
          `Cannot change unit while ${total} ${current.unit} of stock is on hand. Zero the stock (Stock Out) first, then change the unit.`,
        );
      }
      row.unit = patch.unit;
    }
  }

  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("raw_materials").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteRawMaterial(id: string): Promise<void> {
  // Soft delete so historical stock ledger / recipe references remain intact.
  const { error } = await sb
    .from("raw_materials")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}