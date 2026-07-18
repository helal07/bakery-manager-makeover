import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, Card } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ShieldCheck, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/settings/access")({
  head: () => ({ meta: [{ title: "Access Control · Settings" }] }),
  component: AccessControlPage,
});

type Permission = { permission_key: string; module: string; label: string; description: string | null };
type AppRole = { id: string; name: string; description: string | null; is_system: boolean; is_active: boolean };
type RolePerm = { role_id: string; permission_key: string };
type Assignment = { id: string; user_id: string; role_id: string; showroom_id: string | null };
type Showroom = { id: string; name: string };

const sb = supabase as any;

function AccessControlPage() {
  const { loading: permLoading, isSuperadmin } = usePermissions();

  if (permLoading) {
    return (
      <AppShell title="Access Control" subtitle="Roles & permissions">
        <Card><div className="py-10 text-center text-muted-foreground">Loading…</div></Card>
      </AppShell>
    );
  }

  if (!isSuperadmin) {
    return (
      <AppShell title="Access Control" subtitle="Roles & permissions">
        <Card>
          <div className="py-14 flex flex-col items-center gap-3 text-center">
            <Lock className="size-8 text-muted-foreground" />
            <div className="text-base font-medium">Superadmin only</div>
            <div className="text-sm text-muted-foreground max-w-md">
              Access Control is restricted to the Superadmin. Ask your Superadmin to
              grant you a role that includes the permissions you need.
            </div>
          </div>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Access Control"
      subtitle="Create custom roles and control what each role can do"
      actions={<Badge variant="secondary" className="gap-1"><ShieldCheck className="size-3" /> Superadmin</Badge>}
    >
      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="matrix">Permission Matrix</TabsTrigger>
          <TabsTrigger value="assignments">User Assignments</TabsTrigger>
        </TabsList>
        <TabsContent value="roles" className="mt-4"><RolesTab /></TabsContent>
        <TabsContent value="matrix" className="mt-4"><MatrixTab /></TabsContent>
        <TabsContent value="assignments" className="mt-4"><AssignmentsTab /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

/* -------------------- Roles tab -------------------- */

function RolesTab() {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AppRole | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await sb.from("app_roles").select("*").order("is_system", { ascending: false }).order("name");
    setRoles((data ?? []) as AppRole[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null); setName(""); setDescription(""); setActive(true); setOpen(true);
  };
  const openEdit = (r: AppRole) => {
    setEditing(r); setName(r.name); setDescription(r.description ?? ""); setActive(r.is_active); setOpen(true);
  };
  const save = async () => {
    const clean = name.trim();
    if (!clean) { toast.error("Name is required"); return; }
    if (editing) {
      const { error } = await sb.from("app_roles").update({
        name: clean, description: description || null, is_active: active,
      }).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Role updated");
    } else {
      const { error } = await sb.from("app_roles").insert({
        name: clean, description: description || null, is_active: active, is_system: false,
      });
      if (error) { toast.error(error.message); return; }
      toast.success("Role created");
    }
    setOpen(false); load();
  };
  const remove = async (r: AppRole) => {
    if (r.is_system) { toast.error("Built-in roles cannot be deleted"); return; }
    if (!confirm(`Delete role "${r.name}"? This removes all its permission grants and user assignments.`)) return;
    const { error } = await sb.from("app_roles").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Role deleted"); load();
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-base font-semibold">Roles</div>
          <div className="text-sm text-muted-foreground">Create custom roles and toggle them on/off.</div>
        </div>
        <Button onClick={openNew}><Plus className="size-4 mr-1" /> New role</Button>
      </div>
      {loading ? (
        <div className="py-10 text-center text-muted-foreground">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-b">
              <tr><th className="text-left py-2 pr-4">Name</th><th className="text-left py-2 pr-4">Description</th><th className="text-left py-2 pr-4">Type</th><th className="text-left py-2 pr-4">Status</th><th className="text-right py-2">Actions</th></tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{r.name}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{r.description || "—"}</td>
                  <td className="py-2 pr-4">{r.is_system ? <Badge variant="secondary">Built-in</Badge> : <Badge>Custom</Badge>}</td>
                  <td className="py-2 pr-4">{r.is_active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Disabled</Badge>}</td>
                  <td className="py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="size-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(r)} disabled={r.is_system}><Trash2 className="size-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit role" : "New role"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Regional Manager" /></div>
            <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
            <label className="flex items-center gap-2"><Checkbox checked={active} onCheckedChange={(v) => setActive(!!v)} /> <span className="text-sm">Active</span></label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* -------------------- Matrix tab -------------------- */

function MatrixTab() {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [rolePerms, setRolePerms] = useState<RolePerm[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Set<string>>(new Set()); // permission_keys changed
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: p }, { data: rp }] = await Promise.all([
      sb.from("app_roles").select("*").eq("is_active", true).order("is_system", { ascending: false }).order("name"),
      sb.from("permissions").select("*").order("module").order("label"),
      sb.from("role_permissions").select("*"),
    ]);
    setRoles((r ?? []) as AppRole[]);
    setPerms((p ?? []) as Permission[]);
    setRolePerms((rp ?? []) as RolePerm[]);
    if (!selectedRoleId && r && r.length > 0) setSelectedRoleId((r as AppRole[])[0].id);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    // reset checked state when role changes
    if (!selectedRoleId) { setChecked(new Set()); setDirty(new Set()); return; }
    const current = new Set(rolePerms.filter((rp) => rp.role_id === selectedRoleId).map((rp) => rp.permission_key));
    setChecked(current); setDirty(new Set());
  }, [selectedRoleId, rolePerms]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const isSuperadminRole = selectedRole?.name === "Superadmin";

  const modules = useMemo(() => {
    const m = new Map<string, Permission[]>();
    for (const p of perms) {
      const arr = m.get(p.module) ?? [];
      arr.push(p); m.set(p.module, arr);
    }
    return Array.from(m.entries());
  }, [perms]);

  const toggle = (key: string) => {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key); else next.add(key);
    setChecked(next);
    const d = new Set(dirty); d.add(key); setDirty(d);
  };

  const save = async () => {
    if (!selectedRoleId || dirty.size === 0) return;
    setSaving(true);
    const toAdd: { role_id: string; permission_key: string }[] = [];
    const toRemove: string[] = [];
    for (const key of dirty) {
      if (checked.has(key)) toAdd.push({ role_id: selectedRoleId, permission_key: key });
      else toRemove.push(key);
    }
    if (toAdd.length > 0) {
      const { error } = await sb.from("role_permissions").insert(toAdd);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    if (toRemove.length > 0) {
      const { error } = await sb.from("role_permissions").delete()
        .eq("role_id", selectedRoleId).in("permission_key", toRemove);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    toast.success("Permissions saved");
    setSaving(false); load();
  };

  if (loading) return <Card><div className="py-10 text-center text-muted-foreground">Loading…</div></Card>;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Label className="text-sm">Role:</Label>
          <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Choose role" /></SelectTrigger>
            <SelectContent>
              {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}{r.is_system ? " (built-in)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          {isSuperadminRole && <Badge variant="secondary">Full access</Badge>}
        </div>
        <Button onClick={save} disabled={saving || dirty.size === 0 || isSuperadminRole}>
          {saving ? "Saving…" : dirty.size > 0 ? `Save ${dirty.size} change${dirty.size === 1 ? "" : "s"}` : "Save"}
        </Button>
      </div>

      {isSuperadminRole && (
        <div className="text-sm text-muted-foreground mb-4">Superadmin always has every permission — this role cannot be edited.</div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {modules.map(([module, list]) => (
          <div key={module} className="border rounded-lg p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">{module}</div>
            <div className="space-y-1.5">
              {list.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={isSuperadminRole || checked.has(p.key)}
                    disabled={isSuperadminRole}
                    onCheckedChange={() => toggle(p.key)}
                  />
                  <span>{p.label}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">{p.key}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* -------------------- Assignments tab -------------------- */

type AuthUserLite = { id: string; email: string };

function AssignmentsTab() {
  const [assignments, setAssignments] = useState<(Assignment & { role_name?: string; showroom_name?: string; email?: string })[]>([]);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [showrooms, setShowrooms] = useState<Showroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [showroomId, setShowroomId] = useState<string>("__none__");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: a }, { data: r }, { data: s }] = await Promise.all([
      sb.from("user_role_assignments")
        .select("id, user_id, role_id, showroom_id, app_roles(name), showrooms(name)")
        .order("created_at", { ascending: false }),
      sb.from("app_roles").select("*").eq("is_active", true).order("name"),
      sb.from("showrooms").select("id, name").eq("is_active", true).order("name"),
    ]);
    const rows = (a ?? []).map((x: any) => ({
      id: x.id, user_id: x.user_id, role_id: x.role_id, showroom_id: x.showroom_id,
      role_name: x.app_roles?.name, showroom_name: x.showrooms?.name,
    }));
    setAssignments(rows);
    setRoles((r ?? []) as AppRole[]);
    setShowrooms((s ?? []) as Showroom[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEmail(""); setRoleId(""); setShowroomId("__none__"); setOpen(true);
  };

  const assign = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !roleId) { toast.error("Email and role are required"); return; }
    setSaving(true);
    // Look up user by email through the auth admin function - not available on client.
    // Fallback: match on user_roles table by joining email at server; use RPC-less approach:
    // We accept a user id or email — but auth.users is not exposed. So require an existing
    // user in user_roles (they've signed in at least once).
    const { data: users, error: uerr } = await sb.rpc("find_user_id_by_email", { _email: cleanEmail });
    if (uerr) { toast.error("Cannot look up user: " + uerr.message); setSaving(false); return; }
    const uid = users as string | null;
    if (!uid) { toast.error("No user with that email has signed in yet"); setSaving(false); return; }
    const payload: any = { user_id: uid, role_id: roleId, showroom_id: showroomId === "__none__" ? null : showroomId };
    const { error } = await sb.from("user_role_assignments").insert(payload);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Role assigned");
    setOpen(false); setSaving(false); load();
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this role assignment?")) return;
    const { error } = await sb.from("user_role_assignments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Assignment removed"); load();
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-base font-semibold">User role assignments</div>
          <div className="text-sm text-muted-foreground">Assign roles to users. Leave showroom blank for factory / global scope.</div>
        </div>
        <Button onClick={openNew}><Plus className="size-4 mr-1" /> Assign role</Button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">Loading…</div>
      ) : assignments.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">No assignments yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-b">
              <tr><th className="text-left py-2 pr-4">User ID</th><th className="text-left py-2 pr-4">Role</th><th className="text-left py-2 pr-4">Scope</th><th className="text-right py-2">Actions</th></tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs">{a.user_id}</td>
                  <td className="py-2 pr-4">{a.role_name}</td>
                  <td className="py-2 pr-4">{a.showroom_name ?? <span className="text-muted-foreground">Global / Factory</span>}</td>
                  <td className="py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => revoke(a.id)}><Trash2 className="size-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign role to user</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>User email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
              <div className="text-xs text-muted-foreground mt-1">The user must have signed in at least once.</div>
            </div>
            <div>
              <Label>Role</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger><SelectValue placeholder="Choose role" /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Scope (showroom)</Label>
              <Select value={showroomId} onValueChange={setShowroomId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Global / Factory</SelectItem>
                  {showrooms.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={assign} disabled={saving}>{saving ? "Assigning…" : "Assign"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
