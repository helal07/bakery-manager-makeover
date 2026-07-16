import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Search, Boxes, AlertTriangle, History, Sliders, FileDown, PackagePlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { loadRawMaterials, adjustRawStock, type RawMaterial } from "@/lib/raw-material-store";
import { exportCsv } from "@/components/report-filters";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/raw-material-stock")({
  head: () => ({ meta: [{ title: "Raw Material Stock · Muzahid Food" }] }),
  component: () => (
    <PermissionGate anyOf={["production.raw_materials.view", "production.access"]} title="Raw Material Stock">
      <RawMaterialStockPage />
    </PermissionGate>
  ),
});

const sb = supabase as any;

type LedgerRow = {
  id: string;
  kind: string;
  qty: number;
  note: string | null;
  created_at: string;
  ref_type: string | null;
};

function RawMaterialStockPage() {
  const { currentShowroomId, showrooms } = useShowroomScope();
  const loc = currentShowroomId;
  const isFactory = loc === null;

  const [rows, setRows] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "low" | "out">("all");
  const [adjustFor, setAdjustFor] = useState<RawMaterial | null>(null);
  const [historyFor, setHistoryFor] = useState<RawMaterial | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const mats = await loadRawMaterials(loc);
      setRows(mats);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load raw materials");
    } finally {
      setLoading(false);
    }
  }, [loc]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.unit.toLowerCase().includes(q)) return false;
      if (statusFilter === "low") return r.threshold > 0 && r.stock <= r.threshold && r.stock > 0;
      if (statusFilter === "out") return r.stock <= 0;
      return true;
    });
  }, [rows, query, statusFilter]);

  const totals = useMemo(() => {
    const value = rows.reduce((a, r) => a + r.stock * r.cost, 0);
    const low = rows.filter((r) => r.threshold > 0 && r.stock <= r.threshold && r.stock > 0).length;
    const out = rows.filter((r) => r.stock <= 0).length;
    return { items: rows.length, value, low, out };
  }, [rows]);

  const locationLabel = isFactory ? "Factory" : showrooms.find((s) => s.id === loc)?.name ?? "Showroom";

  const doExport = () => {
    exportCsv(
      `raw-material-stock-${locationLabel.toLowerCase()}.csv`,
      [
        ["Name", "Unit", "Qty", "Threshold", "Cost", "Value", "Status"],
        ...filtered.map((r) => [
          r.name,
          r.unit,
          r.stock,
          r.threshold,
          r.cost.toFixed(2),
          (r.stock * r.cost).toFixed(2),
          r.stock <= 0 ? "Out" : r.threshold > 0 && r.stock <= r.threshold ? "Low" : "OK",
        ]),
      ],
    );
  };

  return (
    <AppShell title="Raw Material Stock" subtitle={`Live raw material stock at ${locationLabel}`}>
      <div className="mb-4 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
        Reports on-hand ingredients scoped to your current location. Adjust to correct counts.
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard icon={<Boxes className="w-4 h-4" />} label="Ingredients" value={totals.items.toString()} />
        <StatCard icon={<PackagePlus className="w-4 h-4" />} label="Stock value" value={`৳${totals.value.toFixed(0)}`} />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Low stock" value={totals.low.toString()} tone={totals.low ? "warn" : undefined} />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Out of stock" value={totals.out.toString()} tone={totals.out ? "warn" : undefined} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-between mb-4">
        <div className="flex gap-2 flex-1">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name or unit…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex rounded-md border border-border p-0.5">
            {(["all", "low", "out"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 h-9 text-xs rounded capitalize ${statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {s === "all" ? "All" : s === "low" ? "Low" : "Out"}
              </button>
            ))}
          </div>
        </div>
        <Button variant="outline" onClick={doExport}>
          <FileDown className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No raw materials yet.{" "}
            <Link to="/raw-materials" className="text-primary underline">Add raw materials</Link>.
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matches.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-2">Name</th>
                  <th className="py-2 px-2">Unit</th>
                  <th className="py-2 px-2 text-right">Qty</th>
                  <th className="py-2 px-2 text-right">Threshold</th>
                  <th className="py-2 px-2 text-right">Cost</th>
                  <th className="py-2 px-2 text-right">Value</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const out = r.stock <= 0;
                  const low = !out && r.threshold > 0 && r.stock <= r.threshold;
                  return (
                    <tr key={r.id} className={`border-b hover:bg-muted/40 ${out ? "bg-destructive/5" : low ? "bg-amber-500/5" : ""}`}>
                      <td className="py-2 px-2 font-medium">{r.name}</td>
                      <td className="py-2 px-2 text-muted-foreground">{r.unit}</td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        <span className={out ? "text-destructive font-semibold" : low ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}>
                          {r.stock}
                        </span>{" "}
                        <span className="text-muted-foreground text-xs">{r.unit}</span>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{r.threshold || "—"}</td>
                      <td className="py-2 px-2 text-right tabular-nums">৳{r.cost.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold">৳{(r.stock * r.cost).toFixed(0)}</td>
                      <td className="py-2 px-2">
                        {out ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-destructive/10 text-destructive">Out</span>
                        ) : low ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">Low</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600">OK</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setHistoryFor(r)}>
                          <History className="w-4 h-4 mr-1" /> History
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setAdjustFor(r)}>
                          <Sliders className="w-4 h-4 mr-1" /> Adjust
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {adjustFor && (
        <AdjustDialog
          row={adjustFor}
          showroomId={loc}
          onClose={() => setAdjustFor(null)}
          onSaved={() => { setAdjustFor(null); load(); }}
        />
      )}

      {historyFor && (
        <HistorySheet
          row={historyFor}
          showroomId={loc}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </AppShell>
  );
}

function StatCard({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: string; tone?: "warn" }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-md grid place-items-center ${
          tone === "warn" ? "bg-amber-500/15 text-amber-600" : "bg-primary/10 text-primary"
        }`}>
          {icon}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold tabular-nums">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function AdjustDialog({
  row, showroomId, onClose, onSaved,
}: {
  row: RawMaterial;
  showroomId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const n = Number(qty);
    if (!qty || Number.isNaN(n) || n === 0) { toast.error("Enter a non-zero quantity"); return; }
    setSaving(true);
    try {
      await adjustRawStock(row.id, showroomId, n, note || undefined);
      toast.success("Stock adjusted");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to adjust stock");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust — {row.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="text-sm text-muted-foreground">
            Current: <span className="font-medium text-foreground">{row.stock} {row.unit}</span>
          </div>
          <div>
            <Label>Change (+ / −)</Label>
            <Input
              type="number"
              step="any"
              placeholder="e.g. 10 or -3"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div>
            <Label>Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Apply"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistorySheet({
  row, showroomId, onClose,
}: {
  row: RawMaterial;
  showroomId: string | null;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      let q = sb
        .from("raw_stock_ledger")
        .select("id,kind,qty,note,created_at,ref_type")
        .eq("material_id", row.id)
        .order("created_at", { ascending: false })
        .limit(50);
      q = showroomId === null ? q.is("showroom_id", null) : q.eq("showroom_id", showroomId);
      const { data, error } = await q;
      if (!alive) return;
      if (error) toast.error(error.message);
      setEntries((data ?? []) as LedgerRow[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [row.id, showroomId]);

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>History — {row.name}</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No movements yet.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => (
                <li key={e.id} className="border rounded-md p-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-medium capitalize">{e.kind.replace(/_/g, " ")}</span>
                    <span className={`font-mono ${e.qty >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {e.qty >= 0 ? "+" : ""}{e.qty} {row.unit}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(e.created_at).toLocaleString()}
                    {e.ref_type ? ` · ${e.ref_type}` : ""}
                  </div>
                  {e.note && <div className="text-xs mt-1">{e.note}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}