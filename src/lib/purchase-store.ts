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
        // Raw material stock lives at the factory only (showroom_id IS NULL).
        _showroom_id: null,

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

/** Load a single purchase (by DB uuid) with its item lines, for editing. */
export async function loadPurchase(uuid: string): Promise<Purchase | null> {
  const { data, error } = await sb
    .from("purchases")
    .select(
      `id, code, purchase_date, total, paid, status, payment, supplier_id,
       supplier:suppliers(id,name),
       purchase_items(material_id,name,unit,qty,price)`,
    )
    .eq("id", uuid)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as any;
  return {
    id: r.code || r.id,
    uuid: r.id,
    supplier: r.supplier?.name ?? "",
    supplier_id: r.supplier_id ?? r.supplier?.id ?? undefined,
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
  };
}

/**
 * Update an existing purchase. Raw stock is adjusted by the DIFFERENCE per
 * material through the ledger RPC (kind `purchase_edit`) so balances stay
 * correct and history stays auditable.
 */
export async function updatePurchase(
  uuid: string,
  input: Omit<SavePurchaseInput, "showroom_id"> & { showroom_id?: string | null },
): Promise<void> {
  const { data: oldRows, error: e0 } = await sb
    .from("purchase_items")
    .select("material_id,qty")
    .eq("purchase_id", uuid);
  if (e0) throw e0;

  const delta = new Map<string, number>();
  for (const r of oldRows ?? []) {
    if (!r.material_id) continue;
    delta.set(r.material_id, (delta.get(r.material_id) ?? 0) - (Number(r.qty) || 0));
  }
  for (const it of input.items) {
    delta.set(it.materialId, (delta.get(it.materialId) ?? 0) + it.qty);
  }

  const due = Math.max(0, input.total - input.paid);
  const { error: e1 } = await sb
    .from("purchases")
    .update({
      supplier_id: input.supplier_id,
      purchase_date: input.date,
      subtotal: input.total,
      total: input.total,
      paid: input.paid,
      due,
      payment: input.payment,
      ...(input.code ? { code: input.code } : {}),
    })
    .eq("id", uuid);
  if (e1) throw e1;

  const { error: e2 } = await sb.from("purchase_items").delete().eq("purchase_id", uuid);
  if (e2) throw e2;
  if (input.items.length) {
    const rows = input.items.map((it) => ({
      purchase_id: uuid,
      material_id: it.materialId,
      name: it.name,
      unit: it.unit,
      qty: it.qty,
      price: it.price,
    }));
    const { error: e3 } = await sb.from("purchase_items").insert(rows);
    if (e3) throw e3;
  }

  for (const [materialId, qty] of delta) {
    if (Math.abs(qty) < 1e-9) continue;
    const { error: e4 } = await sb.rpc("commit_raw_stock_movement", {
      _material_id: materialId,
      // Raw material stock lives at the factory only (showroom_id IS NULL).
      _showroom_id: null,
      _qty: qty,
      _kind: "purchase_edit",
      _ref_type: "purchase",
      _ref_id: uuid,
    });
    if (e4) throw e4;
  }
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

/**
 * Delete a purchase and reverse its raw-material stock effect.
 * Stock is reversed through the ledger RPC (negative qty) so history stays auditable.
 */
export async function deletePurchase(uuid: string): Promise<void> {
  const { data: rows, error } = await sb
    .from("purchase_items")
    .select("material_id,qty")
    .eq("purchase_id", uuid);
  if (error) throw error;

  for (const r of rows ?? []) {
    if (!r.material_id || !r.qty) continue;
    const { error: e2 } = await sb.rpc("commit_raw_stock_movement", {
      _material_id: r.material_id,
      // Raw material stock lives at the factory only (showroom_id IS NULL).
      _showroom_id: null,
      _qty: -Number(r.qty),
      _kind: "purchase_delete",
      _ref_type: "purchase",
      _ref_id: uuid,
    });
    if (e2) throw e2;
  }

  const { error: e3 } = await sb.from("purchase_items").delete().eq("purchase_id", uuid);
  if (e3) throw e3;
  const { error: e4 } = await sb.from("purchases").delete().eq("id", uuid);
  if (e4) throw e4;
}
