import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_ROLES = new Set(["owner", "admin", "superadmin"]);

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data: roles, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!(roles ?? []).some((r: any) => ADMIN_ROLES.has(String(r.role).toLowerCase()))) {
    throw new Error("Only owner or admin can manage employee logins");
  }
}

type CreateInput = {
  email: string;
  password: string;
  employeeId?: string | null;
  roleId?: string | null;
  showroomId?: string | null;
};

/** Create an auth user (no email required) + role assignment + link to employee row. */
export const createEmployeeLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateInput) => {
    if (!data?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new Error("A valid email is required");
    }
    if (!data?.password || data.password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    return {
      email: data.email.trim().toLowerCase(),
      password: data.password,
      employeeId: data.employeeId ?? null,
      roleId: data.roleId ?? null,
      showroomId: data.showroomId ?? null,
    };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check for existing user first (idempotent-ish).
    const { data: existingId } = await supabaseAdmin.rpc("find_user_id_by_email", {
      _email: data.email,
    });

    let userId: string;
    if (existingId) {
      userId = existingId as string;
      // Update password so the admin's chosen credentials work.
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: data.password,
        email_confirm: true,
      });
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
      });
      if (error || !created?.user) throw new Error(error?.message ?? "Could not create user");
      userId = created.user.id;
    }

    if (data.roleId) {
      // Replace any existing assignment for this (user, scope) with the new role.
      const del = (supabaseAdmin as any)
        .from("user_role_assignments")
        .delete()
        .eq("user_id", userId);
      await (data.showroomId ? del.eq("showroom_id", data.showroomId) : del.is("showroom_id", null));
      const { error } = await (supabaseAdmin as any).from("user_role_assignments").insert({
        user_id: userId,
        role_id: data.roleId,
        showroom_id: data.showroomId,
      });
      if (error) throw new Error(error.message);
    }

    if (data.employeeId) {
      const { error } = await (supabaseAdmin as any)
        .from("employees")
        .update({ user_id: userId, email: data.email })
        .eq("id", data.employeeId);
      if (error) throw new Error(error.message);
    }

    return { ok: true as const, userId };
  });

/** Reset an employee's password (admin sets, no email). */
export const resetEmployeePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; newPassword: string }) => {
    if (!data?.userId) throw new Error("userId is required");
    if (!data?.newPassword || data.newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Change role/scope on an existing login. */
export const updateEmployeeAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; roleId: string; showroomId?: string | null }) => {
    if (!data?.userId || !data?.roleId) throw new Error("userId and roleId are required");
    return { ...data, showroomId: data.showroomId ?? null };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("user_role_assignments")
      .delete()
      .eq("user_id", data.userId)
      .is("showroom_id", data.showroomId ?? null);
    const { error } = await supabaseAdmin.from("user_role_assignments").insert({
      user_id: data.userId,
      role_id: data.roleId,
      showroom_id: data.showroomId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Disable a login (ban ~100 years) and drop role assignments. */
export const disableEmployeeLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) => {
    if (!data?.userId) throw new Error("userId is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: "876000h",
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("user_role_assignments").delete().eq("user_id", data.userId);
    return { ok: true as const };
  });
