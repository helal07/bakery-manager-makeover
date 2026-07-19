import { createFileRoute, Link, useRouter, useNavigate } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { ArrowLeft, Mail, Phone, MapPin, Star, BookOpen, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ReceivePaymentDialog } from "@/components/receive-payment-dialog";

const sb = supabase as any;

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  points: number;
  avatarUrl?: string;
  createdAt: string;
};

type Sale = {
  id: string;
  created_at: string;
  total: number;
  paid: number;
  due: number;
  payment_mode: string;
};

type Payment = {
  id: string;
  paid_on: string;
  amount: number;
  method: string;
  sale_id: string | null;
  note: string | null;
};

type LedgerRow = {
  date: string;
  kind: "Sale" | "Payment";
  ref: string;
  refId?: string;
  charge: number;
  paid: number;
  balance: number;
};

export const Route = createFileRoute("/_authenticated/crm/$id")({
  head: () => ({ meta: [{ title: "Customer · Muzahid Food" }] }),
  component: CustomerDetail,
  errorComponent: ({ error }) => (
    <AppShell title="Customer"><Card className="p-5 text-sm text-destructive">{error.message}</Card></AppShell>
  ),
  notFoundComponent: () => (
    <AppShell title="Customer"><Card className="p-5 text-sm text-muted-foreground">Customer not found.</Card></AppShell>
  ),
});

function fmt(n: number) {
  return `৳${Math.round(n).toLocaleString()}`;
}

function CustomerDetail() {
  const { id } = Route.useParams();
  const router = useRouter();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);

  const doLoad = async () => {
      try {
        const cRes = await sb
          .from("customers")
          .select("id,name,phone,email,address,loyalty_points,avatar_url,created_at")
          .eq("id", id)
          .maybeSingle();
        if (cRes.error) throw cRes.error;
        if (!cRes.data) {
          setCustomer(null);
          setLoading(false);
          return;
        }
        const c = cRes.data as any;
        const cust: Customer = {
          id: c.id,
          name: c.name,
          phone: c.phone ?? "",
          email: c.email ?? "",
          address: c.address ?? "",
          points: Number(c.loyalty_points ?? 0),
          avatarUrl: c.avatar_url ?? undefined,
          createdAt: c.created_at,
        };
        setCustomer(cust);

        const digits = cust.phone.replace(/\D/g, "");
        const [sRes, pRes] = await Promise.all([
          digits
            ? sb
                .from("sales")
                .select("id,created_at,total,paid,due,payment_mode,customer_phone")
                .order("created_at", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          sb
            .from("customer_payments")
            .select("id,paid_on,amount,method,sale_id,note,customer_id,customer_phone")
            .order("paid_on", { ascending: true }),
        ]);
        if (sRes.error) throw sRes.error;
        if (pRes.error) throw pRes.error;

        const filteredSales = ((sRes.data ?? []) as any[]).filter(
          (s) => (s.customer_phone ?? "").replace(/\D/g, "") === digits,
        );
        setSales(filteredSales as Sale[]);

        const filteredPayments = ((pRes.data ?? []) as any[]).filter((p) => {
          if (p.customer_id === cust.id) return true;
          const pd = (p.customer_phone ?? "").replace(/\D/g, "");
          return digits && pd === digits;
        });
        setPayments(filteredPayments as Payment[]);
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to load customer");
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => { doLoad(); }, [id]);

  const { ledger, lifetimeSpend, totalPaid, outstanding, orderCount, avgOrder } = useMemo(() => {
    const events: { date: string; kind: "Sale" | "Payment"; charge: number; paid: number; ref: string; refId?: string }[] = [];
    for (const s of sales) {
      events.push({
        date: s.created_at,
        kind: "Sale",
        charge: Number(s.total),
        paid: Number(s.paid),
        ref: `Invoice ${s.id.slice(0, 8).toUpperCase()}`,
        refId: s.id,
      });
    }
    for (const p of payments) {
      events.push({
        date: p.paid_on,
        kind: "Payment",
        charge: 0,
        paid: Number(p.amount),
        ref: p.note ? `Payment · ${p.method} · ${p.note}` : `Payment · ${p.method}`,
        refId: p.sale_id ?? undefined,
      });
    }
    events.sort((a, b) => a.date.localeCompare(b.date));
    let bal = 0;
    const rows: LedgerRow[] = events.map((e) => {
      bal += e.charge - e.paid;
      return { ...e, balance: bal };
    });

    const lifetime = sales.reduce((s, x) => s + Number(x.total), 0);
    const paidTotal = sales.reduce((s, x) => s + Number(x.paid), 0) + payments.reduce((s, x) => s + Number(x.amount), 0);
    const salesPaid = sales.reduce((s, x) => s + Number(x.paid), 0);
    const salesDue = sales.reduce((s, x) => s + Number(x.due), 0);
    const extraPayments = payments.reduce((s, x) => s + Number(x.amount), 0);
    const out = Math.max(0, salesDue - extraPayments);
    void salesPaid;
    return {
      ledger: rows.reverse(),
      lifetimeSpend: lifetime,
      totalPaid: paidTotal,
      outstanding: out,
      orderCount: sales.length,
      avgOrder: sales.length ? lifetime / sales.length : 0,
    };
  }, [sales, payments]);

  return (
    <AppShell
      title={customer?.name ?? "Customer"}
      subtitle="Purchase history · payments · outstanding balance"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.history.back()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted"
          >
            <ArrowLeft className="size-4" /> Back
          </button>
          <Button size="sm" variant="outline" onClick={() => navigate({ to: "/crm/$id/ledger", params: { id } })}>
            <BookOpen className="size-4 mr-1" /> Full Ledger
          </Button>
          <Button size="sm" onClick={() => setPayOpen(true)} disabled={!customer}>
            <Wallet className="size-4 mr-1" /> Receive Payment
          </Button>
        </div>
      }
    >
      {loading && <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>}
      {!loading && !customer && (
        <Card className="p-6 text-sm text-muted-foreground">Customer not found.</Card>
      )}
      {!loading && customer && (
        <>
          <Card className="p-5 mb-5">
            <div className="flex items-start gap-4 flex-wrap">
              {customer.avatarUrl ? (
                <img src={customer.avatarUrl} alt="" className="size-16 rounded-full object-cover" />
              ) : (
                <div className="size-16 rounded-full bg-muted grid place-items-center text-lg text-muted-foreground">
                  {customer.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-[200px]">
                <div className="text-lg font-semibold">{customer.name}</div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {customer.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3.5" />{customer.phone}</span>}
                  {customer.email && <span className="inline-flex items-center gap-1"><Mail className="size-3.5" />{customer.email}</span>}
                  {customer.address && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{customer.address}</span>}
                  <span className="inline-flex items-center gap-1"><Star className="size-3.5 text-primary fill-primary" />{customer.points.toLocaleString()} pts</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-2">
                  Customer since {new Date(customer.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <Card className="p-4">
              <div className="text-[11px] text-muted-foreground">Orders</div>
              <div className="text-xl font-semibold mt-1">{orderCount}</div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] text-muted-foreground">Lifetime spend</div>
              <div className="text-xl font-semibold mt-1">{fmt(lifetimeSpend)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] text-muted-foreground">Avg. order</div>
              <div className="text-xl font-semibold mt-1">{fmt(avgOrder)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] text-muted-foreground">Total paid</div>
              <div className="text-xl font-semibold mt-1">{fmt(totalPaid)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] text-muted-foreground">Outstanding</div>
              <div className={`text-xl font-semibold mt-1 ${outstanding > 0 ? "text-destructive" : ""}`}>{fmt(outstanding)}</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="overflow-hidden">
              <div className="px-5 py-3 border-b border-border font-medium text-sm">Purchase history</div>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground bg-muted/40">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Date</th>
                    <th className="text-left font-medium px-4 py-2">Invoice</th>
                    <th className="text-right font-medium px-4 py-2">Total</th>
                    <th className="text-right font-medium px-4 py-2">Paid</th>
                    <th className="text-right font-medium px-4 py-2">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sales.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-xs">No purchases yet.</td></tr>
                  )}
                  {[...sales].reverse().map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2 text-muted-foreground text-xs">{new Date(s.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-2">
                        <Link to="/invoice/$id" params={{ id: s.id }} className="text-primary hover:underline">
                          {s.id.slice(0, 8).toUpperCase()}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right">{fmt(Number(s.total))}</td>
                      <td className="px-4 py-2 text-right">{fmt(Number(s.paid))}</td>
                      <td className="px-4 py-2 text-right">
                        {Number(s.due) > 0 ? <Badge tone="danger">{fmt(Number(s.due))}</Badge> : <Badge tone="success">Paid</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="overflow-hidden">
              <div className="px-5 py-3 border-b border-border font-medium text-sm">Balance ledger</div>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground bg-muted/40">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Date</th>
                    <th className="text-left font-medium px-4 py-2">Entry</th>
                    <th className="text-right font-medium px-4 py-2">Charge</th>
                    <th className="text-right font-medium px-4 py-2">Paid</th>
                    <th className="text-right font-medium px-4 py-2">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ledger.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-xs">No activity yet.</td></tr>
                  )}
                  {ledger.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-4 py-2 text-muted-foreground text-xs">{new Date(r.date).toLocaleDateString()}</td>
                      <td className="px-4 py-2 text-xs">{r.ref}</td>
                      <td className="px-4 py-2 text-right text-xs">{r.charge ? fmt(r.charge) : "—"}</td>
                      <td className="px-4 py-2 text-right text-xs">{r.paid ? fmt(r.paid) : "—"}</td>
                      <td className={`px-4 py-2 text-right text-xs font-medium ${r.balance > 0 ? "text-destructive" : ""}`}>{fmt(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
      {customer && (
        <ReceivePaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          customerId={customer.id}
          customerName={customer.name}
          customerPhone={customer.phone}
          onSaved={doLoad}
        />
      )}
    </AppShell>
  );
}