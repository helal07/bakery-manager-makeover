import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  addExpenseCategory, deleteExpenseCategory, loadExpenseCategories,
  updateExpenseCategory, type ExpenseCategory,
} from "@/lib/expense-store";
import { pageTitle } from "@/lib/company-settings";

export const Route = createFileRoute("/_authenticated/expenses/categories")({
  head: () => ({ meta: [{ title: pageTitle("Expense Categories") }] }),
  component: ExpenseCategories,
});

function ExpenseCategories() {
  const [items, setItems] = useState<ExpenseCategory[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = () => loadExpenseCategories().then(setItems).catch((e) => toast.error(e?.message ?? "Failed to load"));
  useEffect(() => { reload(); }, []);

  const openNew = () => { setEditing(null); setName(""); setOpen(true); };
  const openEdit = (c: ExpenseCategory) => { setEditing(c); setName(c.name); setOpen(true); };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const n = name.trim();
    if (n.length < 2) return toast.error("Name must be at least 2 characters");
    setSaving(true);
    try {
      if (editing) {
        await updateExpenseCategory(editing.id, { name: n });
        toast.success("Category updated");
      } else {
        await addExpenseCategory(n);
        toast.success("Category added");
      }
      setOpen(false);
      reload();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: ExpenseCategory) => {
    if (!confirm(`Delete category "${c.name}"?`)) return;
    try {
      await deleteExpenseCategory(c.id);
      reload();
      toast.success("Deleted");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete");
    }
  };

  return (
    <AppShell
      title="Expense Categories"
      subtitle="Organize expenses by category"
      actions={<Button size="sm" onClick={openNew}><Plus className="size-4" /> Add Category</Button>}
    >
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/50">
            <tr>
              <th className="text-left font-medium px-5 py-3">Name</th>
              <th className="text-right font-medium px-5 py-3 w-32">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 && (
              <tr><td colSpan={2} className="px-5 py-10 text-center text-muted-foreground">No categories yet.</td></tr>
            )}
            {items.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-5 py-3 font-medium">{c.name}</td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openEdit(c)} className="size-8 grid place-items-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground" aria-label="Edit">
                      <Pencil className="size-4" />
                    </button>
                    <button onClick={() => remove(c)} className="size-8 grid place-items-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Delete">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save" : "Add"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}