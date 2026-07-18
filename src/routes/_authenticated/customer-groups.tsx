import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { UserPlus, Trash2, Percent, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
const sb = supabase as any;

type CustomerGroup = {
  id: string;
  name: string;
  discountPct: number;
  isDefault: boolean;
  mode: "percentage" | "price_group";
  sellingPriceGroupId: string | null;
};
type Spg = { id: string; name: string };

export const Route = createFileRoute("/_authenticated/customer-groups")({
  head: () => ({ meta: [{ title: "Customer Groups · Crumb & Co." }] }),
  component: CustomerGroupsPage,
});

function CustomerGroupsPage() {
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [spgs, setSpgs] = useState<Spg[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; mode: "percentage" | "price_group"; discountPct: number; sellingPriceGroupId: string }>({ name: "", mode: "percentage", discountPct: 0, sellingPriceGroupId: "" });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CustomerGroup | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; mode: "percentage" | "price_group"; discountPct: number; sellingPriceGroupId: string }>({ name: "", mode: "percentage", discountPct: 0, sellingPriceGroupId: "" });

  const refresh = async () => {
    setLoading(true);
    const [{ data, error }, { data: spgData }] = await Promise.all([
      sb
      .from("customer_groups")
      .select('id, name, discount_pct, is_default, pricing_mode:"mode", selling_price_group_id')
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("discount_pct", { ascending: true }),
      sb.from("selling_price_groups").select("id,name").eq("is_active", true).order("name"),
    ]);
    if (error) toast.error(error.message);
    else
      setGroups(
        (data ?? []).map((r: any) => ({
          id: r.id as string,
          name: r.name as string,
          discountPct: Number(r.discount_pct ?? 0),
          isDefault: Boolean(r.is_default),
          mode: (r.pricing_mode ?? r.mode ?? "percentage") as "percentage" | "price_group",
          sellingPriceGroupId: (r.selling_price_group_id ?? null) as string | null,
        })),
      );
    setSpgs((spgData ?? []) as Spg[]);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const buildPayload = (f: typeof form): { ok: true; payload: any } | { ok: false; msg: string } => {
    const name = f.name.trim();
    if (!name) return { ok: false, msg: "Group name is required" };
    if (f.mode === "percentage") {
      const raw = Number(f.discountPct);
      if (!Number.isFinite(raw)) return { ok: false, msg: "Percentage must be a number" };
      if (raw < -100 || raw > 100) return { ok: false, msg: "Percentage must be between -100 and 100" };
      return { ok: true, payload: { name, mode: "percentage", discount_pct: raw, selling_price_group_id: null } };
    }
    if (!f.sellingPriceGroupId) return { ok: false, msg: "Select a selling price group" };
    return { ok: true, payload: { name, mode: "price_group", discount_pct: 0, selling_price_group_id: f.sellingPriceGroupId } };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = buildPayload(form);
    if (!res.ok) return toast.error(res.msg);
    const { error } = await sb.from("customer_groups").insert(res.payload);
    if (error) return toast.error(error.message);
    toast.success("Customer group added");
    setForm({ name: "", mode: "percentage", discountPct: 0, sellingPriceGroupId: "" });
    setOpen(false);
    refresh();
  };

  const remove = async (id: string, isDefault: boolean) => {
    if (isDefault) {
      toast.error("Default group cannot be removed");
      return;
    }
    if (!confirm("Remove this group?")) return;
    const { error } = await supabase.from("customer_groups").update({ is_active: false }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Group removed");
    refresh();
  };

  const startEdit = (g: CustomerGroup) => {
    setEditing(g);
    setEditForm({ name: g.name, mode: g.mode, discountPct: g.discountPct, sellingPriceGroupId: g.sellingPriceGroupId ?? "" });
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const res = buildPayload(editForm);
    if (!res.ok) return toast.error(res.msg);
    const { error } = await sb.from("customer_groups").update(res.payload).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Group updated");
    setEditing(null);
    refresh();
  };

  const spgName = (id: string | null) => spgs.find((s) => s.id === id)?.name ?? "—";

  return (
    <AppShell
      title="Customer Groups"
      subtitle="Discount tiers for customer segments"
      actions={
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
        >
          <UserPlus className="size-4" /> Add Group
        </button>
      }
    >
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-5 py-3">Group Name</th>
              <th className="text-left font-medium px-5 py-3">Pricing</th>
              <th className="text-right font-medium px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.map((g) => (
              <tr key={g.id} className="hover:bg-muted/30">
                <td className="px-5 py-3 font-medium">{g.name}</td>
                <td className="px-5 py-3">
                  {g.mode === "percentage" ? (
                    <span className="inline-flex items-center gap-1">
                      <Percent className="size-3.5 text-primary" />
                      {g.discountPct > 0 ? "+" : ""}{g.discountPct}%
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">Price group: {spgName(g.sellingPriceGroupId)}</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => startEdit(g)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-muted-foreground hover:bg-muted mr-1"
                    aria-label="Edit group"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => remove(g.id, g.isDefault)}
                    disabled={g.isDefault}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:hover:bg-transparent"
                    aria-label="Delete group"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr><td colSpan={3} className="text-center py-8 text-sm text-muted-foreground">{loading ? "Loading…" : "No groups yet."}</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Add Customer Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-3">
              <div>
                <Label htmlFor="cg-name">Group name</Label>
                <Input
                  id="cg-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Wholesale"
                />
              </div>
              <ModeFields f={form} setF={setForm} spgs={spgs} idPrefix="cg" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <form onSubmit={saveEdit}>
            <DialogHeader>
              <DialogTitle>Edit Customer Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-3">
              <div>
                <Label htmlFor="cg-ename">Group name</Label>
                <Input
                  id="cg-ename"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <ModeFields f={editForm} setF={setEditForm} spgs={spgs} idPrefix="cge" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function ModeFields({
  f, setF, spgs, idPrefix,
}: {
  f: { mode: "percentage" | "price_group"; discountPct: number; sellingPriceGroupId: string };
  setF: (v: any) => void;
  spgs: { id: string; name: string }[];
  idPrefix: string;
}) {
  return (
    <>
      <div>
        <Label>Pricing rule</Label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button type="button" onClick={() => setF({ ...f, mode: "percentage" })}
            className={`px-3 py-2 rounded border text-sm ${f.mode === "percentage" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
            Calculation %
          </button>
          <button type="button" onClick={() => setF({ ...f, mode: "price_group" })}
            className={`px-3 py-2 rounded border text-sm ${f.mode === "price_group" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
            Selling Price Group
          </button>
        </div>
      </div>
      {f.mode === "percentage" ? (
        <div>
          <Label htmlFor={`${idPrefix}-pct`}>Calculation % (negative = discount, positive = markup)</Label>
          <Input id={`${idPrefix}-pct`} type="number" min={-100} max={100} step="0.01"
            value={f.discountPct}
            onChange={(e) => setF({ ...f, discountPct: Number(e.target.value) })} />
          <p className="text-[11px] text-muted-foreground mt-1">e.g. −20 makes ৳200 → ৳160 at POS. Range −100 to 100.</p>
        </div>
      ) : (
        <div>
          <Label htmlFor={`${idPrefix}-spg`}>Selling Price Group</Label>
          <select id={`${idPrefix}-spg`}
            className="w-full h-9 px-2 rounded border border-border bg-background text-sm"
            value={f.sellingPriceGroupId}
            onChange={(e) => setF({ ...f, sellingPriceGroupId: e.target.value })}>
            <option value="">— Select —</option>
            {spgs.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
          {spgs.length === 0 && (
            <p className="text-[11px] text-destructive mt-1">No selling price groups yet — create one in Products → Selling Price Groups.</p>
          )}
        </div>
      )}
    </>
  );
}