import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BACKUP_TABLES, type BackupFile } from "@/lib/backup-tables";

const ADMIN_ROLES = new Set(["owner", "admin", "superadmin"]);

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((r: any) => ADMIN_ROLES.has(String(r.role).toLowerCase()))) {
    throw new Error("Only owner or admin can export or restore backups");
  }
}

/** Full database dump of every public table (service-role, bypasses RLS). */
export const exportDatabase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tables: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    const skipped: { table: string; error: string }[] = [];
    const PAGE = 1000;

    for (const table of BACKUP_TABLES) {
      const rows: unknown[] = [];
      let from = 0;
      for (;;) {
        const { data, error } = await (supabaseAdmin as any)
          .from(table)
          .select("*")
          .range(from, from + PAGE - 1);
        if (error) {
          skipped.push({ table, error: error.message });
          break;
        }
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      tables[table] = rows;
      counts[table] = rows.length;
    }

    const dump: BackupFile = {
      format: "bakery-manager-db-dump",
      version: 1,
      createdAt: new Date().toISOString(),
      tables,
      counts,
    };
    return { dump, skipped };
  });

type RestoreInput = { dump: BackupFile };

/** Wipe every public table then re-insert the dump. Destructive. */
export const restoreDatabase = createServerFn({ method: "POST" })
  .inputValidator((data: RestoreInput) => {
    const dump = data?.dump as any;
    if (!dump || typeof dump !== "object" || !dump.tables || typeof dump.tables !== "object") {
      throw new Error("Invalid backup file");
    }
    if (dump.format !== "bakery-manager-db-dump") {
      throw new Error("This file is not a database backup created by this app");
    }
    return { dump: dump as BackupFile };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await ensureAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const errors: { table: string; stage: "delete" | "insert"; error: string }[] = [];
    const inserted: Record<string, number> = {};

    // 1) Wipe children first.
    for (const table of [...BACKUP_TABLES].reverse()) {
      const { error } = await (supabaseAdmin as any).from(table).delete().not("id", "is", null);
      if (error) errors.push({ table, stage: "delete", error: error.message });
    }

    // 2) Re-insert parents first, in chunks.
    const CHUNK = 500;
    for (const table of BACKUP_TABLES) {
      const rows = (data.dump.tables as any)[table] as any[] | undefined;
      if (!Array.isArray(rows) || rows.length === 0) continue;
      let ok = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await (supabaseAdmin as any).from(table).insert(chunk);
        if (error) {
          errors.push({ table, stage: "insert", error: error.message });
          break;
        }
        ok += chunk.length;
      }
      inserted[table] = ok;
    }

    return { inserted, errors };
  });
