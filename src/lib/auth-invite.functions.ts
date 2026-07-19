import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Input = { email: string; redirectTo: string };

/**
 * Sends a login-setup email to a user.
 * - If the user does not exist in auth.users: invites them (creates account + sends invite/recovery email).
 * - If the user exists: sends a password-recovery email so they can set/reset their password.
 * Only owner/admin/superadmin roles may call this.
 */
export const sendLoginSetupEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Input) => {
    if (!data?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new Error("A valid email is required");
    }
    if (!data?.redirectTo || !/^https?:\/\//.test(data.redirectTo)) {
      throw new Error("A valid redirect URL is required");
    }
    return { email: data.email.trim().toLowerCase(), redirectTo: data.redirectTo };
  })
  .handler(async ({ data, context }) => {
    // Verify caller is owner/admin/superadmin.
    const { data: roles, error: rolesErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rolesErr) throw new Error(rolesErr.message);
    const allowed = new Set(["owner", "admin", "superadmin"]);
    if (!(roles ?? []).some((r) => allowed.has(String(r.role)))) {
      throw new Error("Only owner or admin can send login emails");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check if the user already exists.
    const { data: existingId } = await supabaseAdmin.rpc("find_user_id_by_email", {
      _email: data.email,
    });

    if (!existingId) {
      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        redirectTo: data.redirectTo,
      });
      if (error) throw new Error(error.message);
      return { ok: true, mode: "invited" as const };
    }

    // Existing user: send a recovery link so they can (re)set the password.
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(data.email, {
      redirectTo: data.redirectTo,
    });
    if (error) throw new Error(error.message);
    return { ok: true, mode: "reset" as const };
  });
