import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type Unit = {
  id: string;
  code: string;
  name: string;
  /** When set, this unit is a multiple of another unit (e.g. 1 kg = 1000 g). */
  base_unit_id?: string | null;
  conversion_factor?: number | null;
  allow_decimal?: boolean;
};

const COLS = "id,code,name,base_unit_id,conversion_factor,allow_decimal";

function mapError(e: any, action: string): Error {
  const msg = e?.message ?? String(e ?? "");
  if (/duplicate|unique/i.test(msg)) return new Error("A unit with that code already exists");
  if (/row-level security|permission|denied/i.test(msg)) {
    return new Error(`You don't have permission to ${action} units`);
  }
  return new Error(msg || `Failed to ${action} unit`);
}

function normalize(row: any): Unit {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    base_unit_id: row.base_unit_id ?? null,
    conversion_factor:
      row.conversion_factor === null || row.conversion_factor === undefined
        ? null
        : Number(row.conversion_factor),
    allow_decimal: row.allow_decimal ?? true,
  };
}

export async function loadUnits(): Promise<Unit[]> {
  const { data, error } = await sb
    .from("units")
    .select(COLS)
    .eq("is_active", true)
    .order("code");
  if (error) {
    // Fallback for databases where patch 21 has not been applied yet.
    if (/column .* does not exist/i.test(error.message ?? "")) {
      const { data: d2, error: e2 } = await sb
        .from("units")
        .select("id,code,name")
        .eq("is_active", true)
        .order("code");
      if (e2) throw mapError(e2, "load");
      return (d2 ?? []).map(normalize);
    }
    throw mapError(error, "load");
  }
  return (data ?? []).map(normalize);
}

export type UnitInput = {
  code: string;
  name: string;
  base_unit_id?: string | null;
  conversion_factor?: number | null;
  allow_decimal?: boolean;
};

function validate(input: UnitInput) {
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code) throw new Error("Code is required (e.g. kg, L, pc)");
  if (!name) throw new Error("Name is required");
  const isSub = !!input.base_unit_id;
  const factor = Number(input.conversion_factor);
  if (isSub && !(factor > 0)) {
    throw new Error("Conversion factor must be greater than zero");
  }
  return {
    code,
    name,
    base_unit_id: isSub ? input.base_unit_id : null,
    conversion_factor: isSub ? factor : null,
    allow_decimal: input.allow_decimal ?? true,
  };
}

export async function addUnit(input: UnitInput): Promise<Unit> {
  const payload = validate(input);
  const { data, error } = await sb.from("units").insert(payload).select(COLS).single();
  if (error) throw mapError(error, "create");
  return normalize(data);
}

/** How many live records reference this unit code. Used to protect live data. */
export async function unitUsageCount(code: string): Promise<number> {
  const c = code.trim();
  if (!c) return 0;
  const queries = [
    sb.from("raw_materials").select("id", { count: "exact", head: true }).eq("unit", c),
    sb.from("products").select("id", { count: "exact", head: true }).eq("unit", c),
    sb.from("sub_recipes").select("id", { count: "exact", head: true }).eq("yield_unit", c),
  ];
  const results = await Promise.all(queries.map((q: any) => q.then((r: any) => r).catch(() => null)));
  return results.reduce((s: number, r: any) => s + (r?.count ?? 0), 0);
}

export async function updateUnit(id: string, input: UnitInput): Promise<Unit> {
  const payload = validate(input);
  if (payload.base_unit_id === id) throw new Error("A unit cannot be a multiple of itself");

  // Renaming a code that live records point at would orphan those records.
  const { data: existing } = await sb.from("units").select("code").eq("id", id).single();
  if (existing && existing.code !== payload.code) {
    const used = await unitUsageCount(existing.code);
    if (used > 0) {
      throw new Error(
        `"${existing.code}" is used by ${used} record(s). Create a new unit instead of renaming this one.`,
      );
    }
  }

  const { data, error } = await sb.from("units").update(payload).eq("id", id).select(COLS).single();
  if (error) throw mapError(error, "update");
  return normalize(data);
}

/** Kept for backwards compatibility with older call sites. */
export async function renameUnit(id: string, code: string, name: string): Promise<Unit> {
  return updateUnit(id, { code, name });
}

export async function removeUnit(id: string): Promise<void> {
  const { data: existing } = await sb.from("units").select("code").eq("id", id).single();
  if (existing) {
    const used = await unitUsageCount(existing.code);
    if (used > 0) {
      throw new Error(`"${existing.code}" is used by ${used} record(s) and cannot be removed.`);
    }
  }
  const { data: children } = await sb.from("units").select("id").eq("base_unit_id", id).limit(1);
  if ((children ?? []).length > 0) {
    throw new Error("Another unit is defined as a multiple of this one. Remove that unit first.");
  }
  const { error } = await sb.from("units").update({ is_active: false }).eq("id", id);
  if (error) throw mapError(error, "delete");
}
