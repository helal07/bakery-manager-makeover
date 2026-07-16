import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

// ---------- Register sessions ----------
export type RegisterSession = {
  id: string;
  status: "open" | "closed";
  opening_float: number;
  opened_at: string;
  showroom_id: string | null;
};

export async function getOpenRegister(showroomId: string | null): Promise<RegisterSession | null> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return null;
  let q = sb
    .from("cash_registers")
    .select("id,status,opening_float,opened_at,showroom_id")
    .eq("cashier_id", uid)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1);
  q = showroomId ? q.eq("showroom_id", showroomId) : q.is("showroom_id", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data?.[0] as RegisterSession) ?? null;
}

export async function openRegister(
  showroomId: string | null,
  openingFloat: number,
  note?: string,
): Promise<RegisterSession> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("Not signed in");
  const { data, error } = await sb
    .from("cash_registers")
    .insert({
      cashier_id: uid,
      showroom_id: showroomId,
      opening_float: openingFloat,
      note_open: note ?? null,
      status: "open",
    })
    .select("id,status,opening_float,opened_at,showroom_id")
    .single();
  if (error) throw error;
  return data as RegisterSession;
}

export type RegisterSummary = {
  cashSales: number;
  cardSales: number;
  mobileSales: number;
  bankSales: number;
  chequeSales: number;
  otherSales: number;
  totalSales: number;
  expectedCash: number;
  saleCount: number;
};

export async function summarizeRegister(reg: RegisterSession): Promise<RegisterSummary> {
  const { data: sales } = await sb
    .from("sales")
    .select("id,total")
    .eq("register_id", reg.id);
  const saleIds = (sales ?? []).map((s: any) => s.id);
  const totalSales = (sales ?? []).reduce((s: number, x: any) => s + Number(x.total || 0), 0);
  const saleCount = (sales ?? []).length;
  let cash = 0, card = 0, mobile = 0, bank = 0, cheque = 0, other = 0;
  if (saleIds.length) {
    const { data: pays } = await sb
      .from("sale_payments")
      .select("method,amount")
      .in("sale_id", saleIds);
    for (const p of pays ?? []) {
      const a = Number(p.amount || 0);
      if (p.method === "cash") cash += a;
      else if (p.method === "card") card += a;
      else if (p.method === "mobile") mobile += a;
      else if (p.method === "bank") bank += a;
      else if (p.method === "cheque") cheque += a;
      else other += a;
    }
  }
  return {
    cashSales: cash, cardSales: card, mobileSales: mobile,
    bankSales: bank, chequeSales: cheque, otherSales: other,
    totalSales, saleCount,
    expectedCash: Number(reg.opening_float || 0) + cash,
  };
}

export async function closeRegister(
  reg: RegisterSession,
  countedCash: number,
  note?: string,
): Promise<void> {
  const summary = await summarizeRegister(reg);
  const { error } = await sb
    .from("cash_registers")
    .update({
      status: "closed",
      closing_cash: countedCash,
      expected_cash: summary.expectedCash,
      difference: countedCash - summary.expectedCash,
      note_close: note ?? null,
      closed_at: new Date().toISOString(),
    })
    .eq("id", reg.id);
  if (error) throw error;
}

// ---------- Held sales ----------
export type HeldSaleSnapshot = {
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  cart: Record<string, number>;
  selectedGroupId: string;
};

export type HeldSaleRow = {
  id: string;
  label: string | null;
  item_count: number;
  total: number;
  created_at: string;
  snapshot: HeldSaleSnapshot;
};

export async function listHeldSales(showroomId: string | null): Promise<HeldSaleRow[]> {
  let q = sb
    .from("held_sales")
    .select("id,label,item_count,total,created_at,snapshot")
    .order("created_at", { ascending: false })
    .limit(50);
  q = showroomId ? q.eq("showroom_id", showroomId) : q.is("showroom_id", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as HeldSaleRow[];
}

export async function holdSale(
  showroomId: string | null,
  customerId: string | null,
  label: string | null,
  snapshot: HeldSaleSnapshot,
  itemCount: number,
  total: number,
): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null;
  const { error } = await sb.from("held_sales").insert({
    cashier_id: uid,
    showroom_id: showroomId,
    customer_id: customerId,
    label,
    snapshot,
    item_count: itemCount,
    total,
  });
  if (error) throw error;
}

export async function deleteHeldSale(id: string): Promise<void> {
  const { error } = await sb.from("held_sales").delete().eq("id", id);
  if (error) throw error;
}
