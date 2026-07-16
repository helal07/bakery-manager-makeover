import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { addSupplier, loadSuppliers, type Supplier } from "@/lib/supplier-store";
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
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers · Crumb & Co." }] }),
  component: Suppliers,
});

function Suppliers() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Supplier[]>([]);
  const [form, setForm] = useState({ name: "", contact: "", phone: "", category: "" });

  useEffect(() => {
    loadSuppliers()
      .then(setList)
      .catch((e) => toast.error(e?.message ?? "Failed to load suppliers"));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Supplier name is required");
    try {
      const s = await addSupplier({
        name: form.name.trim(),
        contact: form.contact.trim(),
        phone: form.phone.trim(),
        category: form.category.trim() || "General",
      });
      setList((l) => [s, ...l]);
      toast.success("Supplier added");
      setForm({ name: "", contact: "", phone: "", category: "" });
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add supplier");
    }
  };

  return (
    <AppShell
      title="Suppliers"
      subtitle="Contacts · due payments · purchase history"
      actions={
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
        >
          <Plus className="size-4" /> Add Supplier
        </button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <Card className="p-5"><div className="text-xs text-muted-foreground">Active suppliers</div><div className="text-2xl font-semibold mt-1">{list.length}</div></Card>
        <Card className="p-5"><div className="text-xs text-muted-foreground">Outstanding dues</div><div className="text-2xl font-semibold mt-1 text-muted-foreground">—</div></Card>
        <Card className="p-5"><div className="text-xs text-muted-foreground">On-time delivery</div><div className="text-2xl font-semibold mt-1 text-[color:var(--success)]">96%</div></Card>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-5 py-3">Supplier</th>
              <th className="text-left font-medium px-5 py-3">Contact</th>
              <th className="text-left font-medium px-5 py-3">Phone</th>
              <th className="text-left font-medium px-5 py-3">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((s) => (
              <tr key={s.id} className="hover:bg-muted/30">
                <td className="px-5 py-3 font-medium">{s.name}</td>
                <td className="px-5 py-3">{s.contact}</td>
                <td className="px-5 py-3 text-muted-foreground">{s.phone}</td>
                <td className="px-5 py-3"><Badge tone="neutral">{s.category}</Badge></td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">No suppliers yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Supplier</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-name">Supplier</Label>
              <Input id="s-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-contact">Contact person</Label>
              <Input id="s-contact" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-phone">Phone</Label>
              <Input id="s-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-cat">Category</Label>
              <Input id="s-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Flour, Dairy, ..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Add Supplier</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}