import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type AuditEntry = {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  showroom_id: string | null;
  changed_fields: string[] | null;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  note: string | null;
};

export type AuditFilters = {
  from?: string; // yyyy-mm-dd
  to?: string; // yyyy-mm-dd
  actorEmail?: string;
  table?: string;
  action?: string;
  page?: number;
  pageSize?: number;
};

export const AUDIT_PAGE_SIZE = 50;

export async function loadAuditLog(
  f: AuditFilters = {},
): Promise<{ rows: AuditEntry[]; total: number }> {
  const pageSize = f.pageSize ?? AUDIT_PAGE_SIZE;
  const page = Math.max(0, f.page ?? 0);
  let q = sb
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (f.from) q = q.gte("occurred_at", new Date(`${f.from}T00:00:00`).toISOString());
  if (f.to) q = q.lte("occurred_at", new Date(`${f.to}T23:59:59`).toISOString());
  if (f.actorEmail) q = q.eq("actor_email", f.actorEmail);
  if (f.table) q = q.eq("table_name", f.table);
  if (f.action) q = q.eq("action", f.action);

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as AuditEntry[], total: count ?? 0 };
}

/** Distinct actors seen in the log (for the filter dropdown). */
export async function loadAuditActors(): Promise<string[]> {
  const { data, error } = await sb
    .from("audit_log")
    .select("actor_email")
    .not("actor_email", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(2000);
  if (error) return [];
  return Array.from(new Set(((data ?? []) as any[]).map((r) => r.actor_email))).sort();
}

/** Distinct tables seen in the log (for the filter dropdown). */
export async function loadAuditTables(): Promise<string[]> {
  const { data, error } = await sb
    .from("audit_log")
    .select("table_name")
    .not("table_name", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(2000);
  if (error) return [];
  return Array.from(new Set(((data ?? []) as any[]).map((r) => r.table_name))).sort();
}

export async function purgeAuditLog(before: Date): Promise<number> {
  const { data, error } = await sb.rpc("purge_audit_log", { _before: before.toISOString() });
  if (error) throw error;
  return Number(data) || 0;
}

/** Best-effort: record a sign-in. Never blocks or fails the login flow. */
export async function logLoginEvent(note?: string): Promise<void> {
  try {
    await sb.rpc("log_audit_event", {
      _action: "login",
      _table_name: null,
      _record_id: null,
      _note: note ?? "Signed in",
    });
  } catch {
    /* logging must never break sign-in */
  }
}

/** Human labels for the raw table names stored in the log. */
export const AUDIT_TABLE_LABELS: Record<string, string> = {
  sales: "Sales",
  sale_items: "Sale items",
  sale_returns: "Sale returns",
  customer_payments: "Customer payments",
  purchases: "Purchases",
  purchase_items: "Purchase items",
  purchase_returns: "Purchase returns",
  supplier_payments: "Supplier payments",
  transfers: "Transfers",
  transfer_items: "Transfer items",
  products: "Products",
  raw_materials: "Raw materials",
  recipes: "Recipes",
  sub_recipes: "Sub-recipes",
  sub_recipe_items: "Sub-recipe items",
  wastage_log: "Wastage log",
  repurpose_queue: "Repurpose queue",
  production_overheads: "Production overheads",
  production_batches: "Production batches",
  customers: "Customers",
  suppliers: "Suppliers",
  showrooms: "Showrooms",
  company_settings: "Company settings",
  employees: "Employees",
  app_roles: "Roles",
  role_permissions: "Role permissions",
  user_role_assignments: "User role assignments",
  user_roles: "Legacy user roles",
};

export function auditTableLabel(t: string | null | undefined): string {
  if (!t) return "—";
  return AUDIT_TABLE_LABELS[t] ?? t;
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  insert: "Created",
  update: "Updated",
  delete: "Deleted",
  login: "Signed in",
  logout: "Signed out",
  rpc: "Action",
};

export function auditActionLabel(a: string): string {
  return AUDIT_ACTION_LABELS[a] ?? a;
}

/** Pretty-print a jsonb value for the diff view. */
export function formatAuditValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export type AuditDiffRow = { field: string; before: string; after: string };

export function auditDiffRows(entry: AuditEntry): AuditDiffRow[] {
  const fields =
    entry.changed_fields && entry.changed_fields.length
      ? entry.changed_fields
      : Array.from(
          new Set([
            ...Object.keys(entry.new_data ?? {}),
            ...Object.keys(entry.old_data ?? {}),
          ]),
        ).filter((k) => !["created_at", "updated_at"].includes(k));
  return fields.map((f) => ({
    field: f,
    before: formatAuditValue(entry.old_data?.[f]),
    after: formatAuditValue(entry.new_data?.[f]),
  }));
}
