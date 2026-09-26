import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ShowroomScopeProvider } from "@/hooks/use-showroom-scope";
import { AppShellFrame } from "@/components/app-shell";
import { clearRbacSnapshots, rbacQueryOptions } from "@/lib/rbac-cache";
import { isLaravel } from "@/lib/backend-mode";
import { getApiToken, getCachedApiSession } from "@/lib/api-client";
import { backendSignOut } from "@/lib/auth-backend";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    // getSession() reads the locally persisted session — no network round-trip
    // on every navigation.
    let user: { id: string; email?: string | null } | null | undefined;
    if (isLaravel()) {
      const s = getApiToken() ? getCachedApiSession() : null;
      user = s ? { id: s.user.id, email: s.user.email } : null;
    } else {
      const { data: sessionData } = await supabase.auth.getSession();
      user = sessionData.session?.user;
    }
    if (!user) throw redirect({ to: "/auth" });

    // Roles/permissions come from the shared cached RBAC fetch, so navigating
    // between pages does not re-query the role tables.
    const rbac = await context.queryClient.ensureQueryData(rbacQueryOptions(user.id));

    if (!rbac.hasAnyRole) {
      clearRbacSnapshots();
      await backendSignOut();
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
