import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { Plus, Pencil, Trash2, Search, Wallet, TrendingDown, Calendar, Layers } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
import { pageTitle } from "@/lib/company-settings";
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  deleteExpense, loadExpenses, updateExpense, loadExpenseCategories,
  type Expense, type ExpenseCategory,
} from "@/lib/expense-store";

export const Route = createFileRoute("/_authenticated/expenses/list")({
  head: () => ({ meta: [{ title: pageTitle("List Expenses") }] }),
  component: ExpensesList,
});

function ExpensesList() {
  const [items, setItems] = useState<Expense[]>([]);
  const [cats, setCats] = useState<ExpenseCategory[]>([]);
  const reload = () => {
    loadExpenses().then(setItems).catch((e) => toast.error(e?.message ?? "Failed to load expenses"));
  };
  useEffect(() => {
    reload();
    loadExpenseCategories().then(setCats).catch(() => setCats([]));
  }, []);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("All");
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState({ date: "", category: "", desc: "", amount: "" });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((e) => {
      if (cat !== "All" && e.category !== cat) return false;
      if (!q) return true;
      return e.desc.toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
    });
  }, [items, query, cat]);

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const byCat = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {});
  }, [items]);
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  const monthTotal = items
    .filter((e) => e.date.slice(0, 7) === new Date().toISOString().slice(0, 7))
    .reduce((s, e) => s + e.amount, 0);

  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({ date: e.date, category: e.category, desc: e.desc, amount: String(e.amount) });
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!editing) return;
    const amount = Number(form.amount);
    if (!form.desc.trim()) return toast.error("Description is required");
    if (!amount || amount <= 0) return toast.error("Amount must be greater than 0");
    try {
      await updateExpense(editing.id, {
        date: form.date, category: form.category, desc: form.desc.trim(), amount,
      });
      toast.success("Expense updated");
      setEditing(null);
      reload();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save expense");
    }
  };

  const remove = async (e: Expense) => {
    if (!confirm(`Delete expense "${e.desc}"?`)) return;
    try {
      await deleteExpense(e.id);
      reload();
      toast.success("Expense deleted");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete");
    }
  };

  const catOptions = cats.length ? cats.map((c) => c.name) : [];

  return (
    <AppShell
      title="Expense List"
      subtitle="Search, filter and edit recorded expenses"
      actions={
        <Link to="/expenses/new">
          <Button size="sm"><Plus className="size-4" /> Add Expense</Button>
        </Link>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile icon={<Wallet className="size-4" />} label="Filtered total" value={`৳${total.toLocaleString()}`} />
        <StatTile icon={<Calendar className="size-4" />} label="This month" value={`৳${monthTotal.toLocaleString()}`} />
        <StatTile icon={<TrendingDown className="size-4" />} label="Top category" value={topCat ? topCat[0] : "—"} sub={topCat ? `৳${topCat[1].toLocaleString()}` : undefined} />
        <StatTile icon={<Layers className="size-4" />} label="Entries" value={items.length.toString()} />
      </div>

      <Card className="p-4 mb-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center sm:flex sm:flex-wrap sm:justify-between">
          <div className="relative min-w-0 sm:w-72">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search description or category…"
              className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            {(["All", ...catOptions] as string[]).map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`px-2.5 h-8 rounded-md text-xs font-medium border transition ${
                  cat === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/50">
              <tr>
                <th className="text-left font-medium px-5 py-3">Date</th>
                <th className="text-left font-medium px-5 py-3">Category</th>
                <th className="text-left font-medium px-5 py-3">Description</th>
                <th className="text-right font-medium px-5 py-3">Amount</th>
                <th className="text-right font-medium px-5 py-3 w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                    No expenses match your filters.
                  </td>
                </tr>
              )}
              {filtered.map((e) => (
                <tr key={e.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 text-muted-foreground tabular-nums">{e.date}</td>
                  <td className="px-5 py-3"><Badge tone="primary">{e.category}</Badge></td>
                  <td className="px-5 py-3 font-medium">{e.desc}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold">৳{e.amount.toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(e)} className="size-8 grid place-items-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground" aria-label="Edit">
                        <Pencil className="size-4" />
                      </button>
                      <button onClick={() => remove(e)} className="size-8 grid place-items-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Delete">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-muted/30 text-sm font-medium">
                <tr>
                  <td colSpan={3} className="px-5 py-3 text-right text-muted-foreground">Total</td>
                  <td className="px-5 py-3 text-right tabular-nums">৳{total.toLocaleString()}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Expense</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ex-date">Date</Label>
                <Input id="ex-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ex-cat">Category</Label>
                <select
                  id="ex-cat"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                >
                  {catOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-desc">Description</Label>
              <Input id="ex-desc" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-amt">Amount (৳)</Label>
              <Input id="ex-amt" type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function StatTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="size-9 grid place-items-center rounded-md shrink-0 bg-primary/10 text-primary">{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          <div className="text-lg font-semibold tabular-nums leading-tight truncate">{value}</div>
          {sub && <div className="text-xs text-muted-foreground tabular-nums">{sub}</div>}
        </div>
      </div>
    </Card>
  );
}