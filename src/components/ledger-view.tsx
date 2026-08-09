import { useMemo, useState } from "react";
import { Card } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "@tanstack/react-router";
import { Printer, Download } from "lucide-react";
import { filterByRange, summarize, type LedgerEntry } from "@/lib/ledger-math";
import type { CompanySettings } from "@/lib/company-settings";

export type LedgerParty = {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
};

const money = (n: number) => `৳${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (s: string) => {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
};

export function LedgerView({
  party,
  company,
  entries,
  locations,
  invoiceLinkTo,
  loading,
}: {
  party: LedgerParty;
  company: CompanySettings | null;
  entries: LedgerEntry[];
  locations: { id: string | null; name: string }[];
  invoiceLinkTo?: (refId: string) => { to: string; params: Record<string, string> } | null;
  loading?: boolean;
}) {
  const today = new Date();
  const [from, setFrom] = useState(`${today.getFullYear()}-01-01`);
  const [to, setTo] = useState(`${today.getFullYear()}-12-31`);
  const [location, setLocation] = useState("all");
  const [format, setFormat] = useState<1 | 2>(1);

  const scoped = useMemo(
    () => (location === "all" ? entries : entries.filter((e) => e.location === location)),
    [entries, location],
  );
  const ranged = useMemo(() => filterByRange(scoped, from, to), [scoped, from, to]);
  const periodSummary = useMemo(() => summarize(ranged), [ranged]);
  const overall = useMemo(() => summarize(scoped), [scoped]);

  const rows = format === 1 ? ranged : ranged.slice().sort((a, b) => a.ref.localeCompare(b.ref));

  const exportCsv = () => {
    const header = ["Date", "Reference No", "Type", "Location", "Payment Status", "Debit", "Credit", "Payment Method", "Others"];
    const lines = [header.join(",")].concat(
      rows.map((r) =>
        [dt(r.date), r.ref, r.type, r.location ?? "", r.status, r.debit || "", r.credit || "", r.method, `"${(r.others ?? "").replace(/"/g, '""')}"`].join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-${party.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <style>{`@media print{body *{visibility:hidden}#ledger-print,#ledger-print *{visibility:visible}#ledger-print{position:absolute;left:0;top:0;width:100%;padding:12mm}.no-print{display:none!important}}`}</style>

      {/* Filter bar */}
      <Card className="p-3 no-print">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">Date Range</div>
            <div className="flex items-center gap-1.5">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[9.5rem]" />
              <span className="text-muted-foreground text-xs">–</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[9.5rem]" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">Ledger format</div>
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              {[1, 2].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f as 1 | 2)}
                  className={`px-3 h-9 text-xs ${format === f ? "bg-muted font-medium" : "hover:bg-muted/50"}`}
                >
                  Format {f}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">Business Location</div>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.name} value={l.name}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="size-4 mr-1" /> CSV</Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="size-4 mr-1" /> Print / PDF</Button>
          </div>
        </div>
      </Card>

      <div id="ledger-print">
        {/* Company header */}
        <div className="text-right text-xs text-muted-foreground mb-3">
          <div className="font-semibold text-foreground text-sm">{company?.name ?? ""}</div>
          <div>{company?.address ?? ""}</div>
          {company?.phone && <div>{company.phone}</div>}
        </div>

        <div className="grid gap-4 lg:grid-cols-2 mb-4">
          {/* To: party */}
          <div className="border border-border rounded-md overflow-hidden self-start">
            <div className="bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium">To:</div>
            <div className="p-3 text-xs space-y-0.5">
              <div className="font-semibold text-sm">{party.name}</div>
              {party.address && <div className="text-muted-foreground">{party.address}</div>}
              {party.phone && <div className="text-muted-foreground">Mobile: {party.phone}</div>}
              {party.email && <div className="text-muted-foreground">{party.email}</div>}
            </div>
          </div>

          {/* Account summary */}
          <div className="border border-border rounded-md overflow-hidden">
            <div className="bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium text-right">Account Summary</div>
            <div className="p-3 text-xs">
              <div className="text-right font-semibold mb-2">{dt(from)} To {dt(to)}</div>
              <Row label="Total invoice" value={money(periodSummary.totalInvoice)} />
              <Row label="Total paid" value={money(periodSummary.totalPaid)} />
              <div className="border-t border-border my-2" />
              <div className="text-right font-semibold mb-2">Overall Summary</div>
              <Row label="Total invoice" value={money(overall.totalInvoice)} />
              <Row label="Total paid" value={money(overall.totalPaid)} />
              <Row label="Balance due" value={money(overall.balanceDue)} bold />
              {overall.advance > 0 && <Row label="Advance" value={money(overall.advance)} />}
            </div>
          </div>
        </div>

        <div className="text-center text-xs font-medium mb-2">
          Showing all invoices and payments between {dt(from)} and {dt(to)}
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  {["Date", "Reference No", "Type", "Location", "Payment Status", "Debit", "Credit", "Payment Method", "Others"].map((h, i) => (
                    <th key={h} className={`font-medium px-3 py-2.5 ${i >= 5 && i <= 6 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && <tr><td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">Loading…</td></tr>}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">No entries in this period.</td></tr>
                )}
                {!loading && rows.map((r, i) => {
                  const link = r.refId && invoiceLinkTo ? invoiceLinkTo(r.refId) : null;
                  return (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-3 py-2 whitespace-nowrap">{dt(r.date)}</td>
                      <td className="px-3 py-2">
                        {link ? <Link to={link.to as any} params={link.params as any} className="text-primary hover:underline">{r.ref}</Link> : r.ref}
                      </td>
                      <td className="px-3 py-2">{r.type}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.location ?? "—"}</td>
                      <td className="px-3 py-2">{r.status || "—"}</td>
                      <td className="px-3 py-2 text-right">{r.debit ? money(r.debit) : ""}</td>
                      <td className="px-3 py-2 text-right">{r.credit ? money(r.credit) : ""}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.method || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.others || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-muted/40">
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right font-medium">Total</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(periodSummary.totalInvoice)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(periodSummary.totalPaid)}</td>
                    <td colSpan={2} className="px-3 py-2 text-right font-semibold">
                      Balance due {money(overall.balanceDue)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-0.5 ${bold ? "font-semibold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
