import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChefHat, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot password · Muzahid Food" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email");
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
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter your email and we&apos;ll send you a link to set a new password.
        </p>

        {sent ? (
          <div className="mt-6 p-4 rounded-md border border-border bg-muted/40 text-sm">
            <p className="font-medium">Check your inbox</p>
            <p className="text-muted-foreground mt-1">
              If an account exists for <b>{email}</b>, a reset link is on its way. It may take a minute.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3 text-sm">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Email</span>
              <input
                type="email" required autoFocus value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full px-2 py-2 rounded-md border border-border bg-background"
                autoComplete="email"
              />
            </label>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              type="submit" disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Send reset link
            </button>
          </form>
        )}

        <div className="mt-6 text-xs">
          <Link to="/auth" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
