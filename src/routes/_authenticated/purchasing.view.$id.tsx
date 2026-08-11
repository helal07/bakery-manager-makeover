import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import { loadPurchase, type Purchase } from "@/lib/purchase-store";
import { pageTitle } from "@/lib/company-settings";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/purchasing/view/$id")({
  head: () => ({ meta: [{ title: pageTitle("Purchase Details") }] }),
  component: PurchaseViewPage,
});

function PurchaseViewPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const [p, setP] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadPurchase(id)
      .then((r) => { if (alive) setP(r); })
      .catch((e) => toast.error(e?.message ?? "Failed to load purchase"))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  const pay = p ? (p.payment ?? (p.status === "Received" ? "Paid" : "Due")) : "Due";
  const paid = p ? (pay === "Paid" ? p.total : pay === "Due" ? 0 : (p.paid ?? 0)) : 0;
  const due = p ? p.total - paid : 0;
  const tone = pay === "Paid" ? "success" : pay === "Partial" ? "warning" : "danger";

  return (
    <AppShell title="Purchase Details">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/purchasing/list"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-sm hover:bg-muted"
          >
            <ArrowLeft className="size-4" /> Back
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">Purchase {p?.id ?? ""}</h1>
            <p className="text-xs text-muted-foreground">Purchase details</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted"
          >
            <Printer className="size-4" /> Print
          </button>
          <button
            onClick={() => nav({ to: "/purchasing/edit/$id", params: { id } })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
          >
            <Pencil className="size-4" /> Edit
          </button>
        </div>
      </div>

      {loading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
      ) : !p ? (
        <Card className="p-6 text-sm text-muted-foreground">Purchase not found.</Card>
      ) : (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <Field label="PO #"><span className="font-mono">{p.id}</span></Field>
              <Field label="Date">{p.date}</Field>
              <Field label="Supplier"><span className="font-medium">{p.supplier}</span></Field>
              <Field label="Payment"><Badge tone={tone}>{pay}</Badge></Field>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-sm font-medium">Items</div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2">Item</th>
                    <th className="text-right px-4 py-2">Qty</th>
                    <th className="text-right px-4 py-2">Unit price</th>
                    <th className="text-right px-4 py-2">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(p.items ?? []).map((it, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2">{it.name}</td>
                      <td className="px-4 py-2 text-right">{it.qty} {it.unit}</td>
                      <td className="px-4 py-2 text-right">৳{it.price.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">৳{(it.qty * it.price).toLocaleString()}</td>
                    </tr>
                  ))}
                  {(!p.items || p.items.length === 0) && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">No line items</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-border">
              {(p.items ?? []).map((it, i) => (
                <div key={i} className="p-3 text-sm">
                  <div className="font-medium">{it.name}</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{it.qty} {it.unit} × ৳{it.price.toLocaleString()}</span>
                    <span className="font-semibold text-foreground tabular-nums">৳{(it.qty * it.price).toLocaleString()}</span>
                  </div>
                </div>
              ))}
              {(!p.items || p.items.length === 0) && (
                <div className="p-4 text-center text-xs text-muted-foreground">No line items</div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="ml-auto w-full sm:w-72 space-y-1.5 text-sm">
              <Row label="Total" value={`৳${p.total.toLocaleString()}`} />
              <Row label="Paid" value={`৳${paid.toLocaleString()}`} />
              <div className="border-t border-border pt-1.5">
                <Row label="Due" value={`৳${due.toLocaleString()}`} strong />
              </div>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold text-base" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
