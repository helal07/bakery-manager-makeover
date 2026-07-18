import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AppShell, Card } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Recycle, Trash2, Wheat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/production/repurpose")({
  head: () => ({ meta: [{ title: "Repurpose Workshop · Muzahid Food" }] }),
  component: () => (
    <PermissionGate anyOf={["production.repurpose"]} title="Repurpose Workshop">
      <RepurposePage />
    </PermissionGate>
  ),
});

const sb = supabase as any;

type QueueRow = {
  id: string;
  product_id: string;
  product_name?: string;
  qty: number;
  source_showroom_id: string | null;
  source_showroom_name?: string;
  status: "pending" | "converted" | "discarded";
  converted_material_id: string | null;
  material_name?: string;
  yield_qty: number | null;
  wastage_qty: number | null;
  created_at: string;
  processed_at: string | null;
};

type Material = { id: string; name: string; unit: string | null };

function RepurposePage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [convert, setConvert] = useState<QueueRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: q }, { data: m }] = await Promise.all([
      sb.from("repurpose_queue").select(`
        id,product_id,qty,source_showroom_id,status,converted_material_id,yield_qty,wastage_qty,created_at,processed_at,
        products(name),showrooms:source_showroom_id(name),raw_materials:converted_material_id(name)
      `).order("created_at", { ascending: false }).limit(300),
      sb.from("raw_materials").select("id,name,unit").order("name"),
    ]);
    setRows(((q ?? []) as any[]).map((r) => ({
      ...r,
      qty: Number(r.qty),
      yield_qty: r.yield_qty !== null ? Number(r.yield_qty) : null,
      wastage_qty: r.wastage_qty !== null ? Number(r.wastage_qty) : null,
      product_name: r.products?.name,
      source_showroom_name: r.showrooms?.name,
      material_name: r.raw_materials?.name,
    })));
    setMaterials((m ?? []) as Material[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const pending = rows.filter((r) => r.status === "pending");
  const history = rows.filter((r) => r.status !== "pending");
  const visible = tab === "pending" ? pending : history;

  const discard = async (row: QueueRow) => {
    if (!confirm(`Discard ${row.qty} × ${row.product_name} as full wastage?`)) return;
    const { error } = await sb.rpc("commit_repurpose", {
      _queue_id: row.id,
      _material_id: null,
      _yield_qty: null,
      _wastage_qty: row.qty,
      _note: "Discarded",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Discarded");
    load();
  };

  return (
    <AppShell
      title="Repurpose Workshop"
      subtitle="Convert damaged returns back into raw materials"
    >
      <div className="flex gap-2 mb-4">
        <Button size="sm" variant={tab === "pending" ? "default" : "outline"} onClick={() => setTab("pending")}>
          Pending ({pending.length})
        </Button>
        <Button size="sm" variant={tab === "history" ? "default" : "outline"} onClick={() => setTab("history")}>
          History ({history.length})
        </Button>
      </div>

      <Card>
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {tab === "pending" ? "No pending damaged items. Receive a damaged-return transfer to see items here." : "No history yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-3">Product</th>
                  <th className="py-2 px-3">Qty</th>
                  <th className="py-2 px-3">From</th>
                  <th className="py-2 px-3">Received</th>
                  {tab === "history" && <>
                    <th className="py-2 px-3">Result</th>
                    <th className="py-2 px-3">Yield / Waste</th>
                  </>}
                  {tab === "pending" && <th className="py-2 px-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/40">
                    <td className="py-2 px-3 font-medium">{r.product_name ?? r.product_id.slice(0, 8)}</td>
                    <td className="py-2 px-3 tabular-nums">{r.qty}</td>
                    <td className="py-2 px-3">{r.source_showroom_name ?? "—"}</td>
                    <td className="py-2 px-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                    {tab === "history" && <>
                      <td className="py-2 px-3">
                        {r.status === "converted" ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">→ {r.material_name}</Badge>
                        ) : (
                          <Badge variant="destructive">Discarded</Badge>
                        )}
                      </td>
                      <td className="py-2 px-3 tabular-nums text-xs">
                        <span className="text-emerald-600">+{r.yield_qty ?? 0}</span>
                        {" / "}
                        <span className="text-destructive">-{r.wastage_qty ?? 0}</span>
                      </td>
                    </>}
                    {tab === "pending" && (
                      <td className="py-2 px-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => setConvert(r)}>
                            <Recycle className="w-3.5 h-3.5 mr-1" />Convert
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => discard(r)}>
                            <Trash2 className="w-3.5 h-3.5 mr-1" />Discard
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {convert && (
        <ConvertDialog
          row={convert}
          materials={materials}
          onClose={() => setConvert(null)}
          onDone={() => { setConvert(null); load(); }}
        />
      )}
    </AppShell>
  );
}

function ConvertDialog({ row, materials, onClose, onDone }: {
  row: QueueRow; materials: Material[]; onClose: () => void; onDone: () => void;
}) {
  const [materialId, setMaterialId] = useState<string>("");
  const [yieldQty, setYieldQty] = useState<string>(String(row.qty));
  const [wastage, setWastage] = useState<string>("0");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!materialId) { toast.error("Pick a target raw material"); return; }
    const y = Number(yieldQty);
    if (!y || y <= 0) { toast.error("Yield must be > 0"); return; }
    setSaving(true);
    const { error } = await sb.rpc("commit_repurpose", {
      _queue_id: row.id,
      _material_id: materialId,
      _yield_qty: y,
      _wastage_qty: Number(wastage) || 0,
      _note: note || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Converted to raw material");
    onDone();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert to raw material</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Source damaged product</p>
            <p className="font-medium">{row.product_name} · {row.qty} units</p>
          </div>
          <div>
            <Label>Target raw material</Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="e.g. Fish feed flour" /></SelectTrigger>
              <SelectContent>
                {materials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}{m.unit ? ` (${m.unit})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-1.5"><Wheat className="w-3.5 h-3.5" />Yield qty</Label>
              <Input type="number" min="0" step="any" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />Wastage qty</Label>
              <Input type="number" min="0" step="any" value={wastage} onChange={(e) => setWastage(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Convert"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
