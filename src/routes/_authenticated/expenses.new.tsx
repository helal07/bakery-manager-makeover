import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { addExpense, loadExpenseCategories, type ExpenseCategory } from "@/lib/expense-store";
import { pageTitle } from "@/lib/company-settings";

export const Route = createFileRoute("/_authenticated/expenses/new")({
  head: () => ({ meta: [{ title: pageTitle("Add Expense") }] }),
  component: AddExpense,
});

function AddExpense() {
  const navigate = useNavigate();
  const [cats, setCats] = useState<ExpenseCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: "",
    desc: "",
    amount: "",
  });

  useEffect(() => {
    loadExpenseCategories()
      .then((cs) => {
        setCats(cs);
        setForm((f) => ({ ...f, category: f.category || cs[0]?.name || "" }));
      })
      .catch((e) => toast.error(e?.message ?? "Failed to load categories"));
  }, []);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const amount = Number(form.amount);
    if (!form.category) return toast.error("Category is required");
    if (!form.desc.trim()) return toast.error("Description is required");
    if (!amount || amount <= 0) return toast.error("Amount must be greater than 0");
    setSaving(true);
    try {
      await addExpense({
        date: form.date,
        category: form.category,
        desc: form.desc.trim(),
        amount,
      });
      toast.success("Expense recorded");
      navigate({ to: "/expenses/list" });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      title="Add Expense"
      subtitle="Record a new expense entry"
      actions={<Link to="/expenses/list"><Button variant="outline" size="sm">Back to list</Button></Link>}
    >
      <Card className="p-5 max-w-2xl">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ne-date">Date</Label>
              <Input id="ne-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ne-cat">Category</Label>
              <div className="flex gap-2">
                <select
                  id="ne-cat"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="flex-1 h-9 px-2.5 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                  required
                >
                  <option value="" disabled>Select category…</option>
                  {cats.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
                </select>
                <Link to="/expenses/categories" className="text-xs text-primary self-center whitespace-nowrap">Manage</Link>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ne-desc">Description</Label>
            <Input id="ne-desc" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="e.g. Electricity — June" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ne-amt">Amount (৳)</Label>
            <Input id="ne-amt" type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" required />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Link to="/expenses/list"><Button type="button" variant="outline">Cancel</Button></Link>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Record Expense"}</Button>
          </div>
        </form>
      </Card>
    </AppShell>
  );
}