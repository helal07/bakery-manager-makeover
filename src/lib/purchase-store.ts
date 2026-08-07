import { supabase } from "@/integrations/supabase/client";
import { scopeTo } from "@/lib/scope";

const sb = supabase as any;

/**
 * Turn raw Postgres/PostgREST errors from the stock RPCs into messages a user
 * can act on. The most common self-hosted failure is a database that never got
 * the staff-guard helper installed (see sql/29_missing_staff_guard.sql).
 */
export function explainStockRpcError(err: any): Error {
  const msg = String(err?.message ?? err ?? "Unknown error");
  if (/assert_app_staff|is_app_staff/.test(msg) && /does not exist/i.test(msg)) {
    return new Error(
      "Stock could not be updated: the database is missing the staff-permission guard " +
        "(public.assert_app_staff). Run sql/29_missing_staff_guard.sql on your database, " +
        "then try the purchase again.",
    );
  }
  if (/Not authorized for this location/i.test(msg)) {
    return new Error(
      "Stock could not be updated: your account is not assigned to this location. " +
        "Raw materials belong to the Factory — pick Factory scope or ask an admin to assign you.",
    );
  }
  if (/Not authorized/i.test(msg)) {
    return new Error(
      "Stock could not be updated: your account has no role assigned yet. " +
        "Ask a Superadmin to assign a role under Settings → Roles & Teams.",
    );
  }
  return err instanceof Error ? err : new Error(msg);
}


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
  q = scopeTo(q, showroomId, "showroom_id");
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

  // Guard against duplicate purchases: retrying a failed save keeps the same
  // reference number, which previously created several identical rows.
  const { data: dup, error: dupErr } = await sb
    .from("purchases")
    .select("id")
    .eq("code", code)
    .limit(1);
  if (dupErr) throw dupErr;
  if (dup && dup.length > 0)
    throw new Error(
      `Purchase ${code} already exists. Change the reference no. or open the existing purchase to edit it.`,
    );

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
    // If any step below fails the purchase header must not survive, otherwise
    // the list fills up with half-saved purchases that carry no stock.
    const rollback = async () => {
      await sb.from("purchase_items").delete().eq("purchase_id", p.id);
      await sb.from("purchases").delete().eq("id", p.id);
    };
    const rows = input.items.map((it) => ({
      purchase_id: p.id,
      material_id: it.materialId,
      name: it.name,
      unit: it.unit,
      qty: it.qty,
      price: it.price,
    }));
    const { error: e2 } = await sb.from("purchase_items").insert(rows);
    if (e2) {
      await rollback();
      throw explainStockRpcError(e2);
    }
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
      if (e3) {
        await rollback();
        throw explainStockRpcError(e3);
      }
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
  if (e2) throw explainStockRpcError(e2);
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
    if (e3) throw explainStockRpcError(e3);
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
    if (e4) throw explainStockRpcError(e4);
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
    if (e2) throw explainStockRpcError(e2);
  }

  const { error: e3 } = await sb.from("purchase_items").delete().eq("purchase_id", uuid);
  if (e3) throw explainStockRpcError(e3);
  const { error: e4 } = await sb.from("purchases").delete().eq("id", uuid);
  if (e4) throw explainStockRpcError(e4);
}
