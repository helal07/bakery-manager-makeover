import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Showroom = {
  id: string; name: string; code: string | null;
  address?: string | null; city?: string | null; phone?: string | null; manager_name?: string | null;
};


type ScopeState = {
  loading: boolean;
  showrooms: Showroom[];              // showrooms the user is allowed to see
  assignedShowroomIds: string[];      // outlets explicitly assigned to the user
  hasGlobalAccess: boolean;           // superadmin / global assignment
  currentShowroomId: string | null;   // null = factory / all (global users only)
  setCurrentShowroomId: (id: string | null) => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<ScopeState | null>(null);
const STORAGE_KEY = "mf.currentShowroomId";

export function ShowroomScopeProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [showrooms, setShowrooms] = useState<Showroom[]>([]);
  const [assignedShowroomIds, setAssignedShowroomIds] = useState<string[]>([]);
  const [hasGlobalAccess, setHasGlobalAccess] = useState(false);
  const [currentShowroomId, setCurrentShowroomIdState] = useState<string | null>(null);

  const setCurrentShowroomId = useCallback((id: string | null) => {
    // Guard: only global users may set null (All / Factory); scoped users must stay in an assigned outlet.
    if (id === null && !hasGlobalAccess) return;
    if (id !== null && !hasGlobalAccess && !assignedShowroomIds.includes(id)) return;
    setCurrentShowroomIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  }, [hasGlobalAccess, assignedShowroomIds]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setShowrooms([]); setAssignedShowroomIds([]); setHasGlobalAccess(false); setLoading(false); return;
    }

    // Legacy bootstrap superadmin
    const { data: legacy } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const legacyRoles = (legacy ?? []).map((r) => String(r.role).toLowerCase());
    let globalAccess = legacyRoles.some((r) => r === "superadmin" || r === "owner");

    // All role assignments — a NULL showroom_id means global
    const { data: assignments } = await (supabase as any)
      .from("user_role_assignments")
      .select("showroom_id, role_id")
      .eq("user_id", user.id);
    const assignedIds: string[] = [];
    for (const a of (assignments ?? []) as Array<{ showroom_id: string | null }>) {
      if (a.showroom_id === null) globalAccess = true;
      else if (a.showroom_id) assignedIds.push(a.showroom_id);
    }

    // Superadmin role via app_roles → also global
    if (!globalAccess && assignments && assignments.length > 0) {
      const roleIds = Array.from(new Set(((assignments as any[]) ?? []).map((a) => a.role_id).filter(Boolean)));
      if (roleIds.length > 0) {
        const { data: roles } = await (supabase as any)
          .from("app_roles").select("name").in("id", roleIds);
        if ((roles ?? []).some((r: any) => String(r.name).toLowerCase() === "superadmin")) globalAccess = true;
      }
    }

    // Load showrooms — RLS now filters to the user's assigned outlets automatically.
    const { data: rooms } = await supabase
      .from("showrooms")
      .select("id, name, code, address, city, phone, manager_name")
      .eq("is_active", true)
      .order("name");

    const list = (rooms ?? []) as Showroom[];
    setShowrooms(list);
    setAssignedShowroomIds(Array.from(new Set(assignedIds)));
    setHasGlobalAccess(globalAccess);

    // Pick current scope
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const storedValid = stored && list.some((s) => s.id === stored);
    if (storedValid) {
      setCurrentShowroomIdState(stored);
    } else if (globalAccess) {
      setCurrentShowroomIdState(null);
    } else if (list.length > 0) {
      setCurrentShowroomIdState(list[0].id);
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, list[0].id);
    } else {
      setCurrentShowroomIdState(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <Ctx.Provider value={{ loading, showrooms, assignedShowroomIds, hasGlobalAccess, currentShowroomId, setCurrentShowroomId, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useShowroomScope() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useShowroomScope must be used inside <ShowroomScopeProvider>");
  return v;
}
