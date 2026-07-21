import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Inbox as InboxIcon, PackageCheck, ChevronRight, ArrowRightLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import {
  loadIncomingTransfers,
  loadTransferItems,
  receiveTransfer,
  type IncomingTransfer,
  type IncomingTransferItem,
} from "@/lib/inbox-store";
import { pageTitle } from "@/lib/company-settings";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: pageTitle("Inbox — Incoming Transfers") }] }),
  component: InboxPage,
});

const sb = supabase as any;

type Product = { id: string; name: string; sku: string | null; unit: string };

function InboxPage() {
  const { showrooms, currentShowroomId, hasGlobalAccess } = useShowroomScope();
  const [rows, setRows] = useState<IncomingTransfer[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [itemsByT, setItemsByT] = useState<Record<string, IncomingTransferItem[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadIncomingTransfers(currentShowroomId);
      setRows(list);
      const productIds = new Set<string>();
      const itemsMap: Record<string, IncomingTransferItem[]> = {};
      for (const t of list) {
        const items = await loadTransferItems(t.id);
        itemsMap[t.id] = items;
        items.forEach((i) => i.product_id && productIds.add(i.product_id));
      }
      setItemsByT(itemsMap);
      if (productIds.size) {
        const { data } = await sb
          .from("products")
          .select("id,name,sku,unit")
          .in("id", Array.from(productIds));
        const map: Record<string, Product> = {};
        for (const p of (data ?? []) as Product[]) map[p.id] = p;
        setProducts(map);
      } else {
        setProducts({});
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  }, [currentShowroomId]);

  useEffect(() => { load(); }, [load]);

  const doReceive = async (t: IncomingTransfer) => {
    setBusy(t.id);
    try {
      await receiveTransfer(t);
      toast.success("Received and added to stock");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to receive");
    } finally {
      setBusy(null);
    }
  };

  const locName = (id: string | null) =>
    id ? showrooms.find((s) => s.id === id)?.name ?? "Unknown" : "Factory";

  const currentLabel = useMemo(() => locName(currentShowroomId), [currentShowroomId, showrooms]);

  if (!currentShowroomId) {
    return (
      <AppShell title="Inbox" subtitle="Incoming transfers from factory">
        <Card className="p-6 text-sm text-muted-foreground">
          Inbox shows transfers sent to a specific showroom. Please select a
          showroom from the top switcher {hasGlobalAccess && "(you currently have global / factory scope)"}.
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Inbox"
      subtitle={`Incoming transfers waiting at ${currentLabel}`}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/transfers">
            <ArrowRightLeft className="w-4 h-4 mr-2" /> All Transfers
          </Link>
        </Button>
      }
    >
      {loading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <InboxIcon className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No pending transfers. You're all caught up.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((t) => {
            const items = itemsByT[t.id] ?? [];
            const isOpen = expanded === t.id;
            const totalQty = items.reduce((a, i) => a + Number(i.qty || 0), 0);
            return (
              <Card key={t.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                        {t.code ?? t.id.slice(0, 8)}
                      </span>
                      <Badge tone="primary">{t.kind === "damaged_return" ? "Damaged Return" : "New Stock"}</Badge>
                      <span className="text-sm text-muted-foreground">
                        From <b className="text-foreground">{locName(t.source_showroom_id)}</b>
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Sent {t.sent_at ? new Date(t.sent_at).toLocaleString() : new Date(t.created_at).toLocaleString()} · {items.length} item(s) · {totalQty} units
                    </div>
                    {t.note && <div className="text-xs mt-1 italic">"{t.note}"</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setExpanded(isOpen ? null : t.id)}>
                      <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      {isOpen ? "Hide" : "Details"}
                    </Button>
                    <Button size="sm" onClick={() => doReceive(t)} disabled={busy === t.id}>
                      <PackageCheck className="w-4 h-4 mr-2" />
                      {busy === t.id ? "Receiving…" : "Receive"}
                    </Button>
                  </div>
                </div>
                {isOpen && (
                  <div className="mt-3 pt-3 border-t">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-1.5">Product</th>
                          <th className="py-1.5">SKU</th>
                          <th className="py-1.5 text-right">Quantity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it) => {
                          const p = it.product_id ? products[it.product_id] : null;
                          return (
                            <tr key={it.id} className="border-b last:border-0">
                              <td className="py-1.5">{p?.name ?? "Unknown product"}</td>
                              <td className="py-1.5 text-muted-foreground text-xs">{p?.sku ?? "—"}</td>
                              <td className="py-1.5 text-right tabular-nums">
                                {it.qty} <span className="text-muted-foreground text-xs">{p?.unit}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
