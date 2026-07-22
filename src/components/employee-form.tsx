import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/app-shell";
import { toast } from "sonner";
import { Save, X, KeyRound, Eye, EyeOff, Copy, RefreshCcw, ShieldOff, ShieldCheck } from "lucide-react";
import {
  createEmployeeLogin,
  resetEmployeePassword,
  updateEmployeeAccess,
  disableEmployeeLogin,
} from "@/lib/employee-access.functions";

export type EmployeeDraft = {
  id?: string;
  user_id?: string | null;
  name: string;
  role: string;
  role_id: string | null;
  designation: string;
  showroom_id: string | null;
  email: string;
  phone: string;
  address: string;
  national_id: string;
  joining_date: string;
  date_of_birth: string;
  gender: string;
  emergency_contact: string;
  emergency_phone: string;
  notes: string;
  avatar_url: string;
  salary: number;
  attendance: number;
  is_active: boolean;
};

export const emptyEmployee: EmployeeDraft = {
  name: "",
  role: "",
  role_id: null,
  designation: "",
  showroom_id: null,
  email: "",
  phone: "",
  address: "",
  national_id: "",
  joining_date: "",
  date_of_birth: "",
  gender: "",
  emergency_contact: "",
  emergency_phone: "",
  notes: "",
  avatar_url: "",
  salary: 0,
  attendance: 100,
  is_active: true,
  user_id: null,
};

type Role = { id: string; name: string };
type Showroom = { id: string; name: string };

function generatePassword(len = 12): string {
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;
  const arr = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];
  for (let i = arr.length; i < len; i++) arr.push(all[Math.floor(Math.random() * all.length)]);
  return arr.sort(() => Math.random() - 0.5).join("");
}

export function EmployeeForm({ initial, mode }: { initial: EmployeeDraft; mode: "new" | "edit" }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<EmployeeDraft>(initial);
  const [roles, setRoles] = useState<Role[]>([]);
  const [showrooms, setShowrooms] = useState<Showroom[]>([]);
  const [saving, setSaving] = useState(false);

  // Account & Access state
  const [allowLogin, setAllowLogin] = useState<boolean>(!!initial.user_id);
  const [password, setPassword] = useState<string>("");
  const [showPw, setShowPw] = useState(false);

  const createLogin = useServerFn(createEmployeeLogin);
  const resetPw = useServerFn(resetEmployeePassword);
  const updateAccess = useServerFn(updateEmployeeAccess);
  const disableLogin = useServerFn(disableEmployeeLogin);

  useEffect(() => {
    (async () => {
      const [r, s] = await Promise.all([
        (supabase as any).from("app_roles").select("id, name").eq("is_active", true).order("name"),
        supabase.from("showrooms").select("id, name").eq("is_active", true).order("name"),
      ]);
      setRoles((r.data ?? []) as Role[]);
      setShowrooms((s.data ?? []) as Showroom[]);
    })();
  }, []);

  const set = <K extends keyof EmployeeDraft>(k: K, v: EmployeeDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (!draft.name.trim()) return toast.error("Name is required");
    setSaving(true);
    const roleName = draft.role_id ? roles.find((r) => r.id === draft.role_id)?.name ?? draft.role : draft.role;
    const payload: any = {
      name: draft.name.trim(),
      role: roleName || null,
      role_id: draft.role_id,
      designation: draft.designation.trim() || null,
      showroom_id: draft.showroom_id,
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      address: draft.address.trim() || null,
      national_id: draft.national_id.trim() || null,
      joining_date: draft.joining_date || null,
      date_of_birth: draft.date_of_birth || null,
      gender: draft.gender || null,
      emergency_contact: draft.emergency_contact.trim() || null,
      emergency_phone: draft.emergency_phone.trim() || null,
      notes: draft.notes.trim() || null,
      avatar_url: draft.avatar_url.trim() || null,
      salary: Number(draft.salary) || 0,
      attendance: Number(draft.attendance) || 0,
      is_active: draft.is_active,
    };

    let employeeId = draft.id;
    if (mode === "edit" && employeeId) {
      const { error } = await (supabase as any).from("employees").update(payload).eq("id", employeeId);
      if (error) { setSaving(false); return toast.error(error.message); }
    } else {
      const { data, error } = await (supabase as any).from("employees").insert(payload).select("id").single();
      if (error) { setSaving(false); return toast.error(error.message); }
      employeeId = data.id;
    }

    // Create login if requested and none exists yet.
    if (allowLogin && !draft.user_id) {
      if (!draft.email.trim()) { setSaving(false); return toast.error("Login requires an email"); }
      if (!password || password.length < 8) { setSaving(false); return toast.error("Set a password (min 8 chars)"); }
      if (!draft.role_id) { setSaving(false); return toast.error("Pick a role for the login"); }
      try {
        await createLogin({
          data: {
            email: draft.email.trim(),
            password,
            employeeId: employeeId!,
            roleId: draft.role_id,
            showroomId: draft.showroom_id,
          },
        });
        toast.success("Login created — share the password with the employee");
      } catch (err) {
        setSaving(false);
        return toast.error(err instanceof Error ? err.message : "Could not create login");
      }
    }

    setSaving(false);
    toast.success(mode === "edit" ? "Employee updated" : "Employee added");
    navigate({ to: "/employees" });
  };

  const handleResetPassword = async () => {
    if (!draft.user_id) return;
    if (!password || password.length < 8) return toast.error("New password must be at least 8 characters");
    try {
      await resetPw({ data: { userId: draft.user_id, newPassword: password } });
      toast.success("Password reset. Share the new password.");
      setPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    }
  };

  const handleUpdateAccess = async () => {
    if (!draft.user_id) return;
    if (!draft.role_id) return toast.error("Pick a role");
    try {
      await updateAccess({
        data: { userId: draft.user_id, roleId: draft.role_id, showroomId: draft.showroom_id },
      });
      toast.success("Access updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update access");
    }
  };

  const handleDisableLogin = async () => {
    if (!draft.user_id) return;
    if (!confirm("Disable this login? The user will not be able to sign in.")) return;
    try {
      await disableLogin({ data: { userId: draft.user_id } });
      toast.success("Login disabled");
      set("user_id", null);
      setAllowLogin(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disable login");
    }
  };

  const copyPw = async () => {
    if (!password) return;
    try { await navigator.clipboard.writeText(password); toast.success("Password copied"); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Full Name *">
            <input className="input" value={draft.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Designation">
            <input className="input" placeholder="e.g. Senior Cashier" value={draft.designation} onChange={(e) => set("designation", e.target.value)} />
          </Field>
          <Field label="Role (from Access settings)">
            <select
              className="input"
              value={draft.role_id ?? ""}
              onChange={(e) => set("role_id", e.target.value || null)}
            >
              <option value="">— Select role —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {roles.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                No roles yet — create roles in Settings › Access.
              </p>
            )}
          </Field>
          <Field label="Branch / Showroom">
            <select className="input" value={draft.showroom_id ?? ""} onChange={(e) => set("showroom_id", e.target.value || null)}>
              <option value="">—</option>
              {showrooms.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Date of Joining">
            <input type="date" className="input" value={draft.joining_date} onChange={(e) => set("joining_date", e.target.value)} />
          </Field>
          <Field label="Date of Birth">
            <input type="date" className="input" value={draft.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
          </Field>
          <Field label="Gender">
            <select className="input" value={draft.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="National ID / NID">
            <input className="input" value={draft.national_id} onChange={(e) => set("national_id", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4">Contact</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Email">
            <input type="email" className="input" value={draft.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className="input" value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Address" className="md:col-span-2">
            <textarea rows={2} className="input" value={draft.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Emergency Contact Name">
            <input className="input" value={draft.emergency_contact} onChange={(e) => set("emergency_contact", e.target.value)} />
          </Field>
          <Field label="Emergency Contact Phone">
            <input className="input" value={draft.emergency_phone} onChange={(e) => set("emergency_phone", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              Account & Access
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {draft.user_id
                ? "This employee has an active login. Use the actions below to change credentials or access."
                : "Create a login so this employee can sign in with credentials you set."}
            </p>
          </div>
          {draft.user_id ? (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="size-3" /> Login active
            </span>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowLogin}
                onChange={(e) => {
                  const v = e.target.checked;
                  setAllowLogin(v);
                  if (v && !password) setPassword(generatePassword());
                }}
              />
              Allow this employee to log in
            </label>
          )}
        </div>

        {(allowLogin || draft.user_id) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {!draft.user_id && (
              <Field label="Login email">
                <input
                  type="email"
                  className="input"
                  value={draft.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="employee@example.com"
                />
              </Field>
            )}
            <Field label={draft.user_id ? "New password" : "Temporary password"}>
              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPw ? "text" : "password"}
                    className="input w-full pr-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPassword(generatePassword())}
                  className="inline-flex items-center gap-1 px-2 py-2 rounded-md border border-border text-xs hover:bg-muted"
                  title="Generate strong password"
                >
                  <RefreshCcw className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={copyPw}
                  className="inline-flex items-center gap-1 px-2 py-2 rounded-md border border-border text-xs hover:bg-muted"
                  title="Copy password"
                >
                  <Copy className="size-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Share this with the employee — it will not be shown again.
              </p>
            </Field>

            {draft.user_id && (
              <div className="md:col-span-2 flex flex-wrap gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={!password}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  <KeyRound className="size-4" /> Reset password
                </button>
                <button
                  type="button"
                  onClick={handleUpdateAccess}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted"
                >
                  <ShieldCheck className="size-4" /> Update role & scope
                </button>
                <button
                  type="button"
                  onClick={handleDisableLogin}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-destructive/40 text-destructive text-sm hover:bg-destructive/10 ml-auto"
                >
                  <ShieldOff className="size-4" /> Disable login
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4">Payroll & Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Monthly Salary (৳)">
            <input type="number" className="input" value={draft.salary} onChange={(e) => set("salary", Number(e.target.value))} />
          </Field>
          <Field label="Attendance %">
            <input type="number" min={0} max={100} className="input" value={draft.attendance} onChange={(e) => set("attendance", Number(e.target.value))} />
          </Field>
          <Field label="Status">
            <label className="flex items-center gap-2 h-[38px] px-3 rounded-md border border-border bg-background text-sm">
              <input type="checkbox" checked={draft.is_active} onChange={(e) => set("is_active", e.target.checked)} />
              Active employee
            </label>
          </Field>
          <Field label="Notes" className="md:col-span-3">
            <textarea rows={3} className="input" value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="flex items-center gap-2 sticky bottom-4 z-10">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-60 shadow-lg"
        >
          <Save className="size-4" />
          {saving ? "Saving…" : mode === "edit" ? "Save Changes" : "Add Employee"}
        </button>
        <button
          onClick={() => navigate({ to: "/employees" })}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-border text-sm hover:bg-muted bg-background shadow-lg"
        >
          <X className="size-4" /> Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1 [&_.input]:w-full [&_.input]:px-3 [&_.input]:py-2 [&_.input]:rounded-md [&_.input]:border [&_.input]:border-border [&_.input]:bg-background [&_.input]:text-sm">
        {children}
      </div>
    </label>
  );
}
