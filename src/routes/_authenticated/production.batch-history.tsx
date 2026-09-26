import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { Printer, FileDown, ChevronRight, Boxes, Layers, Receipt, BarChart3, Search, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Pager } from "@/components/pager";
import { pageTitle, getCompany, getCachedCompany, defaultCompany, type CompanySettings } from "@/lib/company-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PermissionGate } from "@/components/permission-gate";
import { printBatchHistoryReport, exportBatchHistoryXlsx, type BatchReportRow } from "@/lib/batch-history-report";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { editProductionBatch, loadRecipeFor, voidProductionBatch } from "@/lib/recipe-store";

const sb = supabase as any;

type Search = { from?: string; to?: string; product?: string; q?: string };

export const Route = createFileRoute("/_authenticated/production/batch-history")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    from: typeof s.from === "string" ? s.from : undefined,
    to: typeof s.to === "string" ? s.to : undefined,
    product: typeof s.product === "string" ? s.product : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  head: () => ({ meta: [{ title: pageTitle("Batch History") }] }),
  component: () => (
    <PermissionGate
      anyOf={["production.reports.batch_history", "production.reports.view", "production.batches"]}
      title="Batch History"
    >
      <BatchHistoryPage />
    </PermissionGate>
  ),
});

const fmt = (n: number, d = 2) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: d }).format(Number(n) || 0);
const money = (n: number) => "৳" + fmt(n, 2);

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
type Preset = "today" | "yesterday" | "week" | "month" | "year" | "custom";
function presetRange(p: Preset): { from: string; to: string } {
  const now = new Date();
  const today = ymd(now);
  if (p === "today") return { from: today, to: today };
  if (p === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: ymd(y), to: ymd(y) };
  }
  if (p === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return { from: ymd(d), to: today };
  }
  if (p === "year") return { from: ymd(new Date(now.getFullYear(), 0, 1)), to: today };
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
}

type Batch = {
  batchId: string;
  batchNo: string;
  createdAt: string;
  productId: string;
  productName: string;
  qty: number;
  price: number;
  transferPrice: number;
  materials: { name: string; unit: string; qty: number; cost: number }[];
  materialCost: number;
  overhead: number;
};


function BatchHistoryPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const initial = presetRange("today");
  const from = search.from ?? initial.from;
  const to = search.to ?? initial.to;
  const productFilter = search.product ?? "";
  const q = search.q ?? "";

  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [company, setCompany] = useState<CompanySettings>(() => getCachedCompany() ?? defaultCompany);
  const [reloadKey, setReloadKey] = useState(0);

  // Batch CRUD
  const { hasAny } = usePermissions();
  const canEditBatch = hasAny("production.batches.edit");
  const canDeleteBatch = hasAny("production.batches.delete");
  const [toDelete, setToDelete] = useState<Batch | null>(null);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [editQty, setEditQty] = useState("");
  const [crudBusy, setCrudBusy] = useState(false);

  const doDelete = async () => {
    if (!toDelete) return;
    setCrudBusy(true);
    try {
      await voidProductionBatch(toDelete.batchId, "Deleted from Batch History");
      toast.success(`Batch #${toDelete.batchNo} deleted — materials returned to factory stock`);
      setToDelete(null);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete batch");
    } finally {
      setCrudBusy(false);
    }
  };

  const doEdit = async () => {
    if (!editing) return;
    const qty = Number(editQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Quantity must be greater than zero");
      return;
    }
    setCrudBusy(true);
    try {
      const ingredients = await loadRecipeFor(editing.productId);
      if (ingredients.length === 0) {
        toast.error("This product has no saved recipe, so the batch cannot be recalculated.");
        return;
      }
      await editProductionBatch({ batchId: editing.batchId, batch: qty, ingredients });
      toast.success(`Batch #${editing.batchNo} corrected to ${qty}`);
      setEditing(null);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to edit batch");
    } finally {
      setCrudBusy(false);
    }
  };

  useEffect(() => {
    getCompany().then(setCompany).catch(() => {});
  }, []);

  const setSearch = (patch: Search) =>
    navigate({ search: (prev: Search) => ({ ...prev, ...patch }) });

  const activePreset: Preset = useMemo(() => {
    for (const p of ["today", "yesterday", "week", "month", "year"] as Preset[]) {
      const r = presetRange(p);
      if (r.from === from && r.to === to) return p;
    }
    return "custom";
  }, [from, to]);

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [totals, setTotals] = useState({ batches: 0, qty: 0, cost: 0, overhead: 0, value: 0 });

  // Filters change → back to the first page.
  useEffect(() => setPage(0), [from, to, productFilter, q]);

  /** One page (or, for print/Excel, every row) computed on the server. */
  const fetchPage = async (limit: number, offset: number) => {
    const { data, error } = await sb.rpc("batch_history_page", {
      _from: `${from}T00:00:00.000Z`,
      _to: `${to}T23:59:59.999Z`,
      _product: productFilter || null,
      _q: q.trim() || null,
      _limit: limit,
      _offset: offset,
    });
    if (error) throw error;
    const rows: Batch[] = ((data?.rows ?? []) as any[]).map((r) => ({
      batchId: r.bid,
      batchNo: String(r.bid).replace(/-/g, "").slice(0, 6).toUpperCase(),
      createdAt: r.created_at,
      productId: r.product_id,
      productName: r.name ?? "—",
      qty: Number(r.net) || 0,
      price: Number(r.price) || 0,
      transferPrice: Number(r.transfer_price) || 0,
      materials: ((r.materials ?? []) as any[]).map((m) => ({
        name: m.name, unit: m.unit, qty: Number(m.qty) || 0, cost: Number(m.cost) || 0,
      })),
      materialCost: Number(r.material_cost) || 0,
      overhead: Number(r.overhead) || 0,
    }));
    return { data, rows };
  };

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setDenied(false);
    setLoadError(null);
    const t = setTimeout(() => {
      fetchPage(PAGE_SIZE, page * PAGE_SIZE)
        .then(({ data, rows }) => {
          if (cancel) return;
          setBatches(rows);
          setTotal(Number(data?.total) || 0);
          setProducts((data?.products ?? []) as any[]);
          const tt = data?.totals ?? {};
          setTotals({
            batches: Number(data?.total) || 0,
            qty: Number(tt.qty) || 0,
            cost: Number(tt.cost) || 0,
            overhead: Number(tt.overhead) || 0,
            value: Number(tt.value) || 0,
          });
          setLoading(false);
        })
        .catch((e: any) => {
          if (cancel) return;
          console.error("Batch history load failed", e);
          if (e?.code === "42501" || /permission/i.test(e?.message ?? "")) setDenied(true);
          else setLoadError(e?.message ?? "Could not load batches");
          setBatches([]);
          setLoading(false);
        });
    }, q ? 300 : 0); // debounce typing in the search box
    return () => {
      cancel = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, productFilter, q, page, reloadKey]);

  const filtered = batches;

  const rangeLabel = from === to ? from : `${from} → ${to}`;

  const toReportRows = (list: Batch[]): BatchReportRow[] => list.map((b) => ({
    batchNo: b.batchNo,
    // Short date for compact printing: dd/mm HH:mm (year is in the period line)
    dateTime: new Date(b.createdAt).toLocaleString("en-GB", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    }).replace(",", ""),
    productName: b.productName,
    qty: b.qty,
    cost: b.materialCost,
    overhead: b.overhead,
    value: b.qty * b.price,
    supplyPrice: b.transferPrice,
    materials: b.materials,
  }));



  // Print / Excel need every batch in the range, fetched only on demand.
  const loadAllRows = async () => {
    try {
      const { rows } = await fetchPage(100000, 0);
      return toReportRows(rows);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load batches");
      return null;
    }
  };

  const doPrint = async () => {
    // Open the window synchronously would be ideal, but the report builder
    // opens it itself; most browsers allow it right after a click.
    const rows = await loadAllRows();
    if (!rows) return;
    const ok = printBatchHistoryReport({ company, rangeLabel, rows });
    if (!ok) toast.error("Please allow pop-ups to print the report");
  };

  const doExcel = async () => {
    const rows = await loadAllRows();
    if (!rows) return;
    exportBatchHistoryXlsx({ company, rangeLabel, rows, fileName: `batch-history-${from}_to_${to}.xlsx` });
  };

  return (
    <AppShell
      title="Batch History"
      subtitle="সব প্রোডাক্টের ব্যাচ হিস্টরি — দিন/সপ্তাহ/মাস অনুযায়ী ফিল্টার ও প্রিন্ট"
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={doExcel}>
            <FileDown className="size-3.5" /> Excel
          </Button>
          <Button size="sm" onClick={doPrint}>
            <Printer className="size-3.5" /> Print Report
          </Button>
        </div>
      }
    >
      {/* Filters */}
      <Card className="p-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["today", "yesterday", "week", "month", "year"] as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => setSearch(presetRange(p))}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activePreset === p ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
              }`}
            >
              {p === "today" ? "Today" : p === "yesterday" ? "Yesterday" : p === "week" ? "This Week" : p === "month" ? "This Month" : "This Year"}
            </button>
          ))}
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={from}
              onChange={(e) => setSearch({ from: e.target.value })}
              className="h-8 w-[9.5rem] text-xs"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setSearch({ to: e.target.value })}
              className="h-8 w-[9.5rem] text-xs"
            />
          </div>
          <select
            value={productFilter}
            onChange={(e) => setSearch({ product: e.target.value || undefined })}
            className="h-8 px-2 rounded-md border border-input bg-background text-xs min-w-40"
          >
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="relative">
            <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setSearch({ q: e.target.value || undefined })}
              placeholder="Batch no / product / material"
              className="h-8 pl-7 text-xs w-56"
            />
          </div>
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Sum icon={Layers} tone="sky" label="Batches" value={fmt(totals.batches, 0)} />
        <Sum icon={Boxes} tone="emerald" label="Produced Qty" value={fmt(totals.qty, 3)} />
        <Sum icon={Receipt} tone="rose" label="Material Cost" value={money(totals.cost)} />
        <Sum icon={Receipt} tone="amber" label="Overhead" value={money(totals.overhead)} />
        <Sum icon={BarChart3} tone="violet" label="Production Value" value={money(totals.value)} />
      </div>

      {/* List */}
      <Card className="overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/40 text-sm font-semibold">
          Batches — {rangeLabel}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="text-xs text-muted-foreground bg-muted/20">
              <tr>
                <th className="w-8" />
                <th className="text-left font-medium px-3 py-2">Date &amp; time</th>
                <th className="text-left font-medium px-3 py-2">Batch</th>
                <th className="text-left font-medium px-3 py-2">Product</th>
                <th className="text-right font-medium px-3 py-2">Qty</th>
                <th className="text-right font-medium px-3 py-2">Materials</th>
                <th className="text-right font-medium px-3 py-2">Cost</th>
                <th className="text-right font-medium px-3 py-2">Overhead</th>
                <th className="text-right font-medium px-3 py-2">Value</th>
                {(canEditBatch || canDeleteBatch) && (
                  <th className="text-right font-medium px-3 py-2">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canEditBatch || canDeleteBatch ? 10 : 9} className="text-center py-8 text-muted-foreground text-sm">
                    {loading
                      ? "Loading…"
                      : loadError
                        ? `Could not load batches (${loadError}). Please try again.`
                        : denied
                        ? "Your account cannot view Factory production records. Ask an admin to assign you to the Factory location in Roles & Teams."
                        : "No batches in this range"}
                  </td>
                </tr>
              ) : (
                filtered.map((b) => {
                  const isOpen = !!open[b.batchId];
                  return (
                    <>
                      <tr
                        key={b.batchId}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => setOpen((s) => ({ ...s, [b.batchId]: !s[b.batchId] }))}
                      >
                        <td className="px-2">
                          <ChevronRight className={`size-4 text-muted-foreground transition ${isOpen ? "rotate-90" : ""}`} />
                        </td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {new Date(b.createdAt).toLocaleString("en-GB", {
                            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">#{b.batchNo}</td>
                        <td className="px-3 py-2 font-medium">{b.productName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(b.qty, 3)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{b.materials.length}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(b.materialCost)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(b.overhead)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-primary">{money(b.qty * b.price)}</td>
                        {(canEditBatch || canDeleteBatch) && (
                          <td className="px-3 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex gap-1">
                              {canEditBatch && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2"
                                  onClick={() => {
                                    setEditing(b);
                                    setEditQty(String(b.qty));
                                  }}
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                              )}
                              {canDeleteBatch && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-destructive hover:text-destructive"
                                  onClick={() => setToDelete(b)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                      {isOpen && (
                        <tr key={`${b.batchId}-d`} className="bg-muted/20">
                          <td />
                          <td colSpan={canEditBatch || canDeleteBatch ? 9 : 8} className="px-3 py-3">
                            <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                              Raw materials consumed
                            </div>
                            {b.materials.length === 0 ? (
                              <div className="text-xs text-muted-foreground">No material consumption recorded for this batch.</div>
                            ) : (
                              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                                {b.materials.map((m, i) => (
                                  <div key={i} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-2.5 py-1.5">
                                    <span className="text-xs truncate">{m.name}</span>
                                    <span className="text-xs tabular-nums whitespace-nowrap">
                                      <span className="font-medium">{fmt(m.qty, 4)}</span> {m.unit}
                                      <span className="text-muted-foreground"> · {money(m.cost)}</span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {b.overhead > 0 && (
                              <div className="mt-2 text-xs text-muted-foreground">
                                Overhead for this batch: <span className="font-medium text-foreground">{money(b.overhead)}</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-muted/30 font-semibold">
                  <td />
                  <td className="px-3 py-2" colSpan={3}>{totals.batches} batch(es)</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(totals.qty, 3)}</td>
                  <td />
                  <td className="px-3 py-2 text-right tabular-nums">{money(totals.cost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(totals.overhead)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(totals.value)}</td>
                  {(canEditBatch || canDeleteBatch) && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        title={`Delete batch #${toDelete?.batchNo ?? ""}?`}
        description={
          <>
            This reverses the batch: <b>{fmt(toDelete?.qty ?? 0, 3)}</b> × <b>{toDelete?.productName}</b> will be
            removed from finished stock, the consumed raw materials go back into factory stock, and this batch's
            overheads are cleared. Reversal entries stay in the ledger for audit.
          </>
        }
        confirmLabel="Delete batch"
        destructive
        busy={crudBusy}
        onConfirm={doDelete}
        onCancel={() => setToDelete(null)}
      />

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Correct batch #{editing?.batchNo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {editing?.productName} — the old consumption is reversed and re-applied at the corrected quantity using
              the product's current recipe. Batch number and date stay the same.
            </p>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Produced quantity</label>
              <Input
                autoFocus
                value={editQty}
                onChange={(e) => setEditQty(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={crudBusy}>
              Cancel
            </Button>
            <Button onClick={doEdit} disabled={crudBusy}>
              {crudBusy ? "Saving…" : "Save correction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Sum({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: string }) {
  const toneMap: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600",
    rose: "bg-rose-500/10 text-rose-600",
    sky: "bg-sky-500/10 text-sky-600",
    violet: "bg-violet-500/10 text-violet-600",
    amber: "bg-amber-500/10 text-amber-600",
  };
  return (
    <Card className="p-3">
      <div className="flex items-start gap-2.5">
        <div className={`size-9 rounded-lg grid place-items-center shrink-0 ${toneMap[tone]}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{label}</div>
          <div className="text-base font-semibold truncate">{value}</div>
        </div>
      </div>
    </Card>
  );
}
