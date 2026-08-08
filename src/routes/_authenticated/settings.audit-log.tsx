import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, Card } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Download, Lock, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import {
  AUDIT_PAGE_SIZE, auditActionLabel, auditDiffRows, auditTableLabel,
  loadAuditActors, loadAuditLog, loadAuditTables, purgeAuditLog,
  type AuditEntry,
} from "@/lib/audit-log-store";
import { exportStockXlsx } from "@/lib/stock-report-export";
import { defaultCompany, getCachedCompany } from "@/lib/company-settings";

export const Route = createFileRoute("/_authenticated/settings/audit-log")({
  head: () => ({
    meta: [
      { title: "Activity Log · Settings" },
      { name: "description", content: "Superadmin-only audit trail of every change made in the system." },
    ],
  }),
  component: AuditLogPage,
});

const ACTIONS = ["insert", "update", "delete", "login", "rpc"];

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function actionTone(a: string) {
  if (a === "insert") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  if (a === "update") return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  if (a === "delete") return "bg-destructive/10 text-destructive border-destructive/20";
  return "bg-muted text-muted-foreground";
}

function AuditLogPage() {
  const { loading: permLoading, isSuperadmin } = usePermissions();

  if (permLoading) {
    return (
      <AppShell title="Activity Log" subtitle="Who changed what, and when">
        <Card className="p-8 max-w-6xl mx-auto">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-40 bg-muted rounded" />
            <div className="h-32 bg-muted/60 rounded-lg" />
          </div>
        </Card>
      </AppShell>
    );
  }

  if (!isSuperadmin) {
    return (
      <AppShell title="Activity Log" subtitle="Restricted">
        <Card className="p-8 max-w-xl mx-auto text-center space-y-3">
          <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">Superadmin only</h2>
          <p className="text-sm text-muted-foreground">
            The activity log records who changed what. Only a superadmin account can view it.
          </p>
        </Card>
      </AppShell>
    );
  }

  return <AuditLogContent />;
}

function AuditLogContent() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actorEmail, setActorEmail] = useState("all");
  const [table, setTable] = useState("all");
  const [action, setAction] = useState("all");
  const [actors, setActors] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeMonths, setPurgeMonths] = useState("12");

  const filters = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      actorEmail: actorEmail === "all" ? undefined : actorEmail,
      table: table === "all" ? undefined : table,
      action: action === "all" ? undefined : action,
    }),
    [from, to, actorEmail, table, action],
  );

  async function refresh(targetPage = page) {
    setLoading(true);
    try {
      const res = await loadAuditLog({ ...filters, page: targetPage });
      setRows(res.rows);
      setTotal(res.total);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load the activity log");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(0);
    void refresh(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, actorEmail, table, action]);

  useEffect(() => {
    void loadAuditActors().then(setActors);
    void loadAuditTables().then(setTables);
  }, []);

  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

  async function handleExport() {
    try {
      const all = await loadAuditLog({ ...filters, page: 0, pageSize: 2000 });
      exportStockXlsx({
        fileName: `activity-log-${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheetName: "Activity Log",
        title: "Activity Log",
        company: getCachedCompany() ?? defaultCompany,
        columns: [
          { key: "when", label: "When" },
          { key: "who", label: "User" },
          { key: "action", label: "Action" },
          { key: "module", label: "Module" },
          { key: "record", label: "Record" },
          { key: "changes", label: "Changed fields" },
          { key: "note", label: "Note" },
        ],
        rows: all.rows.map((r) => ({
          when: fmtWhen(r.occurred_at),
          who: r.actor_email ?? "system",
          action: auditActionLabel(r.action),
          module: auditTableLabel(r.table_name),
          record: r.record_id ?? "",
          changes: (r.changed_fields ?? []).join(", "),
          note: r.note ?? "",
        })),
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    }
  }

  async function handlePurge() {
    const months = Math.max(1, Number(purgeMonths) || 12);
    const before = new Date();
    before.setMonth(before.getMonth() - months);
    try {
      const n = await purgeAuditLog(before);
      toast.success(`${n} old entr${n === 1 ? "y" : "ies"} removed`);
      setPurgeOpen(false);
      void refresh(0);
    } catch (e: any) {
      toast.error(e?.message ?? "Purge failed");
    }
  }

  return (
    <AppShell
      title="Activity Log"
      subtitle="Who changed what, and when — superadmin only"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refresh()}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPurgeOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1.5" /> Purge old
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Card className="p-3 sm:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">User</Label>
              <Select value={actorEmail} onValueChange={setActorEmail}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {actors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Module</Label>
              <Select value={table} onValueChange={setTable}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modules</SelectItem>
                  {tables.map((t) => <SelectItem key={t} value={t}>{auditTableLabel(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Action</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {ACTIONS.map((a) => <SelectItem key={a} value={a}>{auditActionLabel(a)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b bg-muted/40">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {total} record{total === 1 ? "" : "s"}
            </div>
            <div className="text-xs text-muted-foreground">Read-only trail</div>
          </div>

          {loading ? (
            <div className="p-6 space-y-2 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 bg-muted/60 rounded" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No activity recorded for these filters yet.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((r) => {
                const isOpen = !!open[r.id];
                const diff = auditDiffRows(r);
                return (
                  <div key={r.id} className="text-sm">
                    <button
                      type="button"
                      className="w-full text-left px-3 sm:px-4 py-2.5 hover:bg-muted/40 flex flex-wrap items-center gap-x-3 gap-y-1"
                      onClick={() => setOpen((s) => ({ ...s, [r.id]: !s[r.id] }))}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-xs text-muted-foreground w-40 shrink-0">{fmtWhen(r.occurred_at)}</span>
                      <Badge variant="outline" className={`text-[11px] ${actionTone(r.action)}`}>
                        {auditActionLabel(r.action)}
                      </Badge>
                      <span className="font-medium">{auditTableLabel(r.table_name)}</span>
                      <span className="text-muted-foreground truncate">{r.actor_email ?? "system"}</span>
                      {r.note ? <span className="text-xs text-muted-foreground italic truncate">{r.note}</span> : null}
                    </button>

                    {isOpen ? (
                      <div className="px-4 sm:px-10 pb-4 pt-1 bg-muted/20">
                        <div className="text-xs text-muted-foreground mb-2">
                          Record: <span className="font-mono">{r.record_id ?? "—"}</span>
                        </div>
                        {diff.length === 0 ? (
                          <div className="text-xs text-muted-foreground">No field-level detail recorded.</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-muted-foreground">
                                  <th className="py-1 pr-3 font-medium">Field</th>
                                  <th className="py-1 pr-3 font-medium">Before</th>
                                  <th className="py-1 font-medium">After</th>
                                </tr>
                              </thead>
                              <tbody>
                                {diff.map((d) => (
                                  <tr key={d.field} className="border-t border-border/60 align-top">
                                    <td className="py-1 pr-3 font-mono">{d.field}</td>
                                    <td className="py-1 pr-3 break-all text-muted-foreground">{d.before}</td>
                                    <td className="py-1 break-all">{d.after}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {pages > 1 ? (
            <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-t">
              <Button
                variant="outline" size="sm" disabled={page === 0}
                onClick={() => { const p = page - 1; setPage(p); void refresh(p); }}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {page + 1} of {pages}</span>
              <Button
                variant="outline" size="sm" disabled={page + 1 >= pages}
                onClick={() => { const p = page + 1; setPage(p); void refresh(p); }}
              >
                Next
              </Button>
            </div>
          ) : null}
        </Card>
      </div>

      <ConfirmDialog
        open={purgeOpen}
        title="Purge old activity"
        description={
          <div className="space-y-3">
            <p>Permanently delete activity older than the retention window below. This cannot be undone.</p>
            <div className="space-y-1">
              <Label className="text-xs">Keep the last (months)</Label>
              <Input
                value={purgeMonths}
                onChange={(e) => setPurgeMonths(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
              />
            </div>
          </div>
        }
        confirmLabel="Purge"
        destructive
        onConfirm={handlePurge}
        onCancel={() => setPurgeOpen(false)}
      />

    </AppShell>
  );
}
