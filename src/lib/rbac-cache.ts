import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for the signed-in user's RBAC data.
 *
 * Everything RBAC-related (permission gates, sidebar filtering, showroom scope,
 * the `_authenticated` route guard) reads this one cached fetch instead of
 * issuing its own queries on every page change.
 */
export type RbacData = {
  userId: string;
  /** Legacy `user_roles` values, lowercased. */
  legacyRoles: string[];
  isSuperadmin: boolean;
  /** True when the user has a global (showroom_id = null) assignment. */
  hasGlobalAccess: boolean;
  /** Has at least one active role (legacy or assignment). */
  hasAnyRole: boolean;
  /** Permission keys granted globally. */
  global: string[];
  /** showroom_id -> permission keys. */
  scoped: Record<string, string[]>;
  /** Outlets explicitly assigned to the user. */
  assignedShowroomIds: string[];
};

export const emptyRbac = (userId = ""): RbacData => ({
  userId,
  legacyRoles: [],
  isSuperadmin: false,
  hasGlobalAccess: false,
  hasAnyRole: false,
  global: [],
  scoped: {},
  assignedShowroomIds: [],
});

const snapshotKey = (userId: string) => `mf.rbac.${userId}`;

export function readRbacSnapshot(userId: string): RbacData | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = localStorage.getItem(snapshotKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RbacData;
    return parsed?.userId === userId ? parsed : null;
  } catch {
    return null;
  }
}

function writeRbacSnapshot(data: RbacData) {
  if (typeof window === "undefined" || !data.userId) return;
  try {
    localStorage.setItem(snapshotKey(data.userId), JSON.stringify(data));
  } catch {
    /* storage full / disabled — cache is best-effort */
  }
}

export function clearRbacSnapshots() {
  if (typeof window === "undefined") return;
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("mf.rbac.")) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/** Fetches everything RBAC needs in two requests (roles bridge + assignments). */
export async function fetchRbac(userId: string): Promise<RbacData> {
  if (!userId) return emptyRbac();

  const [legacyRes, assignmentsRes] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    (supabase as any)
      .from("user_role_assignments")
      .select("showroom_id, role_id, app_roles!inner(id, name, is_active, role_permissions(permission_key))")
      .eq("user_id", userId),
  ]);

  const legacyRoles = (legacyRes.data ?? []).map((r: any) => String(r.role).toLowerCase());
  let isSuperadmin = legacyRoles.includes("superadmin") || legacyRoles.includes("owner");
  let hasGlobalAccess = isSuperadmin;
  let hasAnyRole = legacyRoles.length > 0;

  const global = new Set<string>();
  const scoped: Record<string, string[]> = {};
  const assigned = new Set<string>();

  for (const row of (assignmentsRes.data ?? []) as any[]) {
    const role = row.app_roles;
    if (!role?.is_active) continue;
    hasAnyRole = true;
    if (String(role.name ?? "").toLowerCase() === "superadmin") {
      isSuperadmin = true;
      hasGlobalAccess = true;
    }
    const keys: string[] = (role.role_permissions ?? []).map((p: any) => p.permission_key);
    if (row.showroom_id == null) {
      hasGlobalAccess = true;
      keys.forEach((k) => global.add(k));
    } else {
      assigned.add(row.showroom_id);
      const set = new Set(scoped[row.showroom_id] ?? []);
      keys.forEach((k) => set.add(k));
      scoped[row.showroom_id] = Array.from(set);
    }
  }

  const data: RbacData = {
    userId,
    legacyRoles,
    isSuperadmin,
    hasGlobalAccess,
    hasAnyRole,
    global: Array.from(global),
    scoped,
    assignedShowroomIds: Array.from(assigned),
  };
  writeRbacSnapshot(data);
  return data;
}

export const rbacQueryKey = (userId: string) => ["rbac", userId] as const;

export const rbacQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: rbacQueryKey(userId),
    queryFn: () => fetchRbac(userId),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    initialData: () => readRbacSnapshot(userId) ?? undefined,
    // A snapshot from a previous session should revalidate right away.
    initialDataUpdatedAt: 0,
  });

/** Reads the current user id without a network round-trip when a session exists. */
export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}
