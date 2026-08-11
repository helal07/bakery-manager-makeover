import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { FileText, Search, Eye, Pencil, Wallet, Printer, X, ChevronDown, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadPurchases, updatePurchasePayment, deletePurchase, type Purchase } from "@/lib/purchase-store";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { pageTitle, getCompanyName } from "@/lib/company-settings";


export const Route = createFileRoute("/_authenticated/purchasing/list")({
  head: () => ({ meta: [{ title: pageTitle("Purchase List") }] }),
  component: PurchaseList,
});

function PurchaseList() {
  const { currentShowroomId } = useShowroomScope();
  const [list, setList] = useState<Purchase[]>([]);
  const [query, setQuery] = useState("");
  const [payment, setPayment] = useState<"All" | "Paid" | "Partial" | "Due">("All");
  const [supplier, setSupplier] = useState<string>("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [modal, setModal] = useState<{ mode: "view" | "payment" | "invoice"; p: Purchase } | null>(null);
  const [payDraft, setPayDraft] = useState<{ payment: "Paid" | "Due" | "Partial"; paid: number }>({ payment: "Due", paid: 0 });
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<Purchase | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!delTarget?.uuid) { toast.error("Missing purchase id"); return; }
    setDeleting(true);
    try {
      await deletePurchase(delTarget.uuid);
      setList((l) => l.filter((x) => x.id !== delTarget.id));
      toast.success(`Purchase ${delTarget.id} deleted`);
      setDelTarget(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete purchase");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    loadPurchases(currentShowroomId)
      .then(setList)
      .catch((e) => toast.error(e?.message ?? "Failed to load purchases"));
  }, [currentShowroomId]);

  const suppliers = useMemo(() => Array.from(new Set(list.map((p) => p.supplier))).sort(), [list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((p) => {
      const pay = p.payment ?? (p.status === "Received" ? "Paid" : "Due");
      if (payment !== "All" && pay !== payment) return false;
      if (supplier !== "All" && p.supplier !== supplier) return false;
      if (from && p.date < from) return false;
      if (to && p.date > to) return false;
      if (q) {
        const haystacks: string[] = [
          p.id,
          p.supplier,
          p.category ?? "",
          p.date ?? "",
          pay,
          String(p.total ?? ""),
          ...(p.items ?? []).flatMap((it) => [it.name ?? "", it.unit ?? ""]),
        ];
        const match = haystacks.some((h) => h.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [list, query, payment, supplier, from, to]);

  const resetFilters = () => { setQuery(""); setPayment("All"); setSupplier("All"); setFrom(""); setTo(""); };

  return (
    <AppShell title="Purchase List" subtitle="All supplier purchase orders">
      <Card className="p-3 sm:p-4 mb-4">
        <div className="relative">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search PO, supplier, item, date…"
            className="w-full h-11 sm:h-10 pl-8 pr-3 rounded-md border border-border bg-background text-base sm:text-sm outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="mt-2 sm:hidden inline-flex items-center gap-1.5 text-xs font-medium text-primary"
        >
          {showFilters ? "Hide filters" : "More filters"}
          <ChevronDown className={`size-3.5 transition-transform ${showFilters ? "rotate-180" : ""}`} />
        </button>
        <div className={`${showFilters ? "grid" : "hidden"} sm:grid mt-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3`}>
          <select value={payment} onChange={(e) => setPayment(e.target.value as any)} className="w-full h-11 sm:h-10 px-2.5 rounded-md border border-border bg-background text-sm">
            <option value="All">All payments</option>
            <option value="Paid">Paid</option>
            <option value="Partial">Partial</option>
            <option value="Due">Due</option>
          </select>
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-full h-11 sm:h-10 px-2.5 rounded-md border border-border bg-background text-sm truncate">
            <option value="All">All suppliers</option>
            {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full h-11 sm:h-10 min-w-0 px-2.5 rounded-md border border-border bg-background text-sm" />
          <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full h-11 sm:h-10 min-w-0 px-2.5 rounded-md border border-border bg-background text-sm" />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{filtered.length} of {list.length} purchases</span>
          <button onClick={resetFilters} className="px-2 py-1 rounded hover:bg-muted">Reset filters</button>
        </div>
      </Card>

      {/* Mobile list */}
      <div className="md:hidden space-y-2.5">
        {filtered.map((p) => {
          const pay = p.payment ?? (p.status === "Received" ? "Paid" : "Due");
          const tone = pay === "Paid" ? "success" : pay === "Partial" ? "warning" : "danger";
          return (
            <Card key={p.id} className="p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{p.supplier}</div>
                  <div className="mt-0.5 text-[11px] font-mono text-muted-foreground">{p.id}</div>
                </div>
                <Badge tone={tone}>{pay}</Badge>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{p.date}</span>
                <span>{p.items && p.items.length > 0 ? `${p.items.length} item(s)` : (p.category ?? "—")}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-dashed border-border pt-2">
                <div className="text-base font-semibold tabular-nums">৳{p.total.toLocaleString()}</div>
                <ActionsMenu
                  open={openMenu === `m:${p.id}`}
                  onToggle={() => setOpenMenu(openMenu === `m:${p.id}` ? null : `m:${p.id}`)}
                  onClose={() => setOpenMenu(null)}
                  onView={() => setModal({ mode: "view", p })}
                  canPay={pay !== "Paid"}
                  onPayment={() => {
                    setPayDraft({ payment: p.payment ?? "Due", paid: p.paid ?? 0 });
                    setModal({ mode: "payment", p });
                  }}
                  onInvoice={() => setModal({ mode: "invoice", p })}
                  onDelete={() => setDelTarget(p)}
                  editId={p.uuid}
                />
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">No purchases found.</Card>
        )}
      </div>

      <Card className="hidden md:block overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-5 py-3">PO #</th>
              <th className="text-left font-medium px-5 py-3">Supplier</th>
              <th className="text-left font-medium px-5 py-3">Items</th>
              <th className="text-left font-medium px-5 py-3">Date</th>
              <th className="text-right font-medium px-5 py-3">Amount</th>
              <th className="text-right font-medium px-5 py-3">Payment</th>
              <th className="text-right font-medium px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <td className="px-5 py-3 font-mono text-xs">{p.id}</td>
                <td className="px-5 py-3 font-medium">{p.supplier}</td>
                <td className="px-5 py-3 text-muted-foreground">
                  {p.items && p.items.length > 0 ? `${p.items.length} item(s)` : (p.category ?? "—")}
                </td>
                <td className="px-5 py-3 text-muted-foreground">{p.date}</td>
                <td className="px-5 py-3 text-right">৳{p.total.toLocaleString()}</td>
                <td className="px-5 py-3 text-right">
                  {(() => {
                    const pay = p.payment ?? (p.status === "Received" ? "Paid" : "Due");
                    const tone = pay === "Paid" ? "success" : pay === "Partial" ? "warning" : "danger";
                    return <Badge tone={tone}>{pay}</Badge>;
                  })()}
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end">
                    <ActionsMenu
                      open={openMenu === `d:${p.id}`}
                      onToggle={() => setOpenMenu(openMenu === `d:${p.id}` ? null : `d:${p.id}`)}
                      onClose={() => setOpenMenu(null)}
                      onView={() => setModal({ mode: "view", p })}
                      canPay={(p.payment ?? (p.status === "Received" ? "Paid" : "Due")) !== "Paid"}
                      onPayment={() => {
                        setPayDraft({ payment: p.payment ?? "Due", paid: p.paid ?? 0 });
                        setModal({ mode: "payment", p });
                      }}
                      onInvoice={() => setModal({ mode: "invoice", p })}
                      onDelete={() => setDelTarget(p)}
                      editId={p.uuid}

                    />
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-muted-foreground">No purchases found.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>

      {modal && (
        <Modal onClose={() => setModal(null)} title={modal.mode === "view" ? `Purchase ${modal.p.id}` : modal.mode === "payment" ? "Update Payment" : `Invoice ${modal.p.id}`}>
          {modal.mode === "view" && <ViewBody p={modal.p} />}
          {modal.mode === "invoice" && (
            <>
              <InvoiceBody p={modal.p} />
              <div className="flex justify-end mt-4">
                <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
                  <Printer className="size-4" /> Print
                </button>
              </div>
            </>
          )}
          {modal.mode === "payment" && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {(["Paid", "Partial", "Due"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setPayDraft((d) => ({ ...d, payment: opt, paid: opt === "Paid" ? modal.p.total : opt === "Due" ? 0 : d.paid }))}
                    className={`h-11 rounded-md text-sm font-medium border ${payDraft.payment === opt ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {payDraft.payment === "Partial" && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Paid amount (৳)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={payDraft.paid}
                    onChange={(e) => setPayDraft((d) => ({ ...d, paid: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 }))}
                    className="w-full h-11 px-3 rounded-md border border-border bg-background text-base sm:text-sm tabular-nums outline-none focus:border-primary"
                  />
                </div>
              )}

              <div className="text-sm text-muted-foreground">
                Total ৳{modal.p.total.toLocaleString()} · Due ৳{(modal.p.total - (payDraft.payment === "Paid" ? modal.p.total : payDraft.payment === "Due" ? 0 : payDraft.paid)).toLocaleString()}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 sm:flex sm:justify-end">
                <button onClick={() => setModal(null)} className="h-11 sm:h-9 px-4 rounded-md border border-border text-sm hover:bg-muted">Cancel</button>

                <button
                  onClick={async () => {
                    const paid = payDraft.payment === "Paid" ? modal.p.total : payDraft.payment === "Due" ? 0 : payDraft.paid;
                    if (!modal.p.uuid) { toast.error("Missing purchase id"); return; }
                    try {
                      await updatePurchasePayment(modal.p.uuid, payDraft.payment, paid, modal.p.total);
                      const updated: Purchase = { ...modal.p, payment: payDraft.payment, paid };
                      setList((l) => l.map((x) => (x.id === updated.id ? updated : x)));
                      setModal(null);
                    } catch (e: any) {
                      toast.error(e?.message ?? "Failed to update payment");
                    }
                  }}
                  className="h-11 sm:h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
      <ConfirmDialog
        open={!!delTarget}
        destructive
        busy={deleting}
        title={`Delete purchase ${delTarget?.id ?? ""}?`}
        description="This removes the purchase and its items, and reverses the raw-material stock it added. This cannot be undone."
        confirmLabel="Delete purchase"
        onConfirm={confirmDelete}
        onCancel={() => { if (!deleting) setDelTarget(null); }}
      />
    </AppShell>
  );
}

function ActionsMenu({
  open,
  onToggle,
  onClose,
  onView,
  canPay,
  onPayment,
  onInvoice,
  onDelete,
  editId,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onView: () => void;
  canPay: boolean;
  onPayment: () => void;
  onInvoice: () => void;
  onDelete: () => void;
  editId?: string;
}) {
  const nav = useNavigate();
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const rect = btnRef.current?.getBoundingClientRect();
    // A hidden instance (e.g. the mobile list on desktop) reports a zero rect —
    // never open it, otherwise its outside-click handler closes the visible menu.
    if (!rect || rect.width === 0) return;
    {
      const width = 160;
      setPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - width) });
    }
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener("mousedown", h);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", h);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, onClose]);
  const item = "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted";
  const run = (fn: () => void) => () => { onClose(); fn(); };
  return (
    <>
      <button
        ref={btnRef}
        onClick={onToggle}
        className="inline-flex items-center gap-1 px-3 py-1 rounded-md border border-primary text-primary text-xs font-medium hover:bg-primary/10"
      >
        Actions <ChevronDown className="size-3.5" />
      </button>
      {open && pos && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 160 }}
          className="z-50 rounded-md border border-border bg-background shadow-lg py-1"
        >
          <button className={item} onClick={run(onView)}><Eye className="size-4" /> View</button>
          {editId ? (
            <button
              type="button"
              className={item}
              onClick={() => { onClose(); nav({ to: "/purchasing/edit/$id", params: { id: editId } }); }}
            >
              <Pencil className="size-4" /> Edit
            </button>
          ) : null}
          {canPay && (
            <button className={item} onClick={run(onPayment)}><Wallet className="size-4" /> Payment</button>
          )}
          <button className={item} onClick={run(onInvoice)}><FileText className="size-4" /> Invoice</button>
          <button
            className={`${item} text-destructive hover:bg-destructive/10 border-t border-border mt-1 pt-2`}
            onClick={run(onDelete)}
          >
            <Trash2 className="size-4" /> Delete
          </button>
        </div>
      )}
    </>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-t-2xl sm:rounded-lg shadow-lg w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-background px-4 sm:px-5 py-3 border-b border-border">
          <div className="min-w-0 truncate font-medium">{title}</div>
          <button onClick={onClose} aria-label="Close" className="size-9 shrink-0 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>

      </div>
    </div>
  );
}

function ViewBody({ p }: { p: Purchase }) {
  const pay = p.payment ?? (p.status === "Received" ? "Paid" : "Due");
  const paid = pay === "Paid" ? p.total : pay === "Due" ? 0 : (p.paid ?? 0);
  const due = p.total - paid;
  const tone = pay === "Paid" ? "success" : pay === "Partial" ? "warning" : "danger";
  return (
    <div className="space-y-5 text-sm">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 rounded-md bg-muted/30 p-4">
        <Field label="PO #"><span className="font-mono">{p.id}</span></Field>
        <Field label="Date">{p.date}</Field>
        <Field label="Supplier"><span className="font-medium">{p.supplier}</span></Field>
        <Field label="Payment"><Badge tone={tone}>{pay}</Badge></Field>
      </div>
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-2">Items</div>
        <div className="border border-border rounded-md overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-right px-3 py-2">Unit price</th>
                <th className="text-right px-3 py-2">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(p.items ?? []).map((it, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">{it.name}</td>
                  <td className="px-3 py-2 text-right">{it.qty} {it.unit}</td>
                  <td className="px-3 py-2 text-right">৳{it.price.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">৳{(it.qty * it.price).toLocaleString()}</td>
                </tr>
              ))}
              {(!p.items || p.items.length === 0) && (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-xs text-muted-foreground">No line items</td></tr>
              )}
            </tbody>
          </table></div>
        </div>
      </div>
      <div className="flex justify-end">
        <div className="w-64 space-y-1.5">
          <Row label="Total" value={`৳${p.total.toLocaleString()}`} />
          <Row label="Paid" value={`৳${paid.toLocaleString()}`} />
          <div className="border-t border-border pt-1.5">
            <Row label="Due" value={`৳${due.toLocaleString()}`} strong />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold text-base" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function InvoiceBody({ p }: { p: Purchase }) {
  const pay = p.payment ?? (p.status === "Received" ? "Paid" : "Due");
  const paid = pay === "Paid" ? p.total : pay === "Due" ? 0 : (p.paid ?? 0);
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-lg font-semibold">{getCompanyName()}</div>
          <div className="text-xs text-muted-foreground">Purchase Invoice</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xs">{p.id}</div>
          <div className="text-xs text-muted-foreground">{p.date}</div>
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Supplier</div>
        <div className="font-medium">{p.supplier}</div>
      </div>
      <div className="border border-border rounded-md overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr><th className="text-left px-3 py-2">Item</th><th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2">Price</th><th className="text-right px-3 py-2">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(p.items ?? []).map((it, i) => (
              <tr key={i}><td className="px-3 py-2">{it.name}</td><td className="px-3 py-2 text-right">{it.qty} {it.unit}</td><td className="px-3 py-2 text-right">৳{it.price.toLocaleString()}</td><td className="px-3 py-2 text-right">৳{(it.qty * it.price).toLocaleString()}</td></tr>
            ))}
            {(!p.items || p.items.length === 0) && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-xs text-muted-foreground">No line items</td></tr>
            )}
          </tbody>
        </table></div>
      </div>
      <div className="flex justify-end">
        <div className="w-56 space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span>৳{p.total.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span>৳{paid.toLocaleString()}</span></div>
          <div className="flex justify-between font-semibold border-t border-border pt-1"><span>Due</span><span>৳{(p.total - paid).toLocaleString()}</span></div>
        </div>
      </div>
    </div>
  );
}