import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type PurchaseCategory = { id: string; name: string };
export type PurchaseItem = {
  materialId: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
};
export type Purchase = {
  id: string;         // human code, e.g. PO-12345
  uuid?: string;      // DB row id
  supplier: string;
  supplier_id?: string;
  category?: string;
  date: string;
  total: number;
  status: "Draft" | "Pending" | "Partial" | "Received";
  payment?: "Paid" | "Due" | "Partial";
  paid?: number;
  items?: PurchaseItem[];
};

export async function loadCategories(): Promise<PurchaseCategory[]> {
  const { data, error } = await sb
    .from("purchase_categories")
    .select("id,name,is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, name: r.name }));
}

export async function addCategory(name: string): Promise<PurchaseCategory> {
  const { data, error } = await sb
    .from("purchase_categories")
    .insert({ name })
    .select("id,name")
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name };
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const { error } = await sb.from("purchase_categories").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await sb
    .from("purchase_categories")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

export async function loadPurchases(showroomId?: string | null): Promise<Purchase[]> {
  let q = sb
    .from("purchases")
    .select(
      `id, code, purchase_date, total, paid, status, payment,
       supplier:suppliers(id,name),
       category:purchase_categories(id,name),
       purchase_items(material_id,name,unit,qty,price)`,
    )
    .order("purchase_date", { ascending: false });
  if (showroomId) q = q.eq("showroom_id", showroomId);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.code || r.id,
    uuid: r.id,
    supplier: r.supplier?.name ?? "",
    supplier_id: r.supplier?.id ?? undefined,
    category: r.category?.name,
    date: r.purchase_date,
    total: Number(r.total) || 0,
    paid: Number(r.paid) || 0,
    status: r.status as Purchase["status"],
    payment: (r.payment ?? undefined) as Purchase["payment"],
    items: (r.purchase_items ?? []).map((it: any) => ({
      materialId: it.material_id,
      name: it.name,
      unit: it.unit ?? "",
      qty: Number(it.qty) || 0,
      price: Number(it.price) || 0,
    })),
  }));
}

export type SavePurchaseInput = {
  supplier_id: string;
  showroom_id: string | null;
  date: string;
  items: PurchaseItem[];
  total: number;
  paid: number;
  payment: "Paid" | "Due" | "Partial";
  code?: string;
};

export async function savePurchase(input: SavePurchaseInput): Promise<Purchase> {
  const { data: userData } = await supabase.auth.getUser();
  const due = Math.max(0, input.total - input.paid);
  const code = input.code ?? `PO-${Date.now().toString().slice(-6)}`;
  const { data: p, error } = await sb
    .from("purchases")
    .insert({
      code,
      supplier_id: input.supplier_id,
      showroom_id: input.showroom_id,
      purchase_date: input.date,
      subtotal: input.total,
      discount: 0,
      tax: 0,
      total: input.total,
      paid: input.paid,
      due,
      status: "Received",
      payment: input.payment,
      created_by: userData.user?.id ?? null,
    })
    .select("id,code")
    .single();
  if (error) throw error;

  if (input.items.length) {
    const rows = input.items.map((it) => ({
      purchase_id: p.id,
      material_id: it.materialId,
      name: it.name,
      unit: it.unit,
      qty: it.qty,
      price: it.price,
    }));
    const { error: e2 } = await sb.from("purchase_items").insert(rows);
    if (e2) throw e2;
    for (const it of input.items) {
      const { error: e3 } = await sb.rpc("commit_raw_stock_movement", {
        _material_id: it.materialId,
        _showroom_id: input.showroom_id,
        _qty: it.qty,
        _kind: "purchase",
        _ref_type: "purchase",
        _ref_id: p.id,
      });
      if (e3) throw e3;
    }
  }
  return {
    id: p.code,
    uuid: p.id,
    supplier: "",
    date: input.date,
    total: input.total,
    paid: input.paid,
    status: "Received",
    payment: input.payment,
    items: input.items,
  };
}

export async function updatePurchasePayment(
  uuid: string,
  payment: "Paid" | "Due" | "Partial",
  paid: number,
  total: number,
): Promise<void> {
  const due = Math.max(0, total - paid);
  const { error } = await sb
    .from("purchases")
    .update({ payment, paid, due })
    .eq("id", uuid);
  if (error) throw error;
}
