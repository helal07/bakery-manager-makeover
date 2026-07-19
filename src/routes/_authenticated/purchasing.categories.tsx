import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  addCategory,
  deleteCategory,
  loadCategories,
  renameCategory,
  type PurchaseCategory,
} from "@/lib/purchase-store";
import { pageTitle } from "@/lib/company-settings";

export const Route = createFileRoute("/_authenticated/purchasing/categories")({
  head: () => ({ meta: [{ title: pageTitle("Purchase Categories") }] }),
  component: PurchaseCategoriesPage,
});

function PurchaseCategoriesPage() {
  const [list, setList] = useState<PurchaseCategory[]>([]);
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const reload = () =>
    loadCategories()
      .then(setList)
      .catch((e) => toast.error(e?.message ?? "Failed to load categories"));
  useEffect(() => { void reload(); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return toast.error("Enter a category name");
    if (list.some((c) => c.name.toLowerCase() === n.toLowerCase())) return toast.error("Already exists");
    try {
      const c = await addCategory(n);
      setList((l) => [...l, c].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      toast.success("Category added");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteCategory(id);
      setList((l) => l.filter((c) => c.id !== id));
      toast.success("Category removed");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to remove");
    }
  };

  const startEdit = (c: PurchaseCategory) => {
    setEditId(c.id);
    setEditName(c.name);
  };
  const saveEdit = async () => {
    if (!editName.trim() || !editId) return;
    try {
      await renameCategory(editId, editName.trim());
      setList((l) => l.map((c) => (c.id === editId ? { ...c, name: editName.trim() } : c)));
      setEditId(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to rename");
    }
  };

  return (
    <AppShell
      title="Purchase Categories"
      subtitle="Group purchases (flour, dairy, packaging…) for reporting"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
        <Card className="p-5">
          <form onSubmit={add} className="space-y-3">
            <div>
              <Label htmlFor="cat-name">New category</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Packaging"
              />
            </div>
            <Button type="submit" className="w-full">
              <Plus className="size-4 mr-1" /> Add Category
            </Button>
          </form>
        </Card>

        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left font-medium px-5 py-3">Name</th>
                <th className="px-5 py-3 text-right w-32">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 font-medium">
                    {editId === c.id ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8"
                        autoFocus
                      />
                    ) : (
                      c.name
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      {editId === c.id ? (
                        <>
                          <button onClick={saveEdit} className="size-7 grid place-items-center rounded hover:bg-muted text-primary">
                            <Check className="size-3.5" />
                          </button>
                          <button onClick={() => setEditId(null)} className="size-7 grid place-items-center rounded hover:bg-muted text-muted-foreground">
                            <X className="size-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(c)} className="size-7 grid place-items-center rounded hover:bg-muted text-muted-foreground">
                            <Pencil className="size-3.5" />
                          </button>
                          <button onClick={() => remove(c.id)} className="size-7 grid place-items-center rounded hover:bg-muted text-destructive">
                            <Trash2 className="size-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No categories yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}