import { useRbac } from "@/hooks/use-permissions";

/**
 * True when the signed-in user is a global admin — either via the legacy
 * `user_roles` table (owner/admin/superadmin) or via the new
 * `user_role_assignments` model (any assignment with showroom_id = NULL,
 * or a role named 'superadmin').
 *
 * Reads the shared cached RBAC fetch, so mounting this on many pages costs
 * nothing extra.
 */
export function useIsAdmin() {
  const { data, loading } = useRbac();
  const isAdmin =
    data.isSuperadmin ||
    data.hasGlobalAccess ||
    data.legacyRoles.some((r) => r === "owner" || r === "admin" || r === "superadmin");
  return { isAdmin, loading };
}
