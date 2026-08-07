import { supabase } from "@/integrations/supabase/client";
import { scopeTo } from "@/lib/scope";

export type Expense = {
  id: string;
  date: string;
  category: string;
  desc: string;
  amount: number;
  showroom_id?: string | null;
};

const sb = supabase as any;

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Rent",
  "Salary",
  "Utilities",
  "Transportation",
  "Supplies",
  "Marketing",
  "Maintenance",
  "Other",
] as const;

// Back-compat alias – existing code imports EXPENSE_CATEGORIES.
export const EXPENSE_CATEGORIES = DEFAULT_EXPENSE_CATEGORIES;

export type ExpenseCategory = { id: string; name: string; is_active: boolean };

export async function loadExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data, error } = await sb
    .from("expense_categories")
    .select("id,name,is_active")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ExpenseCategory[];
}

export async function addExpenseCategory(name: string): Promise<ExpenseCategory> {
  const { data, error } = await sb
    .from("expense_categories")
    .insert({ name: name.trim() })
    .select("id,name,is_active")
    .single();
  if (error) throw error;
  return data as ExpenseCategory;
}

export async function updateExpenseCategory(id: string, patch: Partial<Pick<ExpenseCategory, "name" | "is_active">>): Promise<void> {
  const { error } = await sb.from("expense_categories").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteExpenseCategory(id: string): Promise<void> {
  const { error } = await sb.from("expense_categories").delete().eq("id", id);
  if (error) throw error;
}

function toExpense(r: any): Expense {
  return {
    id: r.id,
    date: r.expense_date,
    category: r.category,
    desc: r.description ?? "",
    amount: Number(r.amount) || 0,
    showroom_id: r.showroom_id ?? null,
  };
}

export async function loadExpenses(showroomId?: string | null): Promise<Expense[]> {
  let q = sb.from("expenses").select("*").order("expense_date", { ascending: false });
  q = scopeTo(q, showroomId, "showroom_id");
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toExpense);
}

export async function addExpense(
  input: Omit<Expense, "id">,
): Promise<Expense> {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await sb
    .from("expenses")
    .insert({
      expense_date: input.date,
      category: input.category,
      description: input.desc,
      amount: input.amount,
      showroom_id: input.showroom_id ?? null,
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toExpense(data);
}

export async function updateExpense(
  id: string,
  patch: Partial<Omit<Expense, "id">>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.date !== undefined) row.expense_date = patch.date;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.desc !== undefined) row.description = patch.desc;
  if (patch.amount !== undefined) row.amount = patch.amount;
  if (patch.showroom_id !== undefined) row.showroom_id = patch.showroom_id;
  const { error } = await sb.from("expenses").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await sb.from("expenses").delete().eq("id", id);
  if (error) throw error;
}