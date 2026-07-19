import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { ArrowLeft, Printer, Download, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReceivePaymentDialog } from "@/components/receive-payment-dialog";

const sb = supabase as any;

type Customer = { id: string; name: string; phone: string; email: string };
type Sale = { id: string; created_at: string; total: number; paid: number; due: number; payment_mode: string };
type Payment = { id: string; paid_on: string; amount: number; method: string; sale_id: string | null; note: string | null; reference: string | null };

type LedgerRow = {
  date: string;
  type: "Sale" | "Payment";
  ref: string;
  refId?: string;
  details: string;
  debit: number;
  credit: number;
  balance: number;
};

export const Route = createFileRoute("/_authenticated/crm/$id/ledger")({
  head: () => ({ meta: [{ title: "Customer Ledger" }] }),
  component: CustomerLedger,
  errorComponent: ({ error }) => (
    <AppShell title="Ledger"><Card className="p-5 text-sm text-destructive">{error.message}</Card></AppShell>
  ),
  notFoundComponent: () => (
    <AppShell title="Ledger"><Card className="p-5 text-sm text-muted-foreground">Customer not found.</Card></AppShell>
  ),
});

function fmt(n: number) {
  return `৳${Math.round(n).toLocaleString()}`;
}

function CustomerLedger() {
  const { id } = Route.useParams();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | "Sale" | "Payment">("All");
  const [payOpen, setPayOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const cRes = await sb
        .from("customers")
        .select("id,name,phone,email")
        .eq("id", id)
        .maybeSingle();
      if (cRes.error) throw cRes.error;
      if (!cRes.data) { setCustomer(null); return; }
      const c = cRes.data as any;
      const cust: Customer = { id: c.id, name: c.name, phone: c.phone ?? "", email: c.email ?? "" };
      setCustomer(cust);

      const digits = cust.phone.replace(/\D/g, "");
      const [sRes, pRes] = await Promise.all([
        sb.from("sales").select("id,created_at,total,paid,due,payment_mode,customer_id,customer_phone").order("created_at", { ascending: true }),
        sb.from("customer_payments").select("id,paid_on,amount,method,sale_id,note,reference,customer_id,customer_phone").order("paid_on", { ascending: true }),
      ]);
      if (sRes.error) throw sRes.error;
      if (pRes.error) throw pRes.error;

      setSales(((sRes.data ?? []) as any[]).filter((s) => {
        if (s.customer_id === cust.id) return true;
        const p = (s.customer_phone ?? "").replace(/\D/g, "");
        return digits && p === digits;
      }) as Sale[]);
      setPayments(((pRes.data ?? []) as any[]).filter((p) => {
        if (p.customer_id === cust.id) return true;
        const pd = (p.customer_phone ?? "").replace(/\D/g, "");
        return digits && pd === digits;
      }) as Payment[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load ledger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const { rows, totals, summary } = useMemo(() => {
    const events: { date: string; type: "Sale" | "Payment"; ref: string; refId?: string; details: string; debit: number; credit: number }[] = [];
    for (const s of sales) {
      events.push({
        date: s.created_at,
        type: "Sale",
        ref: s.id.slice(0, 8).toUpperCase(),
        refId: s.id,
        details: `Invoice · ${s.payment_mode || "—"}`,
        debit: Number(s.total),
        credit: Number(s.paid),
      });
    }
    for (const p of payments) {
      events.push({
        date: p.paid_on,
        type: "Payment",
        ref: p.reference || p.id.slice(0, 8).toUpperCase(),
        refId: p.sale_id ?? undefined,
        details: p.note ? `Payment · ${p.method} · ${p.note}` : `Payment · ${p.method}`,
        debit: 0,
        credit: Number(p.amount),
      });
    }
    events.sort((a, b) => a.date.localeCompare(b.date));

    let bal = 0;
    const all: LedgerRow[] = events.map((e) => {
      bal += e.debit - e.credit;
      return { ...e, balance: bal };
    });

    const filtered = all.filter((r) => {
      if (typeFilter !== "All" && r.type !== typeFilter) return false;
      const d = r.date.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });

    const totalDebit = filtered.reduce((s, r) => s + r.debit, 0);
    const totalCredit = filtered.reduce((s, r) => s + r.credit, 0);
    const totalBusiness = sales.reduce((s, x) => s + Number(x.total), 0);
    const totalPaid = sales.reduce((s, x) => s + Number(x.paid), 0) + payments.reduce((s, x) => s + Number(x.amount), 0);
    const currentDue = Math.max(0, sales.reduce((s, x) => s + Number(x.due), 0) - payments.reduce((s, x) => s + Number(x.amount), 0));

    return {
      rows: filtered.slice().reverse(),
      totals: { debit: totalDebit, credit: totalCredit, closing: bal },
      summary: { totalBusiness, totalPaid, currentDue, orders: sales.length },
    };
  }, [sales, payments, from, to, typeFilter]);

  const exportCsv = () => {
    const header = ["Date", "Type", "Reference", "Details", "Debit", "Credit", "Balance"];
    const lines = [header.join(",")].concat(
      rows.slice().reverse().map((r) =>
        [new Date(r.date).toLocaleDateString(), r.type, r.ref, `"${r.details.replace(/"/g, '""')}"`, r.debit, r.credit, r.balance].join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-${customer?.name ?? id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell
      title={customer ? `${customer.name} · Ledger` : "Ledger"}
      subtitle={customer?.phone || "Customer statement"}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.history.back()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted"
          >
            <ArrowLeft className="size-4" /> Back
          </button>
          <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="size-4 mr-1" /> Print</Button>
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="size-4 mr-1" /> CSV</Button>
          <Button size="sm" onClick={() => setPayOpen(true)}><Wallet className="size-4 mr-1" /> Receive Payment</Button>
        </div>
      }
    >
      {loading && <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>}
      {!loading && !customer && <Card className="p-6 text-sm text-muted-foreground">Customer not found.</Card>}
      {!loading && customer && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Card className="p-4">
              <div className="text-[11px] text-muted-foreground">Orders</div>
              <div className="text-xl font-semibold mt-1">{summary.orders}</div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] text-muted-foreground">Total business</div>
              <div className="text-xl font-semibold mt-1">{fmt(summary.totalBusiness)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] text-muted-foreground">Total paid</div>
              <div className="text-xl font-semibold mt-1">{fmt(summary.totalPaid)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] text-muted-foreground">Current due</div>
              <div className={`text-xl font-semibold mt-1 ${summary.currentDue > 0 ? "text-destructive" : ""}`}>{fmt(summary.currentDue)}</div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-end gap-2 p-3 border-b border-border bg-muted/20">
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">From</div>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
              </div>
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">To</div>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
              </div>
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">Type</div>
                <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
                  <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="Sale">Sales</SelectItem>
                    <SelectItem value="Payment">Payments</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(from || to || typeFilter !== "All") && (
                <Button size="sm" variant="ghost" onClick={() => { setFrom(""); setTo(""); setTypeFilter("All"); }}>Reset</Button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Date</th>
                  <th className="text-left font-medium px-4 py-2">Type</th>
                  <th className="text-left font-medium px-4 py-2">Reference</th>
                  <th className="text-left font-medium px-4 py-2">Details</th>
                  <th className="text-right font-medium px-4 py-2">Debit</th>
                  <th className="text-right font-medium px-4 py-2">Credit</th>
                  <th className="text-right font-medium px-4 py-2">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground text-xs">No ledger entries.</td></tr>
                )}
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-4 py-2 text-muted-foreground text-xs">{new Date(r.date).toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-xs">
                      {r.type === "Sale"
                        ? <Badge tone="info">Sale</Badge>
                        : <Badge tone="success">Payment</Badge>}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {r.type === "Sale" && r.refId ? (
                        <Link to="/invoice/$id" params={{ id: r.refId }} className="text-primary hover:underline">{r.ref}</Link>
                      ) : r.ref}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{r.details}</td>
                    <td className="px-4 py-2 text-right text-xs">{r.debit ? fmt(r.debit) : "—"}</td>
                    <td className="px-4 py-2 text-right text-xs">{r.credit ? fmt(r.credit) : "—"}</td>
                    <td className={`px-4 py-2 text-right text-xs font-medium ${r.balance > 0 ? "text-destructive" : ""}`}>{fmt(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-muted/30 text-xs">
                  <tr>
                    <td colSpan={4} className="px-4 py-2 text-right font-medium">Totals</td>
                    <td className="px-4 py-2 text-right font-medium">{fmt(totals.debit)}</td>
                    <td className="px-4 py-2 text-right font-medium">{fmt(totals.credit)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${totals.closing > 0 ? "text-destructive" : ""}`}>{fmt(totals.closing)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </Card>

          <ReceivePaymentDialog
            open={payOpen}
            onOpenChange={setPayOpen}
            customerId={customer.id}
            customerName={customer.name}
            customerPhone={customer.phone}
            onSaved={load}
          />
        </>
      )}
    </AppShell>
  );
}
