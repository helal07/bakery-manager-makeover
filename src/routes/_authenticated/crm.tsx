import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { UserPlus, Star, Search, MoreHorizontal, Eye, Pencil, Trash2, BookOpen, Users, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadImage } from "@/lib/storage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { pageTitle } from "@/lib/company-settings";
import { ReceivePaymentDialog } from "@/components/receive-payment-dialog";

const sb = supabase as any;

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  points: number;
  due: number;
  avatarUrl?: string;
  groupId: string | null;
};

type Group = { id: string; name: string };

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({ meta: [{ title: pageTitle("Customers") }] }),
  component: CRM,
});

function CRM() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", avatarUrl: "" });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [q, setQ] = useState("");
  const [dueFilter, setDueFilter] = useState<"All" | "Due" | "Advance" | "Settled">("All");
  const [groups, setGroups] = useState<Group[]>([]);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [assignFor, setAssignFor] = useState<Customer | null>(null);
  const [assignGroupId, setAssignGroupId] = useState<string>("");
  const [deleteFor, setDeleteFor] = useState<Customer | null>(null);

  const refresh = async () => {
    try {
      const [cRes, sRes, gRes] = await Promise.all([
        sb.from("customers")
          .select("id,name,phone,email,address,loyalty_points,avatar_url,group_id")
          .eq("is_active", true)
          .order("name"),
        sb.from("sales").select("customer_phone,due"),
        sb.from("customer_groups").select("id,name").eq("is_active", true).order("name"),
      ]);
      if (cRes.error) throw cRes.error;
      setGroups(((gRes?.data ?? []) as any[]).map((g) => ({ id: g.id, name: g.name })));
      const dueByPhone = new Map<string, number>();
      for (const s of (sRes.data ?? []) as any[]) {
        const p = (s.customer_phone ?? "").replace(/\D/g, "");
        if (!p) continue;
        dueByPhone.set(p, (dueByPhone.get(p) ?? 0) + Number(s.due ?? 0));
      }
      setList(
        ((cRes.data ?? []) as any[]).map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone ?? "",
          email: c.email ?? "",
          address: c.address ?? "",
          points: Number(c.loyalty_points ?? 0),
          due: dueByPhone.get((c.phone ?? "").replace(/\D/g, "")) ?? 0,
          avatarUrl: c.avatar_url ?? undefined,
          groupId: c.group_id ?? null,
        })),
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    return list.filter((c) => {
      if (dueFilter === "Due" && !(c.due > 0)) return false;
      if (dueFilter === "Advance" && !(c.due < 0)) return false;
      if (dueFilter === "Settled" && c.due !== 0) return false;
      if (q) {
        const s = q.toLowerCase();
        const digits = q.replace(/\D/g, "");
        const phoneDigits = (c.phone || "").replace(/\D/g, "");
        if (
          !c.name.toLowerCase().includes(s) &&
          !(digits && phoneDigits.includes(digits)) &&
          !(c.email || "").toLowerCase().includes(s)
        ) return false;
      }
      return true;
    });
  }, [list, q, dueFilter]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("Name and number are required");
      return;
    }
    try {
      const { data: inserted, error } = await sb.from("customers").insert({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        address: form.address.trim() || null,
      }).select("id").single();
      if (error) throw error;
      if (avatarFile && inserted?.id) {
        try {
          const { url } = await uploadImage("customer-avatars", inserted.id, avatarFile);
          await sb.from("customers").update({ avatar_url: url }).eq("id", inserted.id);
        } catch (e: any) {
          toast.error(e?.message ?? "Photo upload failed");
        }
      }
      toast.success("Customer added");
      setForm({ name: "", phone: "", email: "", address: "", avatarUrl: "" });
      setAvatarFile(null);
      setOpen(false);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add customer");
    }
  };

  const activeCount = list.length;
  const loyaltyTotal = list.reduce((s, c) => s + c.points, 0);
  const outstandingTotal = list.reduce((s, c) => s + Math.max(0, c.due), 0);

  const groupName = (id: string | null) => (id ? groups.find((g) => g.id === id)?.name ?? "—" : "—");

  const startEdit = (c: Customer) => {
    setEditing(c);
    setEditForm({ name: c.name, phone: c.phone, email: c.email, address: c.address });
    setEditAvatarFile(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!editForm.name.trim() || !editForm.phone.trim()) {
      toast.error("Name and number are required");
      return;
    }
    try {
      let avatarUrl: string | undefined;
      if (editAvatarFile) {
        try {
          const { url } = await uploadImage("customer-avatars", editing.id, editAvatarFile);
          avatarUrl = url;
        } catch (e: any) {
          toast.error(e?.message ?? "Photo upload failed");
        }
      }
      const patch: any = {
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim() || null,
        address: editForm.address.trim() || null,
      };
      if (avatarUrl) patch.avatar_url = avatarUrl;
      const { error } = await sb.from("customers").update(patch).eq("id", editing.id);
      if (error) throw error;
      toast.success("Customer updated");
      setEditing(null);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update customer");
    }
  };

  const doDelete = async () => {
    if (!deleteFor) return;
    try {
      const { error } = await sb.from("customers").update({ is_active: false }).eq("id", deleteFor.id);
      if (error) throw error;
      toast.success("Customer removed");
      setDeleteFor(null);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete customer");
    }
  };

  const openAssign = (c: Customer) => {
    setAssignFor(c);
    setAssignGroupId(c.groupId ?? "__none__");
  };

  const saveAssign = async () => {
    if (!assignFor) return;
    try {
      const gid = assignGroupId === "__none__" ? null : assignGroupId;
      const { error } = await sb.from("customers").update({ group_id: gid }).eq("id", assignFor.id);
      if (error) throw error;
      toast.success("Group updated");
      setAssignFor(null);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to assign group");
    }
  };

  return (
    <AppShell
      title="Customers & Loyalty"
      subtitle="Walk-in profiles · loyalty points · outstanding balances"
      actions={
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
        >
          <UserPlus className="size-4" /> Add Customer
        </button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <Card className="p-5">
          <div className="text-xs text-muted-foreground">Active customers</div>
          <div className="text-2xl font-semibold mt-1">{activeCount.toLocaleString()}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground">Loyalty points issued</div>
          <div className="text-2xl font-semibold mt-1">{loyaltyTotal.toLocaleString()}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground">Outstanding dues</div>
          <div className="text-2xl font-semibold mt-1 text-destructive">৳{outstandingTotal.toLocaleString()}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border bg-muted/20">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, number or email…"
              className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
            />
          </div>
          <select
            value={dueFilter}
            onChange={(e) => setDueFilter(e.target.value as typeof dueFilter)}
            className="h-9 px-2.5 rounded-md border border-border bg-background text-sm"
          >
            <option value="All">All customers</option>
            <option value="Due">Sale due</option>
            <option value="Advance">Advance pay</option>
            <option value="Settled">Settled</option>
          </select>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-5 py-3">Name</th>
              <th className="text-left font-medium px-5 py-3">Number</th>
              <th className="text-left font-medium px-5 py-3">Email</th>
              <th className="text-left font-medium px-5 py-3">Group</th>
              <th className="text-right font-medium px-5 py-3">Loyalty</th>
              <th className="text-right font-medium px-5 py-3">Balance</th>
              <th className="text-right font-medium px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">No customers match your filters.</td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td
                  className="px-5 py-3 font-medium cursor-pointer"
                  onClick={() => navigate({ to: "/crm/$id", params: { id: c.id } })}
                >
                  <span className="inline-flex items-center gap-2">
                    {c.avatarUrl ? (
                      <img src={c.avatarUrl} alt="" className="size-7 rounded-full object-cover" />
                    ) : (
                      <span className="size-7 rounded-full bg-muted grid place-items-center text-[10px] text-muted-foreground">
                        {c.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    {c.name}
                  </span>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{c.phone}</td>
                <td className="px-5 py-3 text-muted-foreground">{c.email || <span className="text-muted-foreground/50">—</span>}</td>
                <td className="px-5 py-3 text-muted-foreground">{groupName(c.groupId)}</td>
                <td className="px-5 py-3 text-right">
                  <span className="inline-flex items-center gap-1"><Star className="size-3.5 text-primary fill-primary" /> {c.points.toLocaleString()}</span>
                </td>
                <td className="px-5 py-3 text-right">
                  {c.due > 0 ? <Badge tone="danger">৳{c.due.toLocaleString()}</Badge> : <Badge tone="success">Settled</Badge>}
                </td>
                <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="inline-flex items-center justify-center size-8 rounded-md hover:bg-muted">
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => navigate({ to: "/crm/$id", params: { id: c.id } })}>
                        <Eye className="size-4 mr-2" /> View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate({ to: "/crm/$id", params: { id: c.id } })}>
                        <BookOpen className="size-4 mr-2" /> Ledger
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => startEdit(c)}>
                        <Pencil className="size-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openAssign(c)}>
                        <Users className="size-4 mr-2" /> Assign to group
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteFor(c)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-avatar">Photo <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="c-avatar" type="file" accept="image/*" onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Name</Label>
              <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Number</Label>
              <Input id="c-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-addr">Address</Label>
              <Input id="c-addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Add Customer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="e-avatar">Photo</Label>
              <Input id="e-avatar" type="file" accept="image/*" onChange={(e) => setEditAvatarFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-name">Name</Label>
              <Input id="e-name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-phone">Number</Label>
              <Input id="e-phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-email">Email</Label>
              <Input id="e-email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-addr">Address</Label>
              <Input id="e-addr" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign group */}
      <Dialog open={!!assignFor} onOpenChange={(o) => !o && setAssignFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to Customer Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Customer: <span className="text-foreground font-medium">{assignFor?.name}</span>
            </div>
            <div className="space-y-1.5">
              <Label>Group</Label>
              <Select value={assignGroupId} onValueChange={setAssignGroupId}>
                <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No group —</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {groups.length === 0 && (
                <div className="text-xs text-muted-foreground">No groups yet. Create one under Customer Groups.</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignFor(null)}>Cancel</Button>
            <Button onClick={saveAssign}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete customer?</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            This will remove <span className="text-foreground font-medium">{deleteFor?.name}</span> from your customer list. Sales history and ledger stay intact.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFor(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}