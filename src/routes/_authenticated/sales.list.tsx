import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { Search, Filter, Eye, Pencil, CreditCard, FileText, Undo2, Bell, ChevronDown, UserRound, Store, Download, Printer, Share2, MessageCircle, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/sales/list")({
  head: () => ({ meta: [{ title: "Sale List · Crumb & Co." }] }),
  component: SaleList,
});

type Status = "Paid" | "Due" | "Partial";
type Row = { id: string; date: string; customer: string; phone: string; items: number; total: number; paid: number; status: Status; addedBy: string; branch: string };

const tone: Record<Status, "success" | "danger" | "warning"> = { Paid: "success", Due: "danger", Partial: "warning" };

function SaleList() {
  const { currentShowroomId } = useShowroomScope();
  const loc = currentShowroomId;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [addedBy, setAddedBy] = useState("All");
  const [branch, setBranch] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [payment, setPayment] = useState<"All" | "Due" | "Advance" | "Paid" | "Partial">("All");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const q1 = loc === null
        ? sb.from("sales").select("id,external_ref,customer_name,customer_phone,total,paid,due,created_at,showroom_id").is("showroom_id", null)
        : sb.from("sales").select("id,external_ref,customer_name,customer_phone,total,paid,due,created_at,showroom_id").eq("showroom_id", loc);
      const { data: sales } = await q1.order("created_at", { ascending: false }).limit(500);
      const ids = (sales ?? []).map((s: any) => s.id);
      let counts: Record<string, number> = {};
      let showroomNames: Record<string, string> = {};
      if (ids.length) {
        const { data: si } = await sb.from("sale_items").select("sale_id,qty").in("sale_id", ids);
        for (const l of si ?? []) counts[l.sale_id] = (counts[l.sale_id] ?? 0) + Number(l.qty || 0);
        const shIds = Array.from(new Set((sales ?? []).map((s: any) => s.showroom_id).filter(Boolean)));
        if (shIds.length) {
          const { data: sh } = await sb.from("showrooms").select("id,name").in("id", shIds);
          for (const r of sh ?? []) showroomNames[r.id] = r.name;
        }
      }
      const mapped: Row[] = (sales ?? []).map((s: any) => {
        const total = Number(s.total || 0);
        const paidN = Number(s.paid || 0);
        const status: Status = paidN <= 0 ? "Due" : paidN >= total ? "Paid" : "Partial";
        return {
          id: s.external_ref ?? s.id.slice(0, 8),
          date: new Date(s.created_at).toLocaleString(),
          customer: s.customer_name ?? "Walk-in Customer",
          phone: s.customer_phone ?? "",
          items: counts[s.id] ?? 0,
          total, paid: paidN, status,
          addedBy: "—",
          branch: s.showroom_id ? (showroomNames[s.showroom_id] ?? "—") : "Factory",
        };
      });
      if (!cancelled) { setRows(mapped); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [loc]);

  const users = Array.from(new Set(rows.map((r) => r.addedBy)));
  const branches = Array.from(new Set(rows.map((r) => r.branch)));

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (addedBy !== "All" && r.addedBy !== addedBy) return false;
      if (branch !== "All" && r.branch !== branch) return false;
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (payment === "Due") {
        if (r.total - r.paid <= 0) return false;
      } else if (payment === "Advance") {
        if (r.paid - r.total <= 0) return false;
      } else if (payment !== "All" && r.status !== payment) return false;
      if (q) {
        const s = q.toLowerCase();
        const digits = q.replace(/\D/g, "");
        const phoneDigits = r.phone.replace(/\D/g, "");
        const matches =
          r.id.toLowerCase().includes(s) ||
          r.customer.toLowerCase().includes(s) ||
          (digits.length > 0 && phoneDigits.length > 0 && phoneDigits.includes(digits));
        if (!matches) return false;
      }
      return true;
    });
  }, [rows, q, addedBy, branch, from, to, payment]);

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const navigate = useNavigate();
  type ActionType = "View" | "Payment" | "Invoice" | "Return sale" | "Notify";
  const [action, setAction] = useState<{ type: ActionType; row: Row } | null>(null);
  const runAction = (type: ActionType, row: Row) => {
    setOpenMenu(null);
    setAction({ type, row });
  };


  return (
    <AppShell title="Sale List" subtitle="All completed sales">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3 text-sm">
          <Filter className="size-4 text-muted-foreground" />
          <span className="font-medium">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-6 xl:col-span-2">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice, customer or number…"
              className="w-full h-10 pl-8 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary" />
          </div>
          <div className="relative lg:col-span-3 xl:col-span-1">
            <UserRound className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select value={addedBy} onChange={(e) => setAddedBy(e.target.value)} className="w-full h-10 pl-8 pr-8 rounded-md border border-border bg-background text-sm appearance-none truncate">
              <option value="All">Added person</option>
              {users.map((u) => <option key={u}>{u}</option>)}
            </select>
            <ChevronDown className="size-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          <div className="relative lg:col-span-3 xl:col-span-1">
            <Store className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className="w-full h-10 pl-8 pr-8 rounded-md border border-border bg-background text-sm appearance-none truncate">
              <option value="All">All branches</option>
              {branches.map((b) => <option key={b}>{b}</option>)}
            </select>
            <ChevronDown className="size-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full h-10 min-w-0 px-2.5 rounded-md border border-border bg-background text-sm lg:col-span-3 xl:col-span-1" />
          <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full h-10 min-w-0 px-2.5 rounded-md border border-border bg-background text-sm lg:col-span-3 xl:col-span-1" />
          <div className="relative lg:col-span-3 xl:col-span-1">
            <CreditCard className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select value={payment} onChange={(e) => setPayment(e.target.value as typeof payment)} className="w-full h-10 pl-8 pr-8 rounded-md border border-border bg-background text-sm appearance-none truncate">
              <option value="All">All payments</option>
              <option value="Due">Sale due</option>
              <option value="Advance">Advance pay</option>
              <option value="Partial">Partial</option>
              <option value="Paid">Paid</option>
            </select>
            <ChevronDown className="size-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 w-16">Action</th>
                <th className="text-left px-4 py-2.5">Invoice</th>
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-4 py-2.5">Customer</th>
                <th className="text-left px-4 py-2.5">Number</th>
                <th className="text-left px-4 py-2.5">Added by</th>
                <th className="text-left px-4 py-2.5">Branch</th>
                <th className="text-right px-4 py-2.5">Items</th>
                <th className="text-right px-4 py-2.5">Total</th>
                <th className="text-right px-4 py-2.5">Paid</th>
                <th className="text-left px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-accent/40">
                  <td className="px-4 py-2.5 relative">
                    <button
                      onClick={() => setOpenMenu(openMenu === r.id ? null : r.id)}
                      className="inline-flex items-center gap-2 pl-3 pr-2 py-1 rounded-md border border-sky-500 text-sky-600 bg-white hover:bg-sky-50 text-xs font-semibold shadow-sm"
                    >
                      Actions
                      <span className="inline-block w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-sky-500" />
                    </button>
                    {openMenu === r.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                        <div className="absolute left-4 top-9 z-20 w-48 rounded-md border border-border bg-popover shadow-lg py-1 text-sm text-left">
                          <MenuItem icon={Eye} label="View" onClick={() => runAction("View", r)} />
                          <MenuItem icon={Pencil} label="Edit" onClick={() => { setOpenMenu(null); navigate({ to: "/sales/edit/$id", params: { id: r.id } }); }} />
                          <MenuItem icon={CreditCard} label="Payment" disabled={r.status === "Paid"} onClick={() => runAction("Payment", r)} />
                          <MenuItem icon={FileText} label="Invoice" onClick={() => runAction("Invoice", r)} />
                          <MenuItem icon={Undo2} label="Return sale" onClick={() => runAction("Return sale", r)} />
                          <div className="my-1 h-px bg-border" />
                          <MenuItem icon={Bell} label="New sale notification" onClick={() => runAction("Notify", r)} />
                        </div>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-medium">#{r.id}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.date}</td>
                  <td className="px-4 py-2.5">{r.customer}</td>
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{r.phone}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.addedBy}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.branch}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.items}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">৳{r.total.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">৳{r.paid.toFixed(2)}</td>
                  <td className="px-4 py-2.5"><Badge tone={tone[r.status]}>{r.status}</Badge></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="text-center text-sm text-muted-foreground py-10">No sales match your filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {action && (
        <Modal title={`${action.type === "Notify" ? "New sale notification" : action.type} — #${action.row.id}`} onClose={() => setAction(null)}>
          {action.type === "View" && <ViewBody row={action.row} onClose={() => setAction(null)} />}
          {action.type === "Payment" && <PaymentBody row={action.row} onClose={() => setAction(null)} />}
          {action.type === "Invoice" && <InvoiceBody row={action.row} onClose={() => setAction(null)} />}
          {action.type === "Return sale" && <ReturnBody row={action.row} onClose={() => setAction(null)} />}
          {action.type === "Notify" && <NotifyBody row={action.row} onClose={() => setAction(null)} />}
        </Modal>
      )}
    </AppShell>
  );
}



function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-border bg-popover shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ViewBody({ row, onClose }: { row: Row; onClose: () => void }) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Date</dt><dd>{row.date}</dd>
        <dt className="text-muted-foreground">Customer</dt><dd>{row.customer}</dd>
        <dt className="text-muted-foreground">Branch</dt><dd>{row.branch}</dd>
        <dt className="text-muted-foreground">Added by</dt><dd>{row.addedBy}</dd>
        <dt className="text-muted-foreground">Items</dt><dd>{row.items}</dd>
        <dt className="text-muted-foreground">Total</dt><dd>৳{row.total.toFixed(2)}</dd>
        <dt className="text-muted-foreground">Paid</dt><dd>৳{row.paid.toFixed(2)}</dd>
        <dt className="text-muted-foreground">Status</dt><dd><Badge tone={tone[row.status]}>{row.status}</Badge></dd>
      </dl>
      <div className="mt-5 flex justify-end"><button onClick={onClose} className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent">Close</button></div>
    </>
  );
}

function PaymentBody({ row, onClose }: { row: Row; onClose: () => void }) {
  const due = Math.max(0, row.total - row.paid);
  const [amount, setAmount] = useState<string>(due.toFixed(2));
  const [method, setMethod] = useState("Cash");
  const [note, setNote] = useState("");
  const set = (v: number) => setAmount(v.toFixed(2));
  const submit = (e: React.FormEvent) => { e.preventDefault(); onClose(); };
  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/40 p-3">
        <div><div className="text-xs text-muted-foreground">Total</div><div className="font-semibold">৳{row.total.toFixed(2)}</div></div>
        <div><div className="text-xs text-muted-foreground">Paid</div><div className="font-semibold">৳{row.paid.toFixed(2)}</div></div>
        <div><div className="text-xs text-muted-foreground">Due</div><div className="font-semibold text-destructive">৳{due.toFixed(2)}</div></div>
      </div>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Amount to pay (manual)</span>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-muted-foreground">৳</span>
          <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter any amount"
            className="flex-1 px-2 py-2 rounded-md border border-border bg-background outline-none focus:border-primary" autoFocus />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <button type="button" onClick={() => set(due)} className="px-2 py-1 rounded border border-border hover:bg-accent">Full due</button>
          <button type="button" onClick={() => set(due / 2)} className="px-2 py-1 rounded border border-border hover:bg-accent">Half</button>
          <button type="button" onClick={() => set(100)} className="px-2 py-1 rounded border border-border hover:bg-accent">৳100</button>
          <button type="button" onClick={() => set(500)} className="px-2 py-1 rounded border border-border hover:bg-accent">৳500</button>
          <button type="button" onClick={() => set(1000)} className="px-2 py-1 rounded border border-border hover:bg-accent">৳1000</button>
        </div>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Method</span>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 w-full px-2 py-2 rounded-md border border-border bg-background">
          <option>Cash</option><option>bKash</option><option>Nagad</option><option>Card</option><option>Bank transfer</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Note (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full px-2 py-2 rounded-md border border-border bg-background" />
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md border border-border hover:bg-accent">Cancel</button>
        <button type="submit" className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90">Record payment</button>
      </div>
    </form>
  );
}

function buildInvoiceUrl(row: Row, autoPrint: boolean) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const params = new URLSearchParams({
    c: row.customer,
    d: row.date,
    b: row.branch,
    i: String(row.items),
    t: String(row.total),
    p: String(row.paid),
  });
  if (autoPrint) params.set("ap", "1");
  return `${origin}/invoice/${row.id}?${params.toString()}`;
}

function InvoiceBody({ row, onClose }: { row: Row; onClose: () => void }) {
  const open = () => window.open(buildInvoiceUrl(row, false), "_blank", "noopener");
  const print = () => window.open(buildInvoiceUrl(row, true), "_blank", "noopener");
  const share = async () => {
    const url = buildInvoiceUrl(row, false);
    const text = `Invoice #${row.id} — ${row.customer} — ৳${row.total.toFixed(2)}\n${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: `Invoice #${row.id}`, text, url }); return; } catch { /* cancelled */ }
    }
    await navigator.clipboard?.writeText(url);
    alert("Invoice link copied to clipboard");
  };
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md border border-border p-3 bg-background">
        <div className="font-semibold">Invoice #{row.id}</div>
        <div className="text-muted-foreground text-xs">{row.date} · {row.customer} · {row.branch}</div>
        <div className="mt-2 flex justify-between"><span>Total</span><span>৳{row.total.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>Paid</span><span>৳{row.paid.toFixed(2)}</span></div>
        <div className="flex justify-between font-medium"><span>Due</span><span>৳{(row.total - row.paid).toFixed(2)}</span></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button onClick={open} className="inline-flex flex-col items-center gap-1 p-3 rounded-md border border-border hover:bg-accent">
          <Download className="size-5" /><span className="text-xs">Open</span>
        </button>
        <button onClick={print} className="inline-flex flex-col items-center gap-1 p-3 rounded-md border border-border hover:bg-accent">
          <Printer className="size-5" /><span className="text-xs">Print</span>
        </button>
        <button onClick={share} className="inline-flex flex-col items-center gap-1 p-3 rounded-md border border-border hover:bg-accent">
          <Share2 className="size-5" /><span className="text-xs">Share</span>
        </button>
      </div>
      <div className="flex justify-end pt-1"><button onClick={onClose} className="px-3 py-1.5 rounded-md border border-border hover:bg-accent">Close</button></div>
    </div>
  );
}


function ReturnBody({ row, onClose }: { row: Row; onClose: () => void }) {
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const submit = (e: React.FormEvent) => { e.preventDefault(); onClose(); };
  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <p className="text-muted-foreground">Return items from invoice <b>#{row.id}</b> ({row.items} items sold).</p>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Return qty</span>
        <input type="number" min={1} max={row.items} value={qty} onChange={(e) => setQty(+e.target.value)}
          className="mt-1 w-full px-2 py-2 rounded-md border border-border bg-background" />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Reason</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
          className="mt-1 w-full px-2 py-2 rounded-md border border-border bg-background" />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md border border-border hover:bg-accent">Cancel</button>
        <button type="submit" className="px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground font-medium hover:opacity-90">Process return</button>
      </div>
    </form>
  );
}

function normalizeBangladeshNumber(value: string, includePlus = false) {
  const raw = value.trim();
  if (!raw || raw === "—") return "";
  let digits = raw.replace(/\D/g, "");

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("01") && digits.length === 11) digits = `880${digits.slice(1)}`;
  if (digits.startsWith("88") && !digits.startsWith("880")) digits = `880${digits.slice(2)}`;

  return includePlus && digits ? `+${digits}` : digits;
}

function buildNotifyLink(channel: "sms" | "whatsapp", phone: string, message: string) {
  const text = encodeURIComponent(message.trim());
  if (channel === "whatsapp") {
    const number = normalizeBangladeshNumber(phone);
    if (number.length < 10) return "";
    return `https://api.whatsapp.com/send?phone=${number}&text=${text}`;
  }

  const number = normalizeBangladeshNumber(phone, true);
  if (number.length < 11) return "";
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  return `sms:${number}${isIOS ? "&" : "?"}body=${text}`;
}

function NotifyBody({ row, onClose }: { row: Row; onClose: () => void }) {
  const [channel, setChannel] = useState<"sms" | "whatsapp">("sms");
  const savedPhone = row.phone && row.phone !== "—" ? normalizeBangladeshNumber(row.phone, true) : "";
  const [phone, setPhone] = useState(savedPhone);
  const [error, setError] = useState("");
  const company = { name: "Crumb & Co.", address: "12 Gulshan Ave, Dhaka" };
  const product = `${row.items} item${row.items > 1 ? "s" : ""}`;
  const invoiceUrl = (() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://crumb.co";
    const params = new URLSearchParams({
      c: row.customer,
      d: row.date,
      b: row.branch,
      i: String(row.items),
      t: String(row.total),
      p: String(row.paid),
    });
    return `${origin}/invoice/${row.id}?${params.toString()}`;
  })();
  const todayDue = Math.max(0, row.total - row.paid);
  const totalDue = todayDue;
  const defaultMsg =
    `Dear ${row.customer},\n` +
    `Thank you for purchasing ${product} from ${company.name}. ` +
    `We hope you are satisfied with our service.\n\n` +
    `Invoice: #${row.id}\n` +
    `View: ${invoiceUrl}\n` +
    `Date: ${row.date}\n` +
    `Paid today: ৳${row.paid.toFixed(2)}\n` +
    `Today's due: ৳${todayDue.toFixed(2)}\n` +
    `Total due: ৳${totalDue.toFixed(2)}\n\n` +
    `${company.name}\n${company.address}`;
  const [message, setMessage] = useState(defaultMsg);
  const notifyLink = buildNotifyLink(channel, phone, message);
  const handleOpen = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!notifyLink) {
      e.preventDefault();
      setError("Please enter a valid customer mobile number before sending.");
      return;
    }
    setError("");
  };
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setChannel("sms")}
          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium ${channel === "sms" ? "border-primary text-primary bg-primary/5" : "border-border hover:bg-accent"}`}>
          <Phone className="size-4" /> SMS
        </button>
        <button type="button" onClick={() => setChannel("whatsapp")}
          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium ${channel === "whatsapp" ? "border-green-600 text-green-700 bg-green-50" : "border-border hover:bg-accent"}`}>
          <MessageCircle className="size-4" /> WhatsApp
        </button>
      </div>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">{channel === "whatsapp" ? "WhatsApp number (with country code)" : "Phone number"}</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={channel === "whatsapp" ? "+8801XXXXXXXXX" : "01XXXXXXXXX"} required
          className="mt-1 w-full px-2 py-2 rounded-md border border-border bg-background" />
        <span className="mt-1 block text-[11px] text-muted-foreground">
          {savedPhone ? `Auto-filled from customer record (${row.customer}).` : "No saved number for this customer — enter one to send."}
        </span>
        {error && <span className="mt-1 block text-[11px] text-destructive">{error}</span>}
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Message</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={10}
          className="mt-1 w-full px-2 py-2 rounded-md border border-border bg-background" />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md border border-border hover:bg-accent">Cancel</button>
        <a href={notifyLink || undefined} target={channel === "whatsapp" ? "_blank" : undefined} rel="noreferrer" onClick={handleOpen} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90">
          Send via {channel === "whatsapp" ? "WhatsApp" : "SMS"}
        </a>
      </div>
    </div>
  );
}

function MenuItem({ icon: Icon, label, danger, disabled, onClick }: { icon: any; label: string; danger?: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed ${danger ? "text-destructive" : ""}`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}