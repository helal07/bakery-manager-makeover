import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ShowroomScopeProvider } from "@/hooks/use-showroom-scope";
import { AppShellFrame } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const { data: legacyRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);

    let hasRole = !!(legacyRoles && legacyRoles.length > 0);

    if (!hasRole) {
      const { data: assignments } = await (supabase as any)
        .from("user_role_assignments")
        .select("role_id, app_roles!inner(is_active)")
        .eq("user_id", data.user.id);
      hasRole = !!(assignments ?? []).some((a: any) => a?.app_roles?.is_active);
    }

    if (!hasRole) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth", search: { denied: 1 } });
    }

    return { user: data.user, roles: (legacyRoles ?? []).map((r) => r.role) };
  },
  component: () => (
    <ShowroomScopeProvider>
      <AppShellFrame />
    </ShowroomScopeProvider>
  ),
});
