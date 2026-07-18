import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Showroom = {
  id: string; name: string; code: string | null;
  address?: string | null; city?: string | null; phone?: string | null; manager_name?: string | null;
};


type ScopeState = {
  loading: boolean;
  showrooms: Showroom[];       // all showrooms the user can access
  hasGlobalAccess: boolean;    // superadmin / owner / admin / global assignment
  currentShowroomId: string | null; // null = factory / all
  setCurrentShowroomId: (id: string | null) => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<ScopeState | null>(null);
const STORAGE_KEY = "mf.currentShowroomId";

export function ShowroomScopeProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [showrooms, setShowrooms] = useState<Showroom[]>([]);
  const [hasGlobalAccess, setHasGlobalAccess] = useState(false);
  const [currentShowroomId, setCurrentShowroomIdState] = useState<string | null>(null);

  const setCurrentShowroomId = useCallback((id: string | null) => {
    setCurrentShowroomIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setShowrooms([]); setHasGlobalAccess(false); setLoading(false); return;
    }

    // Global access via legacy user_roles bridge (superadmin/owner/admin)
    const { data: legacy } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const legacyRoles = (legacy ?? []).map((r) => String(r.role).toLowerCase());
    let globalAccess = legacyRoles.some((r) => r === "superadmin" || r === "owner" || r === "admin");

    // Or a global (showroom_id IS NULL) assignment
    if (!globalAccess) {
      const { data: ga } = await (supabase as any)
        .from("user_role_assignments")
        .select("id")
        .eq("user_id", user.id)
        .is("showroom_id", null)
        .limit(1);
      if (ga && ga.length > 0) globalAccess = true;
    }

    // RLS on showrooms already restricts to accessible ones for scoped users;
    // for global users this returns all active rows.
    const { data: rooms } = await supabase
      .from("showrooms")
      .select("id, name, code")
      .eq("is_active", true)
      .order("name");

    const list = (rooms ?? []) as Showroom[];
    setShowrooms(list);
    setHasGlobalAccess(globalAccess);

    // Restore or pick default
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const validStored = stored && list.some((s) => s.id === stored) ? stored : null;
    if (validStored) {
      setCurrentShowroomIdState(validStored);
    } else if (globalAccess) {
      setCurrentShowroomIdState(null); // default to "All / Factory"
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
    <Ctx.Provider value={{ loading, showrooms, hasGlobalAccess, currentShowroomId, setCurrentShowroomId, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useShowroomScope() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useShowroomScope must be used inside <ShowroomScopeProvider>");
  return v;
}
