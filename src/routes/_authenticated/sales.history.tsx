import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Search, Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sales/history")({
  head: () => ({ meta: [{ title: "Sales History · Muzahid Food" }] }),
  component: SalesHistoryPage,
});

const sb = supabase as any;

type SaleRow = {
  id: string;
  external_ref: string | null;
  customer_name: string | null;
  total: number;
  paid: number;
  due: number;
  payment_mode: string;
  created_at: string;
  showroom_id: string | null;
};
type LineRow = {
  id: string;
  product_name: string;
  product_sku: string | null;
  qty: number;
  unit_price: number;
  line_total: number;
};

function SalesHistoryPage() {
  const { currentShowroomId } = useShowroomScope();
  const loc = currentShowroomId;
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<SaleRow | null>(null);
  const [lines, setLines] = useState<LineRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const q = loc === null
      ? sb.from("sales").select("*").is("showroom_id", null)
      : sb.from("sales").select("*").eq("showroom_id", loc);
    const { data } = await q.order("created_at", { ascending: false }).limit(200);
    setRows((data ?? []) as SaleRow[]);
    setLoading(false);
  }, [loc]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!open) { setLines([]); return; }
    (async () => {
      const { data } = await sb.from("sale_items").select("*").eq("sale_id", open.id);
      setLines((data ?? []) as LineRow[]);
    })();
  }, [open]);

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      (r.external_ref ?? "").toLowerCase().includes(s) ||
      (r.customer_name ?? "").toLowerCase().includes(s));
  }, [rows, query]);

  return (
    <AppShell title="Sales History" subtitle="Live sales recorded to the database">
      <Card>
        <div className="p-4 border-b border-border flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by receipt or customer" className="pl-8" />
          </div>
          <div className="text-xs text-muted-foreground ml-auto">{filtered.length} sales</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Receipt</th>
                <th className="text-left px-4 py-2">Customer</th>
                <th className="text-left px-4 py-2">Payment</th>
                <th className="text-right px-4 py-2">Paid</th>
                <th className="text-right px-4 py-2">Due</th>
                <th className="text-right px-4 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">
                  <Receipt className="size-6 mx-auto mb-2 opacity-50" />
                  No sales yet at this location.
                </td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-accent/40 cursor-pointer" onClick={() => setOpen(r)}>
                  <td className="px-4 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.external_ref ?? r.id.slice(0, 8)}</td>
                  <td className="px-4 py-2">{r.customer_name ?? "Walk-in"}</td>
                  <td className="px-4 py-2 capitalize">{r.payment_mode}</td>
                  <td className="px-4 py-2 text-right">৳{Number(r.paid).toFixed(2)}</td>
                  <td className={`px-4 py-2 text-right ${Number(r.due) > 0 ? "text-destructive" : ""}`}>৳{Number(r.due).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-semibold">৳{Number(r.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Sale {open?.external_ref ?? open?.id.slice(0, 8)}</SheetTitle>
          </SheetHeader>
          {open && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="text-xs text-muted-foreground">{new Date(open.created_at).toLocaleString()}</div>
              <div>Customer: <span className="font-medium">{open.customer_name ?? "Walk-in"}</span></div>
              <div className="border-t border-border pt-3">
                <div className="text-xs font-semibold text-muted-foreground mb-2">ITEMS</div>
                {lines.length === 0 && <div className="text-xs text-muted-foreground">No line items.</div>}
                {lines.map((l) => (
                  <div key={l.id} className="flex justify-between py-1 border-b border-border/50 last:border-0">
                    <div>
                      <div>{l.product_name}</div>
                      <div className="text-xs text-muted-foreground">{l.product_sku ?? "—"} · {l.qty} × ৳{Number(l.unit_price).toFixed(2)}</div>
                    </div>
                    <div className="font-medium">৳{Number(l.line_total).toFixed(2)}</div>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-3 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Paid ({open.payment_mode})</span><span>৳{Number(open.paid).toFixed(2)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Due</span><span className={Number(open.due) > 0 ? "text-destructive" : ""}>৳{Number(open.due).toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold pt-1 border-t border-border"><span>Total</span><span>৳{Number(open.total).toFixed(2)}</span></div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}