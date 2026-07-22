import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * True when the signed-in user is a global admin — either via the legacy
 * `user_roles` table (owner/admin/superadmin) or via the new
 * `user_role_assignments` model (any assignment with showroom_id = NULL,
 * or a role named 'superadmin').
 */
export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!data.user) { setIsAdmin(false); setLoading(false); return; }
      const uid = data.user.id;

      const [{ data: legacy }, { data: assignments }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        (supabase as any)
          .from("user_role_assignments")
          .select("showroom_id, role_id")
          .eq("user_id", uid),
      ]);
      if (!mounted) return;

      const roles = (legacy ?? []).map((r) => String(r.role).toLowerCase());
      let admin = roles.includes("owner") || roles.includes("admin") || roles.includes("superadmin");

      const assigns = (assignments ?? []) as Array<{ showroom_id: string | null; role_id: string | null }>;
      if (!admin && assigns.some((a) => a.showroom_id === null)) admin = true;
      if (!admin && assigns.length > 0) {
        const roleIds = Array.from(new Set(assigns.map((a) => a.role_id).filter(Boolean))) as string[];
        if (roleIds.length > 0) {
          const { data: appRoles } = await (supabase as any)
            .from("app_roles").select("name").in("id", roleIds);
          if ((appRoles ?? []).some((r: any) => String(r.name).toLowerCase() === "superadmin")) admin = true;
        }
      }

      if (!mounted) return;
      setIsAdmin(admin);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);
  return { isAdmin, loading };
}
