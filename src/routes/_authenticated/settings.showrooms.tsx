import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useShowroomScope } from "@/hooks/use-showroom-scope";

export const Route = createFileRoute("/_authenticated/settings/showrooms")({
  head: () => ({ meta: [{ title: "Showrooms · Settings" }] }),
  component: ShowroomsAdmin,
});

type Showroom = Database["public"]["Tables"]["showrooms"]["Row"];
type FormState = {
  name: string;
  code: string;
  city: string;
  address: string;
  phone: string;
  manager_name: string;
  is_active: boolean;
};
const empty: FormState = {
  name: "",
  code: "",
  city: "",
  address: "",
  phone: "",
  manager_name: "",
  is_active: true,
};

function ShowroomsAdmin() {
  const { refresh: refreshShowroomScope } = useShowroomScope();
  const [list, setList] = useState<Showroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const nameRef = useRef<HTMLInputElement>(null);

  const refresh = async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true);
    const { data, error } = await supabase
      .from("showrooms")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setList(data ?? []);
    if (!options.silent) setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const openAdd = () => {
    setEditId(null);
    setForm({ ...empty });
    setOpen(true);
    window.setTimeout(() => nameRef.current?.focus(), 0);
  };
  const openEdit = (s: Showroom) => {
    setEditId(s.id);
    setForm({
      name: s.name,
      code: s.code ?? "",
      city: s.city ?? "",
      address: s.address ?? "",
      phone: s.phone ?? "",
      manager_name: s.manager_name ?? "",
      is_active: s.is_active,
    });
    setOpen(true);
  };

  const saveShowroom = async (keepOpen = false) => {
    if (saving) return;
    if (!form.name.trim()) {
      toast.error("Showroom name is required");
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      city: form.city.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      manager_name: form.manager_name.trim() || null,
      is_active: form.is_active,
    };
    try {
      if (editId) {
        const { data, error } = await supabase
          .from("showrooms")
          .update(payload)
          .eq("id", editId)
          .select("*")
          .single();
        if (error) throw error;
        setList((rows) => rows.map((row) => (row.id === editId ? data : row)));
        toast.success("Showroom updated");
        setOpen(false);
      } else {
        const { data: userRes } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("showrooms")
          .insert({ ...payload, created_by: userRes.user?.id ?? null })
          .select("*")
          .single();
        if (error) throw error;
        setList((rows) => [data, ...rows]);
        toast.success("Showroom added");
        if (keepOpen) {
          setForm({ ...empty });
          window.setTimeout(() => nameRef.current?.focus(), 0);
        } else {
          setOpen(false);
        }
      }
      await refreshShowroomScope();
      void refresh({ silent: true });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void saveShowroom(false);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this showroom? This cannot be undone.")) return;
    const { error } = await supabase.from("showrooms").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Showroom deleted");
    refresh();
  };

  return (
    <AppShell
      title="Showrooms"
      subtitle="Create and manage your retail branches. Only owners and admins can access this page."
      actions={
        <Button size="sm" onClick={openAdd}>
          <Plus className="size-4" /> Add showroom
        </Button>
      }
    >
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left font-medium px-5 py-3">Name</th>
                <th className="text-left font-medium px-5 py-3">Code</th>
                <th className="text-left font-medium px-5 py-3">City</th>
                <th className="text-left font-medium px-5 py-3">Manager</th>
                <th className="text-left font-medium px-5 py-3">Phone</th>
                <th className="text-right font-medium px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Loading…</td></tr>
              )}
              {!loading && list.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10">
                    <ShoppingBag className="size-6 mx-auto text-muted-foreground mb-2" />
                    <div className="text-sm text-muted-foreground">No showrooms yet. Click "Add showroom" to create one.</div>
                  </td>
                </tr>
              )}
              {list.map((s) => (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 font-medium">{s.name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{s.code ?? "—"}</td>
                  <td className="px-5 py-3">{s.city ?? "—"}</td>
                  <td className="px-5 py-3">{s.manager_name ?? "—"}</td>
                  <td className="px-5 py-3">{s.phone ?? "—"}</td>
                  <td className="px-5 py-3 text-right">
                    {s.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => openEdit(s)} className="size-7 grid place-items-center rounded hover:bg-muted text-muted-foreground">
                        <Pencil className="size-3.5" />
                      </button>
                      <button onClick={() => remove(s.id)} className="size-7 grid place-items-center rounded hover:bg-muted text-destructive">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{editId ? "Edit showroom" : "Add showroom"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3">
              <div className="sm:col-span-2">
                <Label htmlFor="showroom-name">Name *</Label>
                <Input id="showroom-name" ref={nameRef} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dhanmondi Showroom" />
              </div>
              <div>
                <Label htmlFor="showroom-code">Code</Label>
                <Input id="showroom-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="SR-DHK-01" />
              </div>
              <div>
                <Label htmlFor="showroom-city">City</Label>
                <Input id="showroom-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Dhaka" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="showroom-address">Address</Label>
                <Input id="showroom-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="showroom-phone">Phone</Label>
                <Input id="showroom-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="showroom-manager">Manager name</Label>
                <Input id="showroom-manager" value={form.manager_name} onChange={(e) => setForm({ ...form, manager_name: e.target.value })} />
              </div>
              <label className="sm:col-span-2 flex items-center gap-2 text-sm mt-1">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Active (visible to staff)
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
              {!editId && (
                <Button type="button" variant="secondary" disabled={saving} onClick={() => void saveShowroom(true)}>
                  Save & add another
                </Button>
              )}
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : editId ? "Save" : "Add"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}