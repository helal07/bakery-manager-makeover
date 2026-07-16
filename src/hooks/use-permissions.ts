import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type State = {
  loading: boolean;
  isSuperadmin: boolean;
  permissions: Set<string>;
  scopedPermissions: Map<string, Set<string>>; // showroom_id -> perm keys
};

/**
 * Loads the signed-in user's effective permissions (from user_role_assignments
 * -> app_roles -> role_permissions). Superadmin bypasses all checks.
 */
export function usePermissions() {
  const [state, setState] = useState<State>({
    loading: true,
    isSuperadmin: false,
    permissions: new Set(),
    scopedPermissions: new Map(),
  });

  const reload = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setState({ loading: false, isSuperadmin: false, permissions: new Set(), scopedPermissions: new Map() });
      return;
    }

    // Superadmin check via legacy user_roles bridge
    const { data: legacy } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roles = (legacy ?? []).map((r) => String(r.role).toLowerCase());
    const isSuper = roles.includes("superadmin") || roles.includes("owner");

    // Load assignments + role permissions
    const { data: rows } = await (supabase as any)
      .from("user_role_assignments")
      .select("showroom_id, app_roles!inner(id, is_active, role_permissions(permission_key))")
      .eq("user_id", user.id);

    const global = new Set<string>();
    const scoped = new Map<string, Set<string>>();
    for (const r of (rows ?? []) as any[]) {
      const role = r.app_roles;
      if (!role?.is_active) continue;
      const keys: string[] = (role.role_permissions ?? []).map((p: any) => p.permission_key);
      if (r.showroom_id == null) {
        keys.forEach((k) => global.add(k));
      } else {
        const s = scoped.get(r.showroom_id) ?? new Set<string>();
        keys.forEach((k) => s.add(k));
        scoped.set(r.showroom_id, s);
      }
    }

    setState({ loading: false, isSuperadmin: isSuper, permissions: global, scopedPermissions: scoped });
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await reload();
      if (!mounted) return;
    })();
    return () => { mounted = false; };
  }, [reload]);

  const can = (key: string) => state.isSuperadmin || state.permissions.has(key);
  const canIn = (showroomId: string | null, key: string) => {
    if (state.isSuperadmin) return true;
    if (state.permissions.has(key)) return true;
    if (!showroomId) return false;
    return state.scopedPermissions.get(showroomId)?.has(key) ?? false;
  };

  return { ...state, can, canIn, reload };
}
