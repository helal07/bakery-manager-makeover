import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type Unit = { id: string; code: string; name: string };

function mapError(e: any, action: string): Error {
  const msg = e?.message ?? String(e ?? "");
  if (/duplicate|unique/i.test(msg)) return new Error("A unit with that code already exists");
  if (/row-level security|permission|denied/i.test(msg)) {
    return new Error(`You don't have permission to ${action} units`);
  }
  return new Error(msg || `Failed to ${action} unit`);
}

export async function loadUnits(): Promise<Unit[]> {
  const { data, error } = await sb
    .from("units")
    .select("id,code,name")
    .eq("is_active", true)
    .order("code");
  if (error) throw mapError(error, "load");
  return (data ?? []) as Unit[];
}

export async function addUnit(code: string, name: string): Promise<Unit> {
  const c = code.trim();
  const n = name.trim();
  if (!c) throw new Error("Code is required (e.g. kg, L, pc)");
  if (!n) throw new Error("Name is required");
  const { data, error } = await sb
    .from("units")
    .insert({ code: c, name: n })
    .select("id,code,name")
    .single();
  if (error) throw mapError(error, "create");
  return data as Unit;
}

export async function renameUnit(id: string, code: string, name: string): Promise<Unit> {
  const { data, error } = await sb
    .from("units")
    .update({ code: code.trim(), name: name.trim() })
    .eq("id", id)
    .select("id,code,name")
    .single();
  if (error) throw mapError(error, "update");
  return data as Unit;
}

export async function removeUnit(id: string): Promise<void> {
  const { error } = await sb.from("units").update({ is_active: false }).eq("id", id);
  if (error) throw mapError(error, "delete");
}