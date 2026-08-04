import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ChefHat, Loader2, Eye, EyeOff, Croissant, Wheat, Cookie, Sparkles } from "lucide-react";
import bakeryBg from "@/assets/auth-bakery-bg.jpg";
import { getCompany, pageTitle, getCompanyName } from "@/lib/company-settings";

const searchSchema = z.object({ denied: z.coerce.number().optional() });

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: pageTitle("Sign in") }] }),
  validateSearch: searchSchema,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [brandName, setBrandName] = useState<string>(() => getCompanyName());
  const [signupAllowed, setSignupAllowed] = useState(false);
  const [checkingSignup, setCheckingSignup] = useState(true);
  useEffect(() => { getCompany().then((c) => setBrandName(c.name || getCompanyName())).catch(() => {}); }, []);

  // First-run lock: signup only visible when no users exist yet.
  useEffect(() => {
    (async () => {
      try {
        const { hasAnyUser } = await import("@/lib/bootstrap.functions");
        const res = await hasAnyUser();
        const allow = !res.hasUsers;
        setSignupAllowed(allow);
        setMode(allow ? "signup" : "signin");
      } catch { /* fail closed: keep signup hidden */ }
      setCheckingSignup(false);
    })();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    if (search.denied) setError("Your account has no assigned role. Please contact the owner or an admin.");
  }, [search.denied]);


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/dashboard", replace: true });
        else setInfo("Account created. Check your email to confirm, then sign in.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      if (/invalid login credentials/i.test(msg)) {
        setError("Invalid email or password. Please check your login details and try again.");
        return;
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[oklch(0.22_0.03_40)] flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* ambient flour dots */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
      <div className="relative w-full max-w-5xl grid lg:grid-cols-2 rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-background">
        {/* Left: brand panel */}
        <div
          className="relative hidden lg:flex flex-col justify-between p-10 text-white bg-cover bg-center min-h-[620px]"
          style={{ backgroundImage: `url(${bakeryBg})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.22_0.05_40)]/85 via-[oklch(0.22_0.05_40)]/55 to-[oklch(0.22_0.05_40)]/90" />
          <div className="relative">
            <div className="inline-flex items-center gap-2">
              <div className="size-10 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-lg shadow-primary/40">
                <ChefHat className="size-5" />
              </div>
              <span className="font-semibold tracking-tight text-lg">{brandName}</span>
            </div>
          </div>
          <div className="relative space-y-6">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur text-[11px] uppercase tracking-widest">
              <Sparkles className="size-3" /> Bakery ERP
            </div>
            <h2 className="text-3xl font-semibold leading-tight max-w-sm">
              From dough to dashboard —<br />
              <span className="text-primary-foreground/80 italic font-serif">baked in one place.</span>
            </h2>
            <div className="grid grid-cols-3 gap-3 max-w-sm">
              <Feature icon={<Wheat className="size-4" />} label="Raw stock" />
              <Feature icon={<Croissant className="size-4" />} label="Production" />
              <Feature icon={<Cookie className="size-4" />} label="POS &amp; sales" />
            </div>
          </div>
          <div className="relative flex items-center gap-3 text-xs text-white/60">
            <div className="h-px flex-1 bg-white/15" />
            <span>Made with warm ovens</span>
            <div className="h-px flex-1 bg-white/15" />
          </div>
        </div>

        {/* Right: form panel */}
        <div className="relative p-6 sm:p-10 flex flex-col justify-center">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <ChefHat className="size-5" />
            </div>
            <span className="font-semibold tracking-tight">{brandName}</span>
          </div>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">
              {mode === "signin" ? "Welcome back, baker" : "Join the bakery"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "signin"
                ? "Sign in to manage today’s bakes, orders and stock."
                : "Create your staff account to get started."}
            </p>
          </div>

        {signupAllowed && (
          <div className="flex rounded-lg border border-border bg-muted/40 p-1 text-sm mb-5">
            <button type="button" onClick={() => setMode("signin")}
              className={`flex-1 py-1.5 rounded-md transition ${mode === "signin" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              Existing account
            </button>
            <button type="button" onClick={() => setMode("signup")}
              className={`flex-1 py-1.5 rounded-md transition ${mode === "signup" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              Create owner account
            </button>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3 text-sm">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-2 py-2 rounded-md border border-border bg-background" autoComplete="email" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Password</span>
            <div className="relative mt-1">
              <input type={showPassword ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-2 pr-9 py-2 rounded-md border border-border bg-background"
                autoComplete={mode === "signin" ? "current-password" : "new-password"} />
              <button type="button" onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 px-2 flex items-center text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {info && <p className="text-xs text-muted-foreground">{info}</p>}
          <button type="submit" disabled={busy || checkingSignup}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-60">
            {busy && <Loader2 className="size-4 animate-spin" />}
            {mode === "signin" ? "Sign in to dashboard" : "Create owner account"}
          </button>
          {mode === "signin" && (
            <div className="text-right">
              <a href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground underline">
                Forgot password?
              </a>
            </div>
          )}
        </form>

        {mode === "signup" && signupAllowed && (
          <p className="mt-4 text-xs text-muted-foreground text-center">
            You are creating the very first account — it becomes the <b>owner / superadmin</b>. After this, new users are added by the owner from <b>Teams</b>.
          </p>
        )}
        {!signupAllowed && !checkingSignup && (
          <p className="mt-4 text-xs text-muted-foreground text-center">
            New accounts can only be created by the owner from <b>Teams › Add Employee</b>.
          </p>
        )}

        </div>
      </div>
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl bg-white/10 backdrop-blur border border-white/10 p-3 flex flex-col gap-2">
      <div className="size-7 grid place-items-center rounded-md bg-primary/90 text-primary-foreground">{icon}</div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}