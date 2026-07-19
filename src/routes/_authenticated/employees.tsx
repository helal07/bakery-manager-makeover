import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { Plus, Pencil, Trash2, Users, ShieldCheck, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/employees")({
  head: () => ({ meta: [{ title: "Teams · Muzahid Food" }] }),
  component: EmployeesPage,
});

type Employee = {
  id: string;
  name: string;
  role: string;
  showroom_id: string | null;
  email: string | null;
  phone: string | null;
  salary: number;
  attendance: number;
  is_active: boolean;
};

type Showroom = { id: string; name: string };

function EmployeesPage() {
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const [list, setList] = useState<Employee[]>([]);
  const [showrooms, setShowrooms] = useState<Showroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const guard = () => {
    if (roleLoading) {
      toast.info("Checking permissions… try again in a moment");
      return false;
    }
    if (!isAdmin) {
      toast.error("Only owner/admin can change employees");
      return false;
    }
    return true;
  };

  const refresh = async () => {
    setLoading(true);
    const [emp, sr] = await Promise.all([
      supabase
        .from("employees")
        .select("id, name, role, showroom_id, email, phone, salary, attendance, is_active")
        .order("created_at", { ascending: false }),
      supabase.from("showrooms").select("id, name").eq("is_active", true).order("name"),
    ]);
    if (emp.error) toast.error(emp.error.message);
    else
      setList(
        (emp.data ?? []).map((r) => ({
          ...r,
          salary: Number(r.salary ?? 0),
          attendance: Number(r.attendance ?? 0),
        })) as Employee[],
      );
    if (!sr.error) setShowrooms((sr.data ?? []) as Showroom[]);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const roles = useMemo(
    () => Array.from(new Set(list.map((e) => e.role).filter(Boolean))).sort(),
    [list],
  );

  const filtered = useMemo(
    () =>
      list.filter(
        (e) =>
          (roleFilter === "all" || e.role === roleFilter) &&
          (q === "" ||
            e.name.toLowerCase().includes(q.toLowerCase()) ||
            (e.email ?? "").toLowerCase().includes(q.toLowerCase())),
      ),
    [list, q, roleFilter],
  );

  const stats = useMemo(
    () => ({
      total: list.length,
      active: list.filter((e) => e.is_active).length,
      payroll: list.reduce((s, e) => s + e.salary, 0),
      branches: new Set(list.map((e) => e.showroom_id).filter(Boolean)).size,
    }),
    [list],
  );

  const openAdd = () => {
    if (!guard()) return;
    navigate({ to: "/employees/new" });
  };
  const openEdit = (e: Employee) => {
    if (!guard()) return;
    navigate({ to: "/employees/edit/$id", params: { id: e.id } });
  };

  const remove = async (id: string) => {
    if (!guard()) return;
    if (!confirm("Remove this employee?")) return;
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    refresh();
  };

  const branchName = (id: string | null) =>
    id ? showrooms.find((s) => s.id === id)?.name ?? "—" : "—";

  return (
    <AppShell
      title="Teams"
      subtitle="Staff directory · manage role permissions in Settings › Access"
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/settings/access"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted"
          >
            <ShieldCheck className="size-4" /> Role Permissions
          </Link>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
          >
            <Plus className="size-4" /> Add Employee
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat icon={<Users className="size-4" />} label="Team Members" value={stats.total.toString()} />
        <Stat icon={<ShieldCheck className="size-4" />} label="Active" value={stats.active.toString()} />
        <Stat label="Monthly Payroll" value={`৳${stats.payroll.toLocaleString()}`} />
        <Stat label="Branches" value={stats.branches.toString()} />
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-background text-sm"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-2 py-1.5 rounded-md border border-border bg-background text-sm"
          >
            <option value="all">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left font-medium px-5 py-3">Name</th>
                <th className="text-left font-medium px-5 py-3">Role</th>
                <th className="text-left font-medium px-5 py-3">Branch</th>
                <th className="text-left font-medium px-5 py-3">Contact</th>
                <th className="text-right font-medium px-5 py-3">Attendance</th>
                <th className="text-right font-medium px-5 py-3">Salary</th>
                <th className="text-right font-medium px-5 py-3 w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3">
                    <div className="font-medium">{u.name}</div>
                    {!u.is_active && <div className="text-xs text-muted-foreground">Inactive</div>}
                  </td>
                  <td className="px-5 py-3">
                    {u.role ? <Badge tone="primary">{u.role}</Badge> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{branchName(u.showroom_id)}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">
                    {u.email && <div>{u.email}</div>}
                    {u.phone && <div>{u.phone}</div>}
                    {!u.email && !u.phone && "—"}
                  </td>
                  <td className="px-5 py-3 text-right">{u.attendance}%</td>
                  <td className="px-5 py-3 text-right">৳{u.salary.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => openEdit(u)} className="p-1.5 rounded hover:bg-muted" title="Edit">
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={() => remove(u.id)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                    {loading ? "Loading…" : "No employees yet"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold">{draft.id ? "Edit Employee" : "Add Employee"}</h2>
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <Field label="Name">
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Role">
                    <input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} placeholder="e.g. Cashier" className="input" />
                  </Field>
                  <Field label="Branch">
                    <select
                      value={draft.showroom_id ?? ""}
                      onChange={(e) => setDraft({ ...draft, showroom_id: e.target.value || null })}
                      className="input"
                    >
                      <option value="">—</option>
                      {showrooms.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Email">
                    <input value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="input" />
                  </Field>
                  <Field label="Phone">
                    <input value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className="input" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Monthly Salary (৳)">
                    <input type="number" value={draft.salary} onChange={(e) => setDraft({ ...draft, salary: Number(e.target.value) })} className="input" />
                  </Field>
                  <Field label="Attendance %">
                    <input type="number" min={0} max={100} value={draft.attendance} onChange={(e) => setDraft({ ...draft, attendance: Number(e.target.value) })} className="input" />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.is_active}
                    onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                  />
                  Active
                </label>
                <button
                  onClick={save}
                  className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
                >
                  {draft.id ? "Save" : "Add"}
                </button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1 [&_.input]:w-full [&_.input]:px-3 [&_.input]:py-2 [&_.input]:rounded-md [&_.input]:border [&_.input]:border-border [&_.input]:bg-background [&_.input]:text-sm">
        {children}
      </div>
    </label>
  );
}