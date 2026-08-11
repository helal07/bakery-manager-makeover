import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, PackageCheck, Printer, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import {
  loadTransferItems,
  receiveTransfer,
  type IncomingTransfer,
  type IncomingTransferItem,
} from "@/lib/inbox-store";
import { getCompany, getCachedCompany, defaultCompany, pageTitle, type CompanySettings } from "@/lib/company-settings";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/transfers/receive/$id")({
  head: () => ({ meta: [{ title: pageTitle("Receive Transfer") }] }),
  component: () => (
    <PermissionGate anyOf={["inventory.receive", "inventory.transfer"]} title={"Receive Transfer"}>
      <ReceiveTransferPage />
    </PermissionGate>
  ),

});

const sb = supabase as any;

type Product = { id: string; name: string; sku: string | null; unit: string };

function ReceiveTransferPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { showrooms } = useShowroomScope();
  const [transfer, setTransfer] = useState<IncomingTransfer | null>(null);
  const [items, setItems] = useState<IncomingTransferItem[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"receive" | "cancel" | null>(null);
  const [company, setCompany] = useState<CompanySettings>(() => getCachedCompany() ?? defaultCompany);

  useEffect(() => { getCompany().then(setCompany).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: t, error } = await sb.from("transfers").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!t) { toast.error("Transfer not found"); navigate({ to: "/transfers" }); return; }
      setTransfer(t as IncomingTransfer);
      const its = await loadTransferItems(id);
      setItems(its);
      const pids = its.map((i) => i.product_id).filter(Boolean) as string[];
      if (pids.length) {
        const { data: pr } = await sb.from("products").select("id,name,sku,unit").in("id", pids);
        const map: Record<string, Product> = {};
        for (const p of (pr ?? []) as Product[]) map[p.id] = p;
        setProducts(map);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load transfer");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const locName = (rid: string | null) =>
    rid ? showrooms.find((s) => s.id === rid)?.name ?? "Unknown" : "Factory";

  const totalQty = useMemo(() => items.reduce((a, i) => a + Number(i.qty || 0), 0), [items]);

  const doReceive = async () => {
    if (!transfer) return;
    setBusy(true);
    try {
      await receiveTransfer(transfer);
      toast.success("Received and added to stock");
      setConfirm(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to receive");
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    if (!transfer) return;
    setBusy(true);
    try {
      const { error } = await sb.from("transfers").update({ status: "cancelled" }).eq("id", transfer.id);
      if (error) throw error;
      toast.success("Transfer cancelled");
      setConfirm(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to cancel");
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = () => window.print();

  const isReceived = transfer?.status === "received";

  return (
    <AppShell
      title="Receive Transfer"
      subtitle={transfer?.code ?? id.slice(0, 8)}
      actions={
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" size="sm" asChild>
            <Link to="/transfers"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
          {transfer?.status === "sent" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setConfirm("cancel")} disabled={busy}>
                <X className="w-4 h-4 mr-2" /> Cancel
              </Button>
              <Button size="sm" onClick={() => setConfirm("receive")} disabled={busy}>
                <PackageCheck className="w-4 h-4 mr-2" />
                {busy ? "Working…" : "Receive"}
              </Button>
            </>
          )}
        </div>
      }
    >
      {loading || !transfer ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
      ) : (
        <div className="print-area">
          <style>{`
            @media print {
              @page { size: A4; margin: 12mm; }
              body { background: #fff !important; }
              .print\\:hidden { display: none !important; }
              aside, header, nav { display: none !important; }
              .print-area { padding: 0 !important; }
              main { padding: 0 !important; }
            }
          `}</style>
          <Card className="p-6">
            {/* Print header */}
            <div className="hidden print:block mb-6 pb-4 border-b">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xl font-bold">{company.name || defaultCompany.name}</div>
                  {company.address && <div className="text-xs text-muted-foreground">{company.address}</div>}
                  {company.phone && <div className="text-xs text-muted-foreground">Phone: {company.phone}</div>}
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">Stock Transfer Receipt</div>
                  <div className="text-xs">#{transfer.code ?? transfer.id.slice(0, 8)}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-6 text-sm mb-4">
              <div>
                <div className="text-xs text-muted-foreground">From</div>
                <div className="font-medium">{locName(transfer.source_showroom_id)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">To</div>
                <div className="font-medium">{locName(transfer.dest_showroom_id)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Kind</div>
                <div>
                  <Badge tone="primary">
                    {transfer.kind === "damaged_return" ? "Damaged Return" : "New Stock"}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <div className="font-medium capitalize">{transfer.status}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Sent At</div>
                <div className="font-medium">
                  {transfer.sent_at ? new Date(transfer.sent_at).toLocaleString() : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Created</div>
                <div className="font-medium">{new Date(transfer.created_at).toLocaleString()}</div>
              </div>
            </div>

            {transfer.note && (
              <div className="text-sm italic text-muted-foreground mb-4">"{transfer.note}"</div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 print:hidden">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Line Items</div>
                <div className="text-lg font-semibold tabular-nums">{items.length}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Total Quantity</div>
                <div className="text-lg font-semibold tabular-nums">{totalQty}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Direction</div>
                <div className="text-sm font-medium truncate">
                  {locName(transfer.source_showroom_id)} → {locName(transfer.dest_showroom_id)}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Received At</div>
                <div className="text-sm font-medium">
                  {transfer.received_at ? new Date(transfer.received_at).toLocaleString() : "Pending"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4 print:hidden text-xs">
              {(["draft", "sent", "received"] as const).map((s, i) => {
                const order = ["draft", "sent", "received"];
                const active = order.indexOf(transfer.status) >= i;
                return (
                  <div key={s} className="flex items-center gap-2">
                    {i > 0 && <span className="h-px w-6 bg-border" />}
                    <span
                      className={
                        "px-2 py-1 rounded-full border capitalize " +
                        (active ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground")
                      }
                    >
                      {s}
                    </span>
                  </div>
                );
              })}
            </div>


            <div className="overflow-x-auto">
              <table className="w-full text-sm border">
                <thead>
                  <tr className="bg-muted/50 text-left">
                    <th className="py-2 px-3 border-b w-10">#</th>
                    <th className="py-2 px-3 border-b">Product</th>
                    <th className="py-2 px-3 border-b">SKU</th>
                    <th className="py-2 px-3 border-b text-right">Quantity</th>
                    <th className="py-2 px-3 border-b">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const p = it.product_id ? products[it.product_id] : null;
                    return (
                      <tr key={it.id} className="border-b last:border-0">
                        <td className="py-2 px-3">{idx + 1}</td>
                        <td className="py-2 px-3">{p?.name ?? "Unknown product"}</td>
                        <td className="py-2 px-3 text-muted-foreground">{p?.sku ?? "—"}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{it.qty}</td>
                        <td className="py-2 px-3 text-muted-foreground">{p?.unit ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold bg-muted/30">
                    <td className="py-2 px-3" colSpan={3}>Total</td>
                    <td className="py-2 px-3 text-right tabular-nums">{totalQty}</td>
                    <td className="py-2 px-3">units</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Signatures for print */}
            <div className="hidden print:grid grid-cols-2 gap-8 mt-16 text-xs">
              <div className="border-t pt-2 text-center">Sender Signature</div>
              <div className="border-t pt-2 text-center">Receiver Signature</div>
            </div>

            {isReceived && (
              <div className="mt-4 text-xs text-emerald-700 dark:text-emerald-400 print:hidden">
                Received {transfer.received_at ? `on ${new Date(transfer.received_at).toLocaleString()}` : ""}.
              </div>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
