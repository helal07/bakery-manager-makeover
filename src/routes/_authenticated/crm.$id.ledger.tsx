import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ReceivePaymentDialog } from "@/components/receive-payment-dialog";
import { PermissionGate } from "@/components/permission-gate";
import { LedgerView, type LedgerParty } from "@/components/ledger-view";
import { buildLedger, type LedgerEntry } from "@/lib/ledger-math";
import { getCompany, type CompanySettings, pageTitle } from "@/lib/company-settings";
import { Wallet } from "lucide-react";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/$id/ledger")({
  head: () => ({ meta: [{ title: pageTitle("Customer Ledger") }] }),
  component: () => (
    <PermissionGate anyOf={["contacts.customers.ledger", "contacts.customers.view"]} title={"Customer Ledger"}>
      <CustomerLedger />
    </PermissionGate>
  ),
  errorComponent: ({ error }) => (
    <AppShell title="Ledger"><Card className="p-5 text-sm text-destructive">{error.message}</Card></AppShell>
  ),
  notFoundComponent: () => (
    <AppShell title="Ledger"><Card className="p-5 text-sm text-muted-foreground">Customer not found.</Card></AppShell>
  ),
});

function CustomerLedger() {
  const { id } = Route.useParams();
  const router = useRouter();
  const [party, setParty] = useState<LedgerParty | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [locations, setLocations] = useState<{ id: string | null; name: string }[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [customer, setCustomer] = useState<{ id: string; name: string; phone: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const cRes = await sb.from("customers").select("id,name,phone,email,address").eq("id", id).maybeSingle();
      if (cRes.error) throw cRes.error;
      if (!cRes.data) { setParty(null); return; }
      const c = cRes.data as any;
      setParty({ name: c.name, phone: c.phone ?? "", email: c.email ?? "", address: c.address ?? "" });
      setCustomer({ id: c.id, name: c.name, phone: c.phone ?? "" });

      const digits = String(c.phone ?? "").replace(/\D/g, "");
      const [sRes, pRes, rRes, shRes, comp] = await Promise.all([
        sb.from("sales").select("id,external_ref,created_at,total,paid,due,payment_mode,showroom_id,customer_id,customer_phone").order("created_at"),
        sb.from("customer_payments").select("id,paid_on,amount,method,reference,note,sale_id,showroom_id,customer_id,customer_phone").order("paid_on"),
        sb.from("sale_returns").select("id,code,created_at,amount,reason,sale_id,showroom_id,customer_name").order("created_at"),
        sb.from("showrooms").select("id,name"),
        getCompany(),
      ]);
      if (sRes.error) throw sRes.error;
      if (pRes.error) throw pRes.error;
      setCompany(comp);

      const rooms: { id: string | null; name: string }[] = [{ id: null, name: "Factory" }].concat(
        ((shRes.data ?? []) as any[]).map((r) => ({ id: r.id as string, name: r.name as string })),
      );
      setLocations(rooms);
      const nameOf = (sid: string | null | undefined) => rooms.find((r) => r.id === (sid ?? null))?.name ?? "Factory";

      const mine = (row: any) =>
        row.customer_id === c.id || (digits && String(row.customer_phone ?? "").replace(/\D/g, "") === digits);

      const sales = ((sRes.data ?? []) as any[]).filter(mine);
      const saleIds = new Set(sales.map((s) => s.id));
      const payments = ((pRes.data ?? []) as any[]).filter(mine);
      const returns = ((rRes.data ?? []) as any[]).filter((r) => r.sale_id && saleIds.has(r.sale_id));

      setEntries(
        buildLedger({
          kind: "customer",
          locationName: nameOf,
          invoices: sales.map((s) => ({
            id: s.id,
            code: s.external_ref,
            date: s.created_at,
            total: Number(s.total),
            paid: Number(s.paid),
            showroom_id: s.showroom_id,
          })),
          payments: payments.map((p) => ({
            id: p.id,
            date: p.paid_on,
            amount: Number(p.amount),
            method: p.method,
            reference: p.reference,
            note: p.note,
            invoice_id: p.sale_id,
            showroom_id: p.showroom_id,
          })),
          returns: returns.map((r) => ({
            id: r.id,
            code: r.code,
            date: r.created_at,
            amount: Number(r.amount),
            invoice_id: r.sale_id,
            reason: r.reason,
            showroom_id: r.showroom_id,
          })),
        }),
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load ledger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  return (
    <AppShell
      title={party ? `${party.name} · Ledger` : "Ledger"}
      subtitle={party?.phone || "Customer statement"}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => router.history.back()}><ArrowLeft className="size-4 mr-1" /> Back</Button>
          <Button size="sm" onClick={() => setPayOpen(true)}><Wallet className="size-4 mr-1" /> Receive Payment</Button>
        </div>
      }
    >
      {!loading && !party ? (
        <Card className="p-6 text-sm text-muted-foreground">Customer not found.</Card>
      ) : (
        <LedgerView
          party={party ?? { name: "" }}
          company={company}
          entries={entries}
          locations={locations}
          loading={loading}
          invoiceLinkTo={(refId) => ({ to: "/invoice/$id", params: { id: refId } })}
        />
      )}

      {customer && (
        <ReceivePaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          customerId={customer.id}
          customerName={customer.name}
          customerPhone={customer.phone}
          onSaved={load}
        />
      )}
    </AppShell>
  );
}
