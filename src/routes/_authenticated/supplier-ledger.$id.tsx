import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/permission-gate";
import { LedgerView, type LedgerParty } from "@/components/ledger-view";
import { buildLedger, type LedgerEntry } from "@/lib/ledger-math";
import { getCompany, type CompanySettings, pageTitle } from "@/lib/company-settings";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/supplier-ledger/$id")({
  head: () => ({ meta: [{ title: pageTitle("Supplier Ledger") }] }),
  component: () => (
    <PermissionGate anyOf={["contacts.suppliers.view", "purchases.view"]} title={"Supplier Ledger"}>
      <SupplierLedger />
    </PermissionGate>
  ),
  errorComponent: ({ error }) => (
    <AppShell title="Ledger"><Card className="p-5 text-sm text-destructive">{error.message}</Card></AppShell>
  ),
  notFoundComponent: () => (
    <AppShell title="Ledger"><Card className="p-5 text-sm text-muted-foreground">Supplier not found.</Card></AppShell>
  ),
});

function SupplierLedger() {
  const { id } = Route.useParams();
  const router = useRouter();
  const [party, setParty] = useState<LedgerParty | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [locations, setLocations] = useState<{ id: string | null; name: string }[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const sRes = await sb.from("suppliers").select("id,name,phone,email,address").eq("id", id).maybeSingle();
      if (sRes.error) throw sRes.error;
      if (!sRes.data) { setParty(null); return; }
      const s = sRes.data as any;
      setParty({ name: s.name, phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "" });

      const [pRes, payRes, retRes, shRes, comp] = await Promise.all([
        sb.from("purchases").select("id,code,purchase_date,total,paid,due,status,showroom_id").eq("supplier_id", id).order("purchase_date"),
        sb.from("supplier_payments").select("id,paid_on,amount,method,reference,note,purchase_id,showroom_id").eq("supplier_id", id).order("paid_on"),
        sb.from("purchase_returns").select("id,code,created_at,amount,reason,purchase_id,showroom_id").eq("supplier_id", id).order("created_at"),
        sb.from("showrooms").select("id,name"),
        getCompany(),
      ]);
      if (pRes.error) throw pRes.error;
      if (payRes.error) throw payRes.error;
      setCompany(comp);

      const rooms: { id: string | null; name: string }[] = [
        { id: null, name: "Factory" },
        ...((shRes.data ?? []) as any[]).map((r) => ({ id: r.id as string, name: r.name as string })),
      ];
      setLocations(rooms);
      const nameOf = (sid: string | null | undefined) => rooms.find((r) => r.id === (sid ?? null))?.name ?? "Factory";

      setEntries(
        buildLedger({
          kind: "supplier",
          locationName: nameOf,
          invoices: ((pRes.data ?? []) as any[]).map((p) => ({
            id: p.id,
            code: p.code,
            date: p.purchase_date,
            total: Number(p.total),
            paid: Number(p.paid),
            showroom_id: p.showroom_id,
          })),
          payments: ((payRes.data ?? []) as any[]).map((p) => ({
            id: p.id,
            date: p.paid_on,
            amount: Number(p.amount),
            method: p.method,
            reference: p.reference,
            note: p.note,
            invoice_id: p.purchase_id,
            showroom_id: p.showroom_id,
          })),
          returns: ((retRes.data ?? []) as any[]).map((r) => ({
            id: r.id,
            code: r.code,
            date: r.created_at,
            amount: Number(r.amount),
            invoice_id: r.purchase_id,
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
      subtitle={party?.phone || "Supplier statement"}
      actions={
        <Button size="sm" variant="outline" onClick={() => router.history.back()}><ArrowLeft className="size-4 mr-1" /> Back</Button>
      }
    >
      {!loading && !party ? (
        <Card className="p-6 text-sm text-muted-foreground">Supplier not found.</Card>
      ) : (
        <LedgerView
          party={party ?? { name: "" }}
          company={company}
          entries={entries}
          locations={locations}
          loading={loading}
        />
      )}
    </AppShell>
  );
}
