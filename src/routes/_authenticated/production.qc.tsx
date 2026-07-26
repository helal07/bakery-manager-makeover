import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { ShieldCheck, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { loadRecentBatchesWithQc, upsertQc, type BatchWithQc } from "@/lib/qc-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/production/qc")({
  head: () => ({ meta: [{ title: "Quality Check · Muzahid Food" }] }),
  component: QcPage,
});

function QcPage() {
  const { currentShowroomId } = useShowroomScope();
  const [batches, setBatches] = useState<BatchWithQc[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  const refresh = async () => {
    setLoading(true);
    try {
      const b = await loadRecentBatchesWithQc(currentShowroomId ?? null);
      setBatches(b);
      const nm: Record<string, string> = {};
      for (const it of b) nm[it.batch_id] = it.qc?.notes ?? "";
      setNoteMap(nm);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShowroomId]);

  const mark = async (b: BatchWithQc, result: "pass" | "fail") => {
    try {
      await upsertQc({
        batchId: b.batch_id,
        productId: b.product_id,
        showroomId: b.showroom_id,
        result,
        notes: noteMap[b.batch_id] || null,
      });
      toast.success(`Batch marked ${result.toUpperCase()}`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const passCount = batches.filter((b) => b.qc?.result === "pass").length;
  const failCount = batches.filter((b) => b.qc?.result === "fail").length;
  const pending = batches.length - passCount - failCount;

  return (
    <AppShell title="Quality Check" subtitle="Mark each production batch pass or fail">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Passed</div><div className="text-2xl font-semibold mt-1 text-emerald-600">{passCount}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Failed</div><div className="text-2xl font-semibold mt-1 text-destructive">{failCount}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Pending QC</div><div className="text-2xl font-semibold mt-1">{pending}</div></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-5 py-3">Batch</th>
              <th className="text-left font-medium px-5 py-3">Product</th>
              <th className="text-right font-medium px-5 py-3">Qty</th>
              <th className="text-left font-medium px-5 py-3">Date</th>
              <th className="text-left font-medium px-5 py-3">Notes</th>
              <th className="text-right font-medium px-5 py-3">QC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {batches.map((b) => (
              <tr key={b.batch_id} className="hover:bg-muted/30">
                <td className="px-5 py-3 font-mono text-xs">{b.batch_id.slice(0, 8).toUpperCase()}</td>
                <td className="px-5 py-3 font-medium">{b.product_name ?? "—"}</td>
                <td className="px-5 py-3 text-right">{b.qty}</td>
                <td className="px-5 py-3 text-muted-foreground">{b.created_at.slice(0, 10)}</td>
                <td className="px-5 py-3">
                  <input
                    value={noteMap[b.batch_id] ?? ""}
                    onChange={(e) => setNoteMap({ ...noteMap, [b.batch_id]: e.target.value })}
                    placeholder="Notes…"
                    className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs"
                  />
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="inline-flex items-center gap-1 justify-end">
                    {b.qc ? (
                      <Badge tone={b.qc.result === "pass" ? "success" : "danger"}>{b.qc.result.toUpperCase()}</Badge>
                    ) : (
                      <ShieldCheck className="size-3.5 text-muted-foreground" />
                    )}
                    <button onClick={() => mark(b, "pass")} className="ml-2 text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 inline-flex items-center gap-1"><Check className="size-3" /> Pass</button>
                    <button onClick={() => mark(b, "fail")} className="text-xs px-2 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 inline-flex items-center gap-1"><X className="size-3" /> Fail</button>
                  </div>
                </td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">{loading ? "Loading…" : "No production batches yet."}</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
    </AppShell>
  );
}
