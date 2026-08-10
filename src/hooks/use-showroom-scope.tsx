import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRbac } from "@/hooks/use-permissions";


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
  /** True when the user must explicitly pick a location before working. */
  needsSelection: boolean;
  /** Number of locations the user may choose from (factory counts as one). */
  optionCount: number;
  /** Forget the current choice so the picker reopens. */
  clearSelection: () => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<ScopeState | null>(null);
const STORAGE_KEY = "mf.currentShowroomId";
const ASKED_KEY = "mf.locationAsked";
const FACTORY_VALUE = "__factory__";


export function ShowroomScopeProvider({ children }: { children: ReactNode }) {
  // RBAC (roles + assignments) comes from the shared cached fetch.
  const { data: rbac, loading: rbacLoading, reload: reloadRbac } = useRbac();
  const [showrooms, setShowrooms] = useState<Showroom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [currentShowroomId, setCurrentShowroomIdState] = useState<string | null>(null);
  const [needsSelection, setNeedsSelection] = useState(false);

  const hasGlobalAccess = rbac.hasGlobalAccess || rbac.isSuperadmin;
  const assignedShowroomIds = rbac.assignedShowroomIds;

  const setCurrentShowroomId = useCallback((id: string | null) => {
    // Guard: only global users may set null (All / Factory); scoped users must stay in an assigned outlet.
    if (id === null && !hasGlobalAccess) return;
    if (id !== null && !hasGlobalAccess && !assignedShowroomIds.includes(id) && !showrooms.some((s) => s.id === id)) return;
    setCurrentShowroomIdState(id);
    setNeedsSelection(false);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, id ?? FACTORY_VALUE);
        sessionStorage.setItem(ASKED_KEY, "1");
      } catch { /* ignore */ }
    }
  }, [hasGlobalAccess, assignedShowroomIds, showrooms]);


  const loadShowrooms = useCallback(async () => {
    setRoomsLoading(true);
    // Load showrooms — RLS filters to the user's assigned outlets automatically.
    const { data: rooms } = await supabase
      .from("showrooms")
      .select("id, name, code, address, city, phone, manager_name")
      .eq("is_active", true)
      .order("name");
    setShowrooms((rooms ?? []) as Showroom[]);
    setRoomsLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([reloadRbac(), loadShowrooms()]);
  }, [reloadRbac, loadShowrooms]);

  useEffect(() => { void loadShowrooms(); }, [loadShowrooms]);

  const optionCount = showrooms.length + (hasGlobalAccess ? 1 : 0);

  const clearSelection = useCallback(() => {
    setCurrentShowroomIdState(null);
    setNeedsSelection(true);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(ASKED_KEY);
      } catch { /* ignore */ }
    }
  }, []);

  // Resolve the current scope once showrooms + RBAC are known.
  useEffect(() => {
    if (roomsLoading || rbacLoading) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const asked = typeof window !== "undefined" ? sessionStorage.getItem(ASKED_KEY) === "1" : false;
    const storedIsFactory = stored === FACTORY_VALUE && hasGlobalAccess;
    const storedValid = !!stored && showrooms.some((s) => s.id === stored);

    // Only one possible location — pick it silently, never ask.
    if (optionCount <= 1) {
      const only = hasGlobalAccess ? null : (showrooms[0]?.id ?? null);
      setCurrentShowroomIdState(only);
      setNeedsSelection(false);
      if (typeof window !== "undefined") {
        try {
          if (only) localStorage.setItem(STORAGE_KEY, only);
          else localStorage.setItem(STORAGE_KEY, FACTORY_VALUE);
        } catch { /* ignore */ }
      }
      return;
    }

    if (storedValid && asked) {
      setCurrentShowroomIdState(stored);
      setNeedsSelection(false);
      return;
    }
    if (storedIsFactory && asked) {
      setCurrentShowroomIdState(null);
      setNeedsSelection(false);
      return;
    }
    // No valid remembered choice for this session — ask.
    setCurrentShowroomIdState(storedValid ? stored : null);
    setNeedsSelection(true);
  }, [roomsLoading, rbacLoading, showrooms, hasGlobalAccess, optionCount]);

  const loading = roomsLoading || rbacLoading;

  return (
    <Ctx.Provider value={{ loading, showrooms, assignedShowroomIds, hasGlobalAccess, currentShowroomId, setCurrentShowroomId, needsSelection, optionCount, clearSelection, refresh }}>
      {children}
    </Ctx.Provider>
  );


}

export function useShowroomScope() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useShowroomScope must be used inside <ShowroomScopeProvider>");
  return v;
}
