import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Badge, Card } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileDown, Filter, ReceiptText, RotateCcw, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { exportCsv } from "@/components/report-filters";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/reports/ledgers")({
  head: () => ({ meta: [{ title: "Payment & Return Ledger · Muzahid Food" }] }),
  component: () => (
    <PermissionGate anyOf={["reports.ledgers"]} title={"Payment & Return Ledger"}>
      <PaymentReturnLedger />
    </PermissionGate>
  ),

});

const sb = supabase as any;

type EntryKind = "customer_payment" | "supplier_payment" | "sale_return" | "purchase_return";
type Entry = {
  id: string;
  date: string;
  kind: EntryKind;
  party: string;
  invoice: string | null;
  saleId: string | null;
  branchId: string | null;
  detail: string;
  reference: string | null;
  inflow: number;
  outflow: number;
};

type KindFilter = "All" | EntryKind;

const KIND_LABEL: Record<EntryKind, string> = {
  customer_payment: "Customer Payment",
  supplier_payment: "Supplier Payment",
  sale_return: "Sale Return",
  purchase_return: "Purchase Return",
};

const KIND_TONE: Record<EntryKind, "success" | "danger" | "warning" | "primary"> = {
  customer_payment: "success",
  supplier_payment: "danger",
  sale_return: "warning",
  purchase_return: "primary",
};

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function money(n: number) {
  return `৳${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PaymentReturnLedger() {
  const { currentShowroomId, showrooms } = useShowroomScope();
  const [from, setFrom] = useState(() => isoDaysAgo(30));
  const [to, setTo] = useState(() => isoDaysAgo(0));
  const [kind, setKind] = useState<KindFilter>("All");
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<any | null>(null);

  const showroomName = useMemo(() => {
    const m = new Map(showrooms.map((s) => [s.id, s.name] as const));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "All");
  }, [showrooms]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : null;
      const toIso = to ? new Date(`${to}T23:59:59`).toISOString() : null;

      let customerPayments = sb
        .from("customer_payments")
        .select("id,paid_on,amount,method,reference,showroom_id,sale_id,invoice_ref,customer_name,customer_phone")
        .order("paid_on", { ascending: false });
      let supplierPayments = sb
        .from("supplier_payments")
        .select("id,paid_on,amount,method,reference,showroom_id,purchase_id,supplier_id,suppliers(name),purchases(code)")
        .order("paid_on", { ascending: false });
      let saleReturns = sb
        .from("sale_returns")
        .select("id,code,created_at,amount,reason,showroom_id,sale_id,invoice_ref,customer_name")
        .order("created_at", { ascending: false });
      let purchaseReturns = sb
        .from("purchase_returns")
        .select("id,code,created_at,amount,reason,showroom_id,purchase_id,invoice_ref,suppliers(name)")
        .order("created_at", { ascending: false });

      if (from) {
        customerPayments = customerPayments.gte("paid_on", from);
        supplierPayments = supplierPayments.gte("paid_on", from);
      }
      if (to) {
        customerPayments = customerPayments.lte("paid_on", to);
        supplierPayments = supplierPayments.lte("paid_on", to);
      }
      if (fromIso) {
        saleReturns = saleReturns.gte("created_at", fromIso);
        purchaseReturns = purchaseReturns.gte("created_at", fromIso);
      }
      if (toIso) {
        saleReturns = saleReturns.lte("created_at", toIso);
        purchaseReturns = purchaseReturns.lte("created_at", toIso);
      }

      // Strict location scope: no scope selected means Factory (showroom_id IS NULL).
      customerPayments = scopeTo(customerPayments, currentShowroomId);
      supplierPayments = scopeTo(supplierPayments, currentShowroomId);
      saleReturns = scopeTo(saleReturns, currentShowroomId);
      purchaseReturns = scopeTo(purchaseReturns, currentShowroomId);


      const [cp, sp, sr, pr] = await Promise.all([
        customerPayments,
        supplierPayments,
        saleReturns,
        purchaseReturns,
      ]);

      if (cancelled) return;

      const next: Entry[] = [
        ...((cp.data ?? []) as any[]).map((r) => ({
          id: r.id,
          date: r.paid_on,
          kind: "customer_payment" as const,
          party: r.customer_name || r.customer_phone || "Walk-in customer",
          invoice: r.invoice_ref ?? (r.sale_id ? String(r.sale_id).slice(0, 8) : null),
          saleId: r.sale_id,
          branchId: r.showroom_id,
          detail: r.method,
          reference: r.reference,
          inflow: Number(r.amount) || 0,
          outflow: 0,
        })),
        ...((sp.data ?? []) as any[]).map((r) => ({
          id: r.id,
          date: r.paid_on,
          kind: "supplier_payment" as const,
          party: r.suppliers?.name ?? "Supplier",
          invoice: r.purchases?.code ?? (r.purchase_id ? String(r.purchase_id).slice(0, 8) : null),
          saleId: null,
          branchId: r.showroom_id,
          detail: r.method,
          reference: r.reference,
          inflow: 0,
          outflow: Number(r.amount) || 0,
        })),
        ...((sr.data ?? []) as any[]).map((r) => ({
          id: r.id,
          date: String(r.created_at).slice(0, 10),
          kind: "sale_return" as const,
          party: r.customer_name || "Walk-in customer",
          invoice: r.invoice_ref ?? (r.sale_id ? String(r.sale_id).slice(0, 8) : null),
          saleId: r.sale_id,
          branchId: r.showroom_id,
          detail: r.reason,
          reference: r.code,
          inflow: 0,
          outflow: Number(r.amount) || 0,
        })),
        ...((pr.data ?? []) as any[]).map((r) => ({
          id: r.id,
          date: String(r.created_at).slice(0, 10),
          kind: "purchase_return" as const,
          party: r.suppliers?.name ?? "Supplier",
          invoice: r.invoice_ref ?? (r.purchase_id ? String(r.purchase_id).slice(0, 8) : null),
          saleId: null,
          branchId: r.showroom_id,
          detail: r.reason,
          reference: r.code,
          inflow: Number(r.amount) || 0,
          outflow: 0,
        })),
      ].sort((a, b) => b.date.localeCompare(a.date));

      if (cp.error || sp.error || sr.error || pr.error) console.error(cp.error ?? sp.error ?? sr.error ?? pr.error);
      setEntries(next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [currentShowroomId, from, to]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (kind !== "All" && e.kind !== kind) return false;
      if (!q) return true;
      const hay = `${KIND_LABEL[e.kind]} ${e.party} ${e.invoice ?? ""} ${e.detail} ${e.reference ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, kind, query]);

  const totals = filtered.reduce(
    (acc, e) => {
      acc.inflow += e.inflow;
      acc.outflow += e.outflow;
      if (e.kind === "customer_payment") acc.customerPayments += e.inflow;
      if (e.kind === "supplier_payment") acc.supplierPayments += e.outflow;
      if (e.kind === "sale_return") acc.saleReturns += e.outflow;
      if (e.kind === "purchase_return") acc.purchaseReturns += e.inflow;
      return acc;
    },
    { inflow: 0, outflow: 0, customerPayments: 0, supplierPayments: 0, saleReturns: 0, purchaseReturns: 0 },
  );
  const net = totals.inflow - totals.outflow;

  const reset = () => {
    setFrom(isoDaysAgo(30));
    setTo(isoDaysAgo(0));
    setKind("All");
    setQuery("");
  };

  const openInvoice = async (saleId: string) => {
    const { data: sale } = await sb.from("sales").select("*").eq("id", saleId).maybeSingle();
    const { data: items } = await sb.from("sale_items").select("*").eq("sale_id", saleId).order("created_at", { ascending: true });
    setInvoice({ sale, items: items ?? [] });
  };

  return (
    <AppShell title="Payment & Return Ledger" subtitle="Customer receipts, supplier payments and return offsets">
      <Card className="p-4 mb-5">
        <div className="flex items-center gap-2 mb-3 text-sm">
          <Filter className="size-4 text-muted-foreground" />
          <span className="font-medium">Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <div className="relative md:col-span-2 xl:col-span-2">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search party, invoice, reference…"
              className="w-full h-10 pl-8 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
            />
          </div>
          <select value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} className="w-full h-10 px-2.5 rounded-md border border-border bg-background text-sm">
            <option value="All">All ledger types</option>
            {(Object.keys(KIND_LABEL) as EntryKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full h-10 px-2.5 rounded-md border border-border bg-background text-sm" />
          <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full h-10 px-2.5 rounded-md border border-border bg-background text-sm" />
          <div className="flex gap-2">
            <button onClick={reset} className="inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-md border border-border text-sm hover:bg-accent">
              <RotateCcw className="size-4" /> Reset
            </button>
            <button
              onClick={() => exportCsv("payment-return-ledger.csv", [["Date", "Type", "Party", "Invoice", "Branch", "Detail", "Reference", "Inflow", "Outflow", "Net"], ...filtered.map((e) => [e.date, KIND_LABEL[e.kind], e.party, e.invoice ?? "", showroomName(e.branchId), e.detail, e.reference ?? "", e.inflow, e.outflow, e.inflow - e.outflow])])}
              className="inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
            >
              <FileDown className="size-4" /> Export
            </button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Kpi label="Customer receipts" value={money(totals.customerPayments)} tone="in" />
        <Kpi label="Supplier payments" value={money(totals.supplierPayments)} tone="out" />
        <Kpi label="Sale refunds" value={money(totals.saleReturns)} tone="out" />
        <Kpi label="Purchase credits" value={money(totals.purchaseReturns)} tone="in" />
        <Kpi label="Net movement" value={money(net)} tone={net < 0 ? "out" : "in"} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/50">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Date</th>
                <th className="text-left font-medium px-4 py-2.5">Type</th>
                <th className="text-left font-medium px-4 py-2.5">Party</th>
                <th className="text-left font-medium px-4 py-2.5">Invoice</th>
                <th className="text-left font-medium px-4 py-2.5">Branch</th>
                <th className="text-left font-medium px-4 py-2.5">Detail</th>
                <th className="text-left font-medium px-4 py-2.5">Reference</th>
                <th className="text-right font-medium px-4 py-2.5">Inflow / Credit</th>
                <th className="text-right font-medium px-4 py-2.5">Outflow / Debit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((e) => (
                <tr key={`${e.kind}-${e.id}`} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-muted-foreground">{e.date}</td>
                  <td className="px-4 py-2.5"><Badge tone={KIND_TONE[e.kind]}>{KIND_LABEL[e.kind]}</Badge></td>
                  <td className="px-4 py-2.5 font-medium">{e.party}</td>
                  <td className="px-4 py-2.5">
                    {e.saleId ? (
                      <button onClick={() => openInvoice(e.saleId!)} className="inline-flex items-center gap-1 text-primary hover:underline">
                        #{e.invoice ?? e.saleId.slice(0, 8)} <ExternalLink className="size-3" />
                      </button>
                    ) : e.invoice ? `#${e.invoice}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{showroomName(e.branchId)}</td>
                  <td className="px-4 py-2.5 capitalize">{String(e.detail).replace(/_/g, " ")}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{e.reference ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{e.inflow ? money(e.inflow) : "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-destructive">{e.outflow ? money(e.outflow) : "—"}</td>
                </tr>
              ))}
              {loading && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No ledger entries match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {invoice && <InvoiceModal data={invoice} onClose={() => setInvoice(null)} />}
    </AppShell>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "in" | "out" }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-1 tabular-nums ${tone === "out" ? "text-destructive" : "text-emerald-600"}`}>{value}</div>
    </Card>
  );
}

function InvoiceModal({ data, onClose }: { data: { sale: any; items: any[] }; onClose: () => void }) {
  const { sale, items } = data;
  if (!sale) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-background rounded-lg border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <ReceiptText className="size-4 text-muted-foreground" />
              <h2 className="font-semibold">Sales Invoice #{String(sale.external_ref ?? sale.id).slice(0, 12)}</h2>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{sale.customer_name || "Walk-in customer"} · {sale.created_at?.slice(0, 10)}</div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/invoice/$id" params={{ id: sale.id }} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Open full <ExternalLink className="size-3" /></Link>
            <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="size-4" /></button>
          </div>
        </div>
        <div className="p-4 text-sm">
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left py-1.5">Item</th><th className="text-right py-1.5">Qty</th><th className="text-right py-1.5">Price</th><th className="text-right py-1.5">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="py-1.5">{it.product_name}</td>
                  <td className="py-1.5 text-right tabular-nums">{Number(it.qty)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(Number(it.unit_price) || 0)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="mt-4 space-y-1 text-right">
            <div>Subtotal: <span className="tabular-nums">{money(Number(sale.subtotal) || 0)}</span></div>
            <div>Discount: <span className="tabular-nums">{money(Number(sale.discount) || 0)}</span></div>
            <div>Tax: <span className="tabular-nums">{money(Number(sale.tax) || 0)}</span></div>
            <div className="font-semibold">Total: <span className="tabular-nums">{money(Number(sale.total) || 0)}</span></div>
            <div className="text-emerald-600">Paid: <span className="tabular-nums">{money(Number(sale.paid) || 0)}</span></div>
            <div className="text-destructive">Due: <span className="tabular-nums">{money(Number(sale.due) || 0)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}