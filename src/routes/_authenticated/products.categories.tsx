import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell, Card } from "@/components/app-shell";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tag, Lock, Search, FolderOpen } from "lucide-react";
import { z } from "zod";
import {
  loadCategoryRows,
  addCategory,
  renameCategory,
  removeCategory,
  type CategoryRow,
} from "@/lib/product-types";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/products/categories")({
  head: () => ({ meta: [{ title: "Categories · Products" }] }),
  component: CategoriesAdmin,
});

const nameSchema = z
  .string()
  .trim()
  .min(2, "Must be at least 2 characters")
  .max(30, "Must be 30 characters or less")
  .regex(/^[A-Za-z0-9][A-Za-z0-9 &'\-]*$/, "Use letters, numbers, spaces or & ' -");

function CategoriesAdmin() {
  const { can, isSuperadmin, loading: permsLoading } = usePermissions();
  const canCreate = isSuperadmin || can("products.create");
  const canEdit = isSuperadmin || can("products.edit");
  const canDelete = isSuperadmin || can("products.delete");

  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState<CategoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = async () => {
    try {
      setCats(await loadCategoryRows());
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const check = () => {
      if (typeof window === "undefined") return;
      if (window.location.hash === "#new" && canCreate) {
        openAdd();
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate]);

  const openAdd = () => {
    if (!canCreate) return;
    setEditing(null);
    setName("");
    setErr(null);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const openEdit = (c: CategoryRow) => {
    if (!canEdit) return;
    setEditing(c);
    setName(c.name);
    setErr(null);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message ?? "Invalid name");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await renameCategory(editing.id, parsed.data);
      } else {
        await addCategory(parsed.data);
      }
      await refresh();
      toast.success(editing ? "Category renamed" : "Category added");
      setOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const askDelete = (c: CategoryRow) => {
    if (!canDelete) return;
    setConfirmDelete(c);
  };
  const confirmRemove = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await removeCategory(confirmDelete.id);
      await refresh();
      toast.success(`Deleted "${confirmDelete.name}"`);
      setConfirmDelete(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = cats.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <AppShell
      title="Categories"
      subtitle="Create, rename, and delete product categories"
    >
      {!permsLoading && !canCreate && !canEdit && !canDelete && (
        <div className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-2">
          <Lock className="size-3.5" /> Read-only — you don't have product permissions.
        </div>
      )}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
            <FolderOpen className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">Categories</h2>
            <p className="text-xs text-muted-foreground">
              {cats.length} {cats.length === 1 ? "category" : "categories"} · fully editable
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="pl-8 h-9 w-48"
            />
          </div>
          <Button
            size="sm"
            onClick={openAdd}
            disabled={!canCreate}
            title={canCreate ? undefined : "Requires 'Create products' permission"}
          >
            <Plus className="size-4 mr-1" /> Add Category
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-11 rounded-md border border-border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="mx-auto size-12 rounded-full bg-muted grid place-items-center mb-3">
            <Tag className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">
            {cats.length === 0 ? "No categories yet" : "No matches"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {cats.length === 0
              ? "Create your first category to organize products."
              : "Try a different search term."}
          </p>
          {cats.length === 0 && canCreate && (
            <Button size="sm" className="mt-4" onClick={openAdd}>
              <Plus className="size-4 mr-1" /> Add Category
            </Button>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-2.5 w-14 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Category name</th>
                  <th className="px-4 py-2.5 w-40 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium">
                      <span className="inline-flex items-center gap-2">
                        <Tag className="size-3.5 text-primary" />
                        {c.name}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => openEdit(c)}
                          disabled={!canEdit}
                          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                          title={canEdit ? "Rename" : "Requires 'Edit products' permission"}
                        >
                          <Pencil className="size-3" /> Edit
                        </button>
                        <button
                          onClick={() => askDelete(c)}
                          disabled={!canDelete}
                          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed"
                          title={canDelete ? "Delete" : "Requires 'Delete products' permission"}
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Rename Category" : "Adding Category"}</DialogTitle>
            </DialogHeader>
            <div className="py-3 space-y-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                ref={inputRef}
                value={name}
                maxLength={30}
                onChange={(e) => {
                  setName(e.target.value);
                  setErr(null);
                }}
                placeholder="e.g. Snacks"
              />
              {err ? (
                <p className="text-xs text-destructive">{err}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  2–30 characters. Letters, numbers, spaces, and &amp; ' - allowed.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {editing ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to delete <strong>{confirmDelete?.name}</strong>. This action can't be
              undone. Existing products that used this label will keep their category text.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmRemove(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete category"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}