import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** True when the signed-in user has role 'owner' or 'admin' in user_roles. */
export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!data.user) { setIsAdmin(false); setLoading(false); return; }
      const { data: rows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      if (!mounted) return;
      const roles = (rows ?? []).map(r => String(r.role).toLowerCase());
      setIsAdmin(roles.includes("owner") || roles.includes("admin") || roles.includes("superadmin"));
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);
  return { isAdmin, loading };
}
