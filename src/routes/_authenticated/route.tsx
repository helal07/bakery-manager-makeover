import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ShowroomScopeProvider } from "@/hooks/use-showroom-scope";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Must have at least one app role (owner/admin/manager/employee)
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);

    if (!roles || roles.length === 0) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth", search: { denied: 1 } });
    }

    return { user: data.user, roles: roles.map((r) => r.role) };
  },
  component: () => (
    <ShowroomScopeProvider>
      <Outlet />
    </ShowroomScopeProvider>
  ),
});