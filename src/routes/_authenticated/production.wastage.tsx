import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { loadRawMaterials, type RawMaterial } from "@/lib/raw-material-store";
import { loadWastage, logWastage, type WastageEntry } from "@/lib/wastage-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/production/wastage")({
  head: () => ({ meta: [{ title: "Wastage Log · Muzahid Food" }] }),
  component: WastagePage,
});

const REASONS = ["Spoilage", "Damage", "Expired", "Spillage", "Contamination", "Other"];

function WastagePage() {
  const { currentShowroomId } = useShowroomScope();
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [entries, setEntries] = useState<WastageEntry[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState(0);
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    try {
      const [rms, ws] = await Promise.all([
        loadRawMaterials(currentShowroomId ?? null),
        loadWastage(currentShowroomId ?? null),
      ]);
      setMaterials(rms);
      setEntries(ws);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShowroomId]);

  const submit = async () => {
    if (!materialId || qty <= 0) {
      toast.error("Pick a material and qty");
      return;
    }
    setSaving(true);
    try {
      await logWastage({
        materialId,
        showroomId: currentShowroomId ?? null,
        qty,
        reason,
        notes: notes || null,
      });
      setMaterialId("");
      setQty(0);
      setNotes("");
      await refresh();
      toast.success("Wastage logged and raw stock deducted");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  const totalQty = entries.reduce((s, e) => s + e.qty, 0);

  return (
    <AppShell title="Wastage / Scrap Log" subtitle="Record spoilage — raw stock is deducted automatically">
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
        <Card className="p-5">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2"><Trash2 className="size-4" /> Log wastage</div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Raw material</label>
              <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm">
                <option value="">— Select —</option>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Quantity</label>
                <input type="number" min={0} step="0.001" value={qty} onChange={(e) => setQty(+e.target.value || 0)} className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Reason</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm">
                  {REASONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm" />
            </div>
            <button onClick={submit} disabled={saving} className="w-full inline-flex items-center justify-center gap-1.5 px-3 h-9 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50">
              {saving ? "Saving…" : "Log wastage"}
            </button>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-muted/30">
            <div className="text-sm font-semibold">Recent wastage</div>
            <div className="text-xs text-muted-foreground">Total qty: <span className="font-semibold text-foreground">{totalQty.toFixed(3)}</span></div>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left font-medium px-5 py-3">Date</th>
                <th className="text-left font-medium px-5 py-3">Material</th>
                <th className="text-right font-medium px-5 py-3">Qty</th>
                <th className="text-left font-medium px-5 py-3">Reason</th>
                <th className="text-left font-medium px-5 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 text-muted-foreground">{e.logged_at.slice(0, 10)}</td>
                  <td className="px-5 py-3 font-medium">{e.material_name ?? "—"}</td>
                  <td className="px-5 py-3 text-right text-destructive">-{e.qty}</td>
                  <td className="px-5 py-3">{e.reason}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{e.notes}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No wastage logged.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}
