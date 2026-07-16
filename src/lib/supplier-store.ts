import { supabase } from "@/integrations/supabase/client";

export type Supplier = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  category: string;
};

const sb = supabase as any;

export async function loadSuppliers(): Promise<Supplier[]> {
  const { data, error } = await sb
    .from("suppliers")
    .select("id,name,contact,phone,category,is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    contact: r.contact ?? "",
    phone: r.phone ?? "",
    category: r.category ?? "General",
  }));
}

export async function addSupplier(s: Omit<Supplier, "id">): Promise<Supplier> {
  const { data, error } = await sb
    .from("suppliers")
    .insert({
      name: s.name,
      contact: s.contact || null,
      phone: s.phone || null,
      category: s.category || "General",
    })
    .select("id,name,contact,phone,category")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    contact: data.contact ?? "",
    phone: data.phone ?? "",
    category: data.category ?? "General",
  };
}