import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  emptyRbac,
  getCurrentUserId,
  rbacQueryKey,
  rbacQueryOptions,
  type RbacData,
} from "@/lib/rbac-cache";

/**
 * The signed-in user id, cached so mounting many gated pages does not hit
 * Supabase auth repeatedly. `getSession()` is local-storage backed, so this is
 * cheap even on a cold cache.
 */
export function useCurrentUserId() {
  const { data, isPending } = useQuery({
    queryKey: ["auth-user-id"],
    queryFn: getCurrentUserId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });
  return { userId: data ?? null, loading: isPending };
}

/**
 * Shared RBAC data for the signed-in user. Every consumer subscribes to the
 * same TanStack Query entry, so navigating between pages reuses the cached
 * result instead of re-querying roles and permissions.
 */
export function useRbac() {
  const queryClient = useQueryClient();
  const { userId, loading: userLoading } = useCurrentUserId();
  const query = useQuery(rbacQueryOptions(userId ?? ""));

  const data: RbacData = query.data ?? emptyRbac(userId ?? "");
  const loading = userLoading || (!!userId && !query.data && query.isPending);

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["auth-user-id"] });
    if (userId) await queryClient.invalidateQueries({ queryKey: rbacQueryKey(userId) });
  }, [queryClient, userId]);

  return { data, loading, reload };
}

/**
 * Effective permissions for the signed-in user (from user_role_assignments ->
 * app_roles -> role_permissions). Superadmin bypasses all checks.
 *
 * API is unchanged from the previous per-mount implementation; only the data
 * source is now cached and shared.
 */
export function usePermissions() {
  const { data, loading, reload } = useRbac();

  const permissions = useMemo(() => new Set(data.global), [data.global]);
  const scopedPermissions = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const [showroomId, keys] of Object.entries(data.scoped)) {
      map.set(showroomId, new Set(keys));
    }
    return map;
  }, [data.scoped]);

  const isSuperadmin = data.isSuperadmin;

  const can = (key: string) => isSuperadmin || permissions.has(key);
  const hasAny = (key: string) => {
    if (isSuperadmin) return true;
    if (permissions.has(key)) return true;
    for (const set of scopedPermissions.values()) if (set.has(key)) return true;
    return false;
  };
  const canIn = (showroomId: string | null, key: string) => {
    if (isSuperadmin) return true;
    if (permissions.has(key)) return true;
    if (!showroomId) return false;
    return scopedPermissions.get(showroomId)?.has(key) ?? false;
  };

  return { loading, isSuperadmin, permissions, scopedPermissions, can, canIn, hasAny, reload };
}
