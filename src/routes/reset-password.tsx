import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChefHat, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set new password · Muzahid Food" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Supabase parses the recovery/invite tokens from the URL hash automatically
  // and fires PASSWORD_RECOVERY / SIGNED_IN. We just wait until a session exists.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("Password must be at least 6 characters");
    if (password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate({ to: "/dashboard", replace: true }), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-muted/40 p-4">
      <div className="w-full max-w-md bg-background rounded-2xl shadow-lg ring-1 ring-border p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <ChefHat className="size-5" />
          </div>
          <span className="font-semibold tracking-tight">Muzahid Food</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose a password of at least 6 characters.
        </p>

        {!ready ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Validating your reset link… If nothing happens, request a new link from{" "}
            <a href="/forgot-password" className="underline">Forgot password</a>.
          </p>
        ) : done ? (
          <p className="mt-6 text-sm">Password updated. Redirecting…</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3 text-sm">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">New password</span>
              <div className="relative mt-1">
                <input
                  type={show ? "text" : "password"} required minLength={6} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-2 pr-9 py-2 rounded-md border border-border bg-background"
                  autoComplete="new-password"
                />
                <button
                  type="button" onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 px-2 flex items-center text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Confirm password</span>
              <input
                type={show ? "text" : "password"} required minLength={6} value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full px-2 py-2 rounded-md border border-border bg-background"
                autoComplete="new-password"
              />
            </label>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              type="submit" disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Update password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
