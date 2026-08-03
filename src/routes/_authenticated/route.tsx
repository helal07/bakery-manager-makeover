import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ShowroomScopeProvider } from "@/hooks/use-showroom-scope";
import { AppShellFrame } from "@/components/app-shell";
import { clearRbacSnapshots, rbacQueryOptions } from "@/lib/rbac-cache";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    // getSession() reads the locally persisted session — no network round-trip
    // on every navigation.
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) throw redirect({ to: "/auth" });

    // Roles/permissions come from the shared cached RBAC fetch, so navigating
    // between pages does not re-query the role tables.
    const rbac = await context.queryClient.ensureQueryData(rbacQueryOptions(user.id));

    if (!rbac.hasAnyRole) {
      clearRbacSnapshots();
      await supabase.auth.signOut();
      throw redirect({ to: "/auth", search: { denied: 1 } });
    }

    return { user, roles: rbac.legacyRoles };
  },

  component: () => (
    <ShowroomScopeProvider>
      <AppShellFrame />
    </ShowroomScopeProvider>
  ),
});
