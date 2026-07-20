import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { Factory } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/production/batches")({
  head: () => ({ meta: [{ title: "Production Batches · Muzahid Food" }] }),
  component: Production,
});

type Batch = {
  id: string;
  product: string;
  qty: number;
  date: string;
  status: "Completed";
};

function Production() {
  const { currentShowroomId } = useShowroomScope();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      let q = supabase
        .from("stock_ledger")
        .select("id, qty, created_at, product_id, products(name)")
        .eq("kind", "production")
        .order("created_at", { ascending: false })
        .limit(200);
      q = q.is("showroom_id", null); // factory-only production
      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      setBatches(
        (data ?? []).map((r) => ({
          id: (r.id as string).slice(0, 8).toUpperCase(),
          product: (r as { products?: { name?: string } | null }).products?.name ?? "—",
          qty: Number(r.qty ?? 0),
          date: (r.created_at as string).slice(0, 10),
          status: "Completed" as const,
        })),
      );
      setLoading(false);
    })().catch((e) => {
      if (!cancelled) {
        toast.error(e?.message ?? "Failed to load batches");
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentShowroomId]);

  const completed = batches.length;
  const todayQty = batches
    .filter((b) => b.date === new Date().toISOString().slice(0, 10))
    .reduce((s, b) => s + b.qty, 0);

  return (
    <AppShell
      title="Production Planning"
      subtitle="Batch production · raw material auto-deduction"
      actions={
        <Link
          to="/recipes"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
        >
          <Factory className="size-4" /> Approve Batch
        </Link>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Batches (recent)</div>
          <div className="text-2xl font-semibold mt-1">{completed}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Units produced today</div>
          <div className="text-2xl font-semibold mt-1 text-primary">{todayQty}</div>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-5 py-3">Batch</th>
              <th className="text-left font-medium px-5 py-3">Product</th>
              <th className="text-right font-medium px-5 py-3">Qty</th>
              <th className="text-left font-medium px-5 py-3">Date</th>
              <th className="text-right font-medium px-5 py-3">Status</th>
              <th className="text-right font-medium px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {batches.map((b) => (
              <tr key={b.id} className="hover:bg-muted/30">
                <td className="px-5 py-3 font-mono text-xs"><span className="inline-flex items-center gap-1.5"><Factory className="size-3.5 text-primary" />{b.id}</span></td>
                <td className="px-5 py-3 font-medium">{b.product}</td>
                <td className="px-5 py-3 text-right">{b.qty}</td>
                <td className="px-5 py-3 text-muted-foreground">{b.date}</td>
                <td className="px-5 py-3 text-right">
                  <Badge tone="success">{b.status}</Badge>
                </td>
                <td className="px-5 py-3 text-right">
                  <Link
                    to="/production/labels/$ledgerId"
                    params={{ ledgerId: b.fullId }}
                    search={{ layout: "a4", qty: Math.min(b.qty, 50) }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-muted"
                  >
                    <Printer className="size-3.5" /> Labels
                  </Link>
                </td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">{loading ? "Loading…" : "No production batches yet. Approve one from Recipes."}</td></tr>
            )}
          </tbody>

        </table>
      </Card>
    </AppShell>
  );
}