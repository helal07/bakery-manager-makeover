import { supabase } from "@/integrations/supabase/client";
import { isLaravel } from "@/lib/backend-mode";
import { apiLogin, apiLogout, getApiToken, getCachedApiSession } from "@/lib/api-client";

/** Sign in against whichever server is active. Throws with a readable message. */
export async function backendSignIn(email: string, password: string) {
  if (isLaravel()) {
    await apiLogin(email, password);
    return;
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function backendSignOut() {
  if (isLaravel()) await apiLogout();
  else await supabase.auth.signOut();
}

/** Current user id from the locally stored session — no network call. */
export async function backendUserId(): Promise<string | null> {
  if (isLaravel()) return getApiToken() ? getCachedApiSession()?.user.id ?? null : null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}
