import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { pageTitle } from "@/lib/company-settings";

export const Route = createFileRoute("/_authenticated/sales/edit/$id")({
  head: ({ params }) => ({ meta: [{ title: pageTitle(`Edit Sale #${params.id}`) }] }),
  component: EditSale,
});

function EditSale() {
  const { id } = useParams({ from: "/sales/edit/$id" });
  const navigate = useNavigate();
  const [customer, setCustomer] = useState("Walk-in Customer");
  const [items, setItems] = useState(1);
  const [total, setTotal] = useState(0);
  const [paid, setPaid] = useState(0);
  const [note, setNote] = useState("");

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ to: "/sales/list" });
  };

  return (
    <AppShell title={`Edit Sale #${id}`} subtitle="Update invoice details">
      <div className="mb-3">
        <Link to="/sales/list" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Sale List
        </Link>
      </div>
      <Card className="p-5 max-w-2xl">
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Field label="Invoice"><input value={`#${id}`} disabled className="input-field opacity-60" /></Field>
          <Field label="Customer"><input value={customer} onChange={(e) => setCustomer(e.target.value)} className="input-field" /></Field>
          <Field label="Items"><input type="number" min={1} value={items} onChange={(e) => setItems(+e.target.value)} className="input-field" /></Field>
          <Field label="Total (৳)"><input type="number" min={0} step="0.01" value={total} onChange={(e) => setTotal(+e.target.value)} className="input-field" /></Field>
          <Field label="Paid (৳)"><input type="number" min={0} step="0.01" value={paid} onChange={(e) => setPaid(+e.target.value)} className="input-field" /></Field>
          <Field label="Note" className="sm:col-span-2"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="input-field" /></Field>
          <div className="sm:col-span-2 flex justify-end gap-2 mt-2">
            <Link to="/sales/list" className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">Cancel</Link>
            <button type="submit" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
              <Save className="size-4" /> Save changes
            </button>
          </div>
        </form>
      </Card>
      <style>{`.input-field{width:100%;padding:0.5rem 0.625rem;border:1px solid hsl(var(--border));border-radius:0.375rem;background:hsl(var(--background));outline:none}.input-field:focus{border-color:hsl(var(--primary))}`}</style>
    </AppShell>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}