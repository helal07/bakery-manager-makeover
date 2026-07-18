import { supabase } from "@/integrations/supabase/client";

export type Supplier = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
};

const sb = supabase as any;

export async function loadSuppliers(): Promise<Supplier[]> {
  const { data, error } = await sb
    .from("suppliers")
    .select("id,name,phone,email,address,is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    phone: r.phone ?? "",
    email: r.email ?? "",
    address: r.address ?? "",
  }));
}

export async function addSupplier(s: Omit<Supplier, "id">): Promise<Supplier> {
  const { data, error } = await sb
    .from("suppliers")
    .insert({
      name: s.name,
      phone: s.phone || null,
      email: s.email || null,
      address: s.address || null,
    })
    .select("id,name,phone,email,address")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    phone: data.phone ?? "",
    email: data.email ?? "",
    address: data.address ?? "",
  };
}
