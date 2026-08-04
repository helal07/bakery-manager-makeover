import { createServerFn } from "@tanstack/react-start";

/**
 * First-run check: returns true when at least one account exists.
 * Runs server-side with privileged access so anonymous visitors do not need
 * direct database access to auth data.
 */
export const hasAnyUser = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("has_any_user");
  if (error) return { hasUsers: true };
  return { hasUsers: !!data };
});
